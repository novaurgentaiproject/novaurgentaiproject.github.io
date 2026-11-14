// Nova premium server: a small Cloudflare Worker that sells and serves Nova
// Premium for the Nova website.
//
// How buying works: Nova's Upgrade button opens your Stripe Payment Link. After
// paying, Stripe sends the buyer back to Nova as ?premium={CHECKOUT_SESSION_ID}.
// Nova sends that ID here, and this server asks Stripe whether it was paid (and,
// for a subscription, whether it is still active). The ID then works as the
// buyer's Premium key on any device. Your Stripe key stays on this server.
//
// Martia included: members chat with Nova 3 Martia through this server, which
// calls Claude with YOUR Anthropic API key, so they don't need a key of their
// own. Each member gets a monthly AI allowance (MONTHLY_AI_BUDGET, in US dollars
// of Claude usage). The server counts every request's tokens before sending it,
// holds the most it could cost, and charges the member's allowance what it really
// cost once it finishes. Allowances live in a Durable Object (one per member).
//
// James's voice for everyone: Nova talks in James's voice (Fish Audio
// text-to-speech) and hears people through Fish Audio speech-to-text, with YOUR
// Fish Audio key. Daily limits (per visitor, and for the whole site) cap what
// that can cost you; past them, Nova uses the device's own voice until tomorrow.
//
// Environment (Workers → your worker → Settings → Variables and Secrets):
//   STRIPE_SECRET_KEY    (secret) a Stripe restricted key (rk_live_…) or secret
//                        key (sk_live_…). See README.md for the permissions.
//   STRIPE_PAYMENT_LINK  the Payment Link people buy Premium with: its ID
//                        (plink_…) or its address (https://buy.stripe.com/…).
//                        Only purchases made through it unlock Premium.
//   ANTHROPIC_API_KEY    (secret) your Claude API key, used for members' Martia
//                        chats. Without it, Premium only unlocks Martia for
//                        people who bring their own key.
//   FISH_API_KEY         (secret) your Fish Audio API key, for James's voice.
//                        Without it, Nova uses each device's own voice.
//   FISH_PAID            (optional) "true" to use Fish Audio's paid voice model
//                        and Fish Audio listening, billed to your Fish credit.
//                        Otherwise (the default) James uses the free model and
//                        Nova listens with the device's own speech recognition,
//                        so voice never costs you anything.
//   VOICE_DAILY_PER_VISITOR  (optional) most one visitor's voice use can cost per
//                        day, in US dollars. Default 0.50. 0 = no limit.
//   VOICE_DAILY_TOTAL    (optional) most everyone's voice use together can cost
//                        per day, in US dollars. Default 5.00. 0 = no limit.
//   MONTHLY_AI_BUDGET    (optional) each member's monthly Claude allowance in US
//                        dollars. Default 4.70.
//   TEST_MODE_BUDGET     (optional) the monthly Claude allowance for purchases
//                        made while STRIPE_SECRET_KEY is a test key. Default 0.50.
//                        (In test mode, the Upgrade button only shows to people
//                        who open Nova with ?preview=premium, i.e. you.)
//   PREMIUM_CODES        (secret, optional) comma-separated gift codes that
//                        unlock Premium. Remove a code to switch it off.
//   ALLOWED_ORIGINS      (optional) comma-separated sites allowed to use this
//                        server. Defaults to the Nova site plus localhost.
// Binding (in wrangler.toml): USAGE, the MemberUsage Durable Object.

import Anthropic from '@anthropic-ai/sdk';
import { DurableObject } from 'cloudflare:workers';

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

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------
class StripeError extends Error {}

async function stripe(env, path, { method = 'GET', form } = {}) {
  let res;
  try {
    res = await fetch(`${env.STRIPE_API_BASE || 'https://api.stripe.com'}/v1/${path}`, {
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
const stripeTestMode = (env) => /^(sk|rk)_test_/.test(String(env.STRIPE_SECRET_KEY || ''));

async function plan(env, { preview = false } = {}) {
  const ai = aiInfo(env);
  const voice = await voiceInfo(env);
  if (!env.STRIPE_SECRET_KEY || !linkRef(env)) return { available: false, reason: 'not-configured', ai, voice };
  // Test mode: anyone could "pay" with Stripe's public test card, so only show the
  // plan to the site owner (who opens Nova with ?preview=premium).
  if (stripeTestMode(env) && !preview) return { available: false, reason: 'test-mode', ai, voice };
  // Premium's main feature is Martia's answers; don't sell it until they're included.
  if (!aiEnabled(env)) return { available: false, reason: 'martia-not-ready', ai, voice };
  if (planCache?.ref === linkRef(env) && Date.now() - planCache.at < CACHE_MS) return { ...planCache.plan, ai, voice, ...(stripeTestMode(env) ? { testMode: true } : {}) };
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
  return { ...result, ai, voice, ...(stripeTestMode(env) ? { testMode: true } : {}) };
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
      const periodStart = sub.current_period_start ?? item?.current_period_start ?? null;
      const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
      const endsAt = sub.cancel_at || (sub.cancel_at_period_end ? periodEnd : null);
      return {
        premium: true, kind: 'stripe', status: sub.status,
        interval: item?.price?.recurring?.interval || 'month',
        intervalCount: item?.price?.recurring?.interval_count || 1,
        renews: !endsAt && periodEnd ? periodEnd * 1000 : null,
        endsAt: endsAt ? endsAt * 1000 : null,
        periodStart: periodStart ? periodStart * 1000 : null,
        periodEnd: periodEnd ? periodEnd * 1000 : null,
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

// ---------------------------------------------------------------------------
// Martia included: members' allowance
// ---------------------------------------------------------------------------
/** The Claude model behind Nova 3 Martia for members. */
const MARTIA_MODEL = 'claude-opus-5-5';
const MARTIA_NAME = 'Nova 3 Martia';
const MAX_OUTPUT_TOKENS = 20000; // per reply, so one answer can't eat a big part of the month
const MAX_INPUT_TOKENS = 100000; // per request (the conversation so far plus attachments)
const MIN_OUTPUT_TOKENS = 1024; // below this a reply isn't worth starting
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);
const MEMBER_RECHECK_MS = 10 * 60e3; // re-confirm a member with Stripe this often while they chat
const HOLD_EXPIRY_MS = 15 * 60e3; // a hold not settled by then is charged in full

// US dollars per million tokens. A refusal fallback can finish a reply on another
// model, so holds assume the most expensive model a fallback might use.
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
};
const PRICE_UNKNOWN = { input: 5, output: 25, cacheRead: 0.5 };
const HOLD_INPUT = PRICE_UNKNOWN.input * 1.25; // worst case: every input token written to the cache
const HOLD_OUTPUT = PRICE_UNKNOWN.output;
// Amounts are kept in micro-dollars: a price in $ per million tokens is µ$ per token.

const aiEnabled = (env) => !!(env.ANTHROPIC_API_KEY && env.USAGE);
function monthlyBudget(env) {
  const n = Number.parseFloat(env.MONTHLY_AI_BUDGET);
  return Number.isFinite(n) && n >= 0 ? n : 4.7;
}
function aiInfo(env) {
  return aiEnabled(env) ? { included: true, model: MARTIA_NAME, monthlyBudget: monthlyBudget(env) } : { included: false };
}

/** Cost in µ$ of a usage object (one attempt) on a model. */
function usageCost(u, model) {
  if (!u) return 0;
  const p = PRICES[model] || PRICE_UNKNOWN;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens || 0;
  const writeAll = u.cache_creation_input_tokens || 0;
  const write5m = Math.max(0, writeAll - write1h);
  return (u.input_tokens || 0) * p.input
    + write5m * p.input * 1.25
    + write1h * p.input * 2
    + (u.cache_read_input_tokens || 0) * p.cacheRead
    + (u.output_tokens || 0) * p.output;
}

/** Cost in µ$ of a whole reply. usage.iterations, when present, has every attempt (including fallbacks). */
function replyCost(usage, model) {
  const its = Array.isArray(usage?.iterations) ? usage.iterations : [];
  if (its.length) return Math.ceil(its.reduce((sum, it) => sum + usageCost(it, it.model || model), 0));
  return Math.ceil(usageCost(usage, model));
}

/** The monthly Claude allowance for purchases made in Stripe's test mode, in dollars. */
function testModeBudget(env) {
  const n = Number.parseFloat(env.TEST_MODE_BUDGET);
  return Number.isFinite(n) && n >= 0 ? n : 0.5;
}

/** The member's current allowance period: their billing period, or the calendar month. */
function periodFor(env, m) {
  // Purchases made with a Stripe test key get only a small allowance: test
  // payments cost nothing, but their Martia replies spend real Claude credit.
  const perMonth = (m.kind === 'stripe' && stripeTestMode(env) ? Math.min(testModeBudget(env), monthlyBudget(env)) : monthlyBudget(env)) * 1e6;
  if (m.kind === 'stripe' && m.periodStart && m.periodEnd) {
    const months = { day: 1 / 30, week: 7 / 30, month: 1, year: 12 }[m.interval] ?? 1;
    return { id: `p${m.periodStart}`, resetsAt: m.periodEnd, budget: Math.round(perMonth * months * (m.intervalCount || 1)) };
  }
  const now = new Date();
  return {
    id: `m${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
    resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    budget: Math.round(perMonth),
  };
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** One allowance per Premium key (a gift code's members share it). */
async function memberId(rawKey) {
  const key = String(rawKey || '').trim();
  return sha256hex(SESSION_ID.test(key) ? key : `code:${norm(key)}`);
}

/**
 * One member's allowance and membership check. A Durable Object handles one
 * request at a time, so two replies started together can't both spend the same
 * money.
 */
export class MemberUsage extends DurableObject {
  async #load() {
    this.s ??= (await this.ctx.storage.get('s')) || { period: null, spent: 0, holds: {}, member: null };
    return this.s;
  }
  async #save() { await this.ctx.storage.put('s', this.s); }
  #roll(s, period) {
    if (s.period !== period.id) { s.period = period.id; s.spent = 0; s.holds = {}; }
    const now = Date.now();
    for (const [id, hd] of Object.entries(s.holds)) {
      if (now - hd.at > HOLD_EXPIRY_MS) { s.spent += hd.amount; delete s.holds[id]; }
    }
  }
  #held(s) { return Object.values(s.holds).reduce((a, hd) => a + hd.amount, 0); }

  async member() { return (await this.#load()).member; }
  async setMember(member) { const s = await this.#load(); s.member = member; await this.#save(); }

  async usage(period) {
    const s = await this.#load();
    this.#roll(s, period);
    await this.#save();
    return { spent: s.spent, held: this.#held(s), budget: period.budget, resetsAt: period.resetsAt };
  }

  /**
   * Reserve money for one reply. `inputCost` is what the request's input can cost;
   * the rest of the hold pays for up to `maxOutput` tokens at `outputPrice`.
   */
  async hold(period, { inputCost, maxOutput, outputPrice, minOutput, maxHolds = 8 }) {
    const s = await this.#load();
    this.#roll(s, period);
    if (Object.keys(s.holds).length >= maxHolds) { await this.#save(); return { ok: false, reason: 'busy' }; }
    const left = period.budget - s.spent - this.#held(s);
    const outTokens = Math.min(maxOutput, Math.floor((left - inputCost) / outputPrice));
    if (outTokens < minOutput) { await this.#save(); return { ok: false, reason: 'allowance', left: Math.max(0, left) }; }
    const id = crypto.randomUUID();
    const amount = Math.ceil(inputCost + outTokens * outputPrice);
    s.holds[id] = { amount, at: Date.now() };
    await this.#save();
    return { ok: true, id, maxTokens: outTokens };
  }

  /** Swap a hold for what the reply really cost. */
  async settle(period, id, cost) {
    const s = await this.#load();
    const hd = s.holds[id];
    if (hd) delete s.holds[id];
    if (s.period === period.id) s.spent += Math.max(0, Math.ceil(cost));
    await this.#save();
    return { spent: s.spent };
  }
}

const stub = (env, id) => env.USAGE.get(env.USAGE.idFromName(id));

/** The data of the first (or last) `name` event in a piece of a server-sent event stream. */
function findEvent(text, name, first = false) {
  const tag = `event: ${name}`;
  const i = first ? text.indexOf(tag) : text.lastIndexOf(tag);
  if (i < 0) return null;
  const d = text.indexOf('data:', i);
  const end = d < 0 ? -1 : text.indexOf('\n', d);
  if (end < 0) return null;
  try { return JSON.parse(text.slice(d + 5, end).trim()); } catch { return null; }
}

/** Confirm a member, using the Durable Object's recent answer while they chat. */
async function memberFor(env, key) {
  const id = await memberId(key);
  const usage = stub(env, id);
  const cached = await usage.member();
  if (cached && Date.now() - cached.at < MEMBER_RECHECK_MS) return { id, usage, member: cached.result };
  let result;
  try {
    result = await verify(env, key);
  } catch (e) {
    // Stripe is unreachable: keep serving a member confirmed in the last hour.
    if (cached?.result?.premium && Date.now() - cached.at < 3600e3) return { id, usage, member: cached.result };
    throw e;
  }
  await usage.setMember({ at: Date.now(), result });
  return { id, usage, member: result };
}

const dollars = (micros) => Math.round(micros) / 1e6;
function usageReport(u) {
  const left = Math.max(0, u.budget - u.spent - u.held);
  return {
    included: true, model: MARTIA_NAME,
    budget: dollars(u.budget), spent: dollars(u.spent + u.held), left: dollars(left),
    fraction: u.budget > 0 ? Math.min(1, (u.spent + u.held) / u.budget) : 1,
    resetsAt: u.resetsAt,
  };
}

const MEMBER_REASONS = {
  invalid: "That Premium key isn't valid.",
  'not-found': "Nova couldn't find that purchase.",
  unpaid: "That payment hasn't gone through yet.",
  ended: 'Your Premium membership has ended.',
  paused: 'Your Premium membership is paused.',
  refunded: 'That purchase was refunded.',
  'other-product': "That purchase isn't for Nova Premium.",
};

// Errors for the chat route use Claude's error shape, so the Claude SDK in the
// browser reads them like any other API error. All are 4xx so it doesn't retry.
const apiError = (status, type, message, extra = {}) => [status, { type: 'error', error: { type, message, ...extra } }];

/** POST /ai/v1/messages: a member's Martia reply, streamed in Claude's format. */
async function martia(request, env, ctx, headers) {
  const send = ([status, body]) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!aiEnabled(env)) return send(apiError(400, 'not_configured', "Martia isn't included with Premium on this server yet. Connect your own Claude key in Settings → Engine, or try again later."));
  // The member's Premium key arrives where the Claude SDK puts an API key: in
  // x-api-key or, in newer SDK versions, as an Authorization bearer token.
  const key = request.headers.get('x-api-key') || /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '';
  if (!key || key.length > 300) return send(apiError(401, 'authentication_error', 'Add your Premium key in Settings → Premium.'));

  const size = Number(request.headers.get('content-length') || 0);
  if (size > MAX_BODY_BYTES) return send(apiError(413, 'request_too_large', 'This conversation is too big for Martia. Start a new chat, or remove some attachments.'));
  let body;
  try { body = JSON.parse(await request.text()); } catch { return send(apiError(400, 'invalid_request_error', 'Expected a JSON body.')); }
  if (!Array.isArray(body?.messages) || !body.messages.length || body.messages.length > 500) return send(apiError(400, 'invalid_request_error', 'Expected a list of messages.'));
  if (body.system != null && typeof body.system !== 'string' && !Array.isArray(body.system)) return send(apiError(400, 'invalid_request_error', 'Expected a text system prompt.'));

  let who;
  try { who = await memberFor(env, key); } catch { return send(apiError(400, 'premium_check_failed', "Nova couldn't confirm your Premium membership right now. Try again in a minute.")); }
  if (!who.member?.premium) return send(apiError(403, 'permission_error', `${MEMBER_REASONS[who.member?.reason] || MEMBER_REASONS.ended} Martia isn't included any more.`, { reason: who.member?.reason || 'ended' }));
  const period = periodFor(env, who.member);

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1 });
  const effort = body.output_config?.effort === 'max' ? 'xhigh' : EFFORTS.has(body.output_config?.effort) ? body.output_config.effort : 'high';
  const params = {
    model: MARTIA_MODEL,
    system: body.system ?? undefined,
    messages: body.messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort },
    // Cache the conversation so each new message only pays full price for what's new.
    cache_control: { type: 'ephemeral' },
    metadata: { user_id: who.id.slice(0, 32) },
  };

  // Count the input first (free), so the hold covers the whole request.
  let inputTokens;
  try {
    const c = await anthropic.messages.countTokens({ model: params.model, system: params.system, messages: params.messages, thinking: { type: 'adaptive' } });
    inputTokens = c.input_tokens;
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) return send(apiError(400, 'invalid_request_error', e.error?.error?.message || 'Claude rejected this message.'));
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return send(apiError(400, 'not_configured', "Martia isn't available right now: the server's Claude key was rejected."));
    if (e instanceof Anthropic.RateLimitError) return send(apiError(429, 'rate_limit_error', 'Martia is busy right now. Try again in a moment.'));
    return send(apiError(400, 'overloaded', "Couldn't reach Claude right now. Try again in a moment."));
  }
  if (inputTokens > MAX_INPUT_TOKENS) return send(apiError(413, 'request_too_large', 'This conversation is too long for Martia. Start a new chat to keep going.'));

  const hold = await who.usage.hold(period, { inputCost: inputTokens * HOLD_INPUT, maxOutput: MAX_OUTPUT_TOKENS, outputPrice: HOLD_OUTPUT, minOutput: MIN_OUTPUT_TOKENS });
  if (!hold.ok) {
    if (hold.reason === 'busy') return send(apiError(400, 'busy', 'Martia is already answering on your other devices. Wait for those replies to finish.'));
    return send(apiError(402, 'allowance_exhausted', "You've used this month's Martia allowance.", { resets_at: period.resetsAt }));
  }
  params.max_tokens = hold.maxTokens;

  let settled = false;
  const settle = (cost) => {
    if (settled) return Promise.resolve();
    settled = true;
    return who.usage.settle(period, hold.id, cost).catch(() => {});
  };

  const abort = new AbortController();
  let upstream;
  try {
    // asResponse(): the SDK makes the call (and raises typed errors), but hands back
    // the raw event stream, which is passed on byte for byte. Parsing every event
    // here would cost more CPU time than a Worker gets.
    upstream = await anthropic.beta.messages.create(
      { ...params, stream: true, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
      { signal: abort.signal },
    ).asResponse();
  } catch (e) {
    ctx.waitUntil(settle(0)); // nothing was generated
    if (e instanceof Anthropic.RateLimitError) return send(apiError(429, 'rate_limit_error', 'Martia is busy right now. Try again in a moment.'));
    if (e instanceof Anthropic.BadRequestError) return send(apiError(400, 'invalid_request_error', e.error?.error?.message || 'Claude rejected this message.'));
    if (e instanceof Anthropic.APIError && e.status >= 500) return send(apiError(400, 'overloaded', 'Claude is overloaded right now. Try again in a moment.'));
    return send(apiError(400, 'api_error', "Couldn't reach Claude right now. Try again in a moment."));
  }

  // Pass Claude's event stream straight through. Usage is read from the first
  // event (message_start: input tokens and model) and the last ones
  // (message_delta: final counts, including any fallback attempts). If the person
  // stops the reply (or leaves), writing fails and the request to Claude is
  // cancelled too.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const MARK = 'event: content_block_delta';
  const pump = async () => {
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let head = '';
    let tail = '';
    let carry = '';
    let deltas = 0;
    let broken = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        const text = dec.decode(value, { stream: true });
        if (head.length < 16384) head += text.slice(0, 16384 - head.length);
        tail = (tail + text).slice(-32768);
        const scan = carry + text;
        for (let i = scan.indexOf(MARK); i !== -1; i = scan.indexOf(MARK, i + MARK.length)) deltas++;
        carry = scan.slice(-(MARK.length - 1));
      }
    } catch {
      broken = true;
      abort.abort();
      reader.cancel().catch(() => {});
    } finally {
      const start = findEvent(head, 'message_start', true);
      const delta = findEvent(tail, 'message_delta');
      const model = start?.message?.model || MARTIA_MODEL;
      let usage = { ...(start?.message?.usage || { input_tokens: inputTokens }) };
      for (const [k, v] of Object.entries(delta?.usage || {})) if (v != null) usage[k] = v;
      const finished = !broken && !!delta && /event: message_stop/.test(tail);
      if (!finished) {
        // Cut short: Claude's final token count never arrived. Estimate the output
        // from the pieces streamed so far (thinking runs longer than its summary).
        usage = { ...usage, iterations: null, output_tokens: Math.min(params.max_tokens, Math.max(usage.output_tokens || 0, 500, deltas * 4)) };
      }
      await settle(replyCost(usage, model));
      await writer.close().catch(() => {});
    }
  };
  ctx.waitUntil(pump());
  return new Response(readable, { status: 200, headers: { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
}

/** POST /v1/usage: how much of this month's Martia allowance a member has left. */
async function memberUsage(env, key) {
  if (!aiEnabled(env)) return [200, { included: false }];
  const who = await memberFor(env, key);
  if (!who.member?.premium) return [403, { message: MEMBER_REASONS[who.member?.reason] || MEMBER_REASONS.ended, reason: who.member?.reason || 'ended' }];
  return [200, usageReport(await who.usage.usage(periodFor(env, who.member)))];
}

// ---------------------------------------------------------------------------
// James's voice for everyone (Fish Audio)
// ---------------------------------------------------------------------------
const JAMES = '802e3bc2b27e49c2995d23ef70e6ac89';
const FISH_API = 'https://api.fish.audio';
const TTS_MODELS = new Set(['s2.1-pro', 's2-pro', 's1', 's2.1-pro-free']);
const AUDIO_FORMATS = new Set(['mp3', 'wav', 'opus']);
// Fish Audio prices: speech in $ per million UTF-8 bytes of text (µ$ per byte),
// listening $0.36 per audio hour (100 µ$ per second, rounded up to the second).
const TTS_PRICE = { 's2.1-pro': 15, 's2-pro': 15, s1: 15, 's2.1-pro-free': 0 };
const ASR_PRICE_PER_SECOND = 100;
const MAX_TTS_CHARS = 1500;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const voiceEnabled = (env) => !!(env.FISH_API_KEY && env.USAGE);

// Your Fish Audio API credit, checked at most every 10 minutes. With none, James
// talks on the free model and Nova listens with the device's own recognition
// (Fish Audio has no free listening model).
let fishCredit = null; // { at, credit } — credit is null when it couldn't be read
const fishPaid = (env) => String(env.FISH_PAID || '').trim().toLowerCase() === 'true';
async function fishHasCredit(env) {
  if (!fishPaid(env)) return false; // free only: never spend Fish Audio credit
  if (fishCredit && Date.now() - fishCredit.at < 10 * 60e3) return fishCredit.credit == null ? true : fishCredit.credit > 0;
  let credit = null;
  try {
    const res = await fetch(`${env.FISH_API_BASE || FISH_API}/wallet/self/api-credit`, { headers: { Authorization: `Bearer ${env.FISH_API_KEY}` } });
    if (res.ok) {
      const n = Number.parseFloat((await res.json())?.credit);
      if (Number.isFinite(n)) credit = n;
    }
  } catch { /* unknown: assume there is credit, and fall back on a 402 */ }
  fishCredit = { at: Date.now(), credit };
  return credit == null ? true : credit > 0;
}
const noteNoFishCredit = () => { fishCredit = { at: Date.now(), credit: 0 }; };
function dollarsSetting(v, fallback) {
  if (v == null || String(v).trim() === '') return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const visitorDaily = (env) => dollarsSetting(env.VOICE_DAILY_PER_VISITOR, 0.5);
const siteDaily = (env) => dollarsSetting(env.VOICE_DAILY_TOTAL, 5);
async function voiceInfo(env) {
  if (!voiceEnabled(env)) return { included: false };
  const paid = await fishHasCredit(env);
  return { included: true, everyone: true, name: 'James', paid: fishPaid(env), listening: paid, model: paid ? 's2.1-pro' : 's2.1-pro-free', dailyPerVisitor: visitorDaily(env), dailyTotal: siteDaily(env) };
}

/** Today (UTC) as an allowance period, with a budget in µ$ (0 dollars = no limit). */
function voiceDay(dollars) {
  const now = new Date();
  return {
    id: `d${now.toISOString().slice(0, 10)}`,
    resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    budget: dollars > 0 ? Math.round(dollars * 1e6) : Number.MAX_SAFE_INTEGER,
  };
}

/** Reserve `cost` (µ$) against today's limits: this visitor's and the whole site's. */
async function voiceHold(env, request, cost) {
  // Cloudflare sets CF-Connecting-IP itself, so visitors can't fake it.
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
  const site = { usage: stub(env, 'voice:site'), period: voiceDay(siteDaily(env)) };
  const visitor = { usage: stub(env, `voice:${(await sha256hex(`ip:${ip}`)).slice(0, 32)}`), period: voiceDay(visitorDaily(env)) };
  const a = await site.usage.hold(site.period, { inputCost: cost, maxOutput: 0, outputPrice: 1, minOutput: 0, maxHolds: 500 });
  if (!a.ok) return { ok: false, reason: a.reason === 'busy' ? 'busy' : 'site', resetsAt: site.period.resetsAt };
  const b = await visitor.usage.hold(visitor.period, { inputCost: cost, maxOutput: 0, outputPrice: 1, minOutput: 0, maxHolds: 8 });
  if (!b.ok) {
    await site.usage.settle(site.period, a.id, 0);
    return { ok: false, reason: b.reason === 'busy' ? 'busy' : 'visitor', resetsAt: visitor.period.resetsAt };
  }
  return {
    ok: true,
    settle: (c) => Promise.all([site.usage.settle(site.period, a.id, c), visitor.usage.settle(visitor.period, b.id, c)]).catch(() => {}),
  };
}

/** Seconds of audio in a recording: exact for WAV, a generous estimate otherwise. */
function audioSeconds(buf, type) {
  const v = new DataView(buf);
  if (/wav/.test(type) && buf.byteLength > 44 && v.getUint32(0, false) === 0x52494646) { // "RIFF"
    const byteRate = v.getUint32(28, true);
    if (byteRate > 0) return (buf.byteLength - 44) / byteRate;
  }
  return buf.byteLength / 2000; // compressed speech is rarely under 16 kbit/s
}

/** POST /voice/v1/tts and /voice/v1/asr: anyone's speech, on the server's Fish Audio key. */
async function voice(request, env, path, headers) {
  const send = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!voiceEnabled(env)) return send(404, { status: 404, message: "James's voice isn't set up on this server." });
  const refused = (h) => h.reason === 'busy'
    ? send(429, { status: 429, reason: 'busy', message: 'too many voice requests at once' })
    : send(429, { status: 429, reason: 'daily_limit', message: "today's voice limit was reached", resets_at: h.resetsAt });
  const fish = (p, init) => fetch(`${env.FISH_API_BASE || FISH_API}${p}`, { ...init, headers: { Authorization: `Bearer ${env.FISH_API_KEY}`, ...init.headers } });

  if (path === '/voice/v1/asr') {
    if (!(await fishHasCredit(env))) return send(503, { status: 503, reason: fishPaid(env) ? 'no_credit' : 'free_only', message: "listening through Fish Audio isn't available on this site" });
    const type = (request.headers.get('Content-Type') || 'audio/wav').split(';')[0].trim();
    if (!/^audio\/|^video\/|^application\/octet-stream$/.test(type)) return send(415, { status: 415, message: 'Send the recording as the request body with an audio/* Content-Type.' });
    const audio = await request.arrayBuffer();
    if (!audio.byteLength) return send(400, { status: 400, message: 'The recording is empty.' });
    if (audio.byteLength > MAX_AUDIO_BYTES) return send(413, { status: 413, message: 'The recording is too long.' });
    const estimate = Math.ceil(audioSeconds(audio, type)) * ASR_PRICE_PER_SECOND;
    const hold = await voiceHold(env, request, estimate);
    if (!hold.ok) return refused(hold);
    const ext = /wav/.test(type) ? 'wav' : /mpeg|mp3/.test(type) ? 'mp3' : /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /webm/.test(type) ? 'webm' : 'wav';
    const form = new FormData();
    form.append('audio', new Blob([audio], { type }), `speech.${ext}`);
    const lang = (new URL(request.url).searchParams.get('language') || '').toLowerCase();
    if (/^[a-z]{2}$/.test(lang)) form.append('language', lang);
    form.append('ignore_timestamps', 'true');
    let res;
    let data = {};
    try {
      res = await fish('/v1/asr', { method: 'POST', headers: { model: 'transcribe-1' }, body: form });
      data = await res.json().catch(() => ({}));
    } catch {
      await hold.settle(0);
      return send(502, { status: 502, message: "Couldn't reach Fish Audio." });
    }
    // Fish Audio bills the recording's length, rounded up to the second; failed requests are free.
    const seconds = Number(data?.duration) > 0 ? Number(data.duration) : estimate / ASR_PRICE_PER_SECOND;
    await hold.settle(res.ok ? Math.ceil(seconds) * ASR_PRICE_PER_SECOND : 0);
    if (res.status === 402) noteNoFishCredit();
    if (!res.ok) return send(res.status === 402 ? 503 : res.status, { status: res.status, reason: res.status === 402 ? 'no_credit' : undefined, message: res.status === 402 ? "listening through Fish Audio isn't available on this site" : data?.message || `Fish Audio returned an error (${res.status}).` });
    return send(200, data);
  }

  // Text to speech
  let body;
  try { body = await request.json(); } catch { return send(400, { status: 400, message: 'Expected a JSON body.' }); }
  const text = String(body?.text ?? '').trim();
  if (!text) return send(400, { status: 400, message: 'Text is empty.' });
  if (text.length > MAX_TTS_CHARS) return send(413, { status: 413, message: `Text is longer than ${MAX_TTS_CHARS} characters.` });
  const bytes = new TextEncoder().encode(text).length;
  const asked = request.headers.get('model') || '';
  let model = TTS_MODELS.has(asked) ? asked : 's2.1-pro';
  if (model !== 's2.1-pro-free' && !(await fishHasCredit(env))) model = 's2.1-pro-free';
  const hold = await voiceHold(env, request, bytes * TTS_PRICE[model]);
  if (!hold.ok) return refused(hold);
  const speed = Math.min(2, Math.max(0.5, Number(body?.prosody?.speed) || 1));
  const payload = JSON.stringify({
    text,
    reference_id: /^[0-9a-f]{32}$/i.test(String(body?.reference_id || '')) ? String(body.reference_id) : JAMES,
    format: AUDIO_FORMATS.has(body?.format) ? body.format : 'mp3',
    mp3_bitrate: [64, 128, 192].includes(body?.mp3_bitrate) ? body.mp3_bitrate : 128,
    latency: ['low', 'normal', 'balanced'].includes(body?.latency) ? body.latency : 'balanced',
    normalize: body?.normalize !== false,
    prosody: { speed, volume: 0 },
  });
  const speak = (m) => fish('/v1/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', model: m }, body: payload });
  let res;
  try {
    res = await speak(model);
    // Your Fish Audio account ran out of credit: keep talking on the free model.
    if (res.status === 402 && model !== 's2.1-pro-free') { noteNoFishCredit(); model = 's2.1-pro-free'; res = await speak(model); }
  } catch {
    await hold.settle(0);
    return send(502, { status: 502, message: "Couldn't reach Fish Audio." });
  }
  await hold.settle(res.ok ? bytes * TTS_PRICE[model] : 0);
  if (!res.ok) {
    const msg = await res.json().then((d) => d?.message).catch(() => '');
    return send(res.status, { status: res.status, message: msg || `Fish Audio returned an error (${res.status}).` });
  }
  const out = new Headers(headers);
  out.set('Content-Type', res.headers.get('Content-Type') || 'audio/mpeg');
  out.set('Cache-Control', 'no-store');
  out.set('X-Nova-Model', model);
  return new Response(res.body, { status: 200, headers: out });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
let claudeCheck = null;
async function claudeProblem(env) {
  if (!env.ANTHROPIC_API_KEY) return 'Add ANTHROPIC_API_KEY (a secret) so members can chat with Martia without a key of their own.';
  if (!env.USAGE) return 'The USAGE Durable Object binding is missing. Deploy with the wrangler.toml in this folder.';
  if (claudeCheck && Date.now() - claudeCheck.at < CACHE_MS) return claudeCheck.problem;
  let problem = null;
  try {
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 0 });
    await anthropic.messages.countTokens({ model: MARTIA_MODEL, messages: [{ role: 'user', content: 'ping' }] });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) problem = 'Anthropic rejected ANTHROPIC_API_KEY. Create a new key in the Claude Console and update the secret.';
    else if (e instanceof Anthropic.PermissionDeniedError) problem = `The Anthropic key can't use ${MARTIA_MODEL}.`;
    else if (!(e instanceof Anthropic.RateLimitError)) problem = `Couldn't check the Anthropic key: ${e.message}`;
  }
  claudeCheck = { at: Date.now(), problem };
  return problem;
}

/** Setup checks shown on the health page, so problems are easy to spot. */
async function setupProblems(env) {
  const problems = [];
  if (!env.STRIPE_SECRET_KEY) problems.push('Add STRIPE_SECRET_KEY (a secret) under Settings → Variables and Secrets.');
  if (!linkRef(env)) problems.push('Add STRIPE_PAYMENT_LINK: your Payment Link\'s ID (plink_…) or address (https://buy.stripe.com/…).');
  const ai = await claudeProblem(env);
  if (ai) problems.push(ai);
  if (!env.FISH_API_KEY) problems.push("Add FISH_API_KEY (a secret) so everyone hears Nova in James's voice.");
  if (!env.STRIPE_SECRET_KEY || !linkRef(env)) return problems;
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
    const originOk = origins.includes('*') || origins.includes(origin);
    // The Claude SDK sends several of its own headers, so allow what the browser asks for.
    const askHeaders = (request.headers.get('Access-Control-Request-Headers') || '').replace(/[^A-Za-z0-9,\- ]/g, '');
    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': askHeaders || 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

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
        martia: aiEnabled(env) ? { included: true, model: MARTIA_MODEL, monthlyBudget: monthlyBudget(env) } : { included: false },
        voice: await voiceInfo(env),
        codes: String(env.PREMIUM_CODES || '').split(',').map(norm).filter((c) => c.length >= 6).length,
        originAllowed: !origin || originOk,
        problems,
      }, { 'Access-Control-Allow-Origin': origin || '*' });
    }
    // The voice routes' own health check, in the shape of a Nova voice server.
    if (request.method === 'GET' && path === '/voice') {
      const listening = voiceEnabled(env) && await fishHasCredit(env);
      return json(200, { service: 'nova-voice', ok: voiceEnabled(env), features: listening ? ['tts', 'asr'] : ['tts'], serverKey: voiceEnabled(env), voice: JAMES, limits: voiceEnabled(env) ? { perVisitorPerDay: visitorDaily(env), totalPerDay: siteDaily(env) } : null, originAllowed: !origin || originOk }, { 'Access-Control-Allow-Origin': origin || '*' });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json(403, { message: `This premium server doesn't accept requests from ${origin || 'unknown sites'}. Add it to ALLOWED_ORIGINS.` });

    try {
      if (request.method === 'POST' && path === '/ai/v1/messages') return await martia(request, env, ctx, cors);
      if (request.method === 'POST' && (path === '/voice/v1/tts' || path === '/voice/v1/asr')) return await voice(request, env, path, cors);
      if (request.method === 'GET' && path === '/v1/plan') return json(200, await plan(env, { preview: url.searchParams.get('preview') === '1' }));
      if (request.method === 'POST' && ['/v1/verify', '/v1/portal', '/v1/usage'].includes(path)) {
        let body;
        try { body = await request.json(); } catch { return json(400, { message: 'Expected a JSON body.' }); }
        if (String(body?.key || '').length > 300) return json(400, { message: 'That key is too long.' });
        if (path === '/v1/verify') return json(200, await verify(env, body?.key));
        const [status, data] = path === '/v1/usage' ? await memberUsage(env, body?.key) : await portal(env, body?.key, body?.returnUrl, origins, origin);
        return json(status, data);
      }
    } catch (e) {
      if (e instanceof StripeError) return json(502, { message: e.status === 401 ? "The premium server's Stripe key was rejected." : `Stripe: ${e.message}` });
      return json(500, { message: 'The premium server hit an unexpected error.' });
    }
    return json(404, { message: 'Not found. Use GET /v1/plan; POST /v1/verify, /v1/usage or /v1/portal; POST /ai/v1/messages; or POST /voice/v1/tts or /voice/v1/asr.' });
  },
};
