// Safe math expression evaluator, equation solver and unit converter.

const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  log: Math.log10, log10: Math.log10, log2: Math.log2, ln: Math.log, exp: Math.exp,
  min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
  fact: (n) => factorial(n),
};
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2, tau: Math.PI * 2 };

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function tokenize(src) {
  const toks = [];
  const re = /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+|[a-zπ_][a-z0-9_]*|\*\*|[-+*/^%()!,×÷√])/giy;
  let m, i = 0;
  re.lastIndex = 0;
  while (i < src.length) {
    re.lastIndex = i;
    m = re.exec(src);
    if (!m) { if (/\s/.test(src.slice(i))) break; throw new Error('Unexpected "' + src[i] + '"'); }
    let t = m[1];
    if (t === '×') t = '*'; else if (t === '÷') t = '/'; else if (t === '**') t = '^';
    toks.push(t);
    i = re.lastIndex;
  }
  return toks;
}

/** Recursive-descent evaluator. vars: { x: number } */
export function evaluate(src, vars = {}, { degrees = false } = {}) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const trig = new Set(['sin', 'cos', 'tan']);
  const atrig = new Set(['asin', 'acos', 'atan']);

  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = next(); const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/' || t === '%') {
        next(); const r = unary();
        v = t === '*' ? v * r : t === '/' ? v / r : v % r;
      } else if (t !== undefined && (t === '(' || /^[a-zπ√]/i.test(t) || /^[\d.]/.test(t))) {
        v = v * unary(); // implicit multiplication: 2x, 3(4), 2pi
      } else break;
    }
    return v;
  }
  function unary() {
    if (peek() === '-') { next(); return -unary(); }
    if (peek() === '+') { next(); return unary(); }
    if (peek() === '√') { next(); return Math.sqrt(unary()); }
    return power();
  }
  function power() {
    let b = postfix();
    if (peek() === '^') { next(); const e = unary(); b = Math.pow(b, e); }
    return b;
  }
  function postfix() {
    let v = primary();
    while (peek() === '!') { next(); v = factorial(v); }
    return v;
  }
  function primary() {
    const t = next();
    if (t === undefined) throw new Error('Incomplete expression');
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('Missing )'); return v; }
    const name = t.toLowerCase();
    if (name in vars) return vars[name];
    if (name in CONSTS) return CONSTS[name];
    if (name in FUNCS) {
      let args = [];
      if (peek() === '(') {
        next();
        if (peek() !== ')') { args.push(expr()); while (peek() === ',') { next(); args.push(expr()); } }
        if (next() !== ')') throw new Error('Missing )');
      } else args = [unary()];
      if (degrees && trig.has(name)) args[0] = (args[0] * Math.PI) / 180;
      let r = FUNCS[name](...args);
      if (degrees && atrig.has(name)) r = (r * 180) / Math.PI;
      return r;
    }
    throw new Error('Unknown name "' + t + '"');
  }
  const v = expr();
  if (p < toks.length) throw new Error('Unexpected "' + toks[p] + '"');
  return v;
}

/** Turn natural-language math into an expression string. */
export function wordsToExpr(text) {
  let s = ' ' + text.toLowerCase() + ' ';
  s = s.replace(/[?=]+\s*$/g, ' ')
    .replace(/,(?=\d{3}\b)/g, '')
    .replace(/\b(what is|what's|whats|calculate|compute|evaluate|work out|how much is|tell me|equals?|the value of|please|can you)\b/g, ' ')
    .replace(/\bsquare root of\b/g, ' sqrt ')
    .replace(/\bcube root of\b/g, ' cbrt ')
    .replace(/\b(\d+(?:\.\d+)?)\s*squared\b/g, '($1)^2')
    .replace(/\b(\d+(?:\.\d+)?)\s*cubed\b/g, '($1)^3')
    .replace(/\bto the power of\b|\braised to\b/g, ' ^ ')
    .replace(/\bplus\b|\band\b(?=\s*\d)/g, ' + ')
    .replace(/\bminus\b|\bless\b/g, ' - ')
    .replace(/\btimes\b|\bmultiplied by\b|(?<=\d)\s*x\s*(?=\d)/g, ' * ')
    .replace(/\bdivided by\b|\bover\b/g, ' / ')
    .replace(/\bmod(ulo)?\b/g, ' % ')
    .replace(/\bfactorial of (\d+)/g, '$1!')
    .replace(/\bpercent\b/g, '%');
  return s.trim();
}

/** Try to answer a math-looking question. Returns null if it isn't math. */
export function solveMath(text) {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // percentages: "15% of 200", "what is 20 percent of 80"
  let m = /(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?\d[\d,]*(?:\.\d+)?)/i.exec(lower);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2].replace(/,/g, ''));
    return { kind: 'percent', expr: `${a}% of ${b}`, value: (a / 100) * b, steps: [`${a}% = ${a / 100}`, `${a / 100} × ${b} = ${fmt((a / 100) * b)}`] };
  }
  // "x is what percent of y"
  m = /(-?\d+(?:\.\d+)?)\s+is\s+what\s+(?:percent|%)\s+of\s+(-?\d+(?:\.\d+)?)/i.exec(lower);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    return { kind: 'percent', expr: `${a} / ${b} × 100`, value: (a / b) * 100, unit: '%', steps: [`${a} ÷ ${b} = ${fmt(a / b)}`, `× 100 = ${fmt((a / b) * 100)}%`] };
  }
  // percent change
  m = /(?:percent(?:age)? (?:change|increase|decrease)) from (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)/i.exec(lower);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    const v = ((b - a) / Math.abs(a)) * 100;
    return { kind: 'percent', expr: `(${b} − ${a}) / ${a} × 100`, value: v, unit: '%', steps: [`Difference: ${fmt(b - a)}`, `${fmt(b - a)} ÷ ${a} × 100 = ${fmt(v)}%`] };
  }

  // equations: "solve 2x + 3 = 7"
  if (/=/.test(raw) && /\b[xyz]\b|\d[xyz]\b/i.test(raw)) {
    const eq = raw.replace(/^.*?(solve|find x|find|for x)\s*:?\s*/i, '').replace(/\s*(for [xyz])\s*$/i, '');
    const parts = eq.split('=');
    if (parts.length === 2) {
      const v = (/[a-z]/i.exec(eq.replace(/sqrt|sin|cos|tan|log|ln|exp|abs|pi/gi, '')) || ['x'])[0].toLowerCase();
      try {
        const f = (x) => evaluate(parts[0], { [v]: x }) - evaluate(parts[1], { [v]: x });
        const f0 = f(0), f1 = f(1), f2 = f(2), f3 = f(-1);
        const a2 = (f1 + f3 - 2 * f0) / 2; // quadratic coefficient
        const b1 = (f1 - f3) / 2;
        const c0 = f0;
        if (Math.abs(f2 - (4 * a2 + 2 * b1 + c0)) < 1e-6) {
          if (Math.abs(a2) < 1e-12) {
            if (Math.abs(b1) < 1e-12) return { kind: 'equation', expr: eq, value: null, text: c0 === 0 ? 'Every value is a solution (identity).' : 'No solution.', steps: [] };
            const x = -c0 / b1;
            return { kind: 'equation', expr: eq, variable: v, value: x, steps: [`Rewrite as ${poly([[b1, v], [c0, '']])} = 0`, `${v} = ${fmt(-c0)} ÷ ${fmt(b1)}`, `${v} = ${fmt(x)}`] };
          }
          const disc = b1 * b1 - 4 * a2 * c0;
          const steps = [`Standard form: ${poly([[a2, `${v}²`], [b1, v], [c0, '']])} = 0  (a = ${fmt(a2)}, b = ${fmt(b1)}, c = ${fmt(c0)})`, `Discriminant Δ = b² − 4ac = ${fmt(disc)}`];
          if (disc < 0) {
            const re = -b1 / (2 * a2), im = Math.sqrt(-disc) / (2 * a2);
            steps.push('Δ < 0, so the roots are complex');
            return { kind: 'equation', expr: eq, variable: v, roots: [`${fmt(re)} + ${fmt(Math.abs(im))}i`, `${fmt(re)} − ${fmt(Math.abs(im))}i`], steps };
          }
          const r1 = (-b1 + Math.sqrt(disc)) / (2 * a2), r2 = (-b1 - Math.sqrt(disc)) / (2 * a2);
          steps.push(`${v} = (−b ± √Δ) / 2a`);
          return { kind: 'equation', expr: eq, variable: v, roots: disc === 0 ? [fmt(r1)] : [fmt(r1), fmt(r2)], steps };
        }
      } catch { /* not solvable */ }
    }
  }

  // plain expression
  const looksMath = /^[\s\d.+\-*/^%()!,×÷√πe]+$/i.test(raw.replace(/\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|log|ln|exp|abs|pi|round|floor|ceil|min|max)\b/gi, ''))
    || /^(what is|what's|whats|calculate|compute|evaluate|how much is|solve)\b/i.test(lower);
  if (!looksMath) return null;
  const exprStr = wordsToExpr(raw);
  if (!/\d/.test(exprStr) || !/[-+*/^%!√(]|sqrt|cbrt|sin|cos|tan|log|ln|exp/.test(exprStr)) return null;
  try {
    const degrees = /deg|°/.test(lower);
    const value = evaluate(exprStr.replace(/°/g, ''), {}, { degrees });
    if (!isFinite(value) && !Number.isNaN(value)) return { kind: 'expr', expr: exprStr, value };
    if (Number.isNaN(value)) return null;
    return { kind: 'expr', expr: exprStr, value, steps: [] };
  } catch {
    return null;
  }
}

function poly(terms) {
  let s = '';
  for (const [c, sym] of terms) {
    if (Math.abs(c) < 1e-12) continue;
    const mag = Math.abs(c);
    const coef = sym && Math.abs(mag - 1) < 1e-12 ? '' : fmt(mag);
    s += s ? (c < 0 ? ' − ' : ' + ') : c < 0 ? '−' : '';
    s += coef + sym;
  }
  return s || '0';
}

export function fmt(n, digits = 10) {
  if (typeof n !== 'number') return String(n);
  if (!isFinite(n)) return n > 0 ? '∞' : n < 0 ? '−∞' : 'undefined';
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  const r = parseFloat(n.toPrecision(digits));
  return r.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

// ---------- units ----------
const U = {
  length: { base: 'm', units: { mm: 0.001, millimeter: 0.001, millimeters: 0.001, cm: 0.01, centimeter: 0.01, centimeters: 0.01, m: 1, meter: 1, meters: 1, metre: 1, metres: 1, km: 1000, kilometer: 1000, kilometers: 1000, kilometres: 1000, in: 0.0254, inch: 0.0254, inches: 0.0254, '"': 0.0254, ft: 0.3048, foot: 0.3048, feet: 0.3048, "'": 0.3048, yd: 0.9144, yard: 0.9144, yards: 0.9144, mi: 1609.344, mile: 1609.344, miles: 1609.344, nmi: 1852, 'nautical mile': 1852, 'nautical miles': 1852, 'light year': 9.4607e15, 'light years': 9.4607e15, au: 1.495978707e11 } },
  mass: { base: 'kg', units: { mg: 1e-6, milligram: 1e-6, milligrams: 1e-6, g: 0.001, gram: 0.001, grams: 0.001, kg: 1, kgs: 1, kilogram: 1, kilograms: 1, kilo: 1, kilos: 1, t: 1000, ton: 1000, tons: 1000, tonne: 1000, tonnes: 1000, oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495, lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592, st: 6.35029, stone: 6.35029, stones: 6.35029 } },
  volume: { base: 'l', units: { ml: 0.001, milliliter: 0.001, milliliters: 0.001, l: 1, liter: 1, liters: 1, litre: 1, litres: 1, gal: 3.78541, gallon: 3.78541, gallons: 3.78541, qt: 0.946353, quart: 0.946353, quarts: 0.946353, pt: 0.473176, pint: 0.473176, pints: 0.473176, cup: 0.24, cups: 0.24, 'fl oz': 0.0295735, floz: 0.0295735, tbsp: 0.0147868, tablespoon: 0.0147868, tablespoons: 0.0147868, tsp: 0.00492892, teaspoon: 0.00492892, teaspoons: 0.00492892, m3: 1000, 'cubic meter': 1000, 'cubic meters': 1000 } },
  speed: { base: 'm/s', units: { 'm/s': 1, mps: 1, 'km/h': 0.277778, kmh: 0.277778, kph: 0.277778, 'kilometers per hour': 0.277778, mph: 0.44704, 'miles per hour': 0.44704, knot: 0.514444, knots: 0.514444, kn: 0.514444, mach: 343 } },
  area: { base: 'm2', units: { m2: 1, 'sq m': 1, 'square meter': 1, 'square meters': 1, km2: 1e6, 'sq km': 1e6, 'square kilometers': 1e6, ft2: 0.092903, 'sq ft': 0.092903, 'square feet': 0.092903, 'square foot': 0.092903, acre: 4046.86, acres: 4046.86, hectare: 10000, hectares: 10000, ha: 10000, 'sq mi': 2.59e6, 'square miles': 2.59e6, 'square mile': 2.59e6 } },
  data: { base: 'B', units: { bit: 0.125, bits: 0.125, b: 1, byte: 1, bytes: 1, kb: 1000, kilobyte: 1000, kilobytes: 1000, mb: 1e6, megabyte: 1e6, megabytes: 1e6, gb: 1e9, gigabyte: 1e9, gigabytes: 1e9, tb: 1e12, terabyte: 1e12, terabytes: 1e12, kib: 1024, mib: 1048576, gib: 1073741824 } },
  time: { base: 's', units: { ms: 0.001, millisecond: 0.001, milliseconds: 0.001, s: 1, sec: 1, second: 1, seconds: 1, min: 60, mins: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, day: 86400, days: 86400, week: 604800, weeks: 604800, month: 2629746, months: 2629746, year: 31556952, years: 31556952 } },
  energy: { base: 'J', units: { j: 1, joule: 1, joules: 1, kj: 1000, cal: 4.184, calorie: 4.184, calories: 4.184, kcal: 4184, kwh: 3.6e6, wh: 3600 } },
};
const TEMP = { c: 'C', celsius: 'C', '°c': 'C', centigrade: 'C', f: 'F', fahrenheit: 'F', '°f': 'F', k: 'K', kelvin: 'K' };

function findUnit(name) {
  const n = name.toLowerCase().trim().replace(/\.$/, '');
  if (TEMP[n]) return { cat: 'temperature', key: TEMP[n] };
  for (const [cat, def] of Object.entries(U)) if (n in def.units) return { cat, key: n, factor: def.units[n] };
  return null;
}

function convertTemp(v, from, to) {
  let c = from === 'C' ? v : from === 'F' ? (v - 32) * (5 / 9) : v - 273.15;
  return to === 'C' ? c : to === 'F' ? c * (9 / 5) + 32 : c + 273.15;
}

/** Parse "convert 5 km to miles", "72 f in c", "how many feet in a mile". */
export function parseConversion(text) {
  const t = text.toLowerCase().replace(/[?!]/g, '').replace(/degrees?\s+/g, '').trim();
  let m = /(?:convert\s+)?(-?\d[\d,]*(?:\.\d+)?)\s*([a-z°'"/ 0-9]+?)\s+(?:to|in|into|as|=)\s+([a-z°'"/ 0-9]+?)$/i.exec(t.replace(/^.*?(?=-?\d)/, ''));
  if (m) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    return { value: v, from: m[2].trim(), to: m[3].trim().replace(/^(a|an)\s+/, '') };
  }
  m = /how many\s+([a-z ]+?)\s+(?:are\s+)?in\s+(?:a|an|one|1)?\s*([a-z ]+)$/i.exec(t);
  if (m) return { value: 1, from: m[2].trim(), to: m[1].trim(), inverse: true };
  return null;
}

export function convertUnits(q) {
  const a = findUnit(q.from), b = findUnit(q.to);
  if (!a || !b || a.cat !== b.cat) return null;
  let result;
  if (a.cat === 'temperature') result = convertTemp(q.value, a.key, b.key);
  else result = (q.value * a.factor) / b.factor;
  return { ...q, result, category: a.cat };
}
