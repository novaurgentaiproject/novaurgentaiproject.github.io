// Persistent state: settings (localStorage), chats (IndexedDB), memory and agents.
import { MODELS, DEFAULT_MODEL } from './models.js';
import { uid } from './util.js';

const LS_SETTINGS = 'nova:settings';
const LS_MEMORY = 'nova:memory';
const LS_AGENTS = 'nova:agents';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontScale: 1,
  sendOnEnter: true,
  showThinking: true,
  model: DEFAULT_MODEL,
  engine: 'local', // 'local' | 'claude'
  anthropicKey: '',
  modelMap: Object.fromEntries(MODELS.map((m) => [m.id, { ...m.claude }])),
  imageEngine: 'auto', // 'auto' | 'studio' | 'claude' | 'cloud'
  liveData: true,
  name: '',
  about: '',
  style: '',
  personality: 'default',
  memoryEnabled: true,
  voice: '',
  speechRate: 1,
  autoRead: false,
};

// ---------- tiny event bus ----------
const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, data) {
  listeners.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
}

// ---------- settings ----------
function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.warn('storage full', e); }
}

export const settings = (() => {
  const saved = loadJSON(LS_SETTINGS, {});
  const s = { ...DEFAULT_SETTINGS, ...saved };
  s.modelMap = { ...DEFAULT_SETTINGS.modelMap, ...(saved.modelMap || {}) };
  if (!MODELS.some((m) => m.id === s.model)) s.model = DEFAULT_MODEL;
  return s;
})();

export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  saveJSON(LS_SETTINGS, settings);
  emit('settings', settings);
}

export function engineReady() {
  return settings.engine === 'claude' && !!settings.anthropicKey;
}

// ---------- memory ----------
export const memory = loadJSON(LS_MEMORY, []);
export function addMemory(text) {
  text = String(text || '').trim();
  if (!text || memory.some((m) => m.text.toLowerCase() === text.toLowerCase())) return false;
  memory.push({ id: uid('m'), text, at: Date.now() });
  saveJSON(LS_MEMORY, memory);
  emit('memory', memory);
  return true;
}
export function removeMemory(id) {
  const i = memory.findIndex((m) => m.id === id);
  if (i >= 0) memory.splice(i, 1);
  saveJSON(LS_MEMORY, memory);
  emit('memory', memory);
}
export function clearMemory() { memory.length = 0; saveJSON(LS_MEMORY, memory); emit('memory', memory); }

// ---------- custom agents ----------
export const customAgents = loadJSON(LS_AGENTS, []);
export function saveAgents() { saveJSON(LS_AGENTS, customAgents); emit('agents', customAgents); }

// ---------- chats (IndexedDB with localStorage fallback) ----------
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    const req = indexedDB.open('nova', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbp;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction('chats', mode);
    const store = t.objectStore('chats');
    const r = fn(store);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const chats = new Map();

export async function loadChats() {
  const db = await openDB();
  let list = [];
  if (db) {
    try { list = await tx(db, 'readonly', (s) => s.getAll()); } catch (e) { console.warn(e); }
  } else {
    list = loadJSON('nova:chats', []);
  }
  (list || []).forEach((c) => chats.set(c.id, c));
  return chats;
}

const pendingSaves = new Map();
export function saveChat(chat, immediate = false) {
  if (!chat || chat.temporary) return;
  chat.updatedAt = chat.updatedAt || Date.now();
  chats.set(chat.id, chat);
  clearTimeout(pendingSaves.get(chat.id));
  const run = async () => {
    pendingSaves.delete(chat.id);
    const db = await openDB();
    const clean = JSON.parse(JSON.stringify(chat));
    if (db) {
      try { await tx(db, 'readwrite', (s) => s.put(clean)); } catch (e) { console.warn('save failed', e); }
    } else {
      saveJSON('nova:chats', [...chats.values()].filter((c) => !c.temporary));
    }
  };
  if (immediate) return run();
  pendingSaves.set(chat.id, setTimeout(run, 400));
}

export async function deleteChat(id) {
  chats.delete(id);
  const db = await openDB();
  if (db) { try { await tx(db, 'readwrite', (s) => s.delete(id)); } catch {} }
  else saveJSON('nova:chats', [...chats.values()]);
  emit('chats');
}

export async function deleteAllChats() {
  chats.clear();
  const db = await openDB();
  if (db) { try { await tx(db, 'readwrite', (s) => s.clear()); } catch {} }
  else saveJSON('nova:chats', []);
  emit('chats');
}

export function newChat({ temporary = false, agentId = null } = {}) {
  return {
    id: uid('c'),
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    temporary,
    agentId,
    messages: [],
  };
}

export function exportAll() {
  return {
    app: 'nova',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, anthropicKey: '' },
    memory,
    agents: customAgents,
    chats: [...chats.values()],
  };
}

export async function importAll(data) {
  if (!data || data.app !== 'nova') throw new Error('This file is not a Nova export.');
  for (const c of data.chats || []) { chats.set(c.id, c); await saveChat(c, true); }
  if (Array.isArray(data.memory)) { data.memory.forEach((m) => { if (!memory.some((x) => x.id === m.id)) memory.push(m); }); saveJSON(LS_MEMORY, memory); }
  if (Array.isArray(data.agents)) { data.agents.forEach((a) => { if (!customAgents.some((x) => x.id === a.id)) customAgents.push(a); }); saveAgents(); }
  emit('chats');
}
