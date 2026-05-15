function sanitize(str, maxLen = 500) {
  if (!str) return '';
  return String(str)
    .slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://belyshield.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, comment, rating, shop_domain } = req.body;
  if (!name || !comment || !rating) return res.status(400).json({ error: 'Missing fields' });

  // Rating doğrulama
  const safeRating = parseInt(rating);
  if (isNaN(safeRating) || safeRating < 1 || safeRating > 5) {
    return res.status(400).json({ error: 'Invalid rating' });
  }

  // Input sanitizasyonu
  const safeName = sanitize(name, 100);
  const safeComment = sanitize(comment, 1000);
  const safeShop = sanitize(shop_domain, 100);

  if (!safeName || !safeComment) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const autoApprove = safeRating >= 4;

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/testimonials`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        name: safeName,
        comment: safeComment,
        rating: safeRating,
        shop_domain: safeShop,
        approved: autoApprove
      })
    });

    if (!insertRes.ok) return res.status(500).json({ error: 'DB insert failed' });

    if (!autoApprove) {
      const RESEND_KEY = process.env.RESEND_API_KEY;
      if (RESEND_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'noreply@belyshield.com',
            to: 'info@belyshield.com',
            subject: `⚠ Yeni yorum onay bekliyor — ${safeName}`,
            html: `<h2>Yeni yorum geldi</h2>
              <p><b>Ad:</b> ${safeName}</p>
              <p><b>Puan:</b> ${safeRating} yıldız</p>
              <p><b>Mağaza:</b> ${safeShop}</p>
              <p><b>Yorum:</b> ${safeComment}</p>
              <p>Supabase'den onaylayabilirsiniz.</p>`
          })
        });
      }
    }

    return res.status(200).json({ success: true, approved: autoApprove });

  } catch (e) {
    console.error('[submit-testimonial] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
