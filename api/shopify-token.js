module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://belyshield.com',
    'https://www.belyshield.com',
    'https://bely-ai.vercel.app'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const { code, shop } = body;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    if (!shop) return res.status(400).json({ error: 'Missing shop' });

    // Shop domain doğrulama
    const cleanShop = shop.toLowerCase().trim();
    if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    // Code format kontrolü — Shopify auth code'ları belirli formatta
    if (typeof code !== 'string' || code.length < 10 || code.length > 512) {
      return res.status(400).json({ error: 'Invalid code format' });
    }

    const client_id = process.env.SHOPIFY_CLIENT_ID;
    const client_secret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!client_secret) return res.status(500).json({ error: 'Configuration error' });
    if (!client_id) return res.status(500).json({ error: 'Configuration error' });

    const tokenUrl = `https://${cleanShop}/admin/oauth/access_token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, client_secret, code })
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) {
      console.error('[shopify-token] Non-JSON response:', response.status);
      return res.status(500).json({ error: 'Shopify returned non-JSON', status: response.status });
    }

    if (data.access_token) {
      return res.status(200).json({ access_token: data.access_token, shop: cleanShop });
    } else {
      console.error('[shopify-token] Token exchange failed:', data);
      return res.status(400).json({ error: 'Token exchange failed' });
    }

  } catch (e) {
    console.error('[shopify-token] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
