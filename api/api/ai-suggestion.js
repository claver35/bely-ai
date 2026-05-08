export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderData } = req.body;
  if (!orderData) return res.status(400).json({ error: 'Missing orderData' });

  const {
    orderNumber, totalPrice, country, score, level, risks,
    customerName, accountAgeDays, totalOrders,
    billingCountry, shippingCountry, financialStatus, gateway
  } = orderData;

  const prompt = `Sen bir Shopify fraud analisti ve sipariş risk uzmanısın. Aşağıdaki sipariş verilerini analiz et ve satıcıya net, pratik bir Türkçe öneri sun.

SİPARİŞ VERİLERİ:
- Sipariş No: #${orderNumber}
- Tutar: $${totalPrice}
- Risk Skoru: %${score} (${level === 'high' ? 'YÜKSEK' : level === 'medium' ? 'ORTA' : 'DÜŞÜK'})
- Tespit Edilen Riskler: ${risks && risks.length > 0 ? risks.join(', ') : 'Yok'}
- Müşteri: ${customerName || 'Misafir'}
- Hesap Yaşı: ${accountAgeDays !== null && accountAgeDays !== undefined ? accountAgeDays + ' gün' : 'Bilinmiyor'}
- Toplam Önceki Sipariş: ${totalOrders || 0}
- Teslimat Ülkesi: ${country || 'Bilinmiyor'}
- Fatura Ülkesi: ${billingCountry || 'Bilinmiyor'}
- Şehir Eşleşmesi: ${billingCountry && shippingCountry && billingCountry !== shippingCountry ? 'HAYIR — farklı ülkeler' : 'EVET'}
- Finansal Durum: ${financialStatus || 'Bilinmiyor'}
- Ödeme Yöntemi: ${gateway || 'Bilinmiyor'}

Satıcıya şunları söyle:
1. Bu sipariş güvenli mi, riskli mi, yoksa şüpheli mi?
2. Ne yapmalı? (kargoya ver / beklet / iptal et / müşteriyle iletişime geç)
3. Neden? (kısa gerekçe)

Yanıtın maksimum 3-4 cümle olsun. Direkt ve net konuş. Türkçe yaz.`;

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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const suggestion = data.content?.[0]?.text;

    if (!suggestion) {
      console.error('[ai-suggestion] No content:', data);
      return res.status(500).json({ error: 'No suggestion generated' });
    }

    return res.status(200).json({ suggestion });

  } catch (e) {
    console.error('[ai-suggestion] Error:', e.message);
    return res.status(500).json({ error: 'AI suggestion failed' });
  }
}
