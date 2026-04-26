export default async function handler(req, res) {

  // Sadece POST kabul et
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, orderNumber, orderAmount, riskLevel, riskReasons, shop } = req.body;

  // Zorunlu alan kontrolü
  if (!to || !orderNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── URL ve email adresi — environment variable'dan geliyor ──
  const appUrl   = process.env.APP_URL || 'https://bely-ai.vercel.app';
  const fromEmail = process.env.ALERT_FROM_EMAIL || 'BELY AI <alerts@belyai.com>';

  const riskColor = riskLevel === 'HIGH' ? '#ff4444' : '#fbbf24';
  const riskEmoji = riskLevel === 'HIGH' ? '🚨' : '⚠️';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="margin-bottom:32px">
      <span style="font-size:20px;font-weight:800;color:#fff">BELY <span style="color:#00d4ff">AI</span></span>
    </div>
    <div style="background:#161820;border:1px solid ${riskColor}40;border-radius:12px;padding:28px;margin-bottom:24px">
      <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">${riskEmoji} ${riskLevel} Risk Order Detected</div>
      <div style="font-size:14px;color:#c2c0b6;margin-bottom:24px">
        A ${riskLevel.toLowerCase()}-risk order was detected in your store <strong style="color:#fff">${shop}</strong>
      </div>
      <div style="background:#0d0f1a;border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em">Order</span>
          <span style="font-size:14px;font-weight:700;color:#fff">#${orderNumber}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em">Amount</span>
          <span style="font-size:14px;font-weight:700;color:#fff">$${orderAmount}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em">Risk Level</span>
          <span style="font-size:14px;font-weight:700;color:${riskColor}">${riskLevel}</span>
        </div>
      </div>
      ${riskReasons && riskReasons.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Risk Factors</div>
        ${riskReasons.map(r => `
          <div style="font-size:13px;color:#fca5a5;padding:6px 10px;background:rgba(255,34,34,0.07);border-left:2px solid #ff2222;border-radius:4px;margin-bottom:6px">
            ⚠ ${r}
          </div>`).join('')}
      </div>` : ''}
      <a href="${appUrl}/dashboard.html"
         style="display:block;text-align:center;padding:12px 24px;background:linear-gradient(90deg,#00d4ff,#0099cc);color:#fff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none">
        View Dashboard →
      </a>
    </div>
    <div style="font-size:12px;color:#5F5E5A;text-align:center">
      You're receiving this because you have email alerts enabled on BELY AI.<br>
      <a href="${appUrl}/dashboard.html" style="color:#5F5E5A">Manage alerts</a>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: `${riskEmoji} ${riskLevel} Risk Order #${orderNumber} — ${shop}`,
        html
      })
    });

    const data = await response.json();

    if (data.id) {
      return res.status(200).json({ sent: true, id: data.id });
    } else {
      // Resend hata detayı dışarı sızdırılmıyor
      console.error('[send-alert] Resend error:', data);
      return res.status(500).json({ error: 'Email send failed' });
    }

  } catch (error) {
    console.error('[send-alert] Error:', error.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
