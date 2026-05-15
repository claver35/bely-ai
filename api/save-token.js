module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, shop, token } = req.body;
  if (!userId || !shop || !token) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Shop domain doğrulama
  const cleanShop = shop.toLowerCase().trim();
  if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  // Token format doğrulama
  if (!token.startsWith('shpua_') && !token.startsWith('shpat_')) {
    return res.status(400).json({ error: 'Invalid token format' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  try {
    // Kullanıcı doğrulama
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid user' });
    const userData = await userRes.json();
    if (!userData.id || userData.id !== userId) return res.status(401).json({ error: 'User verification failed' });

    // Mevcut mağazaları çek
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${encodeURIComponent(userId)}&select=id,shop_domain,plan,subscription_status,trial_end_date,trial_ip`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const existingStores = await existingRes.json();
    const isFirstStore = !Array.isArray(existingStores) || existingStores.length === 0;
    const plan = existingStores[0]?.plan || 'free';
    const maxStores = plan === 'agency' ? 3 : 1;

    // Aynı domain zaten bağlıysa sadece token güncelle
    const sameStore = existingStores.find(s => s.shop_domain === cleanShop);
    if (sameStore) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/shopify_stores?id=eq.${encodeURIComponent(sameStore.id)}`,
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

    // İlk mağaza ise trial suistimal kontrolleri
    if (isFirstStore) {
      // 1. IP kontrolü — aynı IP'den daha önce trial başlatıldı mı?
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

      // 2. Email kontrolü — aynı email ile daha önce trial kullanıldı mı?
      const emailCheckRes = await fetch(
        `${SUPABASE_URL}/rest/v1/shopify_stores?select=id&user_id=eq.${encodeURIComponent(userId)}`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY
          }
        }
      );
      const emailCheckData = await emailCheckRes.json();
      if (Array.isArray(emailCheckData) && emailCheckData.length > 0) {
        return res.status(429).json({ error: 'trial_used', message: 'Bu hesap ile daha önce deneme kullanıldı.' });
      }

      // 3. Email domain kontrolü — tek kullanımlık email ile kayıt engelle
      const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','temp-mail.org','throwam.com','yopmail.com','tempmail.com','trashmail.com','sharklasers.com','maildrop.cc','throwaway.email']);
      const emailDomain = userData.email?.split('@')[1]?.toLowerCase();
      if (emailDomain && DISPOSABLE.has(emailDomain)) {
        return res.status(429).json({ error: 'disposable_email', message: 'Tek kullanımlık email adresi ile kayıt yapılamaz.' });
      }
    }

    // Limit kontrolü
    if (existingStores.length >= maxStores) {
      if (plan !== 'agency') {
        // Agency değilse eski mağazayı sil, yenisini ekle
        await fetch(
          `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${encodeURIComponent(userId)}`,
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

    // Trial bitiş tarihi — ilk mağazanın tarihini devral, yoksa yeni başlat
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const trialEndDate = existingStores.length > 0
      ? existingStores[0].trial_end_date
      : trialEnd.toISOString();

    // Plan ve subscription_status — mevcut planı devral
    const newPlan = existingStores.length > 0 ? plan : 'free';
    const newStatus = existingStores.length > 0 ? existingStores[0].subscription_status : 'trial';

    // Yeni mağazayı ekle
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
          trial_end_date:      trialEndDate,
          status:              newStatus,
          plan:                newPlan,
          subscription_status: newStatus,
          trial_ip:            isFirstStore ? clientIP : null
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
