// Safe, streaming-friendly Markdown renderer (GFM subset).
// All raw HTML is escaped. Custom fenced blocks are delegated to opts.fence().
import { esc, hash } from './util.js';
import { highlight, normalizeLang, LANG_LABELS } from './highlight.js';
import { icon } from './icons.js';

export const codeRegistry = new Map();

const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})\s*([^`]*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function isBlank(l) { return /^\s*$/.test(l); }
function isBlockStart(l) {
  return FENCE_RE.test(l) || /^ {0,3}#{1,6}\s/.test(l) || /^ {0,3}>/.test(l) || /^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(l) || LIST_RE.test(l) || /^\s*\$\$/.test(l);
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    let m = FENCE_RE.exec(line);
    if (m) {
      const indent = m[1].length, fence = m[2], info = m[3].trim();
      const body = [];
      let closed = false;
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const cm = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(l);
        if (cm && cm[1][0] === fence[0] && cm[1].length >= fence.length) { closed = true; i++; break; }
        body.push(indent ? l.replace(new RegExp(`^ {0,${indent}}`), '') : l);
        i++;
      }
      blocks.push({ type: 'code', info, text: body.join('\n'), closed });
      continue;
    }

    if (/^\s*\$\$/.test(line)) {
      const body = [line.replace(/^\s*\$\$/, '')];
      let closed = false;
      if (/\$\$\s*$/.test(body[0]) && body[0].trim() !== '') { body[0] = body[0].replace(/\$\$\s*$/, ''); closed = true; i++; }
      else {
        i++;
        while (i < lines.length) {
          if (/\$\$\s*$/.test(lines[i])) { body.push(lines[i].replace(/\$\$\s*$/, '')); i++; closed = true; break; }
          body.push(lines[i]); i++;
        }
      }
      blocks.push({ type: 'math', text: body.join('\n').trim(), closed });
      continue;
    }

    m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) { blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); i++; continue; }

    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    if (/^ {0,3}>/.test(line)) {
      const q = [];
      while (i < lines.length && (/^ {0,3}>/.test(lines[i]) || (!isBlank(lines[i]) && q.length && !isBlockStart(lines[i])))) {
        q.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(q) });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(':'), r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ type: 'table', head, aligns, rows });
      continue;
    }

    m = LIST_RE.exec(line);
    if (m) {
      const res = parseList(lines, i);
      blocks.push(res.block);
      i = res.next;
      continue;
    }

    const para = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) {
      if (lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) break;
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'para', text: para.join('\n') });
  }
  return blocks;
}

function parseList(lines, i) {
  const first = LIST_RE.exec(lines[i]);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (!m || /\d/.test(m[2]) !== ordered || m[1].length > baseIndent + 1 || m[1].length < baseIndent) break;
    const contentIndent = m[1].length + m[2].length + Math.max(1, Math.min((m[3] || ' ').length, 4));
    const itemLines = [m[4]];
    i++;
    let sawBlank = false;
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        // A blank line ends the item unless indented content follows.
        const nxt = lines.slice(i + 1).find((x) => !isBlank(x));
        if (nxt === undefined) { i++; break; }
        const nInd = nxt.match(/^ */)[0].length;
        if (nInd > baseIndent || (LIST_RE.test(nxt) && nInd === baseIndent)) { itemLines.push(''); sawBlank = true; i++; continue; }
        break;
      }
      const ind = l.match(/^ */)[0].length;
      if (ind >= contentIndent) { itemLines.push(l.slice(contentIndent)); sawBlank = false; i++; continue; }
      if (ind > baseIndent) { itemLines.push(l.slice(Math.min(ind, contentIndent))); sawBlank = false; i++; continue; }
      if (LIST_RE.test(l)) break;
      if (!sawBlank && !isBlockStart(l)) { itemLines.push(l.trim()); i++; continue; }
      break;
    }
    let task = null;
    const tm = /^\[([ xX])\]\s+/.exec(itemLines[0]);
    if (tm) { task = tm[1] !== ' '; itemLines[0] = itemLines[0].slice(tm[0].length); }
    items.push({ children: parseBlocks(itemLines), task });
  }
  return { block: { type: 'list', ordered, start, items }, next: i };
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '', inCode = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '`') inCode = !inCode;
    if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (c === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

// ---------- TeX → readable unicode (lightweight) ----------
const TEX = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  infty: '∞', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ',
  omega: 'ω', Omega: 'Ω', phi: 'φ', Phi: 'Φ', rho: 'ρ', tau: 'τ', eta: 'η', kappa: 'κ', psi: 'ψ', chi: 'χ', nu: 'ν', xi: 'ξ', zeta: 'ζ',
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', iff: '⇔', implies: '⇒',
  sum: '∑', prod: '∏', int: '∫', oint: '∮', partial: '∂', nabla: '∇', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩',
  forall: '∀', exists: '∃', emptyset: '∅', circ: '°', degree: '°', ldots: '…', dots: '…', cdots: '⋯', angle: '∠', perp: '⊥', parallel: '∥',
  quad: '  ', qquad: '    ', neg: '¬', land: '∧', lor: '∨', propto: '∝', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ',
};
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', T: 'ᵀ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', i: 'ᵢ', n: 'ₙ', x: 'ₓ', a: 'ₐ', e: 'ₑ', k: 'ₖ' };
export function texToText(s) {
  let t = String(s);
  for (let k = 0; k < 4; k++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (a, n, d) => `${/^\w+$/.test(n) ? n : `(${n})`}⁄${/^\w+$/.test(d) ? d : `(${d})`}`);
  t = t.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textbf)\{([^{}]*)\}/g, '$1')
    .replace(/\\(left|right|displaystyle|limits|,|;|!|:)/g, (a, w) => (w === ',' || w === ';' || w === ':' ? ' ' : ''))
    .replace(/\\([A-Za-z]+)/g, (a, w) => TEX[w] ?? w)
    .replace(/\^\{([^{}]*)\}/g, (a, x) => ([...x].every((c) => SUP[c]) ? [...x].map((c) => SUP[c]).join('') : `^(${x})`))
    .replace(/\^([0-9a-zA-Z+-])/g, (a, c) => SUP[c] || `^${c}`)
    .replace(/_\{([^{}]*)\}/g, (a, x) => ([...x].every((c) => SUB[c]) ? [...x].map((c) => SUB[c]).join('') : `_${x}`))
    .replace(/_([0-9a-z])/g, (a, c) => SUB[c] || `_${c}`)
    .replace(/[{}]/g, '');
  return t;
}

// ---------- inline ----------
function safeUrl(url, img = false) {
  const u = String(url || '').trim();
  if (/^(https?:|mailto:|#)/i.test(u)) return u;
  if (img && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u)) return u;
  if (/^[\w./-]+$/.test(u) && !/^javascript/i.test(u)) return u;
  return null;
}

export function renderInline(text, ctx = {}) {
  const slots = [];
  const put = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(text);

  s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (a, ticks, code) => put(`<code>${esc(code.trim() === '' ? code : code.replace(/^ (.+) $/, '$1'))}</code>`));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (a, m) => put(`<span class="math">${esc(texToText(m))}</span>`));
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, (a, c) => put(esc(c)));
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (a, alt, url) => {
    const u = safeUrl(url, true);
    return u ? put(`<img class="md-img" src="${esc(u)}" alt="${esc(alt)}" loading="lazy" data-action="lightbox">`) : put(esc(alt));
  });
  s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (a, label, url, title) => {
    const u = safeUrl(url);
    if (!u) return put(esc(label));
    return put(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${renderInline(label, { ...ctx, noLinks: true })}</a>`);
  });
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (a, u) => put(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`));
  if (!ctx.noLinks) {
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g, (a, pre, u) => pre + put(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`));
  }
  if (ctx.sources?.length) {
    s = s.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (a, nums) => put(nums.split(/\s*,\s*/).map((n) => {
      const src = ctx.sources[+n - 1];
      if (!src) return '';
      return `<a class="cite" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" data-cite="${+n}" title="${esc(src.title)}">${+n}</a>`;
    }).join('')));
  }

  s = esc(s);
  s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/(^|[^\w*])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/==(?=\S)([^=]*?\S)==/g, '<mark>$1</mark>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>').replace(/\n/g, ctx.softBreaks === false ? ' ' : '<br>');
  s = s.replace(/\u0000(\d+)\u0000/g, (a, n) => slots[+n]);
  // nested placeholders (links containing code etc.)
  s = s.replace(/\u0000(\d+)\u0000/g, (a, n) => slots[+n]);
  return s;
}

// ---------- blocks → html ----------
function parseInfo(info) {
  const lang = (info.match(/^[^\s{]+/) || [''])[0];
  const attrs = {};
  info.replace(/(\w+)=("([^"]*)"|'([^']*)'|(\S+))/g, (a, k, v, d, s2, bare) => { attrs[k] = d ?? s2 ?? bare; return ''; });
  return { lang, attrs };
}

const RUNNABLE = new Set(['markup', 'js', 'css', 'python', 'svg']);

export function codeBlock(code, langRaw, { closed = true, title } = {}) {
  const lang = normalizeLang(langRaw);
  const id = 'c' + hash(code + '|' + langRaw).toString(36);
  codeRegistry.set(id, { code, lang: langRaw || lang });
  const label = title || LANG_LABELS[lang] || (langRaw || 'text');
  const runnable = closed && (RUNNABLE.has(lang) || /^svg$/i.test(langRaw));
  const lines = code.split('\n').length;
  return `<div class="code-block${lines > 28 && closed ? ' collapsible' : ''}" data-code="${id}">
<div class="code-head"><span class="lang">${esc(label)}</span><div class="tools">${
    runnable ? `<button data-action="run-code" data-code="${id}">${icon('play', 'icon-sm')}Run</button>` : ''
  }${closed ? `<button data-action="canvas-code" data-code="${id}">${icon('pencil', 'icon-sm')}Edit</button>` : ''}<button data-action="copy-code" data-code="${id}">${icon('copy', 'icon-sm')}<span>Copy</span></button></div></div>
<pre><code class="language-${esc(lang)}">${highlight(code, langRaw)}</code></pre></div>`;
}

function renderBlocks(blocks, opts, ctx) {
  let html = '';
  for (const b of blocks) {
    switch (b.type) {
      case 'para': html += `<p>${renderInline(b.text, opts)}</p>`; break;
      case 'heading': html += `<h${b.level}>${renderInline(b.text, opts)}</h${b.level}>`; break;
      case 'hr': html += '<hr>'; break;
      case 'quote': html += `<blockquote>${renderBlocks(b.children, opts, ctx)}</blockquote>`; break;
      case 'math': html += `<p><span class="math" style="display:block;padding:10px 14px;text-align:center">${esc(texToText(b.text))}</span></p>`; break;
      case 'table': {
        const al = (k) => (b.aligns[k] ? ` style="text-align:${b.aligns[k]}"` : '');
        html += `<div class="table-wrap"><table><thead><tr>${b.head.map((c, k) => `<th${al(k)}>${renderInline(c, opts)}</th>`).join('')}</tr></thead><tbody>${
          b.rows.map((r) => `<tr>${b.head.map((_, k) => `<td${al(k)}>${renderInline(r[k] ?? '', opts)}</td>`).join('')}</tr>`).join('')
        }</tbody></table></div>`;
        break;
      }
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        const startAttr = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
        html += `<${tag}${startAttr}>${b.items.map((it) => {
          const single = it.children.length === 1 && it.children[0].type === 'para';
          const inner = single ? renderInline(it.children[0].text, opts) : renderBlocks(it.children, opts, ctx);
          if (it.task !== null) return `<li class="task"><input type="checkbox" disabled${it.task ? ' checked' : ''}>${inner}</li>`;
          return `<li>${inner}</li>`;
        }).join('')}</${tag}>`;
        break;
      }
      case 'code': {
        const { lang, attrs } = parseInfo(b.info);
        const idx = (ctx.fenceCount[lang] = (ctx.fenceCount[lang] ?? -1) + 1);
        const custom = opts.fence?.(lang, b.text, { closed: b.closed, attrs, index: idx, streaming: opts.streaming });
        if (custom != null) html += custom;
        else html += codeBlock(b.text, lang, { closed: b.closed || !opts.streaming });
        break;
      }
    }
  }
  return html;
}

export function renderMarkdown(src, opts = {}) {
  const text = String(src || '').replace(/\r\n?/g, '\n');
  const blocks = parseBlocks(text.split('\n'));
  let html = renderBlocks(blocks, opts, { fenceCount: {} });
  if (opts.cursor) {
    const cur = '<span class="cursor"></span>';
    if (/<\/p>$/.test(html)) html = html.replace(/<\/p>$/, cur + '</p>');
    else if (/<\/li><\/(ul|ol)>$/.test(html)) html = html.replace(/<\/li>(<\/(?:ul|ol)>)$/, cur + '</li>$1');
    else if (!/<\/div>$/.test(html)) html += cur;
  }
  return html;
}
