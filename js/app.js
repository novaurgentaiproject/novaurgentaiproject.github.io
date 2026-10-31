// Nova — main application controller.
import { $, $$, esc, h, uid, throttleRaf, copyText, download, dataURLtoBlob, relDay, truncate, capitalize, onKey, isMac, inflate, b64urlToBytes, sleep } from './util.js';
import { icon, hydrateIcons } from './icons.js';
import { settings, saveSettings, chats, loadChats, saveChat, deleteChat, newChat as makeChat, on, engineReady, addMemory, savedWidgets, persistWidgets, widgetState, setWidgetState } from './state.js';
import { MODELS, getModel, modelGradient } from './models.js';
import { codeRegistry } from './markdown.js';
import { messageEl, updateAssistant, patchImages, blocks, uiFrames, ensureImage, TOOLS } from './render.js';
import { wrapUI } from './tools/genui.js';
import { respond } from './engines/index.js';
import { claudeComplete } from './engines/claude.js';
import { openMenu, closeMenu, toast, confirmDialog, promptDialog, lightbox, topModal } from './ui.js';
import { openSettings, openSearch, openLibrary, openAgents, openShortcuts, openShare, exportChat, previewFile, previewUI, openCamera, chatToMarkdown, openWidgets } from './modals.js';
import { allAgents, getAgent } from './agents.js';
import { readAttachment, buildFile, describeAttachment, fileBadge } from './tools/files.js';
import { cleanImagePrompt } from './tools/imagegen.js';
import { openCanvas, closeCanvas, isCanvasOpen } from './tools/canvas.js';
import { createRecognizer, canRecognize, canRecord, startRecording, speak, stopSpeaking, isSpeaking, openVoiceMode, formatDuration } from './tools/voice.js';

const S = {
  chat: null,
  tool: null,
  attachments: [],
  streaming: null,
  recorder: null,
  dictation: null,
  shared: null,
  voice: null,
  voiceResolve: null,
  stick: true,
  theme: null,
};

const els = {
  app: $('#app'), stage: $('#stage'), thread: $('#thread'), scroller: $('#scroller'), prompt: $('#prompt'), composer: $('#composer'),
  attachRow: $('#attach-row'), toolSlot: $('#tool-slot'), send: $('#send-btn'), stop: $('#stop-btn'), voice: $('#voice-btn'), dictate: $('#dictate-btn'),
  plus: $('#plus-btn'), modelBtn: $('#model-btn'), modelName: $('#model-name'), engineTag: $('#engine-tag'), shareBtn: $('#share-btn'), tempBtn: $('#temp-btn'),
  chatMenuBtn: $('#chat-menu-btn'), hero: $('#home-hero'), suggest: $('#home-suggest'), chatList: $('#chat-list'), agentShortcuts: $('#agent-shortcuts'),
  scrollDown: $('#scroll-down'), recorder: $('#recorder'), fileInput: $('#file-input'), drop: $('#drop-overlay'), shareBanner: $('#share-banner'),
};

// Home Screen app: remember the open chat so relaunching resumes it.
const STANDALONE = document.documentElement.classList.contains('standalone');
function rememberChat(chat) {
  if (!STANDALONE) return;
  try {
    if (chat && !chat.temporary && chat.messages.length) localStorage.setItem('nova:last', JSON.stringify({ id: chat.id, at: Date.now() }));
    else localStorage.removeItem('nova:last');
  } catch { /* storage unavailable */ }
}
function lastChatId() {
  try {
    const last = JSON.parse(localStorage.getItem('nova:last') || 'null');
    return last && Date.now() - last.at < 6 * 3600e3 ? last.id : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Settings / chrome
// ---------------------------------------------------------------------------
function resolvedTheme() {
  return settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
}

function applySettings() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--font-scale', settings.fontScale || 1);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fbfbff' : '#070a1c');
  const themeChanged = S.theme && S.theme !== theme;
  S.theme = theme;
  updateTopbar();
  updateEngineCard();
  updateProfile();
  updatePlaceholder();
  if (themeChanged && S.chat?.messages.length) renderThread();
}

function currentModelId() { return S.chat?.model || settings.model; }

function updateTopbar() {
  const m = getModel(currentModelId());
  const agent = getAgent(S.chat?.agentId);
  els.modelName.textContent = agent ? `${agent.name}` : m.name;
  els.engineTag.textContent = agent ? m.name : engineReady() ? 'Claude' : 'On-device';
  const has = !!S.chat?.messages.length;
  els.shareBtn.hidden = !has || S.chat?.temporary || !!S.shared;
  els.chatMenuBtn.hidden = !has || !!S.shared;
  els.tempBtn.classList.toggle('temp-on', !!S.chat?.temporary);
  els.tempBtn.title = S.chat?.temporary ? 'Temporary chat is on — this chat won\'t be saved' : 'Temporary chat';
  els.tempBtn.hidden = has && !S.chat?.temporary;
  document.title = S.chat?.messages.length ? `${S.chat.title} · Nova` : 'Nova';
}

function updateEngineCard() {
  const card = $('#engine-card');
  const on = engineReady();
  card.innerHTML = `<span class="dot${on ? '' : ' local'}"></span><span><b>${on ? 'Claude connected' : 'On-device engine'}</b><small>${on ? 'All six models run on Claude' : 'Connect Claude for full AI'}</small></span>`;
}

function updateProfile() {
  const name = settings.name || 'You';
  $('#profile-avatar').textContent = (name.trim()[0] || 'N').toUpperCase();
  $('#profile-name').textContent = name;
  $('#profile-sub').textContent = engineReady() ? 'Nova + Claude' : 'Nova · on-device';
}

function updatePlaceholder() {
  const agent = getAgent(S.chat?.agentId);
  els.prompt.placeholder = S.tool ? TOOLS[S.tool].placeholder : agent ? `Message ${agent.name}` : S.chat?.messages.length ? 'Ask anything' : 'Ask anything';
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function renderSidebar() {
  const list = [...chats.values()].filter((c) => !c.temporary && c.messages.length).sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = list.filter((c) => c.pinned);
  const rest = list.filter((c) => !c.pinned);
  let html = '';
  const item = (c) => `<div class="chat-item${S.chat?.id === c.id ? ' active' : ''}" data-chat="${c.id}"><button class="chat-link" data-action="open-chat" title="${esc(c.title)}">${c.agentId ? `${esc(getAgent(c.agentId)?.emoji || '')} ` : ''}${esc(c.title)}</button><button class="more" data-action="chat-item-menu" aria-label="Chat options">${icon('more', 'icon-sm')}</button></div>`;
  if (pinned.length) html += `<div class="side-label">Pinned</div>${pinned.map(item).join('')}`;
  let group = '';
  for (const c of rest) {
    const g = relDay(c.updatedAt);
    if (g !== group) { html += `<div class="side-label">${esc(g)}</div>`; group = g; }
    html += item(c);
  }
  if (!list.length) html = `<div class="side-label">Chats</div><div class="side-empty">Your conversations will appear here.</div>`;
  els.chatList.innerHTML = html;

  const used = [];
  for (const c of list) if (c.agentId && !used.includes(c.agentId) && getAgent(c.agentId)) used.push(c.agentId);
  const agents = used.slice(0, 3).map(getAgent);
  els.agentShortcuts.innerHTML = agents.length ? `<div class="side-label">Agents</div>${agents.map((a) => `<button class="nav-item" data-action="agent-chat" data-agent="${esc(a.id)}"><span class="emoji">${esc(a.emoji)}</span>${esc(a.name)}</button>`).join('')}` : '';
}

function toggleSidebar(force) {
  const collapsed = force ?? !els.app.classList.contains('sidebar-collapsed');
  els.app.classList.toggle('sidebar-collapsed', collapsed);
  if (innerWidth > 820) localStorage.setItem('nova:sidebar', collapsed ? 'collapsed' : 'open');
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
const SUGGESTIONS = [
  { icon: 'image', label: 'Create image', tool: 'image' },
  { icon: 'globe', label: 'AI Mode', tool: 'search' },
  { icon: 'layout', label: 'Dynamic View', tool: 'dynamic' },
  { icon: 'code', label: 'Code', text: 'Build a to-do app in HTML' },
  { icon: 'compass', label: 'Deep research', tool: 'research' },
  { icon: 'book', label: 'Study', tool: 'study' },
  { icon: 'filePlus', label: 'Make a file', tool: 'file' },
  { icon: 'sparkles', label: 'Surprise me', surprise: true },
];
const SURPRISES = ['Create an image of a synthwave sunset over the ocean', 'Build me a solar system explorer', 'Write a poem about the stars', 'Weather in Tokyo', 'Quiz me on black holes', 'Make a pomodoro timer', 'What is the Great Barrier Reef?', 'Convert 100 USD to EUR', 'Play tic-tac-toe with me', 'Write a short story about a robot who paints', 'Build a gravity playground', 'Create an image of an aurora over a pine forest, 16:9'];

function renderHome() {
  const agent = getAgent(S.chat?.agentId);
  if (agent) {
    els.hero.className = 'home-hero agent-hero';
    els.hero.innerHTML = `<span class="avatar">${esc(agent.emoji)}</span><h1 class="home-greeting">${esc(agent.name)}</h1><p class="home-sub">${esc(agent.desc || '')}</p>${agent.starters?.length ? `<div class="starter-grid">${agent.starters.map((s) => `<button class="starter" data-action="starter" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}`;
    els.suggest.innerHTML = '';
    return;
  }
  els.hero.className = 'home-hero';
  const h = new Date().getHours();
  const first = settings.name ? settings.name.split(' ')[0] : '';
  const greetings = [
    'What can I help with?', 'Where should we begin?', "What's on your mind today?", 'Ready when you are.',
    first ? `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${first}` : `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'} ✦`,
  ];
  const g = greetings[Math.floor(Math.random() * greetings.length)];
  const m = getModel(currentModelId());
  els.hero.innerHTML = `<div class="home-orb"><img src="assets/nova-logo.svg" alt=""></div><h1 class="home-greeting">${esc(g)}</h1><p class="home-sub">${S.chat?.temporary ? '👻 Temporary chat — this conversation won\'t be saved to your history.' : `You're chatting with <b class="grad-text">${esc(m.name)}</b>`}</p>`;
  els.suggest.innerHTML = SUGGESTIONS.map((s, i) => `<button class="suggest-chip" data-action="suggest" data-i="${i}">${icon(s.icon, 'icon-sm')}${esc(s.label)}</button>`).join('');
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------
function setStageEmpty() {
  els.stage.classList.toggle('is-empty', !S.chat?.messages.length);
}

function newChat({ agentId = null, temporary = false } = {}) {
  if (S.streaming) stopGenerating();
  if (isCanvasOpen()) closeCanvas();
  S.shared = null;
  els.shareBanner.hidden = true;
  const agent = getAgent(agentId);
  S.chat = makeChat({ agentId, temporary });
  S.chat.model = agent?.model || settings.model;
  S.tool = agent?.tool || null;
  S.attachments = [];
  renderAttachments();
  renderToolChip();
  els.thread.innerHTML = '';
  setStageEmpty();
  renderHome();
  renderSidebar();
  updateTopbar();
  updatePlaceholder();
  if (location.hash) history.replaceState(null, '', location.pathname);
  rememberChat(null);
  if (innerWidth <= 820) toggleSidebar(true);
  els.prompt.focus();
}

function openChat(id) {
  const c = chats.get(id);
  if (!c) return;
  if (S.streaming && S.streaming.chatId !== id) { /* keep generating in background */ }
  S.shared = null;
  els.shareBanner.hidden = true;
  if (isCanvasOpen() && S.chat?.id !== id) closeCanvas();
  S.chat = c;
  S.tool = null;
  renderToolChip();
  renderThread();
  renderSidebar();
  updateTopbar();
  updatePlaceholder();
  history.replaceState(null, '', `#c=${id}`);
  rememberChat(c);
  if (innerWidth <= 820) toggleSidebar(true);
}

function renderThread() {
  els.thread.innerHTML = '';
  const chat = S.chat;
  setStageEmpty();
  if (!chat?.messages.length) { renderHome(); return; }
  const frag = document.createDocumentFragment();
  for (const m of chat.messages) {
    const streaming = S.streaming?.msgId === m.id;
    frag.appendChild(messageEl(chat, m, { streaming }));
  }
  els.thread.appendChild(frag);
  S.stick = true;
  requestAnimationFrame(() => scrollToBottom(true));
}

function msgElById(id) { return els.thread.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); }

function makeTitle(text, tool, atts) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t && atts?.length) t = atts[0].kind === 'audio' && atts[0].transcript ? atts[0].transcript : atts[0].name;
  if (tool === 'image') t = cleanImagePrompt(t);
  t = t.replace(/^(please|can you|could you|hey nova,?|nova,?|hi,?|hello,?)\s+/i, '').replace(/[?.!]+$/, '');
  t = t.split(' ').slice(0, 7).join(' ');
  return capitalize(truncate(t, 52)) || 'New chat';
}

async function smartTitle(chat) {
  if (!engineReady() || chat.temporary || chat._titled) return;
  chat._titled = true;
  const u = chat.messages[0], a = chat.messages[1];
  try {
    const t = await claudeComplete({
      apiKey: settings.anthropicKey, model: settings.modelMap['nova-1-flash']?.model || 'claude-haiku-5-5', effort: 'low', maxTokens: 2000,
      system: 'Write a short, specific 2–6 word title for this conversation. Reply with only the title — no quotes or punctuation at the end.',
      prompt: `User: ${truncate(u.content || '(attachment)', 600)}\n\nAssistant: ${truncate(a.versions[a.active].content || '', 600)}`,
    });
    const clean = t.trim().replace(/^["'#\s]+|["'.\s]+$/g, '').slice(0, 60);
    if (clean) { chat.title = clean; saveChat(chat); renderSidebar(); updateTopbar(); }
  } catch { /* keep heuristic title */ }
}

// ---------------------------------------------------------------------------
// Sending & generation
// ---------------------------------------------------------------------------
function newVersion(model) { return { content: '', thinking: '', model, createdAt: Date.now(), artifacts: {} }; }

async function send(text, { tool = S.tool, attachments = null } = {}) {
  text = (text ?? '').trim();
  const atts = attachments ?? S.attachments.filter((a) => !a.loading);
  if (S.attachments.some((a) => a.loading)) { toast('Still reading your attachment…'); return; }
  if (!text && !atts.length) return;
  if (S.streaming) { toast('Nova is still responding — stop it first or wait a moment.'); return; }
  if (S.shared) await continueShared();
  stopDictation();
  stopSpeaking();
  if (!S.chat) newChat();
  const chat = S.chat;
  const user = { id: uid('m'), role: 'user', content: text, attachments: atts.map(({ loading, ...a }) => a), tool, createdAt: Date.now() };
  const asst = { id: uid('m'), role: 'assistant', model: chat.model || settings.model, versions: [newVersion(chat.model || settings.model)], active: 0, createdAt: Date.now() };
  const first = !chat.messages.length;
  chat.messages.push(user, asst);
  if (first) chat.title = makeTitle(text, tool, atts);
  chat.updatedAt = Date.now();
  if (!chat.temporary) chats.set(chat.id, chat);
  S.attachments = [];
  renderAttachments();
  els.prompt.value = '';
  autosize();
  if (first) renderThread();
  else {
    els.thread.appendChild(messageEl(chat, user));
    els.thread.appendChild(messageEl(chat, asst, { streaming: true }));
  }
  setStageEmpty();
  if (!chat.temporary) history.replaceState(null, '', `#c=${chat.id}`);
  rememberChat(chat);
  renderSidebar();
  updateTopbar();
  S.stick = true;
  scrollToBottom(true);
  await generate(chat, asst, user, tool);
  if (first && !asst.versions[0].error) smartTitle(chat);
}

async function generate(chat, msg, userMsg, tool = userMsg.tool) {
  const version = msg.versions[msg.active];
  const ctrl = new AbortController();
  S.streaming = { chatId: chat.id, msgId: msg.id, ctrl };
  updateComposerState();
  const draw = throttleRaf(() => {
    if (S.chat !== chat || S.streaming?.msgId !== msg.id) return;
    const el = msgElById(msg.id);
    if (el) { updateAssistant(el, chat, msg, { streaming: true }); if (S.stick) scrollToBottom(); }
  });
  draw();
  try {
    await respond({ chat, userMsg, msg, version, tool, agent: getAgent(chat.agentId), signal: ctrl.signal, update: draw });
  } catch (e) {
    if (e?.name === 'AbortError') version.notice = { type: 'info', text: 'Response stopped.' };
    else { version.error = e?.message || String(e); console.error(e); }
  } finally {
    version.done = true;
    version.finishedAt = Date.now();
    S.streaming = null;
    // Memory blocks written by Claude
    if (version.engine === 'claude' && settings.memoryEnabled) {
      for (const m of version.content.matchAll(/```nova-memory\s*\n([\s\S]*?)```/g)) if (addMemory(m[1].trim())) toast('Memory updated');
    }
    if (S.chat === chat) {
      const el = msgElById(msg.id);
      if (el) updateAssistant(el, chat, msg, { streaming: false });
      if (S.stick) scrollToBottom();
    }
    chat.updatedAt = Date.now();
    saveChat(chat);
    renderSidebar();
    updateTopbar();
    updateComposerState();
    if (S.voiceResolve) { const r = S.voiceResolve; S.voiceResolve = null; r(version.error ? `Sorry — ${version.error}` : version.content); }
    else if (settings.autoRead && version.content && !version.error) speak(version.content);
    if (tool === 'canvas' && S.chat === chat) openFirstCode(msg);
  }
}

function openFirstCode(msg) {
  const el = msgElById(msg.id);
  const id = el?.querySelector('.code-block[data-code]')?.dataset.code;
  if (id) { const c = codeRegistry.get(id); openCanvas({ code: c.code, lang: c.lang, title: S.chat.title, onAsk: (t) => send(t, { tool: 'canvas' }) }); }
}

function stopGenerating() { S.streaming?.ctrl.abort(); }

async function regenerate(msg, modelId = null) {
  if (S.streaming) return;
  const chat = S.chat;
  const i = chat.messages.indexOf(msg);
  const userMsg = chat.messages[i - 1];
  if (!userMsg) return;
  if (modelId) msg.model = modelId;
  msg.versions.push(newVersion(msg.model));
  msg.active = msg.versions.length - 1;
  const el = msgElById(msg.id);
  if (el) { el._cache = {}; updateAssistant(el, chat, msg, { streaming: true }); }
  await generate(chat, msg, userMsg, userMsg.tool);
}

function editUserMessage(msg) {
  const el = msgElById(msg.id);
  if (!el || S.streaming) return;
  const bubble = el.querySelector('.bubble');
  const box = h(`<div class="edit-box"><textarea rows="3"></textarea><div class="row"><button class="btn sm" data-x>Cancel</button><button class="btn solid sm" data-ok>Send</button></div></div>`);
  box.querySelector('textarea').value = msg.content;
  (bubble || el.querySelector('.user-actions')).replaceWith(box);
  el.querySelector('.user-actions')?.remove();
  const ta = box.querySelector('textarea');
  ta.style.height = Math.min(320, ta.scrollHeight + 4) + 'px';
  ta.focus();
  box.querySelector('[data-x]').onclick = () => renderThread();
  const ok = async () => {
    const t = ta.value.trim();
    if (!t) return;
    const chat = S.chat;
    const i = chat.messages.indexOf(msg);
    chat.messages.splice(i + 1);
    msg.content = t;
    const asst = { id: uid('m'), role: 'assistant', model: chat.model, versions: [newVersion(chat.model)], active: 0, createdAt: Date.now() };
    chat.messages.push(asst);
    renderThread();
    await generate(chat, asst, msg, msg.tool);
  };
  box.querySelector('[data-ok]').onclick = ok;
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); } if (e.key === 'Escape') renderThread(); });
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------
function autosize() {
  const ta = els.prompt;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, innerHeight * 0.4) + 'px';
  updateComposerState();
}

function updateComposerState() {
  const streaming = !!S.streaming && S.streaming.chatId === S.chat?.id;
  const hasInput = els.prompt.value.trim() || S.attachments.length;
  els.stop.hidden = !streaming;
  els.send.hidden = streaming || !hasInput;
  els.voice.hidden = streaming || !!hasInput;
  els.send.disabled = !!S.streaming;
}

function renderToolChip() {
  const t = S.tool && TOOLS[S.tool];
  els.toolSlot.innerHTML = t ? `<span class="tool-chip">${icon(t.icon, 'icon-sm')}${esc(t.label)}<button type="button" data-action="clear-tool" aria-label="Remove ${esc(t.label)}">${icon('x', 'icon-sm')}</button></span>` : '';
  updatePlaceholder();
}

function setTool(tool) {
  S.tool = S.tool === tool ? null : tool;
  renderToolChip();
  els.prompt.focus();
}

function renderAttachments() {
  els.attachRow.innerHTML = S.attachments.map((a) => {
    const x = `<button type="button" class="x" data-action="att-remove" data-id="${a.id}" aria-label="Remove ${esc(a.name)}">${icon('x', 'icon-sm')}</button>`;
    if (a.loading) return `<div class="attach loading"><span class="file-ico">${icon('file', 'icon-sm')}</span><span class="meta"><b>${esc(a.name)}</b><small>Reading…</small></span>${x}</div>`;
    if (a.kind === 'image') return `<div class="attach media" title="${esc(a.name)}"><img src="${esc(a.dataUrl)}" alt="">${x}</div>`;
    if (a.kind === 'video') return `<div class="attach media" title="${esc(a.name)}">${a.frames?.[0] ? `<img src="${esc(a.frames[0])}" alt="">` : ''}<span class="badge-play">${icon('play', 'icon-sm')}</span>${x}</div>`;
    const ic = a.kind === 'audio' ? icon('mic', 'icon-sm') : `<span style="font-size:10px;font-weight:800">${esc(fileBadge(a.name))}</span>`;
    return `<div class="attach"><span class="file-ico">${ic}</span><span class="meta"><b>${esc(a.name)}</b><small>${esc(a.kind === 'audio' && a.duration ? `Voice · ${formatDuration(a.duration)}` : describeAttachment(a))}</small></span>${x}</div>`;
  }).join('');
  updateComposerState();
}

async function addFiles(files) {
  const list = [...files].slice(0, 10 - S.attachments.length);
  if (!list.length) { toast('You can attach up to 10 files per message.'); return; }
  for (const f of list) {
    if (f.size > 60e6) { toast(`${f.name} is larger than 60 MB.`, { type: 'error' }); continue; }
    const ph = { id: uid('a'), name: f.name || 'file', loading: true };
    S.attachments.push(ph);
    renderAttachments();
    readAttachment(f).then((a) => {
      const i = S.attachments.indexOf(ph);
      if (i >= 0) S.attachments[i] = a;
      renderAttachments();
      if (a.note) toast(a.note);
    }).catch((e) => {
      S.attachments = S.attachments.filter((x) => x !== ph);
      renderAttachments();
      toast(`Couldn't read ${f.name}: ${e.message}`, { type: 'error' });
    });
  }
  els.prompt.focus();
}

function pickFiles(accept = '') {
  els.fileInput.accept = accept;
  els.fileInput.value = '';
  els.fileInput.click();
}

function plusMenu() {
  const T = (k) => ({ icon: TOOLS[k].icon, label: TOOLS[k].label, desc: TOOLS[k].desc, checked: S.tool === k, onClick: () => setTool(k) });
  openMenu(els.plus, [
    { icon: 'paperclip', label: 'Add photos & files', onClick: () => pickFiles('') },
    { icon: 'video', label: 'Upload a video', onClick: () => pickFiles('video/*') },
    { icon: 'camera', label: 'Take a photo', onClick: async () => { const f = await openCamera(); if (f) addFiles([f]); } },
    { icon: 'mic', label: 'Record a voice message', onClick: startVoiceMessage },
    { sep: true },
    T('image'), T('search'), T('dynamic'), T('canvas'),
    { icon: 'more', label: 'More', submenu: [T('think'), T('research'), T('study'), T('file')] },
  ], { placement: S.chat?.messages.length ? 'top' : 'bottom' });
}

// ---------- dictation ----------
function toggleDictation() {
  if (S.dictation) { stopDictation(); return; }
  if (!canRecognize) { toast('Dictation isn\'t supported in this browser. Try Chrome, Edge or Safari.', { type: 'error' }); return; }
  const base = els.prompt.value ? els.prompt.value.replace(/\s*$/, ' ') : '';
  S.dictation = createRecognizer({
    onInterim: (interim, fin) => { els.prompt.value = base + fin + interim; autosize(); },
    onEnd: () => { S.dictation = null; els.dictate.classList.remove('dictating'); },
    onError: (err) => { if (err === 'not-allowed') toast('Microphone permission was denied.', { type: 'error' }); },
  });
  S.dictation.start();
  els.dictate.classList.add('dictating');
  els.dictate.title = 'Stop dictation';
}
function stopDictation() { if (S.dictation) { S.dictation.stop(); S.dictation = null; } els.dictate.classList.remove('dictating'); els.dictate.title = 'Dictate'; }

// ---------- voice messages ----------
async function startVoiceMessage() {
  if (!canRecord) { toast('Recording isn\'t supported in this browser.', { type: 'error' }); return; }
  if (S.recorder) return;
  let transcript = '';
  els.composer.classList.add('recording');
  els.recorder.hidden = false;
  try {
    S.recorder = await startRecording({
      canvas: $('#rec-wave'),
      onTick: (s) => { $('#rec-time').textContent = formatDuration(s); },
      onTranscript: (t) => { transcript = t; $('#rec-transcript').textContent = t; },
    });
  } catch (e) {
    stopRecorderUI();
    toast('Microphone unavailable: ' + (e.message || e.name), { type: 'error' });
  }
}
function stopRecorderUI() {
  els.composer.classList.remove('recording');
  els.recorder.hidden = true;
  $('#rec-transcript').textContent = '';
  $('#rec-time').textContent = '0:00';
  S.recorder = null;
}
async function finishVoiceMessage() {
  if (!S.recorder) return;
  const res = await S.recorder.stop();
  stopRecorderUI();
  if (res.duration < 0.6) { toast('Voice message too short'); return; }
  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(res.blob); });
  const att = { id: uid('a'), kind: 'audio', name: `Voice message (${formatDuration(res.duration)})`, mime: res.blob.type, size: res.blob.size, dataUrl, duration: res.duration, transcript: res.transcript };
  send(els.prompt.value, { attachments: [...S.attachments.filter((a) => !a.loading), att] });
}

// ---------- voice mode ----------
function startVoiceMode() {
  const m = getModel(currentModelId());
  const vm = openVoiceMode({
    modelName: m.name,
    onUserText: (text) => new Promise((resolve) => { S.voiceResolve = resolve; send(text, { attachments: [] }); }),
  });
  if (vm.error) toast(vm.error, { type: 'error' });
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------
function scrollToBottom(force) {
  const s = els.scroller;
  if (force || S.stick) s.scrollTop = s.scrollHeight;
}
els.scroller.addEventListener('scroll', () => {
  const s = els.scroller;
  const near = s.scrollHeight - s.scrollTop - s.clientHeight < 90;
  S.stick = near;
  els.scrollDown.classList.toggle('show', !near);
}, { passive: true });

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
function modelMenu() {
  const cur = currentModelId();
  const items = [{ header: 'Nova models' }];
  for (const m of MODELS) {
    items.push({
      html: `<button class="menu-item model-item${m.id === cur ? ' checked' : ''}" role="menuitem"><span class="m-ico" style="background:${modelGradient(m)}">${icon(m.icon, 'icon-sm')}</span><span class="m-body"><span class="m-name">${esc(m.name)}${m.badge ? `<span class="tag new">${esc(m.badge)}</span>` : ''}</span><span class="desc">${esc(m.tagline)}</span><span class="m-tags">${m.tags.map((t) => `<span class="tag accent">${esc(t)}</span>`).join('')}${m.tags.includes(m.speed) ? '' : `<span class="tag">${esc(m.speed)}</span>`}</span></span>${m.id === cur ? `<span class="check">${icon('check', 'icon-sm')}</span>` : ''}</button>`,
      onClick: () => selectModel(m.id),
    });
  }
  items.push({ sep: true });
  items.push({ icon: engineReady() ? 'sparkles' : 'cpu', label: engineReady() ? 'Engine: Claude' : 'Engine: On-device', desc: engineReady() ? 'Change models or effort in settings' : 'Connect Claude for full intelligence', onClick: () => openSettings(api, 'engine') });
  items.push({ icon: 'grid', label: 'Explore Nova Agents', onClick: () => openAgents(api) });
  openMenu(els.modelBtn, items, { className: 'model-menu' });
}

function selectModel(id) {
  if (S.chat) S.chat.model = id;
  saveSettings({ model: id });
  if (S.chat?.messages.length) saveChat(S.chat);
  updateTopbar();
  if (!S.chat?.messages.length) renderHome();
  toast(`Switched to ${getModel(id).name}`);
}

function chatItemMenu(btn, chat) {
  const row = btn.closest('.chat-item');
  row.classList.add('menu-open');
  openMenu(btn, [
    { icon: 'share', label: 'Share', onClick: () => openShare(api, chat) },
    { icon: 'pencil', label: 'Rename', onClick: () => renameInline(row, chat) },
    { icon: 'pin', label: chat.pinned ? 'Unpin' : 'Pin', onClick: () => { chat.pinned = !chat.pinned; saveChat(chat, true); renderSidebar(); } },
    { icon: 'download', label: 'Export', submenu: [['md', 'Markdown'], ['pdf', 'PDF'], ['docx', 'Word'], ['html', 'HTML'], ['json', 'JSON']].map(([f, l]) => ({ label: l, onClick: () => exportChat(chat, f) })) },
    { sep: true },
    { icon: 'trash', label: 'Delete', danger: true, onClick: () => removeChat(chat) },
  ], { onClose: () => row.classList.remove('menu-open') });
}

function renameInline(row, chat) {
  const input = h(`<input class="rename" value="${esc(chat.title)}" aria-label="Chat title">`);
  row.querySelector('.chat-link').replaceWith(input);
  input.focus(); input.select();
  const done = (save) => {
    if (save && input.value.trim()) { chat.title = input.value.trim(); saveChat(chat, true); }
    renderSidebar(); updateTopbar();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
  input.addEventListener('blur', () => done(true));
}

async function removeChat(chat) {
  if (!(await confirmDialog({ title: 'Delete chat?', text: `This will delete <b>${esc(chat.title)}</b>.`, confirm: 'Delete', danger: true }))) return;
  await deleteChat(chat.id);
  if (S.chat?.id === chat.id) newChat();
  renderSidebar();
  toast('Chat deleted');
}

function chatMenu() {
  const chat = S.chat;
  if (!chat) return;
  openMenu(els.chatMenuBtn, [
    { icon: 'share', label: 'Share', onClick: () => openShare(api, chat) },
    { icon: 'pencil', label: 'Rename', onClick: async () => { const t = await promptDialog({ title: 'Rename chat', value: chat.title }); if (t?.trim()) { chat.title = t.trim(); saveChat(chat, true); renderSidebar(); updateTopbar(); } } },
    { icon: 'pin', label: chat.pinned ? 'Unpin' : 'Pin', onClick: () => { chat.pinned = !chat.pinned; saveChat(chat, true); renderSidebar(); } },
    { icon: 'download', label: 'Export', submenu: [['md', 'Markdown'], ['pdf', 'PDF'], ['docx', 'Word'], ['html', 'HTML'], ['json', 'JSON']].map(([f, l]) => ({ label: l, onClick: () => exportChat(chat, f) })) },
    { sep: true },
    { icon: 'trash', label: 'Delete', danger: true, onClick: () => removeChat(chat) },
  ], { align: 'end' });
}

function profileMenu(btn) {
  openMenu(btn, [
    { header: settings.name || 'Nova' },
    { icon: 'sparkles', label: 'Customize Nova', onClick: () => openSettings(api, 'personal') },
    { icon: 'cpu', label: engineReady() ? 'Engine: Claude' : 'Connect Claude', onClick: () => openSettings(api, 'engine') },
    { icon: 'settings', label: 'Settings', trail: `${isMac ? '⌘' : 'Ctrl'} ,`, onClick: () => openSettings(api) },
    { icon: resolvedTheme() === 'dark' ? 'sun' : 'moon', label: resolvedTheme() === 'dark' ? 'Daylight theme' : 'Midnight theme', onClick: () => { saveSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }); applySettings(); } },
    { icon: 'keyboard', label: 'Keyboard shortcuts', onClick: openShortcuts },
    { icon: 'help', label: 'Help & tips', onClick: () => send('What can you do?') },
  ], { placement: 'top' });
}

function messageMoreMenu(btn, msg) {
  const v = msg.versions[msg.active];
  openMenu(btn, [
    { icon: 'refresh', label: 'Try again with…', submenu: MODELS.map((m) => ({ label: m.name, checked: m.id === msg.model, onClick: () => regenerate(msg, m.id) })) },
    { icon: 'newChat', label: 'Branch in new chat', onClick: () => branchFrom(msg) },
    { icon: 'download', label: 'Download as', submenu: [['md', 'Markdown'], ['pdf', 'PDF'], ['docx', 'Word']].map(([f, l]) => ({ label: l, onClick: () => exportMessage(msg, f) })) },
    { icon: 'code', label: 'Open in Canvas', onClick: () => openCanvas({ code: v.content, lang: 'markdown', title: S.chat.title, onAsk: (t) => send(t, { tool: 'canvas' }) }) },
  ], { placement: 'top' });
}

function branchFrom(msg) {
  const src = S.chat;
  const i = src.messages.indexOf(msg);
  const c = makeChat({ agentId: src.agentId });
  c.model = src.model;
  c.title = `${src.title} (branch)`;
  c.messages = JSON.parse(JSON.stringify(src.messages.slice(0, i + 1)));
  c.updatedAt = Date.now();
  chats.set(c.id, c);
  saveChat(c, true);
  openChat(c.id);
  toast('Branched into a new chat');
}

function exportMessage(msg, fmt) {
  const v = msg.versions[msg.active];
  const md = v.content.replace(/```nova-(ui|image|followups|memory)[\s\S]*?```/g, '');
  const title = (/^#\s+(.+)$/m.exec(md)?.[1] || S.chat.title).replace(/[^\w -]+/g, '').trim().slice(0, 60) || 'nova';
  const name = `${title.replace(/\s+/g, '-').toLowerCase()}.${fmt}`;
  download(name, fmt === 'md' ? new Blob([md], { type: 'text/markdown' }) : buildFile(name, md));
}

// ---------------------------------------------------------------------------
// Images / files helpers
// ---------------------------------------------------------------------------
async function downloadImage(src, prompt = 'nova-image') {
  const base = (prompt || 'nova-image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'nova-image';
  try {
    let blob;
    if (src.startsWith('data:')) blob = dataURLtoBlob(src);
    else blob = await (await fetch(src)).blob();
    const ext = /svg/.test(blob.type) ? 'svg' : /png/.test(blob.type) ? 'png' : 'jpg';
    download(`${base}.${ext}`, blob);
  } catch {
    window.open(src, '_blank', 'noopener');
  }
}

function imageBlockFromEl(el) {
  const id = el.dataset.block;
  return id ? blocks.get(id) : null;
}

function findMsg(el) {
  const id = el.closest('.msg')?.dataset.id;
  return S.chat?.messages.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// Shared chats
// ---------------------------------------------------------------------------
async function openShared(payload) {
  try {
    const data = JSON.parse(await inflate(b64urlToBytes(payload)));
    const c = makeChat();
    c.title = data.t || 'Shared chat';
    c.temporary = true;
    c.model = settings.model;
    c.messages = data.m.map((m) => (m.r === 'u'
      ? { id: uid('m'), role: 'user', content: m.c, attachments: [], createdAt: Date.now() }
      : { id: uid('m'), role: 'assistant', model: m.md || settings.model, active: 0, versions: [{ content: m.c, model: m.md, sources: m.s || [], artifacts: m.x || {}, done: true }] }));
    S.chat = c;
    S.shared = c;
    renderThread();
    updateTopbar();
    els.shareBanner.hidden = false;
    els.shareBanner.innerHTML = `${icon('link', 'icon-sm')} <span>You're viewing a shared conversation: <b>${esc(c.title)}</b></span><button class="btn primary sm" data-action="continue-shared">Continue this chat</button>`;
  } catch (e) {
    toast('This share link is invalid or incomplete.', { type: 'error' });
    newChat();
  }
}

async function continueShared() {
  const c = S.shared;
  if (!c) return;
  c.temporary = false;
  chats.set(c.id, c);
  saveChat(c, true);
  S.shared = null;
  els.shareBanner.hidden = true;
  history.replaceState(null, '', `#c=${c.id}`);
  renderSidebar();
  updateTopbar();
  toast('Saved to your chats');
}

// ---------------------------------------------------------------------------
// Global event delegation
// ---------------------------------------------------------------------------
const ACTIONS = {
  'new-chat': () => newChat(),
  'toggle-sidebar': () => toggleSidebar(),
  'search-chats': () => openSearch(api),
  'open-library': () => openLibrary(api),
  'open-agents': () => openAgents(api),
  'open-widgets': () => openWidgets(api),
  'ui-save': (el) => {
    const blockId = el.dataset.block;
    const b = blocks.get(blockId);
    if (!b) return;
    let w = savedWidgets.find((x) => x.source === blockId);
    if (!w) {
      w = { id: uid('wg'), title: b.title, spec: b.spec || null, html: b.spec ? null : b.html, source: blockId, createdAt: Date.now() };
      savedWidgets.unshift(w);
      persistWidgets();
      const st = widgetState(blockId);
      if (st) setWidgetState('saved:' + w.id, st);
    }
    el.classList.add('active');
    toast(`Saved “${w.title}” to My Widgets`, { action: { label: 'Open', onClick: () => openWidgets(api, w.id) } });
  },
  'open-settings': (el) => openSettings(api, el.dataset.tab || 'general'),
  'profile-menu': (el) => profileMenu(el),
  'share-chat': () => S.chat && openShare(api, S.chat),
  'chat-menu': () => chatMenu(),
  'toggle-temp': () => {
    if (S.chat?.messages.length && !S.chat.temporary) return;
    newChat({ temporary: !S.chat?.temporary });
    toast(S.chat.temporary ? 'Temporary chat on — it won\'t be saved' : 'Temporary chat off');
  },
  'open-chat': (el) => openChat(el.closest('.chat-item').dataset.chat),
  'chat-item-menu': (el) => chatItemMenu(el, chats.get(el.closest('.chat-item').dataset.chat)),
  'agent-chat': (el) => newChat({ agentId: el.dataset.agent }),
  'continue-shared': () => continueShared(),
  suggest: (el) => {
    const s = SUGGESTIONS[+el.dataset.i];
    if (s.tool) setTool(s.tool);
    else if (s.surprise) send(SURPRISES[Math.floor(Math.random() * SURPRISES.length)], { tool: null });
    else { els.prompt.value = s.text; autosize(); els.prompt.focus(); }
  },
  starter: (el) => send(el.dataset.text),
  'clear-tool': () => { S.tool = null; renderToolChip(); },
  'att-remove': (el) => { S.attachments = S.attachments.filter((a) => a.id !== el.dataset.id); renderAttachments(); },
  'att-preview': (el) => {
    const msg = S.chat?.messages.find((m) => m.id === el.dataset.msg);
    const a = msg?.attachments?.find((x) => x.id === el.dataset.att);
    if (a) previewFile({ name: a.name, content: a.text ?? null, attachment: a });
  },
  'rec-cancel': () => { S.recorder?.cancel(); stopRecorderUI(); },
  'rec-stop': () => finishVoiceMessage(),
  'copy-code': async (el) => {
    const c = codeRegistry.get(el.dataset.code);
    if (!c) return;
    await copyText(c.code);
    const span = el.querySelector('span');
    if (span) { span.textContent = 'Copied!'; setTimeout(() => (span.textContent = 'Copy'), 1500); }
  },
  'run-code': (el) => { const c = codeRegistry.get(el.dataset.code); if (c) openCanvas({ code: c.code, lang: c.lang, title: S.chat?.title || 'Code', onAsk: (t) => send(t, { tool: 'canvas' }), autoRun: true }); },
  'canvas-code': (el) => { const c = codeRegistry.get(el.dataset.code); if (c) openCanvas({ code: c.code, lang: c.lang, title: S.chat?.title || 'Code', onAsk: (t) => send(t, { tool: 'canvas' }) }); },
  lightbox: (el) => {
    const b = imageBlockFromEl(el);
    let src = el.dataset.src || el.getAttribute('src');
    let caption = el.getAttribute('alt') || '';
    if (b) { const msg = S.chat?.messages.find((m) => m.id === b.msgId); const art = msg?.versions[b.vi]?.artifacts?.[b.key]; if (art?.src) { src = art.src; caption = b.spec.prompt; } }
    if (!src) return;
    lightbox({ src, caption, actions: [{ icon: 'download', label: 'Download', onClick: () => downloadImage(src, caption) }] });
  },
  'img-download': (el) => { const b = imageBlockFromEl(el); const msg = S.chat?.messages.find((m) => m.id === b?.msgId); const art = msg?.versions[b.vi]?.artifacts?.[b.key]; if (art?.src) downloadImage(art.src, b.spec.prompt); },
  'img-remix': (el) => { const b = imageBlockFromEl(el); if (b) { ensureImage(S.chat, b, { force: true, seedBump: Math.floor(Math.random() * 9999) + 1 }); markImagePending(b); } },
  'img-retry': (el) => { const b = imageBlockFromEl(el); if (b) { ensureImage(S.chat, b, { force: true }); markImagePending(b); } },
  'img-edit': (el) => { const b = imageBlockFromEl(el); if (b) { S.tool = 'image'; renderToolChip(); els.prompt.value = b.spec.prompt; autosize(); els.prompt.focus(); } },
  'file-download': (el) => { const b = blocks.get(el.dataset.block); if (b) download(b.name, buildFile(b.name, b.content)); },
  'file-preview': (el) => { const b = blocks.get(el.dataset.block); if (b) previewFile({ name: b.name, content: b.content }); },
  'file-canvas': (el) => { const b = blocks.get(el.dataset.block); if (b) openCanvas({ code: b.content, lang: b.name.split('.').pop(), title: b.name, onAsk: (t) => send(t, { tool: 'canvas' }) }); },
  'ui-code': (el) => { const b = blocks.get(el.dataset.block); if (b) openCanvas({ code: /<html|<!doctype/i.test(b.html) ? b.html : `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${b.title}</title>\n</head>\n<body>\n${b.html}\n</body>\n</html>`, lang: 'html', title: b.title, onAsk: (t) => send(t, { tool: 'dynamic' }) }); },
  'ui-download': (el) => {
    const b = blocks.get(el.dataset.block);
    if (!b) return;
    const doc = /<html|<!doctype/i.test(b.html) ? b.html : wrapUI(b.html, 'export', resolvedTheme());
    download(`${b.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'nova-interface'}.html`, doc, 'text/html');
  },
  'ui-reload': (el) => { const f = uiFrames.get(el.dataset.block); if (f) { const s = f.srcdoc; f.srcdoc = ''; requestAnimationFrame(() => (f.srcdoc = s)); } },
  'ui-fullscreen': (el) => {
    const card = el.closest('.ui-card');
    const on = !card.classList.contains('fullscreen');
    card.classList.toggle('fullscreen', on);
    el.innerHTML = icon(on ? 'minimize' : 'maximize', 'icon-sm');
  },
  'user-copy': async (el) => { const m = findMsg(el); if (m) { await copyText(m.content); toast('Copied'); } },
  'user-edit': (el) => { const m = findMsg(el); if (m) editUserMessage(m); },
  'msg-copy': async (el) => {
    const m = findMsg(el);
    if (!m) return;
    const t = m.versions[m.active].content.replace(/```nova-(memory|followups)[\s\S]*?```/g, '').trim();
    await copyText(t);
    el.innerHTML = icon('check', 'icon-sm');
    setTimeout(() => (el.innerHTML = icon('copy', 'icon-sm')), 1400);
  },
  'msg-like': (el) => feedback(el, 'up'),
  'msg-dislike': (el) => feedback(el, 'down'),
  'msg-speak': (el) => {
    const m = findMsg(el);
    if (!m) return;
    if (isSpeaking()) { stopSpeaking(); el.classList.remove('on'); return; }
    el.classList.add('on');
    if (!speak(m.versions[m.active].content, { onEnd: () => el.classList.remove('on') })) toast('Read aloud isn\'t supported in this browser.', { type: 'error' });
  },
  'msg-regen': (el) => { const m = findMsg(el); if (m) regenerate(m); },
  'msg-more': (el) => { const m = findMsg(el); if (m) messageMoreMenu(el, m); },
  'msg-prev': (el) => switchVersion(el, -1),
  'msg-next': (el) => switchVersion(el, 1),
  followup: (el) => {
    const t = el.dataset.text;
    const m = /^Search the web for "(.+)"$/.exec(t);
    if (m) send(m[1], { tool: 'search' });
    else send(t, { tool: findMsg(el)?.versions?.[0]?.kind === 'aimode' ? 'search' : S.tool });
  },
  'export-msg': (el) => { const m = findMsg(el); if (m) exportMessage(m, el.dataset.fmt); },
};

function markImagePending(b) {
  const msg = S.chat?.messages.find((m) => m.id === b.msgId);
  const el = msg && msgElById(msg.id);
  const node = el?.querySelector(`[data-art="${b.key}"]`);
  if (node) node.querySelector('.label')?.classList.add('shimmer-text');
  if (node) { const lbl = node.querySelector('.label'); if (lbl) lbl.innerHTML = `${icon('sparkles', 'icon-sm spin')} Creating a new variation…`; }
}

function feedback(el, kind) {
  const m = findMsg(el);
  if (!m) return;
  const v = m.versions[m.active];
  v.feedback = v.feedback === kind ? null : kind;
  saveChat(S.chat);
  const box = msgElById(m.id);
  box._cache.actions = null;
  updateAssistant(box, S.chat, m);
  if (v.feedback) toast(kind === 'up' ? 'Thanks for the feedback!' : 'Thanks — this helps Nova improve.');
}

function switchVersion(el, d) {
  const m = findMsg(el);
  if (!m || S.streaming) return;
  m.active = Math.max(0, Math.min(m.versions.length - 1, m.active + d));
  const box = msgElById(m.id);
  box._cache = {};
  updateAssistant(box, S.chat, m);
  saveChat(S.chat);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A' && el.dataset.action !== 'lightbox') return;
  e.preventDefault();
  fn(el, e);
});

// Citation hover → highlight source card
document.addEventListener('mouseover', (e) => {
  const c = e.target.closest?.('.cite');
  if (!c) return;
  const msgEl = c.closest('.msg');
  msgEl?.querySelectorAll(`.source-card[data-src-idx="${c.dataset.cite}"]`).forEach((s) => { s.classList.add('hl'); setTimeout(() => s.classList.remove('hl'), 1200); });
});

// Messages from generated interfaces (sandboxed iframes)
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object' || !String(d.type || '').startsWith('nova-ui')) return;
  let frame = null;
  for (const f of uiFrames.values()) if (f.contentWindow === e.source) { frame = f; break; }
  if (!frame) return;
  if (d.type === 'nova-ui-size') {
    if (frame.closest('.ui-card')?.classList.contains('fullscreen')) return;
    frame.style.height = Math.max(120, Math.min(1400, +d.height || 0)) + 'px';
  } else if (d.type === 'nova-ui-state' && d.state && typeof d.state === 'object') {
    setWidgetState(frame.dataset.stateKey || d.id, d.state);
  } else if (d.type === 'nova-ui-ask' && typeof d.text === 'string') {
    send(d.text.slice(0, 2000));
  } else if (d.type === 'nova-ui-open' && /^https?:\/\//.test(d.url || '')) {
    window.open(d.url, '_blank', 'noopener,noreferrer');
  }
});

// ---------------------------------------------------------------------------
// Static bindings
// ---------------------------------------------------------------------------
function bindStatic() {
  els.composer.addEventListener('submit', (e) => { e.preventDefault(); send(els.prompt.value); });
  els.prompt.addEventListener('input', autosize);
  els.prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      if (settings.sendOnEnter || e.metaKey || e.ctrlKey) { e.preventDefault(); send(els.prompt.value); }
    }
  });
  els.prompt.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  els.plus.addEventListener('click', plusMenu);
  els.stop.addEventListener('click', stopGenerating);
  els.dictate.addEventListener('click', toggleDictation);
  els.voice.addEventListener('click', startVoiceMode);
  els.modelBtn.addEventListener('click', modelMenu);
  els.scrollDown.addEventListener('click', () => { S.stick = true; els.scroller.scrollTo({ top: els.scroller.scrollHeight, behavior: 'smooth' }); });
  els.fileInput.addEventListener('change', () => { if (els.fileInput.files.length) addFiles(els.fileInput.files); });

  // Drag & drop anywhere
  let dragDepth = 0;
  addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; els.drop.classList.add('show'); } });
  addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.drop.classList.remove('show'); });
  addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => {
    dragDepth = 0; els.drop.classList.remove('show');
    if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (onKey(e, 'mod+shift+o')) { e.preventDefault(); newChat(); }
    else if (onKey(e, 'mod+k')) { e.preventDefault(); openSearch(api); }
    else if (onKey(e, 'mod+shift+s')) { e.preventDefault(); toggleSidebar(); }
    else if (onKey(e, 'mod+,')) { e.preventDefault(); openSettings(api); }
    else if (onKey(e, 'mod+/')) { e.preventDefault(); openShortcuts(); }
    else if (onKey(e, 'mod+shift+c')) {
      e.preventDefault();
      const last = [...(S.chat?.messages || [])].reverse().find((m) => m.role === 'assistant');
      if (last) copyText(last.versions[last.active].content).then(() => toast('Copied last response'));
    } else if (e.key === 'Escape' && e.shiftKey) { e.preventDefault(); els.prompt.focus(); }
    else if (e.key === 'Escape' && S.streaming && !topModal() && !document.querySelector('.menu')) { stopGenerating(); }
    else if (e.key === 'Escape' && document.querySelector('.ui-card.fullscreen')) {
      const c = document.querySelector('.ui-card.fullscreen'); c.classList.remove('fullscreen');
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable && !topModal() && !document.querySelector('.menu,.lightbox,.voice-mode')) {
      els.prompt.focus();
    }
  });

  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.theme === 'system') applySettings(); });
  let wasMobile = innerWidth <= 820;
  addEventListener('resize', () => {
    const mobile = innerWidth <= 820;
    if (mobile && !wasMobile) els.app.classList.add('sidebar-collapsed');
    if (!mobile && wasMobile) els.app.classList.toggle('sidebar-collapsed', localStorage.getItem('nova:sidebar') === 'collapsed');
    wasMobile = mobile;
  });
}

// Re-render a message when one of its images finishes.
on('artifact', ({ chat, msg }) => {
  if (!chat.temporary) saveChat(chat);
  if (S.chat !== chat) return;
  const el = msgElById(msg.id);
  if (!el || S.streaming?.msgId === msg.id) return;
  // Patch only the image blocks so interactive frames in the same answer keep their state.
  patchImages(el, chat, msg);
  if (S.stick) scrollToBottom();
});
on('memory', () => {});
on('settings', () => {});

// ---------------------------------------------------------------------------
// PWA
// ---------------------------------------------------------------------------
function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Public API for modals
// ---------------------------------------------------------------------------
const api = {
  newChat, openChat, setTool, send, renderSidebar, applySettings, downloadImage,
  refresh: () => { renderSidebar(); renderThread(); },
};
window.nova = api;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  hydrateIcons();
  if (innerWidth <= 820 || localStorage.getItem('nova:sidebar') === 'collapsed') els.app.classList.add('sidebar-collapsed');
  await loadChats();
  applySettings();
  bindStatic();
  renderSidebar();
  const hash = location.hash.slice(1);
  if (hash.startsWith('share=')) await openShared(hash.slice(6));
  else {
    const id = new URLSearchParams(hash).get('c') || (STANDALONE ? lastChatId() : null);
    if (id && chats.has(id)) openChat(id); else newChat();
  }
  const q = new URLSearchParams(location.search).get('q');
  if (q) { history.replaceState(null, '', location.pathname + location.hash); send(q); }
  updateComposerState();
  registerSW();
}

boot();
