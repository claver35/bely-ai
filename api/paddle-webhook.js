import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  'https://txuanbvyjohgvuynlfyq.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

// Price ID → Plan adı eşleştirmesi
const PRICE_TO_PLAN = {
  'pri_01kpntvkyjz86f9abj5g8396dv': 'starter',  // $9/ay
  'pri_01kpnv1whkq97tr638rt08vz09': 'pro',       // $19/ay
};

function verifyPaddleSignature(rawBody, signature) {
  if (!PADDLE_WEBHOOK_SECRET || !signature) return false;
  const [tsPart, h1Part] = signature.split(';');
  const ts = tsPart.replace('ts=', '');
  const h1 = h1Part.replace('h1=', '');
  const signed = `${ts}:${rawBody}`;
  const expected = crypto.createHmac('sha256', PADDLE_WEBHOOK_SECRET).update(signed).digest('hex');
  return expected === h1;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['paddle-signature'];

  // Signature doğrulama (production'da aktif et)
  // if (!verifyPaddleSignature(rawBody, signature)) {
  //   return res.status(401).json({ error: 'Invalid signature' });
  // }

  const event = req.body;
  const eventType = event.event_type;

  console.log('Paddle webhook:', eventType);

  try {
    // Abonelik aktif oldu (ilk ödeme veya trial bitti)
    if (eventType === 'subscription.activated' || eventType === 'subscription.updated') {
      const sub = event.data;
      const customerId = sub.customer_id;
      const priceId = sub.items?.[0]?.price?.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';
      const status = sub.status; // active, trialing, past_due, canceled
      const subscriptionId = sub.id;
      const nextBilledAt = sub.next_billed_at;

      // Paddle customer_id ile user'ı bul
      const { data: storeData } = await supabase
        .from('shopify_stores')
        .select('user_id')
        .eq('paddle_customer_id', customerId)
        .single();

      if (storeData) {
        await supabase
          .from('shopify_stores')
          .update({
            plan: plan,
            subscription_status: status,
            paddle_subscription_id: subscriptionId,
            next_billed_at: nextBilledAt,
            updated_at: new Date().toISOString()
          })
          .eq('paddle_customer_id', customerId);
      }
    }

    // Ödeme başarılı
    if (eventType === 'transaction.completed') {
      const tx = event.data;
      const customerId = tx.customer_id;
      const priceId = tx.items?.[0]?.price?.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';

      await supabase
        .from('shopify_stores')
        .update({
          plan: plan,
          subscription_status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('paddle_customer_id', customerId);
    }

    // Abonelik iptal edildi
    if (eventType === 'subscription.canceled') {
      const sub = event.data;
      const customerId = sub.customer_id;

      await supabase
        .from('shopify_stores')
        .update({
          plan: 'free',
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('paddle_customer_id', customerId);
    }

    // Ödeme başarısız
    if (eventType === 'transaction.payment_failed') {
      const tx = event.data;
      const customerId = tx.customer_id;

      await supabase
        .from('shopify_stores')
        .update({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString()
        })
        .eq('paddle_customer_id', customerId);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
