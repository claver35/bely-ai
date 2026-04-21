module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    }

    const { code, shop } = body;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    if (!shop) return res.status(400).json({ error: 'Missing shop' });

    const client_id = '0c6c69853d601c94138ac794687a25c0';
    const client_secret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!client_secret) return res.status(500).json({ error: 'SHOPIFY_CLIENT_SECRET not set' });

    const tokenUrl = `https://${shop}/admin/oauth/access_token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, client_secret, code })
    });

    const text = await response.text();

    let data;
    try { data = JSON.parse(text); }
    catch(e) { return res.status(500).json({ error: 'Shopify returned non-JSON', status: response.status, raw: text.substring(0, 300) }); }

    if (data.access_token) {
      return res.status(200).json({ access_token: data.access_token, shop });
    } else {
      return res.status(400).json({ error: 'Token exchange failed', shopify_error: data, status: response.status });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
