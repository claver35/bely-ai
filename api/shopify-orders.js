module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const shop = req.query.shop;
  const token = req.query.token;

  if (!shop || !token) return res.status(400).json({ error: 'Missing params' });

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?limit=10&status=any&fields=id,order_number,total_price,created_at,financial_status,fulfillment_status`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
