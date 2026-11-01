# ✦ Nova

Nova is an AI assistant that runs entirely as a static website, so it can be hosted free on GitHub Pages. The layout follows familiar chat-assistant conventions, styled in deep blue and violet.

**Live site:** https://novaurgentaiproject.github.io

## The six models

| Model | Personality | When Claude is connected |
|---|---|---|
| **Nova 3 Martia** *(flagship)* | Deep reasoning, interactive interfaces, research | Claude Opus 5.5 · high effort |
| **Nova 2.5 Luna** | Creative, expressive, loves making images | Claude Sonnet 5.5 · high |
| **Nova 2 Flash** *(default)* | Fast, sharp everyday model | Claude Sonnet 5.5 · low |
| **Nova 1.1 Pro** | Structured, professional, strong at code | Claude Sonnet 5.5 · medium |
| **Nova 1 Luna** | Warm and conversational | Claude Haiku 5.5 · medium |
| **Nova 1 Flash** | Instant, very concise | Claude Haiku 5.5 · low |

You can change which Claude model and effort level each Nova model uses in **Settings → Engine & models**.

## Engines

- **On-device (default, free):** works with no account or key. It answers with live facts from Wikipedia, live weather (Open-Meteo), exchange rates (Frankfurter/ECB), math and equation solving, and unit conversion. It also writes code from a template library, poems, stories, emails, plans and files, and it paints images and builds interactive tools. It says plainly when a request needs a full language model.
- **Claude (bring your own Anthropic API key):** paste a key in **Settings → Engine** for full intelligence on all six models. This adds reasoning with visible thinking summaries and vision for images, video frames and PDFs. It can also write custom code and generate interactive interfaces. The browser calls `api.anthropic.com` directly through the official Anthropic SDK, and the key is stored only in that browser's local storage.

## Features

- **The + menu:** add photos and files, upload videos, take a photo, record a voice message, or pick a tool.
- **Tools**
  - **Create image:** Nova Cloud (free Pollinations.ai model), Nova Studio (an on-device procedural painter for landscapes, space, cities and abstract art), or Claude vector illustrations.
  - **AI Mode:** search-style answers with numbered citations, a source panel, an image strip, "People also ask" and follow-up questions.
  - **Dynamic View:** generated interactive interfaces inside the chat. Built-in ones include calculators, mortgage and savings planners, timers, a solar-system explorer, a physics playground, games, a synth, a weather card and visual topic explorers. With Claude, any interface you describe can be generated.
  - **Widget Studio:** ask for any widget ("a tracker for my water", "a scoreboard for Alex and Sam", "a calculator where total = price × quantity") and Nova designs it from building blocks: counters, checklists, logs, ratings, timers, countdowns, calculators, pickers, polls, clocks, graphs and quizzes. Widgets save their data on your device. You can revise them in plain English ("make the goal 10", "add a timer") without losing data, and keep them in **My Widgets**. With Claude connected, Claude designs widgets too.
  - **Canvas:** a side-by-side editor with live HTML/CSS/JS preview, a JS console and in-browser Python (Pyodide).
  - **Deep research:** searches several sources and writes a cited report you can export to PDF, Word or Markdown.
  - **Study and learn:** lessons with interactive quizzes and flashcards.
  - **Create file:** real PDF, Word (.docx), Excel (.xlsx), CSV, Markdown, JSON, HTML and calendar (.ics) files.
  - **Think longer:** asks the model to reason more before answering.
- **Voice:** dictation, voice messages with live transcripts and read-aloud. **Voice mode** (the wave button) is a hands-free spoken conversation: you talk, and Nova answers out loud. It starts speaking while the reply is still being written and picks the most natural voice on your device (or the one you choose). With Claude connected it answers in a short, conversational style. Captions are optional.
- **Attachments:** images (color analysis on-device, full vision with Claude), videos (key-frame extraction), audio, PDF/DOCX/XLSX/CSV and code or text files.
- **Nova Agents:** 10 built-in specialists, and you can create your own.
- **Chats:**
  - History with search (Ctrl/⌘+K), pinning, renaming, branching, response versions, editing and regenerating.
  - Temporary chats that aren't saved.
  - Share links (the chat is compressed into the URL; no server involved).
  - Export to Markdown, PDF, Word, HTML or JSON.
- **Personalization:** your name, custom instructions, personality presets and memory.
- **Polish:** Midnight and Daylight themes, mobile layout, keyboard shortcuts (Ctrl/⌘+/), and it installs as a PWA.

## Running locally

It's plain HTML, CSS and JavaScript (ES modules) with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Project layout

```
index.html            app shell
css/nova.css          theme + all styles
js/app.js             main controller (chats, composer, actions)
js/render.js          message rendering + rich blocks
js/engines/           on-device engine, Claude engine, prompts, knowledge sources
js/tools/             images, files, canvas, AI Mode, research, study, voice, generative UI, Widget Studio
sw.js                 offline service worker
```

## Privacy

- Chats, settings and memory live in your browser (IndexedDB and localStorage).
- With live data on, topic queries go to Wikipedia, Open-Meteo and Frankfurter.
- Nova Cloud image prompts go to Pollinations.ai. Switch to **Nova Studio** in Settings to keep image generation on-device.
- With Claude connected, messages go directly to Anthropic's API under your key.
