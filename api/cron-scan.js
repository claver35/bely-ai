module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const APP_URL = process.env.APP_URL || 'https://belyshield.com';
  const ALERT_URL = `${APP_URL}/api/send-alert`;

  try {
    const storesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores?plan=eq.pro&subscription_status=eq.active&select=user_id,shop_domain,access_token`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const stores = await storesRes.json();

    if (!stores || stores.length === 0) {
      return res.status(200).json({ message: 'No active Pro stores', scanned: 0 });
    }

    const usersRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const usersData = await usersRes.json();
    const userMap = {};
    (usersData.users || []).forEach(u => { userMap[u.id] = u.email; });

    const results = [];

    for (const store of stores) {
      try {
        const { user_id, shop_domain, access_token } = store;
        if (!access_token || !shop_domain) continue;

        const shopifyRes = await fetch(
          `https://${shop_domain}/admin/api/2024-01/orders.json?limit=10&status=any`,
          { headers: { 'X-Shopify-Access-Token': access_token } }
        );

        if (!shopifyRes.ok) {
          results.push({ shop: shop_domain, error: `Shopify ${shopifyRes.status}` });
          continue;
        }

        const data = await shopifyRes.json();
        const orders = data.orders || [];

        const highRiskOrders = [];
        const medRiskOrders = [];

        for (const order of orders) {
          let score = 0;
          const risks = [];

          if (order.customer?.created_at) {
            const days = Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000);
            if (days < 1)  { score += 45; risks.push('Bugün oluşturulan hesap'); }
            else if (days < 7)  { score += 30; risks.push('Yeni hesap (< 7 gün)'); }
            else if (days < 30) { score += 10; risks.push('Hesap < 30 gün'); }
          } else {
            score += 20; risks.push('Misafir sipariş');
          }

          const price = parseFloat(order.total_price);
          if (price > 500) { score += 35; risks.push('Çok yüksek sipariş tutarı (>$500)'); }
          else if (price > 200) { score += 20; risks.push(`Yüksek sipariş tutarı ($${price.toFixed(0)})`); }

          if (
            order.billing_address && order.shipping_address &&
            order.billing_address.country_code !== order.shipping_address.country_code
          ) {
            score += 35; risks.push('Fatura ve teslimat farklı ülkelerde');
          }

          if (order.financial_status === 'refunded') { score += 25; risks.push('İade yapılmış'); }
          else if (order.financial_status === 'voided') { score += 20; risks.push('İptal edilmiş ödeme'); }

          score = Math.min(score, 99);

          if (score >= 50) {
            highRiskOrders.push({ order_number: order.order_number, total_price: order.total_price, risks, score });
          } else if (score >= 25) {
            medRiskOrders.push({ order_number: order.order_number, total_price: order.total_price, risks, score });
          }
        }

        if (highRiskOrders.length > 0 || medRiskOrders.length > 0) {
          const userEmail = userMap[user_id];
          if (userEmail) {
            // send-alert üzerinden gönder — dahili secret ile
            const allRiskOrders = [
              ...highRiskOrders.map(o => ({ ...o, level: 'HIGH' })),
              ...medRiskOrders.map(o => ({ ...o, level: 'MED' }))
            ];

            for (const riskOrder of allRiskOrders) {
              await fetch(ALERT_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-internal-secret': process.env.CRON_SECRET
                },
                body: JSON.stringify({
                  to:          userEmail,
                  orderNumber: riskOrder.order_number,
                  orderAmount: parseFloat(riskOrder.total_price).toFixed(2),
                  riskLevel:   riskOrder.level,
                  riskReasons: riskOrder.risks,
                  shop:        shop_domain
                })
              });
            }
          }
        }

        results.push({
          shop: shop_domain,
          scanned: orders.length,
          high: highRiskOrders.length,
          medium: medRiskOrders.length,
          emailSent: (highRiskOrders.length + medRiskOrders.length) > 0
        });

      } catch (storeErr) {
        results.push({ shop: store.shop_domain, error: storeErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      scanned: results.length,
      results
    });

  } catch (e) {
    console.error('[cron-scan] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
