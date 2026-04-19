module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const shop = req.query.shop;
  let token = req.query.token;

  // Cookie'den de oku
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      acc[k] = v;
      return acc;
    }, {});
    token = cookies['shopify_token'];
    if (!shop) req.query.shop = cookies['shopify_shop'];
  }

  const finalShop = shop || (req.headers.cookie && req.headers.cookie.match(/shopify_shop=([^;]+)/)?.[1]);

  if (!finalShop || !token) return res.status(400).json({ error: 'Missing params' });

  try {
    const response = await fetch(
      `https://${finalShop}/admin/api/2024-01/orders.json?limit=10&status=any`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
