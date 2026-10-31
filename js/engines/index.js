// Response orchestrator: picks the right pipeline (chat, image, AI Mode, research,
// study, Dynamic View) and the right engine (Claude or on-device).
import { settings, engineReady } from '../state.js';
import { getModel } from '../models.js';
import { sleep, pick, truncate } from '../util.js';
import { localAnswer, extractTopic, summarize, sentences } from './local.js';
import { claudeStream, claudeComplete } from './claude.js';
import { buildSystemPrompt } from './prompt.js';
import { bestPage, wikiArticle, wikiImages, lookup } from './knowledge.js';
import { detectAspect, cleanImagePrompt } from '../tools/imagegen.js';
import { gatherSources, composeAnswer, AIMODE_INSTRUCTIONS, sourcesContext } from '../tools/aimode.js';
import { runResearch, composeReport, RESEARCH_INSTRUCTIONS } from '../tools/research.js';
import { makeQuiz } from '../tools/study.js';
import { matchWidget, explorerWidget } from '../tools/genui.js';

const IMAGE_INTENT = /^(?:please\s+)?(?:can you\s+|could you\s+|i want you to\s+)?(?:generate|create|make|draw|paint|render|design|imagine|produce|show me|give me)\s+(?:me\s+)?(?:an?\s+|the\s+|some\s+|\d+\s+)?(?:[\w-]+\s+){0,3}?(?:image|picture|photo|illustration|drawing|painting|artwork|wallpaper|portrait|logo|icon|art|poster|render|scene)s?\b|^(?:draw|paint|sketch|illustrate)\s+/i;

export function detectImageIntent(text) {
  const t = text.trim();
  return IMAGE_INTENT.test(t) && !/\b(code|html|css|svg code|function|program|ascii|chart|graph|diagram|flowchart|table)\b/i.test(t);
}

const bumpEffort = (e) => ({ low: 'medium', medium: 'high', high: 'xhigh', xhigh: 'max', max: 'max' })[e] || 'high';

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
function imgBlock(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(dataUrl || '');
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null;
}

export function buildClaudeMessages(chat, uptoMsg, userSuffix = '') {
  const out = [];
  const idx = chat.messages.indexOf(uptoMsg);
  const msgs = chat.messages.slice(0, idx < 0 ? chat.messages.length : idx);
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  for (const m of msgs) {
    if (m.role === 'user') {
      const content = [];
      for (const a of m.attachments || []) {
        if (a.kind === 'image') {
          const b = imgBlock(a.dataUrl);
          if (b) content.push(b); else content.push({ type: 'text', text: `[Image "${a.name}" attached in an unsupported format]` });
        } else if (a.kind === 'video') {
          (a.frames || []).forEach((f) => { const b = imgBlock(f); if (b) content.push(b); });
          content.push({ type: 'text', text: `[Video "${a.name}" — ${Math.round(a.duration || 0)}s, ${a.width}×${a.height}. ${a.frames?.length || 0} evenly spaced frames are shown above.]` });
        } else if (a.kind === 'audio') {
          content.push({ type: 'text', text: a.transcript ? `[Voice message transcript]: ${a.transcript}` : `[Audio "${a.name}" attached — no transcript available]` });
        } else if (a.mime === 'application/pdf' && a.dataUrl) {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.dataUrl.split(',')[1] }, title: a.name });
        } else if (a.text) {
          content.push({ type: 'text', text: `<file name="${a.name}">\n${a.text.slice(0, 200000)}\n</file>` });
        } else {
          content.push({ type: 'text', text: `[Attached file "${a.name}" — ${a.note || 'contents unavailable'}]` });
        }
      }
      let txt = m.content || '';
      if (m === lastUser && userSuffix) txt += userSuffix;
      if (txt.trim() || !content.length) content.push({ type: 'text', text: txt.trim() || '(see attachment)' });
      out.push({ role: 'user', content });
    } else {
      const v = m.versions?.[m.active ?? 0];
      const c = (v?.content || '').trim();
      if (!c) continue;
      out.push({ role: 'assistant', content: c.length > 40000 ? c.slice(0, 40000) + '\n…[truncated]' : c });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function claudePipeline(ctx, { extra = '', userSuffix = '', effortBoost = false, tool = ctx.tool } = {}) {
  const { msg, version: v, signal } = ctx;
  const model = getModel(msg.model);
  const map = settings.modelMap[model.id] || model.claude;
  let effort = map.effort || 'medium';
  if (tool === 'think' || effortBoost) effort = bumpEffort(effort);
  const system = buildSystemPrompt({ model, tool, agent: ctx.agent, extra });
  const messages = buildClaudeMessages(ctx.chat, msg, userSuffix);
  v.engine = 'claude';
  v.engineModel = map.model;
  const start = performance.now();
  v.thinkStart = Date.now();
  const res = await claudeStream({
    apiKey: settings.anthropicKey, model: map.model, effort, system, messages, signal,
    onThinking: (d) => { v.thinking = (v.thinking || '') + d; ctx.update(); },
    onText: (d) => {
      if (v.thinking && !v.thinkMs) v.thinkMs = performance.now() - start;
      v.content += d;
      ctx.update();
    },
  });
  if (v.thinking && !v.thinkMs) v.thinkMs = performance.now() - start;
  if (res.stopReason === 'refusal') v.notice = { type: 'error', text: 'Claude declined to continue this response for safety reasons. Try rephrasing your request.' };
  else if (res.stopReason === 'max_tokens') v.notice = { type: 'info', text: 'This response hit the length limit. Ask Nova to continue.' };
  if (res.fallback) v.notice = { type: 'info', text: `This turn was completed by a fallback model (${res.model}).` };
  // AI Mode / research follow-ups block
  const fm = /```nova-followups\s*\n([\s\S]*?)```/.exec(v.content);
  if (fm) { try { v.followups = JSON.parse(fm[1]).slice(0, 4); } catch {} }
}

// ---------------------------------------------------------------------------
// On-device helpers
// ---------------------------------------------------------------------------
const SPEED = { 0: 6, 1: 14, 2: 10, 3: 12 };

export async function streamText(ctx, md, model) {
  const v = ctx.version;
  const tokens = md.match(/\s+|[^\s]+/g) || [];
  const frames = 160;
  const base = Math.max(1, Math.ceil(tokens.length / frames));
  const delay = SPEED[model.depth] ?? 10;
  let i = 0;
  while (i < tokens.length) {
    if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const inFence = ((v.content.match(/```/g) || []).length % 2) === 1;
    const k = inFence ? base * 12 : base;
    v.content += tokens.slice(i, i + k).join('');
    i += k;
    ctx.update();
    await sleep(delay, ctx.signal);
  }
}

async function streamThinking(ctx, steps, model) {
  const v = ctx.version;
  if (!settings.showThinking || !steps?.length || !(model.thinks || ctx.tool === 'think')) return;
  const t0 = performance.now();
  v.thinkStart = Date.now();
  for (const s of steps) {
    v.thinking = (v.thinking ? v.thinking + '\n' : '') + '• ' + s;
    ctx.update();
    await sleep(model.depth >= 3 ? 420 : 260, ctx.signal);
  }
  v.thinkMs = performance.now() - t0;
}

function historyFor(chat, msg) {
  const idx = chat.messages.indexOf(msg);
  return chat.messages.slice(0, idx).map((m) => ({ role: m.role, text: m.role === 'user' ? m.content : (m.versions?.[m.active ?? 0]?.content || '') }));
}

export async function localPipeline(ctx, override = null) {
  const { msg, userMsg, version: v, chat } = ctx;
  const model = getModel(msg.model);
  v.engine = 'local';
  const res = override || await localAnswer({
    text: userMsg.content, attachments: userMsg.attachments || [], model, signal: ctx.signal,
    history: historyFor(chat, msg).slice(0, -1), seed: (msg.versions.length - 1),
    depth: Math.min(3, model.depth + (ctx.tool === 'think' ? 1 : 0)),
  });
  if (res.sources?.length) v.sources = res.sources.map(({ text, ...s }) => s);
  if (res.followups?.length) v.followups = res.followups;
  await streamThinking(ctx, res.steps, model);
  await streamText(ctx, res.md, model);
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------
async function imagePipeline(ctx) {
  const { userMsg, version: v } = ctx;
  const text = userMsg.content || '';
  const prompt = cleanImagePrompt(text) || 'a luminous nova in deep blue and violet space';
  const aspect = detectAspect(text);
  const n = /\b(four|4)\b/i.test(text) && /\b(images|pictures|variations|versions|options)\b/i.test(text) ? 4
    : /\b(three|3)\b/i.test(text) && /\b(images|pictures|variations|versions|options)\b/i.test(text) ? 3
    : /\b(two|2|a couple)\b/i.test(text) && /\b(images|pictures|variations|versions|options)\b/i.test(text) ? 2 : 1;
  v.kind = 'image';
  v.engine = engineReady() ? 'claude' : 'local';
  const intro = pick(['Here you go ✦', 'Done — here\'s what I created:', 'Here\'s your image:', 'Fresh from the studio:']);
  const blocks = Array.from({ length: n }, (_, i) => `\`\`\`nova-image\n${JSON.stringify({ prompt, aspect, seed: i + (ctx.msg.versions.length - 1) * 10 })}\n\`\`\``).join('\n\n');
  const attNote = (userMsg.attachments || []).some((a) => a.kind === 'image') ? '\n\n*Note: Nova creates new images from your description — it can\'t edit the attached photo directly yet.*' : '';
  v.content = `${n > 1 ? `Here are ${n} variations ✦` : intro}\n\n${blocks}${attNote}`;
  ctx.update();
}

async function aiModePipeline(ctx) {
  const { userMsg, msg, version: v, signal } = ctx;
  const model = getModel(msg.model);
  const q = (userMsg.content || '').trim();
  v.kind = 'aimode';
  v.engine = engineReady() ? 'claude' : 'local';
  v.steps = [{ text: `Searching for "${truncate(q, 60)}"`, state: 'active' }];
  ctx.update();
  let sources = [];
  if (settings.liveData) sources = await gatherSources(q, { n: model.depth >= 2 ? 6 : 4, signal }).catch((e) => { if (e.name === 'AbortError') throw e; return []; });
  v.steps[0].state = 'done';
  v.sources = sources.map(({ text, ...s }) => s);
  v.images = sources.filter((s) => s.thumb).map((s) => ({ src: s.thumb, url: s.url, title: s.title })).slice(0, 6);
  v.steps.push({ text: sources.length ? `Reviewed ${sources.length} sources` : 'No sources found — answering from general knowledge', state: 'done' });
  ctx.update();
  if (engineReady()) {
    v.steps.push({ text: 'Writing an answer with citations', state: 'active' });
    ctx.update();
    await claudePipeline(ctx, { extra: AIMODE_INSTRUCTIONS, userSuffix: sources.length ? `\n\nSOURCES:\n${sourcesContext(sources)}` : '', tool: null });
    v.steps[v.steps.length - 1].state = 'done';
    return;
  }
  if (!sources.length) {
    const res = await localAnswer({ text: q, attachments: [], model, signal, history: [], seed: 0, depth: model.depth });
    if (/on-device mode/.test(res.md)) {
      res.md = settings.liveData
        ? `I couldn't find search sources for **${truncate(q, 80)}** right now — the search service may be busy, or the query may be too specific.\n\nTry rephrasing it as a topic (for example *"vaccines"* instead of a full question), or ask again in a moment.`
        : 'Live data is turned off in **Settings → General**, so AI Mode can\'t search for sources.';
      res.followups = [];
    }
    return localPipeline(ctx, res);
  }
  const ans = composeAnswer(q, sources, model.depth);
  v.paa = ans.paa;
  v.followups = ans.followups;
  await streamText(ctx, ans.md, model);
}

async function researchPipeline(ctx) {
  const { userMsg, msg, version: v, signal } = ctx;
  const model = getModel(msg.model);
  const q = (userMsg.content || '').trim();
  v.kind = 'research';
  v.engine = engineReady() ? 'claude' : 'local';
  v.steps = [{ text: 'Planning research', state: 'active' }];
  v.research = { progress: 4, label: 'Planning research…' };
  ctx.update();
  let plan = null;
  if (engineReady()) {
    try {
      const txt = await claudeComplete({ apiKey: settings.anthropicKey, model: settings.modelMap['nova-1-flash']?.model || 'claude-haiku-5-5', effort: 'low', signal,
        system: 'You plan research. Reply with ONLY a JSON array of 5 or 6 short, distinct Wikipedia search queries that together cover the topic thoroughly.', prompt: q });
      const m = /\[[\s\S]*\]/.exec(txt);
      if (m) plan = JSON.parse(m[0]).filter((s) => typeof s === 'string').slice(0, 6);
    } catch (e) { if (e.name === 'AbortError') throw e; }
  }
  v.steps[0].state = 'done';
  if (!settings.liveData) {
    v.steps.push({ text: 'Live data is turned off — skipping web sources', state: 'done' });
    return engineReady() ? claudePipeline(ctx, { extra: RESEARCH_INSTRUCTIONS, effortBoost: true }) : localPipeline(ctx);
  }
  const res = await runResearch({
    query: q, plan, signal,
    onProgress: (p) => {
      if (p.phase === 'search') {
        v.steps.push({ text: `Searched: ${p.query}`, state: 'done' });
        v.research = { progress: 8 + Math.round((p.i / p.total) * 50), label: `Searching (${p.i + 1}/${p.total}) · ${p.found} sources found` };
      } else if (p.phase === 'read') {
        v.steps.push({ text: `Reading ${p.found} candidate sources`, state: 'done' });
        v.research = { progress: 66, label: 'Reading sources…' };
      } else if (p.phase === 'write') {
        v.steps.push({ text: `Synthesizing ${p.found} sources into a report`, state: 'active' });
        v.research = { progress: 80, label: 'Writing report…' };
      }
      ctx.update();
    },
  });
  v.sources = res.sources.map(({ text, ...s }) => s);
  ctx.update();
  if (engineReady()) {
    const ctxText = res.sources.map((s, i) => {
      const deep = [res.main, ...res.deep].find((a) => a && a.title === s.title);
      const body = deep ? deep.sections.map((x) => `## ${x.title}\n${x.text}`).join('\n').slice(0, 9000) : s.text;
      return `[${i + 1}] ${s.title} (${s.url})\n${body}`;
    }).join('\n\n');
    await claudePipeline(ctx, { extra: RESEARCH_INSTRUCTIONS, userSuffix: `\n\nSOURCES:\n${ctxText}`, effortBoost: true, tool: null });
  } else {
    await streamText(ctx, composeReport(res, model.depth), model);
  }
  v.steps[v.steps.length - 1].state = 'done';
  v.research = { progress: 100, label: `Report complete · ${res.sources.length} sources` };
}

async function studyPipeline(ctx) {
  if (engineReady()) return claudePipeline(ctx);
  const { userMsg, msg, version: v, signal } = ctx;
  const model = getModel(msg.model);
  const raw = (userMsg.content || '').replace(/^(quiz me|test me|make (me )?(a )?(quiz|flashcards)|flashcards|study|teach me|help me (learn|study|understand)|explain)\s*(on|about|for|with)?\s*/i, '');
  const topic = extractTopic(raw) || raw;
  const steps = [`Topic: ${topic}`];
  const page = settings.liveData ? await bestPage(topic, { signal }).catch(() => null) : null;
  const art = page ? await wikiArticle(page.title, { signal }).catch(() => null) : null;
  if (!art) return localPipeline(ctx);
  const quiz = makeQuiz(art, { n: 4 + model.depth, seed: msg.versions.length - 1 });
  steps.push(`Read the Wikipedia article "${art.title}"`, `Generated ${quiz.questions.length} questions and ${quiz.cards.length} flashcards`);
  const intro = summarize(art.sections[0]?.text || page.extract, 3);
  const seen = new Set(intro);
  const ideas = summarize(art.sections.slice(1).map((s) => s.text).join(' '), 10).filter((s) => s.length > 50 && s.length < 220 && !seen.has(s) && seen.add(s)).slice(0, 4);
  const md = `## 📚 Let's learn: ${art.title}\n\n${intro.join(' ')}\n\n### Key ideas\n${ideas.map((s) => `- ${s}`).join('\n')}\n\n${quiz.questions.length ? `Ready to check your understanding? Answer the questions below — I'll explain each one.\n\n\`\`\`nova-quiz\n${JSON.stringify(quiz)}\n\`\`\`` : ''}\n\n*Source: [Wikipedia — ${art.title}](${art.url})*`;
  v.sources = [{ title: art.title, url: art.url, snippet: truncate(page.extract, 160), site: 'wikipedia.org', thumb: art.thumb }];
  await streamThinking(ctx, steps, model);
  await streamText(ctx, md, model);
}

async function dynamicPipeline(ctx) {
  if (engineReady()) return claudePipeline(ctx);
  const { userMsg, msg, version: v, signal } = ctx;
  const model = getModel(msg.model);
  const text = (userMsg.content || '').trim();
  const w = matchWidget(text);
  if (w) {
    return localPipeline(ctx, { md: `Here's an interactive **${w.title.toLowerCase()}** ✦\n\n\`\`\`nova-ui title="${w.title}" widget="${w.id}"\n\n\`\`\``, steps: ['Dynamic View: matched a built-in interface', `Generated "${w.title}"`] });
  }
  let res = null;
  if (/\b(weather|forecast|temperature)\b/i.test(text)) {
    res = await localAnswer({ text, attachments: userMsg.attachments || [], model, signal, history: [], seed: 0, depth: model.depth });
    if (/```nova-ui/.test(res.md)) return localPipeline(ctx, res);
  }
  const topic = extractTopic(text.replace(/^(show|build|make|create|give)( me)?( an?)?( interactive| visual)?( guide| layout| page| explorer| view)?( to| for| of| about| on)?\s*/i, ''));
  const page = settings.liveData ? await bestPage(topic, { signal }).catch(() => null) : null;
  const art = page ? await wikiArticle(page.title, { signal }).catch(() => null) : null;
  if (!art) return localPipeline(ctx, res || undefined);
  const [images, related] = await Promise.all([
    wikiImages(art.title, { signal }).catch(() => []),
    lookup(art.title, { n: 5, signal }).catch(() => []),
  ]);
  const quiz = makeQuiz(art, { n: 3 }).questions;
  const html = explorerWidget({ article: art, images, related: related.filter((r) => r.title !== art.title).slice(0, 4).map((r) => r.title), quiz });
  v.sources = [{ title: art.title, url: art.url, snippet: truncate(page.extract, 160), site: 'wikipedia.org', thumb: art.thumb }];
  return localPipeline(ctx, {
    md: `Here's an interactive visual layout for **${art.title}** — explore the tabs, gallery and quick quiz:\n\n\`\`\`nova-ui title="${art.title.replace(/"/g, '')} — visual guide"\n${html}\n\`\`\``,
    steps: ['Dynamic View: building a visual layout', `Researched "${art.title}"`, `Collected ${images.length} images and ${quiz.length} quiz questions`, 'Composed an explorable interface'],
  });
}

/** Main entry: generate the assistant reply into ctx.version. */
export async function respond(ctx) {
  const text = ctx.userMsg.content || '';
  const tool = ctx.tool;
  if (tool === 'image' || (!tool && detectImageIntent(text) && !(ctx.userMsg.attachments || []).some((a) => a.kind !== 'image'))) return imagePipeline(ctx);
  if (tool === 'search') return aiModePipeline(ctx);
  if (tool === 'research') return researchPipeline(ctx);
  if (tool === 'study') return studyPipeline(ctx);
  if (tool === 'dynamic') return dynamicPipeline(ctx);
  if (engineReady()) return claudePipeline(ctx);
  return localPipeline(ctx);
}

export { summarize };
