// AI Mode — search-grounded answers with sources, images, "people also ask"
// and follow-ups, in the spirit of an AI search results page.
import { wikiSearch, wikiPages } from '../engines/knowledge.js';
import { sentences, summarize, extractTopic } from '../engines/local.js';
import { truncate } from '../util.js';

export async function gatherSources(query, { n = 6, signal } = {}) {
  const topic = extractTopic(query);
  const exactTitle = topic.charAt(0).toUpperCase() + topic.slice(1);
  const [exact, a, b] = await Promise.all([
    wikiPages([exactTitle], { signal }).catch(() => []),
    wikiSearch(query, { limit: 8, signal }).catch(() => []),
    topic !== query ? wikiSearch(topic, { limit: 5, signal }).catch(() => []) : Promise.resolve([]),
  ]);
  const titles = [];
  const best = exact[0] && !exact[0].disambiguation && exact[0].extract.length > 200 ? [{ title: exact[0].title }] : [];
  for (const h of [...best, ...b.slice(0, 2), ...a, ...b.slice(2)]) if (!titles.includes(h.title)) titles.push(h.title);
  if (!titles.length) return [];
  const pages = await wikiPages(titles.slice(0, 12), { signal });
  return pages.filter((p) => !p.disambiguation && p.extract.length > 80).slice(0, n).map((p) => ({
    title: p.title,
    url: p.url,
    snippet: truncate(p.extract.replace(/\s+/g, ' '), 220),
    text: p.extract,
    thumb: p.thumb,
    site: 'en.wikipedia.org',
    description: p.description,
  }));
}

/** On-device answer composed from sources, with citations. */
export function composeAnswer(query, sources, depth = 2) {
  const main = sources[0];
  const topic = extractTopic(query);
  const lead = summarize(main.text, depth >= 2 ? 3 : 2);
  let md = `${lead.map((s, i) => (i === 0 ? s.replace(new RegExp(`^(${escapeRe(main.title)})`, 'i'), '**$1**') : s)).join(' ')} [1]`;
  const points = sources.slice(1, depth >= 2 ? 6 : 4).map((s, k) => {
    const first = sentences(s.text)[0] || s.snippet;
    return `- **${s.title}:** ${first.replace(new RegExp(`^${escapeRe(s.title)}\\s*(\\([^)]*\\))?\\s*`, 'i'), '').replace(/^(is|are|was|were)\s/i, (m) => m)} [${k + 2}]`;
  });
  if (points.length) md += `\n\n### Key points\n${points.join('\n')}`;
  const more = sentences(main.text).slice(lead.length, lead.length + (depth >= 3 ? 3 : 2));
  if (more.length && depth >= 1) md += `\n\n### Good to know\n${more.map((s) => `- ${s} [1]`).join('\n')}`;
  md += `\n\n**In short:** ${sentences(main.text)[0]} [1]`;

  const paa = peopleAlsoAsk(main, sources);
  const followups = [`How does ${topic} work?`, `What is the history of ${main.title}?`, ...sources.slice(1, 3).map((s) => `How is ${s.title} related to ${topic}?`)].slice(0, 4);
  return { md, paa, followups };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function peopleAlsoAsk(main, sources) {
  const ss = sources.flatMap((s, i) => sentences(s.text).map((t) => ({ t, i })));
  const find = (re) => ss.find((x) => re.test(x.t));
  const out = [];
  const t = main.title;
  const why = find(/\b(important|significant|known for|notable|famous|widely|crucial|essential)\b/i);
  if (why) out.push({ q: `Why is ${t} important?`, a: `${why.t} [${why.i + 1}]` });
  const when = find(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (when) out.push({ q: `When did ${t} begin?`, a: `${when.t} [${when.i + 1}]` });
  const how = find(/\b(by|through|using|uses|consists of|made of|works)\b/i);
  if (how && how !== why) out.push({ q: `How does ${t} work?`, a: `${how.t} [${how.i + 1}]` });
  if (sources[1]) out.push({ q: `What is ${sources[1].title}?`, a: `${sentences(sources[1].text)[0]} [2]` });
  return out.slice(0, 4);
}

export const AIMODE_INSTRUCTIONS = `AI MODE IS ON. You are answering like an AI-powered search results page. Use the numbered SOURCES provided in the user's message as your primary evidence and cite them inline as [1], [2] (cite after the sentence they support; never invent sources or numbers). Structure:
1. Start with a direct 2–3 sentence answer that bolds the key facts.
2. Then 2–4 short sections with \`###\` headings, bullet points or a comparison table, each grounded in the sources.
3. End with a one-line **Bottom line:** summary.
Be accurate and concise; if the sources don't cover something, say so and answer from general knowledge without a citation.
After your answer, output exactly one block of 3–4 natural follow-up questions the user might ask next:
\`\`\`nova-followups
["question 1", "question 2", "question 3"]
\`\`\``;

export function sourcesContext(sources) {
  return sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${truncate(s.text, 2400)}`).join('\n\n');
}
