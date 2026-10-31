// The Nova model family. Each model has its own personality, depth and
// (when Claude is connected) an underlying Claude model + effort level.

export const MODELS = [
  {
    id: 'nova-3-martia',
    name: 'Nova 3 Martia',
    short: 'Martia',
    gen: '3',
    icon: 'planet',
    badge: 'New',
    colors: ['#2a1fd6', '#b44dff'],
    tagline: 'Our most capable model — deep reasoning, interactive interfaces and research.',
    tags: ['Reasoning', 'Dynamic View', 'Vision', 'Research'],
    speed: 'Thorough',
    depth: 3,
    thinks: true,
    persona: 'You are the flagship of the Nova family. Reason carefully before answering hard questions, and give comprehensive, well-structured, insightful answers. When an interactive tool, simulation, calculator, visualization or explorable layout would genuinely help, build one with a nova-ui block.',
    claude: { model: 'claude-opus-5-5', effort: 'high' },
  },
  {
    id: 'nova-2-5-luna',
    name: 'Nova 2.5 Luna',
    short: 'Luna',
    gen: '2.5',
    icon: 'moon',
    colors: ['#5b2be0', '#c084fc'],
    tagline: 'Creative and expressive — writing, imagery and multimodal storytelling.',
    tags: ['Creative', 'Images', 'Vision'],
    speed: 'Balanced',
    depth: 2,
    thinks: true,
    persona: 'You are Luna: creative, expressive and imaginative. Use vivid, evocative language, strong storytelling and craft. You love making images — offer or create one with a nova-image block when it would delight the user.',
    claude: { model: 'claude-sonnet-5-5', effort: 'high' },
  },
  {
    id: 'nova-2-flash',
    name: 'Nova 2 Flash',
    short: 'Flash',
    gen: '2',
    icon: 'zap',
    colors: ['#1d4ed8', '#7c3aed'],
    tagline: 'Fast, next-generation everyday model with multimodal understanding.',
    tags: ['Fast', 'Vision', 'Code'],
    speed: 'Fast',
    depth: 2,
    thinks: false,
    persona: 'You are Flash: fast, sharp and helpful. Get to the point quickly while staying complete and accurate. Prefer clear structure and short paragraphs.',
    claude: { model: 'claude-sonnet-5-5', effort: 'low' },
  },
  {
    id: 'nova-1-1-pro',
    name: 'Nova 1.1 Pro',
    short: 'Pro',
    gen: '1.1',
    icon: 'diamond',
    colors: ['#1e3a8a', '#6d28d9'],
    tagline: 'Professional-grade analysis, structured answers and solid coding.',
    tags: ['Analysis', 'Code', 'Reasoning'],
    speed: 'Balanced',
    depth: 2,
    thinks: true,
    persona: 'You are Pro: precise, professional and rigorous. Structure answers with headings, bullet points and tables where useful, state assumptions, and write production-quality code.',
    claude: { model: 'claude-sonnet-5-5', effort: 'medium' },
  },
  {
    id: 'nova-1-luna',
    name: 'Nova 1 Luna',
    short: 'Luna',
    gen: '1',
    icon: 'moon',
    colors: ['#4338ca', '#a78bfa'],
    tagline: 'Warm, conversational and imaginative.',
    tags: ['Creative', 'Chat'],
    speed: 'Fast',
    depth: 1,
    thinks: false,
    persona: 'You are Luna (first generation): warm, friendly and conversational, with a gentle playful streak. Keep answers approachable.',
    claude: { model: 'claude-haiku-5-5', effort: 'medium' },
  },
  {
    id: 'nova-1-flash',
    name: 'Nova 1 Flash',
    short: 'Flash',
    gen: '1',
    icon: 'zap',
    colors: ['#2563eb', '#60a5fa'],
    tagline: 'Lightweight and instant for quick questions.',
    tags: ['Fastest'],
    speed: 'Instant',
    depth: 0,
    thinks: false,
    persona: 'You are Flash (first generation): extremely concise. Answer in one to three sentences unless the user clearly needs more.',
    claude: { model: 'claude-haiku-5-5', effort: 'low' },
  },
];

export const DEFAULT_MODEL = 'nova-2-flash';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
];

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS.find((m) => m.id === DEFAULT_MODEL);
}

export function modelGradient(m) {
  return `linear-gradient(135deg, ${m.colors[0]}, ${m.colors[1]})`;
}
