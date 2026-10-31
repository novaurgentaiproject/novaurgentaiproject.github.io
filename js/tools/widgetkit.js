// Widget Studio runtime: turns a JSON widget spec into a live, self-saving widget.
// Specs come from Nova's on-device widget designer or from Claude (```nova-widget).
// The runtime runs inside the sandboxed widget frame; state persists through the
// frame bridge (window.nova.state / window.nova.save).

export const WIDGET_TYPES = [
  'number', 'slider', 'select', 'toggle', 'text', 'date', 'time',
  'output', 'stat', 'progress', 'counter', 'history', 'checklist', 'log', 'rating',
  'timer', 'stopwatch', 'countdown', 'clock', 'random', 'tally', 'chart', 'quiz', 'flashcards',
  'note', 'button', 'table',
];

export const WIDGET_ICONS = ['spark', 'drop', 'check', 'clock', 'chart', 'star', 'heart', 'coin', 'list', 'target', 'flame', 'cup', 'bolt', 'book', 'dice', 'calendar', 'calc', 'moon', 'leaf', 'trophy', 'note', 'globe'];

export const WIDGET_CSS = `
.nw{max-width:860px;margin:0 auto}
.nw-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.nw-head h1{font-size:19px;margin:0;line-height:1.2}.nw-head p{margin:2px 0 0;color:var(--muted);font-size:13px}
.nw-saved{margin-left:auto;font-size:11.5px;color:var(--muted);opacity:0;transition:opacity .3s}.nw-saved.on{opacity:1}
.nw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(max-width:520px){.nw-grid{grid-template-columns:1fr}}
.nw-c{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;min-width:0}
.nw-c.span2{grid-column:1/-1}
.nw-label{display:block;font-size:12.5px;color:var(--muted);margin-bottom:6px;font-weight:600;letter-spacing:.2px}
.nw-c input:not([type=range]):not([type=checkbox]),.nw-c select{width:100%}
.nw-num{display:flex;align-items:center;gap:6px}.nw-num span{color:var(--muted);font-size:14px}
.nw-val{display:block;font-size:24px;font-weight:700;letter-spacing:-.4px;line-height:1.2;word-break:break-word}
.nw-c.big{background:linear-gradient(135deg,rgba(59,107,255,.16),rgba(157,77,255,.18));border-color:rgba(157,108,255,.35)}
.nw-c.big .nw-val{font-size:36px;background:linear-gradient(90deg,#9db3ff,#cdb2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.nw-c small{color:var(--muted);font-size:12px}
.nw-slider-head{display:flex;justify-content:space-between;align-items:baseline}.nw-slider-head b{font-size:14px}
.nw-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}
.nw-switch input{appearance:none;-webkit-appearance:none;width:42px;height:24px;border-radius:99px;background:var(--card2);border:1px solid var(--border);position:relative;cursor:pointer;transition:background .2s;flex:none}
.nw-switch input::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.nw-switch input:checked{background:var(--grad);border-color:transparent}.nw-switch input:checked::after{transform:translateX(18px)}
.nw-bar{height:10px;border-radius:99px;background:var(--card2);overflow:hidden;margin-top:8px}.nw-bar i{display:block;height:100%;width:0;border-radius:99px;background:var(--grad);transition:width .4s ease}
.nw-counter{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.nw-ring{position:relative;width:132px;height:132px;flex:none}.nw-ring svg{transform:rotate(-90deg)}
.nw-ring circle{transition:stroke-dashoffset .5s ease}
.nw-ring-in{position:absolute;inset:0;display:grid;place-content:center;text-align:center}.nw-ring-in b{font-size:32px;line-height:1}.nw-ring-in small{display:block;margin-top:3px}
.nw-side{flex:1;min-width:180px}.nw-goal{font-size:14px;margin-bottom:10px}
.nw-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.nw-round{width:46px;height:46px;border-radius:50%;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:22px;cursor:pointer;display:grid;place-items:center;font-family:inherit;transition:transform .1s}
.nw-round:active{transform:scale(.92)}.nw-round.primary{background:var(--grad);color:#fff;border:0;box-shadow:0 6px 18px -8px #6d3df5}
.nw-link{background:none;border:0;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;padding:6px 0;text-decoration:underline;text-underline-offset:3px}
.nw-hist{display:flex;align-items:flex-end;gap:8px;height:110px;margin-top:6px}
.nw-hist div{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}
.nw-hist i{display:block;width:100%;max-width:38px;border-radius:8px 8px 4px 4px;background:var(--grad);min-height:3px;transition:height .4s}
.nw-hist i.today{box-shadow:0 0 0 2px var(--accent)}.nw-hist span{font-size:11px;color:var(--muted)}.nw-hist em{font-style:normal;font-size:11px}
.nw-items{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.nw-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;background:var(--card2);border:1px solid transparent}
.nw-item.done span{text-decoration:line-through;opacity:.55}.nw-item span{flex:1;min-width:0;word-break:break-word}
.nw-x{background:none;border:0;color:var(--muted);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:8px}.nw-x:hover{color:var(--bad);background:var(--card)}
.nw-add{display:flex;gap:8px;flex-wrap:wrap}.nw-add input{flex:1;min-width:110px}
.nw-entry{display:flex;gap:10px;align-items:baseline;padding:8px 2px;border-bottom:1px solid var(--border);font-size:14px}.nw-entry time{color:var(--muted);font-size:12px;flex:none;min-width:84px}.nw-entry span{flex:1;min-width:0;word-break:break-word}
.nw-totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.nw-totals div{background:var(--card2);border-radius:12px;padding:8px 10px}.nw-totals b{display:block;font-size:18px}.nw-totals small{font-size:11.5px}
.nw-rate{display:flex;gap:8px;flex-wrap:wrap}.nw-rate button{width:42px;height:42px;border:0;background:var(--card2);cursor:pointer;display:grid;place-items:center;border-radius:12px;transition:transform .12s}
.nw-rate button:active{transform:scale(.9)}.nw-rate button i{width:22px;height:22px;display:block;background:var(--border);clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.nw-rate.dots button i{clip-path:none;border-radius:50%;width:16px;height:16px}.nw-rate button.on i{background:linear-gradient(135deg,#7d9bff,#c18bff)}
.nw-week{display:flex;gap:6px;margin-top:10px}.nw-week div{flex:1;text-align:center;font-size:11px;color:var(--muted)}.nw-week b{display:block;height:26px;border-radius:8px;margin-bottom:4px;background:var(--card2)}
.nw-big{font-size:44px;font-weight:300;font-variant-numeric:tabular-nums;text-align:center;letter-spacing:-1px;margin:6px 0}
.nw-cd{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center}.nw-cd div{background:var(--card2);border-radius:12px;padding:10px 4px}.nw-cd b{display:block;font-size:26px;font-variant-numeric:tabular-nums}.nw-cd small{font-size:11px}
.nw-result{font-size:30px;font-weight:750;text-align:center;min-height:44px;margin:8px 0;background:linear-gradient(90deg,#9db3ff,#cdb2ff);-webkit-background-clip:text;background-clip:text;color:transparent;word-break:break-word}
.nw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.nw-center{justify-content:center}
.nw-opt{display:flex;align-items:center;gap:10px;margin:6px 0}.nw-opt span{width:34%;min-width:80px;font-size:14px;word-break:break-word}.nw-opt .nw-bar{flex:1;margin:0}.nw-opt b{width:62px;text-align:right;font-size:13px}
.nw-c table{margin-top:4px}.nw-c td input{width:100%}
.nw-note{line-height:1.6;white-space:pre-line}
.nw-q-c{display:grid;gap:8px;margin-top:10px}.nw-q-c button{text-align:left;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);font:inherit;cursor:pointer}
.nw-q-c button.ok{border-color:var(--good);background:rgba(74,222,155,.14)}.nw-q-c button.no{border-color:var(--bad);background:rgba(255,107,138,.14)}
.nw-card{perspective:900px;height:170px;cursor:pointer;margin:8px 0}.nw-card>div{position:relative;width:100%;height:100%;transition:transform .5s;transform-style:preserve-3d}.nw-card.flip>div{transform:rotateY(180deg)}
.nw-card .f{position:absolute;inset:0;backface-visibility:hidden;border-radius:14px;display:grid;place-items:center;padding:16px;text-align:center;background:var(--card2);border:1px solid var(--border)}.nw-card .b{transform:rotateY(180deg);background:linear-gradient(135deg,rgba(59,107,255,.2),rgba(157,77,255,.22))}
/* CSS-drawn icons */
.wi{position:relative;display:inline-block;width:42px;height:42px;border-radius:13px;flex:none;background:linear-gradient(135deg,#2347e8,#7c3aed 60%,#a855f7);box-shadow:0 8px 22px -10px #6d3df5}
.wi::before,.wi::after{content:"";position:absolute}
.wi-spark::before{inset:9px;background:#fff;clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}
.wi-drop::before{width:17px;height:17px;left:12.5px;top:14px;background:linear-gradient(135deg,#fff,#cfdcff);border-radius:50% 0 50% 50%;transform:rotate(-45deg)}
.wi-check::before{inset:10px;border-radius:50%;border:2.5px solid #fff}.wi-check::after{width:6px;height:11px;left:18px;top:13px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg)}
.wi-clock::before{inset:9px;border-radius:50%;border:2.5px solid #fff}.wi-clock::after{width:7px;height:9px;left:19.5px;top:13px;border-left:2.5px solid #fff;border-bottom:2.5px solid #fff}
.wi-chart::before{left:10px;right:10px;bottom:11px;top:12px;background:linear-gradient(#fff,#fff) 0 100%/5px 45% no-repeat,linear-gradient(#fff,#fff) 50% 100%/5px 100% no-repeat,linear-gradient(#fff,#fff) 100% 100%/5px 70% no-repeat}
.wi-star::before{inset:9px;background:#fff;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.wi-heart::before{inset:11px 10px 9px;background:#fff;clip-path:path("M11 20C3 14 0 10 0 6A5.5 5.5 0 0 1 11 3A5.5 5.5 0 0 1 22 6C22 10 19 14 11 20Z")}
.wi-coin::before{inset:9px;border-radius:50%;background:radial-gradient(circle,transparent 0 45%,#fff 47% 58%,transparent 60%),#fff3;border:2.5px solid #fff}.wi-coin::after{left:19.5px;top:14px;width:3px;height:14px;background:#fff;border-radius:2px}
.wi-list::before{left:11px;right:10px;top:12px;bottom:12px;background:radial-gradient(circle at 2px 2px,#fff 2px,transparent 2.5px) 0 0/100% 7px repeat-y,linear-gradient(#fff,#fff) 8px 1px/calc(100% - 8px) 2.5px no-repeat,linear-gradient(#fff,#fff) 8px 8px/calc(100% - 8px) 2.5px no-repeat,linear-gradient(#fff,#fff) 8px 15px/calc(100% - 8px) 2.5px no-repeat}
.wi-target::before{inset:8px;border-radius:50%;background:radial-gradient(circle,#fff 0 18%,transparent 20% 38%,#fff 40% 55%,transparent 57% 75%,#fff 77%)}
.wi-flame::before{width:16px;height:21px;left:13px;top:10px;background:linear-gradient(#fff,#ffd7f0);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;clip-path:polygon(50% 0,80% 30%,100% 60%,90% 90%,50% 100%,10% 90%,0 60%,25% 35%,40% 45%)}
.wi-cup::before{left:10px;top:13px;width:17px;height:16px;background:#fff;border-radius:2px 2px 7px 7px}.wi-cup::after{left:25px;top:16px;width:6px;height:7px;border:2.5px solid #fff;border-left:0;border-radius:0 6px 6px 0}
.wi-bolt::before{inset:8px 12px;background:#fff;clip-path:polygon(60% 0,0 58%,45% 58%,35% 100%,100% 38%,55% 38%)}
.wi-book::before{left:9px;right:9px;top:12px;bottom:11px;background:linear-gradient(90deg,#fff 0 46%,transparent 46% 54%,#fff 54%);border-radius:2px}
.wi-dice::before{inset:10px;border-radius:6px;background:radial-gradient(circle at 28% 28%,#5b2be0 2.5px,transparent 3px),radial-gradient(circle at 50% 50%,#5b2be0 2.5px,transparent 3px),radial-gradient(circle at 72% 72%,#5b2be0 2.5px,transparent 3px),#fff}
.wi-calendar::before{left:10px;right:10px;top:12px;bottom:10px;border-radius:4px;background:linear-gradient(#fff,#fff) 0 0/100% 5px no-repeat,radial-gradient(circle,#fff 1.6px,transparent 2px) 0 7px/7px 7px;border:2px solid #fff}
.wi-calc::before{left:12px;right:12px;top:9px;bottom:9px;border-radius:4px;border:2px solid #fff;background:linear-gradient(#fff,#fff) 3px 3px/calc(100% - 6px) 5px no-repeat,radial-gradient(circle,#fff 1.6px,transparent 2px) 1px 10px/6px 6px}
.wi-moon::before{inset:10px;border-radius:50%;box-shadow:inset -7px -3px 0 0 #fff;transform:rotate(-20deg)}
.wi-leaf::before{inset:11px;background:#fff;border-radius:0 100% 0 100%}.wi-leaf::after{left:13px;top:28px;width:16px;height:2px;background:#7c3aed;transform:rotate(-45deg);transform-origin:left}
.wi-trophy::before{left:13px;top:9px;width:16px;height:14px;background:#fff;border-radius:0 0 9px 9px}.wi-trophy::after{left:15px;top:23px;width:12px;height:9px;background:linear-gradient(#fff,#fff) 50% 0/3px 5px no-repeat,linear-gradient(#fff,#fff) 0 100%/100% 3px no-repeat}
.wi-note::before{left:11px;right:11px;top:9px;bottom:9px;border-radius:3px;background:#fff;clip-path:polygon(0 0,70% 0,100% 30%,100% 100%,0 100%)}.wi-note::after{left:15px;right:15px;top:20px;height:9px;background:linear-gradient(#7c3aed,#7c3aed) 0 0/100% 2px no-repeat,linear-gradient(#7c3aed,#7c3aed) 0 6px/70% 2px no-repeat}
.wi-globe::before{inset:9px;border-radius:50%;border:2.5px solid #fff;background:linear-gradient(#fff,#fff) 50% 50%/100% 2px no-repeat}.wi-globe::after{left:16px;top:9px;width:10px;height:24px;border:2px solid #fff;border-radius:50%}
`;

/* eslint-disable */
// Runs inside the widget frame. Must be fully self-contained (it is serialized).
export function NovaWidgetRuntime() {
  var spec = window.__NOVA_SPEC__ || {};
  var root = document.getElementById('nw');
  var N = window.nova || {};
  var saved = (N.state && N.state.w) || {};
  var S = { v: saved.v || {}, d: saved.d || {} };
  var savedEl;
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (N.save) N.save({ w: S });
      if (savedEl) { savedEl.classList.add('on'); setTimeout(function () { savedEl.classList.remove('on'); }, 1200); }
    }, 250);
  }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(x, d) { var n = parseFloat(x); return isFinite(n) ? n : (d || 0); }
  var vars = {};
  var outputs = [];
  var M = {
    min: Math.min, max: Math.max, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, pow: Math.pow,
    log: Math.log10, ln: Math.log, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan, PI: Math.PI, E: Math.E,
    round: function (x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; },
    clamp: function (x, a, b) { return Math.min(b, Math.max(a, x)); },
    now: function () { return Date.now(); },
    today: function () { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); },
    days: function (a, b) { return Math.round((b - a) / 864e5); },
    iff: function (c, a, b) { return c ? a : b; },
  };
  function compile(expr) {
    if (typeof expr === 'number') return function () { return expr; };
    try {
      var src = String(expr).replace(/\^/g, '**').replace(/\band\b/g, '&&').replace(/\bor\b/g, '||');
      var fn = new Function('v', 'M', 'with (M) { with (v) { return (' + src + '); } }');
      return function () { try { return fn(vars, M); } catch (e) { return NaN; } };
    } catch (e) { return function () { return NaN; }; }
  }
  function fmt(val, c) {
    c = c || {};
    var f = c.format || (typeof val === 'string' ? 'text' : 'number');
    if (f === 'text' || typeof val === 'string') return (c.prefix || '') + String(val == null ? '' : val) + (c.suffix || '');
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val !== 'number' || !isFinite(val)) return '—';
    var d = c.decimals != null ? c.decimals : f === 'int' ? 0 : Math.abs(val) >= 1000 ? 0 : 2;
    var s;
    if (f === 'currency') s = val.toLocaleString(undefined, { style: 'currency', currency: c.currency || spec.currency || 'USD', maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
    else if (f === 'percent') s = val.toLocaleString(undefined, { maximumFractionDigits: d }) + '%';
    else if (f === 'duration') { var m = Math.round(val); s = (m >= 60 ? Math.floor(m / 60) + 'h ' : '') + (m % 60) + 'm'; }
    else if (f === 'date') s = new Date(val).toLocaleDateString(undefined, { dateStyle: 'medium' });
    else if (f === 'time') { var mm = ((Math.round(val) % 1440) + 1440) % 1440; s = new Date(2000, 0, 1, Math.floor(mm / 60), mm % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    else s = val.toLocaleString(undefined, { maximumFractionDigits: d });
    return (c.prefix || '') + s + (c.suffix || '');
  }
  function refresh() { outputs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function lastDays(n) { var out = []; for (var i = n - 1; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); out.push(d); } return out; }
  function beep() { try { var a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.2, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + 1.2); o.start(); o.stop(a.currentTime + 1.2); } catch (e) {} }
  function ringSVG(size) {
    var r = size / 2 - 9, c = 2 * Math.PI * r;
    return { c: c, html: '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><defs><linearGradient id="nwg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b6bff"/><stop offset="1" stop-color="#b16cff"/></linearGradient></defs><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--card2)" stroke-width="11"/><circle class="arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="url(#nwg)" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '"/></svg>' };
  }
  function daily(id) { var o = S.d[id]; if (!o || Array.isArray(o) || typeof o !== 'object') o = S.d[id] = {}; return o; }
  function seriesFor(id, field) {
    var src = S.d[id];
    return lastDays(7).map(function (d) {
      var k = dayKey(d);
      if (Array.isArray(src)) return src.filter(function (e) { return dayKey(new Date(e.ts)) === k; }).reduce(function (s, e) { return s + (field ? num(e[field]) : 1); }, 0);
      return src && typeof src === 'object' ? num(src[k]) : 0;
    });
  }

  var R = {};
  function input(c, box, i, kind) {
    var id = c.id || ('in' + i);
    var v0 = S.v[id] != null ? S.v[id] : c.value != null ? c.value : kind === 'toggle' ? false : kind === 'text' ? '' : kind === 'date' ? '' : 0;
    var label = '<span class="nw-label">' + esc(c.label || id) + '</span>';
    var set = function (val) {
      S.v[id] = val;
      if (kind === 'toggle') vars[id] = val ? 1 : 0;
      else if (kind === 'date') vars[id] = val ? new Date(val + 'T00:00').getTime() : NaN;
      else if (kind === 'time') { var p = String(val).split(':'); vars[id] = num(p[0]) * 60 + num(p[1]); }
      else if (kind === 'text') vars[id] = String(val);
      else if (kind === 'select') vars[id] = isNaN(parseFloat(val)) ? val : parseFloat(val);
      else vars[id] = num(val);
    };
    set(v0);
    if (kind === 'slider') {
      box.innerHTML = '<div class="nw-slider-head">' + label + '<b></b></div><input type="range" min="' + num(c.min, 0) + '" max="' + num(c.max, 100) + '" step="' + (c.step || 1) + '" value="' + num(v0) + '">';
      var b = box.querySelector('b');
      var show = function () { b.textContent = fmt(vars[id], c); };
      show();
      box.querySelector('input').oninput = function (e) { set(e.target.value); show(); save(); refresh(); };
    } else if (kind === 'select') {
      var opts = (c.options || []).map(function (o) { return typeof o === 'object' ? o : { label: String(o), value: o }; });
      box.innerHTML = label + '<select>' + opts.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v0) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
      if (S.v[id] == null && opts[0]) set(opts[0].value);
      box.querySelector('select').onchange = function (e) { set(e.target.value); save(); refresh(); };
    } else if (kind === 'toggle') {
      box.innerHTML = '<label class="nw-switch"><span>' + esc(c.label || id) + '</span><input type="checkbox"' + (v0 ? ' checked' : '') + '></label>';
      box.querySelector('input').onchange = function (e) { set(e.target.checked); save(); refresh(); };
    } else {
      var type = kind === 'number' ? 'number' : kind;
      box.innerHTML = label + '<div class="nw-num">' + (c.prefix ? '<span>' + esc(c.prefix) + '</span>' : '') + '<input type="' + type + '" value="' + esc(v0) + '"' + (kind === 'number' ? ' step="' + (c.step || 'any') + '" inputmode="decimal"' : '') + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>' + (c.suffix ? '<span>' + esc(c.suffix) + '</span>' : '') + '</div>';
      box.querySelector('input').oninput = function (e) { set(e.target.value); save(); refresh(); };
    }
  }
  ['number', 'slider', 'select', 'toggle', 'text', 'date', 'time'].forEach(function (k) { R[k] = function (c, box, i) { input(c, box, i, k); }; });

  R.output = R.stat = function (c, box) {
    if (c.big) box.classList.add('big');
    box.innerHTML = '<span class="nw-label">' + esc(c.label || '') + '</span><b class="nw-val"></b>' + (c.note ? '<small>' + esc(c.note) + '</small>' : '');
    var b = box.querySelector('b');
    if (c.formula == null && typeof c.value === 'string') { b.textContent = c.value; return; }
    var f = compile(c.formula != null ? c.formula : c.value != null ? c.value : 0);
    outputs.push(function () { b.textContent = fmt(f(), c); });
  };

  R.progress = function (c, box) {
    var fv = compile(c.value != null ? c.value : c.of || 0), fg = compile(c.goal != null ? c.goal : 100);
    box.innerHTML = '<div class="nw-slider-head"><span class="nw-label">' + esc(c.label || 'Progress') + '</span><b></b></div><div class="nw-bar"><i></i></div>';
    var b = box.querySelector('b'), bar = box.querySelector('.nw-bar i');
    outputs.push(function () {
      var v = num(fv()), g = num(fg(), 1) || 1, p = Math.max(0, Math.min(100, v / g * 100));
      bar.style.width = p + '%';
      b.textContent = fmt(v, c) + ' / ' + fmt(g, c) + ' · ' + Math.round(p) + '%';
    });
  };

  R.counter = function (c, box, i) {
    var id = c.id || ('count' + i), step = num(c.step, 1), isDaily = !!c.daily, goal = c.goal != null ? num(c.goal) : null;
    var get = function () { return isDaily ? num(daily(id)[dayKey()]) : num(S.v[id] != null ? S.v[id] : c.value); };
    vars[id] = get();
    var ring = ringSVG(132);
    var quick = (c.quick || []).filter(function (q) { return q !== step; }).slice(0, 4);
    box.innerHTML = '<div class="nw-counter"><div class="nw-ring">' + ring.html + '<div class="nw-ring-in"><b></b><small>' + esc(c.unit || '') + '</small></div></div><div class="nw-side"><span class="nw-label">' + esc(c.label || id) + '</span><div class="nw-goal"></div><div class="nw-btns"><button class="nw-round" data-d="' + (-step) + '" aria-label="Decrease">−</button><button class="nw-round primary" data-d="' + step + '" aria-label="Increase">+</button>' + quick.map(function (q) { return '<button class="chip" data-d="' + q + '">+' + q + '</button>'; }).join('') + '</div><button class="nw-link" data-reset>Reset' + (isDaily ? ' today' : '') + '</button></div></div>';
    var b = box.querySelector('.nw-ring-in b'), arc = box.querySelector('.arc'), g = box.querySelector('.nw-goal');
    var draw = function () {
      var v = get();
      b.textContent = v.toLocaleString();
      var p = goal ? Math.min(1, v / goal) : (v ? 1 : 0);
      arc.style.strokeDashoffset = ring.c * (1 - p);
      if (goal) {
        var over = c.limit && v > goal;
        g.innerHTML = over ? '<b style="color:var(--bad)">Over your limit of ' + goal + '</b>' : v >= goal ? '<b style="color:var(--good)">' + (c.limit ? 'At your limit' : 'Goal reached!') + '</b>' : esc((goal - v).toLocaleString() + ' ' + (c.unit || '') + ' to go · ' + (c.limit ? 'limit ' : 'goal ') + goal.toLocaleString());
      } else g.textContent = isDaily ? 'Today' : '';
    };
    var set = function (x) {
      x = Math.max(c.min != null ? num(c.min) : 0, c.max != null ? Math.min(num(c.max), x) : x);
      x = Math.round(x * 1000) / 1000;
      if (isDaily) daily(id)[dayKey()] = x; else S.v[id] = x;
      vars[id] = x; save(); draw(); refresh();
    };
    box.querySelectorAll('[data-d]').forEach(function (btn) { btn.onclick = function () { set(get() + num(btn.dataset.d)); }; });
    box.querySelector('[data-reset]').onclick = function () { set(0); };
    draw();
  };

  R.history = function (c, box) {
    box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Last 7 days') + '</span><div class="nw-hist"></div>';
    var el = box.querySelector('.nw-hist');
    outputs.push(function () {
      var days = lastDays(7), vals = seriesFor(c.of, c.field), max = Math.max.apply(null, vals.concat([c.goal ? num(c.goal) : 0, 1]));
      el.innerHTML = days.map(function (d, k) { return '<div><em>' + (vals[k] ? (Math.round(vals[k] * 10) / 10).toLocaleString() : '') + '</em><i class="' + (k === 6 ? 'today' : '') + '" style="height:' + Math.max(3, vals[k] / max * 78) + 'px"></i><span>' + d.toLocaleDateString(undefined, { weekday: 'short' }) + '</span></div>'; }).join('');
    });
  };

  R.checklist = function (c, box, i) {
    var id = c.id || ('list' + i);
    if (!Array.isArray(S.d[id])) S.d[id] = (c.items || []).map(function (t) { return { t: String(t), d: false }; });
    if ((spec.rev || 0) > (S.d[id + ':rev'] || 0)) {
      (c.items || []).forEach(function (t) { if (!S.d[id].some(function (x) { return x.t === String(t); })) S.d[id].push({ t: String(t), d: false }); });
      S.d[id + ':rev'] = spec.rev;
    }
    if (c.daily && S.d[id + ':day'] !== dayKey()) { S.d[id].forEach(function (x) { x.d = false; }); S.d[id + ':day'] = dayKey(); }
    box.innerHTML = '<div class="nw-slider-head"><span class="nw-label">' + esc(c.label || 'Checklist') + '</span><b class="cnt"></b></div><div class="nw-bar"><i></i></div><div class="nw-items"></div>' + (c.editable === false ? '' : '<form class="nw-add"><input placeholder="' + esc(c.placeholder || 'Add an item…') + '"><button class="btn sm">Add</button></form>');
    var list = box.querySelector('.nw-items');
    var draw = function () {
      var items = S.d[id];
      list.innerHTML = '';
      items.forEach(function (x, k) {
        var row = document.createElement('label');
        row.className = 'nw-item' + (x.d ? ' done' : '');
        row.innerHTML = '<input type="checkbox"' + (x.d ? ' checked' : '') + '><span></span>' + (c.editable === false ? '' : '<button class="nw-x" title="Remove" aria-label="Remove">×</button>');
        row.querySelector('span').textContent = x.t;
        row.querySelector('input').onchange = function () { x.d = !x.d; save(); draw(); refresh(); };
        var del = row.querySelector('.nw-x');
        if (del) del.onclick = function (e) { e.preventDefault(); items.splice(k, 1); save(); draw(); refresh(); };
        list.appendChild(row);
      });
      var done = items.filter(function (x) { return x.d; }).length;
      vars[id + '_done'] = done; vars[id + '_count'] = items.length;
      box.querySelector('.cnt').textContent = done + ' / ' + items.length;
      box.querySelector('.nw-bar i').style.width = (items.length ? done / items.length * 100 : 0) + '%';
    };
    var form = box.querySelector('form');
    if (form) form.onsubmit = function (e) { e.preventDefault(); var inp = form.querySelector('input'); var t = inp.value.trim(); if (!t) return; S.d[id].push({ t: t, d: false }); inp.value = ''; save(); draw(); refresh(); };
    draw();
  };

  R.log = function (c, box, i) {
    var id = c.id || ('log' + i);
    if (!Array.isArray(S.d[id])) S.d[id] = [];
    var fields = (c.fields && c.fields.length ? c.fields : [{ id: 'note', type: 'text', label: 'Note' }]).slice(0, 4);
    var sumF = c.sum || (fields.find(function (f) { return f.type === 'number'; }) || {}).id;
    box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Log') + '</span>' + (sumF ? '<div class="nw-totals"><div><b class="t-today"></b><small>Today</small></div><div><b class="t-week"></b><small>Last 7 days</small></div><div><b class="t-all"></b><small>' + (c.period === 'month' ? 'This month' : 'All time') + '</small></div></div>' : '') +
      (c.goal && sumF ? '<div class="nw-bar"><i></i></div><small class="goal"></small>' : '') +
      '<form class="nw-add" style="margin-top:10px">' + fields.map(function (f) { return '<input data-f="' + esc(f.id) + '" type="' + (f.type === 'number' ? 'number' : 'text') + '"' + (f.type === 'number' ? ' step="any" inputmode="decimal"' : '') + ' placeholder="' + esc(f.label || f.id) + '"' + (f.type === 'number' ? ' style="max-width:130px"' : '') + '>'; }).join('') + '<button class="btn sm">Add</button></form><div class="entries" style="margin-top:6px;max-height:260px;overflow:auto"></div>';
    var ents = box.querySelector('.entries');
    var unitFmt = { format: c.format || 'number', currency: c.currency, prefix: c.prefix, suffix: c.suffix, decimals: c.decimals };
    var draw = function () {
      var list = S.d[id];
      var today = dayKey(), wk = Date.now() - 7 * 864e5, now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      var sum = function (arr) { return arr.reduce(function (s, e) { return s + num(e[sumF]); }, 0); };
      vars[id + '_count'] = list.length;
      var lastNum = null;
      for (var k = list.length - 1; k >= 0 && lastNum == null; k--) { for (var f in list[k]) if (f !== 'ts' && typeof list[k][f] === 'number') { lastNum = list[k][f]; break; } }
      vars[id + '_last'] = lastNum == null ? NaN : lastNum;
      if (sumF) {
        var t = sum(list.filter(function (e) { return dayKey(new Date(e.ts)) === today; })), w = sum(list.filter(function (e) { return e.ts >= wk; })), mo = sum(list.filter(function (e) { return e.ts >= monthStart; })), a = sum(list);
        vars[id + '_today'] = t; vars[id + '_week'] = w; vars[id + '_month'] = mo; vars[id + '_total'] = a;
        box.querySelector('.t-today').textContent = fmt(t, unitFmt);
        box.querySelector('.t-week').textContent = fmt(w, unitFmt);
        box.querySelector('.t-all').textContent = fmt(c.period === 'month' ? mo : a, unitFmt);
        if (c.goal) {
          var period = c.period === 'week' ? w : c.period === 'month' ? mo : c.period === 'all' ? a : t;
          box.querySelector('.nw-bar i').style.width = Math.min(100, period / num(c.goal, 1) * 100) + '%';
          box.querySelector('.goal').textContent = fmt(period, unitFmt) + ' of ' + fmt(num(c.goal), unitFmt) + ' ' + (c.limit ? 'limit' : 'goal') + (c.period === 'week' ? ' this week' : c.period === 'month' ? ' this month' : c.period === 'all' ? '' : ' today');
        }
      }
      ents.innerHTML = list.length ? '' : '<small>No entries yet.</small>';
      list.slice().reverse().slice(0, 60).forEach(function (e) {
        var row = document.createElement('div');
        row.className = 'nw-entry';
        var d = new Date(e.ts);
        row.innerHTML = '<time>' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</time><span></span><button class="nw-x" aria-label="Delete">×</button>';
        row.querySelector('span').textContent = fields.map(function (f) { var v = e[f.id]; if (v === '' || v == null) return ''; return f.id === sumF ? fmt(num(v), unitFmt) : String(v); }).filter(Boolean).join(' · ');
        row.querySelector('.nw-x').onclick = function () { var k = list.indexOf(e); if (k >= 0) list.splice(k, 1); save(); draw(); refresh(); };
        ents.appendChild(row);
      });
    };
    box.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var entry = { ts: Date.now() }, any = false;
      box.querySelectorAll('[data-f]').forEach(function (inp) { var f = fields.find(function (x) { return x.id === inp.dataset.f; }); var v = inp.value.trim(); if (v) any = true; entry[inp.dataset.f] = f && f.type === 'number' ? num(v) : v; inp.value = ''; });
      if (!any) return;
      S.d[id].push(entry);
      if (S.d[id].length > 2000) S.d[id].shift();
      save(); draw(); refresh();
    };
    draw();
  };

  R.rating = function (c, box, i) {
    var id = c.id || ('rate' + i), max = Math.min(10, num(c.max, 5)), labels = c.labels || [];
    var store = c.daily === false ? null : daily(id);
    var get = function () { return store ? num(store[dayKey()]) : num(S.v[id]); };
    box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Rating') + '</span><div class="nw-rate' + (c.shape === 'dot' ? ' dots' : '') + '"></div><div class="cap" style="margin-top:8px;font-size:14px"></div>' + (store ? '<div class="nw-week"></div>' : '');
    var rate = box.querySelector('.nw-rate');
    for (var k = 1; k <= max; k++) { var bt = document.createElement('button'); bt.dataset.n = k; bt.setAttribute('aria-label', 'Rate ' + k); bt.innerHTML = '<i></i>'; rate.appendChild(bt); }
    var draw = function () {
      var v = get();
      vars[id] = v;
      rate.querySelectorAll('button').forEach(function (bt) { bt.classList.toggle('on', +bt.dataset.n <= v); });
      box.querySelector('.cap').textContent = v ? (labels[v - 1] || (v + ' / ' + max)) : 'Tap to rate' + (store ? ' today' : '');
      if (store) box.querySelector('.nw-week').innerHTML = lastDays(7).map(function (d) { var x = num(store[dayKey(d)]); return '<div><b style="background:' + (x ? 'linear-gradient(135deg,rgba(91,132,255,' + (0.25 + x / max * 0.75) + '),rgba(177,108,255,' + (0.25 + x / max * 0.75) + '))' : 'var(--card2)') + '"></b>' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</div>'; }).join('');
    };
    rate.onclick = function (e) { var bt = e.target.closest('button'); if (!bt) return; var n = +bt.dataset.n; if (n === get()) n = 0; if (store) store[dayKey()] = n; else S.v[id] = n; save(); draw(); refresh(); };
    draw();
  };

  R.timer = function (c, box) {
    var presets = (c.presets || [c.minutes || (c.seconds ? c.seconds / 60 : 5)]).map(Number).filter(function (x) { return x > 0; }).slice(0, 5);
    var dur = presets[0] * 60, left = dur, run = false, last = 0, ring = ringSVG(170);
    box.innerHTML = '<span class="nw-label" style="text-align:center">' + esc(c.label || 'Timer') + '</span><div class="nw-ring" style="width:170px;height:170px;margin:0 auto">' + ring.html + '<div class="nw-ring-in"><b class="t" style="font-size:34px;font-weight:300;font-variant-numeric:tabular-nums"></b></div></div><div class="nw-row nw-center" style="margin-top:10px">' + presets.map(function (p) { return '<button class="chip" data-p="' + p + '">' + (p >= 1 ? p + ' min' : Math.round(p * 60) + ' s') + '</button>'; }).join('') + '</div><div class="nw-row nw-center" style="margin-top:10px"><button class="btn go">Start</button><button class="btn ghost rs">Reset</button></div>';
    var t = box.querySelector('.t'), arc = box.querySelector('.arc'), go = box.querySelector('.go');
    var draw = function () { var s = Math.max(0, Math.ceil(left)); t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); arc.style.strokeDashoffset = ring.c * (1 - left / dur); };
    var tick = function (ts) { if (!run) return; left -= (ts - last) / 1000; last = ts; if (left <= 0) { left = 0; run = false; go.textContent = 'Start'; beep(); t.textContent = 'Done!'; arc.style.strokeDashoffset = 0; return; } draw(); requestAnimationFrame(tick); };
    go.onclick = function () { run = !run; go.textContent = run ? 'Pause' : 'Start'; if (run) { if (left <= 0) left = dur; last = performance.now(); requestAnimationFrame(tick); } };
    box.querySelector('.rs').onclick = function () { run = false; go.textContent = 'Start'; left = dur; draw(); };
    box.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { dur = left = num(b.dataset.p) * 60; run = false; go.textContent = 'Start'; draw(); }; });
    draw();
  };

  R.stopwatch = function (c, box) {
    var el = 0, run = false, last = 0;
    box.innerHTML = '<span class="nw-label" style="text-align:center">' + esc(c.label || 'Stopwatch') + '</span><div class="nw-big"></div><div class="nw-row nw-center"><button class="btn go">Start</button><button class="btn ghost lap">Lap</button><button class="btn ghost rs">Reset</button></div><ol class="laps" style="margin:10px 0 0;padding-left:22px;max-height:140px;overflow:auto;font-variant-numeric:tabular-nums"></ol>';
    var big = box.querySelector('.nw-big'), go = box.querySelector('.go');
    var f = function (ms) { var m = Math.floor(ms / 6e4), s = Math.floor(ms / 1e3) % 60, cs = Math.floor(ms / 10) % 100; return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0'); };
    var tick = function (ts) { if (!run) return; el += ts - last; last = ts; big.textContent = f(el); requestAnimationFrame(tick); };
    go.onclick = function () { run = !run; go.textContent = run ? 'Pause' : 'Start'; if (run) { last = performance.now(); requestAnimationFrame(tick); } };
    box.querySelector('.lap').onclick = function () { var li = document.createElement('li'); li.textContent = f(el); box.querySelector('.laps').prepend(li); };
    box.querySelector('.rs').onclick = function () { el = 0; big.textContent = f(0); box.querySelector('.laps').innerHTML = ''; };
    big.textContent = f(0);
  };

  R.countdown = function (c, box) {
    var to = new Date(c.to || Date.now() + 864e5).getTime();
    box.innerHTML = '<span class="nw-label" style="text-align:center">' + esc(c.label || 'Countdown') + '</span><div class="nw-cd"></div><small style="display:block;text-align:center;margin-top:8px" class="when"></small>';
    var cd = box.querySelector('.nw-cd');
    box.querySelector('.when').textContent = new Date(to).toLocaleString(undefined, { dateStyle: 'full', timeStyle: c.time ? 'short' : undefined });
    var draw = function () {
      var t = to - Date.now(), past = t < 0;
      t = Math.abs(t);
      var v = [Math.floor(t / 864e5), Math.floor(t / 36e5) % 24, Math.floor(t / 6e4) % 60, Math.floor(t / 1e3) % 60];
      vars[c.id || 'days_left'] = past ? 0 : v[0];
      cd.innerHTML = ['Days', 'Hours', 'Minutes', 'Seconds'].map(function (l, k) { return '<div><b>' + v[k] + '</b><small>' + l + '</small></div>'; }).join('') + (past ? '<div style="grid-column:1/-1;background:none"><small>' + esc(c.doneText || 'This date has passed — time since shown') + '</small></div>' : '');
    };
    draw();
    setInterval(draw, 1000);
  };

  R.clock = function (c, box) {
    box.innerHTML = '<span class="nw-label">' + esc(c.label || c.timezone || 'Local time') + '</span><div class="nw-val t" style="font-variant-numeric:tabular-nums"></div><small class="d"></small>';
    var t = box.querySelector('.t'), d = box.querySelector('.d');
    var draw = function () {
      var now = new Date();
      try {
        t.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: c.seconds === false ? undefined : '2-digit', timeZone: c.timezone || undefined });
        d.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: c.timezone || undefined });
      } catch (e) { t.textContent = now.toLocaleTimeString(); }
    };
    draw();
    setInterval(draw, 1000);
  };

  R.random = function (c, box, i) {
    var id = c.id || ('rand' + i), mode = c.mode || (c.items ? 'pick' : 'number');
    if (mode === 'pick' && !Array.isArray(S.d[id])) S.d[id] = (c.items || []).map(String);
    if (mode === 'pick' && (spec.rev || 0) > (S.d[id + ':rev'] || 0)) { (c.items || []).forEach(function (t) { if (S.d[id].indexOf(String(t)) < 0) S.d[id].push(String(t)); }); S.d[id + ':rev'] = spec.rev; }
    var hist = [];
    box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Random') + '</span><div class="nw-result">?</div><div class="nw-row nw-center"><button class="btn go">' + esc(c.button || (mode === 'coin' ? 'Flip' : mode === 'yesno' ? 'Ask' : mode === 'dice' ? 'Roll' : 'Pick')) + '</button>' + (mode === 'pick' ? '<button class="btn ghost ed">Edit options</button>' : '') + '</div>' + (mode === 'pick' ? '<textarea class="opts" rows="5" style="width:100%;margin-top:10px;display:none"></textarea>' : '') + '<small class="h" style="display:block;text-align:center;margin-top:8px"></small>';
    var res = box.querySelector('.nw-result'), ta = box.querySelector('.opts');
    var draw = function (v) { res.textContent = v; hist.unshift(v); box.querySelector('.h').textContent = hist.length > 1 ? 'Before: ' + hist.slice(1, 6).join(' · ') : ''; };
    var roll = function () {
      if (mode === 'coin') return Math.random() < .5 ? 'Heads' : 'Tails';
      if (mode === 'yesno') return (c.answers || ['Yes', 'No', 'Maybe', 'Definitely', 'Ask again later', 'Not today'])[Math.floor(Math.random() * (c.answers || [0, 0, 0, 0, 0, 0]).length)];
      if (mode === 'dice') { var n = num(c.dice, 1), s = num(c.sides, 6), tot = 0, rolls = []; for (var k = 0; k < n; k++) { var r = 1 + Math.floor(Math.random() * s); rolls.push(r); tot += r; } return n > 1 ? rolls.join(' + ') + ' = ' + tot : String(tot); }
      if (mode === 'number') { var a = Math.ceil(num(c.min, 1)), b = Math.floor(num(c.max, 100)); return String(a + Math.floor(Math.random() * (b - a + 1))); }
      var items = S.d[id] || [];
      return items.length ? items[Math.floor(Math.random() * items.length)] : 'Add some options';
    };
    box.querySelector('.go').onclick = function () {
      var n = 0, iv = setInterval(function () { res.textContent = roll(); if (++n > 10) { clearInterval(iv); draw(roll()); } }, 55);
    };
    var ed = box.querySelector('.ed');
    if (ed) ed.onclick = function () {
      var open = ta.style.display === 'none';
      if (open) { ta.value = (S.d[id] || []).join('\n'); ta.style.display = 'block'; ed.textContent = 'Save options'; }
      else { S.d[id] = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); ta.style.display = 'none'; ed.textContent = 'Edit options'; save(); }
    };
  };

  R.tally = function (c, box, i) {
    var id = c.id || ('tally' + i);
    var opts = (c.options || []).map(String);
    var counts = S.d[id] && typeof S.d[id] === 'object' && !Array.isArray(S.d[id]) ? S.d[id] : (S.d[id] = {});
    box.innerHTML = '<div class="nw-slider-head"><span class="nw-label">' + esc(c.label || 'Votes') + '</span><button class="nw-link rs">Reset</button></div><div class="rows"></div>';
    var rows = box.querySelector('.rows');
    var draw = function () {
      var tot = opts.reduce(function (s, o) { return s + num(counts[o]); }, 0);
      var top = Math.max.apply(null, opts.map(function (o) { return num(counts[o]); }).concat([0]));
      rows.innerHTML = '';
      opts.forEach(function (o) {
        var v = num(counts[o]);
        var row = document.createElement('div');
        row.className = 'nw-opt';
        row.innerHTML = '<span></span><div class="nw-bar"><i style="width:' + (tot ? v / tot * 100 : 0) + '%"></i></div><b>' + v + (tot ? ' · ' + Math.round(v / tot * 100) + '%' : '') + '</b><button class="chip">+1</button>';
        row.querySelector('span').textContent = o + (v && v === top && tot ? ' ★' : '');
        row.querySelector('button').onclick = function () { counts[o] = v + 1; save(); draw(); };
        rows.appendChild(row);
      });
    };
    box.querySelector('.rs').onclick = function () { opts.forEach(function (o) { counts[o] = 0; }); save(); draw(); };
    draw();
  };

  R.chart = function (c, box) {
    box.innerHTML = '<span class="nw-label">' + esc(c.label || c.title || 'Chart') + '</span><svg viewBox="0 0 600 240" style="width:100%;height:auto"></svg>';
    var svg = box.querySelector('svg');
    var fx = c.fn ? compile(c.fn) : null;
    var ffrom = compile(c.from != null ? c.from : -10), fto = compile(c.to != null ? c.to : 10);
    outputs.push(function () {
      var W = 600, H = 210, L = 44, labels, data, type = c.chart || (fx ? 'line' : 'bar');
      if (fx) {
        var a = num(ffrom(), -10), b = num(fto(), 10); if (b <= a) b = a + 1;
        labels = []; data = [];
        for (var k = 0; k <= 80; k++) { var x = a + (b - a) * k / 80; vars.x = x; var y = num(fx(), NaN); labels.push(x); data.push(isFinite(y) ? y : NaN); }
        delete vars.x;
      } else { labels = c.labels || []; data = (c.data || []).map(function (v) { return num(v); }); }
      var fin = data.filter(isFinite), max = Math.max.apply(null, fin.concat([0])), min = Math.min.apply(null, fin.concat([0])), span = max - min || 1;
      var y = function (v) { return 10 + (H - 10) * (1 - (v - min) / span); };
      var s = '<defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b84ff"/><stop offset="1" stop-color="#b16cff"/></linearGradient></defs>';
      for (var g = 0; g <= 4; g++) { var v = min + span * g / 4; s += '<line x1="' + L + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--border)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" font-size="11" text-anchor="end" fill="var(--muted)">' + (+v.toPrecision(3)) + '</text>'; }
      var n = data.length, step = (W - L) / Math.max(1, fx ? n - 1 : n);
      if (type === 'line') {
        var d = '', pen = false;
        data.forEach(function (v, k) { if (!isFinite(v)) { pen = false; return; } var X = L + (fx ? k * step : k * step + step / 2); d += (pen ? 'L' : 'M') + X.toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
        s += '<path d="' + d + '" fill="none" stroke="url(#cg)" stroke-width="3" stroke-linejoin="round"/>';
      } else {
        data.forEach(function (v, k) { var y0 = y(Math.max(0, min)), y1 = y(v); s += '<rect x="' + (L + k * step + step * .15) + '" y="' + Math.min(y0, y1) + '" width="' + step * .7 + '" height="' + Math.abs(y1 - y0) + '" rx="5" fill="url(#cg)"><title>' + esc(labels[k]) + ': ' + v + '</title></rect>'; });
      }
      var every = Math.ceil(labels.length / 8);
      labels.forEach(function (l, k) { if (k % every) return; var X = L + (fx ? k * step : k * step + step / 2); s += '<text x="' + X + '" y="' + (H + 22) + '" font-size="11" text-anchor="middle" fill="var(--muted)">' + esc(typeof l === 'number' ? +l.toPrecision(3) : String(l).slice(0, 10)) + '</text>'; });
      svg.innerHTML = s;
    });
  };

  R.quiz = function (c, box) {
    var qs = c.questions || [], qi = 0, score = 0, ans = [];
    var draw = function () {
      if (qi >= qs.length) { box.innerHTML = '<div style="text-align:center"><div class="nw-result">' + score + ' / ' + qs.length + '</div><button class="btn sm">Try again</button></div>'; box.querySelector('button').onclick = function () { qi = 0; score = 0; ans = []; draw(); }; return; }
      var q = qs[qi], done = ans[qi] != null;
      box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Quiz') + ' · ' + (qi + 1) + ' of ' + qs.length + '</span><div style="font-weight:600;font-size:16px">' + esc(q.q) + '</div><div class="nw-q-c">' + (q.choices || []).map(function (ch, k) { return '<button data-k="' + k + '" class="' + (done ? (k === q.answer ? 'ok' : k === ans[qi] ? 'no' : '') : '') + '">' + esc(ch) + '</button>'; }).join('') + '</div>' + (done ? (q.explain ? '<p class="nw-note" style="margin-top:10px;color:var(--muted)">' + esc(q.explain) + '</p>' : '') + '<div class="nw-row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm nx">Next</button></div>' : '');
      box.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { if (ans[qi] != null) return; ans[qi] = +b.dataset.k; if (ans[qi] === q.answer) score++; draw(); }; });
      var nx = box.querySelector('.nx'); if (nx) nx.onclick = function () { qi++; draw(); };
    };
    draw();
  };

  R.flashcards = function (c, box) {
    var cards = c.cards || [], k = 0;
    var draw = function () {
      if (!cards.length) { box.innerHTML = '<small>No cards.</small>'; return; }
      var cd = cards[k];
      box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Flashcards') + ' · ' + (k + 1) + ' / ' + cards.length + '</span><div class="nw-card"><div><div class="f"></div><div class="f b"></div></div></div><div class="nw-row nw-center"><button class="btn ghost sm pv">Previous</button><button class="btn sm nx">Next</button></div>';
      box.querySelector('.f').textContent = cd.front; box.querySelector('.b').textContent = cd.back;
      box.querySelector('.nw-card').onclick = function () { this.classList.toggle('flip'); };
      box.querySelector('.pv').onclick = function () { k = (k - 1 + cards.length) % cards.length; draw(); };
      box.querySelector('.nx').onclick = function () { k = (k + 1) % cards.length; draw(); };
    };
    draw();
  };

  R.note = function (c, box) {
    box.innerHTML = (c.label ? '<span class="nw-label">' + esc(c.label) + '</span>' : '') + '<div class="nw-note"></div>';
    box.querySelector('.nw-note').innerHTML = esc(c.text || '').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  };

  R.button = function (c, box) {
    box.style.background = 'none'; box.style.border = '0'; box.style.padding = '0';
    box.innerHTML = '<a class="ask" href="#"></a>';
    var a = box.querySelector('a');
    a.textContent = c.label || 'Ask Nova';
    a.onclick = function (e) { e.preventDefault(); if (c.url && N.open) N.open(c.url); else if (N.ask) N.ask(c.ask || c.label); };
  };

  R.table = function (c, box, i) {
    var id = c.id || ('table' + i), cols = (c.columns || []).map(String);
    if (!Array.isArray(S.d[id])) S.d[id] = (c.rows || []).map(function (r) { return r.slice ? r.slice() : []; });
    box.innerHTML = '<span class="nw-label">' + esc(c.label || 'Table') + '</span><div style="overflow:auto"><table><thead><tr>' + cols.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + (c.editable ? '<th></th>' : '') + '</tr></thead><tbody></tbody></table></div>' + (c.editable ? '<form class="nw-add" style="margin-top:8px">' + cols.map(function (h) { return '<input placeholder="' + esc(h) + '">'; }).join('') + '<button class="btn sm">Add</button></form>' : '');
    var tb = box.querySelector('tbody');
    var draw = function () {
      tb.innerHTML = '';
      S.d[id].forEach(function (r, k) {
        var tr = document.createElement('tr');
        tr.innerHTML = cols.map(function () { return '<td></td>'; }).join('') + (c.editable ? '<td><button class="nw-x" aria-label="Remove row">×</button></td>' : '');
        cols.forEach(function (_, j) { tr.children[j].textContent = r[j] == null ? '' : r[j]; });
        var x = tr.querySelector('.nw-x'); if (x) x.onclick = function () { S.d[id].splice(k, 1); save(); draw(); };
        tb.appendChild(tr);
      });
    };
    var form = box.querySelector('form');
    if (form) form.onsubmit = function (e) { e.preventDefault(); var vals = [].map.call(form.querySelectorAll('input'), function (x) { var v = x.value; x.value = ''; return v; }); if (!vals.some(Boolean)) return; S.d[id].push(vals); save(); draw(); };
    draw();
  };

  var FULL = { counter: 1, history: 1, checklist: 1, log: 1, rating: 1, timer: 1, stopwatch: 1, countdown: 1, random: 1, tally: 1, chart: 1, quiz: 1, flashcards: 1, note: 1, table: 1, progress: 1, button: 0 };
  var head = '<header class="nw-head"><span class="wi wi-' + esc(/^[a-z]+$/.test(spec.icon || '') ? spec.icon : 'spark') + '" aria-hidden="true"></span><div><h1>' + esc(spec.title || 'Widget') + '</h1>' + (spec.subtitle ? '<p>' + esc(spec.subtitle) + '</p>' : '') + '</div><span class="nw-saved">Saved</span></header>';
  root.className = 'nw';
  root.innerHTML = head + '<div class="nw-grid"></div>';
  savedEl = root.querySelector('.nw-saved');
  var grid = root.querySelector('.nw-grid');
  (Array.isArray(spec.components) ? spec.components : []).slice(0, 40).forEach(function (c, i) {
    if (!c || !R[c.type]) return;
    var box = document.createElement('section');
    var wide = c.span === 2 || c.span === 'full' || (c.span == null && (FULL[c.type] || c.big));
    box.className = 'nw-c nw-' + c.type + (wide ? ' span2' : '');
    try { R[c.type](c, box, i); grid.appendChild(box); } catch (e) { console.error('widget component failed', c.type, e); }
  });
  refresh();
  setInterval(refresh, 30000);
}
/* eslint-enable */

/** Light validation so a malformed spec can't break rendering. */
export function normalizeSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const comps = Array.isArray(spec.components) ? spec.components.filter((c) => c && WIDGET_TYPES.includes(c.type)) : [];
  if (!comps.length) return null;
  return { ...spec, title: String(spec.title || 'Widget').slice(0, 80), icon: WIDGET_ICONS.includes(spec.icon) ? spec.icon : 'spark', components: comps.slice(0, 40) };
}

/** Build the widget page fragment for a spec (styled by the frame's base CSS). */
export function specToHTML(spec) {
  const json = JSON.stringify(spec).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  return `<style>${WIDGET_CSS}</style><div id="nw"></div><script>window.__NOVA_SPEC__=${json};<\/script><script>(${NovaWidgetRuntime.toString()})();<\/script>`;
}
