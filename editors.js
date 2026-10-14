// ============================================================
// editors.js — formulir penyunting untuk setiap jenis slide
// ============================================================
import { h, icon, toast, formatBytes } from './ui.js';
import { uid } from './util.js';

// ------------------------------------------------------------ katalog jenis slide
export const TYPES = {
  content: { name: 'Materi', desc: 'Teks + gambar dengan beberapa tata letak', color: 'var(--t-content)' },
  image: { name: 'Gambar / GIF', desc: 'Foto, infografis, atau GIF animasi', color: 'var(--t-image)' },
  video: { name: 'Video', desc: 'Unggah MP4 atau tempel link YouTube', color: 'var(--t-video)' },
  html: { name: 'HTML / Embed', desc: 'File .html, mini-website .zip, atau kode embed', color: 'var(--t-html)' },
  flip: { name: 'Kartu balik', desc: 'Istilah di depan, penjelasan di belakang', color: 'var(--t-flip)' },
  hotspot: { name: 'Gambar interaktif', desc: 'Titik penjelasan atau permainan "cari bahaya"', color: 'var(--t-hotspot)' },
  quiz: { name: 'Kuis', desc: 'Pilihan ganda, banyak jawaban, benar/salah', color: 'var(--t-quiz)' },
  sort: { name: 'Urutkan langkah', desc: 'Peserta menyusun urutan yang benar', color: 'var(--t-sort)' },
};

export function newSlide(type) {
  const base = { id: uid('s'), type, title: '', narration: '', audio: null };
  switch (type) {
    case 'image': return { ...base, title: 'Gambar', image: null, imageAlt: '', caption: '', fit: 'contain' };
    case 'video': return { ...base, title: 'Video', source: 'file', video: null, url: '', caption: '', mustWatch: false };
    case 'html': return { ...base, title: 'Konten HTML', source: 'code', html: '', fileName: '', zip: null, height: 560, hideTitle: false, caption: '' };
    case 'flip': return { ...base, title: 'Kenali istilahnya', intro: 'Ketuk kartu untuk melihat penjelasannya.', requireAll: false, cards: [{ front: '', back: '', image: null }, { front: '', back: '', image: null }] };
    case 'hotspot': return { ...base, title: 'Temukan bahayanya', intro: '', image: null, imageAlt: '', mode: 'cari', requireAll: false, radius: 9, points: [] };
    case 'quiz': return { ...base, title: 'Kuis', intro: '', shuffle: true, questions: [newQuestion('single')] };
    case 'sort': return { ...base, title: 'Urutkan langkahnya', intro: '', items: ['', '', ''], feedback: '' };
    default: return { ...base, type: 'content', title: 'Slide baru', body: '', image: null, imageAlt: '', layout: 'atas' };
  }
}
export function newQuestion(type = 'single') {
  if (type === 'tf') return { type: 'tf', text: '', options: ['Benar', 'Salah'], correct: [0], feedback: '' };
  return { type, text: '', options: ['', '', '', ''], correct: [0], feedback: '' };
}

// ------------------------------------------------------------ URL pratinjau untuk Blob
const urls = new WeakMap();
export function urlOf(blob) {
  if (!blob) return '';
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  return urls.get(blob);
}

// ------------------------------------------------------------ komponen formulir
export function field(label, control, hint) {
  const id = control.id || uid('f');
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('div', { class: 'hint', html: hint }) : null);
}
export function text(obj, key, ctx, { multiline = false, rows = 4, placeholder = '', onInput } = {}) {
  const el = h(multiline ? 'textarea' : 'input', { rows: multiline ? rows : null, type: multiline ? null : 'text', placeholder, value: obj[key] ?? '' });
  el.addEventListener('input', () => { obj[key] = el.value; onInput?.(el.value); ctx.changed(); });
  return el;
}
export function toggle(obj, key, ctx, label, hint) {
  const inp = h('input', { type: 'checkbox', checked: !!obj[key], onchange: () => { obj[key] = inp.checked; ctx.changed({ list: true }); } });
  return h('label', { class: 'switch' }, inp, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, label), hint ? h('small', {}, hint) : null));
}
/** Pilihan berbentuk tombol bersebelahan. options: [[value, label], ...] */
export function segmented(obj, key, ctx, options, { onChange, label } = {}) {
  const name = uid('seg');
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label || '' }, options.map(([v, l, ic]) => {
    const inp = h('input', { type: 'radio', name, value: v, checked: obj[key] === v, onchange: () => { obj[key] = v; onChange?.(v); ctx.changed({ list: true }); } });
    return h('label', {}, inp, h('span', {}, ic ? icon(ic) : null, l));
  }));
}

/**
 * Pemilih file media dengan pratinjau. kind: image | video | audio | zip
 */
export function assetPicker(obj, key, ctx, { kind = 'image', label = 'Pilih file', accept, maxMB = 0, onSet } = {}) {
  const acc = accept || { image: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', video: 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v', audio: 'audio/*', zip: '.zip,application/zip' }[kind];
  const input = h('input', { type: 'file', accept: acc, hidden: true });
  const box = h('div', { class: `asset asset-${kind}` });
  const set = (file) => {
    if (!file) return;
    if (maxMB && file.size > maxMB * 1048576) { toast(`File ${formatBytes(file.size)} — terlalu besar (maks ${maxMB} MB). Perkecil dulu agar paket ringan diunggah ke LMS.`, 'error'); return; }
    obj[key] = { data: file, name: file.name, type: file.type };
    onSet?.(obj[key], file);
    ctx.changed({ list: true }); render();
  };
  input.onchange = () => { set(input.files[0]); input.value = ''; };
  box.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('drag'); set(e.dataTransfer.files[0]); });
  const render = () => {
    box.replaceChildren();
    const a = obj[key];
    if (a?.data) {
      const src = urlOf(a.data);
      const prev = kind === 'image' ? h('img', { src, alt: '' })
        : kind === 'video' ? h('video', { src, controls: true, playsInline: true, preload: 'metadata' })
          : kind === 'audio' ? h('audio', { src, controls: true })
            : h('div', { class: 'zip-chip' }, icon('zip'), a.name);
      box.append(prev, h('div', { class: 'asset-meta' },
        h('span', { class: 'asset-name' }, a.name || 'file', h('small', {}, ` · ${formatBytes(a.data.size || 0)}`)),
        h('span', { class: 'row' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => input.click() }, icon('upload'), 'Ganti'),
          h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => { obj[key] = null; onSet?.(null); ctx.changed({ list: true }); render(); } }, icon('trash'), 'Hapus'))));
    } else {
      box.append(h('button', { class: 'asset-empty', type: 'button', onclick: () => input.click() },
        icon(kind === 'zip' ? 'zip' : kind === 'audio' ? 'sound' : kind), h('b', {}, label),
        h('small', {}, { image: 'PNG, JPG, GIF, WebP, SVG — atau seret file ke sini', video: 'MP4/WebM/MOV — atau seret file ke sini', audio: 'MP3, M4A, WAV', zip: 'File .zip berisi index.html' }[kind])));
    }
    box.append(input);
  };
  render();
  return box;
}

// ------------------------------------------------------------ penyunting per jenis
const E = {};

E.content = (s, ctx) => [
  field('Isi materi', text(s, 'body', ctx, { multiline: true, rows: 10, placeholder: 'Tulis materi di sini…' }),
    'Format: baris kosong = paragraf baru · <b>- </b> = poin · <b>1. </b> = nomor · <b>**tebal**</b> · <b>## </b> = subjudul'),
  h('div', { class: 'field' }, h('label', {}, 'Gambar pendukung (opsional)'), assetPicker(s, 'image', ctx, { kind: 'image', label: 'Tambah gambar / GIF', maxMB: 15, onSet: () => ctx.rerender() })),
  s.image ? h('div', { class: 'field' }, h('label', {}, 'Tata letak'), segmented(s, 'layout', ctx, [['atas', 'Gambar di atas'], ['kiri', 'Gambar kiri'], ['kanan', 'Gambar kanan'], ['latar', 'Gambar latar']])) : null,
  s.image ? field('Teks alternatif gambar', text(s, 'imageAlt', ctx, { placeholder: 'Jelaskan isi gambar untuk pembaca layar' })) : null,
];

E.image = (s, ctx) => [
  h('div', { class: 'field' }, h('label', {}, 'Gambar / GIF'), assetPicker(s, 'image', ctx, { kind: 'image', label: 'Pilih gambar atau GIF', maxMB: 25 })),
  field('Keterangan (opsional)', text(s, 'caption', ctx, { placeholder: 'Mis. Contoh penggunaan APD yang benar' })),
  h('div', { class: 'field' }, h('label', {}, 'Ukuran tampil'), segmented(s, 'fit', ctx, [['contain', 'Utuh'], ['cover', 'Penuh lebar']])),
  field('Teks alternatif', text(s, 'imageAlt', ctx, { placeholder: 'Jelaskan isi gambar untuk pembaca layar' })),
];

E.video = (s, ctx) => [
  h('div', { class: 'field' }, h('label', {}, 'Sumber video'), segmented(s, 'source', ctx, [['file', 'Unggah file', 'upload'], ['url', 'Link YouTube / Vimeo / Drive', 'link']], { onChange: () => ctx.rerender() })),
  s.source === 'url'
    ? field('Link video', text(s, 'url', ctx, { placeholder: 'https://www.youtube.com/watch?v=…' }), 'Video dari link butuh internet saat kursus dibuka. Untuk Google Drive, set berbagi ke "Siapa saja yang memiliki link".')
    : h('div', { class: 'field' }, h('label', {}, 'File video'), assetPicker(s, 'video', ctx, { kind: 'video', label: 'Pilih file video', maxMB: 300 }),
      h('div', { class: 'hint' }, 'Saran: MP4 (H.264) di bawah 100 MB agar lancar diunggah ke LMS.')),
  field('Keterangan (opsional)', text(s, 'caption', ctx, { multiline: true, rows: 3 })),
  s.source !== 'url' ? toggle(s, 'mustWatch', ctx, 'Wajib ditonton sampai habis', 'Peserta tidak bisa melompati video; tombol lanjut aktif setelah video selesai (bila navigasi berurutan).') : null,
];

E.html = (s, ctx) => {
  const fileIn = h('input', { type: 'file', accept: '.html,.htm,text/html', hidden: true });
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f) return;
    s.html = await f.text(); s.fileName = f.name; ctx.changed({ list: true }); ctx.rerender();
  };
  return [
    h('div', { class: 'field' }, h('label', {}, 'Sumber'), segmented(s, 'source', ctx, [['code', 'Tempel kode / embed', 'html'], ['file', 'File .html', 'file'], ['zip', 'Mini-website .zip', 'zip']], { onChange: () => ctx.rerender() })),
    s.source === 'zip'
      ? h('div', { class: 'field' }, h('label', {}, 'File .zip'), assetPicker(s, 'zip', ctx, { kind: 'zip', label: 'Pilih file .zip', maxMB: 200 }),
        h('div', { class: 'hint' }, 'Isi zip: index.html beserta folder gambar/CSS/JS-nya. Cocok untuk hasil ekspor Genially, H5P standalone, Articulate Rise web, dsb.'))
      : s.source === 'file'
        ? h('div', { class: 'field' }, h('label', {}, 'File HTML'), h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, icon('upload'), s.fileName ? 'Ganti file' : 'Pilih file .html'),
          s.fileName ? h('span', { class: 'muted' }, s.fileName) : null), fileIn,
          h('div', { class: 'hint' }, 'Untuk halaman yang memakai gambar/CSS terpisah, gunakan pilihan Mini-website .zip.'))
        : field('Kode HTML atau embed', text(s, 'html', ctx, { multiline: true, rows: 9, placeholder: '<iframe src="https://…" allowfullscreen></iframe>\natau HTML lengkap <!doctype html>…' }),
          'Bisa kode embed dari Canva, Google Slides, Genially, Padlet, Google Forms, peta, dll.'),
    h('div', { class: 'field' }, h('label', { for: 'htmlH' }, `Tinggi area: ${s.height || 560} px`),
      h('input', { id: 'htmlH', type: 'range', min: 280, max: 1200, step: 20, value: s.height || 560, oninput: (e) => { s.height = +e.target.value; e.target.previousSibling.textContent = `Tinggi area: ${s.height} px`; ctx.changed(); } })),
    field('Keterangan (opsional)', text(s, 'caption', ctx, { multiline: true, rows: 2 })),
    toggle(s, 'hideTitle', ctx, 'Sembunyikan judul slide', 'Berguna bila konten HTML sudah punya judul sendiri.'),
  ];
};

E.flip = (s, ctx) => {
  const list = h('div', { class: 'stack' });
  const draw = () => {
    list.replaceChildren(...s.cards.map((c, k) => h('div', { class: 'item-card' },
      h('div', { class: 'item-head' }, h('b', {}, `Kartu ${k + 1}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Hapus kartu ${k + 1}`, onclick: () => { if (s.cards.length <= 1) return toast('Minimal 1 kartu.', 'error'); s.cards.splice(k, 1); ctx.changed({ list: true }); draw(); } }, icon('trash'))),
      h('div', { class: 'grid2' },
        field('Depan', text(c, 'front', ctx, { placeholder: 'Mis. APAR' })),
        field('Belakang', text(c, 'back', ctx, { multiline: true, rows: 2, placeholder: 'Mis. Alat Pemadam Api Ringan untuk kebakaran awal' }))),
      h('details', { class: 'mini' }, h('summary', {}, c.image ? 'Gambar depan (ada)' : 'Tambah gambar di sisi depan'), assetPicker(c, 'image', ctx, { kind: 'image', label: 'Gambar kartu', maxMB: 8 })))));
  };
  draw();
  return [
    field('Petunjuk', text(s, 'intro', ctx, { multiline: true, rows: 2 })),
    list,
    h('button', { class: 'btn btn-add', type: 'button', onclick: () => { s.cards.push({ front: '', back: '', image: null }); ctx.changed({ list: true }); draw(); } }, icon('plus'), 'Tambah kartu'),
    toggle(s, 'requireAll', ctx, 'Wajib membalik semua kartu', 'Berlaku bila navigasi kursus "berurutan".'),
  ];
};

E.hotspot = (s, ctx) => {
  const board = h('div', { class: 'hs-board' });
  const list = h('div', { class: 'stack' });
  const draw = () => {
    board.replaceChildren();
    if (!s.image?.data) { board.append(h('p', { class: 'muted' }, 'Pilih gambar dulu, lalu ketuk gambar untuk menaruh titik.')); list.replaceChildren(); return; }
    const img = h('img', { src: urlOf(s.image.data), alt: '', draggable: false });
    const wrap = h('div', { class: 'hs-wrap' }, img);
    board.append(h('p', { class: 'hint' }, 'Ketuk gambar untuk menambah titik. Seret titik untuk memindahkan.'), wrap);
    s.points.forEach((p, k) => {
      const pin = h('button', { class: 'hs-pin', type: 'button', style: { left: `${p.x}%`, top: `${p.y}%` }, 'aria-label': `Titik ${k + 1}` }, String(k + 1));
      pin.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); pin.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const r = wrap.getBoundingClientRect();
          p.x = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
          p.y = Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100));
          pin.style.left = `${p.x}%`; pin.style.top = `${p.y}%`;
        };
        const up = () => { pin.removeEventListener('pointermove', move); pin.removeEventListener('pointerup', up); ctx.changed(); };
        pin.addEventListener('pointermove', move); pin.addEventListener('pointerup', up);
      });
      pin.addEventListener('click', (e) => { e.stopPropagation(); list.children[k]?.querySelector('input')?.focus(); });
      wrap.append(pin);
    });
    wrap.addEventListener('click', (e) => {
      const r = wrap.getBoundingClientRect();
      s.points.push({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, title: '', text: '' });
      ctx.changed({ list: true }); draw();
      list.lastElementChild?.querySelector('input')?.focus();
    });
    list.replaceChildren(...s.points.map((p, k) => h('div', { class: 'item-card' },
      h('div', { class: 'item-head' }, h('span', { class: 'pin-no' }, String(k + 1)), h('b', {}, `Titik ${k + 1}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Hapus titik ${k + 1}`, onclick: () => { s.points.splice(k, 1); ctx.changed({ list: true }); draw(); } }, icon('trash'))),
      field('Judul', text(p, 'title', ctx, { placeholder: 'Mis. Kabel terkelupas' })),
      field('Penjelasan', text(p, 'text', ctx, { multiline: true, rows: 2, placeholder: 'Mengapa berbahaya & apa tindakannya' })))));
  };
  draw();
  return [
    field('Petunjuk', text(s, 'intro', ctx, { multiline: true, rows: 2, placeholder: 'Mis. Temukan 4 kondisi tidak aman di area bengkel ini.' })),
    h('div', { class: 'field' }, h('label', {}, 'Gambar'), assetPicker(s, 'image', ctx, { kind: 'image', label: 'Pilih foto area kerja / diagram', maxMB: 15, onSet: () => setTimeout(draw) })),
    h('div', { class: 'field' }, h('label', {}, 'Mode'), segmented(s, 'mode', ctx, [['cari', 'Cari bahaya (titik tersembunyi)', 'eye'], ['jelajah', 'Jelajah (titik terlihat)', 'hotspot']])),
    board, list,
    s.mode === 'jelajah' ? toggle(s, 'requireAll', ctx, 'Wajib membuka semua titik') : null,
  ];
};

E.quiz = (s, ctx) => {
  const list = h('div', { class: 'stack' });
  const draw = () => {
    list.replaceChildren(...s.questions.map((q, qi) => {
      const group = uid('g');
      const opts = h('div', { class: 'opts-edit' });
      const drawOpts = () => {
        if (q.type === 'tf') {
          opts.replaceChildren(h('div', { class: 'segmented' }, ['Benar', 'Salah'].map((lab, oi) => h('label', {},
            h('input', { type: 'radio', name: group, checked: q.correct[0] === oi, onchange: () => { q.correct = [oi]; ctx.changed(); } }), h('span', {}, `Kunci: ${lab}`)))));
          return;
        }
        opts.replaceChildren(...q.options.map((o, oi) => {
          const mark = h('input', {
            type: q.type === 'multi' ? 'checkbox' : 'radio', name: group, checked: q.correct.includes(oi), 'aria-label': `Pilihan ${oi + 1} benar`,
            onchange: (e) => {
              if (q.type === 'multi') q.correct = e.target.checked ? [...new Set([...q.correct, oi])].sort() : q.correct.filter((x) => x !== oi);
              else q.correct = [oi];
              ctx.changed();
            },
          });
          const t = text(q.options, oi, ctx, { placeholder: `Pilihan ${String.fromCharCode(65 + oi)}` });
          return h('div', { class: 'option-row' }, mark, t,
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Hapus pilihan ${oi + 1}`, onclick: () => {
              if (q.options.length <= 2) return toast('Minimal 2 pilihan.', 'error');
              q.options.splice(oi, 1);
              q.correct = q.correct.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x));
              if (!q.correct.length) q.correct = [0];
              ctx.changed(); drawOpts();
            } }, icon('x')));
        }), q.options.length < 8 ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { q.options.push(''); ctx.changed(); drawOpts(); } }, icon('plus'), 'Pilihan') : null);
      };
      drawOpts();
      const typeSel = h('select', { 'aria-label': 'Jenis soal', onchange: (e) => {
        const t = e.target.value;
        if (t === 'tf') Object.assign(q, { type: 'tf', options: ['Benar', 'Salah'], correct: [0] });
        else {
          if (q.type === 'tf') Object.assign(q, { options: ['', '', '', ''], correct: [0] });
          q.type = t; if (t === 'single') q.correct = q.correct.slice(0, 1);
        }
        ctx.changed(); drawOpts();
      } }, [['single', 'Pilihan ganda (1 jawaban)'], ['multi', 'Banyak jawaban benar'], ['tf', 'Benar / Salah']].map(([v, l]) => h('option', { value: v, selected: q.type === v }, l)));
      return h('div', { class: 'item-card' },
        h('div', { class: 'item-head' }, h('span', { class: 'pin-no' }, String(qi + 1)), typeSel,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Hapus soal ${qi + 1}`, onclick: () => { if (s.questions.length <= 1) return toast('Kuis minimal 1 soal.', 'error'); s.questions.splice(qi, 1); ctx.changed({ list: true }); draw(); } }, icon('trash'))),
        field('Pertanyaan', text(q, 'text', ctx, { multiline: true, rows: 2 })),
        h('div', { class: 'field' }, h('label', {}, 'Jawaban — tandai yang benar'), opts),
        field('Umpan balik setelah dijawab', text(q, 'feedback', ctx, { placeholder: 'Penjelasan singkat jawaban yang benar' })));
    }));
  };
  draw();
  return [
    field('Petunjuk (opsional)', text(s, 'intro', ctx, { multiline: true, rows: 2 })),
    list,
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-add', type: 'button', onclick: () => { s.questions.push(newQuestion('single')); ctx.changed({ list: true }); draw(); } }, icon('plus'), 'Pilihan ganda'),
      h('button', { class: 'btn btn-add', type: 'button', onclick: () => { s.questions.push(newQuestion('multi')); ctx.changed({ list: true }); draw(); } }, icon('plus'), 'Banyak jawaban'),
      h('button', { class: 'btn btn-add', type: 'button', onclick: () => { s.questions.push(newQuestion('tf')); ctx.changed({ list: true }); draw(); } }, icon('plus'), 'Benar/Salah')),
    toggle(s, 'shuffle', ctx, 'Acak urutan pilihan jawaban'),
  ];
};

E.sort = (s, ctx) => {
  const list = h('div', { class: 'stack' });
  const draw = () => {
    list.replaceChildren(...s.items.map((it, k) => h('div', { class: 'option-row' },
      h('span', { class: 'pin-no' }, String(k + 1)),
      text(s.items, k, ctx, { placeholder: `Langkah ${k + 1}` }),
      h('span', { class: 'row tight' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Naikkan', disabled: k === 0, onclick: () => { [s.items[k - 1], s.items[k]] = [s.items[k], s.items[k - 1]]; ctx.changed(); draw(); } }, icon('up')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Hapus', onclick: () => { if (s.items.length <= 2) return toast('Minimal 2 langkah.', 'error'); s.items.splice(k, 1); ctx.changed(); draw(); } }, icon('x'))))));
  };
  draw();
  return [
    field('Petunjuk (opsional)', text(s, 'intro', ctx, { multiline: true, rows: 2 })),
    h('div', { class: 'field' }, h('label', {}, 'Langkah — tulis dalam urutan yang BENAR'), list, h('div', { class: 'hint' }, 'Urutan akan diacak otomatis untuk peserta.')),
    h('button', { class: 'btn btn-add', type: 'button', onclick: () => { s.items.push(''); ctx.changed(); draw(); } }, icon('plus'), 'Tambah langkah'),
    field('Umpan balik', text(s, 'feedback', ctx, { placeholder: 'Mis. Kenakan APD sebelum memasuki area kerja.' })),
  ];
};

/** Formulir lengkap satu slide (tanpa panel narasi). */
export function slideEditor(s, ctx) {
  return [field('Judul slide', text(s, 'title', ctx, { placeholder: 'Judul yang muncul di slide', onInput: () => ctx.changed({ list: true }) })), ...(E[s.type] || E.content)(s, ctx)].filter(Boolean);
}
