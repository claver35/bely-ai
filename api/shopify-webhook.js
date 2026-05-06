import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const ALERT_URL = process.env.APP_URL
  ? `${process.env.APP_URL}/api/send-alert`
  : 'https://bely-ai.vercel.app/api/send-alert';

// Raw body için bodyParser kapatıldı
export const config = {
  api: { bodyParser: false }
};

// Raw body oku
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// timingSafeEqual ile HMAC doğrulaması
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

  // Raw body oku — HMAC doğrulaması için şart
  const rawBody = await getRawBody(req);

  const hmacHeader = req.headers['x-shopify-hmac-sha256'];

  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn('[shopify-webhook] Invalid HMAC rejected');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Body'yi parse et
  let order;
  try {
    order = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const shop  = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  // Sadece orders/create işle
  if (topic !== 'orders/create') {
    return res.status(200).json({ received: true });
  }

  // Shop domain güvenlik kontrolü
  if (!shop || !shop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    console.warn('[shopify-webhook] Invalid shop domain:', shop);
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  const risk = getRiskScore(order);
  console.log(`[shopify-webhook] Order #${order.order_number} | Shop: ${shop} | Risk: ${risk.level} | Score: ${risk.score}`);

  if (risk.level === 'HIGH' || risk.level === 'MED') {
    try {
      const { data: storeData, error: storeError } = await supabase
        .from('shopify_stores')
        .select('user_id, plan, subscription_status')
        .eq('shop_domain', shop)
        .single();

      if (storeError || !storeData) {
        console.warn('[shopify-webhook] Store not found:', shop);
        return res.status(200).json({ received: true, risk: risk.level });
      }

      // Sadece Pro ve Elite email alır
      const isPaid = storeData.plan === 'pro' || storeData.plan === 'elite';
      if (!isPaid) {
        return res.status(200).json({ received: true, risk: risk.level });
      }

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
      console.error('[shopify-webhook] Error:', e.message);
    }
  }

  return res.status(200).json({ received: true, risk: risk.level });
}
