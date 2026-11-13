// ============================================================
// tur.js — tur interaktif "petunjuk penggunaan" + tombol Bantuan
//   Menyorot elemen satu per satu dengan penjelasan Bahasa Indonesia
//   sederhana. Otomatis muncul pada kunjungan pertama; bisa diulang
//   kapan saja lewat tombol mengambang "Bantuan".
//   Tanpa pustaka luar — aman offline, ±3 KB.
//
//   Pakai: initTour({ page: 'builder', steps: [
//     { judul: 'Halo!', teks: '…' },                       // tanpa el = kartu di tengah
//     { el: '#tombol', judul: '…', teks: '…' },            // menyorot elemen
//   ] });
// ============================================================
import { h } from './ui.js';

const PAD = 6; // jarak sorotan dari tepi elemen

export function initTour({ page, steps }) {
  const KEY = `studio-tur-${page}`;
  let root = null, hole = null, card = null, idx = 0, raf = 0;

  // ---------- posisi sorotan & kartu ----------
  const elOf = (step) => (step.el ? document.querySelector(step.el) : null);
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden';
  };
  const place = () => {
    const step = steps[idx];
    const el = elOf(step);
    const vw = innerWidth, vh = innerHeight;
    if (el) {
      const r = el.getBoundingClientRect();
      Object.assign(hole.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`, opacity: 1 });
      const cw = Math.min(330, vw - 24), ch = card.offsetHeight || 170;
      const below = r.bottom + PAD + ch + 14 < vh;
      card.style.width = `${cw}px`;
      card.style.top = `${below ? r.bottom + PAD + 12 : Math.max(10, r.top - PAD - ch - 12)}px`;
      card.style.left = `${Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12)}px`;
      card.classList.toggle('arrow-up', below);
      card.classList.toggle('arrow-down', !below);
    } else {
      Object.assign(hole.style, { left: '50%', top: '40%', width: '0px', height: '0px', opacity: 1 });
      const cw = Math.min(340, vw - 24);
      card.style.width = `${cw}px`;
      card.style.left = `${(vw - cw) / 2}px`;
      card.style.top = `${Math.max(14, vh * 0.34 - (card.offsetHeight || 170) / 2)}px`;
      card.classList.remove('arrow-up', 'arrow-down');
    }
  };
  const replace = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  // ---------- isi kartu untuk langkah ke-i ----------
  const show = (i, dir = 1) => {
    // lewati langkah yang elemennya sedang tidak tampak (mis. layout HP)
    while (i >= 0 && i < steps.length && steps[i].el && !visible(elOf(steps[i]))) i += dir;
    if (i < 0 || i >= steps.length) return finish();
    idx = i;
    const step = steps[idx];
    const el = elOf(step);
    if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* */ } }
    const last = idx >= steps.length - 1 || steps.slice(idx + 1).every((s) => s.el && !visible(elOf(s)));
    card.replaceChildren(
      h('small', { class: 'tour-count' }, `${idx + 1} dari ${steps.length}`),
      step.judul ? h('h3', {}, step.judul) : null,
      h('p', {}, step.teks),
      h('div', { class: 'tour-nav' },
        h('button', { class: 'link', type: 'button', onclick: finish }, 'Lewati'),
        h('span', { class: 'spacer' }),
        idx > 0 ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => show(idx - 1, -1) }, '← Kembali') : null,
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => (last ? finish(true) : show(idx + 1)) }, last ? 'Selesai 🎉' : 'Lanjut →')));
    requestAnimationFrame(place);
    card.querySelector('.btn-primary')?.focus({ preventScroll: true });
  };

  const onKey = (e) => { if (e.key === 'Escape') finish(); };
  function finish() {
    try { localStorage.setItem(KEY, '1'); } catch { /* */ }
    removeEventListener('resize', replace); removeEventListener('scroll', replace, true); removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    root?.remove(); root = null;
  }

  function start() {
    if (root) return;
    hole = h('div', { class: 'tour-hole' });
    card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Panduan penggunaan' });
    root = h('div', { class: 'tour' }, hole, card);
    document.body.append(root);
    addEventListener('resize', replace); addEventListener('scroll', replace, true); addEventListener('keydown', onKey);
    show(0);
  }

  // ---------- tombol Bantuan permanen ----------
  const fab = h('button', { class: 'help-fab', type: 'button', title: 'Tampilkan panduan penggunaan' },
    h('span', { class: 'help-q', 'aria-hidden': 'true' }, '?'), h('span', { class: 'help-label' }, 'Bantuan'));
  fab.onclick = start;
  document.body.append(fab);

  // ---------- otomatis pada kunjungan pertama (menunggu dialog lain tertutup) ----------
  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch { /* */ }
  if (!seen) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (document.querySelector('.modal-wrap')) { if (tries > 240) clearInterval(t); return; }
      clearInterval(t);
      setTimeout(() => { if (!document.querySelector('.modal-wrap')) start(); }, 700);
    }, 500);
  }
  return { start };
}
