// Image generation:
//  • Nova Studio — on-device procedural painter (landscapes, space, cities, abstract art…)
//  • Nova Cloud  — free hosted image model (Pollinations.ai), falls back to Studio when busy
//  • Claude      — vector illustrations (SVG) written by Claude when a key is connected
import { rng, hash } from '../util.js';
import { settings } from '../state.js';
import { claudeComplete } from '../engines/claude.js';

export const ASPECTS = {
  '1:1': [1024, 1024], '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1152, 864], '3:4': [864, 1152], '3:2': [1216, 810], '2:3': [810, 1216], '21:9': [1536, 658],
};

export function detectAspect(text) {
  const t = text.toLowerCase();
  const m = /\b(\d{1,2})\s*[:x×]\s*(\d{1,2})\b/.exec(t);
  if (m && ASPECTS[`${m[1]}:${m[2]}`]) return `${m[1]}:${m[2]}`;
  if (/wallpaper.*(phone|mobile)|phone wallpaper|portrait|vertical|story|tiktok|poster/.test(t)) return '9:16';
  if (/landscape|wide|banner|desktop|cinematic|panorama|header|thumbnail|youtube/.test(t)) return '16:9';
  return '1:1';
}

export function cleanImagePrompt(text) {
  return text
    .replace(/^\s*(please\s+)?(can you\s+|could you\s+)?(generate|create|make|draw|paint|render|design|produce|show me|give me|imagine)\s+(me\s+)?(an?\s+|the\s+)?((ai\s+)?(image|picture|photo|illustration|drawing|painting|artwork|art|wallpaper|render|logo|icon|portrait)\s+)?(of|showing|with|depicting|for|about)?\s*/i, '')
    .replace(/\s+(please|thanks?)\.?$/i, '')
    .trim() || text.trim();
}

// ---------------------------------------------------------------------------
// Nova Studio — procedural painter
// ---------------------------------------------------------------------------
const COLOR_WORDS = {
  red: 0, crimson: 350, scarlet: 5, orange: 28, amber: 38, gold: 45, golden: 45, yellow: 52, lime: 85, green: 130, emerald: 145, mint: 155, teal: 175, cyan: 188,
  turquoise: 175, aqua: 185, blue: 220, azure: 210, navy: 228, sapphire: 225, indigo: 245, violet: 268, purple: 275, lavender: 265, magenta: 300, pink: 330, rose: 340, fuchsia: 310,
};

function analyze(prompt) {
  const t = prompt.toLowerCase();
  const has = (re) => re.test(t);
  const hues = Object.entries(COLOR_WORDS).filter(([w]) => new RegExp(`\\b${w}\\b`).test(t)).map(([, h]) => h);
  const time = has(/sunset|sunrise|dusk|dawn|golden hour|twilight|evening/) ? 'sunset' : has(/night|midnight|starry|stars|moon|dark/) ? 'night' : 'day';
  const scene = {
    space: has(/space|galaxy|nebula|cosmos|cosmic|universe|planet|astronaut|black hole|solar system|supernova|nova\b/),
    ocean: has(/ocean|sea\b|beach|wave|lake|river|water|coast|shore|island|bay|lagoon/),
    mountains: has(/mountain|peak|alps|hill|valley|cliff|canyon|volcano|ridge/),
    forest: has(/forest|tree|wood|jungle|pine|grove|nature/),
    city: has(/city|skyline|building|cyberpunk|neon|town|metropolis|street|downtown|skyscraper/),
    desert: has(/desert|dune|sand|sahara|arid/),
    aurora: has(/aurora|northern lights|borealis/),
    synth: has(/synthwave|retrowave|vaporwave|outrun|\b80s\b|retro/),
    flowers: has(/flower|garden|meadow|field|bloom|tulip|rose\b|sunflower|lavender field/),
    snow: has(/snow|winter|frozen|ice|arctic/),
    abstract: has(/abstract|pattern|geometric|fractal|fluid|swirl|gradient|texture|art\b|minimal/),
    clouds: has(/cloud|sky|heaven|dream/),
  };
  const style = {
    pixel: has(/pixel|8.?bit|16.?bit/), soft: has(/watercolor|pastel|soft|dreamy|ethereal/), neon: has(/neon|cyberpunk|glow/), minimal: has(/minimal|simple|clean/),
  };
  return { hues, time, scene, style };
}

function hsl(h, s, l, a = 1) { return `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`; }

function ridge(r, n, rough) {
  const pts = new Array(n + 1).fill(0);
  pts[0] = r() ; pts[n] = r();
  let step = n, amp = 1;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < n; i += step) pts[i] = (pts[i - half] + pts[i + half]) / 2 + (r() - 0.5) * amp;
    step = half; amp *= rough;
  }
  return pts;
}

function drawMountains(ctx, W, H, r, { base, height, layers, hue, sat, light, snow, fog }) {
  for (let L = 0; L < layers; L++) {
    const k = L / Math.max(1, layers - 1);
    const pts = ridge(r, 256, 0.55);
    const y0 = base - height * (1 - k * 0.55);
    ctx.beginPath();
    ctx.moveTo(0, H);
    pts.forEach((p, i) => ctx.lineTo((i / 256) * W, y0 + p * height * 0.55 + k * height * 0.35));
    ctx.lineTo(W, H);
    ctx.closePath();
    const l = light - (1 - k) * -2 - k * (light * 0.75);
    const g = ctx.createLinearGradient(0, y0 - height * 0.3, 0, H);
    g.addColorStop(0, hsl(hue + k * 10, sat * (0.5 + k * 0.5), Math.max(4, l + 10)));
    g.addColorStop(1, hsl(hue + k * 10, sat * (0.6 + k * 0.4), Math.max(3, l - 8)));
    ctx.fillStyle = g;
    ctx.fill();
    if (snow && L === 0) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(0, 0, W, y0 + height * 0.12);
      ctx.restore();
    }
    if (fog) {
      const fg = ctx.createLinearGradient(0, y0 + height * 0.2, 0, y0 + height * 0.7);
      fg.addColorStop(0, 'rgba(255,255,255,0)');
      fg.addColorStop(1, fog);
      ctx.fillStyle = fg;
      ctx.fillRect(0, y0, W, height);
    }
  }
}

function drawStars(ctx, W, H, r, count, maxY = H) {
  for (let i = 0; i < count; i++) {
    const x = r() * W, y = r() * maxY, s = r() ** 3 * 2.2 + 0.4;
    ctx.fillStyle = `rgba(255,${235 + r() * 20},${230 + r() * 25},${0.35 + r() * 0.65})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    if (s > 2) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x - s * 4, y); ctx.lineTo(x + s * 4, y); ctx.moveTo(x, y - s * 4); ctx.lineTo(x, y + s * 4); ctx.stroke();
    }
  }
}

function glowOrb(ctx, x, y, rad, inner, outer, glow = 3) {
  const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad * glow);
  g.addColorStop(0, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * glow, 0, Math.PI * 2); ctx.fill();
  const c = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
  c.addColorStop(0, '#fff'); c.addColorStop(0.35, inner); c.addColorStop(1, outer);
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
}

function nebula(ctx, W, H, r, hues) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = W * (0.15 + r() * 0.7) + Math.sin(i) * W * 0.1, y = H * (0.2 + r() * 0.6);
    const rad = (0.08 + r() * 0.28) * Math.max(W, H);
    const h = hues[i % hues.length] + (r() - 0.5) * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, hsl(h, 85, 55, 0.12 + r() * 0.08));
    g.addColorStop(1, hsl(h, 85, 30, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

function planet(ctx, x, y, rad, hue, r, rings) {
  const g = ctx.createRadialGradient(x - rad * 0.4, y - rad * 0.4, rad * 0.1, x, y, rad);
  g.addColorStop(0, hsl(hue, 70, 72)); g.addColorStop(0.6, hsl(hue, 60, 42)); g.addColorStop(1, hsl(hue + 20, 60, 12));
  if (rings) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
    ctx.strokeStyle = hsl(hue + 30, 50, 75, 0.55); ctx.lineWidth = rad * 0.12;
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.9, rad * 0.45, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.clip();
  for (let i = 0; i < 6; i++) { ctx.fillStyle = hsl(hue + r() * 30, 50, 50 + r() * 20, 0.12); ctx.fillRect(x - rad, y - rad + (i / 6) * rad * 2 + r() * 10, rad * 2, rad * 0.12); }
  ctx.restore();
  if (rings) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
    ctx.strokeStyle = hsl(hue + 30, 50, 80, 0.7); ctx.lineWidth = rad * 0.12;
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.9, rad * 0.45, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
}

function trees(ctx, W, baseY, r, { count, height, color }) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = (i / count) * W + (r() - 0.5) * (W / count);
    const h = height * (0.6 + r() * 0.6), w = h * 0.38;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const ty = baseY - h + (k * h) / 4.5;
      ctx.moveTo(x, ty);
      ctx.lineTo(x - w * (0.35 + k * 0.18), ty + h * 0.38);
      ctx.lineTo(x + w * (0.35 + k * 0.18), ty + h * 0.38);
    }
    ctx.fill();
    ctx.fillRect(x - w * 0.05, baseY - h * 0.1, w * 0.1, h * 0.15);
  }
}

function city(ctx, W, baseY, r, { neon, hue, night }) {
  for (let layer = 0; layer < 3; layer++) {
    const k = layer / 2;
    let x = -20;
    while (x < W + 20) {
      const bw = 30 + r() * 90 * (1 - k * 0.3);
      const bh = (80 + r() * 380) * (0.55 + k * 0.45);
      const top = baseY - bh;
      ctx.fillStyle = hsl(hue + 230 - 230, 30 + k * 10, 6 + layer * 5);
      ctx.fillStyle = hsl(neon ? 260 : 228, 35, (night ? 6 : 28) + layer * (night ? 5 : 8));
      ctx.fillRect(x, top, bw, bh);
      if (r() < 0.25) { ctx.fillRect(x + bw * 0.45, top - 30, 3, 30); }
      if (night || neon) {
        for (let wy = top + 8; wy < baseY - 6; wy += 12) {
          for (let wx = x + 6; wx < x + bw - 6; wx += 10) {
            if (r() < 0.35) { ctx.fillStyle = neon ? hsl(r() < 0.5 ? 300 : 190, 90, 65, 0.85) : `rgba(255,${200 + r() * 40},${120 + r() * 60},.8)`; ctx.fillRect(wx, wy, 4, 6); }
          }
        }
      }
      x += bw + 2 + r() * 8;
    }
  }
}

function water(ctx, W, H, horizon, r, tint) {
  const img = ctx.getImageData(0, Math.max(0, horizon - (H - horizon)), W, H - horizon);
  // reflection: flip the strip above the horizon
  const off = document.createElement('canvas'); off.width = W; off.height = H - horizon;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.save();
  ctx.translate(0, horizon * 2); ctx.scale(1, -1);
  ctx.globalAlpha = 0.65; ctx.drawImage(off, 0, Math.max(0, horizon - (H - horizon)));
  ctx.restore();
  const g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]);
  ctx.fillStyle = g; ctx.globalAlpha = 0.55; ctx.fillRect(0, horizon, W, H - horizon); ctx.globalAlpha = 1;
  for (let i = 0; i < 260; i++) {
    const y = horizon + (r() ** 1.6) * (H - horizon), w = 10 + r() * 80 * ((y - horizon) / (H - horizon) + 0.2);
    ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.1})`;
    ctx.fillRect(r() * W, y, w, 1 + r() * 1.5);
  }
}

function aurora(ctx, W, H, r, hues) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 3; b++) {
    const hue = hues[b % hues.length], amp = H * (0.05 + r() * 0.08), base = H * (0.25 + b * 0.08), ph = r() * 10;
    for (let x = 0; x < W; x += 3) {
      const y = base + Math.sin(x / W * 6 + ph) * amp + Math.sin(x / W * 17 + ph * 2) * amp * 0.3;
      const g = ctx.createLinearGradient(0, y - H * 0.25, 0, y);
      g.addColorStop(0, hsl(hue + 40, 90, 60, 0)); g.addColorStop(0.7, hsl(hue, 90, 60, 0.05)); g.addColorStop(1, hsl(hue, 95, 65, 0.22));
      ctx.fillStyle = g; ctx.fillRect(x, y - H * 0.25, 3, H * 0.25);
    }
  }
  ctx.restore();
}

function clouds(ctx, W, H, r, color, count, maxY) {
  ctx.save();
  ctx.filter = `blur(${Math.round(W / 120)}px)`;
  for (let i = 0; i < count; i++) {
    const x = r() * W, y = r() * maxY, s = 40 + r() * 120;
    ctx.fillStyle = color;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(x + (k - 2) * s * 0.5, y + (r() - 0.5) * s * 0.2, s * (0.5 + r() * 0.4), s * 0.28, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function synth(ctx, W, H, r, hues) {
  const hz = H * 0.62;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#0b0326'); sky.addColorStop(0.6, '#3a0b5e'); sky.addColorStop(1, '#ff3d9a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
  drawStars(ctx, W, H, r, 160, hz * 0.6);
  const sx = W / 2, sy = hz - H * 0.04, sr = Math.min(W, H) * 0.2;
  ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.clip();
  const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr); sg.addColorStop(0, '#ffe66d'); sg.addColorStop(1, '#ff2e88');
  ctx.fillStyle = sg; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  ctx.fillStyle = '#3a0b5e';
  for (let i = 0; i < 7; i++) { const yy = sy + sr * (0.05 + i * 0.14); ctx.fillRect(sx - sr, yy, sr * 2, 2 + i * 1.8); }
  ctx.restore();
  drawMountains(ctx, W, H, r, { base: hz, height: H * 0.12, layers: 2, hue: hues[0] ?? 270, sat: 60, light: 14 });
  ctx.fillStyle = '#12002a'; ctx.fillRect(0, hz, W, H - hz);
  ctx.strokeStyle = 'rgba(255,61,154,.75)'; ctx.lineWidth = 1.5;
  for (let i = -20; i <= 20; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 6, hz); ctx.lineTo(W / 2 + i * W * 0.12, H); ctx.stroke(); }
  for (let k = 0; k < 14; k++) { const y = hz + (H - hz) * Math.pow(k / 14, 2.2); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function abstractArt(ctx, W, H, r, hues, soft) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hsl(hues[0], 70, 12)); bg.addColorStop(1, hsl(hues[1 % hues.length], 70, 18));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.filter = `blur(${soft ? 40 : 24}px)`; ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = r() * H, rad = (0.15 + r() * 0.3) * W;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, hsl(hues[i % hues.length] + r() * 30, 85, 55, 0.6)); g.addColorStop(1, hsl(hues[i % hues.length], 85, 40, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // flow lines
  ctx.save(); ctx.globalAlpha = soft ? 0.18 : 0.32; ctx.lineWidth = 1.2;
  const f1 = 1 + r() * 3, f2 = 1 + r() * 3, ph = r() * 6;
  for (let i = 0; i < 420; i++) {
    let x = r() * W, y = r() * H;
    ctx.strokeStyle = hsl(hues[i % hues.length] + 20, 90, 75, 0.9);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 60; s++) {
      const a = Math.sin((x / W) * f1 * Math.PI + ph) * 2 + Math.cos((y / H) * f2 * Math.PI) * 2;
      x += Math.cos(a) * 4; y += Math.sin(a) * 4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function flowers(ctx, W, H, r, hues, groundY) {
  const g = ctx.createLinearGradient(0, groundY, 0, H);
  g.addColorStop(0, hsl(110, 40, 30)); g.addColorStop(1, hsl(130, 45, 12));
  ctx.fillStyle = g; ctx.fillRect(0, groundY, W, H - groundY);
  const palette = hues.length > 1 ? hues : [330, 280, 50, 0, 200];
  for (let i = 0; i < 900; i++) {
    const y = groundY + (r() ** 0.7) * (H - groundY), x = r() * W, depth = (y - groundY) / (H - groundY);
    const s = 1.5 + depth * 9;
    ctx.strokeStyle = hsl(120, 40, 25 + depth * 10, 0.8); ctx.lineWidth = Math.max(1, s * 0.15);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y + s * 2.4); ctx.stroke();
    ctx.fillStyle = hsl(palette[i % palette.length] + (r() - 0.5) * 20, 80, 55 + r() * 15, 0.95);
    for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.42, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = hsl(48, 90, 60); ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill();
  }
}

function dunes(ctx, W, H, r, horizon, warm) {
  for (let L = 0; L < 5; L++) {
    const k = L / 4, y0 = horizon + (H - horizon) * k * 0.8, amp = 20 + k * 50, ph = r() * 6, f = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, y0 + Math.sin((x / W) * Math.PI * f + ph) * amp);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = warm ? hsl(28 + k * 6, 60, 55 - k * 22) : hsl(30 + k * 6, 55, 62 - k * 22);
    ctx.fill();
  }
}

function postProcess(ctx, W, H, r, style) {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (style.pixel) {
    const s = 8, off = document.createElement('canvas'); off.width = W / s; off.height = H / s;
    const o = off.getContext('2d'); o.drawImage(ctx.canvas, 0, 0, off.width, off.height);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
    return;
  }
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export async function paintStudio(prompt, { width = 1024, height = 1024, seed = 0 } = {}) {
  const W = width, H = height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const r = rng(hash(prompt) + seed * 7777);
  const a = analyze(prompt);
  const S = a.scene;
  const baseHues = a.hues.length ? a.hues : [228, 268, 290];
  const hues = baseHues.length >= 3 ? baseHues : [...baseHues, baseHues[0] + 40, baseHues[0] - 40];
  let kind = 'abstract';
  if (S.synth) kind = 'synth';
  else if (S.space && !S.mountains && !S.ocean && !S.city) kind = 'space';
  else if (S.city) kind = 'city';
  else if (S.desert) kind = 'desert';
  else if (S.ocean || S.mountains || S.forest || S.aurora || S.flowers || S.snow || (S.clouds && !S.abstract)) kind = 'landscape';
  else if (S.space) kind = 'space';

  if (kind === 'synth') {
    synth(ctx, W, H, r, hues);
  } else if (kind === 'abstract') {
    abstractArt(ctx, W, H, r, hues, a.style.soft);
    if (/star|night|space/.test(prompt.toLowerCase())) drawStars(ctx, W, H, r, 200);
  } else if (kind === 'space') {
    ctx.fillStyle = '#02030d'; ctx.fillRect(0, 0, W, H);
    nebula(ctx, W, H, r, a.hues.length ? hues : [265, 225, 300, 200]);
    drawStars(ctx, W, H, r, 700);
    const pc = 1 + Math.floor(r() * 2);
    const wantRings = /ring|saturn/.test(prompt.toLowerCase());
    for (let i = 0; i < pc; i++) planet(ctx, W * (0.2 + r() * 0.6), H * (0.25 + r() * 0.5), Math.min(W, H) * (0.06 + r() * 0.14) / (i + 1), hues[(i + 1) % hues.length], r, (wantRings && i === 0) || r() < 0.55);
    if (/astronaut/.test(prompt.toLowerCase())) {
      const x = W * 0.68, y = H * 0.62, s = Math.min(W, H) * 0.07;
      ctx.fillStyle = '#e8ebff'; ctx.beginPath(); ctx.ellipse(x, y + s * 1.4, s * 0.9, s * 1.2, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, Math.PI * 2); ctx.fill();
      const v = ctx.createLinearGradient(x - s, y - s, x + s, y + s); v.addColorStop(0, '#3b6bff'); v.addColorStop(1, '#b16cff');
      ctx.fillStyle = v; ctx.beginPath(); ctx.ellipse(x + s * 0.1, y, s * 0.5, s * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const night = a.time === 'night' || S.aurora;
    const sunset = a.time === 'sunset';
    const horizon = H * (S.ocean ? 0.58 : 0.62);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    if (night) { sky.addColorStop(0, '#02031a'); sky.addColorStop(0.7, hsl(hues[0], 60, 12)); sky.addColorStop(1, hsl(hues[1], 55, 22)); }
    else if (sunset) { sky.addColorStop(0, hsl(255, 55, 22)); sky.addColorStop(0.45, hsl(300, 55, 45)); sky.addColorStop(0.8, hsl(20, 90, 60)); sky.addColorStop(1, hsl(42, 95, 70)); }
    else { sky.addColorStop(0, hsl(a.hues[0] ?? 215, 70, 45)); sky.addColorStop(1, hsl((a.hues[0] ?? 205) - 10, 70, 82)); }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (night) drawStars(ctx, W, H, r, S.snow ? 300 : 500, horizon);
    if (S.aurora) aurora(ctx, W, H, r, a.hues.length ? hues : [150, 175, 280]);
    const sx = W * (0.3 + r() * 0.4), sy = horizon - H * (sunset ? (S.mountains ? 0.3 : 0.08) : 0.3);
    if (night) glowOrb(ctx, W * (0.2 + r() * 0.6), H * 0.18, Math.min(W, H) * 0.045, '#f4f1ff', 'rgba(200,190,255,.35)', 4);
    else glowOrb(ctx, sx, sy, Math.min(W, H) * (sunset ? 0.09 : 0.05), sunset ? '#ffd27a' : '#fffbe6', sunset ? 'rgba(255,140,60,.45)' : 'rgba(255,255,220,.35)', sunset ? 5 : 4);
    if (S.clouds || (!night && r() < 0.7)) clouds(ctx, W, H, r, night ? 'rgba(80,80,140,.25)' : sunset ? 'rgba(255,170,190,.35)' : 'rgba(255,255,255,.55)', 6, horizon * 0.6);
    const mHue = night ? hues[0] : sunset ? 280 : 225;
    if (S.mountains || S.snow || (!S.ocean && !S.flowers) || r() < 0.5) {
      drawMountains(ctx, W, H, r, { base: horizon + 10, height: H * (S.mountains ? 0.38 : 0.22), layers: 4, hue: mHue, sat: night ? 40 : 35, light: night ? 18 : sunset ? 34 : 50, snow: S.snow || (S.mountains && !sunset && !night), fog: night ? 'rgba(20,20,60,.25)' : sunset ? 'rgba(255,170,150,.18)' : 'rgba(220,230,255,.3)' });
    }
    if (S.ocean) water(ctx, W, H, horizon, r, night ? ['rgba(10,15,60,.6)', 'rgba(2,3,20,.95)'] : sunset ? ['rgba(120,60,140,.4)', 'rgba(30,15,60,.9)'] : ['rgba(30,90,200,.35)', 'rgba(10,40,110,.85)']);
    else if (S.flowers) flowers(ctx, W, H, r, a.hues, horizon);
    else {
      const g = ctx.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, S.snow ? '#dfe6ff' : hsl(night ? 240 : 140, night ? 30 : 30, night ? 10 : 28));
      g.addColorStop(1, S.snow ? '#9aa6d6' : hsl(night ? 240 : 150, 35, night ? 4 : 12));
      ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);
    }
    if (S.forest) trees(ctx, W, H * 0.98, r, { count: 22, height: H * 0.32, color: night ? '#04051a' : sunset ? '#1a0b2e' : '#0e2a22' });
  }

  if (kind === 'city') {
    const neon = a.style.neon || /cyberpunk|neon/.test(prompt.toLowerCase());
    const night = a.time !== 'day' || neon;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (neon) { sky.addColorStop(0, '#05021a'); sky.addColorStop(0.6, '#3a0b5e'); sky.addColorStop(1, '#ff3d9a'); }
    else if (night) { sky.addColorStop(0, '#02031a'); sky.addColorStop(1, hsl(hues[0], 50, 25)); }
    else if (a.time === 'sunset') { sky.addColorStop(0, hsl(255, 55, 25)); sky.addColorStop(0.6, hsl(320, 60, 50)); sky.addColorStop(1, hsl(30, 90, 65)); }
    else { sky.addColorStop(0, hsl(212, 70, 50)); sky.addColorStop(1, hsl(205, 70, 85)); }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (night) drawStars(ctx, W, H, r, 200, H * 0.5);
    if (night && !neon) glowOrb(ctx, W * 0.78, H * 0.16, Math.min(W, H) * 0.04, '#f4f1ff', 'rgba(200,190,255,.3)', 4);
    city(ctx, W, H * (S.ocean ? 0.66 : 0.92), r, { neon, hue: hues[0], night });
    if (S.ocean) water(ctx, W, H, H * 0.66, r, ['rgba(20,10,60,.4)', 'rgba(3,2,20,.9)']);
    else { ctx.fillStyle = '#05061a'; ctx.fillRect(0, H * 0.92, W, H * 0.08); }
  } else if (kind === 'desert') {
    const sunset = a.time !== 'day';
    const horizon = H * 0.55;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    if (a.time === 'night') { sky.addColorStop(0, '#02031a'); sky.addColorStop(1, '#2a1f5c'); }
    else if (sunset) { sky.addColorStop(0, '#3b1f73'); sky.addColorStop(0.6, '#e0607a'); sky.addColorStop(1, '#ffc46b'); }
    else { sky.addColorStop(0, '#4a8ae8'); sky.addColorStop(1, '#f2e2c4'); }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (a.time === 'night') drawStars(ctx, W, H, r, 600, horizon);
    else glowOrb(ctx, W * 0.65, horizon - H * 0.12, Math.min(W, H) * 0.07, '#fff3c4', 'rgba(255,170,80,.45)', 5);
    dunes(ctx, W, H, r, horizon, sunset);
  }

  postProcess(ctx, W, H, r, a.style);
  if (a.style.soft) { ctx.filter = 'blur(1.2px) saturate(1.1)'; ctx.drawImage(canvas, 0, 0); ctx.filter = 'none'; }
  return { src: canvas.toDataURL('image/jpeg', 0.9), kind };
}

// ---------------------------------------------------------------------------
// Nova Cloud (Pollinations) — free hosted model, may be rate-limited
// ---------------------------------------------------------------------------
export function cloudUrl(prompt, { width, height, seed }) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 700))}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

function loadImage(url, timeout, signal) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, timeout);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error('Image service unavailable')); };
    signal?.addEventListener('abort', () => { clearTimeout(t); img.src = ''; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Claude vector illustration (SVG)
// ---------------------------------------------------------------------------
export function sanitizeSVG(svg) {
  let s = String(svg);
  const m = /<svg[\s\S]*<\/svg>/i.exec(s);
  if (!m) return null;
  s = m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href\s*=\s*["'])(?!#|data:image\/)[^"']*(["'])/gi, '$1#$2')
    .replace(/javascript:/gi, '');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

async function claudeSVG(prompt, { width, height, signal }) {
  const map = settings.modelMap['nova-2-5-luna'] || { model: 'claude-sonnet-5-5' };
  const text = await claudeComplete({
    apiKey: settings.anthropicKey,
    model: map.model,
    effort: 'medium',
    signal,
    system: 'You are Nova Studio, a world-class vector illustrator. You turn prompts into a single beautiful, detailed, self-contained SVG illustration. Use rich gradients, layered shapes, lighting and depth. Do not include any text unless the prompt explicitly asks for words. Reply with ONLY the SVG markup — no explanation, no code fences.',
    prompt: `Create an SVG illustration (viewBox="0 0 ${width} ${height}") of: ${prompt}`,
  });
  const svg = sanitizeSVG(text);
  if (!svg) throw new Error('Claude did not return an SVG.');
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

/**
 * Generate an image. Returns { src, engine, label, width, height, note }.
 */
export async function generateImage({ prompt, aspect = '1:1', seed = 0, engine = settings.imageEngine, signal }) {
  const [width, height] = ASPECTS[aspect] || ASPECTS['1:1'];
  const claudeOn = settings.engine === 'claude' && !!settings.anthropicKey;
  let order;
  if (engine === 'studio') order = ['studio'];
  else if (engine === 'cloud') order = ['cloud', 'studio'];
  else if (engine === 'claude') order = claudeOn ? ['claude', 'studio'] : ['cloud', 'studio'];
  else order = claudeOn ? ['claude', 'cloud', 'studio'] : ['cloud', 'studio'];

  let note = null;
  for (const e of order) {
    try {
      if (e === 'cloud') {
        const s = (hash(prompt) + seed * 101) % 1000000;
        const url = cloudUrl(prompt, { width, height, seed: s });
        await loadImage(url, 60000, signal);
        return { src: url, engine: 'cloud', label: 'Nova Cloud · Pollinations.ai', width, height, note };
      }
      if (e === 'claude') {
        const src = await claudeSVG(prompt, { width, height, signal });
        return { src, engine: 'claude', label: 'Nova Vector · Claude', width, height, note };
      }
      if (e === 'studio') {
        const { src, kind } = await paintStudio(prompt, { width, height, seed });
        if (kind === 'abstract' && !/abstract|pattern|art|gradient|fluid/.test(prompt.toLowerCase())) {
          note = (note ? note + ' ' : '') + 'On-device mode painted an artistic interpretation — it specializes in landscapes, space, cities and abstract art.';
        }
        return { src, engine: 'studio', label: 'Nova Studio · on-device', width, height, note };
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      note = e === 'cloud' ? 'Nova Cloud is busy right now, so this was painted on-device.' : e === 'claude' ? `Claude illustration failed (${err.message}); used another engine.` : note;
    }
  }
  throw new Error('Image generation failed');
}
