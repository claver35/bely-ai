import crypto from 'crypto';

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

function getRiskScore(order) {
  let score = 0;
  const risks = [];
  const created = new Date(order.customer?.created_at);
  const daysSince = (Date.now() - created) / 86400000;
  if (order.customer && daysSince < 7) { score += 30; risks.push('New customer account (< 7 days)'); }
  if (parseFloat(order.total_price) > 200) { score += 20; risks.push('High order value'); }
  if (order.billing_address && order.shipping_address && order.billing_address.country_code !== order.shipping_address.country_code) { score += 35; risks.push('Billing & shipping in different countries'); }
  let level;
  if (score >= 50) level = 'HIGH';
  else if (score >= 25) level = 'MED';
  else level = 'LOW';
  return { score, level, risks };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const shop = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  if (topic !== 'orders/create') {
    return res.status(200).json({ received: true });
  }

  const order = req.body;
  const risk = getRiskScore(order);

  console.log(`New order #${order.order_number} from ${shop} — Risk: ${risk.level} (${risk.score}%)`);

  if (risk.level === 'HIGH' || risk.level === 'MED') {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://txuanbvyjohgvuynlfyq.supabase.co',
        process.env.SUPABASE_SERVICE_KEY
      );
      const { data: storeData } = await supabase
        .from('shopify_stores')
        .select('user_id')
        .eq('shop_domain', shop)
        .single();
      if (storeData) {
        const { data: userData } = await supabase.auth.admin.getUserById(storeData.user_id);
        const userEmail = userData?.user?.email;
        if (userEmail) {
          await fetch('https://bely-ai.vercel.app/api/send-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: userEmail,
              orderNumber: order.order_number,
              orderAmount: parseFloat(order.total_price).toFixed(2),
              riskLevel: risk.level,
              riskReasons: risk.risks,
              shop
            })
          });
        }
      }
    } catch (e) {
      console.error('Email alert error:', e);
    }
  }

  return res.status(200).json({ received: true, risk: risk.level });
}
