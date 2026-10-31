// Message rendering: user bubbles, assistant answers (slot-based so streaming
// updates only touch what changed) and Nova's rich blocks.
import { esc, hash, formatBytes, truncate } from './util.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { getModel } from './models.js';
import { settings, emit, widgetState, setWidgetState } from './state.js';
import { wrapUI, buildWidget, upgradeLegacyUI } from './tools/genui.js';
import { specToHTML, normalizeSpec } from './tools/widgetkit.js';
import { generateImage, ASPECTS } from './tools/imagegen.js';
import { fileBadge, fileKindLabel, describeAttachment } from './tools/files.js';

export const TOOLS = {
  image: { label: 'Create image', icon: 'image', placeholder: 'Describe an image', desc: 'Visualize anything' },
  search: { label: 'AI Mode', icon: 'globe', placeholder: 'Ask anything — AI Mode searches the web', desc: 'Answers with sources & follow-ups' },
  dynamic: { label: 'Dynamic View', icon: 'layout', placeholder: 'Describe a tool, game or topic to explore', desc: 'Generate an interactive interface' },
  canvas: { label: 'Canvas', icon: 'code', placeholder: 'Write or code anything', desc: 'Write and run code side by side' },
  think: { label: 'Think longer', icon: 'bulb', placeholder: 'Ask anything', desc: 'More reasoning for harder questions' },
  research: { label: 'Deep research', icon: 'compass', placeholder: 'What should Nova research?', desc: 'Multi-source cited report' },
  study: { label: 'Study and learn', icon: 'book', placeholder: 'What do you want to learn?', desc: 'Lessons, quizzes & flashcards' },
  file: { label: 'Create file', icon: 'filePlus', placeholder: 'Describe the file — e.g. a PDF report on…', desc: 'PDF, Word, Excel, CSV & more' },
};

// Registries for block payloads referenced from the DOM.
export const blocks = new Map(); // id -> { type, ... }
export const uiFrames = new Map(); // id -> iframe
const openThinking = new Set();
const pendingArt = new Map();

const activeVersion = (msg) => msg.versions[msg.active ?? 0];

// ---------------------------------------------------------------------------
// Rich blocks
// ---------------------------------------------------------------------------
function parseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

function imageBlock(ctx, body, { closed, index, streaming }) {
  const key = `img${index}`;
  if (!closed) return `<div class="gen-image"><div class="label">${icon('sparkles', 'icon-sm')} Creating image…</div><div class="frame"><div class="ph" style="--ar:1"><span>${icon('image', 'icon-sm')} Preparing…</span></div></div></div>`;
  const spec = parseJSON(body) || { prompt: body.trim() };
  spec.aspect = ASPECTS[spec.aspect] ? spec.aspect : '1:1';
  const [w, h] = ASPECTS[spec.aspect];
  const art = ctx.version.artifacts?.[key];
  const id = `${ctx.msg.id}:${ctx.vi}:${key}`;
  blocks.set(id, { type: 'image', spec, chatId: ctx.chat.id, msgId: ctx.msg.id, vi: ctx.vi, key });
  if (art?.src) {
    return `<div class="gen-image" data-art="${key}"><div class="label">${icon('sparkles', 'icon-sm')} Image created</div>
<div class="frame" style="--ar:${art.width || w}/${art.height || h}"><img src="${esc(art.src)}" alt="${esc(spec.prompt)}" data-action="lightbox" data-block="${esc(id)}" loading="lazy" ${art.engine === 'cloud' ? 'referrerpolicy="no-referrer"' : ''}>
<div class="overlay"><button data-action="img-download" data-block="${esc(id)}" title="Download">${icon('download', 'icon-sm')}</button><button data-action="img-remix" data-block="${esc(id)}" title="New variation">${icon('refresh', 'icon-sm')}</button><button data-action="img-edit" data-block="${esc(id)}" title="Edit prompt">${icon('pencil', 'icon-sm')}</button><button data-action="lightbox" data-block="${esc(id)}" title="View">${icon('maximize', 'icon-sm')}</button></div></div>
<div class="caption"><span class="prompt">“${esc(truncate(spec.prompt, 140))}”</span> · <span>${esc(art.label || '')}</span></div>${art.note ? `<div class="caption">${icon('info', 'icon-sm')} ${esc(art.note)}</div>` : ''}</div>`;
  }
  if (art?.error) {
    return `<div class="gen-image" data-art="${key}"><div class="notice error">${icon('alert')}<div>Image generation failed: ${esc(art.error)} <button class="btn sm" data-action="img-retry" data-block="${esc(id)}">Retry</button></div></div></div>`;
  }
  return `<div class="gen-image" data-art="${key}"><div class="label shimmer-text">${icon('sparkles', 'icon-sm')} Creating image…</div><div class="frame"><div class="ph" style="--ar:${w}/${h}"><span>${icon('sparkles', 'icon-sm spin')} ${esc(truncate(spec.prompt, 60))}</span></div></div>${streaming ? '' : `<span data-hydrate="image" data-block="${esc(id)}"></span>`}</div>`;
}

function fileBlock(ctx, body, { closed, attrs, index }) {
  const name = (attrs.name || `nova-file-${index + 1}.txt`).replace(/[\\/:*?"<>|]+/g, '-');
  const id = 'f' + hash(ctx.msg.id + name + index).toString(36);
  blocks.set(id, { type: 'file', name, content: body });
  const size = new Blob([body]).size;
  return `<div class="file-card${closed ? '' : ' pending'}"><div class="file-ico">${esc(fileBadge(name))}</div><div class="info"><b>${esc(name)}</b><small>${esc(fileKindLabel(name))} · ${closed ? (/\.(pdf|docx|xlsx)$/i.test(name) ? 'ready to export' : formatBytes(size)) : 'Writing…'}</small></div>
${closed ? `<div class="actions"><button class="icon-btn" data-action="file-preview" data-block="${id}" title="Preview">${icon('eye')}</button>${/\.(html?|js|css|py|ts|json|md|txt|csv|svg|sql|sh|java|c|cpp|go|rs|rb|php)$/i.test(name) ? `<button class="icon-btn" data-action="file-canvas" data-block="${id}" title="Open in Canvas">${icon('pencil')}</button>` : ''}<button class="btn primary sm" data-action="file-download" data-block="${id}">${icon('download', 'icon-sm')} Download</button></div>` : ''}</div>`;
}

function uiBlock(ctx, body, { closed, attrs, index, streaming }) {
  let html = upgradeLegacyUI(body);
  let title = attrs.title || 'Interactive view';
  if (attrs.widget) {
    const w = buildWidget(attrs.widget, attrs);
    if (w) { html = w.html; title = attrs.title || w.title; }
  }
  if (!closed || streaming) {
    return `<div class="card ui-card"><div class="card-head"><div class="title">${icon('layout', 'icon-sm')}<span>${esc(title)}</span></div></div><div class="building"><span>${icon('sparkles', 'icon-sm spin')} Building interface${html.length > 40 ? ` · ${(html.length / 1024).toFixed(1)} KB` : '…'}</span></div></div>`;
  }
  const id = 'u' + hash(ctx.msg.id + ':' + ctx.vi + ':' + index).toString(36);
  blocks.set(id, { type: 'ui', title, html });
  return uiCardHTML(id, title, 'layout');
}

function uiCardHTML(id, title, ic) {
  return `<div class="card ui-card" data-ui="${id}"><div class="card-head"><div class="title">${icon(ic, 'icon-sm')}<span>${esc(title)}</span></div><div class="tools">
<button class="icon-btn" data-action="ui-save" data-block="${id}" title="Save to My Widgets">${icon('bookmark', 'icon-sm')}</button>
<button class="icon-btn" data-action="ui-code" data-block="${id}" title="View code">${icon('code', 'icon-sm')}</button>
<button class="icon-btn" data-action="ui-download" data-block="${id}" title="Download HTML">${icon('download', 'icon-sm')}</button>
<button class="icon-btn" data-action="ui-reload" data-block="${id}" title="Reload">${icon('refresh', 'icon-sm')}</button>
<button class="icon-btn" data-action="ui-fullscreen" data-block="${id}" title="Full screen">${icon('maximize', 'icon-sm')}</button></div></div>
<iframe data-hydrate="ui" data-block="${id}" title="${esc(title)}" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-pointer-lock" allow="clipboard-write; autoplay"></iframe></div>`;
}

const WIDGET_FENCE = /```nova-widget[^\n]*\n([\s\S]*?)```/g;

// Find the previous widget in this chat that shares component ids, so a revised
// widget keeps the data the user already entered.
function previousWidgetKey(ctx, spec) {
  const ids = new Set(spec.components.map((c) => c.id).filter(Boolean));
  const msgs = ctx.chat.messages;
  for (let i = msgs.indexOf(ctx.msg) - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    const vi = m.active ?? 0;
    const found = [...(m.versions[vi]?.content || '').matchAll(WIDGET_FENCE)];
    for (let k = found.length - 1; k >= 0; k--) {
      let prev;
      try { prev = JSON.parse(found[k][1]); } catch { continue; }
      if ((prev.components || []).some((c) => c.id && ids.has(c.id))) return 'w' + hash(m.id + ':' + vi + ':' + k).toString(36);
    }
  }
  return null;
}

function widgetBlock(ctx, body, { closed, index, streaming }) {
  if (!closed || streaming) {
    return `<div class="card ui-card"><div class="card-head"><div class="title">${icon('grid', 'icon-sm')}<span>Widget</span></div></div><div class="building"><span>${icon('sparkles', 'icon-sm spin')} Designing widget…</span></div></div>`;
  }
  let raw;
  try { raw = JSON.parse(body); } catch { return null; }
  const spec = normalizeSpec(raw);
  if (!spec) return null;
  const id = 'w' + hash(ctx.msg.id + ':' + ctx.vi + ':' + index).toString(36);
  blocks.set(id, { type: 'ui', kind: 'widget', title: spec.title, spec, html: specToHTML(spec), inherit: spec.inherit || previousWidgetKey(ctx, spec) });
  return uiCardHTML(id, spec.title, 'grid');
}

const CHART_COLORS = ['#5b84ff', '#a77bff', '#3b6bff', '#c084fc', '#22d3ee', '#f472b6', '#4ade9b', '#ffc861'];

export function chartSVG(spec) {
  const type = (spec.type || 'bar').toLowerCase();
  const labels = (spec.labels || []).map(String);
  const sets = (spec.datasets || []).filter((d) => Array.isArray(d.data));
  if (!sets.length) return '';
  const W = 640, H = 300, P = { l: 48, r: 14, t: 14, b: 34 };
  let svg = '';
  if (type === 'pie' || type === 'doughnut') {
    const data = sets[0].data.map((x) => Math.max(0, +x || 0));
    const tot = data.reduce((a, b) => a + b, 0) || 1;
    let a = -Math.PI / 2;
    const cx = W / 2, cy = H / 2, r = 120, ir = type === 'doughnut' ? 64 : 0;
    data.forEach((v, i) => {
      const b = a + (v / tot) * Math.PI * 2 - 1e-6;
      const large = b - a > Math.PI ? 1 : 0;
      const p = (ang, rad) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      const d = ir ? `M${p(a, r)} A${r} ${r} 0 ${large} 1 ${p(b, r)} L${p(b, ir)} A${ir} ${ir} 0 ${large} 0 ${p(a, ir)} Z` : `M${cx} ${cy} L${p(a, r)} A${r} ${r} 0 ${large} 1 ${p(b, r)} Z`;
      svg += `<path d="${d}" fill="${CHART_COLORS[i % CHART_COLORS.length]}" stroke="var(--bg-2)" stroke-width="2"><title>${esc(labels[i] ?? '')}: ${v} (${Math.round((v / tot) * 100)}%)</title></path>`;
      a = b;
    });
    const legend = labels.map((l, i) => `<span><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${esc(l)} · ${data[i]}</span>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title || 'Chart')}">${svg}</svg></div><div class="chart-legend">${legend}`;
  }
  const all = sets.flatMap((d) => d.data.map((x) => +x || 0));
  const max = Math.max(...all, 0), min = Math.min(...all, 0);
  const span = max - min || 1;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const y = (v) => P.t + ih - ((v - min) / span) * ih;
  for (let g = 0; g <= 4; g++) {
    const v = min + (span * g) / 4;
    svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--border)"/><text x="${P.l - 6}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="var(--text-3)">${+v.toPrecision(3)}</text>`;
  }
  const n = labels.length || Math.max(...sets.map((d) => d.data.length));
  const step = iw / Math.max(1, n);
  if (type === 'line' || type === 'area') {
    sets.forEach((d, si) => {
      const c = CHART_COLORS[si % CHART_COLORS.length];
      const pts = d.data.map((v, i) => [P.l + step * i + step / 2, y(+v || 0)]);
      svg += `<path d="M${pts.map((p) => p.map((x) => x.toFixed(1)).join(' ')).join(' L')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
      svg += pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${c}"><title>${esc(labels[i] ?? '')} · ${esc(d.label || '')}: ${d.data[i]}</title></circle>`).join('');
    });
  } else {
    const bw = (step * 0.72) / sets.length;
    sets.forEach((d, si) => {
      const c = CHART_COLORS[si % CHART_COLORS.length];
      d.data.forEach((v, i) => {
        const x = P.l + step * i + step * 0.14 + bw * si;
        const y0 = y(Math.max(0, min)), y1 = y(+v || 0);
        svg += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" rx="4" fill="${c}"><title>${esc(labels[i] ?? '')} · ${esc(d.label || '')}: ${v}</title></rect>`;
      });
    });
  }
  const every = Math.ceil(n / 12);
  labels.forEach((l, i) => { if (i % every === 0) svg += `<text x="${(P.l + step * i + step / 2).toFixed(1)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--text-3)">${esc(truncate(l, 12))}</text>`; });
  const legend = sets.length > 1 || sets[0].label ? sets.map((d, i) => `<span><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${esc(d.label || `Series ${i + 1}`)}</span>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title || 'Chart')}">${svg}</svg></div>${legend ? `<div class="chart-legend">${legend}` : '<div>'}`;
}

function chartBlock(ctx, body, { closed }) {
  if (!closed) return `<div class="card chart-card"><div class="building" style="height:120px;display:grid;place-items:center;color:var(--text-3)">Drawing chart…</div></div>`;
  const spec = parseJSON(body);
  if (!spec) return null;
  return `<div class="card chart-card"><div class="card-head"><div class="title">${icon('chart', 'icon-sm')}<span>${esc(spec.title || 'Chart')}</span></div></div><div class="chart-body">${chartSVG(spec)}</div></div>`;
}

function quizBlock(ctx, body, { closed, index }) {
  if (!closed) return `<div class="card"><div class="building" style="height:140px;display:grid;place-items:center;color:var(--text-3)">${icon('book', 'icon-sm')} Preparing quiz…</div></div>`;
  const spec = parseJSON(body);
  if (!spec) return null;
  const id = 'q' + hash(ctx.msg.id + ':' + ctx.vi + ':' + index).toString(36);
  blocks.set(id, { type: 'quiz', spec });
  const hasQ = spec.questions?.length, hasC = spec.cards?.length;
  return `<div class="card quiz-card"><div class="card-head"><div class="title">${icon('book', 'icon-sm')}<span>${esc(spec.title || 'Quiz')}</span></div>${hasQ && hasC ? `<div class="tools"><button class="pill-btn" data-quiz-mode="quiz">Quiz</button><button class="pill-btn" data-quiz-mode="cards">Flashcards</button></div>` : ''}</div><div class="quiz" data-hydrate="quiz" data-block="${id}" data-mode="${hasQ ? 'quiz' : 'cards'}"></div></div>`;
}

export function hydrateQuiz(el, spec) {
  let mode = el.dataset.mode;
  let qi = 0, score = 0, answered = [];
  let ci = 0;
  const card = el.closest('.quiz-card');
  card?.querySelectorAll('[data-quiz-mode]').forEach((b) => {
    b.classList.toggle('temp-on', b.dataset.quizMode === mode);
    b.onclick = () => { mode = b.dataset.quizMode; card.querySelectorAll('[data-quiz-mode]').forEach((x) => x.classList.toggle('temp-on', x === b)); draw(); };
  });
  const draw = () => {
    if (mode === 'cards') {
      const cards = spec.cards || [];
      if (!cards.length) { el.innerHTML = '<p class="muted">No flashcards.</p>'; return; }
      const c = cards[ci];
      el.innerHTML = `<div class="flashcard"><div class="inner"><div class="face front"><div><b>${esc(c.front)}</b><div style="font-size:12px;color:var(--text-3);margin-top:8px">Tap to flip</div></div></div><div class="face back">${esc(c.back)}</div></div></div>
<div class="q-nav"><button class="btn sm" data-n="-1">${icon('chevronLeft', 'icon-sm')} Prev</button><span class="q-count">${ci + 1} / ${cards.length}</span><button class="btn sm" data-n="1">Next ${icon('chevronRight', 'icon-sm')}</button></div>`;
      el.querySelector('.flashcard').onclick = (e) => e.currentTarget.classList.toggle('flipped');
      el.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { ci = (ci + +b.dataset.n + cards.length) % cards.length; draw(); }));
      return;
    }
    const qs = spec.questions || [];
    if (qi >= qs.length) {
      const pct = Math.round((score / Math.max(1, qs.length)) * 100);
      el.innerHTML = `<div class="q-score"><div class="big grad-text">${score} / ${qs.length}</div><p>${pct >= 80 ? 'Excellent work! 🌟' : pct >= 50 ? 'Nice — keep practicing! 💪' : 'Good start — review and try again 📚'}</p><button class="btn primary sm" data-retry>Try again</button></div>`;
      el.querySelector('[data-retry]').onclick = () => { qi = 0; score = 0; answered = []; draw(); };
      return;
    }
    const q = qs[qi];
    const done = answered[qi] != null;
    el.innerHTML = `<div class="q-progress"><i style="width:${(qi / qs.length) * 100}%"></i></div><div class="q-count">Question ${qi + 1} of ${qs.length} · Score ${score}</div><div class="q-text">${esc(q.q)}</div>
<div class="q-choices">${(q.choices || []).map((c, k) => `<button class="q-choice${done ? (k === q.answer ? ' correct' : k === answered[qi] ? ' wrong' : '') : ''}" data-k="${k}"${done ? ' disabled' : ''}><span class="k">${'ABCDEFG'[k]}</span>${esc(c)}</button>`).join('')}</div>
${done && q.explain ? `<div class="q-explain">${esc(q.explain)}</div>` : ''}<div class="q-nav"><span></span>${done ? `<button class="btn primary sm" data-next>${qi + 1 < qs.length ? 'Next question' : 'See results'} ${icon('arrowRight', 'icon-sm')}</button>` : ''}</div>`;
    el.querySelectorAll('.q-choice').forEach((b) => (b.onclick = () => { if (answered[qi] != null) return; answered[qi] = +b.dataset.k; if (+b.dataset.k === q.answer) score++; draw(); }));
    el.querySelector('[data-next]')?.addEventListener('click', () => { qi++; draw(); });
  };
  draw();
}

function memoryBlock() {
  return `<div class="memory-chip">${icon('bookmark', 'icon-sm')} Memory updated</div>`;
}

function fenceRenderer(ctx) {
  return (lang, body, opts) => {
    switch (lang) {
      case 'nova-image': return imageBlock(ctx, body, opts);
      case 'nova-file': return fileBlock(ctx, body, opts);
      case 'nova-ui': return uiBlock(ctx, body, opts);
      case 'nova-widget': return widgetBlock(ctx, body, opts);
      case 'nova-chart': return chartBlock(ctx, body, opts);
      case 'nova-quiz': return quizBlock(ctx, body, opts);
      case 'nova-memory': return memoryBlock();
      case 'nova-followups': return '';
      default: return null;
    }
  };
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------
function attachmentHTML(a, msgId) {
  if (a.kind === 'image') return `<img class="att-img" src="${esc(a.dataUrl)}" alt="${esc(a.name)}" data-action="lightbox" data-src="${esc(a.dataUrl)}" loading="lazy">`;
  if (a.kind === 'video') {
    const src = a.objectUrl || a.dataUrl;
    return src ? `<video src="${esc(src)}" controls preload="metadata" ${a.frames?.[0] ? `poster="${esc(a.frames[0])}"` : ''}></video>`
      : (a.frames?.[0] ? `<img class="att-img" src="${esc(a.frames[0])}" alt="${esc(a.name)}" title="Video preview (original not stored)">` : '');
  }
  if (a.kind === 'audio') {
    const src = a.dataUrl || a.objectUrl;
    return `<div class="att-audio">${src ? `<audio src="${esc(src)}" controls preload="metadata"></audio>` : ''}<small>${icon('mic', 'icon-sm')} ${a.transcript ? '“' + esc(truncate(a.transcript, 160)) + '”' : esc(a.name)}</small></div>`;
  }
  return `<button class="att-file" data-action="att-preview" data-msg="${esc(msgId)}" data-att="${esc(a.id)}"><span class="file-ico">${icon('fileText', 'icon-sm')}</span><span><b>${esc(a.name)}</b><small>${esc(describeAttachment(a))}</small></span></button>`;
}

function userHTML(msg) {
  const t = msg.tool && TOOLS[msg.tool];
  return `${t ? `<div class="tool-tag">${icon(t.icon, 'icon-sm')} ${esc(t.label)}</div>` : ''}${msg.attachments?.length ? `<div class="attachments">${msg.attachments.map((a) => attachmentHTML(a, msg.id)).join('')}</div>` : ''}${msg.content ? `<div class="bubble">${esc(msg.content)}</div>` : ''}
<div class="user-actions"><button class="icon-btn" data-action="user-copy" title="Copy">${icon('copy', 'icon-sm')}</button><button class="icon-btn" data-action="user-edit" title="Edit message">${icon('pencil', 'icon-sm')}</button></div>`;
}

// ---------------------------------------------------------------------------
// Assistant message (slots)
// ---------------------------------------------------------------------------
const SLOTS = ['head', 'think', 'steps', 'notice', 'media', 'content', 'side', 'extra', 'actions'];

function sourceCard(s, i, compact) {
  const host = (() => { try { return new URL(s.url).hostname; } catch { return s.site || ''; } })();
  return `<a class="source-card" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-src-idx="${i + 1}"><span class="num">${i + 1}</span><span class="s-body"><span class="s-site"><img src="https://www.google.com/s2/favicons?domain=${esc(host)}&sz=32" alt="" loading="lazy" onerror="this.remove()">${esc(host)}</span><span class="s-title">${esc(s.title)}</span>${compact ? '' : `<span class="s-snip">${esc(s.snippet || '')}</span>`}</span>${s.thumb && !compact ? `<img class="s-thumb" src="${esc(s.thumb)}" alt="" loading="lazy">` : ''}</a>`;
}

function slotHTML(slot, ctx, streaming) {
  const { msg, version: v } = ctx;
  const model = getModel(v.model || msg.model);
  switch (slot) {
    case 'head':
      if (v.kind === 'aimode') return `<div class="aimode-head"><span class="badge">${icon('globe', 'icon-sm')} AI Mode</span>${v.sources?.length ? `<span>${v.sources.length} sources</span>` : ''}</div>`;
      if (v.kind === 'research' && v.research) {
        const done = v.research.progress >= 100;
        return `<div class="card research-card"><div class="r-head"><span class="ring">${icon('compass', 'icon-sm')}</span><div><b>Deep research</b><div class="r-meta">${esc(v.research.label || '')}</div></div></div>${done ? '' : `<div class="progress-bar"><i style="width:${v.research.progress}%"></i></div>`}</div>`;
      }
      return '';
    case 'think': {
      if (!v.thinking || !settings.showThinking) return '';
      const active = streaming && !v.content && !v.thinkMs;
      const secs = v.thinkMs ? Math.max(1, Math.round(v.thinkMs / 1000)) : null;
      const last = v.thinking.trim().split('\n').pop();
      const open = openThinking.has(msg.id + ':' + msg.active);
      return `<details class="thinking" data-think="${esc(msg.id + ':' + msg.active)}"${open ? ' open' : ''}><summary>${active ? `<span class="shimmer-text">Thinking${last ? ' · ' + esc(truncate(last.replace(/^[•*#\s]+/, ''), 70)) : '…'}</span>` : `<span>Thought for ${secs ?? '<1'}s</span>`}${icon('chevronRight', 'icon-sm chev')}</summary><div class="think-body">${esc(v.thinking.trim())}</div></details>`;
    }
    case 'steps': {
      if (!v.steps?.length) return '';
      const active = v.steps.some((s) => s.state === 'active') && streaming;
      const label = active ? `<span class="shimmer-text">${esc(v.steps.find((s) => s.state === 'active')?.text || 'Working…')}</span>` : `<span>${v.kind === 'research' ? 'Research activity' : 'Searched'} · ${v.steps.length} steps</span>`;
      return `<details class="thinking"${active ? ' open' : ''}><summary>${label}${icon('chevronRight', 'icon-sm chev')}</summary><ul class="steps">${v.steps.map((s) => `<li class="${s.state === 'active' && streaming ? 'active' : 'done'}">${esc(s.text)}</li>`).join('')}</ul></details>`;
    }
    case 'notice': {
      const n = v.notice;
      if (v.error) return `<div class="notice error">${icon('alert')}<div>${esc(v.error)}${!streaming ? ' <button class="btn sm" data-action="msg-regen">Try again</button>' : ''}</div></div>`;
      if (!n) return '';
      return `<div class="notice${n.type === 'error' ? ' error' : ''}">${icon(n.type === 'error' ? 'alert' : 'info')}<div>${esc(n.text)}</div></div>`;
    }
    case 'media': {
      if (v.kind !== 'aimode') return '';
      const imgs = v.images?.length ? `<div class="img-strip">${v.images.map((im) => `<a href="${esc(im.url)}" target="_blank" rel="noopener noreferrer" title="${esc(im.title)}"><img src="${esc(im.src)}" alt="${esc(im.title)}" loading="lazy"></a>`).join('')}</div>` : '';
      const srcs = v.sources?.length ? `<div class="sources-row">${v.sources.map((s, i) => sourceCard(s, i, true)).join('')}</div>` : '';
      return imgs + srcs;
    }
    case 'content': {
      if (!v.content && streaming && !v.thinking && !v.steps?.length) return '<div class="typing-dots"><i></i><i></i><i></i></div>';
      if (!v.content) return '';
      return renderMarkdown(v.content, { streaming, cursor: streaming, sources: v.sources, fence: fenceRenderer(ctx) });
    }
    case 'side':
      if (v.kind !== 'aimode' || !v.sources?.length) return '';
      return `<div class="sources-title">${icon('globe', 'icon-sm')} Sources</div>${v.sources.map((s, i) => sourceCard(s, i, false)).join('')}`;
    case 'extra': {
      if (streaming) return '';
      let h = '';
      if (v.paa?.length) h += `<div class="paa"><div class="paa-title">People also ask</div>${v.paa.map((p) => `<details><summary>${esc(p.q)}${icon('chevronDown', 'icon-sm chev')}</summary><div class="paa-body md">${renderMarkdown(p.a, { sources: v.sources })}</div></details>`).join('')}</div>`;
      if (v.kind !== 'aimode' && v.kind !== 'research' && v.sources?.length) h += `<div class="sources-row" style="margin-top:12px">${v.sources.map((s, i) => sourceCard(s, i, true)).join('')}</div>`;
      if (v.kind === 'research' && v.content) h += `<div class="file-card" style="margin-top:14px"><div class="file-ico">${icon('fileText', 'icon-sm')}</div><div class="info"><b>Export research report</b><small>Download as a formatted document</small></div><div class="actions"><button class="btn sm" data-action="export-msg" data-fmt="pdf">PDF</button><button class="btn sm" data-action="export-msg" data-fmt="docx">Word</button><button class="btn sm" data-action="export-msg" data-fmt="md">Markdown</button></div></div>`;
      if (v.followups?.length) h += `<div class="followups"><div class="label">${v.kind === 'aimode' ? 'Follow up' : 'Related'}</div>${v.followups.map((f) => `<button data-action="followup" data-text="${esc(f)}">${icon('arrowRight', 'icon-sm')}${esc(f)}</button>`).join('')}</div>`;
      return h;
    }
    case 'actions': {
      if (streaming) return '';
      const n = msg.versions.length;
      const fb = v.feedback;
      return `<div class="msg-actions">${n > 1 ? `<span class="version-nav"><button class="icon-btn" data-action="msg-prev" ${msg.active === 0 ? 'disabled' : ''} title="Previous response">${icon('chevronLeft', 'icon-sm')}</button>${msg.active + 1}/${n}<button class="icon-btn" data-action="msg-next" ${msg.active === n - 1 ? 'disabled' : ''} title="Next response">${icon('chevronRight', 'icon-sm')}</button></span>` : ''}
<button class="icon-btn" data-action="msg-copy" title="Copy">${icon('copy', 'icon-sm')}</button>
<button class="icon-btn${fb === 'up' ? ' on' : ''}" data-action="msg-like" title="Good response">${icon('thumbUp', 'icon-sm')}</button>
<button class="icon-btn${fb === 'down' ? ' on' : ''}" data-action="msg-dislike" title="Bad response">${icon('thumbDown', 'icon-sm')}</button>
<button class="icon-btn" data-action="msg-speak" title="Read aloud">${icon('volume', 'icon-sm')}</button>
<button class="icon-btn" data-action="msg-regen" title="Try again">${icon('refresh', 'icon-sm')}</button>
<button class="icon-btn" data-action="msg-more" title="More">${icon('more', 'icon-sm')}</button>
<span class="msg-meta">${esc(model.name)}${v.engine === 'claude' ? ' · Claude' : v.engine === 'local' ? ' · on-device' : ''}</span></div>`;
    }
  }
  return '';
}

export function updateAssistant(el, chat, msg, { streaming = false } = {}) {
  const vi = msg.active ?? 0;
  const version = msg.versions[vi];
  const ctx = { chat, msg, vi, version };
  el.classList.toggle('aimode', version.kind === 'aimode');
  el.querySelector('.av')?.classList.toggle('thinking', streaming);
  const body = el.querySelector('.body');
  el._cache = el._cache || {};
  for (const slot of SLOTS) {
    const html = slotHTML(slot, ctx, streaming);
    if (el._cache[slot] === html) continue;
    el._cache[slot] = html;
    const node = body.querySelector(`[data-slot="${slot}"]`);
    node.innerHTML = html;
    if (!streaming) hydrate(node, ctx);
  }
}

export function messageEl(chat, msg, { streaming = false } = {}) {
  const el = document.createElement('div');
  el.className = `msg ${msg.role}`;
  el.dataset.id = msg.id;
  if (msg.role === 'user') {
    el.innerHTML = userHTML(msg);
  } else {
    el.innerHTML = `<div class="av"><img src="assets/nova-logo.svg" alt=""></div><div class="body">${SLOTS.map((s) => `<div data-slot="${s}"${s === 'content' ? ' class="md"' : s === 'side' ? ' class="sources-side sources"' : ''}></div>`).join('')}</div>`;
    updateAssistant(el, chat, msg, { streaming });
  }
  return el;
}

/** Refresh generated-image blocks in place without reloading interactive frames. */
export function patchImages(el, chat, msg) {
  const vi = msg.active ?? 0;
  const ctx = { chat, msg, vi, version: msg.versions[vi] };
  const html = slotHTML('content', ctx, false);
  const node = el.querySelector('[data-slot="content"]');
  el._cache = el._cache || {};
  if (!node.querySelector('iframe')) {
    el._cache.content = html;
    node.innerHTML = html;
    hydrate(node, ctx);
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  node.querySelectorAll('.gen-image[data-art]').forEach((old) => {
    const fresh = tmp.querySelector(`.gen-image[data-art="${old.dataset.art}"]`);
    if (fresh) old.replaceWith(fresh);
  });
  el._cache.content = html;
  node.querySelectorAll('[data-hydrate="image"]').forEach((s) => { const b = blocks.get(s.dataset.block); if (b) ensureImage(chat, b); });
}

// ---------------------------------------------------------------------------
// Hydration (images, interfaces, quizzes)
// ---------------------------------------------------------------------------
function hydrate(root, ctx) {
  root.querySelectorAll('[data-hydrate="ui"]').forEach((frame) => {
    const id = frame.dataset.block;
    const b = blocks.get(id);
    if (!b) return;
    let state = widgetState(id);
    if (!state && b.inherit) { state = widgetState(b.inherit); if (state) setWidgetState(id, state); }
    mountFrame(frame, { html: b.html, id, stateKey: id, state });
  });
  root.querySelectorAll('[data-hydrate="quiz"]').forEach((el) => {
    const b = blocks.get(el.dataset.block);
    if (b) hydrateQuiz(el, b.spec);
  });
  root.querySelectorAll('[data-hydrate="image"]').forEach((el) => {
    const b = blocks.get(el.dataset.block);
    if (b) ensureImage(ctx.chat, b);
  });
}

/** Load an interface into a frame with its saved data, and register it for messages. */
export function mountFrame(frame, { html, id, stateKey, state = widgetState(stateKey) }) {
  frame.dataset.stateKey = stateKey;
  uiFrames.set(id, frame);
  frame.srcdoc = wrapUI(html, id, document.documentElement.dataset.theme || 'dark', state);
}

export function ensureImage(chat, b, { force = false, seedBump = 0 } = {}) {
  const msg = chat.messages.find((m) => m.id === b.msgId);
  if (!msg) return;
  const v = msg.versions[b.vi];
  const pk = `${b.msgId}:${b.vi}:${b.key}`;
  if (pendingArt.has(pk) || (!force && v.artifacts?.[b.key]?.src)) return;
  const p = generateImage({ prompt: b.spec.prompt, aspect: b.spec.aspect, seed: (b.spec.seed || 0) + seedBump })
    .then((res) => { v.artifacts = v.artifacts || {}; v.artifacts[b.key] = { ...res, prompt: b.spec.prompt, at: Date.now() }; })
    .catch((e) => { v.artifacts = v.artifacts || {}; v.artifacts[b.key] = { error: e.message || 'unknown error' }; })
    .finally(() => { pendingArt.delete(pk); emit('artifact', { chat, msg }); });
  pendingArt.set(pk, p);
}

export function isPending(msgId) {
  for (const k of pendingArt.keys()) if (k.startsWith(msgId + ':')) return true;
  return false;
}

// Track open/closed thinking panels across re-renders.
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d instanceof HTMLDetailsElement && d.dataset.think) {
    if (d.open) openThinking.add(d.dataset.think); else openThinking.delete(d.dataset.think);
  }
}, true);
