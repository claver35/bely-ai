module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const shop = req.query.shop || 'belyai.myshopify.com';
  const token = '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';

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?limit=10&status=any`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
