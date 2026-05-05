import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── Supabase — environment variable'dan geliyor ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Webhook secret — environment variable'dan geliyor ──
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// ── Alert URL — domain değişince burası otomatik güncellenir ──
const ALERT_URL = process.env.APP_URL
  ? `${process.env.APP_URL}/api/send-alert`
  : 'https://bely-ai.vercel.app/api/send-alert';

// ── Shopify webhook imza doğrulama ──
function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET || !hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  // Timing-safe karşılaştırma — brute force önlemi
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

// ── Risk puanlama algoritması ──
function getRiskScore(order) {
  let score = 0;
  const risks = [];

  // Yeni hesap kontrolü
  const created = new Date(order.customer?.created_at);
  const daysSince = (Date.now() - created) / 86400000;
  if (order.customer && daysSince < 7) {
    score += 30;
    risks.push(`New account (< 7 days)`);
  }

  // Yüksek sipariş tutarı
  const totalPrice = parseFloat(order.total_price);
  if (totalPrice > 200) {
    score += 20;
    risks.push(`High order value ($${totalPrice.toFixed(2)})`);
  }

  // Farklı ülke fatura/teslimat
  const billing  = order.billing_address?.country_code;
  const shipping = order.shipping_address?.country_code;
  if (billing && shipping && billing !== shipping) {
    score += 35;
    risks.push('Billing & shipping in different countries');
  }

  let level;
  if (score >= 50)      level = 'HIGH';
  else if (score >= 25) level = 'MED';
  else                  level = 'LOW';

  return { score, level, risks };
}

export default async function handler(req, res) {

  // Sadece POST kabul et
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Shopify webhook imza doğrulama ──
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const rawBody    = JSON.stringify(req.body);

  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn('[shopify-webhook] Invalid HMAC rejected');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const shop  = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  // Sadece yeni sipariş event'ini işle
  if (topic !== 'orders/create') {
    return res.status(200).json({ received: true });
  }

  const order = req.body;
  const risk  = getRiskScore(order);

  console.log(`[shopify-webhook] Order #${order.order_number} | Shop: ${shop} | Risk: ${risk.level} (${risk.score}%)`);

  // Sadece HIGH ve MED risk siparişlerde email gönder
  if (risk.level === 'HIGH' || risk.level === 'MED') {
    try {
      // Mağazanın user_id'sini bul
      const { data: storeData, error: storeError } = await supabase
        .from('shopify_stores')
        .select('user_id, plan, subscription_status, trial_end_date')
        .eq('shop_domain', shop)
        .single();

      if (storeError || !storeData) {
        console.warn('[shopify-webhook] Store not found:', shop);
        return res.status(200).json({ received: true, risk: risk.level });
      }

      // Kullanıcının email adresini al
      const { data: userData } = await supabase.auth.admin.getUserById(storeData.user_id);
      const userEmail = userData?.user?.email;

      if (userEmail) {
        await fetch(ALERT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

    } catch (e) {
      // Hata detayı dışarı sızdırılmıyor
      console.error('[shopify-webhook] Alert error:', e.message);
    }
  }

  return res.status(200).json({ received: true, risk: risk.level });
}
