// Nova voice server: a tiny Cloudflare Worker that relays speech requests from
// the Nova website to Fish Audio: text-to-speech (James's voice) and
// speech-to-text (so Nova can hear you where the browser can't, such as
// Home Screen apps on iPhone and iPad).
//
// Why it exists: Fish Audio's API doesn't send CORS headers, so a web page
// can't call it directly. This Worker adds them, checks where requests come
// from, and (optionally) keeps your Fish Audio API key secret on the server.
//
// Environment (Workers → your worker → Settings → Variables and Secrets):
//   FISH_API_KEY     (secret, recommended) your Fish Audio API key. If set,
//                    visitors don't need a key of their own.
//   ALLOWED_ORIGINS  (optional) comma-separated sites allowed to use this
//                    server. Defaults to the Nova site plus localhost.
//   FISH_VOICE_ID    (optional) default voice. Defaults to James.
//   LOCK_VOICE       (optional) "true" to always use FISH_VOICE_ID.
//   MAX_CHARS        (optional) longest text accepted per request (default 1500).
//   MAX_AUDIO_MB     (optional) largest recording accepted for transcription (default 8).

const JAMES = '802e3bc2b27e49c2995d23ef70e6ac89';
const DEFAULT_ORIGINS = [
  'https://novaurgentaiproject.github.io',
  'http://localhost:8000',
  'http://localhost:8765',
  'http://127.0.0.1:8000',
];
const MODELS = new Set(['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free']);
const FORMATS = new Set(['mp3', 'wav', 'opus']);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
    const originOk = origins.includes('*') || origins.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, model',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    // Health check: open to everyone (it reveals nothing secret) so you can visit it
    // in a browser, and so Nova can explain when its site isn't on the allowed list.
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      return new Response(JSON.stringify({ service: 'nova-voice', ok: true, features: ['tts', 'asr'], serverKey: !!env.FISH_API_KEY, voice: env.FISH_VOICE_ID || JAMES, originAllowed: !origin || originOk }), {
        headers: { ...cors, 'Access-Control-Allow-Origin': origin || '*', 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json(403, { status: 403, message: `This voice server doesn't accept requests from ${origin || 'unknown sites'}. Add it to ALLOWED_ORIGINS.` });
    if (request.method !== 'POST' || (path !== '/v1/tts' && path !== '/v1/asr')) return json(404, { status: 404, message: 'Not found. Send POST /v1/tts or /v1/asr.' });

    const key = env.FISH_API_KEY || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!key) return json(401, { status: 401, message: 'No Fish Audio API key. Add FISH_API_KEY to this server, or paste a key in Nova → Settings → Speech.' });

    // Speech to text: the body is the raw recording (Nova sends 16 kHz WAV).
    if (path === '/v1/asr') {
      const type = (request.headers.get('Content-Type') || 'audio/wav').split(';')[0].trim();
      if (!/^audio\/|^video\/|^application\/octet-stream$/.test(type)) return json(415, { status: 415, message: 'Send the recording as the request body with an audio/* Content-Type.' });
      const audio = await request.arrayBuffer();
      const maxBytes = (Number(env.MAX_AUDIO_MB) || 8) * 1024 * 1024;
      if (!audio.byteLength) return json(400, { status: 400, message: 'The recording is empty.' });
      if (audio.byteLength > maxBytes) return json(413, { status: 413, message: 'The recording is too long.' });
      const ext = /wav/.test(type) ? 'wav' : /mpeg|mp3/.test(type) ? 'mp3' : /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /webm/.test(type) ? 'webm' : 'wav';
      const form = new FormData();
      form.append('audio', new Blob([audio], { type }), `speech.${ext}`);
      const lang = (url.searchParams.get('language') || '').toLowerCase();
      if (/^[a-z]{2}$/.test(lang)) form.append('language', lang);
      form.append('ignore_timestamps', 'true');
      const asrModel = request.headers.get('model') === 'transcribe-1-pro' ? 'transcribe-1-pro' : 'transcribe-1';
      let upstream;
      try {
        upstream = await fetch('https://api.fish.audio/v1/asr', { method: 'POST', headers: { Authorization: `Bearer ${key}`, model: asrModel }, body: form });
      } catch {
        return json(502, { status: 502, message: "Couldn't reach Fish Audio." });
      }
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      headers.set('Cache-Control', 'no-store');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    let body;
    try { body = await request.json(); } catch { return json(400, { status: 400, message: 'Expected a JSON body.' }); }
    const text = String(body?.text ?? '').trim();
    const max = Number(env.MAX_CHARS) || 1500;
    if (!text) return json(400, { status: 400, message: 'Text is empty.' });
    if (text.length > max) return json(413, { status: 413, message: `Text is longer than ${max} characters.` });

    const speed = Math.min(2, Math.max(0.5, Number(body?.prosody?.speed) || 1));
    const payload = {
      text,
      reference_id: env.LOCK_VOICE === 'true' ? env.FISH_VOICE_ID || JAMES : String(body.reference_id || env.FISH_VOICE_ID || JAMES),
      format: FORMATS.has(body.format) ? body.format : 'mp3',
      mp3_bitrate: [64, 128, 192].includes(body.mp3_bitrate) ? body.mp3_bitrate : 128,
      latency: ['low', 'normal', 'balanced'].includes(body.latency) ? body.latency : 'balanced',
      normalize: body.normalize !== false,
      prosody: { speed, volume: 0 },
    };
    const requested = request.headers.get('model') || '';
    const model = MODELS.has(requested) ? requested : 's2.1-pro';

    let upstream;
    try {
      upstream = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model },
        body: JSON.stringify(payload),
      });
    } catch {
      return json(502, { status: 502, message: "Couldn't reach Fish Audio." });
    }
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || (upstream.ok ? 'audio/mpeg' : 'application/json'));
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Nova-Model', model);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
