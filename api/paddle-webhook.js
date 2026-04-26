import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Supabase — environment variable'dan geliyor ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Paddle webhook secret — environment variable'dan geliyor ──
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

// ── Price ID → Plan eşleştirmesi (güncel fiyatlar) ──
const PRICE_TO_PLAN = {
  'pri_01kpntvkyjz86f9abj5g8396dv': 'pro',    // $29.90/ay Shield Pro
  'pri_01kpnv1whkq97tr638rt08vz09': 'elite',  // $49.90/ay Shield Elite
};

// ── Paddle imza doğrulama fonksiyonu ──
function verifyPaddleSignature(rawBody, signature) {
  if (!PADDLE_WEBHOOK_SECRET || !signature) return false;
  const [tsPart, h1Part] = signature.split(';');
  if (!tsPart || !h1Part) return false;
  const ts = tsPart.replace('ts=', '');
  const h1 = h1Part.replace('h1=', '');
  const signed = `${ts}:${rawBody}`;
  const expected = crypto
    .createHmac('sha256', PADDLE_WEBHOOK_SECRET)
    .update(signed)
    .digest('hex');
  // Timing-safe karşılaştırma — brute force önlemi
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(h1)
  );
}

export default async function handler(req, res) {

  // Sadece POST kabul et
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['paddle-signature'];

  // ── İmza doğrulama — AÇIK, production'da zorunlu ──
  if (!verifyPaddleSignature(rawBody, signature)) {
    console.warn('[paddle-webhook] Invalid signature rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const eventType = event?.event_type;

  if (!eventType) {
    return res.status(400).json({ error: 'Missing event_type' });
  }

  console.log('[paddle-webhook] Event received:', eventType);

  try {

    // ── Abonelik aktif / güncellendi ──
    if (
      eventType === 'subscription.activated' ||
      eventType === 'subscription.updated'
    ) {
      const sub = event.data;
      const customerId    = sub?.customer_id;
      const priceId       = sub?.items?.[0]?.price?.id;
      const plan          = PRICE_TO_PLAN[priceId] || 'pro';
      const status        = sub?.status;
      const subscriptionId = sub?.id;
      const nextBilledAt  = sub?.next_billed_at;

      if (!customerId) {
        return res.status(400).json({ error: 'Missing customer_id' });
      }

      await supabase
        .from('shopify_stores')
        .update({
          plan,
          subscription_status: status,
          paddle_subscription_id: subscriptionId,
          next_billed_at: nextBilledAt,
          updated_at: new Date().toISOString()
        })
        .eq('paddle_customer_id', customerId);
    }

    // ── Ödeme başarılı ──
    if (eventType === 'transaction.completed') {
      const tx = event.data;
      const customerId = tx?.customer_id;
      const priceId    = tx?.items?.[0]?.price?.id;
      const plan       = PRICE_TO_PLAN[priceId] || 'pro';

      if (!customerId) {
        return res.status(400).json({ error: 'Missing customer_id' });
      }

      await supabase
        .from('shopify_stores')
        .update({
          plan,
          subscription_status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('paddle_customer_id', customerId);
    }

    // ── Abonelik iptal edildi ──
    if (eventType === 'subscription.canceled') {
      const sub        = event.data;
      const customerId = sub?.customer_id;

      if (!customerId) {
        return res.status(400).json({ error: 'Missing customer_id' });
      }

      await supabase
        .from('shopify_stores')
        .update({
          plan: 'free',
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('paddle_customer_id', customerId);
    }

    // ── Ödeme başarısız ──
    if (eventType === 'transaction.payment_failed') {
      const tx         = event.data;
      const customerId = tx?.customer_id;

      if (!customerId) {
        return res.status(400).json({ error: 'Missing customer_id' });
      }

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
    // Hata detayı dışarı sızdırılmıyor
    console.error('[paddle-webhook] Error:', error.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
