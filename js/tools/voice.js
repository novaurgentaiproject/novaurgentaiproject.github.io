// Voice: dictation (speech-to-text), voice messages (recording + live transcript),
// read-aloud (text-to-speech) and a full-screen voice conversation mode.
import { settings, saveSettings } from '../state.js';
import { stripMarkdown, formatDuration, h, esc } from '../util.js';
import { icon } from '../icons.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = !!SR;
export const canSpeak = 'speechSynthesis' in window;
export const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export function createRecognizer({ onInterim, onFinal, onEnd, onError, continuous = true, lang = navigator.language || 'en-US' } = {}) {
  if (!SR) return null;
  const r = new SR();
  r.lang = lang;
  r.continuous = continuous;
  r.interimResults = true;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) { finalText += t; onFinal?.(t, finalText); } else interim += t;
    }
    onInterim?.(interim, finalText);
  };
  r.onerror = (e) => onError?.(e.error);
  r.onend = () => onEnd?.(finalText);
  return { start: () => { try { r.start(); } catch {} }, stop: () => { try { r.stop(); } catch {} }, abort: () => { try { r.abort(); } catch {} }, get text() { return finalText; } };
}

// ---------- Text to speech ----------
// Browsers are picky about speech synthesis: iOS only lets a page speak once
// speech was started from a tap, Chrome loads its voice list late and can drop
// utterances that get garbage-collected, and Safari sometimes never fires
// `onend`. The Speaker below works around all of these, and voice mode feeds
// it text while the reply is still being written, sentence by sentence.
const UA = navigator.userAgent || '';
const IS_CHROME_DESKTOP = /Chrome\//.test(UA) && !/Edg\/|OPR\/|Android|Mobile/.test(UA);
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|princess|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|kathy)\b/i;
const ELOQUENCE = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

let voicesCache = [];
const voicesReady = canSpeak ? new Promise((resolve) => {
  const load = () => { voicesCache = speechSynthesis.getVoices() || []; if (voicesCache.length) resolve(voicesCache); };
  load();
  try { speechSynthesis.addEventListener('voiceschanged', load); } catch { speechSynthesis.onvoiceschanged = load; }
  setTimeout(() => resolve(voicesCache), 1500);
}) : Promise.resolve([]);

export function listVoices() {
  if (!canSpeak) return [];
  const v = speechSynthesis.getVoices();
  if (v?.length) voicesCache = v;
  return voicesCache;
}

/** The voice Nova speaks with: the one chosen in Settings, else the most natural voice for the user's language. */
export function pickVoice() {
  const voices = listVoices();
  if (!voices.length) return null;
  if (settings.voice) { const v = voices.find((x) => x.voiceURI === settings.voice); if (v) return v; }
  const lang = (navigator.language || 'en-US').toLowerCase();
  const base = lang.split('-')[0];
  let best = null, bestScore = -Infinity;
  for (const v of voices) {
    const vl = (v.lang || '').toLowerCase().replace('_', '-');
    let s = 0;
    if (vl === lang) s += 12; else if (vl.split('-')[0] === base) s += 7; else s -= 30;
    if (/natural|neural/i.test(v.name)) s += 6;
    if (/premium|enhanced|siri/i.test(v.name)) s += 5;
    if (/^google\b/i.test(v.name)) s += 3;
    if (/samantha|ava|allison|susan|zoe|karen|daniel|moira|serena|aria|jenny|guy/i.test(v.name)) s += 2;
    if (v.default) s += 1;
    if (NOVELTY.test(v.name)) s -= 25;
    if (ELOQUENCE.test(v.name)) s -= 6;
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return bestScore > -10 ? best : null;
}

let unlocked = false, lastCancel = 0;
function cancelSpeech() {
  try { if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); lastCancel = performance.now(); } } catch {}
}

/** Call synchronously inside a tap/click: lets iOS and Safari speak later, after async work. */
export function unlockSpeech() {
  if (!canSpeak) return;
  try {
    listVoices();
    cancelSpeech();
    unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.rate = 1;
    speechSynthesis.speak(u);
    speechSynthesis.resume();
  } catch {}
}

const SPOKEN_EXTRAS = [
  [/```nova-image/, "I've made the image — take a look in the chat."],
  [/```nova-(widget|ui)/, "I've built it for you — it's in the chat."],
  [/```nova-file/, 'Your file is ready to download in the chat.'],
  [/```nova-chart/, "I've put a chart in the chat for you."],
  [/```nova-quiz/, "There's a quiz waiting for you in the chat."],
  [/```/, "I've written the code — it's in the chat."],
];
/** One short spoken sentence describing what a reply contains when it has nothing to read out. */
export function describeExtras(md) {
  for (const [re, line] of SPOKEN_EXTRAS) if (re.test(md || '')) return line;
  return '';
}

const UNITS = { km: 'kilometers', kg: 'kilograms', cm: 'centimeters', mm: 'millimeters', mi: 'miles', ft: 'feet', lb: 'pounds', lbs: 'pounds', oz: 'ounces', ml: 'milliliters', kph: 'kilometers per hour', hr: 'hours', hrs: 'hours', min: 'minutes', mins: 'minutes', sec: 'seconds', secs: 'seconds' };

/** Turn Markdown into text that sounds natural when read aloud. */
export function speechText(md, { code = true } = {}) {
  let t = String(md || '')
    .replace(/^\s*\d{1,3}[.)]\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}[-:|\s]*$/gm, '')
    .replace(/```nova-[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*?```/g, code ? ' (code block omitted) ' : ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '');
  t = t
    .replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ').replace(/\\\(([\s\S]*?)\\\)/g, ' $1 ').replace(/\\\[([\s\S]*?)\\\]/g, ' $1 ')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2').replace(/\\sqrt\{([^}]*)\}/g, 'the square root of $1')
    .replace(/\\(times|cdot)/g, ' times ').replace(/\\div/g, ' divided by ').replace(/\\pm/g, ' plus or minus ')
    .replace(/\\(le|leq)\b/g, ' less than or equal to ').replace(/\\(ge|geq)\b/g, ' greater than or equal to ').replace(/\\approx/g, ' approximately ')
    .replace(/\\pi\b/g, ' pi ').replace(/\\[a-z]+/gi, ' ').replace(/[{}]/g, '')
    .replace(/\^2\b/g, ' squared').replace(/\^3\b/g, ' cubed').replace(/\^(-?\d+)/g, ' to the power of $1');
  t = stripMarkdown(t)
    .replace(/(^|[^\d.])(\d+)\.(\d{3,})(?![\d.])/g, (_, pre, a, b) => pre + String(+(+`${a}.${b}`).toFixed(2)))
    .replace(/(\d)\s?(km|kg|cm|mm|mi|ft|lbs?|oz|ml|kph|hrs?|mins?|secs?)\b/g, (_, n, u) => `${n} ${UNITS[u]}`)
    .replace(/\s=\s/g, ' equals ').replace(/(\w)\s?\+\s?(\w)/g, '$1 plus $2')
    .replace(/°\s?C\b/g, ' degrees Celsius').replace(/°\s?F\b/g, ' degrees Fahrenheit').replace(/°/g, ' degrees')
    .replace(/\bkm\/h\b/g, 'kilometers per hour').replace(/\bmph\b/g, 'miles per hour')
    .replace(/(\d)\s?[–—]\s?(\d)/g, '$1 to $2')
    .replace(/\s[—–]\s/g, ', ').replace(/[—–]/g, ', ')
    .replace(/\s&\s/g, ' and ').replace(/→|⇒|->/g, ' to ').replace(/×/g, ' times ').replace(/÷/g, ' divided by ')
    .replace(/≈|~(?=\s?\d)/g, ' about ').replace(/≤/g, ' less than or equal to ').replace(/≥/g, ' greater than or equal to ')
    .replace(/\be\.g\.,?/gi, 'for example').replace(/\bi\.e\.,?/gi, 'that is').replace(/\bvs\.?(?=\s)/gi, 'versus').replace(/\betc\./gi, 'etcetera.')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}✦✧★☆•·▸▶◆◇■□●○]/gu, ' ')
    .replace(/[#*_`|<>\[\]]/g, ' ')
    .replace(/\s*\n\s*/g, '. ').replace(/([.!?,;:])\s*\.\s/g, '$1 ')
    .replace(/\s+([.,!?;:])/g, '$1').replace(/\s+/g, ' ').replace(/^[.,;:\s]+/, '').trim();
  return t;
}

const ABBR = '(?<!\\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Mt|No|vs|approx|U\\.S|U\\.K|a\\.m|p\\.m))';
const SENTENCE_SPLIT = new RegExp(`(?<=${ABBR}[.!?…])\\s+`);
const FEED_BOUNDARY = new RegExp(`${ABBR}[.!?…:](?=["')\\]*_]*\\s)|\\n`, 'g');

/** Split text into utterance-sized pieces (short enough to dodge Chrome's ~15 s cut-off). */
function chunkSpeech(text, max = 170) {
  const out = [];
  for (const sentence of text.split(SENTENCE_SPLIT)) {
    let s = sentence.trim();
    while (s.length > max) {
      let cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf('; ', max), s.lastIndexOf(': ', max));
      if (cut < max * 0.4) cut = s.lastIndexOf(' ', max);
      if (cut < 20) cut = max;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s && /[\p{L}\p{N}]/u.test(s)) out.push(s);
  }
  return out;
}

let activeSpeaker = null;
const liveUtterances = new Set(); // keeps utterances alive so Chrome can't GC them mid-speech

/**
 * A queue-based speaker. `feed(markdownSoFar)` speaks every finished sentence of a
 * reply that is still being written; `end(finalMarkdown)` speaks the rest.
 */
export function createSpeaker({ onStart, onDone, onBlocked, onChunk, onWord, maxChars = 0 } = {}) {
  if (!canSpeak) return null;
  activeSpeaker?.stop();
  const sp = { queue: [], rawPos: 0, consumed: '', spoken: 0, ended: false, stopped: false, started: false, busy: false, failures: 0, blocked: false, limitHit: false, current: null, timers: [] };
  const clearTimers = () => { sp.timers.forEach(clearTimeout); sp.timers = []; };
  const finish = () => {
    if (sp.stopped) return;
    sp.stopped = true;
    clearTimers();
    if (activeSpeaker === api) activeSpeaker = null;
    onDone?.({ blocked: sp.blocked });
  };
  const enqueue = (text) => {
    if (!text || sp.limitHit) return;
    for (const c of chunkSpeech(text)) {
      if (maxChars && sp.spoken + c.length > maxChars && sp.spoken > 0) {
        sp.limitHit = true;
        sp.queue.push("There's more in the chat.");
        break;
      }
      sp.spoken += c.length;
      sp.queue.push(c);
    }
  };
  const speakNext = async () => {
    if (sp.stopped || sp.busy || sp.blocked) return;
    if (!sp.queue.length) { if (sp.ended) finish(); return; }
    sp.busy = true;
    if (!listVoices().length) await voicesReady;
    const since = performance.now() - lastCancel;
    if (unlocked && since < 150) await new Promise((r) => setTimeout(r, 150 - since));
    if (sp.stopped) return;
    const text = sp.queue[0];
    const u = new SpeechSynthesisUtterance(text);
    const voice = sp.noVoice ? null : pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang || navigator.language || 'en-US';
    u.rate = settings.speechRate || 1;
    u.pitch = 1;
    u.volume = 1;
    sp.current = u;
    liveUtterances.add(u);
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      liveUtterances.delete(u);
      clearTimers();
      if (sp.current === u) sp.current = null;
      if (sp.stopped) return;
      sp.queue.shift();
      sp.busy = false;
      if (ok) sp.failures = 0;
      speakNext();
    };
    u.onstart = () => {
      unlocked = true;
      if (!sp.started) { sp.started = true; onStart?.(); }
      onChunk?.(text);
    };
    u.onboundary = () => onWord?.();
    u.onend = () => done(true);
    u.onerror = (e) => {
      const err = e?.error || '';
      if (settled || sp.stopped || err === 'interrupted' || err === 'canceled') return;
      liveUtterances.delete(u);
      settled = true;
      clearTimers();
      sp.busy = false;
      if (err === 'not-allowed') return block();
      if (voice && !sp.noVoice) { sp.noVoice = true; return speakNext(); } // retry this chunk with the default voice
      sp.failures++;
      if (!sp.started && sp.failures >= 2) return block();
      sp.queue.shift();
      speakNext();
    };
    const block = () => {
      sp.blocked = true;
      sp.busy = false;
      onBlocked?.();
    };
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
      speechSynthesis.speak(u);
    } catch { return block(); }
    // Nothing happened at all? Then the browser is refusing to speak (usually iOS without a tap).
    if (!sp.started) {
      let checks = 0;
      const check = () => {
        if (settled || sp.started || sp.stopped) return;
        if (!speechSynthesis.speaking || ++checks >= 3) { settled = true; liveUtterances.delete(u); return block(); }
        sp.timers.push(setTimeout(check, 2000));
      };
      sp.timers.push(setTimeout(check, 3000));
    }
    // Safari sometimes never fires onend; Chrome's online voices stall on long text.
    const expected = Math.max(2500, (text.length * 85) / (u.rate || 1)) + 2500;
    const watchdog = () => {
      if (settled || sp.stopped) return;
      if (!speechSynthesis.speaking) return done(true);
      if (IS_CHROME_DESKTOP && voice && !voice.localService) { speechSynthesis.pause(); speechSynthesis.resume(); }
      sp.timers.push(setTimeout(watchdog, 4000));
    };
    sp.timers.push(setTimeout(watchdog, expected));
  };
  const api = {
    /** Speak every complete sentence of a partial Markdown reply. */
    feed(raw) {
      if (sp.stopped || sp.ended) return;
      raw = String(raw || '');
      if (!raw.startsWith(sp.consumed)) return;
      let safe = raw;
      const fences = [...raw.matchAll(/```/g)];
      if (fences.length % 2) safe = raw.slice(0, fences[fences.length - 1].index);
      const tail = safe.slice(sp.rawPos);
      let cut = -1;
      for (const m of tail.matchAll(FEED_BOUNDARY)) cut = m.index + m[0].length;
      if (cut <= 0) return;
      const seg = tail.slice(0, cut);
      if (((sp.consumed + seg).match(/```/g) || []).length % 2) return;
      sp.rawPos += cut;
      sp.consumed = raw.slice(0, sp.rawPos);
      enqueue(speechText(seg, { code: false }));
      speakNext();
    },
    /** The reply is complete: speak whatever is left (or a short description of it). */
    end(raw) {
      if (sp.stopped || sp.ended) return;
      raw = String(raw || '');
      const rest = raw.startsWith(sp.consumed) ? raw.slice(sp.rawPos) : (sp.spoken ? '' : raw);
      enqueue(speechText(rest, { code: false }));
      if (!sp.spoken && !sp.queue.length) enqueue(describeExtras(raw) || 'Done.');
      sp.ended = true;
      speakNext();
    },
    /** Retry after the browser refused to speak; call from a tap. */
    retry() {
      if (sp.stopped) return;
      sp.blocked = false;
      sp.busy = false;
      sp.failures = 0;
      unlockSpeech();
      speakNext();
    },
    stop() {
      if (sp.stopped) return;
      sp.stopped = true;
      clearTimers();
      if (activeSpeaker === api) activeSpeaker = null;
      cancelSpeech();
      liveUtterances.clear();
    },
    get started() { return sp.started; },
    get blocked() { return sp.blocked; },
    get done() { return sp.stopped; },
  };
  activeSpeaker = api;
  return api;
}

/** Read a whole message aloud. Returns false if speech isn't available. */
export function speak(text, { onEnd, onStart, onBlocked } = {}) {
  if (!canSpeak) return false;
  const clean = speechText(text);
  if (!clean) { onEnd?.(); return false; }
  const sp = createSpeaker({ onStart, onDone: () => onEnd?.(), onBlocked: () => { sp.stop(); onBlocked?.(); onEnd?.(); } });
  sp.end(String(text));
  return true;
}
export function stopSpeaking() { activeSpeaker?.stop(); if (canSpeak) cancelSpeech(); }
export function isSpeaking() { return !!activeSpeaker; }

// ---------- Voice message recorder ----------
export async function startRecording({ canvas, onTick, onTranscript } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const src = ac.createMediaStreamSource(stream);
  const an = ac.createAnalyser();
  an.fftSize = 256;
  src.connect(an);
  const buf = new Uint8Array(an.frequencyBinCount);
  const bars = [];
  const t0 = performance.now();
  let raf;
  const draw = () => {
    an.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    bars.push(peak / 128);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio);
      ctx.clearRect(0, 0, W, H);
      const n = Math.floor(W / (4 * devicePixelRatio));
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, '#3b6bff'); g.addColorStop(1, '#b16cff');
      ctx.fillStyle = g;
      bars.slice(-n).forEach((b, i) => {
        const hh = Math.max(2 * devicePixelRatio, b * H * 1.6);
        ctx.fillRect(i * 4 * devicePixelRatio, (H - hh) / 2, 2 * devicePixelRatio, Math.min(H, hh));
      });
    }
    onTick?.((performance.now() - t0) / 1000);
    raf = requestAnimationFrame(draw);
  };
  draw();
  const recog = createRecognizer({ onInterim: (i, f) => onTranscript?.((f + ' ' + i).trim()), onFinal: (_, f) => onTranscript?.(f.trim()) });
  recog?.start();
  rec.start(250);
  const cleanup = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    ac.close().catch(() => {});
    recog?.stop();
  };
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        resolve({ blob, duration: (performance.now() - t0) / 1000, transcript: recog?.text?.trim() || '' });
      };
      rec.stop();
    }),
    cancel: () => { rec.onstop = null; try { rec.stop(); } catch {} cleanup(); },
  };
}

// ---------- Voice mode ----------
const VM_ERRORS = {
  'not-allowed': 'Microphone access is blocked. Allow it for this site in your browser settings, then tap the orb.',
  'service-not-allowed': 'Speech recognition is turned off on this device. On iPhone or iPad, enable Siri & Dictation in Settings.',
  'audio-capture': 'No microphone was found. Connect one, then tap the orb.',
  network: 'Speech recognition needs an internet connection. Tap the orb to try again.',
};

/**
 * Full-screen spoken conversation. `onUserText(text, { onPartial })` sends the user's
 * words to Nova and resolves with the final reply; it can call `onPartial(replySoFar, info)`
 * while the reply streams so Nova starts talking before it has finished writing.
 */
export function openVoiceMode({ modelName, onUserText }) {
  if (!SR) return { error: 'Voice mode needs speech recognition, which this browser doesn\'t support. Try Chrome, Edge or Safari.' };
  unlockSpeech();
  const voiceOptions = () => {
    const base = (navigator.language || 'en').split('-')[0].toLowerCase();
    const list = listVoices().filter((v) => (v.lang || '').toLowerCase().startsWith(base) && !NOVELTY.test(v.name));
    const auto = pickVoice();
    return `<option value="">Automatic${auto && !settings.voice ? ` · ${esc(auto.name)}` : ''}</option>${list.map((v) => `<option value="${esc(v.voiceURI)}"${v.voiceURI === settings.voice ? ' selected' : ''}>${esc(v.name)}${v.localService === false ? ' · online' : ''}</option>`).join('')}`;
  };
  const el = h(`<div class="voice-mode" role="dialog" aria-modal="true" aria-label="Voice mode">
<div class="vm-top"><span class="vm-title">${icon('waveform', 'icon-sm')} ${esc(modelName)}</span>${canSpeak ? `<label class="vm-voice">${icon('volume', 'icon-sm')}<select aria-label="Nova's voice">${voiceOptions()}</select></label>` : ''}</div>
<button class="vm-orb" type="button" aria-label="Voice orb"><canvas></canvas></button>
<div class="vm-text">
  <div class="vm-status" aria-live="polite">Starting…</div>
  <div class="vm-you"></div>
  <div class="vm-caption" hidden></div>
  <button class="vm-tap" type="button" hidden>${icon('volume', 'icon-sm')} Tap to hear Nova</button>
</div>
<div class="vm-controls">
  <button class="mute" type="button" title="Mute microphone" aria-label="Mute microphone">${icon('mic')}</button>
  <button class="cc" type="button" title="Show captions" aria-label="Show captions" aria-pressed="${settings.voiceCaptions ? 'true' : 'false'}"><span class="cc-glyph">CC</span></button>
  <button class="end" type="button" title="End voice mode" aria-label="End voice mode">${icon('x')}</button>
</div></div>`);
  document.body.appendChild(el);
  const orb = el.querySelector('.vm-orb'), canvas = orb.querySelector('canvas');
  const status = el.querySelector('.vm-status'), you = el.querySelector('.vm-you'), caption = el.querySelector('.vm-caption');
  const tapBtn = el.querySelector('.vm-tap'), muteBtn = el.querySelector('.mute'), ccBtn = el.querySelector('.cc');
  const voiceSel = el.querySelector('.vm-voice select');
  let state = 'idle', muted = false, closed = false, level = 0, target = 0, recog = null, raf, speaker = null, turn = 0, empties = 0, fatal = false;
  let captions = !!settings.voiceCaptions;

  const setState = (s, text) => {
    state = s;
    status.textContent = text;
    el.dataset.state = s;
    orb.setAttribute('aria-label', { listening: 'Stop listening and send', speaking: 'Interrupt Nova', paused: 'Start talking', idle: 'Start talking', blocked: 'Skip and keep talking' }[s] || 'Voice orb');
  };
  const showCaption = (text) => { caption.textContent = text; caption.hidden = !(captions || state === 'blocked') || !text; };
  const bump = (v) => { target = Math.min(1, Math.max(target, v)); };

  const draw = (t) => {
    if (state === 'speaking') bump(0.28 + Math.sin(t / 140) * 0.08);
    else if (state === 'listening') bump(0.08 + Math.sin(t / 380) * 0.04);
    target *= 0.94;
    level += (target - level) * 0.22;
    const ctx = canvas.getContext('2d');
    const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.28 * (1 + level * 0.45);
    ctx.clearRect(0, 0, W, H);
    const thinking = state === 'thinking';
    for (let k = 3; k >= 0; k--) {
      const r = R * (1 + k * 0.18 + Math.sin(t / 600 + k) * 0.03 + (thinking ? Math.sin(t / 260 + k * 1.3) * 0.04 : 0));
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, `rgba(${thinking ? '200,180,255' : state === 'speaking' ? '185,160,255' : '160,190,255'},${0.9 - k * 0.2})`);
      g.addColorStop(0.5, `rgba(${state === 'speaking' ? '120,70' : '91,84'},255,${0.55 - k * 0.12})`);
      g.addColorStop(1, `rgba(157,77,255,${0.25 - k * 0.06})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
        const wob = 1 + Math.sin(a * 3 + t / (300 + k * 90)) * 0.04 * (1 + level * 3) + Math.sin(a * 5 - t / 500) * 0.02 * (1 + level * 2);
        ctx.lineTo(cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob);
      }
      ctx.fill();
    }
    if (!closed) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  const stopSpeaker = () => { speaker?.stop(); speaker = null; };
  const afterSpeaking = () => { if (!closed && (state === 'speaking' || state === 'thinking')) setTimeout(listen, 350); };
  const makeSpeaker = (info = {}) => {
    if (speaker || !canSpeak) return speaker;
    const myTurn = turn;
    speaker = createSpeaker({
      maxChars: info.engine === 'claude' ? 0 : 650,
      onStart: () => { if (turn === myTurn && !closed) setState('speaking', 'Speaking — tap the orb to interrupt'); },
      onChunk: (text) => { if (turn === myTurn) { bump(0.5); showCaption(text); } },
      onWord: () => bump(0.42 + Math.random() * 0.2),
      onDone: () => { if (turn !== myTurn || closed) return; speaker = null; tapBtn.hidden = true; afterSpeaking(); },
      onBlocked: () => {
        if (turn !== myTurn || closed) return;
        setState('blocked', 'Your browser didn\'t play Nova\'s voice. Check that your device isn\'t on silent.');
        tapBtn.hidden = false;
        showCaption(lastReply ? speechText(lastReply, { code: false }) : '');
      },
    });
    return speaker;
  };
  let lastReply = '';

  const listen = () => {
    if (closed || fatal) return;
    if (muted) { setState('muted', 'Microphone muted — tap the mic to talk'); return; }
    if (document.hidden) { setState('paused', 'Paused — tap the orb to keep talking'); return; }
    stopSpeaker();
    tapBtn.hidden = true;
    setState('listening', 'Listening…');
    you.textContent = '';
    you.classList.remove('sent');
    showCaption('');
    let heard = '', sent = false;
    const r = createRecognizer({
      continuous: false,
      onInterim: (i, f) => {
        const next = (f + ' ' + i).trim();
        if (next.length > heard.length) bump(0.55 + Math.random() * 0.25);
        heard = next;
        you.textContent = heard;
      },
      onEnd: (f) => {
        if (recog === r) recog = null;
        if (closed || sent || state !== 'listening') return;
        const text = (f || heard).trim();
        if (!text) {
          if (++empties >= 4) { setState('paused', 'Still there? Tap the orb when you\'re ready to talk.'); empties = 0; return; }
          setTimeout(listen, 250);
          return;
        }
        sent = true;
        empties = 0;
        ask(text);
      },
      onError: (err) => {
        if (VM_ERRORS[err]) { if (err !== 'network') fatal = err === 'service-not-allowed'; setState('paused', VM_ERRORS[err]); }
      },
    });
    recog = r;
    r.start();
  };

  const ask = async (text) => {
    const myTurn = ++turn;
    you.textContent = text;
    you.classList.add('sent');
    setState('thinking', 'Thinking…');
    lastReply = '';
    let reply = '';
    try {
      reply = await onUserText(text, {
        onPartial: (md, info) => {
          if (closed || turn !== myTurn) return;
          lastReply = md;
          makeSpeaker(info)?.feed(md);
        },
      });
    } catch { reply = 'Sorry, something went wrong. Please try again.'; }
    if (closed || turn !== myTurn) return;
    lastReply = reply || lastReply;
    const sp = makeSpeaker();
    if (!sp) { showCaption(speechText(lastReply)); captions = true; setState('speaking', 'Speech isn\'t available in this browser — showing text instead'); setTimeout(listen, 2500 + lastReply.length * 20); return; }
    if (sp.blocked) showCaption(speechText(lastReply, { code: false }));
    sp.end(lastReply);
  };

  orb.addEventListener('click', () => {
    unlockSpeech();
    if (state === 'speaking' || state === 'blocked') { turn++; stopSpeaker(); listen(); }
    else if (state === 'listening') recog?.stop();
    else if (state === 'paused' || state === 'idle') { fatal = false; empties = 0; listen(); }
  });
  tapBtn.addEventListener('click', () => {
    if (!speaker) return;
    tapBtn.hidden = true;
    setState('speaking', 'Speaking — tap the orb to interrupt');
    speaker.retry();
  });
  muteBtn.onclick = () => {
    unlockSpeech();
    muted = !muted;
    muteBtn.classList.toggle('muted', muted);
    muteBtn.innerHTML = icon(muted ? 'micOff' : 'mic');
    muteBtn.title = muted ? 'Unmute microphone' : 'Mute microphone';
    if (muted) { if (state === 'listening') { const r = recog; recog = null; r?.abort(); setState('muted', 'Microphone muted — tap the mic to talk'); } }
    else if (state !== 'speaking' && state !== 'thinking') listen();
  };
  ccBtn.onclick = () => {
    captions = !captions;
    ccBtn.setAttribute('aria-pressed', String(captions));
    ccBtn.title = captions ? 'Hide captions' : 'Show captions';
    saveSettings({ voiceCaptions: captions });
    showCaption(caption.textContent);
  };
  voiceSel?.addEventListener('change', () => {
    saveSettings({ voice: voiceSel.value });
    if (state === 'listening') { const r = recog; recog = null; r?.abort(); }
    turn++;
    stopSpeaker();
    setState('speaking', 'Speaking — tap the orb to interrupt');
    const myTurn = turn;
    speaker = createSpeaker({ onDone: () => { if (turn === myTurn && !closed) { speaker = null; listen(); } }, onBlocked: () => { if (turn === myTurn) { speaker = null; listen(); } } });
    speaker?.end(`Hi${settings.name ? ' ' + settings.name : ''}, this is how I'll sound from now on.`);
  });
  if (canSpeak && !listVoices().length) voicesReady.then(() => { if (voiceSel && !closed) voiceSel.innerHTML = voiceOptions(); });

  const onVisibility = () => {
    if (!document.hidden || closed) return;
    turn++;
    const r = recog; recog = null; r?.abort();
    stopSpeaker();
    setState('paused', 'Paused — tap the orb to keep talking');
  };
  const close = () => {
    if (closed) return;
    closed = true;
    turn++;
    cancelAnimationFrame(raf);
    recog?.abort();
    stopSpeaker();
    el.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); orb.click(); }
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
  el.querySelector('.end').onclick = close;
  setTimeout(listen, 350);
  return { close };
}

export { formatDuration };
