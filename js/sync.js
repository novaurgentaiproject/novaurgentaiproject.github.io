// Account sync: keeps chats, memory, custom agents, personalization and Premium
// the same on every device a person is logged in on. Data lives in Firebase
// Firestore under users/{uid}; only that user can read or write it (see
// accounts/firestore.rules).
//
//   users/{uid}               { memory, agents, profile, premium }  each { at, data }
//   users/{uid}/chats/{id}    { rev, ts, title, updatedAt, data: compressed chat } or { rev, ts, deleted: true }
//
// Conflicts resolve "newest change wins": chats by their `rev` (time of the last
// change), the other groups by `at`. API keys and device settings never leave the device.

import { chats, saveChat, deleteChat, memory, setMemory, customAgents, saveAgents, settings, saveSettings, on, emit } from './state.js';
import { deflate, inflate } from './util.js';
import { exportPremium, importPremium, isPremium } from './premium.js';

const GROUPS = ['memory', 'agents', 'profile'];
const PROFILE_KEYS = ['name', 'about', 'style', 'personality'];
const MAX_BYTES = 900_000; // Firestore documents can be at most 1 MiB
const LS_GROUPS = 'nova:sync-groups';
const metaKey = (uid) => `nova:sync:${uid}`;

let fs = null; // Firestore (lite) module
let db = null;
let uid = null;
let meta = null;
let applying = false;
let pushTimer = 0;
let pullTimer = 0;
let running = null;
const dirty = new Set(); // chat ids changed on this device
const removed = new Set(); // chat ids deleted on this device
const groupsDirty = new Set();
const tooBig = new Set();

export const syncState = { status: 'off', at: 0, error: '', tooBig: 0 };
function setStatus(status, error = '') {
  syncState.status = status;
  syncState.error = error;
  syncState.tooBig = tooBig.size;
  if (status === 'synced') syncState.at = Date.now();
  emit('sync', { ...syncState });
}

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };
const groupAt = (g) => read(LS_GROUPS, {})[g] || 0;
function setGroupAt(g, at) { const all = read(LS_GROUPS, {}); all[g] = at; write(LS_GROUPS, all); }
const saveMeta = () => uid && write(metaKey(uid), meta);
const profileJSON = () => JSON.stringify(PROFILE_KEYS.map((k) => settings[k] ?? ''));
let lastProfile = profileJSON();

// ---------------------------------------------------------------------------
// Watch local changes
// ---------------------------------------------------------------------------
function touch(group) {
  if (applying) return;
  setGroupAt(group, Date.now());
  if (uid) { groupsDirty.add(group); schedulePush(); }
}
// (Changes applied from the account are saved with `sync: false`, so they don't come through here.)
on('chat-saved', (c) => { if (!uid) return; dirty.add(c.id); removed.delete(c.id); schedulePush(); });
on('chat-deleted', (id) => { if (!uid) return; dirty.delete(id); removed.add(id); schedulePush(); });
on('memory', () => touch('memory'));
on('agents', () => touch('agents'));
on('settings', () => { const p = profileJSON(); if (p !== lastProfile) { lastProfile = p; touch('profile'); } });
on('premium', () => { if (uid && isPremium()) { groupsDirty.add('premium'); schedulePush(); } });

function schedulePush(ms = 2500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow({ pull: false }), ms);
}

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------
export function startSync({ firestore, database, userId }) {
  if (uid === userId) return syncNow();
  stopSync();
  fs = firestore; db = database; uid = userId;
  meta = read(metaKey(uid), null);
  if (!meta) {
    // First time this account syncs on this device: upload what's already here,
    // and merge (rather than replace) memories and agents.
    meta = { cursor: null, pushed: {}, merge: true };
    for (const c of chats.values()) if (!c.temporary && c.messages?.length) dirty.add(c.id);
  }
  saveMeta();
  syncNow();
  pullTimer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 120e3);
  return running;
}

export function stopSync() {
  clearTimeout(pushTimer);
  clearInterval(pullTimer);
  uid = null; fs = null; db = null; meta = null;
  dirty.clear(); removed.clear(); groupsDirty.clear(); tooBig.clear();
  setStatus('off');
}

/** Forget this device's sync progress for an account (after logging out). */
export function resetSyncMeta(id) {
  try { localStorage.removeItem(metaKey(id)); localStorage.removeItem(LS_GROUPS); } catch { /* storage unavailable */ }
  lastProfile = profileJSON();
}

/** Run a function without its changes being recorded as local edits. */
export async function quietly(fn) {
  applying = true;
  try { return await fn(); } finally { applying = false; lastProfile = profileJSON(); }
}

document.addEventListener('visibilitychange', () => { if (uid && document.visibilityState === 'visible') syncNow(); });
addEventListener('online', () => { if (uid) syncNow(); });

/** Pull changes from the account, then push this device's changes. */
export function syncNow({ pull = true } = {}) {
  if (!uid) return Promise.resolve();
  if (running) { if (!pull) schedulePush(); return running; }
  running = (async () => {
    const me = uid;
    try {
      setStatus('syncing');
      if (pull) await pullAll();
      if (uid !== me) return;
      await pushAll();
      if (uid !== me) return;
      saveMeta();
      setStatus('synced');
    } catch (e) {
      console.warn('sync failed', e);
      if (uid === me) setStatus(navigator.onLine === false ? 'offline' : 'error', friendly(e));
      throw e;
    } finally {
      running = null;
      if (uid === me && (dirty.size || removed.size || groupsDirty.size)) schedulePush(5000);
    }
  })();
  running.catch(() => {});
  return running;
}

/** Push anything waiting (e.g. before logging out). Rejects if it can't. */
export async function flushSync() {
  if (!uid) return;
  clearTimeout(pushTimer);
  if (running) await running.catch(() => {});
  await syncNow({ pull: false });
}

export const hasUnsynced = () => !!(dirty.size || removed.size || groupsDirty.size);

function friendly(e) {
  const code = String(e?.code || '');
  if (code.includes('permission-denied')) return "Your account's data couldn't be accessed. Check the Firestore security rules.";
  if (code.includes('unavailable') || navigator.onLine === false) return "You're offline. Nova will sync when you're back online.";
  if (code.includes('resource-exhausted')) return 'The sync limit for today was reached. Nova will try again later.';
  return e?.message || 'Sync failed.';
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------
async function pullAll() {
  const me = uid;
  const snap = await fs.getDoc(fs.doc(db, 'users', me));
  const remote = snap.exists() ? snap.data() : {};
  if (uid !== me) return;
  const changed = [];

  for (const g of GROUPS) {
    const r = remote[g];
    const localAt = groupAt(g);
    if (r && meta.merge && g !== 'profile') {
      await quietly(() => applyGroup(g, r.data, true));
      groupsDirty.add(g);
      setGroupAt(g, Date.now());
    } else if (r && (r.at || 0) > localAt) {
      await quietly(() => applyGroup(g, r.data, false));
      setGroupAt(g, r.at);
    } else if (!r ? localAt > 0 : localAt > (r.at || 0)) {
      groupsDirty.add(g);
    }
  }
  if (remote.premium?.data && !isPremium()) await importPremium(remote.premium.data);
  if (isPremium() && JSON.stringify(exportPremium()) !== JSON.stringify(remote.premium?.data || null)) groupsDirty.add('premium');

  // Chats changed since the last pull (by server time).
  const col = fs.collection(db, 'users', me, 'chats');
  let last = null;
  for (let page = 0; page < 50; page++) {
    const parts = [];
    if (meta.cursor) parts.push(fs.where('ts', '>', new fs.Timestamp(meta.cursor.s, meta.cursor.n)));
    parts.push(fs.orderBy('ts'));
    if (last) parts.push(fs.startAfter(last));
    parts.push(fs.limit(200));
    const res = await fs.getDocs(fs.query(col, ...parts));
    if (uid !== me) return;
    for (const d of res.docs) if (await applyChat(d.id, d.data())) changed.push(d.id);
    if (res.docs.length) {
      last = res.docs[res.docs.length - 1];
      const ts = last.get('ts');
      if (ts) meta.cursor = { s: ts.seconds, n: ts.nanoseconds };
    }
    if (res.docs.length < 200) break;
  }
  meta.merge = false;
  saveMeta();
  if (changed.length) emit('synced', { changed });
}

function applyGroup(g, data, merge) {
  if (g === 'memory') {
    const list = Array.isArray(data) ? data : [];
    if (merge) {
      const all = [...memory];
      for (const m of list) if (!all.some((x) => x.id === m.id || x.text.toLowerCase() === String(m.text).toLowerCase())) all.push(m);
      setMemory(all);
    } else setMemory(list);
  } else if (g === 'agents') {
    const list = Array.isArray(data) ? data : [];
    if (merge) { for (const a of list) if (!customAgents.some((x) => x.id === a.id)) customAgents.push(a); }
    else { customAgents.length = 0; customAgents.push(...list); }
    saveAgents();
  } else if (g === 'profile' && data && typeof data === 'object') {
    saveSettings(Object.fromEntries(PROFILE_KEYS.filter((k) => k in data).map((k) => [k, data[k]])));
  }
}

async function applyChat(id, r) {
  const local = chats.get(id);
  if (dirty.has(id) && local && (local.rev || 0) > (r.rev || 0)) return false; // our newer edit wins
  if (r.deleted) {
    if (!local || (local.rev || 0) > (r.rev || 0)) return false;
    await quietly(() => deleteChat(id, { sync: false }));
    meta.pushed[id] = r.rev;
    return true;
  }
  if (local && (local.rev || 0) >= (r.rev || 0)) return false;
  let chat;
  try { chat = JSON.parse(await inflate(r.data.toUint8Array())); } catch (e) { console.warn('bad synced chat', id, e); return false; }
  chat.id = id;
  chat.rev = r.rev;
  chat.temporary = false;
  await quietly(() => saveChat(chat, true, { sync: false }));
  meta.pushed[id] = r.rev;
  dirty.delete(id);
  return true;
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------
/** A copy of the chat without things that can't or needn't sync (large embedded media, blob links). */
function slim(chat) {
  return JSON.stringify(chat, (k, v) => {
    if (k === 'objectUrl' || k === '_cache' || k === 'temporary') return undefined;
    if (typeof v === 'string' && v.length > 60000 && v.startsWith('data:')) return undefined;
    return v;
  });
}

function groupData(g) {
  if (g === 'memory') return memory;
  if (g === 'agents') return customAgents;
  if (g === 'profile') return Object.fromEntries(PROFILE_KEYS.map((k) => [k, settings[k] ?? '']));
  if (g === 'premium') return exportPremium();
  return null;
}

async function pushAll() {
  const me = uid;
  if (groupsDirty.size) {
    const groups = [...groupsDirty];
    groupsDirty.clear();
    const patch = {};
    for (const g of groups) {
      const data = groupData(g);
      if (g === 'premium' && !data) continue;
      patch[g] = { at: g === 'premium' ? Date.now() : groupAt(g) || Date.now(), data: JSON.parse(JSON.stringify(data ?? null)) };
    }
    try {
      if (Object.keys(patch).length) await fs.setDoc(fs.doc(db, 'users', me), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true });
    } catch (e) { groups.forEach((g) => groupsDirty.add(g)); throw e; }
  }

  const dels = [...removed];
  const ids = [...dirty];
  removed.clear(); dirty.clear();
  let batch = fs.writeBatch(db);
  let size = 0, ops = 0;
  const done = [];
  const commit = async () => {
    if (!ops) return;
    await batch.commit();
    for (const [id, rev] of done) meta.pushed[id] = rev;
    done.length = 0;
    batch = fs.writeBatch(db); size = 0; ops = 0;
  };
  try {
    for (const id of dels) {
      const rev = Date.now();
      batch.set(fs.doc(db, 'users', me, 'chats', id), { rev, deleted: true, ts: fs.serverTimestamp() });
      ops++; done.push([id, rev]);
      tooBig.delete(id);
    }
    for (const id of ids) {
      const c = chats.get(id);
      if (!c || c.temporary || !c.messages?.length) continue;
      if (meta.pushed[id] && meta.pushed[id] === c.rev) continue;
      const bytes = await deflate(slim(c));
      if (bytes.length > MAX_BYTES) { tooBig.add(id); continue; }
      tooBig.delete(id);
      if (size + bytes.length > 8_000_000 || ops >= 400) await commit();
      batch.set(fs.doc(db, 'users', me, 'chats', id), {
        rev: c.rev || Date.now(), title: String(c.title || '').slice(0, 200), updatedAt: c.updatedAt || Date.now(),
        deleted: false, data: fs.Bytes.fromUint8Array(bytes), ts: fs.serverTimestamp(),
      });
      size += bytes.length; ops++; done.push([id, c.rev]);
    }
    await commit();
  } catch (e) {
    dels.forEach((id) => removed.add(id));
    ids.forEach((id) => dirty.add(id));
    throw e;
  }
}

/** Delete everything stored for this account (before deleting the account itself). */
export async function deleteCloudData({ firestore, database, userId }) {
  const col = firestore.collection(database, 'users', userId, 'chats');
  for (;;) {
    const res = await firestore.getDocs(firestore.query(col, firestore.limit(400)));
    if (!res.docs.length) break;
    const b = firestore.writeBatch(database);
    res.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  await firestore.deleteDoc(firestore.doc(database, 'users', userId));
}
