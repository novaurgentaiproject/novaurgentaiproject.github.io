// Study mode helpers: on-device quiz & flashcard generation from an article.
import { sentences } from '../engines/local.js';
import { rng, hash } from '../util.js';

const COMMON = new Set('The A An In On At It This That These Those However During After Before When While Although Since Because Its Their His Her Some Many Most Other Such Each Both Several Also Today There Here For From With By As If According'.split(' '));

export function makeQuiz(article, { n = 5, seed = 0 } = {}) {
  const r = rng(hash(article.title) + seed);
  const all = article.sections.map((s) => s.text).join('\n');
  const ss = sentences(all).filter((s) => s.length > 50 && s.length < 240 && !/\b(citation|cite|isbn)\b/i.test(s));
  const titleWords = new Set(article.title.split(/\s+/));
  const termRe = /\b([A-Z][a-zà-ÿ]+(?:\s+(?:of|the|de|and)?\s*[A-Z][a-zà-ÿ]+)*)\b/g;
  const years = new Set(), terms = new Set();
  ss.forEach((s) => {
    (s.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/g) || []).forEach((y) => years.add(y));
    let m;
    termRe.lastIndex = 0;
    while ((m = termRe.exec(s))) if (m.index > 0 && !COMMON.has(m[1]) && !titleWords.has(m[1]) && m[1].length > 3) terms.add(m[1]);
  });
  const yearPool = [...years], termPool = [...terms];
  const qs = [];
  const used = new Set();
  const order = ss.map((s, i) => ({ s, i, k: r() })).sort((a, b) => a.k - b.k);
  for (const { s } of order) {
    if (qs.length >= n) break;
    let answer = null, pool = null;
    const y = (s.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/) || [])[0];
    if (y && yearPool.length >= 2) { answer = y; pool = yearPool; }
    else {
      termRe.lastIndex = 0;
      let m, cands = [];
      while ((m = termRe.exec(s))) if (m.index > 0 && terms.has(m[1])) cands.push(m[1]);
      if (cands.length && termPool.length >= 4) { answer = cands[Math.floor(r() * cands.length)]; pool = termPool; }
    }
    if (!answer || used.has(answer)) continue;
    used.add(answer);
    let distract;
    if (pool === yearPool) {
      const base = +answer;
      const set = new Set();
      [...yearPool.filter((x) => x !== answer).sort(() => r() - 0.5), String(base + 10), String(base - 7), String(base + 23)].forEach((x) => { if (set.size < 3 && x !== answer) set.add(x); });
      distract = [...set];
    } else distract = pool.filter((x) => x !== answer && !s.includes(x)).sort(() => r() - 0.5).slice(0, 3);
    if (distract.length < 3) continue;
    const choices = [answer, ...distract].sort(() => r() - 0.5);
    qs.push({ q: s.replace(answer, '_____'), choices, answer: choices.indexOf(answer), explain: s });
  }
  const cards = [];
  for (const s of ss) {
    if (cards.length >= 8) break;
    const m = /^((?:The |An? )?[A-Z][\w\s'-]{2,40}?) (is|are|was|were|refers to|describes) (.{20,180})$/.exec(s);
    if (m && !cards.some((c) => c.front === m[1])) cards.push({ front: m[1], back: `${m[1]} ${m[2]} ${m[3]}` });
  }
  return { title: `${article.title} — quick quiz`, questions: qs, cards };
}
