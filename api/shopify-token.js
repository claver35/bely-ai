export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { code, shop } = req.body;
    if (!code || !shop) return res.status(400).json({ error: 'Missing code or shop' });

    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '07d3e8554d200c9b99309796104d9434',
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code
      })
    });

    const data = await response.json();

    if (data.access_token) {
      return res.status(200).json({ access_token: data.access_token });
    } else {
      return res.status(400).json({ error: 'Token exchange failed', details: data });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
