module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const code = body?.code;
    const shop = body?.shop;

    if (!code || !shop) return res.status(400).json({ error: 'Missing code or shop' });

    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!secret) return res.status(500).json({ error: 'Missing SHOPIFY_CLIENT_SECRET' });

    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '07d3e8554d200c9b99309796104d9434',
        client_secret: secret,
        code
      })
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(500).json({ error: 'Shopify non-JSON', raw: text.substring(0,200) }); }

    if (data.access_token) {
      return res.status(200).json({ access_token: data.access_token, shop });
    } else {
      return res.status(400).json({ error: 'Token exchange failed', details: data });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
