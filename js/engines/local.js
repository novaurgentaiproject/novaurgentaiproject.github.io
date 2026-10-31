// Nova on-device engine: intent routing + generators. Uses live public data
// (Wikipedia, Open-Meteo, Frankfurter) when available, and never pretends to
// know things it doesn't — it says when a request needs Claude.
import { MODELS } from '../models.js';
import { memory, addMemory, removeMemory, settings } from '../state.js';
import { capitalize, titleCase, truncate, formatBytes, hash, rng, pick } from '../util.js';
import { solveMath, fmt, parseConversion, convertUnits } from './mathx.js';
import { bestPage, lookup, wikiArticle, geocode, forecast, wmo, fxRate, CURRENCIES } from './knowledge.js';
import { poem, haiku, story, joke, email, ideas, names, cleanTopic } from './writer.js';
import { generateCode, detectLang, codeScaffold } from './codegen.js';
import { matchWidget, weatherWidget } from '../tools/genui.js';
import { describeAttachment } from '../tools/files.js';

const STOP = new Set('a an the and or but if then else of to in on at by for with about as into like through over after before between under from up down out off is are was were be been being have has had do does did can could should would will shall may might must i me my we our you your he she it its they them their this that these those what which who whom whose when where why how not no yes so than too very just also please tell explain describe give show make write create'.split(' '));

export function sentences(text) {
  return (String(text).replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []).map((s) => s.trim()).filter((s) => s.length > 2);
}

export function summarize(text, n = 4) {
  const ss = sentences(text);
  if (ss.length <= n) return ss;
  const freq = new Map();
  for (const w of String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) if (!STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const scored = ss.map((s, i) => {
    const ws = s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
    const score = ws.reduce((a, w) => a + (freq.get(w) || 0), 0) / Math.sqrt(ws.length + 1) + (i === 0 ? 2 : 0);
    return { s, i, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

export function keyTerms(text, n = 8) {
  const freq = new Map();
  for (const w of String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) if (!STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function relevant(text, query, n = 4) {
  const q = new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)));
  return sentences(text).map((s, i) => ({ s, i, score: (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => q.has(w)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

const nowStr = () => new Date().toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Topic extraction
// ---------------------------------------------------------------------------
export function extractTopic(q) {
  const s = q.trim().replace(/[?!.]+$/, '');
  const pats = [
    /^(?:what|who|where|when|which)\s+(?:is|are|was|were|'s|’s)\s+(?:a |an |the )?(.+)$/i,
    /^(?:tell me|teach me|explain|describe|define|summari[sz]e|give me (?:an? )?(?:overview|summary) of|i want to (?:know|learn) about|learn about)(?: to me)?(?: about| what| everything about)?\s+(?:a |an |the )?(.+?)(?: (?:to me|simply|in simple terms|like i'?m \d+))?$/i,
    /^how (?:does|do|did|is|are|was) (?:a |an |the )?(.+?) (?:work|works|function|made|formed|happen|happens|built)$/i,
    /^(?:what does|what do) (.+?) mean$/i,
    /^(?:history|facts|information|info|overview) (?:of|about|on) (.+)$/i,
    /^(?:who (?:invented|discovered|created|founded|wrote|painted|built)) (?:the )?(.+)$/i,
    /^(.+?) (?:explained|facts|history|meaning|definition)$/i,
  ];
  for (const p of pats) { const m = p.exec(s); if (m) return m[1].replace(/^(?:a|an|the)\s+/i, '').trim(); }
  return s;
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------
function smalltalk(t, model) {
  const name = settings.name ? `, ${settings.name.split(' ')[0]}` : '';
  if (/^(hi|hey|hello|yo|sup|hiya|howdy|greetings|good (morning|afternoon|evening)|what'?s up)\b[\s!.,]*(nova|there)?[\s!.]*$/i.test(t)) {
    const h = new Date().getHours();
    const tod = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return `${pick([`${tod}${name}! ✦`, `Hey${name}! 👋`, `Hello${name}!`])} I'm **${model.name}**. What are we working on today?\n\nA few things I can do right now:\n- 💬 Answer questions with live facts from Wikipedia\n- 🖼️ Create images — just say *"create an image of…"*\n- 💻 Write and run code, or build mini web apps\n- 🧩 Build interactive tools — calculators, timers, quizzes, simulations\n- 📄 Make files — PDF, Word, Excel, CSV and more\n- 🌦️ Check the weather, convert units and currencies, do math`;
  }
  if (/^how are (you|u)( doing| today)?\??$|^how'?s it going\??$/i.test(t)) return `I'm running smoothly and ready to help ✦ How about you${name}? What's on your mind?`;
  if (/^(thanks|thank you|thx|ty|cheers|appreciate it|awesome,? thanks?)[\s!.]*$/i.test(t)) return pick(["You're welcome! Anything else I can help with?", 'Happy to help ✦', 'Anytime! Let me know if you need anything else.']);
  if (/^(bye|goodbye|see you|see ya|good night|gn|cya)[\s!.]*$/i.test(t)) return pick(['Goodbye! Come back anytime ✦', 'See you soon! 👋', 'Good night — rest well 🌙']);
  if (/^(ok|okay|cool|nice|great|got it|alright|k|sure)[\s!.]*$/i.test(t)) return pick(['👍 What would you like to do next?', 'Great! Anything else?']);
  if (/who (are|r) (you|u)|what are you|your name|introduce yourself|what model (are you|is this)|which model/i.test(t)) {
    return `I'm **${model.name}** — part of the **Nova** family of AI models. ${model.tagline}\n\n**The Nova lineup**\n${MODELS.map((m) => `- **${m.name}** — ${m.tagline}`).join('\n')}\n\nYou can switch models anytime from the menu at the top. I'm currently running on the **${settings.engine === 'claude' && settings.anthropicKey ? 'Claude-powered engine' : 'on-device engine'}**.`;
  }
  if (/what can you do|what are your (features|capabilities)|^help$|how do (i|you) use (you|nova|this)/i.test(t)) {
    return `Here's what Nova can do:\n\n| | Feature | Try saying |\n|---|---|---|\n| 💬 | Answers with sources | *"What is a black hole?"* |\n| 🔎 | **AI Mode** search (Google-style with sources) | Pick **AI Mode** from the **+** menu |\n| 🧩 | **Dynamic View** — interactive interfaces | *"Build me a mortgage calculator"* |\n| 🖼️ | Image generation | *"Create an image of a violet nebula over mountains"* |\n| 💻 | Coding + live **Canvas** to run HTML/JS/Python | *"Write a Python fibonacci function"* |\n| 📄 | Files: PDF, Word, Excel, CSV, Markdown… | *"Make a PDF about the solar system"* |\n| 🎙️ | Voice: dictation, voice messages, voice mode | Tap the 🎙️ or waveform button |\n| 📎 | Attach images, videos, audio & documents | Use **+** or drag and drop |\n| 🔭 | Deep research reports | Pick **Deep research** from **+** |\n| 📚 | Study mode: quizzes & flashcards | *"Quiz me on photosynthesis"* |\n\nConnect Claude in **Settings → Engine** to unlock full reasoning across all six Nova models.`;
  }
  if (/who (made|created|built|developed) you|who is your (creator|developer)/i.test(t)) return `I was built as part of the **Nova Urgent AI Project** ✦ — an AI interface with six models, from the instant **Nova 1 Flash** to the flagship **Nova 3 Martia**.`;
  if (/\b(i'?m|i am|feeling) (so )?(sad|down|depressed|lonely|stressed|anxious|overwhelmed|upset|tired)\b/i.test(t)) {
    return `I'm sorry you're feeling this way${name} 💙 That sounds hard, and it's okay to not be okay.\n\nA few things that sometimes help:\n- **Breathe:** in for 4, hold for 4, out for 6 — repeat five times.\n- **Name it:** write down what you're feeling and one small thing that's in your control.\n- **Reach out:** a message to a friend or someone you trust can lighten the load.\n- **Be kind to yourself:** rest, water, a short walk.\n\nIf you're in crisis or thinking about harming yourself, please contact local emergency services or a crisis line right away (in the US, call or text **988**). Would you like to talk about what's going on?`;
  }
  return null;
}

function memoryIntent(t) {
  let m = /^(?:please\s+)?remember (?:that )?(.+)$/i.exec(t);
  if (m) {
    const fact = m[1].replace(/[.!]+$/, '').replace(/^my\b/i, 'My').replace(/^i\b/i, 'I');
    if (!settings.memoryEnabled) return 'Memory is turned off. You can enable it in **Settings → Personalization**.';
    addMemory(capitalize(fact));
    const echo = fact.replace(/\bI'm\b/gi, "you're").replace(/\bI am\b/gi, 'you are').replace(/\bI\b/g, 'you').replace(/\bmy\b/gi, 'your').replace(/\bme\b/gi, 'you').replace(/\bmine\b/gi, 'yours');
    return `Got it — I'll remember that **${echo}**. ✦\n\n\`\`\`nova-memory\n${capitalize(fact)}\n\`\`\``;
  }
  if (/what do you (remember|know) about me|what('?s| is) in your memory|show (me )?(your )?memor/i.test(t)) {
    if (!memory.length) return "I don't have any memories saved yet. Tell me something like *\"Remember that I prefer Python\"* and I'll keep it in mind.";
    return `Here's what I remember about you:\n\n${memory.map((x) => `- ${x.text}`).join('\n')}\n\nYou can manage these in **Settings → Personalization**.`;
  }
  m = /^forget (?:that )?(.+)$/i.exec(t);
  if (m) {
    const q = m[1].toLowerCase();
    const hit = memory.find((x) => x.text.toLowerCase().includes(q) || q.includes(x.text.toLowerCase()));
    if (/everything|all/.test(q) && !hit) return 'To clear all memories, use **Settings → Personalization → Clear memory**.';
    if (!hit) return "I couldn't find a memory matching that.";
    removeMemory(hit.id);
    return `Done — I've forgotten that *${hit.text}*.`;
  }
  return null;
}

function mathIntent(t) {
  const r = solveMath(t);
  if (!r) return null;
  const steps = r.steps || [];
  if (r.kind === 'equation') {
    if (r.roots) return { md: `**Solving** \`${r.expr}\`\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**${r.variable} = ${r.roots.join('** or **' + r.variable + ' = ')}**`, steps: ['Detected an equation', 'Solved symbolically by sampling the polynomial', ...steps] };
    if (r.value == null) return { md: r.text, steps: [] };
    return { md: `**Solving** \`${r.expr}\`\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**${r.variable} = ${fmt(r.value)}**`, steps: ['Detected a linear equation', ...steps] };
  }
  const val = fmt(r.value) + (r.unit || '');
  return { md: steps.length ? `${steps.map((s) => `- ${s}`).join('\n')}\n\n**= ${val}**` : `\`${r.expr.replace(/\*/g, '×')}\` = **${val}**`, steps: ['Parsed arithmetic expression', `Evaluated: ${r.expr} → ${val}`] };
}

async function conversionIntent(t, signal) {
  const q = parseConversion(t);
  if (!q) return null;
  const from = CURRENCIES[q.from.toLowerCase()] || (/^[a-z]{3}$/i.test(q.from) && CURRENCIES[q.from.toLowerCase()]);
  const to = CURRENCIES[q.to.toLowerCase()];
  if (from && to) {
    if (!settings.liveData) return { md: 'Live currency data is turned off in Settings.' };
    try {
      const { rate, date } = await fxRate(from, to, { signal });
      return {
        md: `**${fmt(q.value)} ${from} = ${fmt(q.value * rate, 6)} ${to}**\n\n1 ${from} = ${fmt(rate, 6)} ${to} · 1 ${to} = ${fmt(1 / rate, 6)} ${from}\n\n*European Central Bank reference rate for ${date} via Frankfurter. Banks and card providers add their own margins.*`,
        steps: [`Detected currency conversion ${from} → ${to}`, 'Fetched the latest ECB reference rate'],
        sources: [{ title: `Exchange rate ${from}/${to}`, url: 'https://www.frankfurter.app/', snippet: `ECB reference rate on ${date}`, site: 'frankfurter.app' }],
      };
    } catch { return { md: `I couldn't fetch live exchange rates right now. Please try again in a moment.` }; }
  }
  const c = convertUnits(q);
  if (!c) return null;
  const label = (u) => u.replace(/^(\w)/, (m) => m);
  return {
    md: q.inverse ? `There are **${fmt(c.result)} ${label(q.to)}** in 1 ${label(q.from)}.` : `**${fmt(q.value)} ${label(q.from)} = ${fmt(c.result)} ${label(q.to)}**`,
    steps: [`Detected ${c.category} conversion`, `${q.value} ${q.from} → ${q.to}`],
  };
}

async function weatherIntent(t, signal) {
  const m = /(?:weather|forecast|temperature|how (?:hot|cold|warm) is it|is it (?:raining|sunny|cold|hot|snowing))(?:\s+(?:like|today|now|tomorrow|this week))?\s+(?:in|at|for|near)\s+([a-zà-ÿ .'-]+?)(?:\s+(?:today|now|tomorrow|this week|right now))?[?.!]*$/i.exec(t)
    || /^([a-zà-ÿ .'-]+?)\s+(?:weather|forecast)[?.!]*$/i.exec(t);
  if (!m) {
    if (/^(what'?s|how'?s) the weather|^weather\??$|^forecast\??$/i.test(t)) return { md: 'Sure — which city should I check? For example: *"Weather in Tokyo"*.' };
    return null;
  }
  if (!settings.liveData) return { md: 'Live weather is turned off in Settings → General.' };
  const place = await geocode(m[1].trim(), { signal });
  if (!place) return { md: `I couldn't find a place called **${m[1].trim()}**. Could you check the spelling or add the country?` };
  const data = await forecast(place.lat, place.lon, { signal });
  const c = data.current;
  const w = wmo(c.weather_code, !!c.is_day);
  const d = data.daily;
  const html = weatherWidget({ place, data, wmo });
  return {
    md: `${w.emoji} It's currently **${Math.round(c.temperature_2m)}°C** and **${w.text.toLowerCase()}** in **${place.name}**${place.country ? `, ${place.country}` : ''} — feels like ${Math.round(c.apparent_temperature)}°C. Today ranges from ${Math.round(d.temperature_2m_min[0])}° to ${Math.round(d.temperature_2m_max[0])}°${d.precipitation_probability_max?.[0] ? ` with a ${d.precipitation_probability_max[0]}% chance of precipitation` : ''}.\n\n\`\`\`nova-ui title="Weather · ${place.name}"\n${html}\n\`\`\``,
    steps: [`Geocoded "${m[1].trim()}" → ${place.name}, ${place.country}`, 'Fetched live forecast from Open-Meteo', 'Built an interactive weather card'],
    sources: [{ title: `Open-Meteo forecast for ${place.name}`, url: `https://open-meteo.com/en/docs#latitude=${place.lat}&longitude=${place.lon}`, snippet: 'Free weather API with hourly and daily forecasts', site: 'open-meteo.com' }],
  };
}

async function timeIntent(t, signal) {
  if (/^(what|whats|what's)\s+(the\s+)?(time|date|day)(\s+is\s+it)?(\s+today|\s+now)?\??$|^what day is (it|today)\??$|^today'?s date\??$/i.test(t)) {
    return { md: `It's **${nowStr()}** (your local time).` };
  }
  const m = /(?:what(?:'s| is) the )?time (?:is it )?(?:in|at) ([a-zà-ÿ .'-]+?)\??$/i.exec(t);
  if (m) {
    const place = await geocode(m[1], { signal }).catch(() => null);
    if (!place?.timezone) return { md: `I couldn't find the time zone for **${m[1]}**.` };
    const time = new Date().toLocaleString(undefined, { timeZone: place.timezone, weekday: 'long', hour: 'numeric', minute: '2-digit' });
    return { md: `🕐 It's **${time}** in **${place.name}**${place.country ? `, ${place.country}` : ''} (${place.timezone}).`, steps: [`Looked up the time zone for ${place.name}`] };
  }
  const d = /how many days (?:until|till|to|before) (.+?)\??$/i.exec(t);
  if (d) {
    const target = parseDate(d[1]);
    if (target) {
      const days = Math.ceil((target - new Date()) / 86400000);
      return { md: `There ${Math.abs(days) === 1 ? 'is' : 'are'} **${days} day${Math.abs(days) === 1 ? '' : 's'}** until ${d[1]} (${target.toLocaleDateString(undefined, { dateStyle: 'full' })}).` };
    }
  }
  return null;
}

function parseDate(s) {
  const t = s.toLowerCase().trim();
  const y = new Date().getFullYear();
  const fixed = { christmas: [11, 25], 'new year': [0, 1], "new year's": [0, 1], halloween: [9, 31], "valentine's day": [1, 14], valentines: [1, 14], 'independence day': [6, 4] };
  for (const [k, [mo, da]] of Object.entries(fixed)) if (t.includes(k)) { let d = new Date(y, mo, da); if (d < new Date()) d = new Date(y + 1, mo, da); return d; }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function widgetIntent(t) {
  if (!/\b(make|build|create|give|show|open|launch|start|set|need|want|generate|play|let'?s|lets|use)\b/i.test(t) && !/^(a |an )?[\w\s-]{0,30}(calculator|timer|stopwatch|converter|generator|planner|tracker|game|simulator|simulation|clock|quiz|tic.?tac.?toe|piano|synth)\s*$/i.test(t)) return null;
  if (detectLang(t) && !/\b(interactive|widget)\b/i.test(t)) return null;
  if (FILE_RE.test(t)) return null;
  const w = matchWidget(t);
  return w;
}

function codeIntent(t, depth) {
  const lang = detectLang(t);
  const wantsCode = /\b(code|program|script|function|class|algorithm|implement|snippet|syntax|compile|debug|regex|api|endpoint|server|app|website|web ?page|landing page|component|module|query|cli)\b/i.test(t)
    && /\b(write|create|make|build|generate|implement|code|give me|show me|how (do|can|to)|example|need)\b/i.test(t);
  if (!lang && !wantsCode) return null;
  if (!lang && !/\b(write|create|make|build|generate|implement|code)\b/i.test(t)) return null;
  const res = generateCode(t, { depth });
  if (res) return { md: res.md, steps: [`Detected a coding request${lang ? ` (${lang})` : ''}`, `Matched template: ${res.title}`, 'Added explanation and usage notes'] };
  if (lang) { const s = codeScaffold(t, lang); return { md: s.md, steps: ['Detected a coding request', 'No matching template — provided a scaffold'] }; }
  return null;
}

const WRITING = {
  poem: /\b(poem|poetry|verse|sonnet|ode|rhyme|rhyming)\b/i,
  haiku: /\bhaiku\b/i,
  story: /\b(story|tale|fable|bedtime story|narrative|fairy ?tale)\b/i,
  joke: /\b(jokes?|make me laugh|something funny|\bpun\b|cheer me up)\b/i,
  email: /\b(e-?mail|letter|cover letter|message to my)\b/i,
  names: /\b(names? for|name ideas|what should i name|business names?|brand names?|team names?)\b/i,
  ideas: /\b(ideas?|brainstorm|suggestions? for|things to do)\b/i,
};

async function writingIntent(t, depth, seed) {
  const isWrite = /\b(write|compose|create|make|draft|give me|tell me|come up with|generate|brainstorm|suggest|need|i want)\b/i.test(t) || /^(a |an )?(poem|haiku|story|joke)/i.test(t);
  if (!isWrite) return null;
  if (WRITING.haiku.test(t)) {
    const topic = cleanTopic(t, 'haiku');
    return { md: `*${haiku(topic, { seed })}*`, steps: ['Detected a haiku request', `Theme: ${topic}`] };
  }
  if (WRITING.poem.test(t)) {
    const topic = cleanTopic(t, 'poem|poetry|verse|sonnet|ode');
    const p = poem(topic, { depth, seed });
    return { md: `### ${p.title}\n\n${p.body.split('\n\n').map((s) => `*${s.split('\n').join('*\n*')}*`).join('\n\n')}`, steps: ['Detected a poem request', `Theme: ${topic}`, `Wrote ${p.body.split('\n\n').length} stanzas with an ABCB rhyme pattern`] };
  }
  if (WRITING.story.test(t)) {
    const premise = cleanTopic(t, 'story|tale|fable|narrative|fairy ?tale');
    const s = story(premise, { depth, seed });
    return { md: `## ${s.title}\n\n${s.body}`, steps: ['Detected a story request', `Premise: ${premise}`, 'Structured as setup → inciting incident → journey → resolution'] };
  }
  if (WRITING.joke.test(t)) return { md: joke(cleanTopic(t, 'jokes?|pun'), seed), steps: ['Picked a joke'] };
  if (WRITING.email.test(t)) return { md: email(t, { name: settings.name }), steps: ['Detected an email/letter request', 'Chose a tone and structure based on its purpose'] };
  if (WRITING.names.test(t)) {
    const topic = cleanTopic(t.replace(/\b\d{1,2}\s+/, ''), 'names? for|name ideas for|business names? for|brand names? for|team names? for');
    const list = names(topic, Math.min(20, parseInt(/\b(\d{1,2})\s+(?:\w+\s+)?names?\b/i.exec(t)?.[1], 10) || (depth >= 2 ? 12 : 8)), seed);
    return { md: `Here are some name ideas for **${topic}**:\n\n${list.map((n, i) => `${i + 1}. **${n}**`).join('\n')}\n\nWant a different vibe — playful, premium, techy or classic?`, steps: ['Generated name combinations'] };
  }
  if (WRITING.ideas.test(t)) {
    const topic = cleanTopic(t.replace(/\b\d{1,2}\s+/, ''), 'ideas?|brainstorm|suggestions?|things to do');
    const list = ideas(topic, Math.min(10, parseInt(/\b(\d{1,2})\s+(?:\w+\s+)?(?:ideas?|suggestions?|things)\b/i.exec(t)?.[1], 10) || (depth >= 2 ? 10 : 6)), seed);
    return { md: `Here are some ideas for **${topic}**:\n\n${list.map((n, i) => `${i + 1}. ${n}`).join('\n')}`, steps: ['Brainstormed ideas'] };
  }
  return null;
}

// ---------- plans ----------
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
async function planIntent(t, depth, signal) {
  if (!/\b(plan|itinerary|schedule|routine|program)\b/i.test(t)) return null;
  if (/workout|exercise|gym|fitness|training/i.test(t)) {
    const rows = [['Monday', 'Upper body strength', 'Push-ups, rows, shoulder press — 3×10'], ['Tuesday', 'Cardio', '30 min brisk walk, run or cycle'], ['Wednesday', 'Lower body strength', 'Squats, lunges, glute bridges — 3×12'], ['Thursday', 'Mobility & core', 'Yoga flow + planks, dead bugs'], ['Friday', 'Full body', 'Circuit: burpees, kettlebell swings, step-ups'], ['Saturday', 'Active fun', 'Hike, sport, swim or dance'], ['Sunday', 'Rest', 'Stretch and recover']];
    return { md: `## 🏋️ Weekly workout plan\n\n| Day | Focus | Session |\n|---|---|---|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n**Tips**\n- Warm up for 5–10 minutes before each session.\n- Increase weight or reps gradually (progressive overload).\n- Sleep 7–9 hours and drink plenty of water.\n\n*Check with a healthcare professional before starting a new exercise program.*`, steps: ['Built a balanced weekly split'] };
  }
  if (/study|exam|learn/i.test(t)) {
    const subject = (/(?:for|study|learn(?:ing)?)\s+([a-z ]+?)(?:\s+(?:exam|test|in|over)|$)/i.exec(t)?.[1] || 'your subject').trim();
    return { md: `## 📚 Study plan — ${titleCase(subject)}\n\n| Day | Focus | Method |\n|---|---|---|\n${DAYS.map((d, i) => `| ${d} | ${['Core concepts overview', 'Deep dive: part 1', 'Practice problems', 'Deep dive: part 2', 'Mixed review + flashcards', 'Full practice test', 'Rest & light review'][i]} | ${['Skim, make an outline', 'Notes + examples', 'Timed practice', 'Teach it back (Feynman)', 'Spaced repetition', 'Simulate exam conditions', 'Review mistakes only'][i]} |`).join('\n')}\n\n**Daily rhythm:** 4 × 25-minute focus blocks with 5-minute breaks (Pomodoro).\n\nWant me to make a **quiz** or **flashcards** for ${subject}? Pick **Study and learn** from the **+** menu.`, steps: ['Built a 7-day spaced study schedule'] };
  }
  if (/meal|diet|eat|food|nutrition/i.test(t)) {
    const meals = [['Overnight oats with berries', 'Quinoa salad with chickpeas', 'Salmon, roasted veg & rice'], ['Greek yogurt, granola & fruit', 'Turkey & avocado wrap', 'Veggie stir-fry with tofu'], ['Spinach & feta omelette', 'Lentil soup + wholegrain bread', 'Chicken fajitas'], ['Smoothie bowl', 'Leftover stir-fry', 'Pasta with tomato, basil & white beans'], ['Peanut butter toast & banana', 'Tuna & bean salad', 'Homemade pizza night'], ['Pancakes with fruit', 'Buddha bowl', 'Grilled fish tacos'], ['Shakshuka', 'Roast dinner', 'Light soup & salad']];
    return { md: `## 🥗 7-day meal plan\n\n| Day | Breakfast | Lunch | Dinner |\n|---|---|---|---|\n${DAYS.map((d, i) => `| ${d} | ${meals[i].join(' | ')} |`).join('\n')}\n\n**Snack ideas:** fruit, nuts, hummus & veggies, yogurt.\n\n*This is general inspiration — adjust for allergies, dietary needs and professional advice.*`, steps: ['Built a balanced weekly menu'] };
  }
  const trip = /(?:trip|travel|vacation|holiday|visit|itinerary|days?)\s+(?:to|in|for)\s+([a-zà-ÿ .'-]+?)(?:\s+for\s+\d+\s+days?)?[?.!]*$/i.exec(t) || /itinerary for\s+([a-zà-ÿ .'-]+)/i.exec(t);
  if (trip) {
    const dest = trip[1].replace(/\b(\d+|one|two|three|four|five|six|seven)\s*days?\b/i, '').trim();
    const n = Math.min(7, parseInt(/(\d+)\s*(?:-|\s)?days?/i.exec(t)?.[1] || ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 })[/(one|two|three|four|five|six|seven)\s*days?/i.exec(t)?.[1]?.toLowerCase()] || 3, 10));
    let intro = '', src = [];
    if (settings.liveData) {
      try { const p = await bestPage(dest, { signal }); if (p) { intro = sentences(p.extract).slice(0, 2).join(' '); src = [{ title: p.title, url: p.url, snippet: truncate(p.extract, 160), site: 'wikipedia.org', thumb: p.thumb }]; } } catch {}
    }
    const themes = ['Arrive & explore the historic center', 'Museums, culture & local markets', 'Nature, parks & viewpoints', 'Neighborhood food tour', 'Day trip to a nearby town', 'Hidden gems & shopping', 'Slow morning & farewell dinner'];
    const days = Array.from({ length: n }, (_, i) => `### Day ${i + 1} — ${themes[i % themes.length]}\n- **Morning:** ${['Walking tour of the old town', 'Visit the top-rated museum early to beat crowds', 'Sunrise at a scenic viewpoint', 'Coffee and pastries at a local café', 'Take the train to a nearby highlight', 'Browse independent shops and markets', 'Sleep in, then brunch'][i % 7]}\n- **Afternoon:** ${['Iconic landmarks and photo spots', 'Local market and street food', 'Park, garden or waterfront stroll', 'Cooking class or food hall', 'Explore and lunch like a local', 'Off-the-beaten-path neighborhood', 'Last-minute souvenirs'][i % 7]}\n- **Evening:** ${['Dinner at a traditional restaurant', 'Sunset drinks with a view', 'Live music or a show', 'Night market or late-night eats', 'Relaxed dinner back in town', 'Rooftop or riverside evening', 'Farewell dinner somewhere special'][i % 7]}`).join('\n\n');
    return { md: `## ✈️ ${n}-day trip to ${titleCase(dest)}\n\n${intro ? intro + '\n\n' : ''}${days}\n\n**Before you go:** check opening hours, book popular spots in advance, and get local transport passes.\n\nWant the live weather? Ask *"weather in ${dest}"*.`, steps: [`Planned ${n} days in ${dest}`, intro ? 'Added background from Wikipedia' : 'Used a general itinerary structure'], sources: src };
  }
  return null;
}

// ---------- files ----------
const FILE_RE = /\b(pdf|docx?|word (?:doc|document|file)|excel|xlsx|spreadsheet|csv|markdown|\.md|txt|text file|json|html file|ics|calendar (?:file|invite)|resume|cv)\b/i;
async function fileIntent(t, depth, seed, signal) {
  if (!FILE_RE.test(t) || !/\b(create|make|generate|export|write|give me|build|produce|save|turn|convert|need)\b/i.test(t)) return null;
  const tl = t.toLowerCase();
  const fmtPhrase = /\b(?:as|in|into|to)\s+(?:an?\s+)?(?:pdf|word|docx?|excel|xlsx|csv|markdown|txt|text|json|html|spreadsheet)(?:\s+(?:doc(?:ument)?|file|format|spreadsheet|sheet))?\b/gi;
  const tt = t.replace(fmtPhrase, ' ').replace(/\s{2,}/g, ' ').trim();
  let ext = /pdf/.test(tl) ? 'pdf' : /docx?|word/.test(tl) ? 'docx' : /excel|xlsx|spreadsheet/.test(tl) ? 'xlsx' : /csv/.test(tl) ? 'csv' : /markdown|\.md/.test(tl) ? 'md' : /json/.test(tl) ? 'json' : /html/.test(tl) ? 'html' : /ics|calendar/.test(tl) ? 'ics' : /txt|text file/.test(tl) ? 'txt' : 'pdf';
  if (/resume|\bcv\b/.test(tl) && !/pdf|docx?|word/.test(tl)) ext = 'docx';
  const topic = cleanTopic(tt.replace(new RegExp(FILE_RE.source, 'gi'), ''), 'file|document|doc|sheet|spreadsheet|table|list|report|summary|version|copy|export|one|make|create|generate|give me|write|build|need')
    .replace(/^(?:(?:a|an|the|of|on|about|with|for|regarding|containing|listing)\s+)+/i, '').replace(/\b(file|document|format)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || 'notes';
  const slug = (/resume|\bcv\b/.test(tl) ? 'resume' : topic).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'nova-file';
  let content = '', sources = [];
  const steps = [`Detected a file request (.${ext})`];

  if (ext === 'csv' || ext === 'xlsx') {
    content = tableFor(topic);
    steps.push('Built a table');
  } else if (ext === 'json') {
    content = JSON.stringify({ title: titleCase(topic), createdBy: 'Nova', createdAt: new Date().toISOString(), items: tableFor(topic).split('\n').slice(1).map((l) => l.split(',')) }, null, 2);
  } else if (ext === 'html') {
    content = generateCode('landing page website').md.match(/```html\n([\s\S]*?)```/)?.[1] || '<h1>Hello</h1>';
  } else if (ext === 'ics') {
    const start = new Date(Date.now() + 86400000); start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    content = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Nova AI//EN\nBEGIN:VEVENT\nUID:${Date.now()}@nova\nDTSTAMP:${f(new Date())}\nDTSTART:${f(start)}\nDTEND:${f(end)}\nSUMMARY:${titleCase(topic)}\nDESCRIPTION:Created with Nova\nEND:VEVENT\nEND:VCALENDAR`;
  } else if (/resume|\bcv\b/.test(tl)) {
    content = `# ${settings.name || 'Your Name'}\n\n**Email:** you@example.com · **Phone:** (555) 123-4567 · **Location:** City, Country · **LinkedIn:** linkedin.com/in/you\n\n## Summary\n\nResults-driven professional with [X] years of experience in [field]. Known for [strength], [strength] and delivering [type of outcome].\n\n## Experience\n\n### Job Title — Company Name\n*Month YYYY – Present*\n\n- Led [project], resulting in [measurable outcome, e.g. 30% faster delivery].\n- Built [thing] used by [number] customers.\n- Collaborated with [teams] to [achievement].\n\n### Previous Title — Previous Company\n*Month YYYY – Month YYYY*\n\n- Improved [metric] by [amount] through [action].\n- Mentored [number] team members.\n\n## Education\n\n**Degree, Major** — University Name, YYYY\n\n## Skills\n\n- **Technical:** Skill, Skill, Skill\n- **Tools:** Tool, Tool, Tool\n- **Languages:** English (native), …\n\n## Projects\n\n- **Project name** — one-line description and impact.`;
    steps.push('Used a professional résumé template');
  } else if (WRITING.poem.test(t)) {
    const p = poem(cleanTopic(tt, 'poem'), { depth, seed }); content = `# ${p.title}\n\n${p.body}`;
  } else if (WRITING.story.test(t)) {
    const s = story(cleanTopic(tt, 'story'), { depth, seed }); content = `# ${s.title}\n\n${s.body}`;
  } else if (/meeting notes|agenda/.test(tl)) {
    content = `# Meeting Notes — ${titleCase(topic)}\n\n**Date:** ${new Date().toLocaleDateString()}\n**Attendees:** \n\n## Agenda\n1. Updates\n2. Discussion\n3. Decisions\n4. Next steps\n\n## Notes\n- \n\n## Decisions\n- \n\n## Action items\n| Owner | Task | Due |\n|---|---|---|\n|  |  |  |`;
  } else {
    const r = await essay(topic, depth, signal).catch(() => null);
    if (r) { content = r.md; sources = r.sources; steps.push('Researched the topic on Wikipedia', 'Structured it as a report'); }
    else content = `# ${titleCase(topic)}\n\n*Created with Nova on ${new Date().toLocaleDateString()}.*\n\n## Overview\n\nAdd your content here.\n\n## Details\n\n- Point one\n- Point two\n- Point three\n\n## Summary\n\nWrap-up.`;
  }
  const name = `${slug}.${ext}`;
  const kind = { pdf: 'PDF', docx: 'Word document', xlsx: 'Excel spreadsheet', csv: 'CSV file', md: 'Markdown file', json: 'JSON file', html: 'HTML page', ics: 'calendar invite', txt: 'text file' }[ext];
  const label = /resume|\bcv\b/.test(tl) ? ' — a résumé template' : topic !== 'notes' ? ` on **${titleCase(topic)}**` : '';
  return { md: `Here's your ${kind}${label} — ready to download:\n\n\`\`\`nova-file name="${name}"\n${content}\n\`\`\`\n\nWant me to change the structure, length or tone?`, steps, sources };
}

function tableFor(topic) {
  const t = topic.toLowerCase();
  if (/planet|solar/.test(t)) return 'Planet,Distance from Sun (AU),Diameter (km),Moons,Orbital period (days)\nMercury,0.39,4879,0,88\nVenus,0.72,12104,0,225\nEarth,1.00,12742,1,365\nMars,1.52,6779,2,687\nJupiter,5.20,139820,95,4333\nSaturn,9.58,116460,146,10759\nUranus,19.20,50724,28,30687\nNeptune,30.05,49244,16,60190';
  if (/budget|expense|finance/.test(t)) return 'Category,Planned,Actual,Difference\nHousing,1400,1400,0\nGroceries,450,512,-62\nTransport,250,198,52\nUtilities,180,176,4\nEntertainment,200,245,-45\nSavings,600,600,0\nTotal,3080,3131,-51';
  if (/workout|exercise|gym/.test(t)) return 'Day,Focus,Exercises,Sets x Reps\nMonday,Upper body,Push-ups; Rows; Shoulder press,3x10\nTuesday,Cardio,Run or cycle,30 min\nWednesday,Lower body,Squats; Lunges; Bridges,3x12\nThursday,Core,Plank; Dead bug; Side plank,3x45s\nFriday,Full body,Burpees; Swings; Step-ups,4 rounds\nSaturday,Active,Hike or sport,60 min\nSunday,Rest,Stretching,15 min';
  if (/schedule|timetable|week/.test(t)) return 'Time,Monday,Tuesday,Wednesday,Thursday,Friday\n09:00,Focus work,Focus work,Team sync,Focus work,Planning\n11:00,Meetings,Learning,Focus work,Meetings,Review\n13:00,Lunch,Lunch,Lunch,Lunch,Lunch\n14:00,Projects,Projects,Workshops,Projects,Demos\n16:00,Email,Admin,Email,Admin,Wrap-up';
  if (/grade|student|class/.test(t)) return 'Student,Math,Science,English,History,Average\nAda,95,92,88,90,91.25\nLinus,85,89,92,80,86.5\nGrace,98,96,90,94,94.5\nAlan,78,88,84,86,84';
  if (/inventory|stock|product/.test(t)) return 'SKU,Product,Category,Quantity,Unit price,Value\nNV-001,Wireless mouse,Accessories,42,24.99,1049.58\nNV-002,USB-C hub,Accessories,18,39.99,719.82\nNV-003,Mechanical keyboard,Peripherals,9,89.00,801.00\nNV-004,27" monitor,Displays,5,249.00,1245.00';
  if (/contact/.test(t)) return 'Name,Email,Phone,Company,Notes\nAda Lovelace,ada@example.com,555-0101,Analytical Engines,\nAlan Turing,alan@example.com,555-0102,Bletchley Park,\nGrace Hopper,grace@example.com,555-0103,US Navy,';
  if (/todo|task/.test(t)) return 'Task,Priority,Status,Due\nDefine goals,High,Done,\nDraft plan,High,In progress,\nReview with team,Medium,Not started,\nShip it,High,Not started,';
  return `Item,Description,Value,Notes\n${titleCase(topic)} 1,,,\n${titleCase(topic)} 2,,,\n${titleCase(topic)} 3,,,`;
}

// ---------- knowledge ----------
export async function essay(topic, depth = 2, signal) {
  if (!settings.liveData) return null;
  const page = await bestPage(topic, { signal });
  if (!page) return null;
  const art = await wikiArticle(page.title, { signal });
  if (!art) return null;
  const secs = art.sections.filter((s) => s.text.length > 120);
  const intro = summarize(secs[0]?.text || page.extract, 3).join(' ');
  const body = secs.slice(1, 2 + depth * 2).map((s) => `## ${s.title}\n\n${summarize(s.text, depth >= 2 ? 3 : 2).join(' ')}`).join('\n\n');
  return {
    md: `# ${art.title}\n\n${intro}\n\n${body}\n\n## Conclusion\n\n${art.title} ${pick(['remains a rich and fascinating subject', 'continues to shape how we understand the world', 'is a topic with far more depth than a single report can cover'])}. ${summarize(page.extract, 1)[0] || ''}\n\n---\n*Source: Wikipedia — "${art.title}" (${art.url}), CC BY-SA 4.0.*`,
    sources: [{ title: art.title, url: art.url, snippet: truncate(page.extract, 160), site: 'wikipedia.org', thumb: art.thumb }],
  };
}

// "Black hole" → "black holes" style casing when the article itself uses lowercase.
export function natural(page) {
  const lower = page.title.charAt(0).toLowerCase() + page.title.slice(1);
  return page.extract && page.extract.includes(lower) && lower !== page.title ? lower : page.title;
}

export async function knowledge(query, depth, signal) {
  if (!settings.liveData) return null;
  const topic = extractTopic(query);
  let page = null;
  try { page = await bestPage(topic, { signal }); } catch { return null; }
  if (!page && topic !== query) { try { page = (await lookup(query, { n: 1, signal }))[0]; } catch {} }
  if (!page) return null;
  const qWords = (topic.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
  const tWords = (page.title + ' ' + page.extract.slice(0, 400)).toLowerCase();
  if (qWords.length && !qWords.some((w) => tWords.includes(w))) return null;
  const ss = sentences(page.extract);
  const n = [2, 3, 4, 5][depth] ?? 3;
  const simple = /like i'?m (5|10|five|ten)|simpl|eli5|for kids/i.test(query);
  let md = `**${page.title}**${page.description && !/^(Wikimedia|Topics)/.test(page.description) ? ` — ${page.description}` : ''}\n\n${ss.slice(0, n).join(' ')}`;
  if (simple) md = `Here's the simple version: ${ss[0]}\n\nThink of it like this — ${ss.slice(1, 3).join(' ').toLowerCase() || ss[0].toLowerCase()}`;
  if (page.thumb && depth >= 1) md = `![${page.title}](${page.thumb})\n\n` + md;
  if (depth >= 2 && ss.length > n + 1) md += `\n\n### Key points\n${ss.slice(n, n + (depth >= 3 ? 5 : 3)).map((s) => `- ${s}`).join('\n')}`;
  md += `\n\n*Source: [Wikipedia — ${page.title}](${page.url})*`;
  const related = depth >= 2 ? (await lookup(page.title, { n: 4, signal }).catch(() => [])).filter((p) => p.title !== page.title).slice(0, 3) : [];
  return {
    md,
    steps: [`Identified the topic: "${topic}"`, `Searched Wikipedia → "${page.title}"`, `Summarized ${Math.min(n, ss.length)} key sentences`],
    sources: [{ title: page.title, url: page.url, snippet: truncate(page.extract, 180), site: 'wikipedia.org', thumb: page.thumb }],
    followups: [`How does ${natural(page)} work?`, `What is the history of ${natural(page)}?`, ...related.map((r) => `Tell me about ${natural(r)}`)].slice(0, 3),
  };
}

// ---------- attachments ----------
async function attachmentAnswer(t, atts, depth) {
  const parts = [];
  const steps = [];
  for (const a of atts) {
    if (a.kind === 'image') {
      const s = a.stats;
      steps.push(`Analyzed image ${a.name} on-device`);
      if (!s) { parts.push(`I received **${a.name}**.`); continue; }
      const orient = s.width > s.height * 1.15 ? 'landscape' : s.height > s.width * 1.15 ? 'portrait' : 'square';
      const tone = s.brightness > 0.62 ? 'bright' : s.brightness < 0.32 ? 'dark, moody' : 'balanced';
      const temp = s.warmth > 18 ? 'warm' : s.warmth < -18 ? 'cool' : 'neutral';
      const vivid = s.saturation > 0.45 ? 'vivid' : s.saturation < 0.18 ? 'muted, nearly monochrome' : 'natural';
      parts.push(`**${a.name}** — a ${s.width}×${s.height} ${orient} image with a ${tone}, ${temp}-toned and ${vivid} look.\n\n**Dominant colors:** ${s.colors.map((c) => `\`${c}\``).join(' ')}`);
    } else if (a.kind === 'video') {
      steps.push(`Extracted ${a.frames?.length || 0} key frames from ${a.name}`);
      parts.push(`**${a.name}** — a ${Math.round(a.duration || 0)}-second ${a.width}×${a.height} video. Here are key frames I extracted:\n\n${(a.frames || []).map((f, i) => `![Frame ${i + 1}](${f})`).join(' ')}`);
    } else if (a.kind === 'audio') {
      if (a.transcript) { steps.push('Transcribed voice message'); parts.push(`🎙️ Voice message transcript: *"${a.transcript}"*`); }
      else parts.push(`🎙️ I received an audio clip (**${a.name}**, ${formatBytes(a.size)}). I couldn't transcribe it on-device — your browser's speech recognition captures transcripts while you record voice messages with the mic button.`);
    } else if (a.text) {
      const isCSV = /\.(csv|tsv|xlsx)$/i.test(a.name);
      if (isCSV) {
        const rows = a.text.trim().split('\n').map((l) => l.split(/,|\t/));
        const head = rows[0] || [];
        const body = rows.slice(1).filter((r) => r.length > 1);
        const numericCols = head.map((_, i) => body.length && body.every((r) => r[i] === undefined || r[i] === '' || !isNaN(parseFloat(r[i])))).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        let md = `**${a.name}** — ${body.length} rows × ${head.length} columns.\n\n| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${body.slice(0, 5).map((r) => `| ${head.map((_, i) => r[i] ?? '').join(' | ')} |`).join('\n')}`;
        if (numericCols.length) {
          md += `\n\n**Numeric columns**\n\n| Column | Min | Max | Mean | Sum |\n|---|---|---|---|---|\n${numericCols.map((i) => { const v = body.map((r) => parseFloat(r[i])).filter((x) => !isNaN(x)); const sum = v.reduce((x, y) => x + y, 0); return `| ${head[i]} | ${fmt(Math.min(...v))} | ${fmt(Math.max(...v))} | ${fmt(Math.round((sum / v.length) * 100) / 100)} | ${fmt(sum)} |`; }).join('\n')}`;
          const labelCol = head.findIndex((_, i) => !numericCols.includes(i));
          const vc = numericCols[0];
          if (body.length >= 2 && body.length <= 40) {
            md += `\n\n\`\`\`nova-chart\n${JSON.stringify({ type: body.length > 12 ? 'line' : 'bar', title: `${head[vc]}${labelCol >= 0 ? ' by ' + head[labelCol] : ''}`, labels: body.map((r, k) => (labelCol >= 0 ? r[labelCol] : String(k + 1))), datasets: [{ label: head[vc], data: body.map((r) => parseFloat(r[vc]) || 0) }] })}\n\`\`\``;
          }
        }
        steps.push(`Parsed ${a.name} as a table`, 'Computed column statistics');
        parts.push(md);
      } else {
        const wc = (a.text.match(/\S+/g) || []).length;
        const ask = t.trim() && !/^(summari[sz]e|tl;?dr|what('?s| is) (this|in this)|read this|analy[sz]e)/i.test(t.trim());
        if (ask) {
          const rel = relevant(a.text, t, depth >= 2 ? 5 : 3);
          steps.push(`Searched ${a.name} for passages relevant to your question`);
          parts.push(rel.length ? `From **${a.name}**, the most relevant passages are:\n\n${rel.map((s) => `> ${s}`).join('\n>\n')}` : `I couldn't find passages in **${a.name}** that directly match your question. Here's its summary instead:\n\n${summarize(a.text, 4).map((s) => `- ${s}`).join('\n')}`);
        } else {
          const sum = summarize(a.text, depth >= 2 ? 5 : 3);
          steps.push(`Read ${a.name} (${wc.toLocaleString()} words)`, 'Ranked sentences by keyword importance');
          parts.push(`**${a.name}** — ${wc.toLocaleString()} words${a.pages ? `, ${a.pages} pages` : ''} · ~${Math.max(1, Math.round(wc / 230))} min read\n\n**Summary**\n${sum.map((s) => `- ${s}`).join('\n')}\n\n**Key terms:** ${keyTerms(a.text).map((k) => `\`${k}\``).join(' ')}`);
        }
      }
    } else {
      parts.push(`I received **${a.name}** (${describeAttachment(a)}). ${a.note || ''}`);
    }
  }
  const visual = atts.some((a) => a.kind === 'image' || a.kind === 'video');
  if (visual) parts.push(`> 💡 On-device mode can read colors, sizes and frames but can't recognize objects or text in pictures. **Connect Claude in Settings → Engine** for full image and video understanding.`);
  return { md: parts.join('\n\n---\n\n'), steps };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function localAnswer(ctx) {
  const { model, signal, attachments = [], history = [] } = ctx;
  let t = (ctx.text || '').trim();
  const depth = ctx.depth ?? model.depth;
  const seed = ctx.seed || 0;

  // Voice-message transcripts act as the prompt when the text box was empty.
  const transcript = attachments.filter((a) => a.kind === 'audio' && a.transcript).map((a) => a.transcript).join(' ');
  if (!t && transcript) t = transcript;

  // Follow-up resolution ("another one", "in javascript", "make it longer")
  const prevUser = [...history].reverse().find((m) => m.role === 'user' && m.text)?.text || '';
  if (prevUser && /^(another|again|one more|more|different one|try again|another one|regenerate)[\s!.?]*$/i.test(t)) t = prevUser;
  const langSwitch = /^(?:now |can you do it |do it |write it |same )?(?:in|using|with) ([\w#+]+)[\s!.?]*$/i.exec(t);
  if (prevUser && langSwitch) t = `${prevUser} in ${langSwitch[1]}`;
  if (prevUser && /^(make it |write it )?(longer|shorter|more detailed|simpler)[\s!.?]*$/i.test(t)) t = prevUser + (/(shorter|simpler)/i.test(t) ? ' (short)' : ' (detailed)');
  const effDepth = /\(short\)/.test(t) ? Math.max(0, depth - 1) : /\(detailed\)/.test(t) ? Math.min(3, depth + 1) : depth;
  t = t.replace(/\s*\((short|detailed)\)$/, '');

  const realAtts = attachments.filter((a) => !(a.kind === 'audio' && a.transcript && !a.text));
  if (realAtts.length && (!t || /\b(this|these|attached|file|image|photo|picture|document|pdf|video|summari[sz]e|analy[sz]e|describe|what('?s| is) in)\b/i.test(t) || t.length < 60)) {
    return attachmentAnswer(t, realAtts, effDepth);
  }
  if (!t) return { md: "I'm here! What would you like to do?" };

  const mem = memoryIntent(t);
  if (mem) return { md: mem, steps: ['Updated memory'] };

  const st = smalltalk(t, model);
  if (st) return { md: st, steps: ['Recognized a conversational message'] };

  const math = mathIntent(t);
  if (math) return math;

  try {
    const conv = await conversionIntent(t, signal);
    if (conv) return conv;
    const wx = await weatherIntent(t, signal);
    if (wx) return wx;
    const tm = await timeIntent(t, signal);
    if (tm) return tm;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
  }

  const w = widgetIntent(t);
  if (w) {
    return { md: `Here's an interactive **${w.title.toLowerCase()}** — try it right here:\n\n\`\`\`nova-ui title="${w.title}" widget="${w.id}"\n\n\`\`\``, steps: ['Detected a request for an interactive tool', `Built the "${w.title}" interface`] };
  }

  const code = codeIntent(t, effDepth);
  if (code) return code;

  try {
    const file = await fileIntent(t, effDepth, seed, signal);
    if (file) return file;
    const plan = await planIntent(t, effDepth, signal);
    if (plan) return plan;
  } catch (e) { if (e.name === 'AbortError') throw e; }

  const wr = await writingIntent(t, effDepth, seed);
  if (wr) return wr;

  if (/^(translate|how do you say|what is .+ in (spanish|french|german|italian|japanese|chinese|korean|portuguese|arabic|hindi|russian))/i.test(t)) {
    return { md: `Translation needs a full language model, which isn't available in on-device mode. **Connect Claude in Settings → Engine** and Nova can translate between dozens of languages — with tone and nuance intact.` };
  }

  if (/^(summari[sz]e|tl;?dr|shorten|condense)[:\s]/i.test(t) && t.length > 200) {
    const text = t.replace(/^(summari[sz]e|tl;?dr|shorten|condense)[:\s]+/i, '');
    return { md: `**Summary**\n\n${summarize(text, effDepth >= 2 ? 4 : 3).map((s) => `- ${s}`).join('\n')}\n\n**Key terms:** ${keyTerms(text, 6).map((k) => `\`${k}\``).join(' ')}`, steps: ['Extractive summary by sentence importance'] };
  }

  if (/\b(essay|article|report|blog post|overview)\b/i.test(t) && /\b(write|create|make|draft|give me)\b/i.test(t)) {
    const topic = cleanTopic(t, 'essay|article|report|blog post|overview');
    const e = await essay(topic, effDepth, signal).catch(() => null);
    if (e) return { md: e.md.replace(/^# /, '## '), steps: ['Researched the topic on Wikipedia', 'Organized into an introduction, sections and conclusion'], sources: e.sources };
  }

  try {
    const k = await knowledge(t, effDepth, signal);
    if (k) return k;
  } catch (e) { if (e.name === 'AbortError') throw e; }

  const r = rng(hash(t));
  return {
    md: `${pick(["That's a great question.", 'Interesting!', 'Good one.'], r)} I'm running in **on-device mode**, which is great at facts, math, conversions, weather, code templates, files, images and interactive tools — but open-ended reasoning like this needs a full language model.\n\n**Here's what you can do:**\n- Connect Claude in **Settings → Engine** to unlock full intelligence on every Nova model.\n- Try **AI Mode** from the **+** menu to search for sources on this topic.\n- Or rephrase as a factual question, like *"What is …?"* or *"Explain …"*.`,
    steps: ['No on-device skill matched this request'],
    followups: [`Search the web for "${truncate(t, 60)}"`],
  };
}
