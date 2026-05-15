const { decrypt } = require('./encrypt');
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','temp-mail.org','throwam.com',
  'sharklasers.com','guerrillamailblock.com','grr.la','guerrillamail.info',
  'spam4.me','trashmail.com','trashmail.me','trashmail.net','trashmail.at',
  'trashmail.io','trashmail.org','dispostable.com','yopmail.com','yopmail.fr',
  'cool.fr.nf','jetable.fr.nf','nospam.ze.tc','nomail.xl.cx','mega.zik.dj',
  'speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf',
  'monmail.fr.nf','tempmail.com','tempmail.net','tempmail.de','tempmail.us',
  'tempr.email','discard.email','discardmail.com','discardmail.de',
  'spamgourmet.com','spamgourmet.net','spamgourmet.org','spamspot.com',
  'spamthis.co.uk','spamthisplease.com','throwaway.email','throwam.com',
  'maildrop.cc','mailnull.com','mailnull.net','spamoff.de','wegwerfmail.de',
  'wegwerfmail.net','wegwerfmail.org','fakeinbox.com','mailnew.com',
  'mailscrap.com','spamfree24.org','spamfree24.de','spamfree24.eu',
  'spamfree24.info','spamfree24.net','spamfree24.com','spamfree.eu',
  'spam.la','spam.su','spaml.de','spaml.com','spamoff.de','antispam.de',
  'kasmail.com','spammotel.com','killmail.com','killmail.net','rejectmail.com',
  'spamgob.com','tempinbox.com','tempinbox.co.uk','filzmail.com','throwam.com',
  'dontreg.com','dontsendmeemail.com','drdrb.net','drdrb.com','dump-email.info',
  'dumpandfuck.com','dumpmail.de','dumpyemail.com','e4ward.com','email60.com',
  'emaildienst.de','emailias.com','emailinfive.com','emailmiser.com',
  'emailsensei.com','emailtemporario.com.br','emailwarden.com','emailx.at.hm',
  'emailxfer.com','emz.net','enterto.com','ephemail.net','etranquil.com',
  'explodemail.com','express.net.ua','extremail.ru','eyepaste.com',
  'fakemailgenerator.com','fastacura.com','fastchevy.com','fastchrysler.com',
  'fastkawasaki.com','fastmazda.com','fastmitsubishi.com','fastnissan.com',
  'fastsubaru.com','fastsuzuki.com','fasttoyota.com','fastyamaha.com',
  'filzmail.com','fixmail.tk','fizmail.com','frapmail.com','freundin.ru',
  'front14.org','fudgerub.com','fux0ringduh.com','garliclife.com',
  'get2mail.fr','getairmail.com','getmails.eu','getonemail.com',
  'getonemail.net','gishpuppy.com','gmal.com','gmial.com','gotmail.net',
  'gotmail.org','gotti.otherinbox.com','gowikibooks.com','gowikicampus.com',
  'gowikicars.com','gowikifilms.com','gowikigames.com','gowikimusic.com',
  'gowikinetwork.com','gowikitravel.com','gowikitv.com','grandmamail.com',
  'grandmasmail.com','great-host.in','greensloth.com','gsrv.co.uk',
  'gustr.com','haltospam.com','hatespam.org','hidemail.de','hidzz.com',
  'hmamail.com','hochsitze.com','hotpop.com','hulapla.de','ieatspam.eu',
  'ieatspam.info','ieh-mail.de','ihateyoualot.info','iheartspam.org',
  'imails.info','inbax.tk','inbox.si','inboxalias.com','inboxclean.com',
  'inboxclean.org','infocom.zp.ua','instant-mail.de','ip6.li','irish2me.com',
  'iwi.net','jetable.com','jetable.fr.nf','jetable.net','jetable.org',
  'jnxjn.com','jourrapide.com','jsrsolutions.com','jungleemail.com',
  'junk1.tk','kasmail.com','kaspop.com','killmail.com','killmail.net',
  'klzlk.com','knol-power.nl','koszmail.pl','kurzepost.de','letthemeatspam.com',
  'lhsdv.com','lifebyfood.com','link2mail.net','litedrop.com','lol.ovpn.to',
  'lolfreak.net','lookugly.com','lortemail.dk','losemymail.com','lovemeleaveme.com',
  'lr78.com','lroid.com','lukop.dk','m21.cc','mail-filter.com','mail-temporaire.fr',
  'mail.by','mail.mezimages.net','mail.zp.ua','mail1a.de','mail21.cc',
  'mail2rss.org','mail333.com','mailbidon.com','mailbiz.biz','mailblocks.com',
  'mailbucket.org','mailchop.com','mailde.org','maileimer.de','mailexpire.com',
  'mailf5.com','mailfall.com','mailfree.net','mailguard.me','mailimate.com',
  'mailin8r.com','mailinater.com','mailismagic.com','mailme.lv','mailme24.com',
  'mailmetrash.com','mailmoat.com','mailms.com','mailna.me','mailnew.com',
  'mailnull.com','mailorg.org','mailpick.biz','mailproxsy.com','mailquack.com',
  'mailrock.biz','mailseal.de','mailshell.com','mailsiphon.com','mailslapping.com',
  'mailslite.com','mailtemp.info','mailtome.de','mailtothis.com','mailtrash.net',
  'mailtv.net','mailtv.tv','mailzilla.com','mailzilla.org','mbx.cc',
  'mega.zik.dj','meltmail.com','messagebeamer.de','mezimages.net','ministry-of-silly-walks.de',
  'mintemail.com','misterpinball.de','mmmmail.com','mobi.web.id','moburl.com',
  'moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf','monumentmail.com',
  'mr24.co','msa.minsmail.com','mt2009.com','mt2014.com','mx0.wwwnew.eu',
  'my10minutemail.com','myalias.pw','mymail-in.net','mypacks.net','mypartyclip.de',
  'myphantomemail.com','mysamp.de','mytempemail.com','mytempmail.com',
  'mytrashmail.com','nabuma.com','neomailbox.com','nepwk.com','nervmich.net',
  'nervtmich.net','netmails.com','netmails.net','netzidiot.de','neverbox.com',
  'nice-4u.com','nincsmail.hu','nnh.com','no-spam.ws','nobulk.com',
  'noclickemail.com','nogmailspam.info','nomail.pw','nomail.xl.cx',
  'nomail2me.com','nomorespamemails.com','nonspam.eu','nonspammer.de',
  'noref.in','nortaltech.com','notmailinator.com','nowhere.org','nowmymail.com',
  'nurfuerspam.de','nus.edu.sg','nwldx.com','objectmail.com','obobbo.com',
  'odnorazovoe.ru','oneoffemail.com','oneoffmail.com','onewaymail.com',
  'online.ms','oopi.org','opayq.com','ordinaryamerican.net','otherinbox.com',
  'ovpn.to','owlpic.com','pancakemail.com','paplease.com','pcusers.otherinbox.com',
  'pepbot.com','pfui.ru','phentermine-mortgages.com','pimpedupmyspace.com',
  'pjjkp.com','plexolan.de','poczta.onet.pl','politikerclub.de','poofy.org',
  'pookmail.com','pop3.xyz','postfach.cc','privacy.net',
  'privatdemail.net','proxymail.eu','prtnx.com','prtz.eu','pubmail.io',
  'put2.net','putthisinyourspamdatabase.com','pwrby.com','quickinbox.com',
  'quickmail.nl','rcpt.at','reallymymail.com','receiveee.chickenkiller.com',
  'recipefork.com','recursor.net','recyclemail.dk','regbypass.com',
  'rejectmail.com','reliable-mail.com',
  'rhyta.com','rklips.com','rmqkr.net','rn.com','rocketmail.com',
  'rppkn.com','rtrtr.com','s0ny.net','safe-mail.net','safersignup.de',
  'safetymail.info','safetypost.de','sandelf.de','saynotospams.com',
  'selfdestructingmail.com','sendspamhere.com','senseless-entertainment.com',
  'shahweb.net','sharedmailbox.org','sharklasers.com','shieldedmail.com',
  'shieldemail.com','shitmail.de','shitmail.me','shitmail.org','shitware.nl',
  'shmeriously.com','shortmail.net','sibmail.com','sinnlos-mail.de',
  'slapsfromlastnight.com','slaskpost.se','slave-auctions.net','slippery.email',
  'slushmail.com','smashmail.de','smellfear.com','smwg.info','snakemail.com',
  'sneakemail.com','sneakmail.de','snkmail.com','sofimail.com','sofort-mail.de',
  'sogetthis.com','soisz.com','sol.dk','spam.la','spam.su','spamcorpse.com',
  'spamday.com','spamex.com','spamfree24.com','spamfree24.de','spamfree24.eu',
  'spamfree24.info','spamfree24.net','spamfree24.org','spamgob.com',
  'spamherelots.com','spamhereplease.com','spamhole.com','spamify.com',
  'spaminator.de','spamkill.info','spaml.com','spaml.de','spammotel.com',
  'spammy.host','spamnot.com','spamoff.de','spamspot.com','spamthis.co.uk',
  'spamthisplease.com','spamtrail.com','speed.1s.fr','spikio.com',
  'spoofmail.de','squizzy.de','ssoia.com','startkeys.com','stexsy.com',
  'stinkefinger.net','stopspam.org','streetwisemail.com','stumpfwerk.com',
  'suburbanthug.com','supergreatmail.com','supermailer.jp','superrito.com',
  'superstachel.de','suremail.info','svk.jp','sweetxxx.de','tafmail.com',
  'tagyourself.com','tapchicuocsong.vn','techemail.com','telecomix.pl',
  'temp-mail.de','temp-mail.io','temp-mail.ru','temp.emeraldwebmail.com',
  'temp.headstrong.de','tempalias.com','tempe-mail.com','tempemail.biz',
  'tempemail.co.za','tempemail.com','tempemail.net','tempemail.us',
  'tempinbox.co.uk','tempinbox.com','tempmail.de','tempmail.eu',
  'tempmail.it','tempmail.us','tempmailer.com','tempmailer.de',
  'tempomail.fr','temporaryemail.net','temporaryemail.us','temporaryforwarding.com',
  'temporaryinbox.com','temporarymailaddress.com','tempsky.com','tempthe.net',
  'tempymail.com','thanksnospam.info','thc.st','thelimestones.com',
  'thisisnotmyrealemail.com','thismail.net','throwam.com','throwamail.com',
  'throwaway.email','throwam.com','tilien.com','tittbit.in','tizi.com',
  'tkitc.de','tmail.com','tmail.io','tmail.ws','tmailinator.com',
  'toiea.com','tradermail.info','trash-amil.com','trash-mail.at',
  'trash-mail.com','trash-mail.de','trash-mail.ga','trash-mail.io',
  'trash-mail.net','trash2009.com','trash2010.com','trash2011.com',
  'trashdevil.com','trashdevil.de','trashemail.de','trashmail.at',
  'trashmail.com','trashmail.de','trashmail.io','trashmail.me',
  'trashmail.net','trashmail.org','trashmail.xyz','trashmailer.com',
  'trashmails.com','trbvm.com','trialmail.de','trickmail.net',
  'trillianpro.com','troycategory.com.mx','trumpmail.com','turual.com',
  'twinmail.de','tyldd.com','uggsrock.com','umail.net','upliftnow.com',
  'uplipht.com','uroid.com','us.af','venompen.com','veryrealemail.com',
  'viditag.com','viewcastmedia.com','viewcastmedia.net','viewcastmedia.org',
  'viralplays.com','vomoto.com','vubby.com','walala.org','walkmail.net',
  'wasteland.rfc822.org','webemail.me','webm4il.info','weg-werf-email.de',
  'wegwerf-emails.de','wegwerfadresse.de','wegwerfmail.de','wegwerfmail.net',
  'wegwerfmail.org','wegwerpmailadres.nl','wegwerpnummer.nl','wetrainbayarea.com',
  'wh4f.org','whyspam.me','willhackforfood.biz','willselfdestruct.com',
  'winemaven.info','wronghead.com','wuzup.net','wuzupmail.net',
  'www.e4ward.com','www.gishpuppy.com','www.mailinator.com','wwwnew.eu',
  'x1x.spamtrap.ro','xagloo.com','xemaps.com','xents.com','xmaily.com',
  'xoxy.net','xpeedmail.com','xsmail.com','xtymail.com','xyzfree.net',
  'yapped.net','yeah.net','yep.it','yogamaven.com','yopmail.com',
  'yopmail.fr','youmail.ga','yourdomain.com','ypmail.webarnak.fr.eu.org',
  'yuurok.com','z1p.biz','za.com','zehnminutenmail.de','zetmail.com',
  'zippymail.info','zoemail.net','zoemail.org','zomg.info','zxcv.com',
  'zxcvbnm.com','zzz.com'
]);

function isDisposableEmail(email) {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://belyshield.com',
    'https://www.belyshield.com',
    'https://bely-ai.vercel.app'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userToken = authHeader.split(' ')[1];

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Kullanıcı doğrulama
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    const userData = await userRes.json();
    if (!userData.id) return res.status(401).json({ error: 'Invalid token' });

    // Shop parametresi al ve doğrula
    const shop = req.query.shop;
    if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });
    const cleanShop = shop.toLowerCase().trim();
    if (!cleanShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    // Mağaza bilgilerini çek — cleanShop ile eşleştir
    const storeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shopify_stores?user_id=eq.${encodeURIComponent(userData.id)}&select=plan,subscription_status,trial_end_date,access_token,shop_domain`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const stores = await storeRes.json();
    const storeData = Array.isArray(stores)
      ? (stores.find(s => s.shop_domain === cleanShop) || stores[0])
      : null;
    if (!storeData) return res.status(404).json({ error: 'Store not found' });

    // Domain eşleşme kontrolü
    if (storeData.shop_domain !== cleanShop) {
      return res.status(403).json({ error: 'Shop domain mismatch' });
    }

    const now = new Date();
    const trialEnd = storeData.trial_end_date ? new Date(storeData.trial_end_date) : null;
    const isTrialActive = trialEnd && now < trialEnd;
    const plan = storeData.plan;
    const status = storeData.subscription_status;

    let limit = 5;
    let accessLevel = 'trial';

    if (plan === 'agency' && status === 'active') {
      limit = 250; accessLevel = 'agency';
    } else if (plan === 'elite' && status === 'active') {
      limit = 500; accessLevel = 'elite';
    } else if (plan === 'pro' && status === 'active') {
      limit = 250; accessLevel = 'pro';
    } else if (status === 'trial' || isTrialActive || plan === 'free') {
      limit = 5; accessLevel = 'trial';
    } else {
      return res.status(403).json({ error: 'subscription_required' });
    }

    const shopifyToken = decrypt(storeData.access_token);
    if (!shopifyToken) return res.status(500).json({ error: 'No Shopify token found' });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [shopifyRes, chargebackRes, totalOrdersRes] = await Promise.all([
      fetch(
        `https://${cleanShop}/admin/api/2024-01/orders.json?limit=${limit}&status=any`,
        { headers: { 'X-Shopify-Access-Token': shopifyToken } }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/chargebacks?shop_domain=eq.${encodeURIComponent(cleanShop)}&created_at=gte.${thirtyDaysAgo}&select=id,amount,status`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY
          }
        }
      ),
      fetch(
        `https://${cleanShop}/admin/api/2024-01/orders/count.json?status=any&created_at_min=${thirtyDaysAgo}`,
        { headers: { 'X-Shopify-Access-Token': shopifyToken } }
      )
    ]);

    if (!shopifyRes.ok) {
      const errorText = await shopifyRes.text();
      console.error(`[shopify-orders] Shopify ${shopifyRes.status}:`, errorText);
      return res.status(shopifyRes.status).json({ error: 'Shopify API error' });
    }

    const data = await shopifyRes.json();

    let chargebackRate = null;
    try {
      const chargebacks = await chargebackRes.json();
      const totalOrdersData = await totalOrdersRes.json();
      const totalOrders = totalOrdersData.count || 0;
      const chargebackCount = Array.isArray(chargebacks) ? chargebacks.length : 0;
      chargebackRate = totalOrders > 0
        ? ((chargebackCount / totalOrders) * 100).toFixed(2)
        : '0.00';
    } catch (e) {
      console.warn('[shopify-orders] Chargeback rate calc error:', e.message);
    }

    // Blacklist'i çek
    let blacklistItems = [];
    try {
      const blRes = await fetch(
        `${SUPABASE_URL}/rest/v1/blacklist?user_id=eq.${encodeURIComponent(userData.id)}&select=type,value,reason`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY
          }
        }
      );
      blacklistItems = await blRes.json();
    } catch(e) { blacklistItems = []; }

    const blEmails = new Set(blacklistItems.filter(b => b.type === 'email').map(b => b.value.toLowerCase()));
    const blCountries = new Set(blacklistItems.filter(b => b.type === 'country').map(b => b.value.toUpperCase()));

    const scoredOrders = (data.orders || []).map(order => {
      let score = 0;
      const risks = [];

      // Blacklist kontrolü
      const custEmail = order.customer?.email?.toLowerCase();
      const shipCountry = order.shipping_address?.country_code?.toUpperCase();
      if (custEmail && blEmails.has(custEmail)) {
        const blItem = blacklistItems.find(b => b.type === 'email' && b.value === custEmail);
        const reason = blItem?.reason ? ` (Sebep: ${blItem.reason})` : '';
        score += 60; risks.push(`🚫 Kara listede email adresi${reason}`);
      }
      if (shipCountry && blCountries.has(shipCountry)) {
        const blItem = blacklistItems.find(b => b.type === 'country' && b.value === shipCountry);
        const reason = blItem?.reason ? ` (Sebep: ${blItem.reason})` : '';
        score += 50; risks.push(`🚫 Kara listede ülke${reason}`);
      }

      // Hesap yaşı
      if (order.customer?.created_at) {
        const days = Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000);
        if (days < 1)  { score += 45; risks.push('Bugün oluşturulan hesap'); }
        else if (days < 7)  { score += 30; risks.push('Yeni hesap (< 7 gün)'); }
        else if (days < 30) { score += 10; risks.push('Hesap < 30 gün'); }
      } else {
        score += 20; risks.push('Misafir sipariş');
      }

      // Disposable email tespiti — Pro, Elite ve Agency
      if (accessLevel === 'pro' || accessLevel === 'elite' || accessLevel === 'agency') {
        const email = order.customer?.email || null;
        if (isDisposableEmail(email)) {
          score += 30;
          risks.push('Tek kullanımlık email adresi tespit edildi');
        }
      }

      // Sipariş tutarı — AOV'a göre dinamik eşik
      const price = parseFloat(order.total_price);
      const avgPrice = (data.orders || []).reduce((s, o) => s + parseFloat(o.total_price || 0), 0) / Math.max((data.orders || []).length, 1);
      const highThreshold = Math.max(avgPrice * 2.5, 300);
      const medThreshold = Math.max(avgPrice * 1.5, 150);
      if (price > highThreshold) { score += 25; risks.push(`Ortalamadan çok yüksek sipariş tutarı ($${price.toFixed(0)})`); }
      else if (price > medThreshold) { score += 10; risks.push(`Ortalamadan yüksek sipariş tutarı ($${price.toFixed(0)})`); }

      // Farklı ülke
      if (
        order.billing_address && order.shipping_address &&
        order.billing_address.country_code !== order.shipping_address.country_code
      ) {
        score += 35; risks.push('Fatura ve teslimat farklı ülkelerde');
      }

      // Finansal durum
      if (order.financial_status === 'refunded') { score += 25; risks.push('Tam iade yapılmış'); }
      else if (order.financial_status === 'voided') { score += 20; risks.push('İptal edilmiş ödeme'); }

      // Bot tespiti — sadece Agency
      if (accessLevel === 'agency') {
        const customerEmail = order.customer?.email;
        if (customerEmail) {
          const oneHourAgo = new Date(Date.now() - 3600000);
          const recentSameCustomer = (data.orders || []).filter(o =>
            o.customer?.email === customerEmail &&
            o.id !== order.id &&
            new Date(o.created_at) > oneHourAgo
          ).length;
          if (recentSameCustomer >= 2) {
            score += 35;
            risks.push(`Bot şüphesi: Aynı hesaptan 1 saatte ${recentSameCustomer + 1} sipariş`);
          }
        }

        const shippingAddr = order.shipping_address;
        if (shippingAddr) {
          const customerEmail2 = order.customer?.email;
          const sameAddrDiffEmail = (data.orders || []).filter(o =>
            o.id !== order.id &&
            o.shipping_address?.address1 === shippingAddr.address1 &&
            o.shipping_address?.zip === shippingAddr.zip &&
            o.customer?.email !== customerEmail2
          ).length;
          if (sameAddrDiffEmail >= 2) {
            score += 30;
            risks.push(`Bot şüphesi: Aynı adrese ${sameAddrDiffEmail + 1} farklı hesaptan sipariş`);
          }
        }

        if (order.customer?.created_at && order.created_at) {
          const accountCreated = new Date(order.customer.created_at);
          const orderCreated = new Date(order.created_at);
          const diffMinutes = (orderCreated - accountCreated) / 60000;
          if (diffMinutes < 5) {
            score += 25;
            risks.push(`Bot şüphesi: Hesap açıldıktan ${Math.round(diffMinutes)} dakika içinde sipariş`);
          }
        }
      }

      score = Math.min(score, 99);
      let level;
      if (score >= 65) level = 'high';
      else if (score >= 35) level = 'medium';
      else level = 'low';

      // Metafield: risk skorunu Shopify sipariş notuna yaz
      try {
        fetch(`https://${cleanShop}/admin/api/2024-01/orders/${order.id}/metafields.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopifyToken
          },
          body: JSON.stringify({
            metafield: {
              namespace: 'bely_ai',
              key: 'risk_score',
              value: JSON.stringify({
                score, level,
                risks: risks.slice(0, 3),
                scanned_at: new Date().toISOString()
              }),
              type: 'json'
            }
          })
        }).catch(() => {});
      } catch(e) { /* sessizce geç */ }

      const baseOrder = {
        id: order.id,
        order_number: order.order_number,
        total_price: order.total_price,
        country: order.shipping_address?.country || null,
        created_at: order.created_at,
        risk: {
          score, level,
          risks: accessLevel === 'trial' ? [] : risks
        },
        details: null
      };

      if (accessLevel === 'pro') {
        baseOrder.risk.risks = risks;
      }

      if (accessLevel === 'elite' || accessLevel === 'agency') {
        baseOrder.risk.risks = risks;
        baseOrder.details = {
          customerName: order.customer
            ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || '—'
            : 'Misafir',
          customerEmail:     order.customer?.email || null,
          accountAgeDays:    order.customer?.created_at
            ? Math.floor((Date.now() - new Date(order.customer.created_at)) / 86400000)
            : null,
          totalOrders:       order.customer?.orders_count ?? 0,
          billingCountry:    order.billing_address?.country || null,
          shippingCountry:   order.shipping_address?.country || null,
          billingCity:       order.billing_address?.city || null,
          shippingCity:      order.shipping_address?.city || null,
          financialStatus:   order.financial_status || null,
          fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
          gateway:           order.gateway || 'bilinmiyor',
          totalPrice:        price
        };
      }

      return baseOrder;
    });

    return res.status(200).json({
      orders: scoredOrders,
      _plan: plan,
      _limit: limit,
      _access: accessLevel,
      _chargebackRate: chargebackRate
    });

  } catch (e) {
    console.error('[shopify-orders] Error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
