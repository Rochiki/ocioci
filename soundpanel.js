// ============================================================
// soundpanel.js — Builder: musik latar & efek suara untuk kursus SCORM
//   project.sound = { bgm:{mode:'none'|'lib'|'upload', lib, asset, vol, duck},
//                     sfx:{click,next,right,wrong,finish} }  (nilai: id efek / 'none')
// ============================================================
import { h as h0, icon } from './ui.js';
const h = (tag, attrs, ...kids) => h0(tag, attrs, ...kids.flat().filter((k) => k != null && k !== false));
import { musicPicker, loadCatalog, titleOf } from './musiklib.js';

export const defaultSound = () => ({ bgm: { mode: 'none', lib: '', asset: null, vol: 0.35, duck: true }, sfx: { click: 'none', next: 'none', right: 'none', wrong: 'none', finish: 'none' } });
export const migrateSound = (p) => {
  const d = defaultSound();
  p.sound = { bgm: { ...d.bgm, ...(p.sound?.bgm || {}) }, sfx: { ...d.sfx, ...(p.sound?.sfx || {}) } };
};

const EVENTS = [
  ['click', 'Setiap ketukan tombol', 'klik'], ['next', 'Pindah slide', 'whoosh'], ['right', 'Jawaban benar', 'sukses'],
  ['wrong', 'Jawaban salah', 'salah'], ['finish', 'Kursus selesai / lulus', 'tada'],
];

/** Bagian UI untuk tab Suara. deps: {ctx, project, toast} */
export function soundSection(d) {
  const S = d.project.sound, b = S.bgm;
  const box = h('div', { class: 'sound-sec' });
  let picker = null;
  const draw = () => {
    picker?.stopPreview?.();
    const sfxApi = window.StudioSfx?.player();
    const modes = [['none', 'Tanpa musik'], ['lib', 'Pustaka (68 lagu)'], ['upload', 'MP3 sendiri']];
    const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Sumber musik latar' }, modes.map(([v, l]) =>
      h('label', {}, h('input', { type: 'radio', name: 'bgmmode', value: v, checked: b.mode === v, onchange: () => { b.mode = v; d.ctx.changed(); draw(); } }), h('span', {}, l))));
    let body = null;
    if (b.mode === 'lib') {
      const cur = h('b', {}, '…'); loadCatalog().then((c) => { cur.textContent = b.lib ? titleOf(c, b.lib) : '— belum dipilih —'; }).catch(() => { cur.textContent = b.lib || '—'; });
      picker = musicPicker({ value: b.lib, onPick: (f) => { b.lib = f; d.ctx.changed(); loadCatalog().then((c) => { cur.textContent = titleOf(c, f); }); } });
      body = h('div', { class: 'stack' }, h('div', {}, 'Lagu dipilih: ', cur), picker);
    } else if (b.mode === 'upload') {
      const f = h('input', { type: 'file', accept: 'audio/*,.mp3,.ogg,.wav,.m4a', hidden: true, onchange: () => {
        const file = f.files[0]; if (!file) return;
        b.asset = { data: file, name: file.name, type: file.type || 'audio/mpeg' }; d.ctx.changed(); draw();
      } });
      body = h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => f.click() }, icon('upload'), b.asset ? 'Ganti file' : 'Pilih file audio'), b.asset ? h('b', {}, b.asset.name) : h('span', { class: 'muted' }, 'Belum ada file'), f),
        b.asset ? h('audio', { controls: true, src: URL.createObjectURL(b.asset.data), style: { width: '100%' } }) : null);
    }
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: b.vol, 'aria-label': 'Volume musik', oninput: (e) => { b.vol = +e.target.value; out.textContent = `${Math.round(b.vol * 100)}%`; d.ctx.changed(); } });
    const out = h('b', { class: 'big-num' }, `${Math.round(b.vol * 100)}%`);
    const duck = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: b.duck !== false, onchange: (e) => { b.duck = e.target.checked; d.ctx.changed(); } }), 'Kecilkan musik otomatis saat narasi berbunyi');
    const sfxRows = EVENTS.map(([k, label, rec]) => {
      const sel = h('select', { 'aria-label': label, onchange: () => { S.sfx[k] = sel.value; d.ctx.changed(); if (sel.value !== 'none') sfxApi?.play(sel.value, 0.8); } },
        h('option', { value: 'none', selected: S.sfx[k] === 'none' }, 'Tanpa efek'),
        (window.StudioSfx?.LIST || []).map(([v, l]) => h('option', { value: v, selected: S.sfx[k] === v }, `${l}${v === rec ? ' (disarankan)' : ''}`)));
      return h('div', { class: 'sfx-row' }, h('span', {}, label), sel,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Coba efek ${label}`, onclick: () => sfxApi?.play(sel.value === 'none' ? rec : sel.value, 0.8) }, icon('play')));
    });
    box.replaceChildren(
      h('h3', {}, 'Musik latar'),
      h('p', { class: 'hint' }, 'Mulai saat peserta mengetuk pertama kali, berulang (loop), dan bisa dimatikan peserta lewat tombol musik di bagian atas. Bisa diganti atau dihentikan per slide (di kartu "Karakter & suara slide ini").'),
      seg, body,
      b.mode !== 'none' ? h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'Volume musik'), h('div', { class: 'row' }, vol, out)) : null,
      b.mode !== 'none' ? duck : null,
      h('h3', {}, 'Efek suara'),
      h('p', { class: 'hint' }, 'Efek singkat bawaan (tanpa file, tanpa internet). Pilih untuk tiap kejadian — pilihan langsung dibunyikan sebagai contoh.'),
      h('div', { class: 'sfx-list' }, sfxRows));
  };
  draw();
  return box;
}
