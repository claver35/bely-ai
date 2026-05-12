module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
      `${SUPABASE_URL}/rest/v1/shopify_stores?subscription_status=eq.active&plan=in.(pro,elite,agency)&select=user_id,shop_domain,access_token,plan`,
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
              const riskColor = riskOrder.level === 'HIGH' ? '#ff3d57' : '#ffab00';
              const riskEmoji = riskOrder.level === 'HIGH' ? '🚨' : '⚠️';
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: process.env.ALERT_FROM_EMAIL || 'BELY AI <alerts@belyshield.com>',
                  to: [userEmail],
                  subject: `${riskEmoji} ${riskOrder.level} Risk Sipariş #${riskOrder.order_number} — ${shop_domain}`,
                  html: `<div style="font-family:sans-serif;background:#0f1117;color:#fff;padding:40px;max-width:560px;margin:0 auto">
                    <h2 style="color:#00e5ff">BELY AI</h2>
                    <div style="background:#161820;border:1px solid ${riskColor}40;border-radius:12px;padding:28px;margin-top:20px">
                      <h3 style="color:#fff">${riskEmoji} ${riskOrder.level} Risk Sipariş Tespit Edildi</h3>
                      <p style="color:#c2c0b6">Mağaza: <strong style="color:#fff">${shop_domain}</strong></p>
                      <p>Sipariş: <strong>#${riskOrder.order_number}</strong></p>
                      <p>Tutar: <strong>$${parseFloat(riskOrder.total_price).toFixed(2)}</strong></p>
                      <p>Risk: <strong style="color:${riskColor}">${riskOrder.level}</strong></p>
                      ${riskOrder.risks.map(r => `<div style="padding:6px 10px;background:rgba(255,61,87,0.07);border-left:2px solid ${riskColor};margin:4px 0;font-size:13px">⚠ ${r}</div>`).join('')}
                      <a href="https://belyshield.com/dashboard.html" style="display:block;text-align:center;padding:12px;background:linear-gradient(90deg,#00e5ff,#0099cc);color:#000;font-weight:700;border-radius:8px;text-decoration:none;margin-top:20px">Dashboard'a Git →</a>
                    </div>
                  </div>`
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
