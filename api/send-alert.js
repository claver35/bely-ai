module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Dahili secret kontrolü — dışarıdan erişimi engeller
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== process.env.CRON_SECRET) {
    console.warn('[send-alert] Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, orderNumber, orderAmount, riskLevel, riskReasons, shop } = req.body;

  if (!to || !orderNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Email adresi format kontrolü
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // riskLevel sadece HIGH veya MED olabilir
  if (!['HIGH', 'MED'].includes(riskLevel)) {
    return res.status(400).json({ error: 'Invalid risk level' });
  }

  const appUrl    = process.env.APP_URL || 'https://belyshield.com';
  const fromEmail = process.env.ALERT_FROM_EMAIL || 'BELY AI <alerts@belyshield.com>';
  const riskColor = riskLevel === 'HIGH' ? '#ff3d57' : '#ffab00';
  const riskEmoji = riskLevel === 'HIGH' ? '🚨' : '⚠️';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="margin-bottom:32px">
      <span style="font-size:20px;font-weight:800;color:#fff">BELY <span style="color:#00e5ff">AI</span></span>
    </div>
    <div style="background:#161820;border:1px solid ${riskColor}40;border-radius:12px;padding:28px;margin-bottom:24px">
      <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">${riskEmoji} ${riskLevel} Risk Sipariş Tespit Edildi</div>
      <div style="font-size:14px;color:#c2c0b6;margin-bottom:24px">
        Mağazanızda <strong style="color:#fff">${shop}</strong> yüksek riskli sipariş tespit edildi.
      </div>
      <div style="background:#0d0f1a;border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em">Sipariş</span>
          <span style="font-size:14px;font-weight:700;color:#fff">#${orderNumber}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em">Tutar</span>
          <span style="font-size:14px;font-weight:700;color:#fff">$${orderAmount}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em">Risk Seviyesi</span>
          <span style="font-size:14px;font-weight:700;color:${riskColor}">${riskLevel}</span>
        </div>
      </div>
      ${riskReasons && riskReasons.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:#888780;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Risk Nedenleri</div>
        ${riskReasons.map(r => `
          <div style="font-size:13px;color:#fca5a5;padding:6px 10px;background:rgba(255,61,87,0.07);border-left:2px solid ${riskColor};border-radius:4px;margin-bottom:6px">
            ⚠ ${r}
          </div>`).join('')}
      </div>` : ''}
      <a href="${appUrl}/dashboard.html"
         style="display:block;text-align:center;padding:12px 24px;background:linear-gradient(90deg,#00e5ff,#0099cc);color:#000;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none">
        Dashboard'a Git →
      </a>
    </div>
    <div style="font-size:12px;color:#5F5E5A;text-align:center">
      Bu email BELY AI Shield Pro/Elite email uyarı sistemi tarafından gönderilmiştir.<br>
      <a href="${appUrl}/dashboard.html" style="color:#5F5E5A">Uyarıları yönet</a>
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
        subject: `${riskEmoji} ${riskLevel} Risk Sipariş #${orderNumber} — ${shop}`,
        html
      })
    });

    const data = await response.json();

    if (data.id) {
      return res.status(200).json({ sent: true, id: data.id });
    } else {
      console.error('[send-alert] Resend error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Email send failed' });
    }

  } catch (error) {
    console.error('[send-alert] Error:', error.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
