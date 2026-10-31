// Deep research: plan → search many sources → read → write a cited report.
import { wikiSearch, wikiPages, wikiArticle, wikiUrl } from '../engines/knowledge.js';
import { summarize, sentences, extractTopic } from '../engines/local.js';
import { truncate, titleCase, sleep } from '../util.js';

export function planQueries(topic) {
  return [topic, `${topic} history`, `${topic} how it works`, `${topic} impact and applications`, `${topic} challenges and future`];
}

export async function runResearch({ query, plan, signal, onProgress }) {
  const topic = extractTopic(query);
  const queries = plan?.length ? plan : planQueries(topic);
  const titles = [];
  const snippets = new Map();
  try {
    const exact = await wikiPages([topic.charAt(0).toUpperCase() + topic.slice(1)], { signal });
    if (exact[0] && !exact[0].disambiguation && exact[0].extract.length > 200) { titles.push(exact[0].title); snippets.set(exact[0].title, exact[0].extract); }
  } catch (e) { if (e.name === 'AbortError') throw e; }
  for (let i = 0; i < queries.length; i++) {
    onProgress?.({ phase: 'search', query: queries[i], i, total: queries.length, found: titles.length });
    const hits = await wikiSearch(queries[i], { limit: 4, signal }).catch((e) => { if (e.name === 'AbortError') throw e; return []; });
    hits.forEach((h) => { if (!titles.includes(h.title)) { titles.push(h.title); snippets.set(h.title, h.snippet); } });
    await sleep(250, signal);
  }
  if (!titles.length) throw new Error('No sources could be reached for this topic right now. Please try again in a minute.');
  onProgress?.({ phase: 'read', found: titles.length });
  let pages;
  try {
    pages = (await wikiPages(titles.slice(0, 16), { signal })).filter((p) => !p.disambiguation && p.extract.length > 120).slice(0, 10);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // Fall back to search snippets so the report can still be written.
    pages = titles.slice(0, 8).map((t) => ({ title: t, url: wikiUrl(t), extract: snippets.get(t) || t, thumb: null }));
  }
  const main = pages[0] ? await wikiArticle(pages[0].title, { signal }).catch(() => null) : null;
  const deep = [];
  for (const p of pages.slice(1, 3)) { const a = await wikiArticle(p.title, { signal }).catch(() => null); if (a) deep.push(a); }
  onProgress?.({ phase: 'write', found: pages.length });
  const sources = pages.map((p) => ({ title: p.title, url: p.url, snippet: truncate(p.extract, 200), text: p.extract, thumb: p.thumb, site: 'en.wikipedia.org' }));
  return { topic, queries, sources, main, deep };
}

export function composeReport({ topic, sources, main, deep }, depth = 2) {
  if (!sources.length) return `I couldn't find enough sources on **${topic}** to write a report. Try a broader or differently worded topic.`;
  const T = titleCase(main?.title || sources[0].title);
  const cite = (i) => ` [${i + 1}]`;
  const exec = summarize(sources[0].text, 3).join(' ') + cite(0);
  let md = `# ${T}: Research Report\n\n*Compiled by Nova Deep Research from ${sources.length} sources · ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}*\n\n## Executive summary\n\n${exec}\n`;
  if (main) {
    const secs = main.sections.filter((s) => s.text.length > 200).slice(1, 3 + depth);
    if (secs.length) md += `\n## Background\n\n${secs.map((s) => `### ${s.title}\n\n${summarize(s.text, depth >= 2 ? 3 : 2).join(' ')}${cite(0)}`).join('\n\n')}\n`;
  }
  md += `\n## Key findings\n\n${sources.slice(1, 8).map((s, k) => `- **${s.title}** — ${sentences(s.text).slice(0, 1).join(' ')}${cite(k + 1)}`).join('\n')}\n`;
  if (deep.length) {
    md += `\n## Deeper dives\n\n${deep.map((a) => {
      const i = sources.findIndex((s) => s.title === a.title);
      return `### ${a.title}\n\n${summarize(a.sections.map((s) => s.text).join('\n'), 3).join(' ')}${cite(Math.max(0, i))}`;
    }).join('\n\n')}\n`;
  }
  md += `\n## At a glance\n\n| Source | What it covers |\n|---|---|\n${sources.slice(0, 6).map((s, i) => `| [${i + 1}] ${s.title} | ${truncate(sentences(s.text)[0] || s.snippet, 110).replace(/\|/g, '/')} |`).join('\n')}\n`;
  md += `\n## Conclusion\n\n${sentences(sources[0].text)[0]} Across the ${sources.length} sources reviewed, the picture that emerges is of a subject connected to ${sources.slice(1, 4).map((s) => `**${s.title}**`).join(', ')}. Further reading in the sources below is recommended for primary data and citations.\n`;
  md += `\n## Sources\n\n${sources.map((s, i) => `${i + 1}. [${s.title}](${s.url}) — Wikipedia`).join('\n')}`;
  return md;
}

export const RESEARCH_INSTRUCTIONS = `DEEP RESEARCH MODE. You have just searched and read the numbered SOURCES in the user's message. Write a comprehensive, well-organized research report in Markdown:
- \`#\` title, an italic line with the date and number of sources
- **Executive summary** (one paragraph)
- 3–6 \`##\` sections that synthesize (not just list) the sources, with \`###\` subsections where useful
- a comparison or summary table where it adds value
- **Open questions / limitations**
- **Conclusion**
- **Sources** — a numbered list of the sources with links
Cite claims inline as [n] using only the provided source numbers. Be rigorous, neutral and specific.`;
