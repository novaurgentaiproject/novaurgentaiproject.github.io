// Nova premium server: a small Cloudflare Worker that confirms Nova Premium
// memberships for the Nova website.
//
// How buying works: Nova's Upgrade button opens your Stripe Payment Link. After
// paying, Stripe sends the buyer back to Nova as ?premium={CHECKOUT_SESSION_ID}.
// Nova sends that ID here, and this server asks Stripe whether it was paid (and,
// for a subscription, whether it is still active). The ID then works as the
// buyer's Premium key on any device. Your Stripe key stays on this server.
//
// Environment (Workers → your worker → Settings → Variables and Secrets):
//   STRIPE_SECRET_KEY    (secret) a Stripe restricted key (rk_live_…) or secret
//                        key (sk_live_…). See README.md for the permissions.
//   STRIPE_PAYMENT_LINK  the Payment Link people buy Premium with: its ID
//                        (plink_…) or its address (https://buy.stripe.com/…).
//                        Only purchases made through it unlock Premium.
//   PREMIUM_CODES        (secret, optional) comma-separated gift codes that
//                        unlock Premium. Remove a code to switch it off.
//   ALLOWED_ORIGINS      (optional) comma-separated sites allowed to use this
//                        server. Defaults to the Nova site plus localhost.

const DEFAULT_ORIGINS = [
  'https://novaurgentaiproject.github.io',
  'http://localhost:8000',
  'http://localhost:8765',
  'http://127.0.0.1:8000',
];
const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
// past_due: Stripe is still retrying the card, so keep Premium until it gives up.
const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const CACHE_MS = 5 * 60e3;

let linkCache = null;
let planCache = null;

class StripeError extends Error {}

async function stripe(env, path, { method = 'GET', form } = {}) {
  let res;
  try {
    res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form) : undefined,
    });
  } catch {
    throw Object.assign(new StripeError("Couldn't reach Stripe."), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new StripeError(data?.error?.message || `Stripe returned an error (${res.status}).`), { status: res.status, code: data?.error?.code });
  return data;
}

const linkRef = (env) => String(env.STRIPE_PAYMENT_LINK || '').trim();

/** The Payment Link object for STRIPE_PAYMENT_LINK (an ID or a buy.stripe.com address). */
async function paymentLink(env) {
  const ref = linkRef(env);
  if (!ref || !env.STRIPE_SECRET_KEY) return null;
  if (linkCache?.ref === ref && Date.now() - linkCache.at < CACHE_MS) return linkCache.link;
  let link = null;
  if (ref.startsWith('plink_')) {
    link = await stripe(env, `payment_links/${encodeURIComponent(ref)}`);
  } else {
    const want = ref.replace(/\/+$/, '');
    let after = '';
    for (let page = 0; page < 10 && !link; page++) {
      const list = await stripe(env, `payment_links?limit=100${after ? `&starting_after=${after}` : ''}`);
      link = list.data.find((l) => String(l.url).replace(/\/+$/, '') === want) || null;
      if (!list.has_more || !list.data.length) break;
      after = list.data[list.data.length - 1].id;
    }
  }
  linkCache = { ref, at: Date.now(), link };
  return link;
}

/** Price and checkout address, for Nova's Upgrade screen. */
async function plan(env) {
  if (!env.STRIPE_SECRET_KEY || !linkRef(env)) return { available: false, reason: 'not-configured' };
  if (planCache?.ref === linkRef(env) && Date.now() - planCache.at < CACHE_MS) return planCache.plan;
  const link = await paymentLink(env);
  let result;
  if (!link) result = { available: false, reason: 'link-not-found' };
  else if (!link.active) result = { available: false, reason: 'inactive' };
  else {
    const items = await stripe(env, `payment_links/${link.id}/line_items?limit=1`);
    const item = items.data?.[0] || {};
    const price = item.price || {};
    result = {
      available: true,
      url: link.url,
      amount: price.unit_amount ?? null,
      currency: price.currency || item.currency || null,
      interval: price.recurring?.interval || null,
      intervalCount: price.recurring?.interval_count || 1,
      trialDays: link.subscription_data?.trial_period_days || null,
    };
  }
  planCache = { ref: linkRef(env), at: Date.now(), plan: result };
  return result;
}

const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/** Is this Premium key (a checkout session ID or a gift code) good right now? */
async function verify(env, rawKey) {
  const key = String(rawKey || '').trim();
  if (SESSION_ID.test(key)) {
    if (!env.STRIPE_SECRET_KEY) return { premium: false, reason: 'not-found' };
    let s;
    try {
      s = await stripe(env, `checkout/sessions/${key}?expand[]=subscription`);
    } catch (e) {
      if (e.status === 404 || e.code === 'resource_missing') return { premium: false, reason: 'not-found' };
      throw e;
    }
    const link = await paymentLink(env).catch(() => null);
    const linkId = link?.id || (linkRef(env).startsWith('plink_') ? linkRef(env) : null);
    if (linkId && s.payment_link !== linkId) return { premium: false, reason: 'other-product' };
    if (s.status !== 'complete' || !['paid', 'no_payment_required'].includes(s.payment_status)) return { premium: false, reason: 'unpaid' };

    if (s.mode === 'subscription') {
      let sub = s.subscription;
      if (typeof sub === 'string') sub = await stripe(env, `subscriptions/${sub}`);
      if (!sub) return { premium: false, reason: 'not-found' };
      if (!ACTIVE.has(sub.status)) return { premium: false, reason: sub.status === 'paused' ? 'paused' : ['incomplete', 'unpaid'].includes(sub.status) ? 'unpaid' : 'ended' };
      const item = sub.items?.data?.[0];
      // Newer Stripe API versions keep the period on the subscription item.
      const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
      const endsAt = sub.cancel_at || (sub.cancel_at_period_end ? periodEnd : null);
      return {
        premium: true, kind: 'stripe', status: sub.status,
        interval: item?.price?.recurring?.interval || 'month',
        intervalCount: item?.price?.recurring?.interval_count || 1,
        renews: !endsAt && periodEnd ? periodEnd * 1000 : null,
        endsAt: endsAt ? endsAt * 1000 : null,
      };
    }

    // One-time purchase: Premium for good, unless it was refunded.
    if (s.payment_intent) {
      try {
        const pi = await stripe(env, `payment_intents/${s.payment_intent}?expand[]=latest_charge`);
        if (pi.latest_charge?.refunded) return { premium: false, reason: 'refunded' };
      } catch { /* the key can't read payments, so skip the refund check */ }
    }
    return { premium: true, kind: 'stripe', status: 'paid', interval: null };
  }

  const n = norm(key);
  const codes = String(env.PREMIUM_CODES || '').split(',').map(norm).filter((c) => c.length >= 6);
  if (n && codes.some((c) => safeEqual(c, n))) return { premium: true, kind: 'gift', status: 'active', interval: null };
  return { premium: false, reason: 'invalid' };
}

/** A Stripe customer-portal link where a member can change their plan, update their card or cancel. */
async function portal(env, key, returnUrl, origins, origin) {
  if (!SESSION_ID.test(String(key || ''))) return [400, { message: 'Only memberships bought through Stripe have a subscription page.' }];
  const s = await stripe(env, `checkout/sessions/${key}`);
  if (!s.customer) return [400, { message: "This purchase doesn't have a customer record in Stripe." }];
  let ret = origin || origins.find((o) => o.startsWith('https://')) || DEFAULT_ORIGINS[0];
  try {
    const u = new URL(returnUrl);
    if (origins.includes(u.origin) || origins.includes('*')) ret = u.href;
  } catch { /* keep the default */ }
  const ps = await stripe(env, 'billing_portal/sessions', { method: 'POST', form: { customer: s.customer, return_url: ret } });
  return [200, { url: ps.url }];
}

/** Setup checks shown on the health page, so problems are easy to spot. */
async function setupProblems(env) {
  const problems = [];
  if (!env.STRIPE_SECRET_KEY) problems.push('Add STRIPE_SECRET_KEY (a secret) under Settings → Variables and Secrets.');
  if (!linkRef(env)) problems.push('Add STRIPE_PAYMENT_LINK: your Payment Link\'s ID (plink_…) or address (https://buy.stripe.com/…).');
  if (problems.length) return problems;
  try {
    const link = await paymentLink(env);
    if (!link) problems.push("Couldn't find that Payment Link in your Stripe account. Check STRIPE_PAYMENT_LINK, and that the key is from the same account and mode (live or test).");
    else {
      if (!link.active) problems.push('The Payment Link is deactivated in Stripe.');
      const redirect = link.after_completion?.type === 'redirect' ? decodeURIComponent(link.after_completion.redirect?.url || '') : '';
      if (!/[?&]premium=\{CHECKOUT_SESSION_ID\}/.test(redirect)) {
        problems.push(`After payment, the Payment Link must redirect to your Nova site with ?premium={CHECKOUT_SESSION_ID}, e.g. ${DEFAULT_ORIGINS[0]}/?premium={CHECKOUT_SESSION_ID}`);
      }
    }
  } catch (e) {
    problems.push(e.status === 401 ? 'Stripe rejected STRIPE_SECRET_KEY.' : e.status === 403 ? `The Stripe key is missing a permission: ${e.message}` : e.message);
  }
  return problems;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
    const originOk = origins.includes('*') || origins.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // Health check: open to everyone (it reveals nothing secret), so you can visit it in a browser.
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      const key = String(env.STRIPE_SECRET_KEY || '');
      const problems = await setupProblems(env);
      return json(200, {
        service: 'nova-premium', ok: !problems.length,
        stripe: !!key, mode: /^(sk|rk)_live_/.test(key) ? 'live' : /^(sk|rk)_test_/.test(key) ? 'test' : null,
        paymentLink: !!linkRef(env),
        codes: String(env.PREMIUM_CODES || '').split(',').map(norm).filter((c) => c.length >= 6).length,
        originAllowed: !origin || originOk,
        problems,
      }, { 'Access-Control-Allow-Origin': origin || '*' });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json(403, { message: `This premium server doesn't accept requests from ${origin || 'unknown sites'}. Add it to ALLOWED_ORIGINS.` });

    try {
      if (request.method === 'GET' && path === '/v1/plan') return json(200, await plan(env));
      if (request.method === 'POST' && (path === '/v1/verify' || path === '/v1/portal')) {
        let body;
        try { body = await request.json(); } catch { return json(400, { message: 'Expected a JSON body.' }); }
        if (String(body?.key || '').length > 300) return json(400, { message: 'That key is too long.' });
        if (path === '/v1/verify') return json(200, await verify(env, body?.key));
        const [status, data] = await portal(env, body?.key, body?.returnUrl, origins, origin);
        return json(status, data);
      }
    } catch (e) {
      if (e instanceof StripeError) return json(502, { message: e.status === 401 ? "The premium server's Stripe key was rejected." : `Stripe: ${e.message}` });
      return json(500, { message: 'The premium server hit an unexpected error.' });
    }
    return json(404, { message: 'Not found. Use GET /v1/plan, POST /v1/verify or POST /v1/portal.' });
  },
};
