module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderNumber, totalPrice, customerName, customerEmail, gateway, financialStatus, orderDate, shopName, risks } = req.body;
  if (!orderNumber) return res.status(400).json({ error: 'Missing orderNumber' });

  const prompt = `Sen bir e-ticaret hukuk ve chargeback uzmanısın. Aşağıdaki Shopify sipariş bilgilerine göre bankaya veya ödeme kuruluşuna gönderilecek resmi bir chargeback itiraz mektubu yaz.

SİPARİŞ BİLGİLERİ:
- Sipariş No: #${orderNumber}
- Tutar: $${totalPrice}
- Müşteri: ${customerName || 'Bilinmiyor'}
- Email: ${customerEmail || 'Bilinmiyor'}
- Ödeme Yöntemi: ${gateway || 'Bilinmiyor'}
- Finansal Durum: ${financialStatus || 'Bilinmiyor'}
- Sipariş Tarihi: ${orderDate || 'Bilinmiyor'}
- Mağaza: ${shopName || 'Shopify Mağazası'}
- Risk Sinyalleri: ${risks && risks.length > 0 ? risks.join(', ') : 'Yok'}

Mektup şunları içersin:
1. Resmi itiraz beyanı
2. Siparişin meşruiyetini destekleyen argümanlar
3. Müşterinin sipariş verdiğine dair kanıt referansları (Shopify kayıtları, IP, email vb.)
4. Talep edilen aksiyon

Mektup profesyonel, resmi ve İngilizce olsun. Maksimum 300 kelime.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
