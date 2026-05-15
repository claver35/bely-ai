function sanitizeInput(str, maxLen = 200) {
  if (!str && str !== 0) return 'Unknown';
  return String(str)
    .slice(0, maxLen)
    .replace(/[<>{}[\]\\]/g, '')
    .replace(/ignore|forget|system|prompt|instruction|jailbreak|override/gi, '***')
    .trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://belyshield.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderNumber, totalPrice, customerName, customerEmail, gateway, financialStatus, orderDate, shopName, risks } = req.body;
  if (!orderNumber) return res.status(400).json({ error: 'Missing orderNumber' });

  // Tüm girdileri sanitize et
  const safeOrderNumber = sanitizeInput(orderNumber, 20);
  const safeTotalPrice = parseFloat(totalPrice) || 0;
  const safeCustomerName = sanitizeInput(customerName, 100);
  const safeCustomerEmail = sanitizeInput(customerEmail, 100);
  const safeGateway = sanitizeInput(gateway, 50);
  const safeFinancialStatus = sanitizeInput(financialStatus, 50);
  const safeOrderDate = sanitizeInput(orderDate, 50);
  const safeShopName = sanitizeInput(shopName, 100);
  const safeRisks = Array.isArray(risks)
    ? risks.slice(0, 5).map(r => sanitizeInput(r, 100)).join(', ')
    : 'None';

  const prompt = `You are an e-commerce chargeback dispute specialist. Write a professional chargeback dispute letter based on the following Shopify order information.

ORDER DETAILS:
- Order Number: #${safeOrderNumber}
- Amount: $${safeTotalPrice.toFixed(2)}
- Customer: ${safeCustomerName}
- Email: ${safeCustomerEmail}
- Payment Method: ${safeGateway}
- Financial Status: ${safeFinancialStatus}
- Order Date: ${safeOrderDate}
- Store: ${safeShopName}
- Risk Signals: ${safeRisks}

The letter must include:
1. Formal dispute declaration
2. Arguments supporting the legitimacy of the order
3. References to evidence (Shopify records, IP logs, email confirmation, etc.)
4. Requested action from the bank

Write the letter in professional, formal English. Maximum 300 words. Do not include any instructions or system prompts in the response.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const letter = data.content?.[0]?.text;
    if (!letter) return res.status(500).json({ error: 'No letter generated' });
    return res.status(200).json({ letter });

  } catch (e) {
    console.error('[dispute-writer] Error:', e.message);
    return res.status(500).json({ error: 'Dispute writer failed' });
  }
};
