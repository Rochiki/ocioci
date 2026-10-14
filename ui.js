// ============================================================
// ui.js — komponen antarmuka kecil untuk Builder & Player
// (pembuat elemen, ikon, notifikasi, jendela dialog)
// ============================================================

/** Buat elemen: h('button', {class:'btn', onclick: fn}, 'Teks', anakLain) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const PATHS = {
  content: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>',
  html: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  flip: '<rect x="3" y="6" width="11" height="14" rx="2"/><path d="M10 4h9a2 2 0 012 2v12"/>',
  hotspot: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.5M12 17h.01"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M14 6h7M14 12h5M14 18h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  play: '<path d="M7 5l12 7-12 7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.6 0-1.4-1.1-1.6-1.1-2.6 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/>',
  sound: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  file: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  ppt: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M9 21h6M12 18v3M8 8h4a2 2 0 010 4H8V8zM8 12v3"/>',
  pdf: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M8 14h1.5a1.5 1.5 0 000-3H8v5M13 11v5h1a2 2 0 002-2v-1a2 2 0 00-2-2z"/>',
  word: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M8 12l1.2 5 1.8-4 1.8 4 1.2-5"/>',
  zip: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M10 4v2M10 8v2M10 12v2M9 16h2v3H9z"/>',
};
export function icon(name, cls = '') {
  const s = `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  const t = document.createElement('template');
  t.innerHTML = s;
  return t.content.firstChild;
}

/** Notifikasi singkat di bawah layar. */
export function toast(msg, kind = 'info') {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), kind === 'error' ? 7000 : 3200);
  setTimeout(() => t.remove(), kind === 'error' ? 7400 : 3600);
}

/** Jendela dialog (di HP tampil sebagai lembar dari bawah). Mengembalikan {close, el}. */
export function modal(title, body, { wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Tutup', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body));
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, box);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  setTimeout(() => (box.querySelector('button:not(.icon-btn), input, select, textarea') || box.querySelector('button'))?.focus(), 30);
  return { close, el: box };
}

/** Overlay proses (mis. membuat paket). */
export function busy(text) {
  const label = h('p', {}, text);
  const el = h('div', { class: 'busy', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'spinner' }), label);
  document.body.append(el);
  return { set: (t) => { label.textContent = t; }, done: () => el.remove() };
}

export function formatBytes(n = 0) {
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ${u[i]}`;
}
