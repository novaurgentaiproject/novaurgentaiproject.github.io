// Canvas: a side-by-side code/document editor with live preview, a JS console
// and in-browser Python (Pyodide, loaded on demand).
import { esc, download, copyText, fileExt } from '../util.js';
import { icon } from '../icons.js';
import { highlight, normalizeLang, guessLang } from '../highlight.js';
import { renderMarkdown } from '../markdown.js';
import { toast } from '../ui.js';

const LANG_OPTS = [['html', 'HTML'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['css', 'CSS'], ['jsx', 'React (JSX)'], ['json', 'JSON'], ['markdown', 'Markdown'], ['svg', 'SVG'], ['sql', 'SQL'], ['bash', 'Shell'], ['java', 'Java'], ['cpp', 'C++'], ['c', 'C'], ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['ruby', 'Ruby'], ['php', 'PHP'], ['swift', 'Swift'], ['kotlin', 'Kotlin'], ['text', 'Plain text']];
const EXT = { html: 'html', javascript: 'js', typescript: 'ts', python: 'py', css: 'css', jsx: 'jsx', json: 'json', markdown: 'md', svg: 'svg', sql: 'sql', bash: 'sh', java: 'java', cpp: 'cpp', c: 'c', csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', swift: 'swift', kotlin: 'kt', text: 'txt' };

const CONSOLE_HOOK = `<script>(function(){function s(t,a){try{parent.postMessage({type:"nova-console",level:t,args:a.map(function(x){try{return typeof x==="object"&&x!==null?JSON.stringify(x,null,2):String(x)}catch(e){return String(x)}})},"*")}catch(e){}}
["log","info","warn","error","debug"].forEach(function(k){var o=console[k];console[k]=function(){s(k,[].slice.call(arguments));o&&o.apply(console,arguments)}});
addEventListener("error",function(e){s("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});addEventListener("unhandledrejection",function(e){s("error",["Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason)])});})();<\/script>`;

let state = null;
let pyodidePromise = null;

function canonical(lang) {
  const l = String(lang || '').toLowerCase();
  if (['html', 'htm', 'xml', 'markup', 'vue', 'svelte'].includes(l)) return 'html';
  if (['js', 'javascript', 'mjs', 'node'].includes(l)) return 'javascript';
  if (['ts', 'typescript', 'tsx'].includes(l)) return 'typescript';
  if (['py', 'python', 'python3'].includes(l)) return 'python';
  if (['md', 'markdown'].includes(l)) return 'markdown';
  if (['sh', 'bash', 'shell', 'zsh', 'console'].includes(l)) return 'bash';
  if (['c++', 'cpp'].includes(l)) return 'cpp';
  if (['cs', 'c#', 'csharp'].includes(l)) return 'csharp';
  if (['rs', 'rust'].includes(l)) return 'rust';
  if (['rb', 'ruby'].includes(l)) return 'ruby';
  if (['kt', 'kotlin'].includes(l)) return 'kotlin';
  return LANG_OPTS.some(([k]) => k === l) ? l : (l ? 'text' : 'text');
}

export function isCanvasOpen() { return !!state; }

export function openCanvas({ code = '', lang = '', title = 'Untitled', onAsk, autoRun = false } = {}) {
  const panel = document.getElementById('canvas');
  const app = document.getElementById('app');
  lang = canonical(lang || guessLang(code) || 'text');
  state = { code, lang, title, onAsk, tab: 'code' };
  panel.hidden = false;
  app.classList.add('canvas-open');
  panel.innerHTML = `
<div class="canvas-head">
  <div class="c-title">${icon('code', 'icon-sm')}<input value="${esc(title)}" aria-label="Canvas title"></div>
  <select aria-label="Language">${LANG_OPTS.map(([k, v]) => `<option value="${k}"${k === lang ? ' selected' : ''}>${v}</option>`).join('')}</select>
  <button class="btn primary sm" data-c="run" title="Run (Ctrl+Enter)">${icon('play', 'icon-sm')} Run</button>
  <button class="icon-btn" data-c="copy" title="Copy">${icon('copy', 'icon-sm')}</button>
  <button class="icon-btn" data-c="download" title="Download">${icon('download', 'icon-sm')}</button>
  <button class="icon-btn" data-c="close" title="Close canvas">${icon('x')}</button>
</div>
<div class="canvas-tabs"><button class="tab active" data-tab="code">Code</button><button class="tab" data-tab="preview">Preview</button><button class="tab" data-tab="console">Console</button><span class="spacer"></span><span class="c-status small" style="font-size:12px;color:var(--text-3)"></span></div>
<div class="canvas-body">
  <div class="editor"><div class="gutter"></div><div class="ed-wrap"><pre aria-hidden="true"><code></code></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code editor"></textarea></div></div>
  <iframe class="preview-frame" hidden sandbox="allow-scripts allow-modals allow-forms allow-pointer-lock allow-downloads" title="Preview"></iframe>
  <div class="console" hidden></div>
</div>
<div class="canvas-actions"><span style="font-size:12.5px;color:var(--text-3);align-self:center;margin-right:4px">Ask Nova:</span>
  ${['Add comments', 'Fix bugs', 'Explain this code', 'Improve performance', 'Add tests', 'Make it more beautiful'].map((a) => `<button class="btn sm" data-ask="${a}">${a}</button>`).join('')}
</div>`;
  const ta = panel.querySelector('textarea');
  const pre = panel.querySelector('pre code');
  const gutter = panel.querySelector('.gutter');
  const wrap = panel.querySelector('.ed-wrap');
  ta.value = code;
  const paint = () => {
    state.code = ta.value;
    pre.innerHTML = highlight(ta.value + '\n', state.lang === 'svg' ? 'html' : state.lang);
    const n = ta.value.split('\n').length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
    ta.style.height = '0px';
    ta.style.width = '0px';
    ta.style.height = Math.max(wrap.clientHeight, ta.scrollHeight) + 'px';
    ta.style.width = Math.max(wrap.clientWidth, ta.scrollWidth) + 'px';
  };
  ta.addEventListener('input', paint);
  wrap.addEventListener('scroll', () => { gutter.scrollTop = wrap.scrollTop; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.setRangeText('  ', s, en, 'end');
      paint();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.key === 'Enter') {
      const s = ta.selectionStart;
      const line = ta.value.slice(0, s).split('\n').pop();
      const ind = /^\s*/.exec(line)[0] + (/[{[(:]\s*$/.test(line) ? '  ' : '');
      e.preventDefault();
      ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
      paint();
    }
  });
  panel.querySelector('select').onchange = (e) => { state.lang = e.target.value; paint(); };
  panel.querySelector('.c-title input').oninput = (e) => { state.title = e.target.value; };
  panel.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  panel.querySelector('[data-c="run"]').onclick = run;
  panel.querySelector('[data-c="copy"]').onclick = async () => { await copyText(ta.value); toast('Code copied'); };
  panel.querySelector('[data-c="download"]').onclick = () => {
    const base = (state.title || 'canvas').replace(/[^\w.-]+/g, '-');
    const name = fileExt(base) ? base : `${base}.${EXT[state.lang] || 'txt'}`;
    download(name, ta.value);
  };
  panel.querySelector('[data-c="close"]').onclick = closeCanvas;
  panel.querySelectorAll('[data-ask]').forEach((b) => (b.onclick = () => {
    const fence = state.lang === 'text' ? '' : state.lang;
    state.onAsk?.(`${b.dataset.ask}:\n\n\`\`\`${fence}\n${ta.value}\n\`\`\``);
  }));
  requestAnimationFrame(paint);
  if (autoRun) setTimeout(run, 50);
  return state;
}

export function closeCanvas() {
  const panel = document.getElementById('canvas');
  panel.hidden = true;
  panel.innerHTML = '';
  document.getElementById('app').classList.remove('canvas-open');
  state = null;
}

function setTab(tab) {
  const panel = document.getElementById('canvas');
  state.tab = tab;
  panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  panel.querySelector('.editor').hidden = tab !== 'code';
  panel.querySelector('.preview-frame').hidden = tab !== 'preview';
  panel.querySelector('.console').hidden = tab !== 'console';
}

function status(t) { const s = document.querySelector('#canvas .c-status'); if (s) s.textContent = t; }

export function consoleLine(level, text) {
  const c = document.querySelector('#canvas .console');
  if (!c) return;
  const d = document.createElement('div');
  d.className = `line ${level}`;
  d.textContent = text;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

window.addEventListener('message', (e) => {
  const frame = document.querySelector('#canvas .preview-frame');
  if (!frame || e.source !== frame.contentWindow || e.data?.type !== 'nova-console') return;
  consoleLine(e.data.level === 'log' || e.data.level === 'debug' ? '' : e.data.level, e.data.args.join(' '));
});

async function run() {
  if (!state) return;
  const panel = document.getElementById('canvas');
  const frame = panel.querySelector('.preview-frame');
  const con = panel.querySelector('.console');
  con.innerHTML = '';
  const code = state.code;
  const lang = state.lang;
  const t0 = performance.now();
  if (lang === 'html' || lang === 'svg') {
    let doc = code;
    if (lang === 'svg' && !/<html/i.test(doc)) doc = `<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body></html>`;
    doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head([^>]*)>/i, `<head$1>${CONSOLE_HOOK}`) : CONSOLE_HOOK + doc;
    frame.srcdoc = doc;
    setTab('preview');
    status('Rendered');
  } else if (lang === 'css') {
    frame.srcdoc = `<!doctype html><html><head><style>${code}</style></head><body><h1>Heading</h1><p>Paragraph text with a <a href="#">link</a>.</p><button>Button</button><div class="card box container">.card / .box / .container</div><ul><li>List item</li><li>List item</li></ul></body></html>`;
    setTab('preview');
    status('Applied to sample page');
  } else if (lang === 'markdown') {
    frame.srcdoc = `<!doctype html><html><head><style>body{font:16px/1.7 system-ui;max-width:760px;margin:30px auto;padding:0 20px;color:#11143a}pre{background:#0b1030;color:#e9ebff;padding:12px;border-radius:10px;overflow:auto}code{font-family:ui-monospace,monospace}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:6px 10px}blockquote{border-left:3px solid #8b5cf6;margin:0;padding:4px 14px;color:#555}.code-head{display:none}</style></head><body>${renderMarkdown(code)}</body></html>`;
    setTab('preview');
  } else if (lang === 'javascript' || lang === 'typescript' || lang === 'jsx') {
    if (lang === 'jsx' || (lang === 'typescript' && /:\s*(string|number|boolean|any)\b|interface\s|<\w+>/.test(code))) {
      consoleLine('warn', `${lang === 'jsx' ? 'JSX' : 'TypeScript type annotations'} can't run directly in the browser. Ask Nova to convert it to plain JavaScript or an HTML page to preview it.`);
      setTab('console');
      return;
    }
    if (/^\s*import\s.+from\s+['"](node:|fs|path|express|readline)/m.test(code) || /\brequire\(['"](fs|path|express|readline)/.test(code)) {
      consoleLine('warn', 'This looks like Node.js code (it uses Node-only modules), so it may not run in the browser sandbox.');
    }
    const isModule = /^\s*(import|export)\s/m.test(code) || /\bawait\b/.test(code);
    frame.srcdoc = `<!doctype html><html><head>${CONSOLE_HOOK}</head><body style="font-family:system-ui"><script${isModule ? ' type="module"' : ''}>${code.replace(/<\/script/gi, '<\\/script')}\n;console.info("✓ Finished")<\/script></body></html>`;
    setTab('console');
    consoleLine('sys', `Running JavaScript…`);
    status(`Ran at ${new Date().toLocaleTimeString()}`);
  } else if (lang === 'python') {
    setTab('console');
    await runPython(code);
    status(`Finished in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  } else {
    consoleLine('sys', `${LANG_OPTS.find(([k]) => k === lang)?.[1] || lang} can't run in the browser sandbox. You can copy or download it, or ask Nova to explain or convert it.`);
    setTab('console');
  }
}

async function runPython(code) {
  if (!pyodidePromise) {
    consoleLine('sys', 'Loading Python runtime (Pyodide, ~10 MB — first run only)…');
    pyodidePromise = import('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs')
      .then((m) => m.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' }))
      .catch((e) => { pyodidePromise = null; throw e; });
  }
  let py;
  try { py = await pyodidePromise; } catch (e) { consoleLine('error', 'Could not load Python: ' + e.message); return; }
  py.setStdout({ batched: (s) => consoleLine('', s) });
  py.setStderr({ batched: (s) => consoleLine('error', s) });
  if (/\binput\s*\(/.test(code)) {
    py.globals.set('input', (p = '') => window.prompt(String(p)) ?? '');
  }
  try {
    await py.loadPackagesFromImports(code, { messageCallback: (m) => consoleLine('sys', m) });
    const r = await py.runPythonAsync(code);
    if (r !== undefined && r !== null) consoleLine('info', String(r));
    consoleLine('sys', '✓ Finished');
  } catch (e) {
    consoleLine('error', String(e.message || e).split('\n').filter((l) => !/^\s*File "\/lib\/python/.test(l)).join('\n'));
  }
}

export function canvasState() { return state; }
export { normalizeLang };
