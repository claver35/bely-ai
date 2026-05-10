module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, comment, rating, shop_domain } = req.body;
  if (!name || !comment || !rating) return res.status(400).json({ error: 'Missing fields' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const autoApprove = rating >= 4;

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/testimonials`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ name, comment, rating, shop_domain: shop_domain || '', approved: autoApprove })
    });

    if (!insertRes.ok) return res.status(500).json({ error: 'DB insert failed' });

    if (!autoApprove) {
      const RESEND_KEY = process.env.RESEND_API_KEY;
      if (RESEND_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'noreply@belyshield.com',
            to: 'info@belyshield.com',
            subject: `⚠ Yeni yorum onay bekliyor — ${name}`,
            html: `<h2>Yeni yorum geldi</h2><p><b>Ad:</b> ${name}</p><p><b>Puan:</b> ${rating} yıldız</p><p><b>Mağaza:</b> ${shop_domain}</p><p><b>Yorum:</b> ${comment}</p><p>Supabase'den onaylayabilirsiniz.</p>`
          })
        });
      }
    }

    return res.status(200).json({ success: true, approved: autoApprove });
  } catch (e) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
