// ============================================================
// slidetools.js — panel per slide: Karakter & suara, dan Tombol aksi
// Dipakai builder.js. Semua pengaturan disimpan di slide itu sendiri:
//   s.who   '' (ikut kursus) | 'none' (tanpa karakter) | id karakter
//   s.voice { v, style, rate, pitch }  — kosong = ikut tab Suara
//   s.buttons [{action,label,target,url,title,text}]
// ============================================================
import { musicPicker } from './musiklib.js';
import { h as h0, icon } from './ui.js';
import { field } from './editors.js';

/** h yang membuang anak null/false (agar tidak tampil sebagai teks "null"). */
const h = (tag, attrs, ...kids) => h0(tag, attrs, ...kids.flat().filter((k) => k != null && k !== false));

export const VOICES = [
  ['', 'Ikut pengaturan', 'Sesuai tab Suara'],
  ['id-ID-GadisNeural', 'Gadis', 'Perempuan · Microsoft'],
  ['id-ID-ArdiNeural', 'Ardi', 'Pria · Microsoft'],
  ['piper-f', 'Suara AI · perempuan', 'Di browser · tanpa internet'],
  ['piper-m', 'Suara AI · laki-laki', 'Di browser · nada diturunkan'],
];

export const BUTTON_PRESETS = [
  ['start', 'Mulai', 'Pindah ke slide berikutnya'],
  ['next', 'Lanjut', 'Slide berikutnya'],
  ['prev', 'Kembali', 'Slide sebelumnya'],
  ['pause', 'Jeda narasi', 'Jeda / lanjutkan suara'],
  ['replay', 'Ulangi narasi', 'Putar suara dari awal'],
  ['goto', 'Lompat ke slide', 'Pindah ke slide tertentu'],
  ['link', 'Buka tautan', 'Buka website di tab baru'],
  ['info', 'Pop-up info', 'Jendela kecil berisi teks'],
  ['finish', 'Selesai', 'Menuju halaman akhir'],
];
const ACT_NAME = Object.fromEntries(BUTTON_PRESETS.map(([a, l]) => [a, l]));

/** Panel "Karakter & suara slide ini". deps: {ctx, project, chars, STYLES, ttsCfg, makeMp3, trySample, applyAll, redraw} */
export function personaPanel(s, d) {
  const box = h('section', { class: 'editor-card persona' });
  const K = window.StudioKarakter;
  const draw = () => {
    const styleSel = h('select', { onchange: (e) => { setVoice('style', e.target.value); } },
      Object.entries(d.STYLES).map(([k, v]) => h('option', { value: k === 'normal' ? '' : k, selected: (s.voice?.style || '') === (k === 'normal' ? '' : k) }, k === 'normal' ? 'Ikut pengaturan (normal)' : v.label)));
    const rng = (key, min, max, unit) => {
      const cur = s.voice?.[key];
      const val = h('span', { class: 'rng-val' }, cur == null ? 'ikut' : `${cur > 0 ? '+' : ''}${cur}${unit}`);
      const inp = h('input', { type: 'range', min, max, step: 1, value: cur ?? 0, 'aria-label': key === 'rate' ? 'Kecepatan' : 'Nada',
        oninput: (e) => { setVoice(key, +e.target.value, true); val.textContent = `${+e.target.value > 0 ? '+' : ''}${e.target.value}${unit}`; } });
      return h('div', { class: 'rng' }, inp, val, h('button', { class: 'link small', type: 'button', onclick: () => { setVoice(key, null); draw(); } }, 'Ikut'));
    };
    const who = s.who || '';
    const chip = (val, label, pic, extra) => h('button', { class: 'pick-chip' + (pic ? ' has-pic' : ' txt'), type: 'button', role: 'radio', 'aria-checked': String(who === val), title: extra || label,
      onclick: () => { s.who = val; d.ctx.changed(); draw(); } }, pic || null, h('span', {}, label));
    const chars = Object.entries(d.chars || {}).map(([k, c]) => chip(k, c.name, h('span', { class: 'chip-pic presenter-thumb', html: K.svg(k, true) })));
    const vc = ((s.voice?.v) === 'piper' ? 'piper-f' : (s.voice?.v)) || '';
    const voiceChips = VOICES.map(([v, name, sub]) => h('button', { class: 'pick-chip voice', type: 'button', role: 'radio', 'aria-checked': String(vc === v),
      onclick: () => { setVoice('v', v); draw(); } }, h('b', {}, name), h('small', {}, sub)));
    const sample = h('button', { class: 'btn', type: 'button' }, icon('play'), 'Coba suara');
    sample.onclick = () => d.trySample(s, sample);
    const gen = h('button', { class: 'btn btn-magic', type: 'button' }, icon('sparkle'), 'Buat MP3 dengan suara ini');
    gen.onclick = async () => { if (await d.makeMp3(s, gen)) { d.toast('MP3 slide ini dibuat dengan suara pilihan.', 'ok'); d.redraw(); } };
    const all = h('button', { class: 'btn', type: 'button', onclick: () => {
      if (!confirm('Terapkan pilihan karakter & suara slide ini ke SEMUA slide? (MP3 yang sudah ada tidak berubah sampai dibuat ulang.)')) return;
      for (const x of d.project.slides) { x.who = s.who || ''; x.voice = s.voice ? { ...s.voice } : undefined; }
      d.ctx.changed({ list: true }); d.toast('Diterapkan ke semua slide.', 'ok');
    } }, icon('copy'), 'Terapkan ke semua slide');
    box.replaceChildren(...[
      h('div', { class: 'narr-head' }, icon('person'), h('h3', {}, 'Karakter & suara slide ini')),
      h('div', { class: 'field' }, h('label', {}, 'Karakter yang tampil'),
        h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': 'Karakter slide' },
          chip('', 'Ikut kursus', null, d.project.presenter?.on ? `Karakter kursus: ${d.chars?.[d.project.presenter.who]?.name || 'sendiri'}` : 'Kursus belum memakai karakter'),
          chip('none', 'Tanpa karakter'), ...chars),
        !d.project.presenter?.on && !who ? h('div', { class: 'hint' }, 'Kursus belum memakai karakter. Pilih karakter di sini untuk menampilkannya hanya di slide ini.') : null),
      h('div', { class: 'field' }, h('label', {}, 'Suara narasi'),
        h('div', { class: 'chip-row voices', role: 'radiogroup', 'aria-label': 'Suara slide' }, ...voiceChips)),
      h('details', { class: 'mini', open: !!(s.voice?.style || s.voice?.rate != null || s.voice?.pitch != null) },
        h('summary', {}, 'Atur ekspresi, kecepatan & nada'),
        h('div', { class: 'look-body' }, field('Ekspresi', styleSel), field('Kecepatan', rng('rate', -50, 50, '%')), field('Nada', rng('pitch', -10, 10, '')))),
      h('div', { class: 'narr-actions' }, sample, gen, all),
      s.audio && s.voice && Object.keys(s.voice).length ? h('div', { class: 'hint' }, 'Slide ini sudah punya audio. Klik "Buat MP3 dengan suara ini" agar suaranya ikut berubah.') : null].filter(Boolean));
  };
  function setVoice(key, val, quiet) {
    const v = { ...(s.voice || {}) };
    if (val == null || val === '') delete v[key]; else v[key] = val;
    if (Object.keys(v).length) s.voice = v; else delete s.voice;
    d.ctx.changed();
    if (!quiet && key !== 'v') { /* tidak perlu gambar ulang */ }
  }
  draw();
  return box;
}

/** Panel "Tombol di slide ini". deps: {ctx, project} */
export function buttonsPanel(s, d) {
  const box = h('section', { class: 'editor-card btns' });
  const slides = d.project.slides;
  const draw = () => {
    const add = (action) => {
      s.buttons = s.buttons || [];
      if (s.buttons.length >= 6) return d.toast('Maksimal 6 tombol per slide.', 'error');
      const b = { action, label: '' };
      if (action === 'goto') { const i = slides.indexOf(s); b.target = (slides[i + 1] || slides[0]).id; }
      s.buttons.push(b); d.ctx.changed(); draw();
    };
    const rows = (s.buttons || []).map((b, k) => {
      const lab = h('input', { type: 'text', value: b.label || '', placeholder: ACT_NAME[b.action], maxlength: 40, 'aria-label': 'Teks tombol',
        oninput: (e) => { b.label = e.target.value; d.ctx.changed(); } });
      let extra = null;
      if (b.action === 'goto') extra = h('select', { 'aria-label': 'Slide tujuan', onchange: (e) => { b.target = e.target.value; d.ctx.changed(); } },
        slides.map((x, i) => h('option', { value: x.id, selected: x.id === b.target }, `${i + 1}. ${x.title || 'tanpa judul'}`)));
      if (b.action === 'link') extra = h('input', { type: 'url', value: b.url || '', placeholder: 'https://…', 'aria-label': 'Alamat tautan', oninput: (e) => { b.url = e.target.value; d.ctx.changed(); } });
      if (b.action === 'info') extra = h('div', { class: 'stack' },
        h('input', { type: 'text', value: b.title || '', placeholder: 'Judul pop-up', 'aria-label': 'Judul pop-up', oninput: (e) => { b.title = e.target.value; d.ctx.changed(); } }),
        h('textarea', { rows: 3, placeholder: 'Isi pop-up (boleh **tebal** dan - daftar)', 'aria-label': 'Isi pop-up', oninput: (e) => { b.text = e.target.value; d.ctx.changed(); } }, b.text || ''));
      return h('div', { class: 'btn-row' },
        h('span', { class: 'btn-kind' }, ACT_NAME[b.action]),
        h('div', { class: 'btn-fields' }, lab, extra),
        h('div', { class: 'btn-ctl' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Naikkan', disabled: k === 0, onclick: () => { [s.buttons[k - 1], s.buttons[k]] = [s.buttons[k], s.buttons[k - 1]]; d.ctx.changed(); draw(); } }, icon('up')),
          h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Hapus tombol', onclick: () => { s.buttons.splice(k, 1); if (!s.buttons.length) delete s.buttons; d.ctx.changed(); draw(); } }, icon('trash'))));
    });
    box.replaceChildren(
      h('div', { class: 'narr-head' }, icon('list'), h('h3', {}, 'Tombol di slide ini')),
      h('p', { class: 'hint' }, 'Tombol benar-benar berfungsi di kursus (coba di Pratinjau). Muncul di bawah isi slide; di slide layar penuh melayang di bagian bawah.'),
      h('div', { class: 'chip-row presets' }, BUTTON_PRESETS.map(([a, l, sub]) => h('button', { class: 'pick-chip add', type: 'button', title: sub, onclick: () => add(a) }, icon('plus'), l))),
      rows.length ? h('div', { class: 'btn-list' }, rows) : h('p', { class: 'muted' }, 'Belum ada tombol. Ketuk salah satu di atas untuk menambah.'));
    if (s.buttons && !s.buttons.length) delete s.buttons;
  };
  draw();
  return box;
}

/** Musik latar per slide: ikut kursus / hening / lagu pustaka tertentu. s.bgm = undefined | 'off' | 'bgm-xxx.mp3' */
export function slideMusicPanel(s, d) {
  const box = h('section', { class: 'editor-card' });
  const draw = () => {
    const mode = !s.bgm ? 'ikut' : s.bgm === 'off' ? 'off' : 'lib';
    const set = (v) => { if (v === 'ikut') delete s.bgm; else if (v === 'off') s.bgm = 'off'; else s.bgm = s.bgm && s.bgm !== 'off' ? s.bgm : ''; d.ctx.changed(); draw(); };
    const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Musik latar slide' }, [['ikut', 'Ikut kursus'], ['off', 'Hening'], ['lib', 'Lagu lain']].map(([v, l]) =>
      h('label', {}, h('input', { type: 'radio', name: `sbgm-${s.id}`, value: v, checked: mode === v, onchange: () => set(v) }), h('span', {}, l))));
    box.replaceChildren(h('h3', {}, 'Musik latar slide ini'), seg,
      mode === 'lib' ? musicPicker({ value: s.bgm, onPick: (f) => { s.bgm = f; d.ctx.changed(); } }) : null,
      h('p', { class: 'hint' }, 'Pilih "Hening" untuk slide yang butuh fokus (mis. kuis), atau lagu lain untuk bagian tertentu. Berganti lagu dengan transisi halus.'));
  };
  draw();
  return box;
}
