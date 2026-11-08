// Cloud listening: records the microphone with the Web Audio API, notices when the
// user stops talking, and transcribes the clip with Fish Audio through the Nova
// voice server. Voice mode uses it where the browser's own speech recognition is
// missing or broken — most importantly Home Screen web apps on iPhone and iPad.

export const canCloudRecord = !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));

let ctx = null;
/** Create/resume the shared AudioContext. Call it inside a tap so iOS allows it. */
export function primeAudioContext() {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch {}
  return ctx;
}

/**
 * Record one spoken turn. Resolves to { wav: Blob, seconds } once the user pauses,
 * or null if nobody spoke. `stop()` ends the turn early (e.g. tapping the orb).
 */
export function recordUtterance({ onLevel, onSpeechStart, onReady, silenceMs = 1100, maxMs = 30000, noSpeechMs = 10000 } = {}) {
  let finish = () => {};
  let aborted = false;
  const promise = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    if (aborted) { stream.getTracks().forEach((t) => t.stop()); throw new DOMException('Aborted', 'AbortError'); }
    const ac = primeAudioContext();
    if (ac.state !== 'running') await ac.resume().catch(() => {});
    const src = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(4096, 1, 1);
    const sink = ac.createGain();
    sink.gain.value = 0;
    src.connect(proc);
    proc.connect(sink);
    sink.connect(ac.destination);
    const rate = ac.sampleRate;
    const chunks = [], preRoll = [];
    const preRollFrames = Math.ceil((0.45 * rate) / 4096);
    const t0 = performance.now();
    let floor = 0, frames = 0, speechAt = 0, lastVoice = 0, voicedMs = 0;
    onReady?.();
    return await new Promise((resolve, reject) => {
      let done = false;
      // Wall-clock watchdog: if iOS suspends audio, no frames arrive and the checks below never run.
      const watchdog = setInterval(() => {
        const now = performance.now();
        if (!frames && now - t0 > 3500) finish('no-audio');
        else if (!speechAt && now - t0 > noSpeechMs + 1500) finish('none');
        else if (speechAt && now - speechAt > maxMs + 1500) finish('max');
      }, 500);
      finish = (reason) => {
        if (done) return;
        done = true;
        clearInterval(watchdog);
        proc.onaudioprocess = null;
        try { src.disconnect(); proc.disconnect(); sink.disconnect(); } catch {}
        stream.getTracks().forEach((t) => t.stop());
        if (reason === 'abort') return reject(new DOMException('Aborted', 'AbortError'));
        if (reason === 'no-audio') return reject(Object.assign(new Error("the microphone isn't sending any sound"), { name: 'NoAudioError' }));
        if (!speechAt || voicedMs < 180) return resolve(null);
        resolve({ wav: encodeWav(chunks, rate), seconds: chunks.reduce((n, c) => n + c.length, 0) / rate });
      };
      proc.onaudioprocess = (e) => {
        if (done) return;
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        const frameMs = (data.length / rate) * 1000;
        frames++;
        // Track the background-noise level while nobody is talking.
        if (frames <= 3) floor = frames === 1 ? rms : Math.min(floor, rms);
        else if (!speechAt || now - lastVoice > 400) floor = floor * 0.96 + Math.min(rms, floor * 2) * 0.04;
        const threshold = Math.max(0.012, floor * 2.6);
        const voiced = frames > 2 && rms > threshold;
        onLevel?.(Math.min(1, rms / Math.max(threshold * 3, 0.06)));
        if (voiced) {
          if (!speechAt) { speechAt = now; chunks.push(...preRoll); preRoll.length = 0; onSpeechStart?.(); }
          lastVoice = now;
          voicedMs += frameMs;
        }
        if (speechAt) chunks.push(data);
        else { preRoll.push(data); if (preRoll.length > preRollFrames) preRoll.shift(); }
        if (speechAt && now - lastVoice > silenceMs) finish('silence');
        else if (speechAt && now - speechAt > maxMs) finish('max');
        else if (!speechAt && now - t0 > noSpeechMs) finish('none');
      };
    });
  })();
  return {
    promise,
    /** Stop now and keep what was said so far. */
    stop: () => finish('stop'),
    /** Stop and throw the recording away. */
    abort: () => { aborted = true; finish('abort'); },
  };
}

/** 16 kHz, 16-bit mono WAV — small, and accepted by every speech-to-text model. */
export function encodeWav(chunks, rate, outRate = 16000) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const ratio = rate / outRate;
  const n = Math.floor(total / ratio);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  // Flatten, then average each window of input samples into one output sample.
  const flat = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { flat.set(c, off); off += c.length; }
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(total, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += flat[j];
    const x = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Send a recording to the voice server's /v1/asr and return the transcript. */
export async function transcribe(wav, { base, key, signal } = {}) {
  if (!base) throw new Error('no voice server is set up');
  const lang = (navigator.language || 'en').split('-')[0].toLowerCase();
  const headers = { 'Content-Type': wav.type || 'audio/wav', model: 'transcribe-1' };
  if (key) headers.Authorization = `Bearer ${key}`;
  let res;
  try { res = await fetch(`${base}/v1/asr?language=${encodeURIComponent(lang)}`, { method: 'POST', headers, body: wav, signal }); }
  catch (e) { if (e?.name === 'AbortError') throw e; throw new Error("couldn't reach the voice server"); }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 404) throw new Error('your voice server needs updating: redeploy the latest worker.js so Nova can hear you');
  if (res.status === 401) throw new Error('the Fish Audio API key was rejected');
  if (res.status === 402) throw new Error('your Fish Audio account is out of API credit');
  if (res.status === 429 && data.message) throw new Error(data.message);
  if (!res.ok) throw new Error(data.message || `the voice server returned an error (${res.status})`);
  return String(data.text || '')
    .replace(/<\|[^|>]*\|>/g, ' ')
    .replace(/\[[^\]]{1,24}\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
