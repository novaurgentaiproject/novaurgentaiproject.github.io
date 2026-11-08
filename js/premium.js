// Nova Premium. Nova 3 Martia is a Premium model: chatting with it needs an
// active Nova Premium membership or a Premium code.
//
// Memberships are sold with a Stripe Payment Link. After paying, Stripe sends the
// buyer back to Nova with their checkout session ID, and the Nova premium server
// (premium-server/, a small Cloudflare Worker that holds the Stripe key) confirms
// the purchase. Nova is a static site, so the lock itself runs in the browser:
// it keeps normal visitors out, but someone who edits the page's code could get
// around it.
//
// Martia included: when the premium server has a Claude key of its own, members
// chat with Martia through it, with no API key needed, up to a monthly allowance
// the server keeps track of. Those replies can't be unlocked by editing the page:
// the server checks the membership on every message.

import { esc, h, copyText } from './util.js';
import { icon } from './icons.js';
import { openModal, toast } from './ui.js';
import { emit, settings } from './state.js';
import { getModel, modelGradient, DEFAULT_MODEL, CLAUDE_MODELS } from './models.js';

/** Models that need Premium. */
export const PREMIUM_MODELS = ['nova-3-martia'];
/** The model Nova uses instead when Premium isn't active. */
export const FREE_MODEL = DEFAULT_MODEL;

/**
 * Your Nova premium server's address, e.g. 'https://nova-premium.your-name.workers.dev'.
 * Until it's set, nobody can buy Premium, but Premium codes still work.
 * Setup guide: premium-server/README.md
 */
export const PREMIUM_SERVER = '';
export const PREMIUM_GUIDE = 'https://github.com/novaurgentaiproject/novaurgentaiproject.github.io/blob/HEAD/premium-server/README.md';

/**
 * Premium codes that work without the server. Only SHA-256 hashes are kept here,
 * so the codes can't be read from this public file. A code's hash is taken in
 * upper case with everything except letters and digits removed
 * (see premium-server/README.md). Delete a line to switch that code off.
 */
const OFFLINE_CODES = [
  '543e23201dc85737ed92d5147e56a925a7334370e3a87ed27ccb9009be030b31', // owner code
];

const LS = 'nova:premium';
const LS_PLAN = 'nova:premium-plan';
const RECHECK_MS = 6 * 3600e3; // re-confirm memberships with the server this often
const GRACE_MS = 7 * 24 * 3600e3; // keep Premium this long while the server can't be reached
const STRIPE_KEY = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function read(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } }
let state = read(LS);
let hooks = {};

function save(next) {
  state = next;
  try { next ? localStorage.setItem(LS, JSON.stringify(next)) : localStorage.removeItem(LS); } catch { /* storage unavailable */ }
  emit('premium', premiumInfo());
}

// Another tab redeemed or removed Premium.
addEventListener('storage', (e) => { if (e.key === LS) { state = read(LS); emit('premium', premiumInfo()); } });

/** Let the app supply actions the Premium screens can trigger (e.g. switching model). */
export function setPremiumHooks(h) { hooks = { ...hooks, ...h }; }

export function premiumServer() {
  let s = PREMIUM_SERVER;
  try { s = localStorage.getItem('nova:premium-server') || s; } catch { /* storage unavailable */ }
  return String(s || '').trim().replace(/\/+$/, '');
}

export function isPremium() {
  if (!state?.active) return false;
  if (state.kind === 'code') return OFFLINE_CODES.includes(state.codeHash);
  if (state.endsAt && Date.now() > state.endsAt) return false;
  return Date.now() - (state.checkedAt || 0) < GRACE_MS;
}

export function premiumInfo() {
  return { active: isPremium(), ...(state || {}) };
}

export const needsPremium = (id) => PREMIUM_MODELS.includes(id);
/** True when this model needs Premium and the user doesn't have it. */
export const modelLocked = (id) => needsPremium(id) && !isPremium();
/** The model to actually use: Premium models fall back to the free model when locked. */
export const usableModel = (id) => (modelLocked(id) ? FREE_MODEL : id);

/** Returns true if the model can be used; otherwise opens the Premium screen. */
export function requireModel(id, { onUnlock, onFallback } = {}) {
  if (!modelLocked(id)) return true;
  openPremium({ modelId: id, onUnlock, onFallback });
  return false;
}

/** One line describing the membership, e.g. "Renews on Dec 1, 2026". */
export function planLine(info = premiumInfo()) {
  const date = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (info.kind === 'code') return 'Unlocked with a Premium code';
  if (info.kind === 'gift') return 'Gift membership';
  if (!info.interval) return 'Lifetime membership';
  if (info.endsAt) return `Ends on ${date(info.endsAt)}`;
  if (info.renews) return `Renews on ${date(info.renews)}`;
  return `${info.intervalCount > 1 ? `Every ${info.intervalCount} ${info.interval}s` : info.interval === 'year' ? 'Yearly' : info.interval === 'month' ? 'Monthly' : 'Recurring'} membership`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function call(path, body) {
  const base = premiumServer();
  if (!base) throw Object.assign(new Error("Nova's premium server isn't set up yet."), { code: 'no-server' });
  let res;
  try {
    res = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  } catch {
    throw Object.assign(new Error("Couldn't reach Nova's premium server. Check your connection and try again."), { code: 'network' });
  }
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw Object.assign(new Error(data.message || `The premium server returned an error (${res.status}).`), { code: 'server', status: res.status });
  return data;
}

const REASONS = {
  invalid: "That code isn't valid. Check it and try again.",
  'not-found': "Nova couldn't find that purchase.",
  unpaid: "That payment hasn't gone through yet. Try again in a few minutes.",
  ended: 'That Premium membership has ended.',
  paused: 'That Premium membership is paused.',
  refunded: 'That purchase was refunded.',
  'other-product': "That purchase isn't for Nova Premium.",
};
const reasonText = (r) => REASONS[r] || REASONS.invalid;

function fromServer(key, d) {
  return {
    active: true, kind: d.kind === 'gift' ? 'gift' : 'stripe', key,
    interval: d.interval || null, intervalCount: d.intervalCount || 1,
    renews: d.renews || null, endsAt: d.endsAt || null, status: d.status || 'active',
    since: state?.key === key && state.since ? state.since : Date.now(), checkedAt: Date.now(),
  };
}

const normalizeCode = (c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Unlock Premium with a Premium code or a purchase key (Stripe checkout session ID). */
export async function redeem(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Enter a Premium code or key.');
  const norm = normalizeCode(raw);
  if (!STRIPE_KEY.test(raw) && norm.length >= 8 && crypto?.subtle) {
    const hash = await sha256(norm);
    if (OFFLINE_CODES.includes(hash)) {
      save({ active: true, kind: 'code', codeHash: hash, since: Date.now(), checkedAt: Date.now() });
      return premiumInfo();
    }
  }
  if (!premiumServer()) throw new Error(STRIPE_KEY.test(raw) ? "This key can't be checked yet because Nova's premium server isn't set up." : reasonText('invalid'));
  const d = await call('/v1/verify', { key: raw });
  if (!d.premium) throw new Error(reasonText(d.reason));
  save(fromServer(raw, d));
  loadPlan({ fresh: true }).then(() => refreshAllowance());
  return premiumInfo();
}

/** Re-confirm a membership with the server (at most every few hours unless forced). */
let checking = null;
export function refreshPremium({ force = false } = {}) {
  if (!state?.key || state.kind === 'code') return Promise.resolve(premiumInfo());
  if (!force && Date.now() - (state.checkedAt || 0) < RECHECK_MS && state.active) return Promise.resolve(premiumInfo());
  if (!premiumServer() || (!force && navigator.onLine === false)) return Promise.resolve(premiumInfo());
  checking ||= (async () => {
    const key = state.key;
    const wasActive = isPremium();
    try {
      const d = await call('/v1/verify', { key });
      if (state?.key !== key) return premiumInfo(); // removed or replaced meanwhile
      if (d.premium) save(fromServer(key, d));
      else {
        save({ ...state, active: false, ended: d.reason || 'ended', checkedAt: Date.now() });
        if (wasActive) toast(`${reasonText(d.reason)} Nova 3 Martia is locked again.`, { type: 'error', timeout: 6000 });
      }
    } catch (e) {
      if (force) throw e;
    } finally {
      checking = null;
    }
    return premiumInfo();
  })();
  return checking;
}

/** Check memberships now and then: at start, when the app comes back, and when the network returns. */
export function startPremiumChecks() {
  refreshPremium();
  if (premiumServer()) loadPlan().then(() => { emit('premium', premiumInfo()); if (isPremium() && martiaIncluded()) refreshAllowance(); });
  addEventListener('online', () => refreshPremium());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshPremium(); });
  setInterval(() => refreshPremium(), 3600e3);
}

export function removePremium() { save(null); saveAllowance(null); }

/** What an account stores so Premium follows the person to their other devices. */
export function exportPremium() {
  if (!isPremium() || !state) return null;
  return state.kind === 'code' ? { kind: 'code', codeHash: state.codeHash } : { kind: state.kind, key: state.key };
}

/** Unlock Premium from what the account stored. Returns true if it worked. */
export async function importPremium(data) {
  if (!data || isPremium()) return false;
  if (data.kind === 'code') {
    if (!OFFLINE_CODES.includes(data.codeHash)) return false;
    save({ active: true, kind: 'code', codeHash: data.codeHash, since: Date.now(), checkedAt: Date.now() });
    return true;
  }
  if (!data.key) return false;
  try { await redeem(data.key); return true; } catch { return false; }
}

/** Price and checkout link for the Premium plan, from the server (cached for 30 minutes). */
export async function loadPlan({ fresh = false } = {}) {
  const cached = read(LS_PLAN);
  if (!premiumServer()) return null;
  if (!fresh && cached && cached.server === premiumServer() && Date.now() - cached.at < 30 * 60e3) return cached.plan;
  try {
    const plan = await call('/v1/plan');
    try { localStorage.setItem(LS_PLAN, JSON.stringify({ at: Date.now(), server: premiumServer(), plan })); } catch { /* storage unavailable */ }
    return plan;
  } catch {
    return cached?.server === premiumServer() ? cached.plan : null;
  }
}

export function priceParts(plan) {
  if (!plan || plan.amount == null || !plan.currency) return null;
  const cur = String(plan.currency).toLowerCase();
  const value = ZERO_DECIMAL.has(cur) ? plan.amount : plan.amount / 100;
  let money;
  try {
    money = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
  } catch { money = `${value} ${cur.toUpperCase()}`; }
  const n = plan.intervalCount || 1;
  const per = !plan.interval ? 'one-time payment' : n === 1 ? `per ${plan.interval}` : `every ${n} ${plan.interval}s`;
  return { money, per, recurring: !!plan.interval };
}

/** Opens Stripe's page where members change their plan, update their card or cancel. */
export async function openBillingPortal() {
  const d = await call('/v1/portal', { key: state?.key, returnUrl: location.origin + location.pathname });
  if (!d.url) throw new Error("Couldn't open the subscription page.");
  location.href = d.url;
}

// ---------------------------------------------------------------------------
// Martia included: the member's monthly allowance
// ---------------------------------------------------------------------------
const LS_ALLOWANCE = 'nova:premium-allowance';
const MIN_LEFT = 0.03; // dollars: less than this can't pay for a reply
let allowance = read(LS_ALLOWANCE);

/** True when the premium server includes Martia (answering with its own Claude key). */
export function martiaIncluded() {
  const cached = read(LS_PLAN);
  return !!premiumServer() && cached?.server === premiumServer() && !!cached.plan?.ai?.included;
}

/** This month's allowance as last reported by the server: { left, budget, fraction, resetsAt, usedUp }. */
export function allowanceInfo() {
  if (!allowance || allowance.key !== state?.key) return null;
  const refilled = allowance.resetsAt && Date.now() >= allowance.resetsAt;
  return { ...allowance, usedUp: !!allowance.usedUp && !refilled };
}

function saveAllowance(next) {
  allowance = next;
  try { next ? localStorage.setItem(LS_ALLOWANCE, JSON.stringify(next)) : localStorage.removeItem(LS_ALLOWANCE); } catch { /* storage unavailable */ }
  emit('premium-usage', allowanceInfo());
}

/**
 * Where a member's Martia reply goes: the premium server, with their Premium key.
 * `usedUp` is true when this month's allowance has run out. Null when the person
 * isn't a member, or the server doesn't include Martia.
 */
export function premiumAI(modelId = PREMIUM_MODELS[0]) {
  if (!needsPremium(modelId) || !isPremium() || !state?.key || !martiaIncluded()) return null;
  const a = allowanceInfo();
  return { url: `${premiumServer()}/ai`, key: state.key, usedUp: !!a?.usedUp, resetsAt: a?.resetsAt || null };
}

/** Ask the server how much of this month's allowance is left. */
let allowanceReq = null;
let allowanceTried = 0;
export function refreshAllowance() {
  if (!state?.key || !isPremium() || !premiumServer()) return Promise.resolve(null);
  const key = state.key;
  allowanceTried = Date.now();
  allowanceReq ||= call('/v1/usage', { key })
    .then((d) => {
      if (state?.key !== key) return null;
      if (!d.included) { saveAllowance(null); return null; }
      saveAllowance({ key, at: Date.now(), left: d.left, budget: d.budget, fraction: d.fraction, resetsAt: d.resetsAt, usedUp: d.left < MIN_LEFT });
      return allowanceInfo();
    })
    .catch(() => allowanceInfo())
    .finally(() => { allowanceReq = null; });
  return allowanceReq;
}

/** The server said the allowance has run out (until `resetsAt`). */
export function noteAllowanceUsedUp(resetsAt) {
  if (!state?.key) return;
  saveAllowance({ ...(allowanceInfo() || {}), key: state.key, at: Date.now(), left: 0, fraction: 1, usedUp: true, resetsAt: resetsAt || allowance?.resetsAt || null });
}

const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
/** What to tell a member whose allowance has run out. */
export function allowanceMessage(resetsAt) {
  const when = resetsAt ? ` It refills on ${shortDate(resetsAt)}.` : '';
  return `You've used this month's Nova 3 Martia allowance.${when} Until then, switch to Nova 2 Flash or another free model, or connect your own Claude key in Settings → Engine to keep using Martia.`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
const martia = () => getModel(PREMIUM_MODELS[0]);
const claudeLabel = () => {
  const id = settings.modelMap?.[PREMIUM_MODELS[0]]?.model || martia().claude.model;
  const effort = settings.modelMap?.[PREMIUM_MODELS[0]]?.effort || martia().claude.effort;
  return `${CLAUDE_MODELS.find((c) => c.id === id)?.label || id} at ${effort} effort`;
};
const orb = (cls = '') => `<span class="pm-orb ${cls}" style="background:${modelGradient(martia())}">${icon(martia().icon)}</span>`;

/**
 * The Premium screen ("paywall"). `onUnlock` runs after Premium is unlocked from
 * here (e.g. to send the message that was waiting); `onFallback` offers to carry
 * on with the free model instead.
 */
export function openPremium({ modelId = PREMIUM_MODELS[0], onUnlock = null, onFallback = null } = {}) {
  const m = getModel(modelId);
  const free = getModel(FREE_MODEL);
  const body = h(`<div class="premium">
<div class="pm-hero">${orb()}<div class="pm-kicker">${icon('crown', 'icon-sm')} Nova Premium</div><h2>Unlock ${esc(m.name)}</h2><p>Our most capable model, for the questions that need real thought.</p></div>
<ul class="pm-features">
<li>${icon('brain', 'icon-sm')}<span><b>Deep reasoning.</b> Thinks hard problems through before answering, and shows you its thinking.</span></li>
<li>${icon('layout', 'icon-sm')}<span><b>Interactive answers.</b> Builds calculators, simulations and visual explorers right into its replies.</span></li>
<li>${icon('compass', 'icon-sm')}<span><b>Thorough and well-organized.</b> Comprehensive answers for complex topics, research and analysis.</span></li>
<li data-engine>${icon('sparkles', 'icon-sm')}<span><b>Runs on ${esc(claudeLabel())}</b> when Claude is connected.</span></li>
</ul>
<div class="pm-plan" data-plan><span class="shimmer-text">Loading plans…</span></div>
<button class="btn primary pm-cta" data-buy hidden>${icon('crown', 'icon-sm')} Upgrade to Premium</button>
${onFallback ? `<button class="btn pm-alt" data-fallback>Use ${esc(free.name)} instead</button>` : ''}
<details class="pm-code"><summary>Have a Premium code or key?</summary>
<form class="pm-redeem" data-redeem><input class="field" data-code placeholder="NOVA-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Premium code or key"><button class="btn sm" type="submit">Redeem</button></form>
<div class="pm-status-msg" data-codemsg role="status"></div>
</details>
<p class="pm-fine" data-fine></p>
</div>`);
  const modal = openModal({ title: 'Nova Premium', body, size: 'small', className: 'premium-modal' });
  const $ = (s) => body.querySelector(s);

  const showPlan = (plan) => {
    const buy = $('[data-buy]');
    if (plan?.ai?.included) $('[data-engine]').innerHTML = `${icon('sparkles', 'icon-sm')}<span><b>No API key needed.</b> Martia is included, powered by Claude, with a monthly allowance that covers plenty of everyday chats.</span>`;
    if (plan?.available && /^https:\/\//.test(plan.url || '')) {
      const parts = priceParts(plan);
      $('[data-plan]').innerHTML = `${parts ? `<div class="pm-price"><b>${esc(parts.money)}</b><span>${esc(parts.per)}</span></div>` : '<div class="pm-price"><span>Choose your price at checkout</span></div>'}${plan.trialDays ? `<div class="pm-trial">${plan.trialDays}-day free trial</div>` : ''}`;
      buy.hidden = false;
      const go = () => {
        buy.disabled = true;
        buy.innerHTML = `${icon('refresh', 'icon-sm spin')} Opening checkout…`;
        // Logged-in buyers: Stripe pre-fills their email and records their account ID.
        const extra = hooks.checkoutParams?.() || {};
        const u = new URL(plan.url);
        for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
        location.href = u.href;
      };
      // When accounts are on, Premium belongs to an account, so log in first.
      buy.onclick = () => { if (!hooks.requireAccount || hooks.requireAccount(go, 'Log in or sign up to get Premium. It stays with your account on every device.')) go(); };
      $('[data-fine]').textContent = `Payments are handled securely by Stripe; Nova never sees your card.${plan.interval ? ' Cancel anytime in Settings → Premium.' : ''}${plan.ai?.included ? " Members' Martia chats are sent through Nova's premium server to Anthropic (Claude) to be answered." : ''}`;
    } else {
      $('[data-plan]').innerHTML = `<div class="pm-soon">${icon('clock', 'icon-sm')}<span>Premium sign-ups aren't open yet. If you have a Premium code, enter it below.</span></div>`;
      buy.hidden = true;
      $('.pm-code').open = true;
      $('[data-fine]').textContent = '';
    }
  };
  loadPlan().then((plan) => { if (body.isConnected) showPlan(plan); });

  $('[data-fallback]')?.addEventListener('click', () => { modal.close(); onFallback(); });
  const form = $('[data-redeem]');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('[data-codemsg]');
    const btn = form.querySelector('button');
    btn.disabled = true;
    msg.className = 'pm-status-msg';
    msg.textContent = 'Checking…';
    try {
      await redeem($('[data-code]').value);
      modal.close();
      openWelcome({ onContinue: onUnlock });
    } catch (err) {
      msg.className = 'pm-status-msg err';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  return modal;
}

/** Shown once Premium is unlocked. */
export function openWelcome({ onContinue = null } = {}) {
  const info = premiumInfo();
  const m = martia();
  const body = h(`<div class="premium welcome">
<div class="pm-hero">${orb('big')}<div class="pm-kicker">${icon('crown', 'icon-sm')} Nova Premium</div><h2>Welcome to Premium</h2><p>${esc(m.name)} is unlocked. ${esc(planLine(info))}.</p></div>
${info.key ? `<div class="pm-key"><div class="pm-key-label">Your Premium key</div><div class="pm-key-row"><code>${esc(info.key)}</code><button class="btn sm" data-copy>${icon('copy', 'icon-sm')} Copy</button></div>
<p class="s-help">Enter this key in <b>Settings → Premium</b> to unlock Premium on your other devices, or in Nova on your Home Screen. Keep it private: anyone with it can use your membership.</p></div>` : ''}
<button class="btn primary pm-cta" data-go>${onContinue ? 'Continue' : `Chat with ${esc(m.name)}`}</button>
</div>`);
  const modal = openModal({ title: 'Nova Premium', body, size: 'small', className: 'premium-modal' });
  body.querySelector('[data-copy]')?.addEventListener('click', async (e) => {
    await copyText(info.key);
    e.currentTarget.innerHTML = `${icon('check', 'icon-sm')} Copied`;
  });
  body.querySelector('[data-go]').onclick = () => {
    modal.close();
    if (onContinue) onContinue();
    else hooks.selectModel?.(PREMIUM_MODELS[0]);
  };
  return modal;
}

/**
 * Stripe sends buyers back to Nova as ?premium={CHECKOUT_SESSION_ID}. Confirm the
 * purchase and welcome them. Returns true if this visit was a checkout return.
 */
export function handleCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  const key = params.get('premium');
  if (!key) return false;
  params.delete('premium');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  if (!STRIPE_KEY.test(key)) return false;

  const body = h(`<div class="premium confirm"><div class="pm-hero">${orb('spin-glow')}<h2>Confirming your payment…</h2><p data-msg>This only takes a moment.</p></div><div data-actions></div></div>`);
  const modal = openModal({ title: 'Nova Premium', body, size: 'small', className: 'premium-modal' });
  const attempt = async (tries = 3) => {
    try {
      await redeem(key);
      modal.close();
      openWelcome();
    } catch (err) {
      // Payments can take a few seconds to settle, so retry briefly before giving up.
      if (tries > 1 && /hasn't gone through|network|reach/i.test(err.message)) { setTimeout(() => attempt(tries - 1), 2500); return; }
      if (!body.isConnected) return;
      body.querySelector('h2').textContent = "Premium isn't unlocked yet";
      body.querySelector('[data-msg]').textContent = err.message;
      body.querySelector('[data-actions]').innerHTML = `<div class="pm-key"><div class="pm-key-label">Your purchase key</div><div class="pm-key-row"><code>${esc(key)}</code><button class="btn sm" data-copy>${icon('copy', 'icon-sm')} Copy</button></div><p class="s-help">Keep this key. You can enter it later in Settings → Premium.</p></div><button class="btn primary pm-cta" data-retry>Try again</button>`;
      body.querySelector('[data-copy]').onclick = (e) => { copyText(key); e.currentTarget.innerHTML = `${icon('check', 'icon-sm')} Copied`; };
      body.querySelector('[data-retry]').onclick = () => {
        body.querySelector('h2').textContent = 'Confirming your payment…';
        body.querySelector('[data-msg]').textContent = 'This only takes a moment.';
        body.querySelector('[data-actions]').innerHTML = '';
        attempt(1);
      };
    }
  };
  attempt();
  return true;
}

// ---------------------------------------------------------------------------
// Settings → Premium
// ---------------------------------------------------------------------------
const maskKey = (k) => (k.length > 22 ? `${k.slice(0, 12)}…${k.slice(-6)}` : k);

export function premiumSettingsHTML() {
  const info = premiumInfo();
  const m = martia();
  const lapsed = !info.active && state;
  const status = info.active
    ? `<div class="pm-card on">${orb()}<div><b>Nova Premium</b><small>${esc(planLine(info))}</small></div><span class="tag premium">${icon('crown', 'icon-xs')} Active</span></div>`
    : lapsed
      ? `<div class="pm-card">${orb()}<div><b>Premium isn't active</b><small>${state.ended ? esc(reasonText(state.ended)) : "Nova couldn't confirm your membership recently. Connect to the internet and check again."}</small></div></div>`
      : `<div class="pm-card">${orb()}<div><b>Free plan</b><small>${esc(m.name)} needs Nova Premium. Every other model is free.</small></div></div>`;
  const rows = [];
  if (!info.active) rows.push(`<div class="setting"><div><div class="s-label">Upgrade to Premium</div><div class="s-help">Unlock ${esc(m.name)}, Nova's most capable model.</div></div><button class="btn primary sm" data-upgrade>${icon('crown', 'icon-sm')} Upgrade</button></div>`);
  if (info.active && state?.key && martiaIncluded()) {
    const a = allowanceInfo();
    const pct = a ? Math.round((a.fraction || 0) * 100) : null;
    const line = !a ? 'Checking your allowance…'
      : a.usedUp ? `Used up for this month. Refills on ${esc(shortDate(a.resetsAt))}.`
        : `${pct}% used${a.resetsAt ? ` · refills on ${esc(shortDate(a.resetsAt))}` : ''}`;
    rows.push(`<div class="setting col"><div><div class="s-label">${esc(m.name)} this month</div><div class="s-help">Included with Premium, no API key needed. ${line}</div></div><div class="pm-meter${a && (a.usedUp || a.fraction > 0.85) ? ' low' : ''}" role="progressbar" aria-label="${esc(m.name)} allowance used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct ?? 0}"><span style="width:${pct ?? 0}%"></span></div></div>`);
  }
  if (state?.key) {
    rows.push(`<div class="setting"><div><div class="s-label">Premium key</div><div class="s-help">Enter it on your other devices, or in Nova on your Home Screen, to unlock Premium there. Keep it private: anyone with it can use your membership.</div><code class="pm-mask">${esc(maskKey(state.key))}</code></div><button class="btn sm" data-copykey>${icon('copy', 'icon-sm')} Copy</button></div>`);
    if (state.kind === 'stripe' && state.interval) rows.push(`<div class="setting"><div><div class="s-label">Manage subscription</div><div class="s-help">Change your plan, update your card or cancel. Opens Stripe's secure billing page.</div></div><button class="btn sm" data-portal>${icon('external', 'icon-sm')} Manage</button></div>`);
    rows.push(`<div class="setting"><div><div class="s-label">Membership status</div><div class="s-help" data-checkmsg>${state.checkedAt ? `Last confirmed ${esc(new Date(state.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}.` : ''}</div></div><button class="btn sm" data-check>${icon('refresh', 'icon-sm')} Check now</button></div>`);
  }
  if (!info.active) rows.push(`<div class="setting col"><div><div class="s-label">Have a Premium code or key?</div><div class="s-help">Codes look like NOVA-XXXX-XXXX-XXXX-XXXX. Keys from a purchase start with cs_.</div></div><form class="pm-redeem" data-redeem><input class="field" data-code placeholder="Enter a code or key" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Premium code or key"><button class="btn sm" type="submit">Redeem</button></form><div class="pm-status-msg" data-codemsg role="status"></div></div>`);
  if (state) rows.push(`<div class="setting"><div><div class="s-label">Remove Premium from this device</div><div class="s-help">${state.key ? "Your membership isn't canceled; you can add it back with your key." : 'You can add it back with your code.'}</div></div><button class="btn sm danger" data-removeprem>Remove</button></div>`);
  return `${status}${rows.join('')}`;
}

export function bindPremiumSettings(panel, rerender) {
  const q = (s) => panel.querySelector(s);
  if (q('.pm-meter') && Date.now() - allowanceTried > 30e3) {
    refreshAllowance().then(() => { if (panel.isConnected && q('.pm-meter')) rerender(); });
  }
  q('[data-upgrade]')?.addEventListener('click', () => openPremium());
  q('[data-copykey]')?.addEventListener('click', async (e) => { await copyText(state.key); e.currentTarget.innerHTML = `${icon('check', 'icon-sm')} Copied`; });
  q('[data-portal]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await openBillingPortal(); } catch (err) { toast(err.message, { type: 'error' }); b.disabled = false; }
  });
  q('[data-check]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    q('[data-checkmsg]').textContent = 'Checking…';
    try { await refreshPremium({ force: true }); rerender(); } catch (err) { q('[data-checkmsg]').textContent = err.message; b.disabled = false; }
  });
  q('[data-removeprem]')?.addEventListener('click', () => { removePremium(); rerender(); toast('Premium removed from this device'); });
  const form = q('[data-redeem]');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = q('[data-codemsg]');
    msg.className = 'pm-status-msg';
    msg.textContent = 'Checking…';
    try { await redeem(q('[data-code]').value); rerender(); openWelcome(); }
    catch (err) { msg.className = 'pm-status-msg err'; msg.textContent = err.message; }
  };
}
