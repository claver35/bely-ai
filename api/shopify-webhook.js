import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const ALERT_URL = process.env.APP_URL
  ? `${process.env.APP_URL}/api/send-alert`
  : 'https://belyshield.com/api/send-alert';

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

function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET || !hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

// Debounce kontrolü — aynı sipariş ID + topic için 60 saniye içinde tekrar işleme
async function isDebounced(orderId, topic, shop) {
  try {
    const debounceKey = `webhook_debounce_${shop}_${orderId}_${topic}`;
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data } = await supabase
      .from('processed_webhooks')
      .select('event_id')
      .eq('event_id', debounceKey)
      .gte('processed_at', oneMinuteAgo)
      .single();
    if (data) return true;

    // Debounce kaydı ekle
    await supabase.from('processed_webhooks').upsert({
      event_id: debounceKey,
      processed_at: new Date().toISOString()
    });
    return false;
  } catch(e) {
    return false;
  }
}

function getRiskScore(order) {
  let score = 0;
  const risks = [];

  if (order.customer?.created_at) {
    const daysSince = (Date.now() - new Date(order.customer.created_at)) / 86400000;
    if (daysSince < 1)  { score += 45; risks.push('Bugün oluşturulan hesap'); }
    else if (daysSince < 7)  { score += 30; risks.push('Yeni hesap (< 7 gün)'); }
    else if (daysSince < 30) { score += 10; risks.push('Hesap < 30 gün'); }
  } else {
    score += 20; risks.push('Misafir sipariş');
  }

  const totalPrice = parseFloat(order.total_price);
  if (totalPrice > 500) { score += 35; risks.push('Çok yüksek sipariş tutarı (>$500)'); }
  else if (totalPrice > 200) { score += 20; risks.push(`Yüksek sipariş tutarı ($${totalPrice.toFixed(0)})`); }

  if (
    order.billing_address?.country_code &&
    order.shipping_address?.country_code &&
    order.billing_address.country_code !== order.shipping_address.country_code
  ) {
    score += 35;
    risks.push('Fatura ve teslimat farklı ülkelerde');
  }

  if (order.financial_status === 'refunded') { score += 25; risks.push('Tam iade yapılmış'); }
  else if (order.financial_status === 'voided') { score += 20; risks.push('İptal edilmiş ödeme'); }

  score = Math.min(score, 99);

  let level;
  if (score >= 50) level = 'HIGH';
  else if (score >= 25) level = 'MED';
  else level = 'LOW';

  return { score, level, risks };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await getRawBody(req);
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];

  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn('[shopify-webhook] Invalid HMAC rejected');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let order;
  try {
    order = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const shop  = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  if (!shop || !shop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    console.warn('[shopify-webhook] Invalid shop domain');
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  // Debounce kontrolü — aynı sipariş + topic 60sn içinde tekrar gelirse işleme
  const debounced = await isDebounced(String(order.id), topic, shop);
  if (debounced) {
    console.log(`[shopify-webhook] Debounced: #${order.order_number} | ${topic}`);
    return res.status(200).json({ received: true, debounced: true });
  }

  // ── Sipariş oluşturuldu ──
  if (topic === 'orders/create') {
    const risk = getRiskScore(order);
    console.log(`[shopify-webhook] Order #${order.order_number} | Shop: ${shop} | Risk: ${risk.level}`);

    if (risk.level === 'HIGH' || risk.level === 'MED') {
      try {
        const { data: storeData } = await supabase
          .from('shopify_stores')
          .select('user_id, plan, subscription_status')
          .eq('shop_domain', shop)
          .single();

        if (storeData) {
          const isPaid = storeData.plan === 'pro' || storeData.plan === 'elite' || storeData.plan === 'agency';
          if (isPaid) {
            const { data: userData } = await supabase.auth.admin.getUserById(storeData.user_id);
            const userEmail = userData?.user?.email;
            if (userEmail) {
              await fetch(ALERT_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-internal-secret': process.env.CRON_SECRET
                },
                body: JSON.stringify({
                  to:          userEmail,
                  orderNumber: order.order_number,
                  orderAmount: parseFloat(order.total_price).toFixed(2),
                  riskLevel:   risk.level,
                  riskReasons: risk.risks,
                  shop
                })
              });
            }
          }
        }
      } catch (e) {
        console.error('[shopify-webhook] Alert error:', e.message);
      }
    }
  }

  // ── İade / Chargeback — detaylı kayıt ──
  if (topic === 'orders/updated' || topic === 'refunds/create') {
    try {
      const financialStatus = order.financial_status;
      if (financialStatus === 'refunded' || financialStatus === 'partially_refunded') {

        const { data: storeData } = await supabase
          .from('shopify_stores')
          .select('user_id')
          .eq('shop_domain', shop)
          .single();

        if (storeData?.user_id) {
          const { data: existing } = await supabase
            .from('chargebacks')
            .select('id')
            .eq('order_id', String(order.id))
            .eq('shop_domain', shop)
            .single();

          if (!existing) {
            const customerName = order.customer
              ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
              : 'Misafir';

            const lineItems = (order.line_items || []).map(item => ({
              title:    item.title,
              quantity: item.quantity,
              price:    item.price,
              sku:      item.sku || null
            }));

            const refundReason = order.refunds?.[0]?.note || null;
            const refundedAt = order.refunds?.[0]?.created_at || null;

            await supabase.from('chargebacks').insert({
              user_id:        storeData.user_id,
              shop_domain:    shop,
              order_id:       String(order.id),
              order_number:   String(order.order_number),
              amount:         parseFloat(order.total_price),
              status:         financialStatus,
              customer_name:  customerName,
              customer_email: order.customer?.email || null,
              line_items:     lineItems,
              refund_reason:  refundReason,
              refunded_at:    refundedAt,
              gateway:        order.payment_gateway || null
            });
          }
        }
      }
    } catch (e) {
      console.error('[shopify-webhook] Chargeback kayıt hatası:', e.message);
    }
  }

  return res.status(200).json({ received: true });
}
