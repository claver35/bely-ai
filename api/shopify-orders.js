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
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    const userData = await userRes.json();
    if (!userData.id) return res.status(401).json({ error: 'Invalid token' });

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
    if (!storeData) return res.status(404).json({ error: 'Store not found' });

    const now = new Date();
    const trialEnd = storeData.trial_end_date ? new Date(storeData.trial_end_date) : null;
    const isTrialActive = trialEnd && now < trialEnd;
    const plan = storeData.plan;
    const status = storeData.subscription_status;

    let limit = 5;
    let accessLevel = 'trial';

    if (plan === 'elite' && status === 'active') {
      limit = 250;
      accessLevel = 'elite';
    } else if (plan === 'pro' && status === 'active') {
      limit = 10;
      accessLevel = 'pro';
    } else if (status === 'trial' || isTrialActive || plan === 'free') {
      limit = 5;
      accessLevel = 'trial';
    } else {
      return res.status(403).json({ error: 'subscription_required' });
    }

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
    if (!shopifyToken) return res.status(500).json({ error: 'No Shopify token found' });

    // Shopify siparişleri ve chargeback verisi paralel çek
    const [shopifyRes, chargebackRes, totalOrdersRes] = await Promise.all([
      fetch(
        `https://${cleanShop}/admin/api/2024-01/orders.json?limit=${limit}&status=any`,
        { headers: { 'X-Shopify-Access-Token': shopifyToken } }
      ),
      // Supabase'den chargeback sayısı
      fetch(
        `${SUPABASE_URL}/rest/v1/chargebacks?shop_domain=eq.${cleanShop}&select=id,amount,status`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY
          }
        }
      ),
      // Son 30 günlük toplam sipariş sayısı
      fetch(
        `https://${cleanShop}/admin/api/2024-01/orders/count.json?status=any&created_at_min=${new Date(Date.now() - 30 * 86400000).toISOString()}`,
        { headers: { 'X-Shopify-Access-Token': shopifyToken } }
      )
    ]);

    if (!shopifyRes.ok) {
      const errorText = await shopifyRes.text();
      console.error(`[shopify-orders] Shopify ${shopifyRes.status}:`, errorText);
      return res.status(shopifyRes.status).json({
        error: 'Shopify API error',
        shopify_status: shopifyRes.status,
        detail: errorText
      });
    }

    const data = await shopifyRes.json();

    // Chargeback oranı hesapla
    let chargebackRate = null;
    try {
      const chargebacks = await chargebackRes.json();
      const totalOrdersData = await totalOrdersRes.json();
      const totalOrders = totalOrdersData.count || 0;
      const chargebackCount = Array.isArray(chargebacks) ? chargebacks.length : 0;

      if (totalOrders > 0) {
        chargebackRate = ((chargebackCount / totalOrders) * 100).toFixed(2);
      }
    } catch (e) {
      console.warn('[shopify-orders] Chargeback rate calc error:', e.message);
    }

    const scoredOrders = (data.orders || []).map(order => {
      let score = 0;
      const risks = [];

      if (order.customer?.created_at) {
        const days = Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000);
        if (days < 1)  { score += 45; risks.push('Bugün oluşturulan hesap'); }
        else if (days < 7)  { score += 30; risks.push('Yeni hesap (< 7 gün)'); }
        else if (days < 30) { score += 10; risks.push('Hesap < 30 gün'); }
      } else {
        score += 20; risks.push('Misafir sipariş');
      }

      const price = parseFloat(order.total_price);
      if (price > 500) { score += 35; risks.push('Çok yüksek sipariş tutarı (>$500)'); }
      else if (price > 200) { score += 20; risks.push(`Yüksek sipariş tutarı ($${price.toFixed(0)})`); }

      if (
        order.billing_address && order.shipping_address &&
        order.billing_address.country_code !== order.shipping_address.country_code
      ) {
        score += 35; risks.push('Fatura ve teslimat farklı ülkelerde');
      }

      if (order.financial_status === 'refunded') { score += 25; risks.push('Tam iade yapılmış'); }
      else if (order.financial_status === 'voided') { score += 20; risks.push('İptal edilmiş ödeme'); }

      score = Math.min(score, 99);

      let level;
      if (score >= 50) level = 'high';
      else if (score >= 25) level = 'medium';
      else level = 'low';

      const baseOrder = {
        id: order.id,
        order_number: order.order_number,
        total_price: order.total_price,
        country: order.shipping_address?.country || null,
        created_at: order.created_at,
        risk: {
          score,
          level,
          risks: accessLevel === 'trial' ? [] : risks
        },
        details: null
      };

      if (accessLevel === 'pro') {
        baseOrder.risk.risks = risks;
        baseOrder.details = null;
      }

      if (accessLevel === 'elite') {
        baseOrder.risk.risks = risks;
        baseOrder.details = {
          customerName: order.customer
            ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || '—'
            : 'Misafir',
          customerEmail:     order.customer?.email || null,
          accountAgeDays:    order.customer?.created_at
            ? Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000)
            : null,
          totalOrders:       order.customer?.orders_count ?? 0,
          billingCountry:    order.billing_address?.country || null,
          shippingCountry:   order.shipping_address?.country || null,
          billingCity:       order.billing_address?.city || null,
          shippingCity:      order.shipping_address?.city || null,
          financialStatus:   order.financial_status || null,
          fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
          gateway:           order.gateway || 'bilinmiyor',
          totalPrice:        price
        };
      }

      return baseOrder;
    });

    return res.status(200).json({
      orders: scoredOrders,
      _plan: plan,
      _limit: limit,
      _access: accessLevel,
      _chargebackRate: chargebackRate // Dashboard'da kullanılacak
    });

  } catch (e) {
    console.error('[shopify-orders] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
