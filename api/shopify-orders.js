module.exports = async function handler(req, res) {

  // ── CORS — sadece kendi domainlerimize izin ver ──
  const allowedOrigins = [
    'https://bely-ai.vercel.app',
    'https://belyshield.com',
    'https://app.belyshield.com'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Shop domain doğrulama — SSRF önlemi ──
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  const cleanShop = shop.toLowerCase().trim();
  if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  // ── Token environment variable'dan geliyor — asla kodun içine yazılmaz ──
  const token = process.env.SHOPIFY_PRIVATE_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch(
      `https://${cleanShop}/admin/api/2024-01/orders.json?limit=10&status=any`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Shopify API error' });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (e) {
    // Hata detayı dışarı sızdırılmıyor
    console.error('[shopify-orders] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
