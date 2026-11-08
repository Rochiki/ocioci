// ============================================================
// musiklib.js — pustaka musik latar bawaan (68 lagu domain publik/CC0, FreePD)
// Katalog: musik.json · berkas: bgm-*.mp3 di root.
// ============================================================
import { h, icon } from './ui.js';

let catalog;
export async function loadCatalog(base = './') {
  if (catalog) return catalog;
  const res = await fetch(`${base}musik.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`musik.json tidak ditemukan (${res.status}). Unggah musik.json dan semua bgm-*.mp3 ke repo.`);
  catalog = await res.json();
  return catalog;
}
export const titleOf = (cat, file) => cat?.lagu.find((l) => l.file === file)?.title || file;
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Pemilih musik: daftar dengan pencarian, filter kategori, dan tombol dengar.
 * @param {{value:string,onPick:(file:string)=>void, base?:string}} o
 */
export function musicPicker({ value = '', onPick, base = './' }) {
  const box = h('div', { class: 'music-picker' });
  let audio = null, playing = '', q = '', kat = 'Semua', cat = null;
  const stop = () => { if (audio) { audio.pause(); audio = null; } playing = ''; };
  const draw = () => {
    const rows = (cat?.lagu || []).filter((l) => (kat === 'Semua' || l.kategori === kat) && (!q || l.title.toLowerCase().includes(q)));
    const cats = ['Semua', ...new Set((cat?.lagu || []).map((l) => l.kategori))];
    list.replaceChildren(...(rows.length ? rows.map((l) => {
      const on = playing === l.file;
      return h('div', { class: 'mp-row' + (value === l.file ? ' sel' : ''), role: 'option', 'aria-selected': String(value === l.file) },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': (on ? 'Hentikan ' : 'Dengar ') + l.title,
          onclick: () => { const was = playing === l.file; stop(); if (was) return draw(); audio = new Audio(base + l.file); audio.volume = 0.7; audio.onended = () => { stop(); draw(); }; audio.play().catch(() => {}); playing = l.file; draw(); } },
          icon(on ? 'stop' : 'play')),
        h('div', { class: 'mp-info' }, h('b', {}, l.title), h('small', {}, `${l.kategori} · ${fmtTime(l.detik)} · ${(l.kb / 1024).toFixed(1)} MB`)),
        h('button', { class: 'btn btn-sm' + (value === l.file ? '' : ' btn-primary'), type: 'button', onclick: () => { stop(); value = l.file; onPick(l.file); draw(); } }, value === l.file ? 'Dipakai' : 'Pakai'));
    }) : [h('p', { class: 'muted center' }, 'Tidak ada lagu yang cocok.')]));
    chips.replaceChildren(...cats.map((c) => h('button', { type: 'button', class: 'pick-chip txt-chip', role: 'radio', 'aria-checked': String(kat === c), onclick: () => { kat = c; draw(); } }, c)));
  };
  const search = h('input', { type: 'search', placeholder: 'Cari judul lagu…', 'aria-label': 'Cari lagu', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } });
  const chips = h('div', { class: 'chip-row' });
  const list = h('div', { class: 'mp-list', role: 'listbox', 'aria-label': 'Daftar lagu' }, h('p', { class: 'muted center' }, 'Memuat pustaka musik…'));
  box.append(search, chips, list,
    h('p', { class: 'hint' }, 'Semua lagu berlisensi domain publik/CC0 (sumber: FreePD) — bebas dipakai, termasuk untuk materi perusahaan.'));
  loadCatalog(base).then((c) => { cat = c; draw(); }).catch((e) => { list.replaceChildren(h('p', { class: 'muted' }, e.message)); });
  box.stopPreview = stop;
  return box;
}
