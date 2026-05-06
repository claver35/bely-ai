module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://belyshield.com',
    'https://www.belyshield.com',
    'https://bely-ai.vercel.app'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userToken = authHeader.split(' ')[1];

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Kullanıcıyı doğrula
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    const userData = await userRes.json();
    if (!userData.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Store bilgisi çek
    const storeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${userData.id}&select=plan,subscription_status,trial_end_date,access_token,shop_domain&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const stores = await storeRes.json();
    const storeData = stores[0];

    if (!storeData) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Sadece Elite erişebilir
    const plan = storeData.plan;
    const status = storeData.subscription_status;
    if (!(plan === 'elite' && status === 'active')) {
      return res.status(403).json({ error: 'elite_required' });
    }

    // Shop kontrolü
    const shop = req.query.shop;
    if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

    const cleanShop = shop.toLowerCase().trim();
    if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    if (storeData.shop_domain !== cleanShop) {
      return res.status(403).json({ error: 'Shop domain mismatch' });
    }

    const shopifyToken = storeData.access_token;
    if (!shopifyToken) {
      return res.status(500).json({ error: 'No Shopify token found' });
    }

    // Shopify'dan siparişleri çek
    const shopifyRes = await fetch(
      `https://${cleanShop}/admin/api/2024-01/orders.json?limit=250&status=any`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );

    if (!shopifyRes.ok) {
      const errorText = await shopifyRes.text();
      console.error(`[fraud-report] Shopify ${shopifyRes.status}:`, errorText);
      return res.status(shopifyRes.status).json({ error: 'Shopify API error' });
    }

    const data = await shopifyRes.json();

    // Detaylı risk analizi
    const reports = (data.orders || []).map(order => {
      let score = 0;
      const risks = [];
      const details = {};

      // Müşteri yaşı
      let accountAgeDays = null;
      if (order.customer) {
        accountAgeDays = Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000);
        details.customerEmail = order.customer.email || null;
        details.customerName = `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim();
        details.totalOrders = order.customer.orders_count || 0;
        details.accountAgeDays = accountAgeDays;

        if (accountAgeDays < 1)  { score += 45; risks.push('Bugün oluşturulan hesap'); }
        else if (accountAgeDays < 7) { score += 30; risks.push('Yeni hesap (< 7 gün)'); }
        else if (accountAgeDays < 30) { score += 10; risks.push('Hesap < 30 gün'); }
      } else {
        score += 20;
        risks.push('Misafir sipariş — hesap yok');
        details.customerEmail = null;
        details.customerName = 'Misafir';
        details.totalOrders = 0;
        details.accountAgeDays = null;
      }

      // Sipariş tutarı
      const price = parseFloat(order.total_price);
      details.totalPrice = price;
      if (price > 500) { score += 35; risks.push('Çok yüksek sipariş tutarı (>$500)'); }
      else if (price > 200) { score += 20; risks.push(`Yüksek sipariş tutarı ($${price.toFixed(0)})`); }

      // Adres karşılaştırması
      details.billingCountry = order.billing_address?.country || null;
      details.shippingCountry = order.shipping_address?.country || null;
      details.billingCity = order.billing_address?.city || null;
      details.shippingCity = order.shipping_address?.city || null;

      if (
        order.billing_address && order.shipping_address &&
        order.billing_address.country_code !== order.shipping_address.country_code
      ) {
        score += 35;
        risks.push(`Fatura (${details.billingCountry}) ve teslimat (${details.shippingCountry}) farklı ülkelerde`);
      }

      // Finansal durum
      details.financialStatus = order.financial_status;
      if (order.financial_status === 'refunded') { score += 25; risks.push('Tam iade yapılmış sipariş'); }
      else if (order.financial_status === 'partially_refunded') { score += 15; risks.push('Kısmi iade yapılmış'); }
      else if (order.financial_status === 'voided') { score += 20; risks.push('İptal edilmiş ödeme'); }

      // Fulfillment durumu
      details.fulfillmentStatus = order.fulfillment_status || 'unfulfilled';

      // Ödeme gateway
      details.gateway = order.gateway || 'bilinmiyor';

      score = Math.min(score, 99);

      let level;
      if (score >= 50) level = 'high';
      else if (score >= 25) level = 'medium';
      else level = 'low';

      return {
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        total_price: order.total_price,
        details,
        risk: { score, level, risks }
      };
    });

    // Özet istatistikler
    const highRiskCount   = reports.filter(r => r.risk.level === 'high').length;
    const mediumRiskCount = reports.filter(r => r.risk.level === 'medium').length;
    const lowRiskCount    = reports.filter(r => r.risk.level === 'low').length;
    const avgScore        = reports.length > 0
      ? Math.round(reports.reduce((s, r) => s + r.risk.score, 0) / reports.length)
      : 0;

    return res.status(200).json({
      orders: reports,
      summary: { total: reports.length, highRiskCount, mediumRiskCount, lowRiskCount, avgScore },
      shop: cleanShop
    });

  } catch (e) {
    console.error('[fraud-report] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
