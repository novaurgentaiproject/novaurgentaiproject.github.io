// Widget Studio designer: turns a plain-English request into a widget spec
// (see widgetkit.js) on-device — Nova composes its own widgets from building
// blocks instead of picking from a fixed list. It can also edit the last widget.
import { titleCase, capitalize, truncate } from '../util.js';
import { wordsToExpr, parseConversion, convertUnits, fmt } from '../engines/mathx.js';
import { CURRENCIES, fxRate, geocode, bestPage, wikiArticle, wikiImages, lookup } from '../engines/knowledge.js';
import { makeQuiz } from './study.js';
import { normalizeSpec } from './widgetkit.js';
import { explorerWidget, matchWidget } from './genui.js';
import { settings } from '../state.js';

const MAKE = /\b(make|build|create|design|generate|give me|set up|setup|i (?:want|need)|can you make|could you make|add)\b/i;
const NOUNS = /\b(widgets?|track(?:s|ing)?|tracker|counter|checklist|check list|dashboard|scoreboard|score ?keeper|poll|picker|countdown|timer|converter|calculator|planner|logger|log|journal|diary|flashcards?|quiz|tally|randomi[sz]er|spinner|wheel|board|clock|graph|plot)\b/i;

export function isWidgetRequest(t) {
  if (/^\s*track (my|how|the)\b/i.test(t)) return true;
  return MAKE.test(t) && NOUNS.test(t);
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function nthWeekday(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  const shift = (weekday - d.getDay() + 7) % 7;
  return new Date(year, month, 1 + shift + (n - 1) * 7);
}

/** Parse a date/time phrase. Returns { date, hasTime, matched } or null. */
export function parseWhen(text) {
  const t = text.toLowerCase();
  const now = new Date();
  let date = null, matched = '', hasTime = false;
  const future = (d) => { if (d < now && !/\b\d{4}\b/.test(matched)) d.setFullYear(d.getFullYear() + 1); return d; };
  let m;
  if ((m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t))) { date = new Date(+m[1], +m[2] - 1, +m[3]); matched = m[0]; }
  else if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) { const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear(); date = new Date(y, +m[1] - 1, +m[2]); matched = m[0]; if (!m[3]) future(date); }
  else if ((m = new RegExp(`\\b(${MONTHS.map((x) => x.slice(0, 3)).join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`).exec(t))) {
    date = new Date(m[3] ? +m[3] : now.getFullYear(), MONTHS.findIndex((x) => x.startsWith(m[1])), +m[2]); matched = m[0]; if (!m[3]) future(date);
  } else if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.map((x) => x.slice(0, 3)).join('|')})[a-z]*(?:,?\\s+(\\d{4}))?`).exec(t))) {
    date = new Date(m[3] ? +m[3] : now.getFullYear(), MONTHS.findIndex((x) => x.startsWith(m[2])), +m[1]); matched = m[0]; if (!m[3]) future(date);
  } else if ((m = /\bin (\d+|a|an|one|two|three) (day|week|month|year)s?\b/.exec(t))) {
    const n = { a: 1, an: 1, one: 1, two: 2, three: 3 }[m[1]] || +m[1];
    date = new Date(now); matched = m[0];
    if (m[2] === 'day') date.setDate(date.getDate() + n); else if (m[2] === 'week') date.setDate(date.getDate() + 7 * n); else if (m[2] === 'month') date.setMonth(date.getMonth() + n); else date.setFullYear(date.getFullYear() + n);
  } else if (/\btomorrow\b/.test(t)) { date = new Date(now); date.setDate(date.getDate() + 1); matched = 'tomorrow'; }
  else if ((m = new RegExp(`\\b(?:next |this )?(${WEEKDAYS.join('|')})\\b`).exec(t))) {
    const wd = WEEKDAYS.indexOf(m[1]); date = new Date(now); date.setDate(date.getDate() + (((wd - now.getDay() + 7) % 7) || 7)); matched = m[0];
  } else {
    const y = now.getFullYear();
    const hol = [
      [/christmas|xmas/, () => new Date(y, 11, 25)], [/new year/, () => new Date(y + 1, 0, 1)], [/halloween/, () => new Date(y, 9, 31)],
      [/valentine/, () => new Date(y, 1, 14)], [/independence day|4th of july|fourth of july/, () => new Date(y, 6, 4)],
      [/thanksgiving/, () => nthWeekday(y, 10, 4, 4)], [/mother'?s day/, () => nthWeekday(y, 4, 0, 2)], [/father'?s day/, () => nthWeekday(y, 5, 0, 3)],
      [/summer/, () => new Date(y, 5, 21)], [/winter/, () => new Date(y, 11, 21)], [/spring/, () => new Date(y, 2, 20)],
    ];
    for (const [re, f] of hol) if ((m = re.exec(t))) { date = f(); matched = m[0]; if (date < now) { const d2 = new Date(date); d2.setFullYear(y + 1); date = re.source.includes('thanksgiving') ? nthWeekday(y + 1, 10, 4, 4) : d2; } break; }
  }
  if (!date || isNaN(date)) return null;
  if ((m = /\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t))) {
    let hr = +m[1]; if (m[3] === 'pm' && hr < 12) hr += 12; if (m[3] === 'am' && hr === 12) hr = 0;
    date.setHours(hr, +(m[2] || 0), 0, 0); hasTime = true;
  }
  return { date, hasTime, matched };
}

function listFrom(text) {
  const m = /^.*(?:\bwith\b|\bincluding\b|\bfor\b|\bbetween\b|\bfrom\b|\boptions?\b|\bitems?\b|:)\s*:?\s*(.+)$/i.exec(text);
  if (!m) return null;
  let part = m[1].replace(/[.?!]+$/, '');
  if (!/,|\bor\b|\band\b|\//.test(part)) return null;
  const items = part.split(/\s*(?:,|\/|;|\bor\b|\band\b)\s*/i).map((s) => s.replace(/^(?:a|an|the|some)\s+/i, '').trim()).filter((s) => s && s.length < 60);
  return items.length >= 2 ? items.slice(0, 20).map((s) => capitalize(s)) : null;
}

function goalFrom(text) {
  const m = /\bgoal (?:of |is |to )?(\d[\d,.]*)/i.exec(text) || /(\d[\d,.]*)\s*(?:[a-z]+\s+)?(?:a|per|each|every)\s+(?:day|week)\b/i.exec(text) || /\btarget (?:of )?(\d[\d,.]*)/i.exec(text) || /\blimit (?:of )?(\d[\d,.]*)/i.exec(text);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

function moneyFrom(text) {
  const m = /[$€£¥]\s?(\d[\d,.]*)|(\d[\d,.]*)\s?(?:dollars|usd|euros?|eur|pounds|gbp)\b/i.exec(text);
  return m ? parseFloat((m[1] || m[2]).replace(/,/g, '')) : null;
}

function currencyCode(text) {
  if (/€|euro/i.test(text)) return 'EUR';
  if (/£|pound|gbp/i.test(text)) return 'GBP';
  if (/¥|yen/i.test(text)) return 'JPY';
  if (/₹|rupee/i.test(text)) return 'INR';
  return 'USD';
}

const id = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').replace(/^(\d)/, '_$1') || 'x';

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------
const TRACKERS = [
  { re: /\bwater|hydrat/, title: 'Water tracker', icon: 'drop', unit: 'glasses', goal: 8, step: 1, quick: [2], label: 'Glasses today' },
  { re: /\bcoffee|caffeine|espresso/, title: 'Coffee tracker', icon: 'cup', unit: 'cups', goal: 3, limit: true, step: 1, label: 'Cups today' },
  { re: /\btea\b/, title: 'Tea tracker', icon: 'cup', unit: 'cups', goal: 4, step: 1, label: 'Cups today' },
  { re: /\bsteps?\b|\bwalking\b/, title: 'Step tracker', icon: 'bolt', unit: 'steps', goal: 10000, step: 500, quick: [1000, 2500], label: 'Steps today' },
  { re: /push.?ups?|sit.?ups?|squats?|burpees?|pull.?ups?|crunches|lunges/, title: null, icon: 'flame', unit: 'reps', goal: 100, step: 5, quick: [10, 20], label: 'Reps today' },
  { re: /\bpages?\b|\breading\b/, title: 'Reading tracker', icon: 'book', unit: 'pages', goal: 30, step: 5, quick: [10], label: 'Pages today' },
  { re: /meditat|mindful|breath/, title: 'Meditation tracker', icon: 'leaf', unit: 'minutes', goal: 10, step: 5, quick: [10], label: 'Minutes today' },
  { re: /\bstudy|studying|homework|practi[cs]e|piano|guitar|violin|coding/, title: null, icon: 'book', unit: 'minutes', goal: 60, step: 15, quick: [30], label: 'Minutes today' },
  { re: /fruits?|veggies|vegetables|servings/, title: 'Fruit & veg tracker', icon: 'leaf', unit: 'servings', goal: 5, step: 1, label: 'Servings today' },
  { re: /protein/, title: 'Protein tracker', icon: 'flame', unit: 'g', goal: 100, step: 10, quick: [25], label: 'Grams today' },
  { re: /screen time|phone time|social media/, title: 'Screen time tracker', icon: 'clock', unit: 'minutes', goal: 120, limit: true, step: 15, quick: [30], label: 'Minutes today' },
  { re: /cigarettes?|smok|vap/, title: 'Smoking tracker', icon: 'target', unit: 'today', goal: 5, limit: true, step: 1, label: 'Count today' },
  { re: /\bsugar|soda|snacks?|junk food/, title: null, icon: 'target', unit: 'today', goal: 2, limit: true, step: 1, label: 'Count today' },
];

function trackerRecipe(t) {
  if (!/\b(track(?:s|er|ing)?|count(?:s|er)?|logs?|logger|tally|how (?:much|many))\b/i.test(t)) return null;
  const tl = t.toLowerCase();
  const goal = goalFrom(t);
  if (/\b(spend|spending|expenses?|money|budget|purchases?|costs?)\b/.test(tl)) {
    const budget = goal || moneyFrom(t);
    const period = /\bweek/.test(tl) ? 'week' : /\bmonth/.test(tl) ? 'month' : budget ? 'month' : 'today';
    const cur = currencyCode(t);
    return {
      spec: { title: 'Spending tracker', subtitle: budget ? `Budget ${fmt(budget)} ${cur} per ${period === 'today' ? 'day' : period}` : 'Log purchases and watch your totals', icon: 'coin', currency: cur, components: [
        { type: 'log', id: 'spend', label: 'Purchases', fields: [{ id: 'amount', type: 'number', label: 'Amount' }, { id: 'note', type: 'text', label: 'What for?' }], sum: 'amount', format: 'currency', goal: budget || undefined, period, limit: true },
        { type: 'history', of: 'spend', field: 'amount', label: 'Daily spending · last 7 days' },
      ] },
      notes: ['Log each purchase with an amount and note', 'Totals for today, the last 7 days and all time', budget ? `A budget bar for ${fmt(budget)} per ${period}` : 'Add a budget anytime — just ask', '7-day spending chart'],
    };
  }
  if (/\bweight\b/.test(tl)) {
    return { spec: { title: 'Weight log', subtitle: 'Track your progress over time', icon: 'chart', components: [
      { type: 'log', id: 'weight', label: 'Weigh-ins', fields: [{ id: 'kg', type: 'number', label: /lb|pound/.test(tl) ? 'Weight (lb)' : 'Weight' }, { id: 'note', type: 'text', label: 'Note' }], sum: null },
      { type: 'stat', label: 'Latest', formula: 'weight_last', decimals: 1 }, { type: 'stat', label: 'Entries', formula: 'weight_count', format: 'int' },
    ] }, notes: ['A log for each weigh-in with optional notes', 'Latest value and number of entries'] };
  }
  if (/\bsleep\b/.test(tl)) {
    return { spec: { title: 'Sleep tracker', subtitle: 'Hours and quality, night by night', icon: 'moon', components: [
      { type: 'counter', id: 'sleep', label: 'Hours slept last night', unit: 'hours', goal: goal || 8, step: 0.5, quick: [1], daily: true },
      { type: 'rating', id: 'quality', label: 'Sleep quality', max: 5, labels: ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'] },
      { type: 'history', of: 'sleep', label: 'Hours · last 7 days', goal: goal || 8 },
    ] }, notes: ['Daily hours counter with an 8-hour goal', 'A 1–5 quality rating', 'A 7-day chart'] };
  }
  if (/\bmood|feelings?|emotions?|how i feel\b/.test(tl)) {
    return { spec: { title: 'Mood tracker', subtitle: 'One tap a day', icon: 'heart', components: [
      { type: 'rating', id: 'mood', label: 'How are you feeling today?', max: 5, shape: 'dot', labels: ['Awful', 'Low', 'Okay', 'Good', 'Great'] },
      { type: 'log', id: 'journal', label: 'What\'s on your mind?', fields: [{ id: 'note', type: 'text', label: 'Write a note' }] },
    ] }, notes: ['A daily 1–5 mood rating with a week view', 'Quick journal notes'] };
  }
  if (/\b(workouts?|exercise|gym|training|runs?|running|jogs?|cycling|rides?|swims?|miles|km)\b/.test(tl) && !/push|sit|squat|pull|burpee/.test(tl)) {
    const dist = /\b(runs?|running|jog|cycling|rides?|swims?|miles|km)\b/.test(tl);
    return { spec: { title: dist ? 'Distance tracker' : 'Workout tracker', subtitle: dist ? 'Every run and ride, added up' : 'Aim for 150 active minutes a week', icon: 'flame', components: [
      { type: 'log', id: 'workouts', label: dist ? 'Activities' : 'Workouts', fields: dist ? [{ id: 'dist', type: 'number', label: /mile/.test(tl) ? 'Miles' : 'Km' }, { id: 'note', type: 'text', label: 'Route / note' }] : [{ id: 'what', type: 'text', label: 'Activity' }, { id: 'mins', type: 'number', label: 'Minutes' }], sum: dist ? 'dist' : 'mins', goal: goal || (dist ? 20 : 150), period: 'week', suffix: dist ? (/mile/.test(tl) ? ' mi' : ' km') : ' min' },
      { type: 'history', of: 'workouts', field: dist ? 'dist' : 'mins', label: 'Last 7 days' },
    ] }, notes: ['Log each session', `A weekly goal of ${goal || (dist ? 20 : 150)} ${dist ? (/mile/.test(tl) ? 'miles' : 'km') : 'minutes'}`, '7-day chart'] };
  }
  if (/\b(calories|kcal)\b/.test(tl)) {
    return { spec: { title: 'Calorie log', icon: 'flame', components: [
      { type: 'log', id: 'food', label: 'Meals & snacks', fields: [{ id: 'what', type: 'text', label: 'Food' }, { id: 'kcal', type: 'number', label: 'kcal' }], sum: 'kcal', goal: goal || 2000, period: 'today', suffix: ' kcal' },
      { type: 'history', of: 'food', field: 'kcal', label: 'Calories · last 7 days' },
    ] }, notes: ['Log foods with calories', `A daily target of ${goal || 2000} kcal`, '7-day chart'] };
  }
  const tr = TRACKERS.find((x) => x.re.test(tl));
  let subject = (/\b(?:tracks?|counts?|logs?|tally)\s+(?:my\s+|how much\s+|how many\s+|the\s+)?([a-z][a-z \-']{1,30}?)(?:\s+(?:i|per|a|each|every|with|for|that|daily|today)\b|[.?!]|$)/i.exec(t)?.[1]
    || /\b([a-z][a-z\-']{2,24})\s+(?:tracker|counter|log)\b/i.exec(t)?.[1] || '').trim();
  subject = subject.replace(/\b(widget|tracker|counter|a|an|the|my|daily)\b/gi, '').trim();
  if (!tr && !subject) return null;
  const base = tr || { title: null, icon: 'target', unit: subject.split(' ').pop(), goal: null, step: 1, label: `${capitalize(subject)} today` };
  const g = goal ?? base.goal;
  const name = base.title || `${titleCase(subject || (tr ? tr.re.exec(tl)[0] : 'count'))} tracker`;
  const cid = id(subject || base.unit || 'count');
  return {
    spec: { title: name, subtitle: g ? `${base.limit ? 'Daily limit' : 'Daily goal'}: ${g.toLocaleString()} ${base.unit}` : 'Tap + whenever it happens', icon: base.icon, components: [
      { type: 'counter', id: cid, label: base.label || `${capitalize(base.unit)} today`, unit: base.unit, goal: g || undefined, limit: base.limit || undefined, step: base.step, quick: base.quick, daily: true },
      { type: 'history', of: cid, label: 'Last 7 days', goal: g || undefined },
      ...(g ? [{ type: 'stat', label: base.limit ? 'Left before limit' : 'Remaining today', formula: `max(0, ${g} - ${cid})`, format: 'int', suffix: ` ${base.unit}` }, { type: 'stat', label: 'Status', formula: base.limit ? `${cid} > ${g} ? 'Over the limit' : 'On track'` : `${cid} >= ${g} ? 'Goal reached' : 'Keep going'`, format: 'text' }] : []),
    ] },
    notes: [`A daily counter${g ? ` with a ${base.limit ? 'limit' : 'goal'} of ${g.toLocaleString()} ${base.unit}` : ''} that resets each day`, 'A progress ring and quick-add buttons', 'A 7-day history chart', ...(g ? ['Live stats for what\'s left'] : [])],
  };
}

const CHECKLISTS = [
  { re: /\bpack|packing|trip|travel|vacation|holiday/, title: 'Packing list', icon: 'check', items: ['Passport or ID', 'Phone charger', 'Toiletries', 'Medications', 'Clothes for each day', 'Comfortable shoes', 'Headphones', 'Travel adapter', 'Snacks for the journey', 'Copies of bookings'] },
  { re: /grocer|shopping|supermarket/, title: 'Shopping list', icon: 'list', items: ['Milk', 'Eggs', 'Bread', 'Fruit', 'Vegetables', 'Rice or pasta', 'Coffee or tea'] },
  { re: /morning/, title: 'Morning routine', icon: 'check', daily: true, items: ['Drink a glass of water', 'Stretch for 5 minutes', 'Make the bed', 'Healthy breakfast', 'Review today\'s plan', 'Get some daylight'] },
  { re: /night|evening|bedtime/, title: 'Evening routine', icon: 'moon', daily: true, items: ['Tidy up for 10 minutes', 'Prepare tomorrow\'s outfit', 'Screens off 30 minutes before bed', 'Read or journal', 'Lights out on time'] },
  { re: /clean|chores?/, title: 'Cleaning checklist', icon: 'check', items: ['Dishes', 'Wipe kitchen counters', 'Vacuum floors', 'Clean bathroom', 'Laundry', 'Take out trash', 'Change bed sheets'] },
  { re: /\bmov(e|ing)\b/, title: 'Moving checklist', icon: 'check', items: ['Book movers or a van', 'Collect boxes and tape', 'Update address', 'Set up internet', 'Transfer utilities', 'Pack room by room', 'Label boxes', 'Final walkthrough'] },
  { re: /camp/, title: 'Camping checklist', icon: 'leaf', items: ['Tent and stakes', 'Sleeping bag', 'Headlamp', 'Water and filter', 'Stove and fuel', 'First-aid kit', 'Warm layers', 'Food and snacks'] },
  { re: /party|birthday|celebration/, title: 'Party planner', icon: 'star', items: ['Set a date and budget', 'Send invitations', 'Plan the menu', 'Decorations', 'Music playlist', 'Order the cake', 'Buy drinks and snacks'] },
  { re: /exam|test|study/, title: 'Study checklist', icon: 'book', items: ['Gather notes and materials', 'Make a revision schedule', 'Review chapter summaries', 'Practice questions', 'Make flashcards', 'Do a timed practice test', 'Review mistakes'] },
  { re: /job|interview|resume|career/, title: 'Job search tracker', icon: 'target', items: ['Update résumé', 'Refresh LinkedIn profile', 'Shortlist 10 companies', 'Tailor cover letters', 'Send applications', 'Prepare interview stories', 'Follow up after interviews'] },
  { re: /wedding/, title: 'Wedding checklist', icon: 'heart', items: ['Set the budget', 'Choose the venue', 'Guest list', 'Book photographer', 'Send invitations', 'Choose outfits', 'Plan the menu', 'Music and DJ'] },
  { re: /christmas|holiday shopping|gifts?/, title: 'Gift list', icon: 'star', items: ['Family', 'Friends', 'Coworkers', 'Wrapping paper', 'Cards'] },
];

function checklistRecipe(t) {
  if (!/\b(check ?list|to-?do|todo|list|routine|tasks?|planner|packing)\b/i.test(t)) return null;
  if (/\bplaylist\b/i.test(t)) return null;
  const tl = t.toLowerCase();
  const preset = CHECKLISTS.find((x) => x.re.test(tl));
  const items = listFrom(t);
  if (!preset && !items && !/\b(to-?do|todo|tasks?)\b/i.test(tl)) return null;
  const title = preset?.title || (/(to-?do|todo|tasks?)/i.test(tl) ? 'To-do list' : 'Checklist');
  const daily = !!(preset?.daily || /\b(daily|every day|each day|routine)\b/i.test(tl));
  return {
    spec: { title, subtitle: daily ? 'Resets every day' : 'Tick things off as you go', icon: preset?.icon || 'check', components: [
      { type: 'checklist', id: 'items', label: title, items: items || preset?.items || ['First task', 'Second task'], daily },
    ] },
    notes: [`${(items || preset?.items || []).length} starter items you can edit, remove or add to`, 'A progress bar', daily ? 'Resets automatically each day' : 'Your ticks are saved'],
  };
}

function countdownRecipe(t) {
  if (!/\b(countdown|count down|days (?:until|till|to|left)|time (?:until|till|left)|how long until)\b/i.test(t)) return null;
  const w = parseWhen(t);
  const after = /(?:countdown|count down|until|till|to)\s+(?:my\s+|the\s+|our\s+)?(.+)$/i.exec(t)?.[1] || '';
  let label = after.replace(w?.matched ? new RegExp(w.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /$^/, '').replace(/\b(on|at|in|is|widget|timer|countdown)\b/gi, ' ').replace(/\bat \d{1,2}(:\d{2})?\s*(am|pm)?/i, ' ').replace(/[.?!]+$/, '').replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 3; k++) label = label.replace(/^(to|until|till|for|my|the|our)(\s+|$)/i, '').trim();
  if (!label && w) label = capitalize(w.matched);
  if (!w) return null;
  return {
    spec: { title: `Countdown${label ? ': ' + titleCase(truncate(label, 40)) : ''}`, icon: 'calendar', components: [
      { type: 'countdown', label: titleCase(label || 'The big day'), to: w.date.toISOString(), time: w.hasTime },
    ] },
    notes: [`Counts down to ${w.date.toLocaleDateString(undefined, { dateStyle: 'full' })}${w.hasTime ? ' at ' + w.date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}`, 'Days, hours, minutes and seconds — updated live'],
  };
}

function timerRecipe(t) {
  const m = /(\d+(?:\.\d+)?)\s*(?:-|\s)?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b[^.]*?\btimer\b|\btimer\b[^.]*?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1] || m[3]), u = (m[2] || m[4]).toLowerCase();
  const mins = /^h/.test(u) ? n * 60 : /^s/.test(u) ? n / 60 : n;
  const noun = /\b([a-z]{3,})\s+timer\b/i.exec(t)?.[1];
  const what = (/\bfor\s+(?:my\s+|the\s+)?([a-z][a-z ]{1,24})/i.exec(t)?.[1]?.replace(/\b(widget|timer)\b/gi, '').trim()) || (noun && !/^(minutes?|mins?|seconds?|secs?|hours?|hrs?|second|minute|hour|countdown|a|the)$/i.test(noun) ? noun : '');
  const label = what ? `${capitalize(what)} timer` : `${n} ${u.replace(/^(\w).*$/, (x) => ({ s: 'second', m: 'minute', h: 'hour' })[x[0]] || x)}${n === 1 ? '' : 's'} timer`;
  const presets = [mins, ...[1, 5, 10, 25].filter((x) => Math.abs(x - mins) > 0.01)].slice(0, 4);
  return { spec: { title: titleCase(label), icon: 'clock', components: [{ type: 'timer', label, presets }] }, notes: [`Starts at ${mins >= 1 ? +mins.toFixed(2) + ' minutes' : Math.round(mins * 60) + ' seconds'}`, 'Quick presets, pause and reset', 'Chimes when time is up'] };
}

function randomRecipe(t) {
  const tl = t.toLowerCase();
  if (!/\b(random|pick|picker|choose|chooser|decide|decision|decider|spin|wheel|coin|dice|die|yes or no|8.?ball|lottery|draw names|raffle)\b/.test(tl)) return null;
  if (/\bcoin\b/.test(tl)) return { spec: { title: 'Coin flip', icon: 'coin', components: [{ type: 'random', mode: 'coin', label: 'Heads or tails?' }] }, notes: ['Flip with a little animation, with your recent history'] };
  if (/\bdice|\bdie\b/.test(tl)) {
    const n = +(/\b(\d+)\s*(?:dice|d\d)/.exec(tl)?.[1] || /\b(two|three|four)\s+dice/.exec(tl)?.[1]?.replace(/two/, '2').replace(/three/, '3').replace(/four/, '4') || 2);
    const sides = +(/\bd(\d+)\b/.exec(tl)?.[1] || /(\d+)[- ]sided/.exec(tl)?.[1] || 6);
    return { spec: { title: 'Dice roller', icon: 'dice', components: [{ type: 'random', mode: 'dice', dice: Math.min(10, n), sides, label: `${n} × d${sides}` }] }, notes: [`Rolls ${n} ${sides}-sided dice and adds them up`] };
  }
  if (/yes or no|8.?ball|magic ball|should i/.test(tl)) return { spec: { title: 'Decision orb', icon: 'spark', components: [{ type: 'random', mode: 'yesno', label: 'Ask a yes-or-no question, then tap Ask' }] }, notes: ['Gives a random answer — for fun, not for big decisions'] };
  const range = /between (\d+) and (\d+)|from (\d+) to (\d+)|(\d+)\s*-\s*(\d+)/.exec(tl);
  if (/number/.test(tl) || (range && !listFrom(t))) {
    const a = +(range?.[1] || range?.[3] || range?.[5] || 1), b = +(range?.[2] || range?.[4] || range?.[6] || 100);
    return { spec: { title: 'Random number', icon: 'dice', components: [{ type: 'random', mode: 'number', min: Math.min(a, b), max: Math.max(a, b), label: `Between ${Math.min(a, b)} and ${Math.max(a, b)}` }] }, notes: [`Picks a whole number from ${Math.min(a, b)} to ${Math.max(a, b)}`] };
  }
  let items = listFrom(t);
  let title = 'Random picker';
  if (!items) {
    if (/dinner|food|eat|restaurant|lunch|meal/.test(tl)) { items = ['Pizza', 'Tacos', 'Sushi', 'Pasta', 'Burgers', 'Curry', 'Salad bowl', 'Stir-fry']; title = 'What\'s for dinner?'; }
    else if (/movie|film|watch/.test(tl)) { items = ['Comedy', 'Sci-fi', 'Thriller', 'Animated', 'Documentary', 'Romance', 'Action', 'Horror']; title = 'Movie night picker'; }
    else if (/workout|exercise/.test(tl)) { items = ['Run', 'Yoga', 'Strength', 'Cycling', 'Swim', 'HIIT', 'Long walk']; title = 'Workout picker'; }
    else if (/activity|bored|weekend|do today/.test(tl)) { items = ['Go for a walk', 'Try a new recipe', 'Read a chapter', 'Call a friend', 'Visit a museum', 'Start a puzzle']; title = 'Activity picker'; }
    else if (/names?|students?|people|team/.test(tl)) { items = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Riley']; title = 'Name picker'; }
    else items = ['Option A', 'Option B', 'Option C'];
  }
  return { spec: { title, icon: 'dice', components: [{ type: 'random', mode: 'pick', items, label: 'Tap Pick and let fate decide' }] }, notes: [`${items.length} options — tap “Edit options” to change them`, 'Shows your recent picks'] };
}

function scoreRecipe(t) {
  const tl = t.toLowerCase();
  if (!/\b(score ?keeper|scoreboard|score board|keep score|keeping score|points? (?:tracker|counter))\b/.test(tl)) return null;
  let names = listFrom(t);
  const n = +(/(\d+)\s*(?:players|teams|people)/.exec(tl)?.[1] || 0);
  if (!names) names = n ? Array.from({ length: Math.min(8, n) }, (_, i) => `${/team/.test(tl) ? 'Team' : 'Player'} ${i + 1}`) : /team/.test(tl) ? ['Home', 'Away'] : ['Player 1', 'Player 2'];
  const ids = names.map((nm, i) => `p${i}`);
  const leader = `[${ids.join(',')}].every(function(x){return x===${ids[0]}}) ? 'Tied' : ${JSON.stringify(names)}[[${ids.join(',')}].indexOf(max(${ids.join(',')}))] + ' leads'`;
  return {
    spec: { title: 'Scoreboard', subtitle: names.join(' vs '), icon: 'trophy', components: [
      ...names.map((nm, i) => ({ type: 'counter', id: ids[i], label: nm, unit: 'points', step: 1, quick: [2, 3], span: 1 })),
      { type: 'output', label: 'Leader', formula: leader, format: 'text', big: true },
    ] },
    notes: [`A counter for each of: ${names.join(', ')}`, 'A live “who\'s leading” banner', 'Scores are saved, so you can pick up later'],
  };
}

function pollRecipe(t) {
  if (!/\b(poll|vote|voting|survey|ballot)\b/i.test(t)) return null;
  const opts = listFrom(t) || ['Option A', 'Option B', 'Option C'];
  const q = /\b(?:poll|vote|survey)\s+(?:on|about|for)\s+(.+?)(?:\s+(?:with|between|options?)\b|:|$)/i.exec(t)?.[1];
  return { spec: { title: q ? `Poll: ${titleCase(truncate(q, 40))}` : 'Quick poll', icon: 'chart', components: [{ type: 'tally', id: 'votes', label: 'Tap +1 to vote', options: opts }] }, notes: [`${opts.length} options with live percentages and a leader star`, 'Votes are saved; reset anytime'] };
}

function clockRecipe(t) {
  if (!/\b(clocks?|time in|time zones?|world time)\b/i.test(t)) return null;
  const m = /(?:clocks?|time)\s+(?:for|in|of)\s+(.+)$/i.exec(t);
  if (!m) return null;
  const cities = m[1].replace(/[.?!]+$/, '').split(/\s*(?:,|\band\b|&|\/)\s*/i).map((s) => s.replace(/\b(widget|please)\b/gi, '').trim()).filter((s) => s.length > 1).slice(0, 8);
  return cities.length ? { async: true, cities } : null;
}

async function clockSpec(cities, signal) {
  const places = (await Promise.all(cities.map((c) => geocode(c, { signal }).catch(() => null)))).filter((p) => p?.timezone);
  if (!places.length) return null;
  return {
    spec: { title: places.length > 1 ? 'World clock' : `Time in ${places[0].name}`, icon: 'globe', components: [
      { type: 'clock', label: 'Your time' },
      ...places.map((p) => ({ type: 'clock', label: `${p.name}${p.country ? ', ' + p.country : ''}`, timezone: p.timezone })),
    ] },
    notes: [`Live clocks for ${places.map((p) => p.name).join(', ')} plus your local time`, 'Time zones looked up automatically'],
  };
}

function plotRecipe(t) {
  const m = /\b(?:plot|graph|chart|draw)\b.*?(?:y\s*=|f\(x\)\s*=|of)?\s*([-+*/^().\sx\d a-z]*x[-+*/^().\sx\d a-z]*)$/i.exec(t);
  if (!m || !/\b(plot|graph)\b/i.test(t)) return null;
  let expr = m[1].replace(/\b(widget|function|the|please|from|for)\b/gi, ' ').replace(/(-?\d+)\s*(?:to|\.\.)\s*(-?\d+)/, '').trim();
  expr = wordsToExpr(expr).replace(/(\d)\s*x/g, '$1*x').replace(/(\d)\s*\(/g, '$1*(').replace(/\)\s*\(/g, ')*(').replace(/\s+/g, '');
  if (!/x/.test(expr) || /[^-+*/^().x\d a-z]/i.test(expr)) return null;
  const params = [...new Set((expr.match(/\b[a-wyz]\b/g) || []))].slice(0, 3);
  const range = /from (-?\d+) to (-?\d+)/i.exec(t);
  return {
    spec: { title: `Graph of y = ${expr}`, icon: 'chart', components: [
      ...params.map((p) => ({ type: 'slider', id: p, label: `Parameter ${p}`, min: -10, max: 10, step: 0.1, value: 1 })),
      { type: 'slider', id: 'xmin', label: 'x from', min: -100, max: 0, step: 1, value: range ? +range[1] : -10 },
      { type: 'slider', id: 'xmax', label: 'x to', min: 1, max: 100, step: 1, value: range ? +range[2] : 10 },
      { type: 'chart', label: `y = ${expr}`, fn: expr.replace(/\bln\b/g, 'ln').replace(/\blog\b/g, 'log'), from: 'xmin', to: 'xmax', chart: 'line' },
    ] },
    notes: ['An interactive graph you can re-range with sliders', ...(params.length ? [`Sliders for parameters ${params.join(', ')}`] : [])],
  };
}

const CALCS = [
  { re: /\bdiscount|sale price|% off|percent off|on sale/, title: 'Discount calculator', icon: 'coin', components: (c) => [
    { type: 'number', id: 'price', label: 'Original price', value: 80, prefix: c }, { type: 'slider', id: 'off', label: 'Discount', min: 0, max: 90, step: 1, value: 25, suffix: '%' },
    { type: 'output', label: 'Sale price', formula: 'price * (1 - off / 100)', format: 'currency', big: true }, { type: 'output', label: 'You save', formula: 'price * off / 100', format: 'currency' }] },
  { re: /sales tax|\bvat\b|\btax calculator/, title: 'Sales tax calculator', icon: 'calc', components: () => [
    { type: 'number', id: 'price', label: 'Price before tax', value: 50 }, { type: 'slider', id: 'rate', label: 'Tax rate', min: 0, max: 30, step: 0.25, value: 8.25, suffix: '%' },
    { type: 'output', label: 'Total', formula: 'price * (1 + rate / 100)', format: 'currency', big: true }, { type: 'output', label: 'Tax', formula: 'price * rate / 100', format: 'currency' }] },
  { re: /\bage calculator|how old|\bmy age\b|birth ?date|birthday calculator/, title: 'Age calculator', icon: 'calendar', components: () => [
    { type: 'date', id: 'born', label: 'Date of birth', value: '2000-01-01' },
    { type: 'output', label: 'Age', formula: 'floor((today() - born) / 31556952000)', format: 'int', suffix: ' years', big: true },
    { type: 'output', label: 'Days lived', formula: 'days(born, today())', format: 'int' },
    { type: 'output', label: 'Days until next birthday', formula: '(function(){var b=new Date(born),n=new Date(today()),x=new Date(n.getFullYear(),b.getMonth(),b.getDate());if(x<n)x.setFullYear(n.getFullYear()+1);return days(n.getTime(),x.getTime())})()', format: 'int' }] },
  { re: /days between|date difference|between (two )?dates|how many days from/, title: 'Days between dates', icon: 'calendar', components: () => [
    { type: 'date', id: 'start', label: 'Start date', value: new Date().toISOString().slice(0, 10) }, { type: 'date', id: 'end', label: 'End date', value: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) },
    { type: 'output', label: 'Days', formula: 'days(start, end)', format: 'int', big: true }, { type: 'output', label: 'Weeks', formula: 'days(start, end) / 7', decimals: 1 }] },
  { re: /\bfuel|gas (cost|money)|trip cost|road trip|petrol/, title: 'Trip fuel cost', icon: 'coin', components: () => [
    { type: 'number', id: 'dist', label: 'Distance (miles)', value: 300 }, { type: 'number', id: 'mpg', label: 'Fuel economy (mpg)', value: 30 }, { type: 'number', id: 'ppg', label: 'Price per gallon', value: 3.5, prefix: '$' }, { type: 'slider', id: 'people', label: 'Split between', min: 1, max: 8, value: 1, suffix: ' people' },
    { type: 'output', label: 'Trip cost', formula: 'dist / mpg * ppg', format: 'currency', big: true }, { type: 'output', label: 'Per person', formula: 'dist / mpg * ppg / people', format: 'currency' }] },
  { re: /unit price|price per|better deal|compare prices|which is cheaper/, title: 'Better deal finder', icon: 'target', components: () => [
    { type: 'number', id: 'pa', label: 'Item A price', value: 4.99, prefix: '$' }, { type: 'number', id: 'sa', label: 'Item A size', value: 16, suffix: 'oz' }, { type: 'number', id: 'pb', label: 'Item B price', value: 7.49, prefix: '$' }, { type: 'number', id: 'sb', label: 'Item B size', value: 28, suffix: 'oz' },
    { type: 'output', label: 'Better deal', formula: "pa / sa < pb / sb ? 'Item A' : pa / sa > pb / sb ? 'Item B' : 'Same price'", format: 'text', big: true },
    { type: 'output', label: 'A per unit', formula: 'pa / sa', format: 'currency', decimals: 3 }, { type: 'output', label: 'B per unit', formula: 'pb / sb', format: 'currency', decimals: 3 }] },
  { re: /salary|hourly|wage|paycheck|per hour/, title: 'Pay calculator', icon: 'coin', components: () => [
    { type: 'number', id: 'rate', label: 'Hourly rate', value: 25, prefix: '$' }, { type: 'slider', id: 'hours', label: 'Hours per week', min: 1, max: 80, value: 40 }, { type: 'slider', id: 'weeks', label: 'Weeks per year', min: 1, max: 52, value: 52 },
    { type: 'output', label: 'Yearly', formula: 'rate * hours * weeks', format: 'currency', big: true }, { type: 'output', label: 'Monthly', formula: 'rate * hours * weeks / 12', format: 'currency' }, { type: 'output', label: 'Weekly', formula: 'rate * hours', format: 'currency' }] },
  { re: /\bpace\b|running speed|race time|marathon/, title: 'Running pace', icon: 'bolt', components: () => [
    { type: 'number', id: 'km', label: 'Distance (km)', value: 5 }, { type: 'number', id: 'mins', label: 'Time (minutes)', value: 28 },
    { type: 'output', label: 'Pace per km', formula: 'mins / km', format: 'duration', big: true }, { type: 'output', label: 'Speed', formula: 'km / (mins / 60)', suffix: ' km/h', decimals: 1 }, { type: 'output', label: 'Marathon estimate', formula: 'mins / km * 42.195', format: 'duration' }] },
  { re: /savings goal|save up|saving for|how much (should|do) i save/, title: 'Savings goal', icon: 'target', components: () => [
    { type: 'number', id: 'goal', label: 'Goal', value: 5000, prefix: '$' }, { type: 'number', id: 'have', label: 'Saved so far', value: 1200, prefix: '$' }, { type: 'slider', id: 'months', label: 'Months to go', min: 1, max: 60, value: 12 },
    { type: 'output', label: 'Save per month', formula: 'max(0, goal - have) / months', format: 'currency', big: true }, { type: 'output', label: 'Per week', formula: 'max(0, goal - have) / (months * 4.345)', format: 'currency' },
    { type: 'progress', label: 'Progress', value: 'have', goal: 'goal', format: 'currency' }] },
  { re: /electric|power cost|kwh|energy (cost|use)|wattage/, title: 'Electricity cost', icon: 'bolt', components: () => [
    { type: 'number', id: 'watts', label: 'Device power (watts)', value: 150 }, { type: 'slider', id: 'hrs', label: 'Hours per day', min: 0, max: 24, step: 0.5, value: 6 }, { type: 'number', id: 'price', label: 'Price per kWh', value: 0.17, prefix: '$' },
    { type: 'output', label: 'Per month', formula: 'watts / 1000 * hrs * 30.4 * price', format: 'currency', big: true }, { type: 'output', label: 'Per day', formula: 'watts / 1000 * hrs * price', format: 'currency' }, { type: 'output', label: 'Per year', formula: 'watts / 1000 * hrs * 365 * price', format: 'currency' }] },
  { re: /final (exam|grade)|grade (i )?need|what do i need/, title: 'Final grade calculator', icon: 'book', components: () => [
    { type: 'slider', id: 'cur', label: 'Current grade', min: 0, max: 100, value: 85, suffix: '%' }, { type: 'slider', id: 'w', label: 'Final exam weight', min: 1, max: 100, value: 30, suffix: '%' }, { type: 'slider', id: 'goal', label: 'Grade you want', min: 0, max: 100, value: 90, suffix: '%' },
    { type: 'output', label: 'You need on the final', formula: '(goal - cur * (1 - w / 100)) / (w / 100)', format: 'percent', decimals: 1, big: true }] },
  { re: /\bgrade calculator|test score|score percentage|percentage grade/, title: 'Score to percentage', icon: 'book', components: () => [
    { type: 'number', id: 'got', label: 'Points earned', value: 42 }, { type: 'number', id: 'total', label: 'Points possible', value: 50 },
    { type: 'output', label: 'Score', formula: 'got / total * 100', format: 'percent', decimals: 1, big: true }, { type: 'output', label: 'Letter grade', formula: "got/total>=.9?'A':got/total>=.8?'B':got/total>=.7?'C':got/total>=.6?'D':'F'", format: 'text' }] },
  { re: /cups? to grams|grams to cups|baking|cooking conver|kitchen conver/, title: 'Kitchen converter', icon: 'cup', components: () => [
    { type: 'select', id: 'gpc', label: 'Ingredient', options: [{ label: 'Flour', value: 120 }, { label: 'Sugar', value: 200 }, { label: 'Brown sugar', value: 220 }, { label: 'Butter', value: 227 }, { label: 'Water / milk', value: 240 }, { label: 'Rice', value: 185 }, { label: 'Oats', value: 90 }, { label: 'Honey', value: 340 }] },
    { type: 'number', id: 'cups', label: 'Cups', value: 1, step: 0.25 }, { type: 'output', label: 'Grams', formula: 'cups * gpc', format: 'int', suffix: ' g', big: true }, { type: 'output', label: 'Tablespoons', formula: 'cups * 16', decimals: 1 }] },
  { re: /recipe scal|scale (a |my )?recipe|servings? (scal|conver)/, title: 'Recipe scaler', icon: 'cup', components: () => [
    { type: 'number', id: 'from', label: 'Recipe serves', value: 4 }, { type: 'number', id: 'to', label: 'You need to serve', value: 6 }, { type: 'number', id: 'qty', label: 'Ingredient amount', value: 250 },
    { type: 'output', label: 'Scaled amount', formula: 'qty * to / from', decimals: 1, big: true }, { type: 'output', label: 'Multiply everything by', formula: 'to / from', decimals: 2, suffix: '×' }] },
  { re: /sleep (cycle|calculator)|when should i (sleep|go to bed|wake)|bedtime calculator/, title: 'Sleep cycle calculator', icon: 'moon', components: () => [
    { type: 'time', id: 'wake', label: 'I want to wake up at', value: '07:00' },
    { type: 'output', label: 'Go to bed at (6 cycles)', formula: 'wake - 6 * 90 - 15', format: 'time', big: true }, { type: 'output', label: '5 cycles', formula: 'wake - 5 * 90 - 15', format: 'time' }, { type: 'output', label: '4 cycles', formula: 'wake - 4 * 90 - 15', format: 'time' },
    { type: 'note', text: 'Each sleep cycle is about 90 minutes, plus ~15 minutes to fall asleep.' }] },
  { re: /dog (age|years)|cat (age|years)|pet age/, title: 'Pet age in human years', icon: 'heart', components: () => [
    { type: 'select', id: 'pet', label: 'Pet', options: [{ label: 'Dog', value: 0 }, { label: 'Cat', value: 1 }] }, { type: 'slider', id: 'age', label: 'Age (years)', min: 1, max: 25, value: 4 },
    { type: 'output', label: 'Human years', formula: 'pet == 1 ? (age <= 1 ? 15 : age <= 2 ? 24 : 24 + (age - 2) * 4) : (age <= 1 ? 15 : age <= 2 ? 24 : 24 + (age - 2) * 5)', format: 'int', big: true }] },
  { re: /\bpaint|square (feet|foot|meters?)|room area|area calculator|flooring/, title: 'Room & paint calculator', icon: 'calc', components: () => [
    { type: 'number', id: 'l', label: 'Length (m)', value: 4 }, { type: 'number', id: 'w', label: 'Width (m)', value: 3.5 }, { type: 'number', id: 'h', label: 'Wall height (m)', value: 2.5 }, { type: 'slider', id: 'coats', label: 'Coats of paint', min: 1, max: 3, value: 2 },
    { type: 'output', label: 'Floor area', formula: 'l * w', suffix: ' m²', decimals: 1 }, { type: 'output', label: 'Wall area', formula: '2 * (l + w) * h', suffix: ' m²', decimals: 1 },
    { type: 'output', label: 'Paint needed', formula: '2 * (l + w) * h * coats / 10', suffix: ' liters', decimals: 1, big: true }] },
  { re: /reading time|words? per minute|how long to read/, title: 'Reading time', icon: 'book', components: () => [
    { type: 'number', id: 'words', label: 'Number of words', value: 2500 }, { type: 'slider', id: 'wpm', label: 'Reading speed', min: 100, max: 500, value: 238, suffix: ' wpm' },
    { type: 'output', label: 'Reading time', formula: 'words / wpm', format: 'duration', big: true }] },
  { re: /\bspeed|distance|travel time|eta\b/, title: 'Travel time', icon: 'clock', components: () => [
    { type: 'number', id: 'dist', label: 'Distance (km)', value: 120 }, { type: 'number', id: 'speed', label: 'Average speed (km/h)', value: 80 },
    { type: 'output', label: 'Travel time', formula: 'dist / speed * 60', format: 'duration', big: true }] },
  { re: /\bpercent(age)? (calculator|change)|% of/, title: 'Percentage calculator', icon: 'calc', components: () => [
    { type: 'number', id: 'pct', label: 'Percent', value: 15, suffix: '%' }, { type: 'number', id: 'of', label: 'Of value', value: 240 },
    { type: 'output', label: 'Result', formula: 'pct / 100 * of', big: true },
    { type: 'number', id: 'a', label: 'From', value: 50 }, { type: 'number', id: 'b', label: 'To', value: 65 }, { type: 'output', label: 'Percent change', formula: '(b - a) / abs(a) * 100', format: 'percent', decimals: 1 }] },
  { re: /\baverage|\bmean\b|\bgpa\b/, title: 'Average calculator', icon: 'chart', components: () => [
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((x, i) => ({ type: 'number', id: `v${i}`, label: `Value ${x}`, value: [88, 92, 79, 0, 0, 0][i] })),
    { type: 'toggle', id: 'skip0', label: 'Ignore empty (zero) values', value: true },
    { type: 'output', label: 'Average', formula: 'skip0 ? ([v0,v1,v2,v3,v4,v5].filter(function(x){return x}).reduce(function(s,x){return s+x},0) / max(1,[v0,v1,v2,v3,v4,v5].filter(function(x){return x}).length)) : (v0+v1+v2+v3+v4+v5)/6', decimals: 2, big: true }] },
];

function calcRecipe(t) {
  const tl = t.toLowerCase();
  const c = CALCS.find((x) => x.re.test(tl));
  if (!c) return null;
  const sym = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' }[currencyCode(t)];
  const comps = c.components(sym);
  return { spec: { title: c.title, icon: c.icon, currency: currencyCode(t), components: comps }, notes: [`${comps.filter((x) => ['number', 'slider', 'select', 'date', 'time', 'toggle'].includes(x.type)).length} inputs`, `${comps.filter((x) => x.type === 'output').length} live results that update as you type`, 'Your last values are remembered'] };
}

async function converterRecipe(t, signal) {
  const tl = t.toLowerCase();
  if (!/\b(convert|converter|conversion)\b/.test(tl) && !/\bto\b/.test(tl)) return null;
  const m = /([a-z$€£¥°]+(?:\s[a-z]+)?)\s+(?:to|into|in)\s+([a-z$€£¥°]+(?:\s[a-z]+)?)/i.exec(tl.replace(/\b(make|build|create|a|an|me|converter|conversion|widget|calculator|tool)\b/g, ' ').replace(/\s+/g, ' '));
  if (!m) return null;
  const a = m[1].trim(), b = m[2].trim();
  const ca = CURRENCIES[a] || (/^[a-z]{3}$/.test(a) && CURRENCIES[a]), cb = CURRENCIES[b];
  if (ca && cb) {
    let rate = null, date = '';
    if (settings.liveData) { try { const r = await fxRate(ca, cb, { signal }); rate = r.rate; date = r.date; } catch (e) { if (e.name === 'AbortError') throw e; } }
    if (!rate) return null;
    return {
      spec: { title: `${ca} → ${cb} converter`, subtitle: `Rate ${fmt(rate, 6)} · ECB reference, ${date}`, icon: 'coin', components: [
        { type: 'number', id: 'amt', label: `Amount in ${ca}`, value: 100 },
        { type: 'output', label: `In ${cb}`, formula: `amt * ${rate}`, format: 'currency', currency: cb, big: true },
        { type: 'number', id: 'back', label: `Amount in ${cb}`, value: 100 },
        { type: 'output', label: `In ${ca}`, formula: `back / ${rate}`, format: 'currency', currency: ca },
      ] },
      notes: [`Uses today's ${ca}/${cb} reference rate (${fmt(rate, 6)})`, 'Converts both directions'],
    };
  }
  const conv = convertUnits({ value: 1, from: a, to: b });
  if (!conv) return null;
  const factor = conv.result;
  const temp = conv.category === 'temperature';
  const formula = temp ? `(${a.startsWith('c') ? 'x' : a.startsWith('f') ? '(x - 32) * 5 / 9' : 'x - 273.15'}) ${b.startsWith('c') ? '' : b.startsWith('f') ? '* 9 / 5 + 32' : '+ 273.15'}` : `x * ${factor}`;
  return {
    spec: { title: `${a} → ${b} converter`, icon: 'calc', components: [
      { type: 'number', id: 'x', label: `Value in ${a}`, value: 1 },
      { type: 'output', label: `In ${b}`, formula, decimals: 4, big: true },
      ...(temp ? [] : [{ type: 'note', text: `1 ${a} = ${fmt(factor)} ${b}` }]),
    ] },
    notes: [`Converts ${conv.category}: ${a} to ${b}`, 'Updates as you type'],
  };
}

function formulaRecipe(t) {
  const m = /(?:=|\bcomputes?\b|\bcalculates?\b|\bformula\b:?|\bthat (?:does|gives)\b)\s*(.+)$/i.exec(t);
  if (!m) return null;
  let expr = wordsToExpr(m[1].replace(/\b(widget|calculator|please|for me)\b/gi, '')).replace(/[?.!]+$/, '').trim();
  const name = /^\s*(?:make|build|create)?\s*(?:a|an)?\s*(?:calculator|widget)?\s*(?:for|that computes|where)?\s*([a-z][a-z _]{1,24})\s*=/i.exec(t)?.[1]?.trim();
  if (!/[-+*/^%]/.test(expr)) return null;
  const vars = [...new Set((expr.match(/\b[a-z_][a-z0-9_]*\b/gi) || []).filter((v) => !/^(sqrt|cbrt|sin|cos|tan|log|ln|exp|abs|round|floor|ceil|min|max|pi|e|pow)$/i.test(v)))];
  if (!vars.length || vars.length > 8 || /\b(the|a|an|is|of|my)\b/.test(expr)) return null;
  const varsClean = vars.map((v) => ({ raw: v, id: id(v) }));
  let f = expr;
  varsClean.forEach((v) => { f = f.replace(new RegExp(`\\b${v.raw}\\b`, 'g'), v.id); });
  return {
    spec: { title: name ? `${titleCase(name.replace(/_/g, ' '))} calculator` : 'Custom calculator', subtitle: `${name ? name + ' = ' : ''}${expr}`, icon: 'calc', components: [
      ...varsClean.map((v) => ({ type: 'number', id: v.id, label: titleCase(v.raw.replace(/_/g, ' ')), value: 1 })),
      { type: 'output', label: name ? titleCase(name.replace(/_/g, ' ')) : 'Result', formula: f, decimals: 4, big: true },
    ] },
    notes: [`Inputs for ${vars.join(', ')}`, `Computes ${expr} live`],
  };
}

function flashcardRecipe(t) {
  if (!/\bflash ?cards?\b/i.test(t)) return null;
  const body = t.split(/:|\n/).slice(1).join('\n');
  const pairs = body.split(/;|\n/).map((p) => p.split(/\s+[-–=]\s+|\s*=\s*/)).filter((p) => p.length === 2 && p[0].trim() && p[1].trim());
  if (pairs.length < 2) return null;
  return { spec: { title: 'Flashcards', icon: 'book', components: [{ type: 'flashcards', cards: pairs.map(([f, b]) => ({ front: f.trim(), back: b.trim() })) }] }, notes: [`${pairs.length} cards — tap to flip`] };
}

function journalRecipe(t) {
  const tl = t.toLowerCase();
  if (!/\b(journal|diary|notes?|note board|idea board|ideas board|gratitude|brain dump)\b/.test(tl)) return null;
  const grat = /gratitude|grateful|thankful/.test(tl);
  const ideas = /idea/.test(tl);
  return {
    spec: { title: grat ? 'Gratitude journal' : ideas ? 'Idea board' : /diary|journal/.test(tl) ? 'Journal' : 'Notes', subtitle: grat ? 'Three good things, every day' : 'Saved on this device', icon: grat ? 'heart' : ideas ? 'spark' : 'note', components: [
      ...(grat ? [{ type: 'note', text: 'Write down three things you\'re grateful for today — big or small.' }] : []),
      { type: 'log', id: 'entries', label: grat ? 'Today I\'m grateful for…' : ideas ? 'Ideas' : 'Entries', fields: [{ id: 'text', type: 'text', label: grat ? 'Something good' : ideas ? 'New idea' : 'Write something' }] },
      ...(/diary|journal/.test(tl) && !grat ? [{ type: 'rating', id: 'day', label: 'How was today?', max: 5, shape: 'dot', labels: ['Rough', 'Meh', 'Fine', 'Good', 'Amazing'] }] : []),
    ] },
    notes: ['Dated entries saved on this device', ...(grat ? ['A daily gratitude prompt'] : [])],
  };
}

function dashboardRecipe(t) {
  const tl = t.toLowerCase();
  if (!/\b(dashboard|hub|command center|daily board|planner board)\b/.test(tl)) return null;
  const w = parseWhen(t);
  if (/study|exam|school|homework|focus/.test(tl)) return { spec: { title: 'Study dashboard', icon: 'book', components: [
    { type: 'timer', label: 'Focus session', presets: [25, 50, 5] },
    { type: 'counter', id: 'sessions', label: 'Focus sessions today', unit: 'sessions', goal: 4, daily: true },
    { type: 'checklist', id: 'tasks', label: 'Today\'s tasks', items: ['Review notes', 'Practice problems', 'Make flashcards'], daily: false },
    ...(w ? [{ type: 'countdown', label: 'Exam', to: w.date.toISOString() }] : []),
  ] }, notes: ['A focus timer with Pomodoro presets', 'A daily session counter', 'A task checklist', ...(w ? ['A countdown to your exam'] : [])] };
  if (/fitness|health|workout|gym/.test(tl)) return { spec: { title: 'Fitness dashboard', icon: 'flame', components: [
    { type: 'counter', id: 'water', label: 'Water today', unit: 'glasses', goal: 8, daily: true },
    { type: 'log', id: 'workouts', label: 'Workouts', fields: [{ id: 'what', type: 'text', label: 'Activity' }, { id: 'mins', type: 'number', label: 'Minutes' }], sum: 'mins', goal: 150, period: 'week', suffix: ' min' },
    { type: 'rating', id: 'energy', label: 'Energy today', max: 5, shape: 'dot' },
  ] }, notes: ['Water counter', 'Workout log with a weekly 150-minute goal', 'Daily energy rating'] };
  if (/money|budget|finance|spend/.test(tl)) return trackerRecipe('track my spending ' + t);
  return { spec: { title: /morning/.test(tl) ? 'Morning dashboard' : 'Daily dashboard', icon: 'spark', components: [
    { type: 'clock', label: 'Now' },
    { type: 'rating', id: 'mood', label: 'Mood today', max: 5, shape: 'dot', labels: ['Awful', 'Low', 'Okay', 'Good', 'Great'] },
    { type: 'checklist', id: 'today', label: 'Top 3 today', items: ['', '', ''].map((_, i) => ['Most important task', 'Second priority', 'Something for me'][i]), daily: true },
    { type: 'counter', id: 'water', label: 'Water', unit: 'glasses', goal: 8, daily: true },
    ...(w ? [{ type: 'countdown', label: 'Coming up', to: w.date.toISOString() }] : []),
  ] }, notes: ['A live clock and mood check-in', 'Your top 3 priorities (resets daily)', 'A water counter'] };
}

async function quizRecipe(t, signal) {
  if (!/\bquiz\b/i.test(t)) return null;
  const topic = (/\bquiz\s+(?:me\s+)?(?:on|about|for)\s+(.+?)(?:[.?!]|$)/i.exec(t)?.[1] || /\b(?:on|about)\s+(.+?)(?:[.?!]|$)/i.exec(t)?.[1] || '').replace(/\bwidget\b/gi, '').trim();
  if (!topic || !settings.liveData) return null;
  const page = await bestPage(topic, { signal }).catch(() => null);
  const art = page ? await wikiArticle(page.title, { signal }).catch(() => null) : null;
  if (!art) return null;
  const q = makeQuiz(art, { n: 6 });
  if (!q.questions.length) return null;
  return {
    spec: { title: `${art.title} quiz`, subtitle: 'Generated from Wikipedia', icon: 'book', components: [
      { type: 'quiz', label: art.title, questions: q.questions },
      ...(q.cards.length ? [{ type: 'flashcards', label: 'Flashcards', cards: q.cards }] : []),
    ] },
    notes: [`${q.questions.length} questions written from the “${art.title}” article`, ...(q.cards.length ? [`${q.cards.length} flashcards`] : [])],
  };
}

/** Wikipedia-based visual explorer, used when a widget is about a topic. */
export async function topicWidget(topic, signal) {
  if (!settings.liveData) return null;
  const page = await bestPage(topic, { signal }).catch(() => null);
  const art = page ? await wikiArticle(page.title, { signal }).catch(() => null) : null;
  if (!art) return null;
  const [images, related] = await Promise.all([wikiImages(art.title, { signal }).catch(() => []), lookup(art.title, { n: 5, signal }).catch(() => [])]);
  const quiz = makeQuiz(art, { n: 3 }).questions;
  return { title: `${art.title} — visual guide`, html: explorerWidget({ article: art, images, related: related.filter((r) => r.title !== art.title).slice(0, 4).map((r) => r.title), quiz }), page, art };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Design a widget spec for a request. Returns { spec, notes } or null. */
export async function designWidget(text, { signal } = {}) {
  const t = text.trim();
  const order = [countdownRecipe, timerRecipe, scoreRecipe, pollRecipe, dashboardRecipe, trackerRecipe, checklistRecipe, flashcardRecipe, randomRecipe, plotRecipe, journalRecipe, calcRecipe, formulaRecipe];
  for (const r of order) {
    const out = r(t);
    if (out?.spec) {
      const spec = normalizeSpec(out.spec);
      if (spec) return { spec, notes: out.notes || [] };
    }
  }
  const clock = clockRecipe(t);
  if (clock) { const out = await clockSpec(clock.cities, signal); if (out) return { spec: normalizeSpec(out.spec), notes: out.notes }; }
  const conv = await converterRecipe(t, signal);
  if (conv) return { spec: normalizeSpec(conv.spec), notes: conv.notes };
  const quiz = await quizRecipe(t, signal);
  if (quiz) return { spec: normalizeSpec(quiz.spec), notes: quiz.notes };
  return null;
}

// Rich built-in widgets beat the designer (they have no spec equivalent).
const RICH_BUILTINS = new Set(['typing', 'tictactoe', 'piano', 'draw', 'solar', 'physics', 'password', 'palette', 'mortgage', 'compound', 'bmi', 'tip', 'budget', 'habit']);

/** Decide how to fulfil a widget request: { kind: 'spec' | 'builtin', ... } or null. */
export async function pickWidget(text, { signal } = {}) {
  const built = matchWidget(text);
  const trackingMoney = built?.id === 'budget' && /\b(track|tracker|tracking|spend|spending|log|expenses)\b/i.test(text);
  if (built && !trackingMoney && (RICH_BUILTINS.has(built.id) || (built.id === 'random' && !listFrom(text) && !/\b(coin|dice|die|yes or no|8.?ball|number)\b/i.test(text)))) return { kind: 'builtin', widget: built };
  const d = await designWidget(text, { signal });
  if (d?.spec) return { kind: 'spec', ...d };
  if (built) return { kind: 'builtin', widget: built };
  return null;
}

/** Natural-language edits to an existing widget spec. Returns { spec, change } or null. */
export function editWidget(prev, text) {
  const t = text.trim().toLowerCase();
  const spec = JSON.parse(JSON.stringify(prev));
  const comps = spec.components;
  let m;
  if ((m = /(?:rename|call it|title it|name it)\s+(?:to\s+)?["“]?(.+?)["”]?[.!]?$/i.exec(text))) { spec.title = titleCase(m[1]); return { spec, change: `Renamed it to **${spec.title}**` }; }
  if ((m = /\b(?:goal|target|limit)\b[^\d]*(\d[\d,.]*)|\b(?:make|set) (?:it|the goal) (?:to )?(\d[\d,.]*)/.exec(t))) {
    const g = parseFloat((m[1] || m[2]).replace(/,/g, ''));
    let n = 0;
    comps.forEach((c) => { if (c.type === 'counter' || c.type === 'log' || c.type === 'history' || c.type === 'progress') { if (c.type !== 'log' || c.sum) { c.goal = g; n++; } } if (c.type === 'stat' && /max\(0, \d/.test(c.formula || '')) c.formula = c.formula.replace(/max\(0, [\d.]+/, `max(0, ${g}`); if (c.type === 'stat' && /[<>]=? [\d.]+ \?/.test(c.formula || '')) c.formula = c.formula.replace(/([<>]=?) [\d.]+ \?/, `$1 ${g} ?`); });
    if (n) { if (spec.subtitle && /\d/.test(spec.subtitle)) spec.subtitle = spec.subtitle.replace(/[\d,.]+/, g.toLocaleString()); return { spec, change: `Set the goal to **${g.toLocaleString()}**` }; }
  }
  if ((m = /\badd (?:the )?(?:items?|tasks?|options?)?\s*:?\s*(.+?)(?: to (?:the |my )?(?:list|checklist|options|picker|poll))?[.!]?$/i.exec(text)) && comps.some((c) => ['checklist', 'random', 'tally'].includes(c.type))) {
    const raw = m[1];
    const isComponent = /^(?:an?\s+)?(timer|stopwatch|notes?|journal|chart|graph|countdown|clock|rating|mood|counter|water|quiz)\b/i.test(raw);
    if (!isComponent) {
      const items = raw.split(/\s*(?:,|\band\b|;)\s*/i).map((s) => capitalize(s.replace(/^(?:a|an|the)\s+/i, '').trim())).filter(Boolean);
      const target = comps.find((c) => c.type === 'checklist') || comps.find((c) => c.type === 'random') || comps.find((c) => c.type === 'tally');
      if (target.type === 'tally') target.options = [...(target.options || []), ...items];
      else target.items = [...(target.items || []), ...items];
      spec.rev = (spec.rev || 0) + 1;
      return { spec, change: `Added ${items.map((i) => `**${i}**`).join(', ')}` };
    }
  }
  if ((m = /\badd (?:an?\s+)?(timer|stopwatch|notes?|journal|chart|graph|countdown|clock|rating|mood|counter|water tracker|checklist|to-?do list)\b(.*)$/i.exec(t))) {
    const kind = m[1];
    let comp;
    if (kind === 'timer') { const tr = timerRecipe(`${m[2]} timer`); comp = tr ? tr.spec.components[0] : { type: 'timer', label: 'Timer', presets: [5, 10, 25] }; }
    else if (kind === 'stopwatch') comp = { type: 'stopwatch' };
    else if (/notes?|journal/.test(kind)) comp = { type: 'log', id: 'notes', label: 'Notes', fields: [{ id: 'text', type: 'text', label: 'Write a note' }] };
    else if (/chart|graph/.test(kind)) { const src = comps.find((c) => c.type === 'counter' || (c.type === 'log' && c.sum) || c.type === 'rating'); if (src) comp = { type: 'history', of: src.id, field: src.type === 'log' ? src.sum : undefined, label: 'Last 7 days' }; }
    else if (kind === 'countdown') { const w = parseWhen(m[2]) || { date: new Date(Date.now() + 7 * 864e5) }; comp = { type: 'countdown', label: titleCase(m[2].replace(/\b(to|until|for|on)\b/g, '').trim() || 'Countdown'), to: w.date.toISOString() }; }
    else if (kind === 'clock') comp = { type: 'clock', label: 'Now' };
    else if (/rating|mood/.test(kind)) comp = { type: 'rating', id: 'mood', label: 'Mood today', max: 5, shape: 'dot', labels: ['Awful', 'Low', 'Okay', 'Good', 'Great'] };
    else if (/water/.test(kind)) comp = { type: 'counter', id: 'water', label: 'Water today', unit: 'glasses', goal: 8, daily: true };
    else if (kind === 'counter') comp = { type: 'counter', id: `count${comps.length}`, label: 'Counter', step: 1 };
    else comp = { type: 'checklist', id: `list${comps.length}`, label: 'Checklist', items: ['New item'] };
    if (comp) { comps.push(comp); return { spec, change: `Added a **${kind}**` }; }
  }
  if ((m = /\bremove (?:the )?(timer|stopwatch|notes?|chart|graph|history|countdown|clock|rating|mood|counter|checklist|list|stats?)\b/i.exec(t))) {
    const map = { notes: 'log', note: 'log', chart: 'history', graph: 'history', mood: 'rating', list: 'checklist', stats: 'stat' };
    const type = map[m[1]] || m[1];
    const before = comps.length;
    spec.components = comps.filter((c) => c.type !== type);
    if (spec.components.length && spec.components.length < before) return { spec, change: `Removed the **${m[1]}**` };
  }
  if (/\b(make it daily|reset (it )?(every|each) day|daily reset)\b/.test(t)) {
    comps.forEach((c) => { if (c.type === 'counter' || c.type === 'checklist') c.daily = true; });
    return { spec, change: 'It now resets every day' };
  }
  if ((m = /\b(?:unit|units) to (\w+)/.exec(t))) { comps.forEach((c) => { if (c.type === 'counter') c.unit = m[1]; }); return { spec, change: `Changed the unit to **${m[1]}**` }; }
  return null;
}

export function isWidgetEdit(t) {
  return /^(?:now\s+|also\s+|and\s+|please\s+|can you\s+)?(make it|make the|set the|set it|change|add|remove|delete|rename|call it|title it|name it|the goal|goal|limit|target|reset)\b/i.test(t.trim()) && !/\b(widget|tracker|calculator)\s+(for|that|to)\b/i.test(t);
}

/** Describe a spec's components for the chat summary. */
export function describeSpec(spec) {
  return spec.components.map((c) => c.type).filter((v, i, a) => a.indexOf(v) === i);
}
