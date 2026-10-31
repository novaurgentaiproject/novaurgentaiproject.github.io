// Voice: dictation (speech-to-text), voice messages (recording + live transcript),
// read-aloud (text-to-speech) and a full-screen voice conversation mode.
import { settings } from '../state.js';
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
export function listVoices() { return canSpeak ? speechSynthesis.getVoices() : []; }

export function speechText(md) {
  return stripMarkdown(String(md)
    .replace(/```nova-[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*?```/g, ' (code block omitted) ')
    .replace(/https?:\/\/\S+/g, ''))
    .replace(/\s+/g, ' ').trim();
}

let speaking = null;
export function speak(text, { onEnd, onStart } = {}) {
  if (!canSpeak) return false;
  stopSpeaking();
  const clean = speechText(text);
  if (!clean) { onEnd?.(); return false; }
  const chunks = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean];
  const voice = listVoices().find((v) => v.voiceURI === settings.voice);
  let i = 0;
  const token = {};
  speaking = token;
  const next = () => {
    if (speaking !== token) return;
    if (i >= chunks.length) { speaking = null; onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    if (voice) u.voice = voice;
    u.rate = settings.speechRate || 1;
    u.onend = next;
    u.onerror = next;
    if (i === 1) u.onstart = onStart;
    speechSynthesis.speak(u);
  };
  next();
  return true;
}
export function stopSpeaking() { speaking = null; if (canSpeak) speechSynthesis.cancel(); }
export function isSpeaking() { return !!speaking; }

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
export function openVoiceMode({ modelName, onUserText }) {
  if (!SR) return { error: 'Voice mode needs speech recognition, which this browser doesn\'t support. Try Chrome, Edge or Safari.' };
  const el = h(`<div class="voice-mode" role="dialog" aria-label="Voice mode">
<div class="vm-top"><span>${icon('waveform', 'icon-sm')} Voice mode · ${esc(modelName)}</span><span class="vm-hint">Speak naturally — Nova listens, then answers out loud</span></div>
<canvas></canvas><div><div class="vm-status">Starting…</div><div class="vm-caption"></div></div>
<div class="vm-controls"><button class="mute" title="Mute microphone" aria-label="Mute microphone">${icon('mic')}</button><button class="end" title="End voice mode" aria-label="End voice mode">${icon('x')}</button></div></div>`);
  document.body.appendChild(el);
  const canvas = el.querySelector('canvas'), status = el.querySelector('.vm-status'), caption = el.querySelector('.vm-caption');
  const muteBtn = el.querySelector('.mute');
  let state = 'idle', muted = false, closed = false, level = 0, stream = null, an = null, ac = null, recog = null, raf;
  const buf = new Uint8Array(128);

  navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => {
    stream = s;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    an = ac.createAnalyser(); an.fftSize = 256;
    ac.createMediaStreamSource(s).connect(an);
  }).catch(() => {});

  const setState = (s, text) => { state = s; status.textContent = text; };
  const draw = (t) => {
    if (an && state === 'listening') { an.getByteTimeDomainData(buf); let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v - 128)); level += (p / 128 - level) * 0.25; }
    else if (state === 'speaking') level += ((0.35 + Math.sin(t / 120) * 0.15 + Math.random() * 0.1) - level) * 0.2;
    else level += (0.06 - level) * 0.1;
    const ctx = canvas.getContext('2d');
    const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.28 * (1 + level * 0.5);
    ctx.clearRect(0, 0, W, H);
    for (let k = 3; k >= 0; k--) {
      const r = R * (1 + k * 0.18 + Math.sin(t / 600 + k) * 0.03);
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, `rgba(${state === 'thinking' ? '200,180,255' : '160,190,255'},${0.9 - k * 0.2})`);
      g.addColorStop(0.5, `rgba(91,${state === 'speaking' ? 60 : 84},255,${0.55 - k * 0.12})`);
      g.addColorStop(1, `rgba(157,77,255,${0.25 - k * 0.06})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
        const wob = 1 + Math.sin(a * 3 + t / (300 + k * 90)) * 0.04 * (1 + level * 3) + Math.sin(a * 5 - t / 500) * 0.02;
        ctx.lineTo(cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob);
      }
      ctx.fill();
    }
    if (!closed) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  const listen = () => {
    if (closed) return;
    if (muted) { setState('muted', 'Microphone muted'); return; }
    setState('listening', 'Listening…');
    let heard = '';
    recog = createRecognizer({
      continuous: false,
      onInterim: (i, f) => { heard = (f + ' ' + i).trim(); caption.textContent = heard; },
      onEnd: async (f) => {
        const text = (f || heard).trim();
        if (closed) return;
        if (!text) { setTimeout(listen, 300); return; }
        caption.textContent = text;
        setState('thinking', 'Thinking…');
        let reply = '';
        try { reply = await onUserText(text); } catch (e) { reply = 'Sorry, something went wrong.'; }
        if (closed) return;
        caption.textContent = speechText(reply).slice(0, 280);
        setState('speaking', 'Speaking…  (tap the orb to interrupt)');
        const ok = speak(reply, { onEnd: () => { if (!closed && state === 'speaking') listen(); } });
        if (!ok) listen();
      },
      onError: (err) => { if (err === 'not-allowed') setState('idle', 'Microphone access was denied.'); },
    });
    recog.start();
  };
  canvas.addEventListener('click', () => { if (state === 'speaking') { stopSpeaking(); listen(); } });
  muteBtn.onclick = () => {
    muted = !muted;
    muteBtn.classList.toggle('muted', muted);
    muteBtn.innerHTML = icon(muted ? 'micOff' : 'mic');
    if (muted) { recog?.abort(); setState('muted', 'Microphone muted'); } else if (state !== 'speaking' && state !== 'thinking') listen();
  };
  const close = () => {
    closed = true;
    cancelAnimationFrame(raf);
    recog?.abort(); stopSpeaking();
    stream?.getTracks().forEach((t) => t.stop());
    ac?.close().catch(() => {});
    el.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelector('.end').onclick = close;
  setTimeout(listen, 400);
  return { close };
}

export { formatDuration };
