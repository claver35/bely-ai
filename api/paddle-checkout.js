import { createClient } from '@supabase/supabase-js';

// ── Supabase — environment variable'dan geliyor ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Geçerli Price ID'ler — sadece bunlar kabul edilir ──
const VALID_PRICE_IDS = [
  'pri_01kpntvkyjz86f9abj5g8396dv', // Shield Pro $29.90/ay
  'pri_01kpnv1whkq97tr638rt08vz09', // Shield Elite $49.90/ay
];

export default async function handler(req, res) {

  // Sadece POST kabul et
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { priceId, email, userId, shopDomain } = req.body;

  // Zorunlu alan kontrolü
  if (!priceId || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── Price ID doğrulama — sadece bizim ID'lerimiz kabul edilir ──
  if (!VALID_PRICE_IDS.includes(priceId)) {
    return res.status(400).json({ error: 'Invalid price ID' });
  }

  // ── APP_URL environment variable'dan geliyor ──
  const appUrl = process.env.APP_URL || 'https://bely-ai.vercel.app';

  try {
    // ── Paddle'da customer oluştur ──
    const customerRes = await fetch('https://api.paddle.com/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const customerData = await customerRes.json();
    const customerId = customerData.data?.id;

    if (!customerId) {
      console.error('[paddle-checkout] Customer creation failed:', customerData);
      return res.status(500).json({ error: 'Could not create customer' });
    }

    // ── Supabase'e customer_id kaydet ──
    if (userId) {
      await supabase
        .from('shopify_stores')
        .update({ paddle_customer_id: customerId })
        .eq('user_id', userId);
    }

    // ── Checkout transaction oluştur ──
    const txRes = await fetch('https://api.paddle.com/transactions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        customer_id: customerId,
        checkout: {
          url: `${appUrl}/dashboard.html`
        },
        custom_data: {
          user_id: userId,
          shop_domain: shopDomain
        }
      })
    });

    const txData = await txRes.json();
    const checkoutUrl = txData.data?.checkout?.url;

    if (!checkoutUrl) {
      console.error('[paddle-checkout] Transaction failed:', txData);
      return res.status(500).json({ error: 'Could not create checkout' });
    }

    return res.status(200).json({ checkoutUrl });

  } catch (error) {
    // Hata detayı dışarı sızdırılmıyor
    console.error('[paddle-checkout] Error:', error.message);
    return res.status(500).json({ error: 'Checkout failed' });
  }
}
