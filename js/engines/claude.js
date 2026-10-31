// Claude engine — uses the official Anthropic TypeScript/JS SDK, loaded on demand
// from a CDN so the static site has no build step. The user's API key never
// leaves their browser except to call api.anthropic.com directly.

const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@1.3.0?bundle';
let sdkPromise = null;

export function loadSDK() {
  if (!sdkPromise) {
    sdkPromise = import(/* @vite-ignore */ SDK_URL).catch((e) => {
      sdkPromise = null;
      throw new Error('Could not load the Anthropic SDK. Check your internet connection. (' + e.message + ')');
    });
  }
  return sdkPromise;
}

// Models that support server-side refusal fallbacks with the "default" form.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

async function client(apiKey) {
  const mod = await loadSDK();
  const Anthropic = mod.default || mod.Anthropic;
  return { Anthropic, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
}

function friendlyError(e, Anthropic) {
  if (e?.name === 'AbortError' || e instanceof Error && /abort/i.test(e.name)) return e;
  if (Anthropic) {
    if (e instanceof Anthropic.AuthenticationError) return new Error('Your Anthropic API key was rejected. Check it in Settings → Engine.');
    if (e instanceof Anthropic.PermissionDeniedError) return new Error('Your API key does not have access to this model. Pick another model mapping in Settings → Engine.');
    if (e instanceof Anthropic.NotFoundError) return new Error('Model not found. Check the model mapping in Settings → Engine.');
    if (e instanceof Anthropic.RateLimitError) return new Error('Rate limited by the Anthropic API — wait a moment and try again.');
    if (e instanceof Anthropic.BadRequestError) return new Error('The Anthropic API rejected the request: ' + (e.error?.error?.message || e.message));
    if (e instanceof Anthropic.APIConnectionError) return new Error('Could not reach the Anthropic API. Check your connection.');
    if (e instanceof Anthropic.APIError) return new Error(`Anthropic API error ${e.status ?? ''}: ${e.error?.error?.message || e.message}`);
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Stream a response from Claude.
 * @returns {Promise<{stopReason: string, model: string, usage: object, fallback: boolean}>}
 */
export async function claudeStream({ apiKey, model, effort, system, messages, signal, onText, onThinking, maxTokens = 64000 }) {
  let Anthropic;
  try {
    const c = await client(apiKey);
    Anthropic = c.Anthropic;
    const params = {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort },
    };
    const useFallback = FALLBACK_MODELS.has(model);
    const stream = useFallback
      ? c.client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
      : c.client.messages.stream(params, { signal });

    for await (const ev of stream) {
      if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta') onText?.(ev.delta.text);
        else if (ev.delta.type === 'thinking_delta') onThinking?.(ev.delta.thinking);
      }
    }
    const final = await stream.finalMessage();
    const fallback = (final.usage?.iterations || []).some((it) => it.type === 'fallback_message');
    return { stopReason: final.stop_reason, stopDetails: final.stop_details, model: final.model, usage: final.usage, fallback };
  } catch (e) {
    throw friendlyError(e, Anthropic);
  }
}

/** Non-streaming helper for short tasks (titles, SVG art, query planning). */
export async function claudeComplete({ apiKey, model, effort = 'low', system, prompt, messages, signal, maxTokens = 16000 }) {
  let text = '';
  const res = await claudeStream({
    apiKey, model, effort, system, signal, maxTokens,
    messages: messages || [{ role: 'user', content: prompt }],
    onText: (t) => { text += t; },
  });
  if (res.stopReason === 'refusal') throw new Error('Claude declined this request.');
  return text;
}

/** Quick key check used by the Settings screen. */
export async function testKey(apiKey, model = 'claude-haiku-5-5') {
  const c = await client(apiKey);
  try {
    const r = await c.client.messages.create({
      model,
      max_tokens: 512,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    });
    return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || 'ready';
  } catch (e) {
    throw friendlyError(e, c.Anthropic);
  }
}
