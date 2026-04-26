import { createClient } from '@supabase/supabase-js';

// ── Supabase service client — environment variable'dan ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {

  // ── CORS — sadece kendi domainlerimize izin ver ──
  const allowedOrigins = [
    'https://bely-ai.vercel.app',
    'https://belyshield.com',
    'https://app.belyshield.com'
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

  // ── 1. Kullanıcı session doğrulama ──
  // Token dashboard'dan Authorization header ile geliyor
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const sessionToken = authHeader.split(' ')[1];

  // Supabase'de session doğrula
  const { data: { user }, error: authError } = await supabase.auth.getUser(sessionToken);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // ── 2. Shop domain doğrulama ──
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

  const cleanShop = shop.toLowerCase().trim();
  if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  // ── 3. Kullanıcının bu mağazaya yetkisi var mı? ──
  // Supabase'den kullanıcının kendi store kaydını çek
  const { data: storeData, error: storeError } = await supabase
    .from('shopify_stores')
    .select('access_token, shop_domain')
    .eq('user_id', user.id)
    .eq('shop_domain', cleanShop)
    .single();

  if (storeError || !storeData) {
    return res.status(403).json({ error: 'Store not found or access denied' });
  }

  // ── 4. Access token Supabase'den geliyor — URL veya frontend'den değil ──
  const token = storeData.access_token;
  if (!token) {
    return res.status(403).json({ error: 'Store not connected' });
  }

  // ── 5. Shopify API isteği ──
  try {
    const response = await fetch(
      `https://${cleanShop}/admin/api/2024-01/orders.json?limit=10&status=any`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Shopify API error' });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (e) {
    console.error('[shopify-orders] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
