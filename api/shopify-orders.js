module.exports = async function handler(req, res) {

  // ── CORS ──
  const allowedOrigins = [
    'https://belyshield.com',
    'https://www.belyshield.com',
    'https://bely-ai.vercel.app'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Shop domain doğrulama ──
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

  const cleanShop = shop.toLowerCase().trim();
  if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  // ── Token environment variable'dan geliyor ──
  const token = process.env.SHOPIFY_PRIVATE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ── Shopify API isteği ──
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
    console.error('[shopify-orders] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
