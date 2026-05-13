module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, shop, token } = req.body;
  if (!userId || !shop || !token) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const cleanShop = shop.toLowerCase().trim();
  if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }
  if (!token.startsWith('shpua_') && !token.startsWith('shpat_')) {
    return res.status(400).json({ error: 'Invalid token format' });
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid user' });
    const userData = await userRes.json();
    if (!userData.id || userData.id !== userId) return res.status(401).json({ error: 'User verification failed' });

    // IP bazlı trial koruma
    const ipCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores?trial_ip=eq.${encodeURIComponent(clientIP)}&select=id`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const ipCheckData = await ipCheckRes.json();
    if (Array.isArray(ipCheckData) && ipCheckData.length > 0) {
      return res.status(429).json({ error: 'trial_ip_used', message: 'Bu IP adresi ile daha önce deneme başlatıldı.' });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    // Mevcut mağazaları kontrol et
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${userId}&select=id,shop_domain,plan`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const existingStores = await existingRes.json();
    const plan = existingStores[0]?.plan || 'free';
    const maxStores = plan === 'agency' ? 3 : 1;

    // Aynı domain zaten bağlıysa güncelle
    const sameStore = existingStores.find(s => s.shop_domain === cleanShop);
    if (sameStore) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/shopify_stores?id=eq.${sameStore.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ access_token: token, connected_at: new Date().toISOString() })
        }
      );
      return res.status(200).json({ success: true });
    }

    // Limit kontrolü
    if (existingStores.length >= maxStores) {
      // En eski mağazayı sil (agency değilse)
      if (plan !== 'agency') {
        await fetch(
          `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${userId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'apikey': SUPABASE_SERVICE_KEY
            }
          }
        );
      } else {
        return res.status(403).json({ error: 'max_stores_reached', message: 'Agency planında maksimum 3 mağaza bağlayabilirsiniz.' });
      }
    }

    const insertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id:             userId,
          shop_domain:         cleanShop,
          access_token:        token,
          connected_at:        new Date().toISOString(),
          trial_end_date:      trialEnd.toISOString(),
          status:              'trial',
          plan:                'free',
          subscription_status: 'trial',
          trial_ip:            clientIP
        })
      }
    );

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('[save-token] Insert failed:', err);
      return res.status(500).json({ error: 'Insert failed' });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[save-token] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
