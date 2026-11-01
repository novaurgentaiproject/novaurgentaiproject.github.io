# Nova voice server (James · Fish Audio)

Nova can talk in voice mode and read replies aloud with **James**, a voice on [Fish Audio](https://fish.audio) (voice model `802e3bc2b27e49c2995d23ef70e6ac89`, listed there as "Energetic Male").

Fish Audio doesn't let websites call its API directly: it sends no CORS headers, and its WebSocket API needs an `Authorization` header that browsers can't set. So Nova sends speech requests to a tiny relay that you host for free on Cloudflare Workers. The relay adds the missing headers, only accepts requests from your Nova site, and can keep your Fish Audio API key secret on the server.

Until a voice server is set up, Nova uses the device's built-in voices.

## 1. Get a Fish Audio API key

1. Sign in at [fish.audio](https://fish.audio).
2. Open **API keys** ([fish.audio/app/api-keys](https://fish.audio/app/api-keys)) and create a key.

New accounts start without API credit. Nova first tries the `s2.1-pro` model. If Fish Audio answers "no credit" (402), Nova switches to the free `s2.1-pro-free` model automatically.

## 2. Deploy the voice server

### Option A: in the Cloudflare dashboard (no tools needed)

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages**, choose **Create**, then **Create Worker** (the "Hello World" starter). Name it `nova-voice` and click **Deploy**.
3. Click **Edit code**. Delete everything, paste in the contents of [`worker.js`](worker.js), and click **Deploy**.
4. In the Worker, open **Settings → Variables and Secrets**. Add a variable of type **Secret** named `FISH_API_KEY` whose value is your Fish Audio API key, then deploy.
5. Copy the Worker's address. It looks like `https://nova-voice.your-name.workers.dev`.

### Option B: with Wrangler

```bash
cd voice-server
npx wrangler deploy
npx wrangler secret put FISH_API_KEY   # paste your Fish Audio key when asked
```

### Check that it's running

Open the Worker's address in a browser. You should see something like:

```json
{"service":"nova-voice","ok":true,"serverKey":true,"voice":"802e3bc2b27e49c2995d23ef70e6ac89","originAllowed":true}
```

`serverKey: true` means your API key is stored on the server.

## 3. Connect Nova

1. In Nova, open **Settings → Speech**.
2. Set **Nova's voice** to **James · Fish Audio**.
3. Paste the Worker address into **Voice server address** and click **Check**.
4. Click **Play James**.

Voice mode (the wave button) and read-aloud now use James. If the server or Fish Audio fails (for example a wrong key, no credit or no internet), Nova falls back to the device's voice and shows a short message.

To give **every visitor** James's voice without opening Settings, put your Worker address in `DEFAULT_VOICE_SERVER` in [`js/tools/voice.js`](../js/tools/voice.js).

## Settings reference

| Variable | Required | What it does |
|---|---|---|
| `FISH_API_KEY` (secret) | Recommended | Your Fish Audio API key. Without it, each person must paste their own key in Nova → Settings → Speech. |
| `ALLOWED_ORIGINS` | No | Comma-separated sites allowed to use the server. Defaults to `https://novaurgentaiproject.github.io` plus localhost. Add your own domain here if Nova moves. |
| `FISH_VOICE_ID` | No | Default voice. Defaults to James (`802e3bc2b27e49c2995d23ef70e6ac89`). |
| `LOCK_VOICE` | No | Set to `true` to always use `FISH_VOICE_ID`, whatever the site asks for. |
| `MAX_CHARS` | No | Longest text accepted per request (default 1500). Nova sends short phrases of about 250 characters. |

## Costs and safety

- Fish Audio bills API usage by the amount of text spoken. Nova sends only the text it actually says out loud: spoken replies in voice mode, and messages you tap to read aloud. It skips code, widgets and other blocks.
- If `FISH_API_KEY` is stored on the server, anyone using your Nova site can make Nova speak with your credit. The origin check stops other websites from using your server, but it can't stop someone who scripts requests on purpose. To limit exposure:
  - set a spending limit or keep a small balance on Fish Audio,
  - add a rate-limiting rule for the Worker in Cloudflare, or
  - leave `FISH_API_KEY` unset so each person uses their own key (stored only in their browser).
- Never put your API key in this repository. GitHub Pages sites are public.
