// Nova accounts: log in with Google, Apple, or an email and password, using
// Firebase Authentication. Logged-in accounts keep chats, memory, custom
// agents, personalization and Premium in sync across devices (see sync.js).
//
// Nova works without an account too: everything then stays on the device.
// Setup guide: accounts/README.md

import { esc, h } from './util.js';
import { icon } from './icons.js';
import { openModal, toast } from './ui.js';
import { emit, settings, saveSettings, deleteAllChats, setMemory, customAgents, saveAgents, DEFAULT_SETTINGS } from './state.js';
import { startSync, stopSync, syncNow, flushSync, hasUnsynced, syncState, resetSyncMeta, quietly, deleteCloudData } from './sync.js';
import { removePremium, isPremium } from './premium.js';

/**
 * Your Firebase web app's config, from the Firebase console (Project settings →
 * General → Your apps → SDK setup and configuration → Config). These values are
 * meant to be public, so they're safe in this file. Until it's set, the Log in
 * screen says accounts are coming soon.
 */
export const FIREBASE_CONFIG = null;
/** Sign-in methods to offer: any of 'google', 'apple', 'email'. */
export const SIGN_IN_METHODS = ['google', 'apple', 'email'];
export const ACCOUNTS_GUIDE = 'https://github.com/novaurgentaiproject/novaurgentaiproject.github.io/blob/HEAD/accounts/README.md';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const LS_ACCOUNT = 'nova:account';
const PROVIDERS = { 'google.com': 'Google', 'apple.com': 'Apple', password: 'Email' };
const IOS_HOME = /iP(hone|ad|od)/.test(navigator.userAgent) && (navigator.standalone || matchMedia('(display-mode: standalone)').matches);

// A local override (used for testing against the Firebase emulators).
const override = () => { try { return JSON.parse(localStorage.getItem('nova:firebase') || 'null'); } catch { return null; } };
const config = () => override()?.config || FIREBASE_CONFIG;
export const accountsEnabled = () => !!config()?.apiKey;

let fb = null; // loaded Firebase modules and instances
let loading = null;
let ready = false;
let leaving = false; // logging out or deleting the account on purpose
let current = (() => {
  if (!accountsEnabled()) return null;
  try { return JSON.parse(localStorage.getItem(LS_ACCOUNT) || 'null'); } catch { return null; }
})();

export const currentUser = () => current;
export const signedIn = () => !!current;
export function accountInfo() { return { enabled: accountsEnabled(), ready, user: current, sync: { ...syncState } }; }

function setCurrent(user) {
  current = user ? {
    uid: user.uid,
    name: user.displayName || '',
    email: user.email || '',
    photo: user.photoURL || '',
    provider: user.providerData?.[0]?.providerId || 'password',
    verified: !!user.emailVerified,
  } : null;
  try { current ? localStorage.setItem(LS_ACCOUNT, JSON.stringify(current)) : localStorage.removeItem(LS_ACCOUNT); } catch { /* storage unavailable */ }
}
const changed = () => emit('account', accountInfo());

function load() {
  if (fb) return Promise.resolve(fb);
  loading ||= (async () => {
    const [appM, authM, fsM] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore-lite.js`),
    ]);
    const app = appM.initializeApp(config());
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    const emu = override()?.emulator;
    if (emu) {
      authM.connectAuthEmulator(auth, emu.auth, { disableWarnings: true });
      fsM.connectFirestoreEmulator(db, emu.firestoreHost, emu.firestorePort);
    }
    fb = { authM, fsM, auth, db };
    return fb;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** Start Firebase (when accounts are set up) and follow the login state. */
export async function initAccounts() {
  if (!accountsEnabled()) { ready = true; changed(); return; }
  try {
    const { authM, auth, fsM, db } = await load();
    authM.onAuthStateChanged(auth, (user) => {
      const prev = current?.uid;
      setCurrent(user);
      ready = true;
      if (user) startSync({ firestore: fsM, database: db, userId: user.uid });
      else if (prev) {
        stopSync();
        if (!leaving) toast('You were logged out of your Nova account. Log in again to keep syncing.', { type: 'error', timeout: 6000 });
      }
      changed();
    });
  } catch (e) {
    console.warn('Accounts are unavailable', e);
    ready = true;
    changed();
  }
}

// ---------------------------------------------------------------------------
// Signing in and out
// ---------------------------------------------------------------------------
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
const ERRORS = {
  'auth/invalid-credential': "That email and password don't match. Try again, or reset your password.",
  'auth/wrong-password': "That email and password don't match. Try again, or reset your password.",
  'auth/invalid-login-credentials': "That email and password don't match. Try again, or reset your password.",
  'auth/user-not-found': "There's no account with that email. Create one instead.",
  'auth/invalid-email': "That doesn't look like an email address.",
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
  'auth/email-already-in-use': "There's already an account with that email. Log in instead.",
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "Couldn't connect. Check your internet connection and try again.",
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/unauthorized-domain': "This website isn't allowed to sign in yet: add it in Firebase under Authentication → Settings → Authorized domains.",
  'auth/operation-not-allowed': "This way of signing in isn't turned on yet.",
  'auth/account-exists-with-different-credential': 'You already have an account with this email that uses a different way of signing in. Use that one.',
  'auth/user-disabled': 'This account has been turned off.',
  'auth/requires-recent-login': 'For your security, log in again, then try once more.',
  'auth/user-mismatch': "That's a different account. Confirm with the account you're logged in with.",
  'auth/web-storage-unsupported': "Signing in doesn't work in this browser mode (for example, private browsing).",
  'auth/operation-not-supported-in-this-environment': "Signing in doesn't work in this browser mode.",
};
export function authMessage(e, kind = '') {
  const code = e?.code || '';
  if (SILENT.has(code)) return '';
  if (IOS_HOME && (kind === 'google' || kind === 'apple') && /popup|environment|storage|internal/.test(code)) {
    return `${kind === 'google' ? 'Google' : 'Apple'} sign-in can't open inside the Home Screen app. Log in with your email instead, or open Nova in Safari.`;
  }
  if (code === 'auth/password-does-not-meet-requirements') return (e.message || '').replace(/^Firebase: /, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '') || 'Choose a stronger password.';
  return ERRORS[code] || (code ? `Couldn't sign in (${code.replace('auth/', '')}).` : e?.message || "Couldn't sign in.");
}

function providerFor(kind) {
  const { authM } = fb;
  if (kind === 'google' || kind === 'google.com') {
    const p = new authM.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }
  const p = new authM.OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  return p;
}

/**
 * Sign in with Google or Apple in a pop-up. Call it straight from a tap: Safari
 * only opens pop-ups during the tap itself, so this must not wait for anything first.
 */
export function signInWith(kind) {
  if (!fb) { load(); return Promise.reject(Object.assign(new Error('Nova is still getting sign-in ready. Try again in a moment.'), { code: 'nova/loading' })); }
  return fb.authM.signInWithPopup(fb.auth, providerFor(kind));
}

export async function logIn(email, password) {
  const { authM, auth } = await load();
  return authM.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUp(name, email, password) {
  const { authM, auth } = await load();
  const cred = await authM.createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) {
    await authM.updateProfile(cred.user, { displayName: name.trim() });
    setCurrent(cred.user);
    changed();
  }
  authM.sendEmailVerification(cred.user).catch(() => {});
  return cred;
}

export async function resetPassword(email) {
  const { authM, auth } = await load();
  return authM.sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerification() {
  const { authM, auth } = await load();
  if (auth.currentUser) await authM.sendEmailVerification(auth.currentUser);
}

export async function setAccountName(name) {
  const { authM, auth } = await load();
  if (!auth.currentUser) return;
  await authM.updateProfile(auth.currentUser, { displayName: name.trim() });
  setCurrent(auth.currentUser);
  changed();
}

/** Remove the account's data from this device (it stays safe in the account). */
async function clearDevice(uid) {
  await quietly(async () => {
    await deleteAllChats({ sync: false });
    setMemory([]);
    customAgents.length = 0;
    saveAgents();
    saveSettings({ name: '', about: '', style: '', personality: DEFAULT_SETTINGS.personality });
  });
  removePremium();
  resetSyncMeta(uid);
  try { localStorage.removeItem('nova:last'); } catch { /* storage unavailable */ }
}

/**
 * Log out and remove the account's chats and data from this device. Returns
 * 'unsynced' (without logging out) if recent changes couldn't be saved to the
 * account yet, unless `force` is set.
 */
export async function logOut({ force = false } = {}) {
  if (!fb?.auth.currentUser) return;
  try { await flushSync(); } catch { if (!force && hasUnsynced()) return 'unsynced'; }
  const uid = current?.uid;
  leaving = true;
  try {
    stopSync();
    await fb.authM.signOut(fb.auth);
    setCurrent(null);
    await clearDevice(uid);
  } finally {
    leaving = false;
  }
  changed();
  return 'ok';
}

/**
 * Delete the account and everything synced to it. Firebase needs a fresh login
 * for this, so it first asks the person to confirm with their password, Google
 * or Apple. Call it straight from a tap (the confirmation may open a pop-up).
 */
export function deleteAccount({ password = '' } = {}) {
  const user = fb?.auth.currentUser;
  if (!user) return Promise.reject(new Error("You're not logged in."));
  const { authM, fsM, auth, db } = fb;
  const provider = user.providerData?.[0]?.providerId || 'password';
  const confirm = provider === 'password'
    ? authM.reauthenticateWithCredential(user, authM.EmailAuthProvider.credential(user.email, password))
    : authM.reauthenticateWithPopup(user, providerFor(provider));
  return confirm.then(async () => {
    const uid = user.uid;
    leaving = true;
    try {
      stopSync();
      await deleteCloudData({ firestore: fsM, database: db, userId: uid });
      await authM.deleteUser(auth.currentUser || user);
      setCurrent(null);
      await clearDevice(uid);
    } finally {
      leaving = false;
    }
    changed();
  });
}

// ---------------------------------------------------------------------------
// Log in / sign up screen
// ---------------------------------------------------------------------------
const GOOGLE_SVG = '<svg class="auth-ico" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const APPLE_SVG = '<svg class="auth-ico" viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>';

const MODES = {
  login: { title: 'Log in to Nova', sub: 'Pick up where you left off, on any device.', submit: 'Log in', ask: 'New to Nova?', link: 'Create an account', to: 'signup' },
  signup: { title: 'Create your Nova account', sub: 'Keep your chats, memory and Premium with you on every device.', submit: 'Create account', ask: 'Already have an account?', link: 'Log in', to: 'login' },
  reset: { title: 'Reset your password', sub: "Enter your email and we'll send you a link to choose a new password.", submit: 'Send reset link', ask: '', link: 'Back to log in', to: 'login' },
};

/** The Log in / Sign up screen. `onDone` runs after a successful login. */
export function openLogin({ mode = 'login', reason = '', onDone = null } = {}) {
  if (current) { onDone?.(); return null; }
  const enabled = accountsEnabled();
  if (enabled) load().catch(() => {}); // get Firebase ready before the first tap
  const has = (m) => SIGN_IN_METHODS.includes(m);
  const off = enabled ? '' : ' disabled';
  const body = h(`<div class="auth">
<div class="auth-head"><img src="assets/nova-logo.svg" alt="" class="auth-logo"><h2 data-title></h2><p data-sub></p></div>
${enabled ? '' : `<div class="auth-note">${icon('clock', 'icon-sm')}<span>Nova accounts are coming soon. Until then, Nova keeps your chats on this device.</span></div>`}
<div class="auth-social" data-social>
${has('google') ? `<button class="auth-btn" type="button" data-provider="google"${off}>${GOOGLE_SVG}<span>Continue with Google</span></button>` : ''}
${has('apple') ? `<button class="auth-btn apple" type="button" data-provider="apple"${off}>${APPLE_SVG}<span>Continue with Apple</span></button>` : ''}
</div>
${has('email') ? `${has('google') || has('apple') ? '<div class="auth-or" data-or><span>or</span></div>' : ''}
<form class="auth-form" data-form novalidate>
<input class="field" data-name type="text" placeholder="Your name" autocomplete="name" aria-label="Your name"${off}>
<input class="field" data-email type="email" placeholder="Email address" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" aria-label="Email address"${off}>
<input class="field" data-password type="password" placeholder="Password" aria-label="Password"${off}>
<button class="btn primary auth-submit" type="submit" data-submit${off}></button>
</form>
<div class="auth-links"><button type="button" class="auth-link" data-forgot>Forgot password?</button><span class="auth-switch"><span data-ask></span> <button type="button" class="auth-link" data-switch></button></span></div>` : ''}
<div class="auth-msg" data-msg role="status"></div>
<p class="auth-fine">Your chats, memory, agents and Premium are saved to your account. API keys stay on this device.</p>
</div>`);
  const modal = openModal({ title: '', body, size: 'small', className: 'auth-modal' });
  const $ = (s) => body.querySelector(s);
  const msg = (text, type = '') => { const el = $('[data-msg]'); el.className = `auth-msg ${type}`; el.textContent = text || ''; };
  let current_mode = mode;

  const show = (m) => {
    current_mode = m;
    const M = MODES[m];
    $('[data-title]').textContent = M.title;
    $('[data-sub]').textContent = reason && m !== 'reset' ? reason : M.sub;
    $('[data-social]').hidden = m === 'reset';
    if ($('[data-or]')) $('[data-or]').hidden = m === 'reset';
    if ($('[data-form]')) {
      $('[data-name]').hidden = m !== 'signup';
      $('[data-password]').hidden = m === 'reset';
      $('[data-password]').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
      $('[data-password]').placeholder = m === 'signup' ? 'Password (at least 6 characters)' : 'Password';
      $('[data-submit]').textContent = M.submit;
      $('[data-forgot]').hidden = m !== 'login';
      $('[data-ask]').textContent = M.ask;
      $('[data-switch]').textContent = M.link;
    }
    msg('');
  };
  show(mode);
  setTimeout(() => (current_mode === 'signup' ? $('[data-name]') : $('[data-email]'))?.focus(), 60);

  const success = () => {
    modal.close();
    toast(`Logged in${current?.name ? ` as ${current.name}` : current?.email ? ` as ${current.email}` : ''}`);
    onDone?.();
  };

  body.querySelectorAll('[data-provider]').forEach((b) => (b.onclick = () => {
    const kind = b.dataset.provider;
    msg('');
    signInWith(kind).then(() => { setCurrent(fb.auth.currentUser); changed(); success(); }, (e) => msg(e.code === 'nova/loading' ? e.message : authMessage(e, kind), 'err'));
  }));

  $('[data-switch]')?.addEventListener('click', () => show(MODES[current_mode].to));
  $('[data-forgot]')?.addEventListener('click', () => show('reset'));
  const form = $('[data-form]');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    if (!enabled) return;
    const name = $('[data-name]').value;
    const email = $('[data-email]').value;
    const password = $('[data-password]').value;
    if (!email.trim()) { msg('Enter your email address.', 'err'); return; }
    if (current_mode !== 'reset' && !password) { msg('Enter your password.', 'err'); return; }
    const btn = $('[data-submit]');
    btn.disabled = true;
    msg(current_mode === 'reset' ? 'Sending…' : current_mode === 'signup' ? 'Creating your account…' : 'Logging in…');
    try {
      if (current_mode === 'reset') {
        await resetPassword(email);
        msg(`If there's an account for ${email.trim()}, a reset link is on its way. Check your inbox.`, 'ok');
      } else if (current_mode === 'signup') {
        await signUp(name, email, password);
        success();
        toast('We sent you an email to confirm your address.');
      } else {
        await logIn(email, password);
        setCurrent(fb.auth.currentUser);
        changed();
        success();
      }
    } catch (err) {
      msg(authMessage(err), 'err');
    } finally {
      btn.disabled = false;
    }
  };
  return modal;
}

// ---------------------------------------------------------------------------
// Settings → Account
// ---------------------------------------------------------------------------
export function accountAvatar(user = current, cls = 'avatar') {
  const letter = esc(((user?.name || settings.name || user?.email || 'N').trim()[0] || 'N').toUpperCase());
  return user?.photo
    ? `<span class="${cls} photo"><img src="${esc(user.photo)}" alt="" referrerpolicy="no-referrer"></span>`
    : `<span class="${cls}">${letter}</span>`;
}

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export function syncLine(st = syncState) {
  if (st.status === 'syncing') return 'Syncing…';
  if (st.status === 'error' || st.status === 'offline') return st.error || 'Sync paused.';
  if (st.at) return `Synced ${ago(st.at)}`;
  return 'Waiting to sync…';
}

export function accountSettingsHTML() {
  const enabled = accountsEnabled();
  if (!current) {
    return `<div class="acct-card"><span class="avatar big">${icon('user', 'icon-sm')}</span><div><b>You're not logged in</b><small>${enabled ? 'Log in to save your chats, memory and Premium to an account and use them on all your devices.' : 'Nova accounts are coming soon. For now, everything stays on this device.'}</small></div></div>
<div class="setting"><div><div class="s-label">Nova account</div><div class="s-help">Log in with Google, Apple or your email.</div></div><div class="inline"><button class="btn sm" data-login${enabled ? '' : ' disabled'}>Log in</button><button class="btn primary sm" data-signup${enabled ? '' : ' disabled'}>Sign up</button></div></div>`;
  }
  const u = current;
  const st = syncState;
  return `<div class="acct-card">${accountAvatar(u, 'avatar big')}<div><b>${esc(u.name || u.email || 'Nova account')}</b><small>${esc(u.email || '')}</small></div><span class="tag">${esc(PROVIDERS[u.provider] || 'Email')}</span></div>
${u.provider === 'password' && !u.verified ? `<div class="setting"><div><div class="s-label">Confirm your email</div><div class="s-help">We sent a link to ${esc(u.email)}. Confirming helps you get back into your account if you forget your password.</div></div><button class="btn sm" data-verify>Resend link</button></div>` : ''}
<div class="setting"><div><div class="s-label">Name</div><div class="s-help">Shown on your account.</div></div><input class="field" data-acctname value="${esc(u.name)}" placeholder="Your name" autocomplete="name" style="max-width:220px"></div>
<div class="setting"><div><div class="s-label">Sync</div><div class="s-help">Chats, memory, custom agents, personalization and Premium sync to your account. API keys and device settings stay on this device.${st.tooBig ? ` ${st.tooBig} very large chat${st.tooBig > 1 ? 's are' : ' is'} too big to sync.` : ''}</div><div class="s-help acct-sync ${st.status}" data-syncline>${esc(syncLine(st))}</div></div><button class="btn sm" data-syncnow>${icon('refresh', 'icon-sm')} Sync now</button></div>
${u.provider === 'password' ? `<div class="setting"><div><div class="s-label">Password</div><div class="s-help">We'll email you a link to choose a new one.</div></div><button class="btn sm" data-resetpw>Change password</button></div>` : ''}
<div class="setting"><div><div class="s-label">Log out</div><div class="s-help">Your chats stay in your account and are removed from this device.</div></div><button class="btn sm" data-logout>${icon('logout', 'icon-sm')} Log out</button></div>
<div class="setting"><div><div class="s-label">Delete account</div><div class="s-help">Permanently deletes your account and everything synced to it.</div></div><button class="btn sm danger" data-delacct>Delete account</button></div>`;
}

export function bindAccountSettings(panel, rerender) {
  const q = (s) => panel.querySelector(s);
  q('[data-login]')?.addEventListener('click', () => openLogin({ onDone: rerender }));
  q('[data-signup]')?.addEventListener('click', () => openLogin({ mode: 'signup', onDone: rerender }));
  q('[data-verify]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await resendVerification(); toast('Sent. Check your inbox.'); } catch (err) { toast(authMessage(err), { type: 'error' }); b.disabled = false; }
  });
  q('[data-acctname]')?.addEventListener('change', async (e) => {
    try { await setAccountName(e.target.value); toast('Name updated'); } catch (err) { toast(authMessage(err), { type: 'error' }); }
  });
  q('[data-syncnow]')?.addEventListener('click', () => syncNow().catch(() => {}));
  q('[data-resetpw]')?.addEventListener('click', async () => {
    try { await resetPassword(current.email); toast(`We emailed a link to ${current.email}.`); } catch (err) { toast(authMessage(err), { type: 'error' }); }
  });
  q('[data-logout]')?.addEventListener('click', () => confirmLogOut(rerender));
  q('[data-delacct]')?.addEventListener('click', () => confirmDelete(rerender));
}

/** Ask, then log out. */
export function confirmLogOut(after) {
  const m = openModal({
    title: 'Log out of Nova?', size: 'small',
    body: `<p>Your chats, memory and Premium stay safe in your account${current?.email ? ` (${esc(current.email)})` : ''} and are removed from this device. Log in again any time to get them back.</p><div class="auth-msg" data-msg></div>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn solid" data-go>Log out</button>',
  });
  const go = m.el.querySelector('[data-go]');
  go.onclick = async () => {
    go.disabled = true;
    const force = go.dataset.force === '1';
    const r = await logOut({ force });
    if (r === 'unsynced') {
      const el = m.el.querySelector('[data-msg]');
      el.className = 'auth-msg err';
      el.textContent = "Some recent changes haven't been saved to your account yet (you may be offline). If you log out now, they'll be lost.";
      go.textContent = 'Log out anyway';
      go.dataset.force = '1';
      go.disabled = false;
      return;
    }
    m.close();
    toast('Logged out');
    after?.();
  };
}

function confirmDelete(after) {
  const pw = current?.provider === 'password';
  const via = PROVIDERS[current?.provider] || 'your account';
  const m = openModal({
    title: 'Delete your account?', size: 'small',
    body: `<p>This permanently deletes your Nova account and everything synced to it: chats, memory, agents and personalization. It can't be undone.</p>
${isPremium() ? '<p><b>Deleting your account doesn\'t cancel a Premium subscription.</b> Cancel it first in Settings → Premium → Manage.</p>' : ''}
${pw ? '<input class="field" type="password" data-pw placeholder="Enter your password to confirm" autocomplete="current-password" style="width:100%">' : `<p class="s-help">To confirm, you'll sign in with ${esc(via)} once more.</p>`}
<div class="auth-msg" data-msg role="status"></div>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn danger fill" data-go>Delete account</button>',
  });
  const go = m.el.querySelector('[data-go]');
  const say = (t, type = 'err') => { const el = m.el.querySelector('[data-msg]'); el.className = `auth-msg ${type}`; el.textContent = t; };
  go.onclick = () => {
    const password = m.el.querySelector('[data-pw]')?.value || '';
    if (pw && !password) { say('Enter your password.'); return; }
    go.disabled = true;
    say('Deleting…', '');
    deleteAccount({ password }).then(() => {
      m.close();
      toast('Your account was deleted');
      after?.();
    }, (e) => {
      go.disabled = false;
      say(authMessage(e) || 'Cancelled.');
    });
  };
}

/** Premium hook: buying needs an account when accounts are on. */
export function requireAccount(next, reason) {
  if (!accountsEnabled() || current) return true;
  openLogin({ mode: 'signup', reason, onDone: next });
  return false;
}

/** Premium hook: pre-fill the checkout with the account's email and ID. */
export function checkoutParams() {
  return current ? { prefilled_email: current.email || '', client_reference_id: current.uid } : {};
}
