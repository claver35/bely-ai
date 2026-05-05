module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, shop, token } = req.body;
  if (!userId || !shop || !token) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);

  try {
    // Önce sil
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

    // Sonra ekle
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
          user_id: userId,
          shop_domain: shop,
          access_token: token,
          connected_at: new Date().toISOString(),
          trial_end_date: trialEnd.toISOString(),
          status: 'trial',
          plan: 'free',
          subscription_status: 'trial'
        })
      }
    );

    if (!insertRes.ok) {
      const err = await insertRes.text();
      return res.status(500).json({ error: 'Insert failed', detail: err });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
