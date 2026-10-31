// Live knowledge sources that work from a static site (CORS-enabled, no keys):
// Wikipedia (facts & search), Open-Meteo (weather & geocoding), Frankfurter (currency).

const WIKI = 'https://en.wikipedia.org';
const cache = new Map();

async function getJSON(url, signal, attempt = 0) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { signal });
  if ((r.status === 429 || r.status >= 500) && attempt < 2) {
    const wait = Math.min(4000, (parseFloat(r.headers.get('retry-after')) || 0) * 1000 || 900 * (attempt + 1));
    await new Promise((res, rej) => {
      const t = setTimeout(res, wait);
      signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    return getJSON(url, signal, attempt + 1);
  }
  if (r.status === 429) throw new Error('The knowledge service is busy right now (rate limited). Please try again in a minute.');
  if (!r.ok) throw new Error(`Knowledge service error (HTTP ${r.status}).`);
  const j = await r.json();
  if (cache.size > 300) cache.clear();
  cache.set(url, j);
  return j;
}

const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function wikiUrl(title) { return `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`; }

export async function wikiSearch(q, { limit = 6, signal } = {}) {
  const url = `${WIKI}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&srprop=snippet&format=json&origin=*`;
  const j = await getJSON(url, signal);
  return (j.query?.search || []).map((r) => ({ title: r.title, snippet: strip(r.snippet), pageid: r.pageid }));
}

function isDisambig(p) {
  return /may refer to|may also refer to/i.test(p.extract || '') || /disambiguation|Topics referred to by the same term/i.test(p.description || '');
}

/** Intro extracts + thumbnails for several titles, returned in the given order. */
export async function wikiPages(titles, { signal, thumb = 480 } = {}) {
  if (!titles.length) return [];
  const url = `${WIKI}/w/api.php?action=query&prop=extracts|pageimages|info|description&exintro=1&explaintext=1&exlimit=20&piprop=thumbnail&pithumbsize=${thumb}&inprop=url&redirects=1&titles=${encodeURIComponent(titles.join('|'))}&format=json&origin=*`;
  const j = await getJSON(url, signal);
  const pages = Object.values(j.query?.pages || {}).filter((p) => !p.missing);
  const map = new Map();
  const alias = new Map();
  (j.query?.normalized || []).forEach((n) => alias.set(n.from, n.to));
  (j.query?.redirects || []).forEach((n) => alias.set(n.from, n.to));
  pages.forEach((p) => map.set(p.title, p));
  const out = [];
  for (const t of titles) {
    let k = t;
    for (let i = 0; i < 3 && alias.has(k); i++) k = alias.get(k);
    const p = map.get(k);
    if (p && !out.some((o) => o.title === p.title)) {
      out.push({
        title: p.title,
        extract: (p.extract || '').trim(),
        description: p.description || '',
        thumb: p.thumbnail?.source || null,
        url: p.fullurl || wikiUrl(p.title),
        disambiguation: isDisambig(p),
      });
    }
  }
  return out;
}

/** Full plain-text article split into sections. */
export async function wikiArticle(title, { signal } = {}) {
  const url = `${WIKI}/w/api.php?action=query&prop=extracts|pageimages|info|description&explaintext=1&exsectionformat=wiki&piprop=thumbnail&pithumbsize=800&inprop=url&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const j = await getJSON(url, signal);
  const p = Object.values(j.query?.pages || {})[0];
  if (!p || p.missing) return null;
  const text = p.extract || '';
  const sections = [];
  let cur = { title: 'Overview', level: 1, text: '' };
  for (const line of text.split('\n')) {
    const m = /^(={2,4})\s*(.+?)\s*\1\s*$/.exec(line);
    if (m) {
      if (cur.text.trim()) sections.push(cur);
      cur = { title: m[2], level: m[1].length, text: '' };
    } else cur.text += line + '\n';
  }
  if (cur.text.trim()) sections.push(cur);
  const skip = /^(See also|References|External links|Further reading|Notes|Bibliography|Sources|Citations|Footnotes|Gallery)$/i;
  return {
    title: p.title,
    description: p.description || '',
    thumb: p.thumbnail?.source || null,
    url: p.fullurl || wikiUrl(p.title),
    sections: sections.filter((s) => !skip.test(s.title)).map((s) => ({ ...s, text: s.text.trim() })),
  };
}

export async function wikiImages(title, { signal, limit = 8 } = {}) {
  const url = `${WIKI}/w/api.php?action=query&generator=images&titles=${encodeURIComponent(title)}&gimlimit=30&prop=imageinfo&iiprop=url|mime&iiurlwidth=400&format=json&origin=*`;
  const j = await getJSON(url, signal);
  return Object.values(j.query?.pages || {})
    .map((p) => p.imageinfo?.[0])
    .filter((ii) => ii && /image\/(jpeg|png|webp)/.test(ii.mime) && !/logo|icon|flag|symbol|map|commons-|wiki/i.test(ii.url))
    .slice(0, limit)
    .map((ii) => ({ src: ii.thumburl || ii.url, page: ii.descriptionurl }));
}

/** Search + read: best non-disambiguation pages for a query. */
export async function lookup(query, { n = 4, signal } = {}) {
  const hits = await wikiSearch(query, { limit: Math.max(n + 3, 6), signal });
  if (!hits.length) return [];
  const pages = await wikiPages(hits.map((h) => h.title), { signal });
  return pages.filter((p) => !p.disambiguation && p.extract.length > 60).slice(0, n);
}

/** Best single page for a topic: tries an exact title first, then search. */
export async function bestPage(topic, { signal } = {}) {
  try {
    const exact = await wikiPages([topic.replace(/^\w/, (c) => c.toUpperCase())], { signal });
    if (exact[0] && !exact[0].disambiguation && exact[0].extract.length > 80) {
      // only trust exact hits when the title matches closely
      if (exact[0].title.toLowerCase().replace(/[^a-z0-9]/g, '') === topic.toLowerCase().replace(/[^a-z0-9]/g, '') || exact[0].extract.length > 300) return exact[0];
    }
  } catch {}
  const res = await lookup(topic, { n: 1, signal });
  return res[0] || null;
}

// ---------- Weather (Open-Meteo) ----------
export async function geocode(name, { signal } = {}) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const j = await getJSON(url, signal);
  const r = j.results?.[0];
  if (!r) return null;
  return { name: r.name, country: r.country, admin1: r.admin1, lat: r.latitude, lon: r.longitude, timezone: r.timezone, population: r.population };
}

export async function forecast(lat, lon, { signal } = {}) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day,precipitation' +
    '&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=24' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
    '&timezone=auto&forecast_days=7';
  cache.delete(url); // weather should always be fresh
  return getJSON(url, signal);
}

export const WMO = {
  0: ['Clear sky', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'],
  45: ['Fog', '🌫️', '🌫️'], 48: ['Rime fog', '🌫️', '🌫️'],
  51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'],
  56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Freezing drizzle', '🌧️', '🌧️'],
  61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'],
  66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Freezing rain', '🌧️', '🌧️'],
  71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '🌨️', '🌨️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
  80: ['Rain showers', '🌦️', '🌧️'], 81: ['Rain showers', '🌧️', '🌧️'], 82: ['Violent showers', '⛈️', '⛈️'],
  85: ['Snow showers', '🌨️', '🌨️'], 86: ['Snow showers', '❄️', '❄️'],
  95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm with hail', '⛈️', '⛈️'], 99: ['Thunderstorm with hail', '⛈️', '⛈️'],
};
export function wmo(code, day = true) {
  const w = WMO[code] || ['Unknown', '🌡️', '🌡️'];
  return { text: w[0], emoji: day ? w[1] : w[2] };
}

// ---------- Currency (Frankfurter, ECB rates) ----------
export async function fxRate(from, to, { signal } = {}) {
  const url = `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const j = await getJSON(url, signal);
  const rate = j.rates?.[to];
  if (!rate) throw new Error('Unsupported currency');
  return { rate, date: j.date };
}

export const CURRENCIES = {
  usd: 'USD', dollar: 'USD', dollars: 'USD', '$': 'USD', eur: 'EUR', euro: 'EUR', euros: 'EUR', '€': 'EUR', gbp: 'GBP', pound: 'GBP', pounds: 'GBP', '£': 'GBP',
  jpy: 'JPY', yen: 'JPY', '¥': 'JPY', cny: 'CNY', yuan: 'CNY', rmb: 'CNY', inr: 'INR', rupee: 'INR', rupees: 'INR', cad: 'CAD', aud: 'AUD', chf: 'CHF', franc: 'CHF', francs: 'CHF',
  mxn: 'MXN', peso: 'MXN', pesos: 'MXN', brl: 'BRL', real: 'BRL', reais: 'BRL', krw: 'KRW', won: 'KRW', sek: 'SEK', nok: 'NOK', dkk: 'DKK', pln: 'PLN', zloty: 'PLN',
  try: 'TRY', lira: 'TRY', zar: 'ZAR', rand: 'ZAR', sgd: 'SGD', hkd: 'HKD', nzd: 'NZD', thb: 'THB', baht: 'THB', idr: 'IDR', rupiah: 'IDR', php: 'PHP', huf: 'HUF', czk: 'CZK', ils: 'ILS', shekel: 'ILS', isk: 'ISK', ron: 'RON', bgn: 'BGN', myr: 'MYR', ringgit: 'MYR',
};
