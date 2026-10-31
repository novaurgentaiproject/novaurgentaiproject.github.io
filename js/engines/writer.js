// On-device creative writing: poems, haiku, stories, jokes, emails, ideas and names.
import { rng, hash, pick, capitalize, titleCase } from '../util.js';

const THEMES = {
  ocean: { match: /ocean|sea|wave|tide|shore|beach|surf|coral|sail|harbor|island/, nouns: ['tides', 'salt wind', 'gulls', 'driftwood', 'sea-glass', 'harbor lights', 'foam', 'the deep blue', 'the horizon', 'moonlit water'], adjs: ['restless', 'silver', 'endless', 'salt-bright', 'tidal', 'blue'], verbs: ['crash', 'whisper', 'roll', 'gleam', 'drift'], season: 'summer' },
  space: { match: /star|moon|space|galax|universe|cosmos|planet|night sky|nebula|astronaut|orbit|mars|comet/, nouns: ['starlight', 'constellations', 'the quiet moon', 'comets', 'nebulae', 'the Milky Way', 'silver dust', 'distant suns', 'the dark between stars'], adjs: ['infinite', 'silent', 'luminous', 'ancient', 'velvet', 'violet'], verbs: ['glimmer', 'spin', 'burn', 'wander', 'shine'], season: 'winter' },
  forest: { match: /forest|tree|wood|nature|garden|flower|leaf|moss|meadow|jungle/, nouns: ['moss', 'pine needles', 'birdsong', 'old roots', 'the canopy', 'ferns', 'dappled light', 'wildflowers'], adjs: ['green', 'ancient', 'whispering', 'wild', 'dew-soaked'], verbs: ['sway', 'rustle', 'grow', 'breathe', 'bloom'], season: 'spring' },
  rain: { match: /rain|storm|thunder|cloud|weather/, nouns: ['rain', 'puddles', 'thunder', 'grey clouds', 'wet streets', 'window glass', 'the first drops'], adjs: ['silver', 'soft', 'restless', 'drumming', 'grey'], verbs: ['fall', 'tap', 'wash', 'pour', 'drum'], season: 'autumn' },
  city: { match: /city|town|street|urban|new york|london|tokyo|paris|neon|subway/, nouns: ['neon signs', 'subway trains', 'skyscrapers', 'crosswalks', 'rooftops', 'street lamps', 'midnight diners'], adjs: ['electric', 'sleepless', 'crowded', 'glittering', 'humming'], verbs: ['hum', 'rush', 'flicker', 'echo', 'pulse'], season: 'night' },
  love: { match: /love|heart|romance|crush|valentine|kiss|wife|husband|girlfriend|boyfriend|partner/, nouns: ['your laughter', 'a held hand', 'the space between us', 'a quiet promise', 'heartbeats', 'candlelight', 'shared mornings'], adjs: ['tender', 'golden', 'steady', 'unspoken', 'warm'], verbs: ['hold', 'stay', 'glow', 'return', 'choose'], season: 'spring' },
  autumn: { match: /autumn|fall season|harvest|october|halloween|pumpkin/, nouns: ['falling leaves', 'amber light', 'the harvest moon', 'woodsmoke', 'warm cider', 'crooked branches'], adjs: ['amber', 'crisp', 'rust-red', 'golden', 'smoky'], verbs: ['fall', 'swirl', 'drift', 'fade', 'settle'], season: 'autumn' },
  winter: { match: /winter|snow|ice|frost|christmas|december|cold/, nouns: ['snowfall', 'frost', 'bare branches', 'a hearth fire', 'white fields', 'frozen breath'], adjs: ['white', 'hushed', 'frozen', 'glittering', 'still'], verbs: ['settle', 'glisten', 'drift', 'sleep', 'gleam'], season: 'winter' },
  spring: { match: /spring|blossom|april|bloom|easter/, nouns: ['blossoms', 'new leaves', 'robins', 'April rain', 'green shoots', 'open windows'], adjs: ['fresh', 'tender', 'bright', 'green', 'waking'], verbs: ['bloom', 'unfold', 'sing', 'rise', 'stir'], season: 'spring' },
  summer: { match: /summer|sun|heat|vacation|july|august/, nouns: ['long afternoons', 'sunlight', 'cicadas', 'warm sand', 'lemonade', 'fireflies'], adjs: ['golden', 'lazy', 'bright', 'sun-warmed', 'endless'], verbs: ['shimmer', 'blaze', 'linger', 'dance', 'glow'], season: 'summer' },
  mountain: { match: /mountain|peak|hike|climb|summit|valley|cliff/, nouns: ['peaks', 'snowy ridges', 'thin air', 'eagles', 'granite', 'quiet valleys', 'switchback trails'], adjs: ['towering', 'patient', 'wind-carved', 'ancient', 'blue'], verbs: ['rise', 'stand', 'watch', 'endure', 'call'], season: 'autumn' },
  time: { match: /time|memory|memories|past|childhood|nostalgia|clock|age|grandm|grandp/, nouns: ['old photographs', 'ticking clocks', 'yesterday', 'faded letters', 'echoes', 'the kitchen light'], adjs: ['faded', 'gentle', 'fleeting', 'tender', 'sepia'], verbs: ['fade', 'linger', 'return', 'turn', 'remain'], season: 'autumn' },
  hope: { match: /hope|dream|future|courage|freedom|journey|new beginning|success|goal/, nouns: ['first light', 'open doors', 'a lantern', 'tomorrow', 'wings', 'the open road'], adjs: ['bright', 'brave', 'unbroken', 'rising', 'quiet'], verbs: ['rise', 'soar', 'shine', 'begin', 'open'], season: 'spring' },
  friendship: { match: /friend|friendship|buddy|best friend|team/, nouns: ['shared jokes', 'late-night talks', 'open arms', 'old stories', 'loud laughter', 'long drives'], adjs: ['loyal', 'easy', 'warm', 'familiar', 'steady'], verbs: ['laugh', 'stay', 'wander', 'remember', 'carry'], season: 'summer' },
  music: { match: /music|song|melody|guitar|piano|sing|band|jazz/, nouns: ['melodies', 'a quiet chord', 'the bassline', 'a distant choir', 'rhythm', 'vinyl crackle'], adjs: ['soaring', 'soft', 'aching', 'bright', 'rolling'], verbs: ['sing', 'swell', 'echo', 'play', 'resolve'], season: 'night' },
  coffee: { match: /coffee|tea|cafe|espresso|latte|morning/, nouns: ['steam', 'morning light', 'a ceramic cup', 'dark roast', 'the first sip', 'quiet kitchens'], adjs: ['warm', 'bitter-sweet', 'slow', 'golden', 'quiet'], verbs: ['rise', 'warm', 'wake', 'swirl', 'linger'], season: 'morning' },
  tech: { match: /tech|ai|robot|computer|code|coding|program|software|internet|data|machine|algorithm|nova/, nouns: ['circuits', 'lines of code', 'glowing screens', 'data streams', 'silicon dreams', 'algorithms', 'blinking cursors'], adjs: ['electric', 'tireless', 'luminous', 'humming', 'curious'], verbs: ['compute', 'hum', 'learn', 'glow', 'connect'], season: 'night' },
  cat: { match: /\bcats?\b|kitten|kitty/, nouns: ['soft paws', 'whiskers', 'a sunlit windowsill', 'slow purring', 'velvet ears', 'midnight zoomies'], adjs: ['curious', 'velvet', 'sleepy', 'regal', 'mischievous'], verbs: ['stretch', 'pounce', 'purr', 'nap', 'wander'], season: 'afternoon' },
  dog: { match: /\bdogs?\b|puppy|puppies|pup\b/, nouns: ['wagging tails', 'muddy paws', 'a loyal heart', 'tennis balls', 'the front door', 'sleepy sighs'], adjs: ['loyal', 'joyful', 'muddy', 'faithful', 'bouncing'], verbs: ['run', 'wait', 'leap', 'wag', 'follow'], season: 'summer' },
  fire: { match: /fire|flame|candle|ember|campfire|phoenix|dragon/, nouns: ['embers', 'sparks', 'flames', 'smoke', 'glowing ash', 'a brave spark'], adjs: ['fierce', 'flickering', 'golden', 'restless', 'burning'], verbs: ['burn', 'dance', 'leap', 'glow', 'roar'], season: 'night' },
  default: { match: /.^/, nouns: ['quiet light', 'the wind', 'small wonders', 'the open road', 'morning', 'distant voices', 'the evening sky'], adjs: ['quiet', 'bright', 'gentle', 'wild', 'luminous', 'patient'], verbs: ['shine', 'wander', 'rise', 'drift', 'glow'], season: 'evening' },
};

export function themeFor(topic) {
  const t = topic.toLowerCase();
  for (const [k, th] of Object.entries(THEMES)) if (k !== 'default' && th.match.test(t)) return th;
  return THEMES.default;
}

function filler(topic, seed) {
  const r = rng(hash(topic) + seed * 7919);
  const th = themeFor(topic);
  const used = new Set();
  const take = (arr) => {
    const avail = arr.filter((x) => !used.has(x));
    const v = pick(avail.length ? avail : arr, r);
    used.add(v);
    return v;
  };
  return { r, th, n: () => take(th.nouns), a: () => take(th.adjs), v: () => take(th.verbs) };
}

export function cleanTopic(text, words) {
  let t = text.replace(/[?.!]+$/, '').trim();
  const re = new RegExp(`^.*?\\b(?:${words})\\b\\s*(?:(?:about|on|of|for|regarding|called|titled|where|that)\\s+)?`, 'i');
  t = t.replace(re, '');
  t = t.replace(/^(a|an|the)\s+(short|long|little|funny|sad|beautiful|cute|epic|creative)\s+/i, '').replace(/\s+(please|for me|thanks?)$/i, '').trim();
  return t || 'the world';
}

const STANZAS = [
  (T, f) => [`In the ${f.a()} hush of ${f.n()},`, `where ${f.n()} learn to fade,`, `${T} keeps a quiet promise`, 'that no clock has ever made.'],
  (T, f) => [`Watch ${f.n()} ${f.v()} at the edges,`, `watch ${f.n()} ${f.v()} and bend —`, `${T} is not a destination,`, 'it is the road that has no end.'],
  (T, f) => [`There is a ${f.a()} kind of magic`, `hidden in ${f.n()}, it's true —`, `a language made of ${f.n()}`, `the ${f.a()} heart once knew.`],
  (T, f) => [`Some days it feels like ${f.n()},`, `some days like ${f.n()} and rain,`, `but ${T} keeps finding me,`, 'again, and again, and again.'],
  (T, f) => [`I have looked for ${T}`, `in ${f.n()} and in ${f.n()},`, `and found it in the ${f.a()} places`, 'where the light comes softly through.'],
  (T, f) => [`And long after ${f.n()},`, `when the ${f.a()} world is still,`, `${T} hums beneath the silence`, 'the way it always will.'],
  (T, f) => [`So let ${f.n()} ${f.v()} on,`, `let ${f.n()} drift and play —`, `${T}, you are the ${f.a()} reason`, 'I keep finding my way.'],
  (T, f) => [`So here's to ${T}, to ${f.n()},`, `to ${f.n()} and all they hold —`, `a ${f.a()} little story`, 'that never quite grows old.'],
];

export function poem(topic, { depth = 2, seed = 0 } = {}) {
  const f = filler(topic, seed);
  const T = topic;
  const count = [2, 3, 3, 4][depth] ?? 3;
  const openers = [0, 4, 2];
  const middles = [1, 3, 5, 2, 4];
  const closers = [6, 7, 5];
  const order = [pick(openers, f.r)];
  while (order.length < count - 1) {
    const c = pick(middles, f.r);
    if (!order.includes(c)) order.push(c);
  }
  let close = pick(closers, f.r);
  if (order.includes(close)) close = closers.find((c) => !order.includes(c)) ?? 7;
  order.push(close);
  const stanzas = order.map((i) => {
    const lines = STANZAS[i](T, f);
    return lines.map((l, k) => (k === 0 || /[.!?—]$/.test(lines[k - 1]) ? capitalize(l) : l)).join('\n');
  });
  const titles = [`${titleCase(f.a())} ${titleCase(topic)}`, `Ode to ${titleCase(topic)}`, `On ${titleCase(topic)}`, `What ${titleCase(topic)} Knows`, `${titleCase(topic)}, at ${titleCase(f.th.season)}`];
  return { title: pick(titles, f.r), body: stanzas.join('\n\n') };
}

export function haiku(topic, { seed = 0 } = {}) {
  const f = filler(topic, seed);
  const season = f.th.season;
  const forms = [
    [`${capitalize(season)} light on ${topic} —`, `${f.n()} ${f.v()} without a sound,`, `the ${f.a()} world holds its breath.`],
    [`${capitalize(f.n())}`, `${topic}, ${f.a()} and slow —`, `even time stands still.`],
    [`A ${f.a()} moment:`, `${topic} beneath ${f.n()},`, `then — only silence.`],
  ];
  return pick(forms, f.r).join('\n');
}

const NAMES = ['Mira', 'Theo', 'Juniper', 'Kai', 'Elena', 'Rowan', 'Ada', 'Felix', 'Noor', 'Iris', 'Silas', 'Luna', 'Orion', 'Wren', 'Mateo', 'Zara', 'Ezra', 'Hazel'];
const PLACES = ['the coastal town of Marrowell', 'a city of glass towers called Lumen', 'the misty valley of Eldervale', 'a research station on the edge of the Arctic', 'a sleepy village at the foot of the Violet Mountains', 'a floating market in the clouds', 'an old lighthouse on Starling Point'];

export function story(premise, { depth = 2, seed = 0 } = {}) {
  const r = rng(hash(premise) + seed * 104729);
  const f = filler(premise, seed);
  const name = pick(NAMES, r);
  const friend = pick(NAMES.filter((n) => n !== name), r);
  const place = pick(PLACES, r);
  const p = premise.replace(/^(a|an|the)\s+/i, '');
  const hero = /^(a|an|the)\s/i.test(premise) ? premise : `someone whose life revolved around ${premise}`;
  const paras = [];
  paras.push(pick([
    `In ${place}, where ${f.n()} met ${f.n()} every evening, there lived ${hero}. Most people called them ${name}, and most people thought they knew everything there was to know about ${name}. They were wrong.`,
    `Nobody in ${place} expected much to happen that ${f.th.season}. But ${name} — ${hero} — had a feeling, the ${f.a()} kind that hums under your ribs and refuses to be ignored.`,
    `Every morning, ${name} walked the same path through ${place}, past ${f.n()} and ${f.n()}, thinking about ${p}. It was, by every measure, an ordinary life. Until the day it wasn't.`,
  ], r));
  paras.push(pick([
    `It began with a small thing: a ${f.a()} light where no light should be. ${name} followed it, heart pounding, and discovered that ${p} was far stranger — and far more important — than anyone had imagined.`,
    `Then came the message. Just one line, written in an unfamiliar hand: "Everything you know about ${p} is about to change." ${name} read it three times before setting out to find who had sent it.`,
    `The trouble started when ${friend}, ${name}'s oldest friend, vanished without a word, leaving behind only a map, a key, and a note that simply said: "${capitalize(p)}. Trust me."`,
  ], r));
  if (depth >= 1) paras.push(pick([
    `"You can't be serious," ${friend} said when ${name} explained the plan. "Nobody has ever tried this."\n\n"That's exactly why it might work," ${name} replied, already packing.`,
    `The journey tested everything ${name} believed. There were ${f.a()} nights and wrong turns, and more than once ${name} wanted to give up. But each time, the thought of ${p} pulled them forward.`,
    `Piece by piece, the truth emerged. ${capitalize(p)} wasn't a problem to be solved — it was a door, and ${name} was one of the few people who could open it.`,
  ], r));
  if (depth >= 2) paras.push(pick([
    `At the edge of everything, with ${f.n()} roaring around them, ${name} finally understood. The answer had never been about strength or luck. It had been about paying attention — to ${f.n()}, to ${friend}, to the quiet voice that had been right all along.`,
    `When the moment came, it was smaller than ${name} had expected: a choice, made in a single breath. ${name} chose kindness over fear — and the whole of ${place} seemed to exhale.`,
  ], r));
  if (depth >= 3) paras.push(`Later, people would tell the story differently. Some said it was magic; others said it was coincidence. ${friend} always laughed at both versions. "It was just ${name}," they'd say, "being stubborn in exactly the right direction."`);
  paras.push(pick([
    `By the time ${f.th.season} came around again, ${place} looked the same as ever. But ${name} knew better. Some adventures don't change the world — they change the person walking through it. And that, it turns out, is how the world changes after all.`,
    `${name} still walks that same path some mornings, past ${f.n()} and ${f.n()}. Only now, they walk it slowly — because they know how much wonder can hide in an ordinary day.`,
  ], r));
  const title = pick([`The ${titleCase(f.a())} ${titleCase(p.split(' ').slice(-1)[0])}`, `${name} and the ${titleCase(p.split(' ').slice(0, 3).join(' '))}`, `What ${name} Found`, `A ${titleCase(f.th.season)} in ${place.replace(/^the .*? of |^a |^an |^the /i, '').split(' ').map(capitalize).join(' ')}`], r);
  return { title, body: paras.join('\n\n') };
}

const JOKES = [
  { t: /program|code|coder|developer|computer|software|bug|java|python/, j: "Why do programmers prefer dark mode?\n\nBecause light attracts bugs. 🐛" },
  { t: /program|code|developer|computer/, j: "A SQL query walks into a bar, walks up to two tables and asks…\n\n\"Can I join you?\"" },
  { t: /program|code|developer/, j: "There are 10 kinds of people in the world: those who understand binary, and those who don't." },
  { t: /math|number|algebra/, j: "Why was the equal sign so humble?\n\nBecause it knew it wasn't less than or greater than anyone else." },
  { t: /math|number/, j: "Parallel lines have so much in common.\n\nIt's a shame they'll never meet." },
  { t: /science|chemistry|atom/, j: "Never trust an atom.\n\nThey make up everything." },
  { t: /space|astronaut|moon|star|planet/, j: "How do you organize a space party?\n\nYou planet. 🪐" },
  { t: /space|moon/, j: "I tried to make a reservation at the restaurant on the moon…\n\nGreat food, but no atmosphere." },
  { t: /cat|kitten/, j: "Why did the cat sit on the computer?\n\nTo keep an eye on the mouse. 🐭" },
  { t: /dog|puppy/, j: "What do you call a dog magician?\n\nA labracadabrador. 🐶" },
  { t: /animal|cow/, j: "What do you call a cow with no legs?\n\nGround beef." },
  { t: /food|pizza|cheese/, j: "Want to hear a joke about pizza?\n\nNever mind — it's too cheesy. 🍕" },
  { t: /coffee/, j: "How does Moses make his coffee?\n\nHebrews it. ☕" },
  { t: /ai|robot/, j: "Why did the AI go to therapy?\n\nIt had too many unresolved dependencies. 🤖" },
  { t: /school|teacher|student/, j: "Why did the student eat his homework?\n\nBecause the teacher said it was a piece of cake." },
  { t: /music/, j: "Why did the piano get locked out of the house?\n\nIt couldn't find the right keys. 🎹" },
  { t: /weather|rain/, j: "What did one raindrop say to the other?\n\n\"Two's company, three's a cloud.\"" },
  { t: /.*/, j: "I'm reading a book about anti-gravity.\n\nIt's impossible to put down." },
  { t: /.*/, j: "Why don't skeletons fight each other?\n\nThey don't have the guts." },
  { t: /.*/, j: "I only know 25 letters of the alphabet.\n\nI don't know y." },
  { t: /.*/, j: "What do you call a fake noodle?\n\nAn impasta. 🍝" },
  { t: /.*/, j: "Why did the scarecrow win an award?\n\nBecause he was outstanding in his field. 🌾" },
  { t: /.*/, j: "I told my wife she was drawing her eyebrows too high.\n\nShe looked surprised." },
  { t: /.*/, j: "What did the ocean say to the beach?\n\nNothing — it just waved. 🌊" },
];

export function joke(topic = '', seed = 0) {
  const r = rng(hash(topic) + seed * 31 + Date.now() % 997);
  const specific = JOKES.filter((x) => x.t.source !== '.*' && x.t.test(topic.toLowerCase()));
  return pick(specific.length ? specific : JOKES.filter((x) => x.t.source === '.*'), r).j;
}

export function email(text, { name = '' } = {}) {
  const t = text.toLowerCase();
  const to = (/\bto (?:my |our |the )?([a-z]+(?: [a-z]+)?)\b/i.exec(text)?.[1] || 'there').replace(/\b(about|asking|regarding|for)\b.*$/, '').trim();
  const about = (/\b(?:about|regarding|for|asking (?:for|about)?)\s+(.+)$/i.exec(text)?.[1] || 'the matter we discussed').replace(/[.?!]$/, '');
  const sign = name || '[Your name]';
  const formal = /boss|manager|professor|client|team|hr|recruiter|landlord|customer|teacher|supervisor/.test(to);
  const greet = /boss|manager|supervisor/.test(to) ? 'Dear [Manager\'s name]' : formal ? `Dear ${capitalize(to)}` : to === 'there' ? 'Hi there' : `Hi ${capitalize(to)}`;
  let subject, body;
  if (/sick|leave|day off|absence|vacation|time off/.test(t)) {
    const what = /\b(a day off|days? off|time off|leave|vacation|sick day)\b/i.exec(about)?.[0] || 'time off';
    subject = `Time off request`;
    body = `I hope you're doing well. I'd like to request ${what.toLowerCase()} on [date(s)]${/sick/.test(t) ? ', as I\'m not feeling well' : ''}. I'll make sure my current work is covered and up to date beforehand, and I'm happy to coordinate a handover with the team.\n\nPlease let me know if this works, or if you need any additional information.`;
  } else if (/sorry|apolog/.test(t)) {
    subject = `My apologies — ${about}`;
    body = `I want to sincerely apologize for ${about}. That wasn't the standard I hold myself to, and I understand the inconvenience it caused.\n\nTo make things right, I've already taken steps to make sure it doesn't happen again. I really appreciate your patience and understanding.`;
  } else if (/thank/.test(t)) {
    subject = `Thank you!`;
    body = `I just wanted to take a moment to say thank you for ${about}. It genuinely made a difference, and I really appreciate the time and care you put into it.\n\nI'm grateful to have you in my corner.`;
  } else if (/resign|quit/.test(t)) {
    subject = 'Resignation';
    body = `Please accept this email as formal notice of my resignation. My last working day will be [date], in line with my notice period.\n\nI'm grateful for the opportunities I've had here and for everything I've learned. I'll do everything I can to ensure a smooth transition.`;
  } else if (/follow.?up|following up|checking in/.test(t)) {
    subject = `Following up — ${about}`;
    body = `I hope your week is going well. I wanted to follow up on ${about}. Do you have any updates, or is there anything else you need from me to move forward?\n\nThanks so much — looking forward to hearing from you.`;
  } else if (/complain|refund|broken|problem|issue/.test(t)) {
    subject = `Issue with ${about}`;
    body = `I'm writing about a problem with ${about}. Unfortunately, it hasn't worked as expected: [briefly describe what happened, with dates or order numbers].\n\nCould you please help resolve this — either with a replacement or a refund? I've attached any relevant details. Thank you for your help.`;
  } else if (/invit|party|event|meeting/.test(t)) {
    subject = `You're invited: ${about}`;
    body = `I'd love for you to join us for ${about}.\n\n**When:** [date & time]\n**Where:** [location / link]\n\nLet me know if you can make it — it wouldn't be the same without you!`;
  } else if (/job|position|application|cover letter|apply/.test(t)) {
    subject = `Application — ${about}`;
    body = `I'm excited to apply for ${about}. With my background in [your field] and a track record of [key achievement], I'm confident I can make a strong contribution to your team.\n\nWhat draws me to this role is [specific reason]. I'd welcome the chance to discuss how my experience aligns with your goals. Thank you for your time and consideration.`;
  } else {
    subject = capitalize(about);
    body = `I hope you're doing well. I'm reaching out about ${about}.\n\n[Add the key details here — what you need, by when, and any context that helps.]\n\nPlease let me know if you have any questions. Thanks in advance!`;
  }
  return `**Subject:** ${subject}\n\n${greet},\n\n${body}\n\nBest regards,\n${sign}`;
}

const IDEA_BANKS = {
  gift: ['A personalized photo book of favorite memories', 'An experience day (cooking class, pottery, hot-air balloon)', 'A cozy weighted blanket', 'A subscription box matched to their hobby', 'A custom star map of a meaningful night', 'A high-quality notebook and pen set', 'A plant with a handwritten care card', 'Tickets to a concert or show they love', 'A DIY "open when…" letter bundle', 'A smart mug that keeps drinks warm'],
  date: ['Sunset picnic with homemade snacks', 'Cook a new cuisine together', 'Stargazing with a sky-map app', 'Visit a museum and pick each other\'s favorite piece', 'Pottery or painting class', 'Board-game café night', 'Sunrise hike and breakfast after', 'Build a blanket fort and movie marathon', 'Explore a farmers market and cook what you find', 'Write letters to your future selves'],
  party: ['Neon glow party with UV lights', 'Retro 80s arcade night', 'Murder-mystery dinner', 'Space odyssey — deep blue and violet decor', 'Backyard film festival', 'Masquerade ball', 'Tropical luau', 'Game-show night with buzzers', 'Decades dress-up party', 'Cozy cabin pajama party'],
  business: ['Local meal-prep service for busy professionals', 'Mobile phone repair micro-shop', 'Pet sitting & dog-walking app for your neighborhood', 'Eco-friendly cleaning products refill station', 'Online tutoring in a niche subject', 'Custom 3D-printed gifts', 'Social-media management for small restaurants', 'Second-hand designer clothing curation', 'Smart-home installation service', 'Plant subscription for offices'],
  app: ['A habit tracker that adapts goals to your energy level', 'A shared grocery list that auto-sorts by store aisle', 'A plant-care reminder app using photo diagnosis', 'A local events map for spontaneous plans', 'A focus timer that turns sessions into a growing galaxy', 'A recipe app that cooks from what\'s in your fridge', 'A language buddy that chats only in the target language', 'A budget app that rounds up into savings goals', 'A study planner that builds spaced-repetition schedules', 'A journal that turns entries into a mood map'],
  project: ['Build a personal portfolio site with a blog', 'Make a weather dashboard using a free API', 'Create a Discord-style chat app with WebSockets', 'Write a CLI to-do manager with tags', 'Build a URL shortener with analytics', 'Make a browser extension that blocks distractions', 'Create a recipe recommender from ingredients', 'Build a multiplayer tic-tac-toe', 'Write a markdown note app with search', 'Make a budget tracker with charts'],
  content: ['A "day in the life" series', 'Beginner mistakes and how to avoid them', 'Myth vs. fact quick hits', 'A 30-day challenge with daily updates', 'Behind-the-scenes of how you work', 'Top 5 tools you can\'t live without', 'Reacting to old content of yours', 'Interview an expert in your niche', 'Step-by-step tutorial for a common problem', 'Answering audience questions live'],
  weekend: ['Take a day trip to a nearby town', 'Try a new recipe for brunch', 'Go on a photography walk', 'Visit a local market', 'Start a puzzle or LEGO build', 'Have a digital-detox afternoon', 'Volunteer for a few hours', 'Do a home "reset" and declutter one room', 'Plan a themed movie night', 'Go for a sunrise or sunset walk'],
};

export function ideas(topic, count = 8, seed = 0) {
  const t = topic.toLowerCase();
  const key = /gift|present/.test(t) ? 'gift' : /date/.test(t) ? 'date' : /party|birthday|celebrat|theme/.test(t) ? 'party'
    : /business|startup|side hustle|money/.test(t) ? 'business' : /\bapp\b|apps/.test(t) ? 'app' : /project|coding|programming|portfolio/.test(t) ? 'project'
    : /youtube|tiktok|content|video|blog|post|instagram/.test(t) ? 'content' : /weekend|bored|fun|today/.test(t) ? 'weekend' : null;
  const r = rng(hash(topic) + seed);
  if (key) {
    const arr = [...IDEA_BANKS[key]].sort(() => r() - 0.5);
    return arr.slice(0, count);
  }
  const T = topic.replace(/^(some|a few|\d+)\s+/i, '');
  const frames = [
    `Start a small ${T} challenge: one tiny action every day for 30 days`,
    `Create a beginner's guide to ${T} — what you wish you'd known`,
    `Turn ${T} into a game with points, levels and rewards`,
    `Find a local or online community around ${T} and host a meetup`,
    `Make a visual mood board that captures the feel of ${T}`,
    `Combine ${T} with a completely different field and see what emerges`,
    `Interview three people with very different views on ${T}`,
    `Document your ${T} journey publicly as a mini-series`,
    `Design a ${T} toolkit: templates, checklists and resources`,
    `Run a "worst idea first" brainstorm on ${T} — then flip each one`,
  ];
  return frames.sort(() => r() - 0.5).slice(0, count);
}

export function names(topic, count = 10, seed = 0) {
  const r = rng(hash(topic) + seed);
  const stem = (topic.match(/[a-z]+/gi) || ['nova']).sort((a, b) => b.length - a.length)[0].toLowerCase();
  const s = stem.slice(0, Math.min(stem.length, 6));
  const pre = ['Nova', 'Lumi', 'Astra', 'Velo', 'Orbi', 'Zen', 'Echo', 'Pixel', 'Bloom', 'Kite', 'Aura', 'Vanta', 'Flux', 'Sol'];
  const suf = ['ly', 'ify', 'io', 'hub', 'lab', 'nest', 'craft', 'wave', 'verse', 'loop', 'spark', 'works'];
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < 100) {
    const k = Math.floor(r() * 4);
    let n;
    if (k === 0) n = pick(pre, r) + capitalize(s);
    else if (k === 1) n = capitalize(s) + pick(suf, r);
    else if (k === 2) n = pick(pre, r) + pick(suf, r);
    else n = `The ${capitalize(stem)} ${pick(['Collective', 'Studio', 'Co.', 'Club', 'Project', 'House'], r)}`;
    out.add(n);
  }
  return [...out];
}
