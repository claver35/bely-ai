export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { priceId, email, userId, shopDomain } = req.body;

  if (!priceId || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Paddle'da customer oluştur veya bul
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

    // Supabase'e customer_id kaydet
    if (customerId && userId) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://txuanbvyjohgvuynlfyq.supabase.co',
        process.env.SUPABASE_SERVICE_KEY
      );
      await supabase
        .from('shopify_stores')
        .update({ paddle_customer_id: customerId })
        .eq('user_id', userId);
    }

    // Transaction oluştur (checkout linki)
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
          url: `https://bely-ai.vercel.app/dashboard.html`
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
      return res.status(500).json({ error: 'Could not create checkout' });
    }

    return res.status(200).json({ checkoutUrl });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Checkout failed' });
  }
}
