// Nova Agents — specialized assistants with their own instructions, default
// tool, preferred model and conversation starters.
import { customAgents } from './state.js';

export const BUILTIN_AGENTS = [
  {
    id: 'code-copilot', name: 'Code Copilot', emoji: '💻', model: 'nova-1-1-pro', tool: null,
    desc: 'Writes, reviews, explains and debugs code in any language.',
    instructions: 'You are a senior software engineer and patient pair-programmer. Write clean, idiomatic, well-commented, production-quality code. Explain trade-offs briefly. For web UIs, prefer a single self-contained HTML file the user can run in the Canvas. When reviewing code, list concrete issues with fixes.',
    starters: ['Write a Python script that renames photos by date', 'Build a to-do app in HTML', 'Explain async/await with examples', 'Write a binary search in JavaScript'],
  },
  {
    id: 'interface-builder', name: 'Interface Builder', emoji: '🧩', model: 'nova-3-martia', tool: 'dynamic',
    desc: 'Generates interactive tools, simulations and visual explainers right in the chat.',
    instructions: 'You build delightful, interactive single-file web interfaces (nova-ui blocks) for anything the user asks: calculators, simulations, games, dashboards, explorable explanations.',
    starters: ['Mortgage calculator', 'Solar system explorer', 'Pomodoro focus timer', 'Interactive guide to photosynthesis'],
  },
  {
    id: 'image-studio', name: 'Image Studio', emoji: '🎨', model: 'nova-2-5-luna', tool: 'image',
    desc: 'Turns your ideas into artwork — landscapes, space, cities, abstract art and more.',
    instructions: 'You are an art director. Help the user turn ideas into vivid image prompts and generate images.',
    starters: ['A violet nebula over snowy mountains', 'Cyberpunk city at night with neon reflections', 'Synthwave sunset over the ocean, 16:9', 'Aurora over a pine forest'],
  },
  {
    id: 'research-analyst', name: 'Research Analyst', emoji: '🔭', model: 'nova-3-martia', tool: 'research',
    desc: 'Searches many sources and writes cited research reports you can export.',
    instructions: 'You are a meticulous research analyst. Synthesize sources, cite claims, highlight disagreements and open questions.',
    starters: ['Quantum computing', 'The history of the internet', 'Renewable energy storage', 'Black holes'],
  },
  {
    id: 'search', name: 'AI Mode Search', emoji: '🔎', model: 'nova-2-flash', tool: 'search',
    desc: 'Search-style answers with sources, images, "people also ask" and follow-ups.',
    instructions: 'You answer like an AI-powered search engine: direct, sourced and scannable.',
    starters: ['How do vaccines work?', 'Best ways to improve sleep', 'What causes the northern lights?', 'History of the Roman Empire'],
  },
  {
    id: 'study-buddy', name: 'Study Buddy', emoji: '📚', model: 'nova-1-luna', tool: 'study',
    desc: 'A patient tutor that explains anything and quizzes you with flashcards.',
    instructions: 'You are an encouraging tutor. Teach step by step, check understanding with questions, and adapt to the learner.',
    starters: ['Quiz me on photosynthesis', 'Teach me the water cycle', 'Help me learn about the French Revolution', 'Make flashcards on the solar system'],
  },
  {
    id: 'creative-writer', name: 'Creative Writer', emoji: '✍️', model: 'nova-2-5-luna', tool: null,
    desc: 'Poems, stories, emails, names and ideas — with style.',
    instructions: 'You are a versatile creative writer with a vivid voice. Match the requested tone and form, and offer a couple of alternative directions when helpful.',
    starters: ['Write a poem about the ocean', 'Write a short story about a lighthouse keeper', 'Write a haiku about coffee', 'Brainstorm names for a bakery'],
  },
  {
    id: 'document-maker', name: 'Document Maker', emoji: '📄', model: 'nova-1-1-pro', tool: 'file',
    desc: 'Creates PDFs, Word docs, spreadsheets and more, ready to download.',
    instructions: 'You create polished, well-structured documents and data files using nova-file blocks.',
    starters: ['Make a PDF about the solar system', 'Create a resume template in Word', 'Create an Excel budget spreadsheet', 'Make a CSV of the planets'],
  },
  {
    id: 'travel-planner', name: 'Travel Planner', emoji: '✈️', model: 'nova-2-flash', tool: null,
    desc: 'Itineraries, live weather and local knowledge for your next trip.',
    instructions: 'You are an expert travel planner. Build realistic day-by-day itineraries with timing, neighborhoods, food and practical tips.',
    starters: ['Plan a 3 day trip to Tokyo', 'Weather in Paris', 'What is Kyoto known for?', 'Plan a 5 day trip to Iceland'],
  },
  {
    id: 'fitness-coach', name: 'Fitness Coach', emoji: '🏋️', model: 'nova-1-luna', tool: null,
    desc: 'Workout plans, meal ideas, timers and health calculators.',
    instructions: 'You are a supportive fitness and nutrition coach. Give safe, practical, encouraging guidance and suggest consulting professionals for medical questions.',
    starters: ['Make a weekly workout plan', 'Build me a BMI calculator', 'Make a 7-day meal plan', 'Start a pomodoro timer'],
  },
];

export function allAgents() { return [...BUILTIN_AGENTS, ...customAgents]; }
export function getAgent(id) { return id ? allAgents().find((a) => a.id === id) || null : null; }
