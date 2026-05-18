function sanitizeInput(str, maxLen = 200) {
  if (!str && str !== 0) return 'Bilinmiyor';
  return String(str)
    .slice(0, maxLen)
    .replace(/[<>{}[\]\\\/|`~]/g, '')
    .replace(/ignore|forget|system|prompt|instruction|jailbreak|override|disregard|pretend|roleplay|act as|you are now|new personality|bypass|hack|inject/gi, '***')
    .replace(/\b(ignore|system|prompt)\b/gi, '***')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}

function validateAIOutput(text) {
  if (!text) return false;
  const forbidden = [
    /system prompt/i, /ignore (previous|all|above)/i,
    /you are now/i, /new instruction/i, /bypass/i
  ];
  return !forbidden.some(pattern => pattern.test(text));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderData } = req.body;
  if (!orderData) return res.status(400).json({ error: 'Missing orderData' });

  const {
    orderNumber, totalPrice, country, score, level, risks,
    customerName, accountAgeDays, totalOrders,
    billingCountry, shippingCountry, financialStatus, gateway
  } = orderData;

  // Tüm girdileri sanitize et
  const safeOrderNumber = sanitizeInput(orderNumber, 20);
  const safeTotalPrice = parseFloat(totalPrice) || 0;
  const safeCountry = sanitizeInput(country, 50);
  const safeScore = Math.min(Math.max(parseInt(score) || 0, 0), 99);
  const safeLevel = ['high', 'medium', 'low'].includes(level) ? level : 'low';
  const safeRisks = Array.isArray(risks)
    ? risks.slice(0, 5).map(r => sanitizeInput(r, 100)).join(', ')
    : 'Yok';
  const safeCustomerName = sanitizeInput(customerName, 100);
  const safeAccountAgeDays = accountAgeDays !== null && accountAgeDays !== undefined
    ? Math.max(0, parseInt(accountAgeDays) || 0) + ' gün'
    : 'Bilinmiyor';
  const safeTotalOrders = Math.max(0, parseInt(totalOrders) || 0);
  const safeBillingCountry = sanitizeInput(billingCountry, 50);
  const safeShippingCountry = sanitizeInput(shippingCountry, 50);
  const safeFinancialStatus = sanitizeInput(financialStatus, 50);
  const safeGateway = sanitizeInput(gateway, 50);

  const levelText = safeLevel === 'high' ? 'YÜKSEK' : safeLevel === 'medium' ? 'ORTA' : 'DÜŞÜK';
  const countryMatch = safeBillingCountry && safeShippingCountry && safeBillingCountry !== safeShippingCountry
    ? 'HAYIR — farklı ülkeler'
    : 'EVET';

  const prompt = `Sen bir Shopify fraud analisti ve sipariş risk uzmanısın. Aşağıdaki sipariş verilerini analiz et ve satıcıya net, pratik bir Türkçe öneri sun.

SİPARİŞ VERİLERİ:
- Sipariş No: #${safeOrderNumber}
- Tutar: $${safeTotalPrice.toFixed(2)}
- Risk Skoru: %${safeScore} (${levelText})
- Tespit Edilen Riskler: ${safeRisks}
- Müşteri: ${safeCustomerName}
- Hesap Yaşı: ${safeAccountAgeDays}
- Toplam Önceki Sipariş: ${safeTotalOrders}
- Teslimat Ülkesi: ${safeCountry}
- Fatura Ülkesi: ${safeBillingCountry}
- Ülke Eşleşmesi: ${countryMatch}
- Finansal Durum: ${safeFinancialStatus}
- Ödeme Yöntemi: ${safeGateway}
- Bağlam Notu: ${countryMatch === 'HAYIR — farklı ülkeler' ? 'Fatura ve teslimat ülkesi farklı — hediye gönderimi olabilir, değerlendirin.' : 'Fatura ve teslimat ülkesi aynı — adres tutarlı.'} ${safeTotalOrders > 3 ? 'Müşterinin geçmiş siparişleri var, tanıdık müşteri olabilir.' : ''} ${safeAccountAgeDays !== 'Bilinmiyor' && parseInt(safeAccountAgeDays) > 30 ? 'Hesap köklü, kısa süreli hesap riski yok.' : ''}
- Önemli Kural: Fatura ve teslimat ülkesi farklı ama diğer riskler düşükse, hediye gönderimi ihtimalini mutlaka belirt. Tek başına yeni hesap olmak yüksek risk sayılmaz, diğer faktörlerle birlikte değerlendir.
Satıcıya şunları söyle:
1. Bu sipariş güvenli mi, riskli mi, yoksa şüpheli mi?
2. Ne yapmalı? (kargoya ver / beklet / iptal et / müşteriyle iletişime geç)
3. Neden? (kısa gerekçe)

Yanıtın şu formatta olsun:

🔍 KARAR: [Güvenli / Şüpheli / Riskli]
📋 AÇIKLAMA: [2-3 cümle detaylı açıklama — müşteri davranışı, tespit edilen anomaliler ve neden bu kararı verdiğini açıkla]
⚡ AKSİYON: [Ne yapmalı — tek cümle net talimat]

Türkçe yaz. Satıcıya güven ver.`;

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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const suggestion = data.content?.[0]?.text;
    if (!suggestion) {
      return res.status(500).json({ error: 'No suggestion generated' });
    }
    return res.status(200).json({ suggestion });

  } catch (e) {
    console.error('[ai-suggestion] Error:', e.message);
    return res.status(500).json({ error: 'AI suggestion failed' });
  }
};
