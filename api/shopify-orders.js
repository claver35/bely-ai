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

  // Mağaza bilgilerini çek
  const storeRes = await fetch(
    `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${userData.id}&select=plan,subscription_status,trial_end_date,access_token,shop_domain`,
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

  // Plan kontrolü
  const now = new Date();
  const trialEnd = storeData.trial_end_date ? new Date(storeData.trial_end_date) : null;
  const isTrialActive = trialEnd && now < trialEnd;
  const plan = storeData.plan;
  const status = storeData.subscription_status;

  let limit = 5;
  if (plan === 'elite' && status === 'active') {
    limit = 250;
  } else if (plan === 'pro' && status === 'active') {
    limit = 10;
  } else if (isTrialActive || status === 'trial') {
    limit = 5;
  } else {
    return res.status(403).json({ error: 'subscription_required' });
  }

  // Shop domain doğrulama
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });
  const cleanShop = shop.toLowerCase().trim();
  if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  const shopifyToken = storeData.access_token;
  if (!shopifyToken) {
    return res.status(500).json({ error: 'No Shopify token found' });
  }

  // Shopify API isteği
  try {
    const response = await fetch(
      `https://${cleanShop}/admin/api/2024-01/orders.json?limit=${limit}&status=any`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Shopify API error' });
    }
    const data = await response.json();
    return res.status(200).json({ ...data, _plan: plan, _limit: limit });
  } catch (e) {
    console.error('[shopify-orders] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
