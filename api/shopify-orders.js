export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { shop, token } = req.query;
  if (!shop || !token) return res.status(400).json({ error: 'Missing params' });

  const response = await fetch(
    `https://${shop}/admin/api/2024-01/orders.json?limit=10&status=any&fulfillment_status=any&financial_status=any`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );

  const data = await response.json();
  return res.status(200).json(data);
}
