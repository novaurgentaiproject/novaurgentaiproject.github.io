// Screens shown in modals: settings, search, library, agents, shortcuts, share,
// file preview and camera capture.
import { esc, h, download, copyText, relDay, truncate, uid, deflate, bytesToB64url, formatBytes, fileExt, isMac } from './util.js';
import { icon, hydrateIcons } from './icons.js';
import { openModal, toast, confirmDialog, lightbox, promptDialog } from './ui.js';
import { settings, saveSettings, memory, removeMemory, clearMemory, chats, deleteAllChats, exportAll, importAll, customAgents, saveAgents, DEFAULT_SETTINGS, savedWidgets, persistWidgets, removeWidgetState, on } from './state.js';
import { MODELS, CLAUDE_MODELS, EFFORTS, modelGradient } from './models.js';
import { testKey } from './engines/claude.js';
import { listVoices, speak, canSpeak, unlockSpeech, pickVoice, usingFish, fishConfigured, fishProblem, fishVoiceLabel, checkVoiceServer, JAMES_VOICE_ID, DEFAULT_VOICE_SERVER, VOICE_SERVER_GUIDE } from './tools/voice.js';
import { allAgents, BUILTIN_AGENTS } from './agents.js';
import { accountSettingsHTML, bindAccountSettings, signedIn, syncLine, logOut } from './account.js';
import { syncState } from './sync.js';
import { premiumSettingsHTML, bindPremiumSettings, needsPremium, modelLocked, requireModel } from './premium.js';
import { renderMarkdown } from './markdown.js';
import { highlight } from './highlight.js';
import { buildFile, parseCSV, fileKindLabel } from './tools/files.js';
import { wrapUI } from './tools/genui.js';
import { specToHTML, WIDGET_CSS } from './tools/widgetkit.js';
import { mountFrame } from './render.js';

const switchHTML = (key, on) => `<label class="switch"><input type="checkbox" data-set="${key}"${on ? ' checked' : ''}><span></span></label>`;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function openSettings(app, tab = 'general') {
  const tabs = [
    ['general', 'settings', 'General'], ['account', 'user', 'Account'], ['engine', 'cpu', 'Engine & models'], ['personal', 'user', 'Personalization'],
    ['speech', 'volume', 'Speech'], ['premium', 'crown', 'Premium'], ['data', 'table', 'Data controls'], ['about', 'info', 'About Nova'],
  ];
  const body = h(`<div class="settings"><nav class="settings-tabs">${tabs.map(([k, ic, l]) => `<button data-tab="${k}">${icon(ic, 'icon-sm')}${l}</button>`).join('')}</nav><div class="settings-panel"></div></div>`);
  let currentTab = tab;
  // Keep the Account tab live while it's open (login state and sync status).
  const offs = [
    on('account', () => { if (currentTab === 'account' && panel.isConnected) show('account'); }),
    on('sync', () => {
      const line = currentTab === 'account' && panel.querySelector('[data-syncline]');
      if (line) { line.textContent = syncLine(); line.className = `s-help acct-sync ${syncState.status}`; }
    }),
  ];
  const m = openModal({ title: 'Settings', body, size: 'wide', className: 'settings-modal', onClose: () => offs.forEach((off) => off()) });
  m.body.style.padding = '0';
  m.body.style.display = 'flex';
  const panel = body.querySelector('.settings-panel');
  const show = (t) => {
    currentTab = t;
    body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    panel.innerHTML = PANELS[t]();
    hydrateIcons(panel);
    bind(t);
  };
  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => show(b.dataset.tab)));

  const PANELS = {
    general: () => `
<div class="setting"><div><div class="s-label">Theme</div><div class="s-help">Midnight (deep blue & violet) or Daylight.</div></div>
<div class="seg" data-seg="theme">${[['dark', 'moon', 'Midnight'], ['light', 'sun', 'Daylight'], ['system', 'monitor', 'System']].map(([v, ic, l]) => `<button data-v="${v}" class="${settings.theme === v ? 'active' : ''}">${icon(ic, 'icon-sm')}${l}</button>`).join('')}</div></div>
<div class="setting"><div><div class="s-label">Text size</div></div><div class="seg" data-seg="fontScale">${[[0.92, 'Small'], [1, 'Default'], [1.08, 'Large']].map(([v, l]) => `<button data-v="${v}" class="${+settings.fontScale === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
<div class="setting"><div><div class="s-label">Default model</div><div class="s-help">Used for new chats.</div></div><select class="field" data-sel="model">${MODELS.map((x) => `<option value="${x.id}"${x.id === settings.model ? ' selected' : ''}>${x.name}${modelLocked(x.id) ? ' (Premium)' : ''}</option>`).join('')}</select></div>
<div class="setting"><div><div class="s-label">Enter to send</div><div class="s-help">When off, use ${isMac ? '⌘' : 'Ctrl'}+Enter to send.</div></div>${switchHTML('sendOnEnter', settings.sendOnEnter)}</div>
<div class="setting"><div><div class="s-label">Show thinking</div><div class="s-help">Display the reasoning summary for thinking models (Martia, Luna 2.5, Pro).</div></div>${switchHTML('showThinking', settings.showThinking)}</div>
<div class="setting"><div><div class="s-label">Live data</div><div class="s-help">Allow Nova to fetch facts, weather and exchange rates from Wikipedia, Open-Meteo and Frankfurter.</div></div>${switchHTML('liveData', settings.liveData)}</div>
<div class="setting"><div><div class="s-label">Keyboard shortcuts</div></div><button class="btn sm" data-open="shortcuts">View</button></div>`,
    engine: () => `
<div class="setting col"><div><h3>Engine</h3><div class="s-help">Choose what powers the six Nova models.</div></div>
<div class="engine-options">
<button class="engine-opt${settings.engine === 'local' ? ' active' : ''}" data-engine="local"><span class="e-ico">${icon('cpu')}</span><span><b>On-device engine</b><small>Free and private. Runs in your browser with live facts (Wikipedia), weather, currency, math, code templates, files, image studio and interactive tools. Limited open-ended reasoning.</small></span></button>
<button class="engine-opt${settings.engine === 'claude' ? ' active' : ''}" data-engine="claude"><span class="e-ico">${icon('sparkles')}</span><span><b>Claude (your Anthropic API key)</b><small>Full intelligence: reasoning, vision for images, video frames & PDFs, writing in any language, custom code and generated interfaces. Calls go directly from your browser to Anthropic.</small></span></button>
</div></div>
<div class="setting col" ${settings.engine === 'claude' ? '' : 'style="opacity:.6"'}><div><div class="s-label">Anthropic API key</div><div class="s-help">Stored only in this browser's local storage. Get a key at <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>. Anyone with access to this browser profile can read it.</div></div>
<div class="inline"><input class="field" type="password" data-key placeholder="sk-ant-…" value="${esc(settings.anthropicKey)}" style="flex:1;min-width:220px" autocomplete="off"><button class="btn sm" data-test>Test key</button>${settings.anthropicKey ? '<button class="btn sm danger" data-clearkey>Remove</button>' : ''}</div><div class="s-help" data-keystatus></div></div>
<div class="setting col"><div><div class="s-label">Model mapping</div><div class="s-help">Which Claude model and effort level powers each Nova model.</div></div>
<table class="map-table">${MODELS.map((x) => { const mp = settings.modelMap[x.id] || x.claude; return `<tr><td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${modelGradient(x)}"></span>${x.name}</span></td><td><select class="field" data-map="${x.id}" data-k="model">${CLAUDE_MODELS.map((c) => `<option value="${c.id}"${c.id === mp.model ? ' selected' : ''}>${c.label}</option>`).join('')}</select></td><td><select class="field" data-map="${x.id}" data-k="effort">${EFFORTS.map((e) => `<option${e === mp.effort ? ' selected' : ''}>${e}</option>`).join('')}</select></td></tr>`; }).join('')}</table>
<div><button class="btn sm" data-resetmap>Reset to defaults</button></div></div>
<div class="setting col"><div><div class="s-label">Image engine</div><div class="s-help">Nova Cloud uses the free Pollinations.ai service (prompts are sent there; rate-limited). Nova Studio paints on your device. With Claude connected, Nova can draw vector illustrations.</div></div>
<div class="seg" data-seg="imageEngine">${[['auto', 'Auto'], ['cloud', 'Nova Cloud'], ['studio', 'Nova Studio'], ['claude', 'Claude vector']].map(([v, l]) => `<button data-v="${v}" class="${settings.imageEngine === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>`,
    personal: () => `
<div class="setting col"><div class="s-label">What should Nova call you?</div><input class="field" data-text="name" value="${esc(settings.name)}" placeholder="Your name"></div>
<div class="setting col"><div><div class="s-label">Nova personality</div></div><div class="seg" data-seg="personality">${[['default', 'Default'], ['cheerful', 'Cheerful'], ['concise', 'Concise'], ['professional', 'Professional'], ['nerdy', 'Nerdy'], ['candid', 'Candid']].map(([v, l]) => `<button data-v="${v}" class="${settings.personality === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
<div class="setting col"><div><div class="s-label">Anything else Nova should know about you?</div><div class="s-help">Interests, values, job, preferences…</div></div><textarea class="field" data-text="about" placeholder="I'm a student who loves astronomy and Python.">${esc(settings.about)}</textarea></div>
<div class="setting col"><div><div class="s-label">How should Nova respond?</div></div><textarea class="field" data-text="style" placeholder="Be concise. Use bullet points. Include examples.">${esc(settings.style)}</textarea></div>
<div class="setting"><div><div class="s-label">Memory</div><div class="s-help">Let Nova remember things you ask it to (e.g. "Remember that I'm vegetarian").</div></div>${switchHTML('memoryEnabled', settings.memoryEnabled)}</div>
<div class="setting col"><div class="inline" style="justify-content:space-between"><div class="s-label">Saved memories (${memory.length})</div>${memory.length ? '<button class="btn sm danger" data-clearmem>Clear memory</button>' : ''}</div>
<div class="memory-list">${memory.length ? memory.map((x) => `<div class="mem"><span>${esc(x.text)}</span><button class="icon-btn" data-delmem="${x.id}" title="Forget">${icon('trash', 'icon-sm')}</button></div>`).join('') : '<div class="s-help">No memories yet.</div>'}</div></div>`,
    speech: () => {
      const voices = listVoices();
      const fish = settings.ttsEngine === 'fish';
      const problem = fishProblem();
      const fishStatus = !fishConfigured() ? 'Not set up yet. Nova uses this device\'s voice until you add a voice server.'
        : problem ? `<span style="color:var(--danger)">${esc(problem.charAt(0).toUpperCase() + problem.slice(1))}.</span>` : '';
      return `
<div class="setting"><div><div class="s-label">Nova's voice</div><div class="s-help">Used for voice mode and read-aloud.</div></div><select class="field" data-ttsengine><option value="fish"${fish ? ' selected' : ''}>${esc(fishVoiceLabel())} · Fish Audio</option><option value="device"${fish ? '' : ' selected'}>This device's voices</option></select></div>
<div class="setting"><div><div class="s-label">Listening</div><div class="s-help">How voice mode hears you. <b>Automatic</b> uses Fish Audio on iPhone, iPad and Safari once the voice server is set up, because their built-in recognition stops hearing after Nova talks. Everywhere else it uses the browser's speech recognition.</div></div><select class="field" data-sel="listenEngine">${[['auto', 'Automatic'], ['device', 'Browser speech recognition'], ['cloud', 'Fish Audio (voice server)']].map(([v, l]) => `<option value="${v}"${(settings.listenEngine || 'auto') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
${fish ? `<div class="setting col voice-server">
<div class="s-label">${esc(fishVoiceLabel())} · Fish Audio</div>
<div class="s-help">Fish Audio doesn't accept requests straight from websites, so Nova reaches it through a small <b>Nova voice server</b> that you host for free on Cloudflare. <a href="${VOICE_SERVER_GUIDE}" target="_blank" rel="noopener">How to set it up (about 5 minutes)</a></div>
<label class="vs-field"><span>Voice server address</span><span class="inline"><input class="field" data-fishserver placeholder="${esc(DEFAULT_VOICE_SERVER || 'https://nova-voice.your-name.workers.dev')}" value="${esc(settings.fishServer)}" autocomplete="off" spellcheck="false" inputmode="url"><button class="btn sm" data-fishcheck>Check</button></span></label>
<label class="vs-field"><span>Fish Audio API key <em>optional: only if your voice server doesn't store one</em></span><input class="field" type="password" data-fishkey placeholder="Paste your Fish Audio API key" value="${esc(settings.fishKey)}" autocomplete="off"></label>
<div class="vs-row">
<label class="vs-field"><span>Voice model ID</span><input class="field" data-fishvoice value="${esc(settings.fishVoice)}" placeholder="${JAMES_VOICE_ID}" autocomplete="off" spellcheck="false"></label>
<label class="vs-field"><span>Fish model</span><select class="field" data-fishmodel>${[['s2.1-pro', 'S2.1 Pro (best)'], ['s2.1-pro-free', 'S2.1 Pro Free'], ['s2-pro', 'S2 Pro'], ['s1', 'S1 (retiring)']].map(([v, l]) => `<option value="${v}"${settings.fishModel === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
</div>
<div class="inline"><button class="btn sm" data-fishtest>${icon('volume', 'icon-sm')} Play ${esc(fishVoiceLabel())}</button><span class="s-help" data-fishstatus>${fishStatus}</span></div>
</div>` : ''}
<div class="setting"><div><div class="s-label">${fish ? 'Backup voice' : 'Voice'}</div><div class="s-help">${fish ? `This device's voice, used when ${esc(fishVoiceLabel())} isn't available.` : 'Used for read-aloud and voice mode.'}</div></div><select class="field" data-sel="voice"><option value="">Automatic${!settings.voice && pickVoice() ? ` (${esc(pickVoice().name)})` : ' (most natural voice)'}</option>${voices.map((v) => `<option value="${esc(v.voiceURI)}"${v.voiceURI === settings.voice ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></div>
<div class="setting"><div><div class="s-label">Speaking rate</div></div><div class="inline"><input type="range" min="0.6" max="1.6" step="0.1" value="${settings.speechRate}" data-range="speechRate" style="width:160px"><span data-ratev>${settings.speechRate}×</span></div></div>
<div class="setting"><div><div class="s-label">Read responses aloud automatically</div></div>${switchHTML('autoRead', settings.autoRead)}</div>
<div class="setting"><div><div class="s-label">Test voice</div></div><button class="btn sm" data-testvoice ${canSpeak ? '' : 'disabled'}>${icon('volume', 'icon-sm')} Play sample</button></div>`;
    },
    premium: () => premiumSettingsHTML(),
    account: () => accountSettingsHTML(),
    data: () => `
<div class="setting"><div><div class="s-label">Export data</div><div class="s-help">Download all chats, memories and agents as JSON (your API key is not included).</div></div><button class="btn sm" data-export>${icon('download', 'icon-sm')} Export</button></div>
<div class="setting"><div><div class="s-label">Import data</div><div class="s-help">Restore from a Nova export file.</div></div><button class="btn sm" data-import>${icon('upload', 'icon-sm')} Import</button></div>
<div class="setting"><div><div class="s-label">Storage used</div><div class="s-help">${chats.size} chats stored in this browser.</div></div><span data-usage class="s-help">…</span></div>
<div class="setting"><div><div class="s-label">Delete all chats</div></div><button class="btn sm danger" data-delchats>Delete all</button></div>
<div class="setting"><div><div class="s-label">Reset Nova</div><div class="s-help">Clears settings, memory, agents and chats from this browser.</div></div><button class="btn sm danger" data-reset>Reset everything</button></div>`,
    about: () => `
<div style="display:flex;gap:14px;align-items:center;padding:14px 0"><img src="assets/nova-logo.svg" alt="" style="width:48px;height:48px;filter:drop-shadow(0 0 14px rgba(139,108,255,.6))"><div><h3 style="margin:0;font-size:20px">Nova</h3><div class="s-help">Six models · on-device engine + optional Claude · built for GitHub Pages</div></div></div>
${MODELS.map((x) => `<div class="setting"><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="background:${modelGradient(x)};border-radius:10px">${icon(x.icon, 'icon-sm')}</span><div><div class="s-label">${x.name} ${needsPremium(x.id) ? `<span class="tag premium">${icon('crown', 'icon-xs')}Premium</span>` : x.badge ? `<span class="tag new">${x.badge}</span>` : ''}</div><div class="s-help">${esc(x.tagline)}</div></div></div><span class="tag">${x.speed}</span></div>`).join('')}
<p class="s-help" style="margin-top:14px">Live data: Wikipedia (CC BY-SA), Open-Meteo, Frankfurter (ECB rates). Optional cloud images: Pollinations.ai. Claude access via the official Anthropic SDK. Python runs via Pyodide; PDF reading via PDF.js.</p>`,
  };

  function bind(t) {
    panel.querySelectorAll('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      const k = seg.dataset.seg;
      const v = k === 'fontScale' ? +b.dataset.v : b.dataset.v;
      saveSettings({ [k]: v });
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      app.applySettings();
    })));
    panel.querySelectorAll('[data-set]').forEach((inp) => (inp.onchange = () => { saveSettings({ [inp.dataset.set]: inp.checked }); app.applySettings(); }));
    panel.querySelectorAll('[data-sel]').forEach((sel) => (sel.onchange = () => { saveSettings({ [sel.dataset.sel]: sel.value }); app.applySettings(); }));
    panel.querySelectorAll('[data-text]').forEach((inp) => (inp.oninput = () => { saveSettings({ [inp.dataset.text]: inp.value }); app.applySettings(); }));
    panel.querySelector('[data-open="shortcuts"]')?.addEventListener('click', () => openShortcuts());
    const defModel = panel.querySelector('[data-sel="model"]');
    if (defModel) defModel.onchange = () => {
      const id = defModel.value;
      if (!requireModel(id, { onUnlock: () => { saveSettings({ model: id }); app.applySettings(); if (panel.isConnected) show(t); } })) { defModel.value = settings.model; return; }
      saveSettings({ model: id });
      app.applySettings();
    };
    if (t === 'account') bindAccountSettings(panel, () => { if (panel.isConnected) show('account'); });
    if (t === 'premium') bindPremiumSettings(panel, () => { if (panel.isConnected) show('premium'); });
    if (t === 'engine') {
      panel.querySelectorAll('[data-engine]').forEach((b) => (b.onclick = () => {
        saveSettings({ engine: b.dataset.engine });
        app.applySettings();
        show('engine');
        if (b.dataset.engine === 'claude' && !settings.anthropicKey) setTimeout(() => panel.querySelector('[data-key]')?.focus(), 50);
      }));
      const key = panel.querySelector('[data-key]');
      const st = panel.querySelector('[data-keystatus]');
      key.onchange = () => { saveSettings({ anthropicKey: key.value.trim() }); app.applySettings(); };
      panel.querySelector('[data-test]').onclick = async () => {
        saveSettings({ anthropicKey: key.value.trim() });
        st.textContent = 'Testing…';
        try {
          await testKey(settings.anthropicKey, settings.modelMap['nova-1-flash']?.model || 'claude-haiku-5-5');
          st.innerHTML = `<span style="color:var(--success)">✓ Key works — Claude is ready.</span>`;
          if (settings.engine !== 'claude') { saveSettings({ engine: 'claude' }); show('engine'); }
          app.applySettings();
        } catch (e) { st.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`; }
      };
      panel.querySelector('[data-clearkey]')?.addEventListener('click', () => { saveSettings({ anthropicKey: '', engine: 'local' }); app.applySettings(); show('engine'); });
      panel.querySelectorAll('[data-map]').forEach((sel) => (sel.onchange = () => {
        const map = { ...settings.modelMap };
        map[sel.dataset.map] = { ...map[sel.dataset.map], [sel.dataset.k]: sel.value };
        saveSettings({ modelMap: map });
      }));
      panel.querySelector('[data-resetmap]').onclick = () => { saveSettings({ modelMap: { ...DEFAULT_SETTINGS.modelMap } }); show('engine'); };
    }
    if (t === 'personal') {
      panel.querySelectorAll('[data-delmem]').forEach((b) => (b.onclick = () => { removeMemory(b.dataset.delmem); show('personal'); }));
      panel.querySelector('[data-clearmem]')?.addEventListener('click', async () => { if (await confirmDialog({ title: 'Clear memory?', text: 'Nova will forget everything it remembered about you.', confirm: 'Clear', danger: true })) { clearMemory(); show('personal'); } });
    }
    if (t === 'speech') {
      const r = panel.querySelector('[data-range]');
      r.oninput = () => { saveSettings({ speechRate: +r.value }); panel.querySelector('[data-ratev]').textContent = r.value + '×'; };
      panel.querySelector('[data-testvoice]').onclick = () => unlockSpeech() || speak(`Hi${settings.name ? ' ' + settings.name : ''}! I'm Nova. This is how I sound.`);
      panel.querySelector('[data-ttsengine]').onchange = (e) => { saveSettings({ ttsEngine: e.target.value }); show('speech'); };
      const fst = panel.querySelector('[data-fishstatus]');
      const say = (html) => { if (fst) fst.innerHTML = html; };
      const server = panel.querySelector('[data-fishserver]');
      if (server) {
        server.onchange = () => {
          const v = server.value.trim();
          saveSettings({ fishServer: v });
          say(/api\.fish\.audio/i.test(v) ? '<span style="color:var(--danger)">That\'s Fish Audio\'s own address. Browsers can\'t call it directly, so use your Nova voice server\'s address.</span>' : '');
        };
        panel.querySelector('[data-fishkey]').onchange = (e) => saveSettings({ fishKey: e.target.value.trim() });
        panel.querySelector('[data-fishmodel]').onchange = (e) => saveSettings({ fishModel: e.target.value });
        panel.querySelector('[data-fishvoice]').onchange = (e) => {
          const id = (/[0-9a-f]{32}/i.exec(e.target.value) || [''])[0].toLowerCase() || JAMES_VOICE_ID;
          e.target.value = id;
          saveSettings({ fishVoice: id, fishVoiceName: id === JAMES_VOICE_ID ? 'James' : 'Fish voice' });
        };
        panel.querySelector('[data-fishcheck]').onclick = async () => {
          saveSettings({ fishServer: server.value.trim() });
          say('Checking…');
          try {
            const info = await checkVoiceServer();
            say(`<span style="color:var(--success)">✓ Connected.</span> ${info.serverKey ? 'The server has its own API key, so you\'re all set.' : settings.fishKey ? 'Using the API key below.' : 'Now paste your Fish Audio API key below, or store it on the server.'}`);
          } catch (err) { say(`<span style="color:var(--danger)">${esc(err.message)}</span>`); }
        };
        panel.querySelector('[data-fishtest]').onclick = () => {
          unlockSpeech();
          if (!usingFish()) { say(fishConfigured() ? esc(fishProblem() || 'Not available right now.') : 'Add your voice server address first.'); return; }
          say('Generating…');
          speak(`Hi${settings.name ? ' ' + settings.name : ''}! I'm Nova, and this is my voice.`, {
            onStart: () => say(usingFish() ? `<span style="color:var(--success)">✓ Playing ${esc(fishVoiceLabel())}.</span>` : `<span style="color:var(--danger)">${esc(fishProblem() || 'It didn\'t work')}.</span> Played the backup voice instead.`),
            onBlocked: () => say('Your browser blocked the audio. Tap Play again.'),
          });
        };
      }
      if (canSpeak && !listVoices().length) speechSynthesis.onvoiceschanged = () => { if (panel.isConnected && body.querySelector('[data-tab="speech"].active')) show('speech'); };
    }
    if (t === 'data') {
      navigator.storage?.estimate?.().then((e) => { const u = panel.querySelector('[data-usage]'); if (u) u.textContent = formatBytes(e.usage || 0); });
      panel.querySelector('[data-export]').onclick = () => download(`nova-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(), null, 2), 'application/json');
      panel.querySelector('[data-import]').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => {
          try { await importAll(JSON.parse(await inp.files[0].text())); toast('Import complete'); app.refresh(); }
          catch (e) { toast(e.message, { type: 'error' }); }
        };
        inp.click();
      };
      panel.querySelector('[data-delchats]').onclick = async () => {
        if (await confirmDialog({ title: 'Delete all chats?', text: signedIn() ? 'This permanently deletes every conversation in your account, on all your devices.' : 'This permanently deletes every conversation stored in this browser.', confirm: 'Delete all', danger: true })) { await deleteAllChats(); app.newChat(); toast('All chats deleted'); show('data'); }
      };
      panel.querySelector('[data-reset]').onclick = async () => {
        const acct = signedIn();
        if (await confirmDialog({ title: 'Reset Nova?', text: `Settings, API key, memory, agents and all chats will be removed from this browser.${acct ? ' You\'ll be logged out; your account and everything synced to it stay safe.' : ''}`, confirm: 'Reset', danger: true })) {
          if (acct) await logOut({ force: true }); // so the reset only affects this device, not the account
          await deleteAllChats({ sync: false });
          ['nova:settings', 'nova:memory', 'nova:agents', 'nova:sync-groups'].forEach((k) => localStorage.removeItem(k));
          location.reload();
        }
      };
    }
  }
  show(tab);
  return m;
}

// ---------------------------------------------------------------------------
// Search chats
// ---------------------------------------------------------------------------
export function openSearch(app) {
  const m = openModal({
    className: 'search-modal',
    headExtra: `<div style="display:flex;align-items:center;gap:10px;flex:1">${icon('search')}<input placeholder="Search chats…" aria-label="Search chats" autofocus></div>`,
    body: '<div class="search-results"></div>',
  });
  const input = m.el.querySelector('input');
  const res = m.el.querySelector('.search-results');
  let focus = 0, items = [];
  const hl = (text, q) => (q ? esc(text).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>') : esc(text));
  const run = () => {
    const q = input.value.trim();
    const list = [...chats.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    items = [];
    if (!q) {
      items.push({ type: 'new' });
      list.slice(0, 12).forEach((c) => items.push({ type: 'chat', chat: c, snip: '' }));
    } else {
      const ql = q.toLowerCase();
      for (const c of list) {
        let snip = '';
        if (!c.title.toLowerCase().includes(ql)) {
          for (const msg of c.messages) {
            const t = msg.role === 'user' ? msg.content : msg.versions?.[msg.active ?? 0]?.content || '';
            const i = t.toLowerCase().indexOf(ql);
            if (i >= 0) { snip = (i > 40 ? '…' : '') + t.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' ') + '…'; break; }
          }
          if (!snip) continue;
        }
        items.push({ type: 'chat', chat: c, snip });
        if (items.length > 30) break;
      }
    }
    focus = 0;
    let lastGroup = '';
    res.innerHTML = items.length ? items.map((it, i) => {
      if (it.type === 'new') return `<button data-i="${i}">${icon('newChat')}<span><b>New chat</b></span></button>`;
      const g = relDay(it.chat.updatedAt);
      const head = g !== lastGroup ? `<div class="search-group">${esc(g)}</div>` : '';
      lastGroup = g;
      return `${head}<button data-i="${i}">${icon('clock')}<span><b>${hl(it.chat.title, q)}</b>${it.snip ? `<small>${hl(it.snip, q)}</small>` : ''}</span></button>`;
    }).join('') : `<div class="empty-state">No chats match “${esc(q)}”.</div>`;
    res.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => pickItem(+b.dataset.i)));
    mark();
  };
  const mark = () => res.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('focus', +b.dataset.i === focus));
  const pickItem = (i) => { const it = items[i]; m.close(); if (!it) return; if (it.type === 'new') app.newChat(); else app.openChat(it.chat.id); };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focus = Math.min(items.length - 1, focus + 1); mark(); res.querySelector('.focus')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focus = Math.max(0, focus - 1); mark(); res.querySelector('.focus')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); pickItem(focus); }
  });
  run();
}

// ---------------------------------------------------------------------------
// Library (all generated + uploaded images)
// ---------------------------------------------------------------------------
export function collectImages() {
  const out = [];
  for (const c of [...chats.values()].sort((a, b) => b.updatedAt - a.updatedAt)) {
    for (const msg of c.messages) {
      if (msg.role === 'assistant') {
        msg.versions.forEach((v) => Object.values(v.artifacts || {}).forEach((a) => { if (a.src) out.push({ src: a.src, prompt: a.prompt || '', chatId: c.id, at: a.at || c.updatedAt, kind: 'generated', label: a.label }); }));
      } else {
        (msg.attachments || []).forEach((a) => { if (a.kind === 'image' && a.dataUrl) out.push({ src: a.dataUrl, prompt: a.name, chatId: c.id, at: msg.createdAt || c.updatedAt, kind: 'uploaded' }); });
      }
    }
  }
  return out;
}

export function openLibrary(app) {
  let filter = 'generated';
  const m = openModal({ title: 'Library', size: 'wide', body: '' });
  const draw = () => {
    const imgs = collectImages().filter((x) => filter === 'all' || x.kind === filter);
    m.body.innerHTML = `<div class="inline" style="margin-bottom:14px;justify-content:space-between"><div class="seg">${[['generated', 'Created'], ['uploaded', 'Uploaded'], ['all', 'All']].map(([v, l]) => `<button data-f="${v}" class="${filter === v ? 'active' : ''}">${l}</button>`).join('')}</div><button class="btn primary sm" data-new>${icon('sparkles', 'icon-sm')} Create image</button></div>
${imgs.length ? `<div class="library-grid">${imgs.map((x, i) => `<div class="lib-item" data-i="${i}"><img src="${esc(x.src)}" alt="${esc(x.prompt)}" loading="lazy"><div class="cap">${esc(x.prompt)}</div></div>`).join('')}</div>`
    : `<div class="empty-state"><div class="big-ico">${icon('library', 'icon-lg')}</div><b>No images yet</b><p>Images you create or upload will appear here.</p></div>`}`;
    m.body.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));
    m.body.querySelector('[data-new]').onclick = () => { m.close(); app.newChat(); app.setTool('image'); };
    m.body.querySelectorAll('.lib-item').forEach((el) => (el.onclick = () => {
      const x = imgs[+el.dataset.i];
      lightbox({
        src: x.src, caption: x.prompt,
        actions: [
          { icon: 'download', label: 'Download', onClick: () => app.downloadImage(x.src, x.prompt) },
          { icon: 'arrowRight', label: 'Open chat', onClick: () => { document.querySelector('.lightbox')?.remove(); m.close(); app.openChat(x.chatId); } },
        ],
      });
    }));
  };
  draw();
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
export function openAgents(app) {
  const m = openModal({ title: 'Nova Agents', size: 'wide', body: '' });
  const draw = () => {
    const custom = customAgents;
    m.body.innerHTML = `<p>Specialized versions of Nova with their own instructions, tools and starters.</p>
<div class="inline" style="justify-content:space-between;margin:6px 0 10px"><b>Featured</b><button class="btn primary sm" data-create>${icon('plus', 'icon-sm')} Create agent</button></div>
<div class="agents-grid">${BUILTIN_AGENTS.map((a) => card(a, false)).join('')}</div>
${custom.length ? `<div style="margin:18px 0 10px"><b>My agents</b></div><div class="agents-grid">${custom.map((a) => card(a, true)).join('')}</div>` : ''}`;
    m.body.querySelectorAll('[data-agent]').forEach((b) => (b.onclick = (e) => {
      if (e.target.closest('[data-del]')) return;
      m.close();
      app.newChat({ agentId: b.dataset.agent });
    }));
    m.body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      if (await confirmDialog({ title: 'Delete agent?', confirm: 'Delete', danger: true })) {
        const i = customAgents.findIndex((x) => x.id === b.dataset.del);
        if (i >= 0) customAgents.splice(i, 1);
        saveAgents(); draw(); app.renderSidebar();
      }
    }));
    m.body.querySelector('[data-create]').onclick = () => openAgentEditor(app, null, draw);
  };
  const card = (a, custom) => `<div class="agent-card" role="button" tabindex="0" data-agent="${esc(a.id)}"><span class="avatar">${esc(a.emoji || '✦')}</span><span><b>${esc(a.name)}</b><small>${esc(a.desc || '')}</small></span>${custom ? `<button class="icon-btn del" data-del="${esc(a.id)}" title="Delete">${icon('trash', 'icon-sm')}</button>` : ''}</div>`;
  draw();
}

export function openAgentEditor(app, agent, onSaved) {
  const a = agent || { id: uid('agent-'), name: '', emoji: '🤖', desc: '', instructions: '', starters: [], tool: null, model: settings.model };
  const emojis = ['🤖', '✦', '🧠', '💡', '🎯', '🧪', '🎨', '📈', '🧭', '🎵', '🌍', '🐍', '⚡', '🦉', '🚀', '🌙'];
  const m = openModal({
    title: agent ? 'Edit agent' : 'Create an agent',
    body: `<div class="setting col"><div class="s-label">Icon</div><div class="emoji-pick">${emojis.map((e) => `<button data-e="${e}" class="${e === a.emoji ? 'active' : ''}">${e}</button>`).join('')}</div></div>
<div class="setting col"><div class="s-label">Name</div><input class="field" data-f="name" value="${esc(a.name)}" placeholder="e.g. Python Tutor" autofocus></div>
<div class="setting col"><div class="s-label">Description</div><input class="field" data-f="desc" value="${esc(a.desc)}" placeholder="What does this agent do?"></div>
<div class="setting col"><div><div class="s-label">Instructions</div><div class="s-help">How should it behave? What should it focus on or avoid? (Used by the Claude engine.)</div></div><textarea class="field" data-f="instructions" rows="5" placeholder="You are a friendly Python tutor who explains with short examples…">${esc(a.instructions)}</textarea></div>
<div class="setting col"><div class="s-label">Conversation starters (one per line)</div><textarea class="field" data-f="starters" rows="3">${esc((a.starters || []).join('\n'))}</textarea></div>
<div class="setting"><div class="s-label">Model</div><select class="field" data-f="model">${MODELS.map((x) => `<option value="${x.id}"${x.id === a.model ? ' selected' : ''}>${x.name}${needsPremium(x.id) ? ' (Premium)' : ''}</option>`).join('')}</select></div>
<div class="setting"><div class="s-label">Default tool</div><select class="field" data-f="tool"><option value="">None</option>${[['search', 'AI Mode'], ['dynamic', 'Dynamic View'], ['image', 'Create image'], ['research', 'Deep research'], ['study', 'Study and learn'], ['canvas', 'Canvas'], ['file', 'Create file'], ['think', 'Think longer']].map(([v, l]) => `<option value="${v}"${a.tool === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save agent</button>',
  });
  let emoji = a.emoji;
  m.body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { emoji = b.dataset.e; m.body.querySelectorAll('[data-e]').forEach((x) => x.classList.toggle('active', x === b)); }));
  m.back.querySelector('[data-save]').onclick = () => {
    const v = (k) => m.body.querySelector(`[data-f="${k}"]`).value.trim();
    if (!v('name')) { toast('Give your agent a name', { type: 'error' }); return; }
    const saved = { ...a, emoji, name: v('name'), desc: v('desc'), instructions: v('instructions'), starters: v('starters').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4), model: v('model'), tool: v('tool') || null };
    const i = customAgents.findIndex((x) => x.id === a.id);
    if (i >= 0) customAgents[i] = saved; else customAgents.push(saved);
    saveAgents();
    m.close();
    toast('Agent saved');
    onSaved?.();
    app.renderSidebar();
  };
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------
export function openShortcuts() {
  const mod = isMac ? '⌘' : 'Ctrl';
  const rows = [
    ['New chat', [mod, 'Shift', 'O']], ['Search chats', [mod, 'K']], ['Toggle sidebar', [mod, 'Shift', 'S']], ['Focus the message box', ['Shift', 'Esc']],
    ['Copy last response', [mod, 'Shift', 'C']], ['Stop generating', ['Esc']], ['Open settings', [mod, ',']], ['Show shortcuts', [mod, '/']], ['Run code in canvas', [mod, 'Enter']],
  ];
  openModal({ title: 'Keyboard shortcuts', size: 'small', body: `<div class="kbd-list">${rows.map(([l, k]) => `<span>${l}</span><span>${k.map((x) => `<kbd>${x}</kbd>`).join('')}</span>`).join('')}</div>` });
}

// ---------------------------------------------------------------------------
// Share & export
// ---------------------------------------------------------------------------
export function chatToMarkdown(chat) {
  return `# ${chat.title}\n\n` + chat.messages.map((m) => {
    if (m.role === 'user') return `**You:** ${m.content}${m.attachments?.length ? `\n\n*Attachments: ${m.attachments.map((a) => a.name).join(', ')}*` : ''}`;
    const v = m.versions[m.active ?? 0];
    return `**Nova:**\n\n${(v.content || '').replace(/```nova-ui[^\n]*\n[\s\S]*?```/g, '*[interactive interface]*').replace(/```nova-image\n([\s\S]*?)```/g, (a, j) => { try { return `*[image: ${JSON.parse(j).prompt}]*`; } catch { return '*[image]*'; } })}`;
  }).join('\n\n---\n\n');
}

async function shareLink(chat) {
  const slim = {
    t: chat.title,
    m: chat.messages.map((m) => (m.role === 'user'
      ? { r: 'u', c: m.content, a: (m.attachments || []).map((a) => a.name) }
      : { r: 'a', c: m.versions[m.active ?? 0].content, md: m.model, s: (m.versions[m.active ?? 0].sources || []).map(({ title, url }) => ({ title, url })), x: Object.fromEntries(Object.entries(m.versions[m.active ?? 0].artifacts || {}).filter(([, v]) => v.src && v.src.startsWith('http')).map(([k, v]) => [k, { src: v.src, label: v.label }])) })),
  };
  const bytes = await deflate(JSON.stringify(slim));
  return `${location.origin}${location.pathname}#share=${bytesToB64url(bytes)}`;
}

export async function openShare(app, chat) {
  const m = openModal({ title: 'Share chat', body: `<p>Anyone with the link can view a read-only copy of this conversation. The chat is encoded inside the link itself — nothing is uploaded to a server. Uploaded files and on-device images aren't included.</p>
<div class="inline"><input class="field" data-link readonly value="Creating link…" style="flex:1"><button class="btn primary sm" data-copy>${icon('link', 'icon-sm')} Copy link</button></div><div class="s-help" data-len style="margin-top:6px"></div>
<div style="margin-top:20px"><b>Export</b></div><div class="inline" style="margin-top:8px">
<button class="btn sm" data-x="md">${icon('fileText', 'icon-sm')} Markdown</button><button class="btn sm" data-x="pdf">${icon('file', 'icon-sm')} PDF</button><button class="btn sm" data-x="docx">${icon('file', 'icon-sm')} Word</button><button class="btn sm" data-x="json">${icon('code', 'icon-sm')} JSON</button><button class="btn sm" data-x="html">${icon('globe', 'icon-sm')} HTML</button></div>` });
  const linkEl = m.body.querySelector('[data-link]');
  try {
    const link = await shareLink(chat);
    linkEl.value = link;
    m.body.querySelector('[data-len]').textContent = link.length > 30000 ? `Long link (${Math.round(link.length / 1000)}k characters) — some apps may truncate it.` : '';
  } catch { linkEl.value = 'Could not create a link in this browser.'; }
  m.body.querySelector('[data-copy]').onclick = async () => { await copyText(linkEl.value); toast('Link copied'); };
  m.body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => exportChat(chat, b.dataset.x)));
}

export function exportChat(chat, fmt) {
  const base = chat.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'nova-chat';
  const md = chatToMarkdown(chat);
  if (fmt === 'md') return download(`${base}.md`, md, 'text/markdown');
  if (fmt === 'json') return download(`${base}.json`, JSON.stringify(chat, null, 2), 'application/json');
  if (fmt === 'pdf') return download(`${base}.pdf`, buildFile(`${base}.pdf`, md));
  if (fmt === 'docx') return download(`${base}.docx`, buildFile(`${base}.docx`, md));
  if (fmt === 'html') {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(chat.title)}</title><style>body{font:16px/1.7 system-ui;max-width:780px;margin:40px auto;padding:0 20px;background:#070a1c;color:#e9ebff}a{color:#b9a7ff}pre{background:#060920;padding:12px;border-radius:12px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #2b3570;padding:6px 10px}hr{border:0;border-top:1px solid #2b3570;margin:28px 0}.code-head{display:none}img{max-width:100%;border-radius:12px}</style></head><body>${renderMarkdown(md)}</body></html>`;
    return download(`${base}.html`, html, 'text/html');
  }
}

// ---------------------------------------------------------------------------
// File preview
// ---------------------------------------------------------------------------
export function previewFile({ name, content, attachment }) {
  const ext = fileExt(name);
  let body = '';
  if (attachment?.kind === 'image') body = `<img src="${esc(attachment.dataUrl)}" style="max-width:100%;border-radius:12px" alt="">`;
  else if (ext === 'pdf' && attachment?.dataUrl) body = `<iframe src="${esc(attachment.dataUrl)}" style="width:100%;height:70vh;border:0;border-radius:12px;background:#fff" title="PDF"></iframe>`;
  else if (ext === 'pdf' || ext === 'docx') body = `<div class="md">${renderMarkdown(content)}</div>`;
  else if (['csv', 'tsv', 'xlsx'].includes(ext)) {
    const rows = parseCSV(content).slice(0, 200);
    body = `<div class="md"><div class="table-wrap"><table><thead><tr>${(rows[0] || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  } else if (ext === 'md' || ext === 'markdown') body = `<div class="md">${renderMarkdown(content)}</div>`;
  else if (ext === 'html' || ext === 'htm' || ext === 'svg') body = `<iframe sandbox="allow-scripts" style="width:100%;height:65vh;border:0;border-radius:12px;background:#fff" title="Preview"></iframe>`;
  else body = `<div class="code-block"><pre><code>${highlight(content || attachment?.text || attachment?.note || '', ext)}</code></pre></div>`;
  const m = openModal({ title: name, size: 'wide', body: `<div class="s-help" style="margin-bottom:10px">${esc(fileKindLabel(name))}</div>${body}`, foot: content != null ? `<button class="btn primary" data-dl>${icon('download', 'icon-sm')} Download</button>` : '' });
  const fr = m.body.querySelector('iframe[sandbox]');
  if (fr) fr.srcdoc = ext === 'svg' ? `<body style="margin:0;display:grid;place-items:center;min-height:100vh">${content}</body>` : content;
  m.back.querySelector('[data-dl]')?.addEventListener('click', () => download(name, buildFile(name, content)));
}

export function previewUI(title, html) {
  const m = openModal({ title, size: 'wide', body: '<iframe sandbox="allow-scripts allow-forms allow-modals" style="width:100%;height:72vh;border:0;border-radius:12px" title="Interface"></iframe>' });
  m.body.querySelector('iframe').srcdoc = wrapUI(html, 'preview', document.documentElement.dataset.theme);
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
export function openCamera() {
  return new Promise((resolve) => {
    let stream = null, facing = 'user', done = false;
    const m = openModal({
      title: 'Take a photo', body: '<div class="camera-view"><video autoplay playsinline muted></video></div><p class="s-help" data-err style="margin-top:8px"></p>',
      foot: `<button class="btn" data-flip>${icon('refresh', 'icon-sm')} Flip</button><button class="btn primary" data-snap>${icon('camera', 'icon-sm')} Capture</button>`,
      onClose: () => { stream?.getTracks().forEach((t) => t.stop()); if (!done) resolve(null); },
    });
    const video = m.body.querySelector('video');
    const start = async () => {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false });
        video.srcObject = stream;
      } catch (e) { m.body.querySelector('[data-err]').textContent = 'Camera unavailable: ' + (e.message || e.name); }
    };
    m.back.querySelector('[data-flip]').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
    m.back.querySelector('[data-snap]').onclick = () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob((blob) => { done = true; m.close(); resolve(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
    };
    start();
  });
}

export { truncate, allAgents };

// ---------------------------------------------------------------------------
// My Widgets
// ---------------------------------------------------------------------------
let iconCSS = false;
function ensureWidgetIcons() {
  if (iconCSS) return;
  iconCSS = true;
  const st = document.createElement('style');
  st.textContent = WIDGET_CSS.slice(WIDGET_CSS.indexOf('/* CSS-drawn icons */'));
  document.head.appendChild(st);
}

const WIDGET_IDEAS = [
  'Make a widget that tracks how much water I drink',
  'Make a packing list widget for my trip',
  'Make a countdown to Christmas',
  'Make a 7 minute tea timer',
  'Make a scoreboard for Alex and Sam',
  'Make a study dashboard',
];

export function openWidgets(app, openId = null) {
  ensureWidgetIcons();
  const m = openModal({ title: 'My Widgets', size: 'wide', body: '' });
  const draw = () => {
    if (!savedWidgets.length) {
      m.body.innerHTML = `<div class="empty-state"><div class="big-ico">${icon('grid', 'icon-lg')}</div><b>No saved widgets yet</b><p>Ask Nova to make one — trackers, calculators, checklists, timers, countdowns, dashboards… Then tap ${icon('bookmark', 'icon-sm')} on it to keep it here.</p>
<div class="inline" style="justify-content:center;margin-top:12px">${WIDGET_IDEAS.map((t) => `<button class="suggest-chip" data-idea="${esc(t)}">${esc(t.replace(/^Make (a |an )?/, ''))}</button>`).join('')}</div></div>`;
      m.body.querySelectorAll('[data-idea]').forEach((b) => (b.onclick = () => { m.close(); app.newChat(); app.send(b.dataset.idea); }));
      return;
    }
    m.body.innerHTML = `<p>Widgets you've saved. Their data is stored on this device.</p><div class="widget-grid">${savedWidgets.map((w) => `<div class="widget-tile" role="button" tabindex="0" data-id="${esc(w.id)}"><span class="wi wi-${esc(w.spec?.icon || 'spark')}"></span><span class="wt-body"><b>${esc(w.title)}</b><small>${w.spec ? `${w.spec.components.length} parts` : 'Interface'} · ${new Date(w.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span><button class="icon-btn" data-del="${esc(w.id)}" title="Delete">${icon('trash', 'icon-sm')}</button></div>`).join('')}</div>
<div style="margin-top:16px"><button class="btn sm" data-new>${icon('plus', 'icon-sm')} Make a new widget</button></div>`;
    m.body.querySelectorAll('.widget-tile').forEach((el) => {
      el.onclick = (e) => { if (!e.target.closest('[data-del]')) openWidgetViewer(app, savedWidgets.find((w) => w.id === el.dataset.id), draw); };
      el.onkeydown = (e) => { if (e.key === 'Enter') el.click(); };
    });
    m.body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      const w = savedWidgets.find((x) => x.id === b.dataset.del);
      if (!w || !(await confirmDialog({ title: 'Delete widget?', text: `“${esc(w.title)}” and its saved data will be removed.`, confirm: 'Delete', danger: true }))) return;
      savedWidgets.splice(savedWidgets.indexOf(w), 1);
      removeWidgetState('saved:' + w.id);
      persistWidgets();
      draw();
    }));
    m.body.querySelector('[data-new]').onclick = () => { m.close(); app.newChat(); app.setTool('dynamic'); };
  };
  draw();
  if (openId) { const w = savedWidgets.find((x) => x.id === openId); if (w) openWidgetViewer(app, w, draw); }
}

function openWidgetViewer(app, w, onChange) {
  if (!w) return;
  const html = w.spec ? specToHTML(w.spec) : w.html;
  const m = openModal({
    size: 'wide', className: 'widget-viewer',
    headExtra: `<div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1"><span class="wi wi-${esc(w.spec?.icon || 'spark')}" style="width:30px;height:30px;border-radius:9px;transform:scale(.8)"></span><h2 style="margin:0;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.title)}</h2></div>
<button class="icon-btn" data-rename title="Rename">${icon('pencil', 'icon-sm')}</button><button class="icon-btn" data-dl title="Download">${icon('download', 'icon-sm')}</button>`,
    body: '<iframe class="widget-frame" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-pointer-lock" title="Widget"></iframe>',
  });
  mountFrame(m.body.querySelector('iframe'), { html, id: 'saved-' + w.id, stateKey: 'saved:' + w.id });
  m.el.querySelector('[data-rename]').onclick = async () => {
    const t = await promptDialog({ title: 'Rename widget', value: w.title });
    if (!t?.trim()) return;
    w.title = t.trim();
    if (w.spec) w.spec.title = w.title;
    persistWidgets();
    m.el.querySelector('h2').textContent = w.title;
    onChange?.();
  };
  m.el.querySelector('[data-dl]').onclick = () => download(`${w.title.replace(/[^\w-]+/g, '-').toLowerCase()}.html`, wrapUI(html, 'export', document.documentElement.dataset.theme), 'text/html');
}
