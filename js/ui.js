// Generic UI primitives: menus, modals, toasts, dialogs, lightbox.
import { esc, h } from './util.js';
import { icon, hydrateIcons } from './icons.js';

// ---------- Toasts ----------
export function toast(message, { type = '', action = null, timeout = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  const el = h(`<div class="toast ${type}">${icon(type === 'error' ? 'alert' : 'check', 'icon-sm')}<span>${esc(message)}</span></div>`);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.onClick(); el.remove(); };
    el.appendChild(b);
  }
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, timeout);
}

// ---------- Menus ----------
let activeMenu = null;
export function closeMenu() { activeMenu?.close(); }

export function openMenu(anchor, items, { className = '', placement = 'bottom', align = 'start', onClose } = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = `menu ${className}`;
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { menu.appendChild(h('<div class="sep"></div>')); continue; }
    if (it.header) { menu.appendChild(h(`<div class="menu-label">${esc(it.header)}</div>`)); continue; }
    if (it.html) { const el = h(it.html); menu.appendChild(el); if (it.onClick) el.addEventListener('click', (e) => { it.onClick(e); if (!it.keepOpen) close(); }); continue; }
    const b = document.createElement('button');
    b.className = `menu-item${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}`;
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `${it.icon ? icon(it.icon) : ''}<span style="flex:1;min-width:0">${esc(it.label)}${it.desc ? `<span class="desc">${esc(it.desc)}</span>` : ''}</span>${it.trail ? `<span class="trail">${it.trail}</span>` : it.checked ? `<span class="trail">${icon('check', 'icon-sm')}</span>` : it.submenu ? `<span class="trail">${icon('chevronRight', 'icon-sm')}</span>` : ''}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (it.submenu) { openMenu(b, it.submenu, { placement: 'right' }); return; }
      close();
      it.onClick?.(e);
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const vw = innerWidth, vh = innerHeight;
  let x, y;
  if (placement === 'right') { x = r.right + 6; y = r.top; if (x + mw > vw - 8) x = r.left - mw - 6; }
  else {
    x = align === 'end' ? r.right - mw : r.left;
    y = placement === 'top' ? r.top - mh - 8 : r.bottom + 6;
    if (placement === 'bottom' && y + mh > vh - 8) y = Math.max(8, r.top - mh - 6);
    if (placement === 'top' && y < 8) y = r.bottom + 6;
  }
  x = Math.max(8, Math.min(x, vw - mw - 8));
  y = Math.max(8, Math.min(y, vh - mh - 8));
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  anchor.setAttribute('aria-expanded', 'true');

  const onDoc = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => {
    const items = [...menu.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0])?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1])?.focus(); }
  };
  setTimeout(() => { document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey); }, 0);
  addEventListener('resize', close, { once: true });
  function close() {
    if (!menu.isConnected) return;
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDoc);
    document.removeEventListener('keydown', onKey);
    if (activeMenu?.menu === menu) activeMenu = null;
    onClose?.();
  }
  activeMenu = { menu, close };
  return close;
}

// ---------- Modals ----------
const modalStack = [];
export function openModal({ title = '', body = '', foot = '', className = '', size = '', onClose, headExtra = '' } = {}) {
  const root = document.getElementById('modal-root');
  const back = h(`<div class="modal-backdrop"><div class="modal ${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
${title || headExtra ? `<div class="modal-head">${headExtra || `<h2>${esc(title)}</h2>`}<button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>` : ''}
<div class="modal-body"></div>${foot ? `<div class="modal-foot"></div>` : ''}</div></div>`);
  const modal = back.querySelector('.modal');
  const bodyEl = back.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (foot) { const f = back.querySelector('.modal-foot'); if (typeof foot === 'string') f.innerHTML = foot; else f.appendChild(foot); }
  hydrateIcons(back);
  root.appendChild(back);
  const prevFocus = document.activeElement;
  const close = () => {
    if (!back.isConnected) return;
    back.remove();
    modalStack.splice(modalStack.indexOf(api), 1);
    onClose?.();
    prevFocus?.focus?.();
  };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const api = { el: modal, body: bodyEl, back, close };
  modalStack.push(api);
  setTimeout(() => (modal.querySelector('[autofocus]') || modal.querySelector('input,textarea,button:not([data-close])'))?.focus(), 30);
  return api;
}
export function topModal() { return modalStack[modalStack.length - 1]; }

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || activeMenu || document.querySelector('.lightbox')) return;
  const m = topModal();
  if (m) { e.preventDefault(); e.stopImmediatePropagation(); m.close(); }
});

export function confirmDialog({ title = 'Are you sure?', text = '', confirm = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'small', body: `<p>${text}</p>`,
      foot: `<button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'danger fill' : 'primary'}" data-yes>${esc(confirm)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.back.querySelector('[data-no]').onclick = () => { done = true; m.close(); resolve(false); };
    m.back.querySelector('[data-yes]').onclick = () => { done = true; m.close(); resolve(true); };
    setTimeout(() => m.back.querySelector('[data-yes]').focus(), 40);
  });
}

export function promptDialog({ title = '', label = '', value = '', confirm = 'Save', multiline = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'small',
      body: `${label ? `<p>${esc(label)}</p>` : ''}${multiline ? `<textarea class="field" rows="5" autofocus>${esc(value)}</textarea>` : `<input class="field" value="${esc(value)}" autofocus>`}`,
      foot: `<button class="btn" data-no>Cancel</button><button class="btn primary" data-yes>${esc(confirm)}</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const input = m.body.querySelector('input,textarea');
    const ok = () => { done = true; const v = input.value; m.close(); resolve(v); };
    m.back.querySelector('[data-no]').onclick = () => { done = true; m.close(); resolve(null); };
    m.back.querySelector('[data-yes]').onclick = ok;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); ok(); } });
    setTimeout(() => { input.focus(); input.select?.(); }, 40);
  });
}

// ---------- Lightbox ----------
export function lightbox({ src, caption = '', actions = [] }) {
  const el = h(`<div class="lightbox" role="dialog" aria-label="Image viewer"><div class="lb-top"><span class="p">${esc(caption)}</span><span style="display:flex;gap:4px"></span></div><div class="lb-img"><img src="${esc(src)}" alt="${esc(caption)}"></div></div>`);
  const bar = el.querySelector('.lb-top > span:last-child');
  [...actions, { icon: 'x', label: 'Close', onClick: () => close() }].forEach((a) => {
    const b = h(`<button class="icon-btn" title="${esc(a.label)}" aria-label="${esc(a.label)}">${icon(a.icon)}</button>`);
    b.onclick = a.onClick;
    bar.appendChild(b);
  });
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.classList.contains('lb-img')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  return close;
}
