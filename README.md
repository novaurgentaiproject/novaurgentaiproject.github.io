# ✦ Nova

Nova is an AI assistant that runs entirely as a static website, so it can be hosted free on GitHub Pages. The layout follows familiar chat-assistant conventions, styled in deep blue and violet.

**Live site:** https://novaurgentaiproject.github.io

## The six models

| Model | Personality | When Claude is connected |
|---|---|---|
| **Nova 3 Martia** *(flagship · Premium)* | Deep reasoning, interactive interfaces, research | Claude Opus 5.5 · high effort |
| **Nova 2.5 Luna** | Creative, expressive, loves making images | Claude Sonnet 5.5 · high |
| **Nova 2 Flash** *(default)* | Fast, sharp everyday model | Claude Sonnet 5.5 · low |
| **Nova 1.1 Pro** | Structured, professional, strong at code | Claude Sonnet 5.5 · medium |
| **Nova 1 Luna** | Warm and conversational | Claude Haiku 5.5 · medium |
| **Nova 1 Flash** | Instant, very concise | Claude Haiku 5.5 · low |

You can change which Claude model and effort level each Nova model uses in **Settings → Engine & models**.

## Accounts

People can **log in with Google or an email and password** (Sign in with Apple can be added; see [accounts/README.md](accounts/README.md)). A logged-in account keeps chats, memory, custom agents, personalization and Premium in sync across all their devices. API keys and device settings never leave the device, and Nova still works without an account.

Accounts run on Firebase (free Spark plan), in the `nova-ai-7b8d5` project. [Setup guide](accounts/README.md). **Settings → Account** shows the account and sync status, and has options to change the name or password, log out, or delete the account.

## Nova Premium

Nova 3 Martia needs **Nova Premium**; the other five models are free. Free users see Martia with a lock, and an **Upgrade** button opens the Premium screen. Built-in agents that use Martia run on Nova 2 Flash for free users.

- **Buying:** Premium is sold through a Stripe Payment Link and confirmed by a small Cloudflare Worker. [Set it up](premium-server/README.md). Until then, Nova says sign-ups aren't open yet.
- **James for everyone:** with a Fish Audio key on the premium server, every visitor hears Nova in James's voice (voice mode and read-aloud), and Nova hears them through Fish Audio on every device. Daily limits per visitor and for the whole site cap the cost. [Details](premium-server/README.md#how-jamess-daily-limits-work).
- **Martia included:** members chat with Martia without an API key. The premium server answers with your Claude key, and gives each member a monthly allowance (default $4.70 of Claude usage, set by `MONTHLY_AI_BUDGET`). It counts each message before sending it, so a member can't go over. **Settings → Premium** shows how much is left. When it runs out, members can switch to a free model or use their own Claude key.
- **Premium codes:** unlock Premium for yourself, friends or testers, with or without the server.
- **With accounts on**, buying Premium asks people to log in first, and Premium is saved to their account.
- **Settings → Premium:** shows the membership, the Premium key for other devices (and the Home Screen app), **Manage subscription** (Stripe's billing page), and code entry.

The lock runs in the browser, so it stops normal visitors but not someone who edits the page's code. See [Good to know](premium-server/README.md#good-to-know).

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
- **James's voice (Fish Audio):** Nova speaks with **James**, a natural AI voice from Fish Audio, in voice mode and read-aloud, for everyone. Fish Audio can't be called directly from a web page, so this runs through Nova's server on Cloudflare: the [premium server](premium-server/README.md) with `FISH_API_KEY` set (or, without it, the standalone [voice server](voice-server/README.md)). Until one is set up, Nova uses the device's voices.
- **Listening that works on iPhone and iPad:** Safari's built-in speech recognition goes deaf after audio plays and is unreliable in Home Screen apps. Voice mode works around that: it ends your turn itself when you pause, and it restarts the microphone cleanly after Nova talks. It explains what's wrong if the microphone stops, and you can always type instead. With the voice server set up, Nova records you itself and Fish Audio transcribes, which avoids Safari's recognizer completely.
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
voice-server/         Cloudflare Worker that relays speech to and from Fish Audio (James's voice, listening)
premium-server/       Cloudflare Worker: Nova Premium purchases (Stripe) and members' Martia chats (Claude)
js/premium.js         Nova Premium: the Martia lock, Upgrade screen, codes and membership checks
js/account.js         Accounts: log in with Google or email (Firebase Authentication)
js/sync.js            Account sync of chats, memory, agents, personalization and Premium (Firestore)
accounts/             Firebase setup guide and Firestore security rules
__/auth/, __/firebase/ Firebase's sign-in helper pages, hosted here so Google sign-in shows this site's address
```

## Privacy

- Chats, settings and memory live in your browser (IndexedDB and localStorage).
- With live data on, topic queries go to Wikipedia, Open-Meteo and Frankfurter.
- Nova Cloud image prompts go to Pollinations.ai. Switch to **Nova Studio** in Settings to keep image generation on-device.
- With Claude connected, messages go directly to Anthropic's API under your key.
- With the voice server on, the text Nova speaks, and in Fish Audio listening mode your recorded voice, go through your voice server to Fish Audio. Nothing else is sent.
- Accounts (when logged in): chats, memory, custom agents, personalization and Premium are stored in Firebase under your account, readable only by you. API keys stay on your device.
- Nova Premium: payments happen on Stripe's checkout page. Nova stores your Premium key in your browser and sends it to the premium server to confirm your membership. Members' Nova 3 Martia chats (the conversation and its attachments) go through the premium server to Anthropic's API to be answered; the server keeps only each member's monthly usage total, not the chats.
- James's voice: what Nova says aloud, and voice recordings in voice mode, go through Nova's server to Fish Audio. The server keeps only a daily usage total per visitor (under a scrambled form of their internet address), not the recordings.
