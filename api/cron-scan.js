module.exports = async function handler(req, res) {
  // Güvenlik: sadece cron-job.org'dan gelen istekleri kabul et
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;

  try {
    // Tüm aktif Pro kullanıcılarını çek
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

    // Her kullanıcının email bilgisini Supabase auth'dan çek
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

        // Son 10 siparişi çek
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

        // Risk analizi
        const highRiskOrders = [];
        const medRiskOrders = [];

        for (const order of orders) {
          let score = 0;
          const risks = [];

          if (order.customer?.created_at) {
            const days = Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000);
            if (days < 1)  { score += 45; risks.push('Bugün oluşturulan hesap'); }
            else if (days < 7) { score += 30; risks.push('Yeni hesap (< 7 gün)'); }
            else if (days < 30) { score += 10; risks.push('Hesap < 30 gün'); }
          } else {
            score += 20; risks.push('Misafir sipariş');
          }

          const price = parseFloat(order.total_price);
          if (price > 500) { score += 35; risks.push('Çok yüksek sipariş tutarı'); }
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

        // Yüksek veya orta riskli sipariş varsa email gönder
        if (highRiskOrders.length > 0 || medRiskOrders.length > 0) {
          const userEmail = userMap[user_id];
          if (userEmail) {
            const highRows = highRiskOrders.map(o =>
              `<tr style="background:#1a0a0e">
                <td style="padding:10px;color:#ff6b82;font-weight:700">#${o.order_number}</td>
                <td style="padding:10px;color:#fff">$${parseFloat(o.total_price).toFixed(2)}</td>
                <td style="padding:10px;color:#ff9aaa">YÜKSEK — %${o.score}</td>
                <td style="padding:10px;color:#ffd0d0">${o.risks.join(', ')}</td>
              </tr>`
            ).join('');

            const medRows = medRiskOrders.map(o =>
              `<tr style="background:#1a1200">
                <td style="padding:10px;color:#ffbc33;font-weight:700">#${o.order_number}</td>
                <td style="padding:10px;color:#fff">$${parseFloat(o.total_price).toFixed(2)}</td>
                <td style="padding:10px;color:#ffbc33">ORTA — %${o.score}</td>
                <td style="padding:10px;color:#ffd080">${o.risks.join(', ')}</td>
              </tr>`
            ).join('');

            const emailHtml = `
              <div style="font-family:sans-serif;background:#03050a;padding:32px;border-radius:12px;max-width:600px;margin:0 auto">
                <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:6px">🛡️ BELY AI — Otomatik Tarama Raporu</div>
                <div style="font-size:13px;color:#a0a8c0;margin-bottom:24px">${shop_domain} mağazanız için 30 dakikalık tarama tamamlandı.</div>

                ${highRiskOrders.length > 0 ? `
                  <div style="background:#1a0a0e;border:1px solid #ff3d57;border-radius:10px;padding:16px;margin-bottom:16px">
                    <div style="color:#ff3d57;font-weight:700;font-size:15px;margin-bottom:12px">🚨 ${highRiskOrders.length} Yüksek Riskli Sipariş</div>
                    <table style="width:100%;border-collapse:collapse">
                      <tr style="border-bottom:1px solid rgba(255,61,87,0.2)">
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">SİPARİŞ</th>
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">TUTAR</th>
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">RİSK</th>
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">NEDENLER</th>
                      </tr>
                      ${highRows}
                    </table>
                  </div>
                ` : ''}

                ${medRiskOrders.length > 0 ? `
                  <div style="background:#1a1200;border:1px solid #ffab00;border-radius:10px;padding:16px;margin-bottom:16px">
                    <div style="color:#ffab00;font-weight:700;font-size:15px;margin-bottom:12px">⚠️ ${medRiskOrders.length} Orta Riskli Sipariş</div>
                    <table style="width:100%;border-collapse:collapse">
                      <tr style="border-bottom:1px solid rgba(255,171,0,0.2)">
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">SİPARİŞ</th>
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">TUTAR</th>
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">RİSK</th>
                        <th style="padding:8px;color:#a0a8c0;text-align:left;font-size:11px">NEDENLER</th>
                      </tr>
                      ${medRows}
                    </table>
                  </div>
                ` : ''}

                <a href="https://belyshield.com/dashboard.html" style="display:inline-block;padding:12px 24px;background:linear-gradient(90deg,#00e5ff,#0099cc);color:#000;font-weight:700;border-radius:8px;text-decoration:none;margin-top:8px">Dashboard'a Git →</a>

                <div style="margin-top:24px;font-size:11px;color:#3a3f55">Bu email BELY AI Shield Pro otomatik tarama sistemi tarafından gönderilmiştir. • belyshield.com</div>
              </div>
            `;

            await fetch('https://api.resend.com/emails', {
              body: JSON.stringify({
                from: ALERT_FROM_EMAIL,
                to: userEmail,
                subject: `🚨 BELY AI — ${highRiskOrders.length} yüksek riskli sipariş tespit edildi (${shop_domain})`,
                html: emailHtml
              })
            });
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
