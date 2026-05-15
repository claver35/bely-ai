import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

const PRICE_TO_PLAN = {
  'pri_01kpntvkyjz86f9abj5g8396dv': 'pro',
  'pri_01kpnv1whkq97tr638rt08vz09': 'elite',
};

export const config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyPaddleSignature(rawBody, signature) {
  if (!PADDLE_WEBHOOK_SECRET || !signature) return false;
  const [tsPart, h1Part] = signature.split(';');
  if (!tsPart || !h1Part) return false;
  const ts = tsPart.replace('ts=', '');
  const h1 = h1Part.replace('h1=', '');

  // Timestamp kontrolü — 5 dakikadan eski webhook'ları reddet
  const webhookTime = parseInt(ts) * 1000;
  const now = Date.now();
  if (Math.abs(now - webhookTime) > 5 * 60 * 1000) {
    console.warn('[paddle-webhook] Timestamp too old, possible replay attack');
    return false;
  }

  const signed = `${ts}:${rawBody}`;
  const expected = crypto
    .createHmac('sha256', PADDLE_WEBHOOK_SECRET)
    .update(signed)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(h1)
    );
  } catch {
    return false;
  }
}

async function isEventProcessed(eventId) {
  const { data } = await supabase
    .from('processed_webhooks')
    .select('event_id')
    .eq('event_id', eventId)
    .single();
  return !!data;
}

async function markEventProcessed(eventId) {
  await supabase
    .from('processed_webhooks')
    .insert({ event_id: eventId });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await getRawBody(req);
  const signature = req.headers['paddle-signature'];

  if (!verifyPaddleSignature(rawBody.toString('utf8'), signature)) {
    console.warn('[paddle-webhook] Invalid signature rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const eventType = event?.event_type;
  const eventId = event?.event_id;

  if (!eventType) return res.status(400).json({ error: 'Missing event_type' });
  if (!eventId) return res.status(400).json({ error: 'Missing event_id' });

  // Replay Attack koruması — aynı event_id daha önce işlendi mi?
  try {
    const alreadyProcessed = await isEventProcessed(eventId);
    if (alreadyProcessed) {
      console.warn('[paddle-webhook] Duplicate event rejected:', eventId);
      return res.status(200).json({ received: true, duplicate: true });
    }
  } catch(e) {
    console.warn('[paddle-webhook] Could not check event_id:', e.message);
  }

  console.log('[paddle-webhook] Event received:', eventType, eventId);

  try {
    if (eventType === 'subscription.activated' || eventType === 'subscription.updated') {
      const sub = event.data;
      const customerId     = sub?.customer_id;
      const priceId        = sub?.items?.[0]?.price?.id;
      const plan           = PRICE_TO_PLAN[priceId] || 'pro';
      const status         = sub?.status;
      const subscriptionId = sub?.id;
      const nextBilledAt   = sub?.next_billed_at;
      if (!customerId) return res.status(400).json({ error: 'Missing customer_id' });
      await supabase.from('shopify_stores').update({
        plan, subscription_status: status,
        paddle_subscription_id: subscriptionId,
        next_billed_at: nextBilledAt,
        updated_at: new Date().toISOString()
      }).eq('paddle_customer_id', customerId);
    }

    if (eventType === 'transaction.completed') {
      const tx = event.data;
      const customerId = tx?.customer_id;
      const priceId    = tx?.items?.[0]?.price?.id;
      const plan       = PRICE_TO_PLAN[priceId] || 'pro';
      if (!customerId) return res.status(400).json({ error: 'Missing customer_id' });
      await supabase.from('shopify_stores').update({
        plan, subscription_status: 'active',
        updated_at: new Date().toISOString()
      }).eq('paddle_customer_id', customerId);
    }

    if (eventType === 'subscription.canceled') {
      const sub        = event.data;
      const customerId = sub?.customer_id;
      if (!customerId) return res.status(400).json({ error: 'Missing customer_id' });
      await supabase.from('shopify_stores').update({
        plan: 'free', subscription_status: 'canceled',
        updated_at: new Date().toISOString()
      }).eq('paddle_customer_id', customerId);
    }

    if (eventType === 'transaction.payment_failed') {
      const tx         = event.data;
      const customerId = tx?.customer_id;
      if (!customerId) return res.status(400).json({ error: 'Missing customer_id' });
      await supabase.from('shopify_stores').update({
        subscription_status: 'past_due',
        updated_at: new Date().toISOString()
      }).eq('paddle_customer_id', customerId);
    }

    // Event ID'yi işlendi olarak kaydet
    await markEventProcessed(eventId);

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('[paddle-webhook] Error:', error.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
