// ============================================================
// builder.js — aplikasi SCORM Builder
// ============================================================
import { kv } from './store.js';
import { uid } from './util.js';
import { h, icon, toast, modal, busy, formatBytes } from './ui.js';
import { TYPES, newSlide, slideEditor, field, text, toggle, segmented, assetPicker, urlOf } from './editors.js';
import { loadTemplate, buildPackage, validateProject, toCourseData, wrapHtml, projectSize, isAsset } from './packager.js';
import { importFiles, ACCEPT_ALL } from './importers.js';
import { BrowserTTS, Recorder, EdgeTTS, cleanForSpeech, normalizeServerUrl } from './tts.js';

const KEY = 'proyek-v2';
const TTS_KEY = 'studio-scorm:tts-v2';
const $ = (id) => document.getElementById(id);

export const THEMES = {
  k3: { name: 'Hijau K3', accent: '#00704f', accent2: '#ffc21a', onAccent: '#ffffff', bg: '#f2f5f0', surface: '#ffffff', ink: '#18222c', muted: '#5d6871', line: '#d8dfd6' },
  korporat: { name: 'Biru Korporat', accent: '#1d4f91', accent2: '#25b4c8', onAccent: '#ffffff', bg: '#f1f4f9', surface: '#ffffff', ink: '#17212e', muted: '#5a6577', line: '#d6dde8' },
  tambang: { name: 'Oranye Tambang', accent: '#c2410c', accent2: '#facc15', onAccent: '#ffffff', bg: '#fbf6f1', surface: '#ffffff', ink: '#1f1a17', muted: '#6b5f57', line: '#e8dcd1' },
  ceria: { name: 'Ungu Ceria', accent: '#6d3fc4', accent2: '#ff5d8f', onAccent: '#ffffff', bg: '#f6f3ff', surface: '#ffffff', ink: '#1e1a2e', muted: '#625b75', line: '#e0d9f2' },
  malam: { name: 'Mode Malam', accent: '#3fbf8f', accent2: '#ffc857', onAccent: '#0b1a14', bg: '#11171d', surface: '#1a232b', ink: '#e8eef2', muted: '#9aa7b1', line: '#2c3a44' },
};

let project = null;
let currentId = null;
let sideTab = 'lihat';
const browserTTS = new BrowserTTS();

// ================================================================ model proyek
function blankProject() {
  const first = newSlide('content');
  first.title = 'Selamat datang';
  first.body = 'Tulis pengantar kursus di sini.\n\n- Tujuan pembelajaran 1\n- Tujuan pembelajaran 2';
  return {
    format: 2, id: uid('kursus'), title: 'Kursus baru', description: '', version: '1.2', passingScore: 80,
    navigation: 'bebas', certificate: true, certificateIssuer: '',
    theme: { preset: 'k3', ...THEMES.k3, font: 'modern', transition: 'geser' }, logo: null, cover: null,
    narration: { browser: true, autoplay: false, voiceName: '', rate: 1 },
    slides: [first],
  };
}
/** Proyek versi lama (format 1) → format 2. */
function migrate(p) {
  if (!p) return p;
  p.format = 2;
  p.theme ||= { preset: 'k3', ...THEMES.k3, font: 'modern', transition: 'geser' };
  p.navigation ||= 'bebas';
  p.certificate ??= true;
  p.narration ||= { browser: p.settings?.browserNarration !== false, autoplay: !!p.settings?.autoplay, voiceName: '', rate: 1 };
  for (const s of p.slides || []) {
    s.id ||= uid('s');
    s.narration ??= '';
    if (s.audio && !s.audio.name) s.audio = { data: s.audio.data, name: 'narasi.mp3', type: s.audio.data?.type || 'audio/mpeg' };
    if (s.type === 'content' && s.image && 'alt' in s.image) { s.imageAlt = s.image.alt; s.image = { data: s.image.data, name: s.image.name, type: s.image.data?.type }; }
    if (s.type === 'content') s.layout ||= 'atas';
    if (s.type === 'quiz') {
      s.shuffle ??= false;
      s.questions = (s.questions || []).map((q) => ({ type: q.type || 'single', text: q.text || '', options: q.options || ['', ''], correct: Array.isArray(q.correct) ? q.correct : [q.correct ?? 0], feedback: q.feedback || '' }));
    }
  }
  return p;
}
const current = () => project.slides.find((s) => s.id === currentId) || project.slides[0];

let saveTimer;
function save() {
  $('saveState').textContent = 'Menyimpan…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await kv.set(KEY, project); $('saveState').textContent = 'Tersimpan'; } catch (e) {
      console.error(e); $('saveState').textContent = 'Gagal simpan';
      toast('Penyimpanan browser penuh. Ekspor proyek (tab Atur) lalu hapus video/audio besar yang tidak dipakai.', 'error');
    }
  }, 450);
}

// Objek yang dipakai semua penyunting untuk memberi tahu ada perubahan.
const ctx = {
  changed(opts = {}) { save(); schedulePreview(); if (opts.list) renderList(); },
  rerender() { renderEditor(); schedulePreview(); renderList(); },
};

// ================================================================ ikon statis di HTML
function fillIcons(root = document) {
  root.querySelectorAll('.ic-slot[data-icon]').forEach((el) => el.replaceWith(icon(el.dataset.icon)));
}

// ================================================================ daftar slide
function snippet(s) {
  switch (s.type) {
    case 'quiz': return `${s.questions.length} soal`;
    case 'sort': return `${s.items.filter((x) => x.trim()).length} langkah`;
    case 'flip': return `${s.cards.length} kartu`;
    case 'hotspot': return `${s.points.length} titik · ${s.mode === 'cari' ? 'cari bahaya' : 'jelajah'}`;
    case 'video': return s.source === 'url' ? 'link video' : s.video ? s.video.name : 'belum ada video';
    case 'html': return s.source === 'zip' ? (s.zip?.name || 'mini-website') : s.source === 'file' ? (s.fileName || 'file html') : 'kode embed';
    case 'image': return s.image ? s.image.name : 'belum ada gambar';
    default: return (s.body || '').replace(/[#*\-\n]+/g, ' ').trim().slice(0, 60) || 'materi';
  }
}
function thumbOf(s) {
  const img = s.image?.data || s.cards?.find((c) => c.image)?.image?.data;
  if (img && (img.type || '').startsWith('image/')) return h('img', { src: urlOf(img), alt: '' });
  if (s.type === 'video' && s.video?.data) return h('video', { src: `${urlOf(s.video.data)}#t=0.5`, muted: true, preload: 'metadata' });
  return icon(s.type);
}

function renderList() {
  const ol = $('slideList');
  $('slideCount').textContent = project.slides.length;
  ol.replaceChildren(...project.slides.map((s, i) => {
    const li = h('li', { class: 'slide-row', 'data-id': s.id, style: { '--tc': TYPES[s.type]?.color } },
      h('span', { class: 'drag', 'aria-hidden': 'true', title: 'Seret untuk memindah' }, icon('grip')),
      h('button', { class: 'slide-item', type: 'button', 'aria-current': String(s.id === currentId), onclick: () => select(s.id, true) },
        h('span', { class: 'num' }, String(i + 1)),
        h('span', { class: 'thumb' }, thumbOf(s)),
        h('span', { class: 'meta' },
          h('span', { class: 'title' }, s.title || '(tanpa judul)'),
          h('span', { class: 'sub' }, h('i', { class: 'type-dot' }), `${TYPES[s.type]?.name || s.type} · ${snippet(s)}`)),
        s.audio ? h('span', { class: 'badge-audio', title: 'Ada audio narasi' }, icon('sound')) : null));
    return li;
  }));
  enableDragSort(ol);
}

function enableDragSort(ol) {
  ol.querySelectorAll('.drag').forEach((handle) => {
    handle.onpointerdown = (e) => {
      e.preventDefault();
      const li = handle.closest('li');
      li.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const rows = [...ol.children].filter((x) => x !== li);
        const target = rows.find((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
        if (target) { if (target.previousElementSibling !== li) ol.insertBefore(li, target); } else if (ol.lastElementChild !== li) ol.append(li);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        li.classList.remove('dragging');
        const order = [...ol.children].map((r) => r.dataset.id);
        project.slides.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        ctx.changed({ list: true });
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    };
  });
}

function select(id, goEdit = false) {
  browserTTS.stop();
  currentId = id;
  renderList(); renderEditor(); schedulePreview(true);
  if (goEdit) setView('edit');
}

// ================================================================ penyunting
function renderEditor() {
  const s = current();
  const ed = $('editor');
  if (!s) { ed.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Belum ada slide.'), h('button', { class: 'btn btn-primary', onclick: openAddPicker }, icon('plus'), 'Tambah slide'))); return; }
  const idx = project.slides.indexOf(s);
  const t = TYPES[s.type];
  const head = h('div', { class: 'editor-head', style: { '--tc': t?.color } },
    h('span', { class: 'type-chip' }, icon(s.type), t?.name),
    h('span', { class: 'muted' }, `Slide ${idx + 1} dari ${project.slides.length}`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'icon-btn', type: 'button', title: 'Naikkan', 'aria-label': 'Naikkan slide', disabled: idx === 0, onclick: () => move(-1) }, icon('up')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Turunkan', 'aria-label': 'Turunkan slide', disabled: idx === project.slides.length - 1, onclick: () => move(1) }, icon('down')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Duplikat', 'aria-label': 'Duplikat slide', onclick: duplicate }, icon('copy')),
    h('button', { class: 'icon-btn danger', type: 'button', title: 'Hapus', 'aria-label': 'Hapus slide', onclick: removeSlide }, icon('trash')));
  ed.replaceChildren(h('div', { class: 'editor-card' }, head, ...slideEditor(s, ctx)), narrationPanel(s),
    h('div', { class: 'editor-foot' },
      h('button', { class: 'btn', type: 'button', disabled: idx === 0, onclick: () => select(project.slides[idx - 1].id) }, icon('up'), 'Slide sebelumnya'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: openAddPicker }, icon('plus'), 'Tambah slide')));
}

function move(d) {
  const i = project.slides.indexOf(current()), j = i + d;
  if (j < 0 || j >= project.slides.length) return;
  [project.slides[i], project.slides[j]] = [project.slides[j], project.slides[i]];
  ctx.changed({ list: true }); renderEditor(); schedulePreview(true);
}
function duplicate() {
  const s = current();
  const copy = structuredClone(s);
  copy.id = uid('s'); copy.title = `${s.title} (salinan)`;
  project.slides.splice(project.slides.indexOf(s) + 1, 0, copy);
  select(copy.id); ctx.changed();
}
function removeSlide() {
  if (project.slides.length <= 1) return toast('Kursus minimal punya 1 slide.', 'error');
  if (!confirm(`Hapus slide "${current().title || 'tanpa judul'}"?`)) return;
  const i = project.slides.indexOf(current());
  project.slides.splice(i, 1);
  select(project.slides[Math.max(0, i - 1)].id); ctx.changed();
}
function insertSlides(list) {
  const at = project.slides.indexOf(current()) + 1;
  project.slides.splice(at, 0, ...list);
  select(list[0].id, true); ctx.changed({ list: true });
}

// ================================================================ narasi per slide
function autoNarration(s) {
  const parts = [s.title];
  if (s.type === 'content') parts.push(s.body);
  if (s.caption) parts.push(s.caption);
  if (s.intro) parts.push(s.intro);
  if (s.type === 'quiz') s.questions.forEach((q, i) => parts.push(`Soal ${i + 1}. ${q.text}`));
  return parts.filter(Boolean).join('.\n\n');
}
const narrationFor = (s) => (s.narration?.trim() ? s.narration : autoNarration(s));

function ttsCfg() { try { return JSON.parse(localStorage.getItem(TTS_KEY) || '{}'); } catch { return {}; } }
function setTtsCfg(patch) { localStorage.setItem(TTS_KEY, JSON.stringify({ ...ttsCfg(), ...patch })); }

function narrationPanel(s) {
  const cfg = ttsCfg();
  const audioBox = h('div', { class: 'narr-audio' });
  const drawAudio = () => {
    audioBox.replaceChildren();
    if (s.audio?.data) {
      audioBox.append(h('audio', { src: urlOf(s.audio.data), controls: true }),
        h('div', { class: 'row' }, h('small', { class: 'muted grow' }, `${s.audio.source || 'audio'} · ${formatBytes(s.audio.data.size)}`),
          h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => { s.audio = null; ctx.changed({ list: true }); drawAudio(); } }, icon('trash'), 'Hapus audio')));
    } else {
      audioBox.append(h('p', { class: 'hint' }, project.narration.browser
        ? 'Belum ada file audio — saat kursus dibuka, naskah akan dibacakan suara perangkat peserta (bisa dimatikan di tab Atur).'
        : 'Belum ada audio untuk slide ini.'));
    }
  };
  drawAudio();
  const listenBtn = h('button', { class: 'btn', type: 'button', disabled: !BrowserTTS.supported }, icon('play'), 'Dengarkan');
  listenBtn.onclick = async () => {
    if (!browserTTS.stopped) { browserTTS.stop(); listenBtn.replaceChildren(icon('play'), 'Dengarkan'); return; }
    const voices = await BrowserTTS.voices();
    const v = voices.find((x) => x.name === project.narration.voiceName) || voices[0];
    try {
      browserTTS.speak(narrationFor(s), { voice: v, rate: project.narration.rate || 1, onEnd: () => listenBtn.replaceChildren(icon('play'), 'Dengarkan') });
      listenBtn.replaceChildren(icon('stop'), 'Berhenti');
    } catch (e) { toast(e.message, 'error'); }
  };
  const upIn = h('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.wav,.ogg', hidden: true, onchange: (e) => {
    const f = e.target.files[0]; if (!f) return;
    s.audio = { data: f, name: f.name, type: f.type, source: 'unggahan' }; ctx.changed({ list: true }); drawAudio(); e.target.value = '';
  } });
  const mp3Btn = h('button', { class: 'btn btn-magic', type: 'button' }, icon('sparkle'), 'Buat MP3 natural');
  mp3Btn.onclick = async () => {
    if (!ttsCfg().url) { setSideTab('suara', true); toast('Pasang server suara dulu (gratis) di tab Suara — atau pakai suara perangkat/rekam sendiri.'); return; }
    await makeMp3(s, mp3Btn); drawAudio();
  };
  return h('section', { class: 'editor-card narr' },
    h('div', { class: 'narr-head' }, icon('sound'), h('h3', {}, 'Narasi suara'), h('span', { class: 'spacer' }),
      h('span', { class: 'muted small' }, cfg.url ? 'Server MP3 terpasang' : 'Suara perangkat aktif')),
    field('Naskah narasi', text(s, 'narration', ctx, { multiline: true, rows: 4, placeholder: 'Kosongkan untuk membacakan judul + isi slide otomatis.' })),
    h('div', { class: 'narr-actions' },
      listenBtn,
      h('button', { class: 'btn', type: 'button', disabled: !Recorder.supported, onclick: () => openRecorder(s, drawAudio) }, icon('mic'), 'Rekam suara'),
      h('button', { class: 'btn', type: 'button', onclick: () => upIn.click() }, icon('upload'), 'Unggah audio'),
      mp3Btn, upIn),
    audioBox);
}

async function makeMp3(s, btn) {
  const cfg = ttsCfg();
  const t = cleanForSpeech(narrationFor(s));
  if (!t) { toast('Slide ini belum punya teks untuk dibacakan.', 'error'); return false; }
  const old = btn ? [...btn.childNodes] : null;
  if (btn) { btn.disabled = true; btn.replaceChildren(h('span', { class: 'spinner sm' }), `Membuat suara…`); }
  try {
    const blob = await new EdgeTTS(cfg.url).synthesize(t, { voice: cfg.voice || 'id-ID-GadisNeural', rate: +cfg.rate || 0, pitch: +cfg.pitch || 0 });
    s.audio = { data: blob, name: 'narasi.mp3', type: 'audio/mpeg', source: `MP3 · ${(cfg.voice || 'id-ID-GadisNeural').replace(/^id-ID-|Neural$/g, '')}` };
    ctx.changed({ list: true });
    return true;
  } catch (e) { toast(e.message, 'error'); return false; } finally {
    if (btn) { btn.disabled = false; btn.replaceChildren(...old); }
  }
}

function openRecorder(s, after) {
  const rec = new Recorder();
  const level = h('div', { class: 'meter' }, h('div'));
  const timer = h('div', { class: 'rec-time' }, '00:00');
  const big = h('button', { class: 'rec-btn', type: 'button', 'aria-label': 'Mulai merekam' }, icon('mic'));
  const status = h('p', { class: 'muted center' }, 'Tekan tombol merah untuk mulai. Bacakan naskah di bawah dengan tenang.');
  const result = h('div', { class: 'rec-result' });
  const script = h('div', { class: 'rec-script' }, narrationFor(s));
  let tick, blob = null;
  big.onclick = async () => {
    if (big.classList.contains('on')) {
      clearInterval(tick);
      blob = await rec.stop();
      big.classList.remove('on'); big.setAttribute('aria-label', 'Rekam ulang');
      status.textContent = 'Dengarkan hasilnya. Puas? Pakai rekaman ini.';
      result.replaceChildren(h('audio', { src: URL.createObjectURL(blob.data), controls: true }),
        h('div', { class: 'row center' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
          s.audio = { ...blob, source: 'rekaman' }; ctx.changed({ list: true }); after(); m.close(); toast('Rekaman dipasang di slide ini.');
        } }, icon('check'), 'Pakai rekaman ini')));
      return;
    }
    try {
      result.replaceChildren();
      await rec.start({ onLevel: (v) => { level.firstChild.style.width = `${Math.round(v * 100)}%`; } });
      big.classList.add('on'); big.setAttribute('aria-label', 'Berhenti merekam');
      status.textContent = 'Merekam… tekan lagi untuk berhenti.';
      const t0 = Date.now();
      tick = setInterval(() => { const sec = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }, 250);
    } catch (e) { toast(e.message, 'error'); }
  };
  const m = modal('Rekam suara narasi', h('div', { class: 'recorder' }, big, timer, level, status, result, h('details', { class: 'mini', open: true }, h('summary', {}, 'Naskah'), script)),
    { onClose: () => { clearInterval(tick); rec.cleanup(); } });
}

// ================================================================ pratinjau langsung
let pvTimer, pvReady = false;
function schedulePreview(immediate = false) {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(sendPreview, immediate ? 0 : 350);
}
async function sendPreview(keepState = false) {
  if (!pvReady || !project) return;
  const frame = $('pvFrame');
  try {
    const data = await toCourseData(project, (a) => urlOf(a.data), async (s) => {
      if (s.source === 'zip') return { placeholder: `Mini-website "${s.zip?.name || '.zip'}" — tampil penuh di "Coba di Player" atau di LMS.` };
      return s.html?.trim() ? { srcdoc: wrapHtml(s.html, s.title) } : { placeholder: 'Konten HTML belum diisi' };
    });
    const idx = $('pvCover').checked ? -1 : project.slides.indexOf(current());
    frame.contentWindow.postMessage({ type: 'studio:preview', course: data, index: idx, keepState }, location.origin);
  } catch (e) { console.error(e); }
}
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'studio:ready') { pvReady = true; sendPreview(); }
});
// Iframe pratinjau bisa selesai dimuat sebelum modul ini siap — cek juga lewat event load.
function watchPreviewFrame() {
  const f = $('pvFrame');
  const ready = () => { pvReady = true; sendPreview(); };
  f.addEventListener('load', ready);
  try { if (f.contentDocument?.readyState === 'complete' && f.contentWindow?.location.href.includes('preview.html')) ready(); } catch { /* abaikan */ }
}
function fitPreview() {
  const stage = $('pvStage'), dev = $('pvDevice');
  const laptop = document.querySelector('input[name="dev"]:checked')?.value === 'laptop';
  const W = laptop ? 1180 : 390, H = laptop ? 760 : 780;
  dev.dataset.dev = laptop ? 'laptop' : 'hp';
  dev.style.width = `${W}px`; dev.style.height = `${H}px`;
  const scale = Math.min(1, (stage.clientWidth - 8) / W, laptop ? 1 : 1);
  dev.style.transform = `scale(${scale})`;
  stage.style.height = `${H * scale + 8}px`;
}

// ================================================================ panel samping
function setSideTab(tab, reveal = false) {
  sideTab = tab;
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  if (tab === 'gaya') renderGaya();
  if (tab === 'atur') renderAtur();
  if (tab === 'suara') renderSuara();
  if (tab === 'lihat') requestAnimationFrame(fitPreview);
  if (reveal) setView(tab === 'lihat' ? 'lihat' : 'atur');
}

function renderGaya() {
  const p = project, panel = document.querySelector('[data-panel="gaya"]');
  const presets = h('div', { class: 'theme-grid' }, Object.entries(THEMES).map(([k, t]) => h('button', {
    class: 'theme-card', type: 'button', 'aria-pressed': String(p.theme.preset === k),
    style: { '--a': t.accent, '--b': t.accent2, '--bg': t.bg, '--ink': t.ink, '--sf': t.surface },
    onclick: () => { p.theme = { ...p.theme, ...t, preset: k }; delete p.theme.name; ctx.changed(); renderGaya(); },
  }, h('span', { class: 'swatch' }, h('i'), h('i'), h('i')), h('span', {}, t.name))));
  const color = (key, label) => {
    const inp = h('input', { type: 'color', value: p.theme[key] || '#000000', oninput: () => { p.theme[key] = inp.value; p.theme.preset = 'custom'; ctx.changed(); } });
    return h('label', { class: 'color-field' }, inp, h('span', {}, label));
  };
  panel.replaceChildren(
    h('h3', {}, 'Tema warna'), presets,
    h('div', { class: 'row wrap' }, color('accent', 'Warna utama'), color('accent2', 'Warna aksen'), color('bg', 'Latar')),
    h('div', { class: 'field' }, h('label', {}, 'Gaya huruf'), segmented(p.theme, 'font', ctx, [['modern', 'Modern'], ['klasik', 'Klasik'], ['bulat', 'Bulat']])),
    h('div', { class: 'field' }, h('label', {}, 'Transisi antar slide'), segmented(p.theme, 'transition', ctx, [['geser', 'Geser'], ['pudar', 'Pudar'], ['zoom', 'Zoom'], ['none', 'Tanpa']])),
    h('div', { class: 'field' }, h('label', {}, 'Logo (pojok kiri atas & sertifikat)'), assetPicker(p, 'logo', ctx, { kind: 'image', label: 'Unggah logo', maxMB: 3 })),
    h('div', { class: 'field' }, h('label', {}, 'Gambar sampul halaman pembuka'), assetPicker(p, 'cover', ctx, { kind: 'image', label: 'Unggah gambar sampul', maxMB: 10, onSet: () => { $('pvCover').checked = true; schedulePreview(); } })),
  );
}

function renderAtur() {
  const p = project, panel = document.querySelector('[data-panel="atur"]');
  const pass = h('input', { type: 'range', min: 0, max: 100, step: 5, value: p.passingScore, 'aria-label': 'Nilai lulus' });
  const passOut = h('b', { class: 'big-num' }, String(p.passingScore));
  pass.oninput = () => { p.passingScore = +pass.value; passOut.textContent = pass.value; ctx.changed(); };
  const size = projectSize(p);
  panel.replaceChildren(
    h('h3', {}, 'Info kursus'),
    field('Judul kursus', text(p, 'title', ctx, { placeholder: 'Mis. Pengenalan APD' })),
    field('Deskripsi singkat (halaman pembuka)', text(p, 'description', ctx, { multiline: true, rows: 3 })),
    h('div', { class: 'field' }, h('label', {}, 'Versi SCORM'), segmented(p, 'version', ctx, [['1.2', 'SCORM 1.2'], ['2004', 'SCORM 2004']]), h('div', { class: 'hint' }, 'Ragu? Pilih 1.2 — paling banyak didukung LMS (Moodle, dll.).')),
    h('div', { class: 'field' }, h('label', {}, 'Nilai lulus kuis'), h('div', { class: 'row' }, pass, passOut)),
    h('div', { class: 'field' }, h('label', {}, 'Navigasi peserta'), segmented(p, 'navigation', ctx, [['bebas', 'Bebas'], ['berurutan', 'Harus berurutan']]), h('div', { class: 'hint' }, 'Berurutan: peserta harus menyelesaikan kuis/video/kartu sebelum lanjut.')),
    toggle(p, 'certificate', ctx, 'Sertifikat di akhir kursus', 'Muncul bila peserta lulus (atau menyelesaikan semua slide bila tanpa kuis). Bisa dicetak / disimpan PDF.'),
    p.certificate ? field('Nama penerbit sertifikat (opsional)', text(p, 'certificateIssuer', ctx, { placeholder: 'Mis. Departemen QSHE' })) : null,
    h('h3', {}, 'Narasi'),
    toggle(p.narration, 'browser', ctx, 'Bacakan dengan suara perangkat', 'Untuk slide tanpa file audio. Gratis, tanpa server.'),
    toggle(p.narration, 'autoplay', ctx, 'Putar narasi otomatis di setiap slide'),
    h('h3', {}, 'Proyek'),
    h('p', { class: 'hint' }, `Ukuran media: ${formatBytes(size)}. Proyek tersimpan otomatis di browser ini.`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', type: 'button', onclick: exportProject }, icon('download'), 'Ekspor proyek (.json)'),
      h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, icon('upload'), 'Impor proyek'),
      h('button', { class: 'btn', type: 'button', onclick: loadSample }, icon('book'), 'Muat contoh'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: newProject }, icon('plus'), 'Proyek baru')),
  );
}

function renderSuara() {
  const panel = document.querySelector('[data-panel="suara"]');
  const cfg = ttsCfg();
  // --- suara perangkat
  const vSel = h('select', { 'aria-label': 'Suara perangkat' }, h('option', { value: '' }, 'Otomatis (suara Indonesia terbaik)'));
  let voices = [];
  // Daftar suara dimuat belakangan supaya panel langsung tampil (di HP daftar suara kadang lambat).
  BrowserTTS.voices().then((list) => {
    voices = list;
    list.filter((v) => /^(id|in)[-_]/i.test(v.lang)).concat(list.filter((v) => !/^(id|in)[-_]/i.test(v.lang)).slice(0, 40))
      .forEach((v) => vSel.append(h('option', { value: v.name, selected: v.name === project.narration.voiceName }, `${v.name} (${v.lang})`)));
    if (!list.length) vSel.append(h('option', { value: '', disabled: true }, 'Perangkat ini belum punya suara terpasang'));
  });
  vSel.onchange = () => { project.narration.voiceName = vSel.value; ctx.changed(); };
  const rate = h('input', { type: 'range', min: 0.7, max: 1.4, step: 0.05, value: project.narration.rate || 1, oninput: (e) => { project.narration.rate = +e.target.value; ctx.changed(); } });
  const tryBtn = h('button', { class: 'btn', type: 'button', disabled: !BrowserTTS.supported, onclick: async () => {
    const v = voices.find((x) => x.name === vSel.value) || voices.find((x) => /^(id|in)[-_]/i.test(x.lang)) || voices[0];
    try { browserTTS.speak('Halo! Ini contoh suara narasi untuk kursus Anda.', { voice: v, rate: project.narration.rate }); } catch (e) { toast(e.message, 'error'); }
  } }, icon('play'), 'Coba suara');

  // --- server MP3
  const url = h('input', { type: 'url', placeholder: 'https://huggingface.co/spaces/nama/tts-scorm', value: cfg.url || '' });
  const status = h('div', { class: 'server-status' }, cfg.url ? h('span', { class: 'pill' }, 'Tersimpan — tekan Cek') : h('span', { class: 'pill off' }, 'Belum dipasang'));
  const voiceSel = h('select', { 'aria-label': 'Suara MP3' }, [['id-ID-GadisNeural', 'Gadis — perempuan'], ['id-ID-ArdiNeural', 'Ardi — laki-laki']].map(([v, l]) => h('option', { value: v, selected: (cfg.voice || 'id-ID-GadisNeural') === v }, l)));
  voiceSel.onchange = () => setTtsCfg({ voice: voiceSel.value });
  const rateIn = h('input', { type: 'range', min: -30, max: 30, step: 5, value: cfg.rate || 0, oninput: (e) => setTtsCfg({ rate: +e.target.value }) });
  const check = async () => {
    const u = normalizeServerUrl(url.value);
    url.value = u; setTtsCfg({ url: u });
    status.replaceChildren(h('span', { class: 'spinner sm' }), ' Menghubungi server… (Space yang tidur butuh ±1 menit)');
    try {
      const api = new EdgeTTS(u);
      await api.health();
      const list = await api.voices('id');
      voiceSel.replaceChildren(...list.map((v) => h('option', { value: v.name, selected: v.name === (ttsCfg().voice || 'id-ID-GadisNeural') }, `${v.name.replace(/^[a-z]{2}-[A-Z]{2}-/, '').replace(/Neural$/, '')} — ${v.locale}, ${v.gender.toLowerCase()}${v.multilingual ? ', multibahasa' : ''}`)));
      status.replaceChildren(h('span', { class: 'pill ok' }, icon('check'), 'Terhubung'), ` ${list.length} suara tersedia`);
      renderEditor();
    } catch (e) { status.replaceChildren(h('span', { class: 'pill off' }, 'Gagal'), ` ${e.message}`); }
  };
  const allBtn = h('button', { class: 'btn btn-magic', type: 'button' }, icon('sparkle'), 'Buat MP3 untuk semua slide');
  const allProg = h('div', { class: 'progress', hidden: true }, h('div'));
  allBtn.onclick = async () => {
    if (!ttsCfg().url) return toast('Isi alamat server dulu, lalu tekan Cek.', 'error');
    const targets = project.slides.filter((s) => cleanForSpeech(narrationFor(s)));
    if (project.slides.some((s) => s.audio) && !confirm('Slide yang sudah punya audio akan diganti MP3 baru. Lanjutkan?')) return;
    allBtn.disabled = true; allProg.hidden = false;
    let ok = 0;
    for (const [i, s] of targets.entries()) {
      allBtn.replaceChildren(h('span', { class: 'spinner sm' }), `Slide ${i + 1} dari ${targets.length}…`);
      if (!(await makeMp3(s))) break;
      ok++; allProg.firstChild.style.width = `${(ok / targets.length) * 100}%`;
    }
    allBtn.disabled = false; allBtn.replaceChildren(icon('sparkle'), 'Buat MP3 untuk semua slide');
    toast(`${ok} dari ${targets.length} slide sudah punya MP3.`); renderEditor();
  };
  const dl = (f) => h('a', { class: 'btn btn-sm', href: f, download: f }, icon('download'), f);

  panel.replaceChildren(
    h('div', { class: 'callout' }, icon('info'), h('div', {}, h('b', {}, 'Tiga cara memberi suara — semuanya gratis'),
      h('ol', {}, h('li', {}, h('b', {}, 'Suara perangkat'), ' — langsung jalan, tanpa pemasangan.'), h('li', {}, h('b', {}, 'Rekam sendiri'), ' — tombol "Rekam suara" di setiap slide.'), h('li', {}, h('b', {}, 'MP3 natural'), ' — suara Gadis/Ardi, perlu server gratis sekali pasang (panduan di bawah).')))),
    h('h3', {}, '1. Suara perangkat'),
    field('Suara yang dipakai', vSel, 'Di paket SCORM, perangkat peserta memakai suara Indonesia terbaik yang tersedia di perangkatnya.'),
    h('div', { class: 'field' }, h('label', {}, 'Kecepatan bicara'), rate),
    tryBtn,
    h('h3', {}, '2. MP3 suara natural (opsional)'),
    field('Alamat server suara', h('div', { class: 'row' }, url, h('button', { class: 'btn', type: 'button', onclick: check }, 'Cek')), 'Tempel alamat Space Hugging Face Anda. Disimpan di perangkat ini.'),
    status,
    h('div', { class: 'grid2' }, field('Suara', voiceSel), h('div', { class: 'field' }, h('label', {}, 'Kecepatan'), rateIn)),
    allBtn, allProg,
    h('details', { class: 'guide', open: !cfg.url },
      h('summary', {}, icon('book'), 'Panduan: pasang server suara gratis di Hugging Face (±10 menit, sekali saja)'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Unduh 3 file ini ke HP/laptop:', h('div', { class: 'row wrap' }, dl('main.py'), dl('requirements.txt'), dl('Dockerfile'))),
        h('li', {}, 'Daftar gratis di ', h('a', { href: 'https://huggingface.co/join', target: '_blank', rel: 'noopener' }, 'huggingface.co'), ', lalu buka ', h('a', { href: 'https://huggingface.co/new-space', target: '_blank', rel: 'noopener' }, 'New Space'), '.'),
        h('li', {}, 'Isi nama Space (mis. ', h('code', {}, 'tts-scorm'), '), pilih SDK ', h('b', {}, 'Docker → Blank'), ', hardware ', h('b', {}, 'CPU basic (Free)'), ', visibilitas ', h('b', {}, 'Public'), ' → Create Space.'),
        h('li', {}, 'Di Space: tab ', h('b', {}, 'Files → Add file → Upload files'), ' → pilih ketiga file tadi → ', h('b', {}, 'Commit'), '. (Tanpa folder — cukup 3 file.)'),
        h('li', {}, 'Tunggu ±3–5 menit sampai status di atas Space berubah ', h('b', {}, 'Running'), '.'),
        h('li', {}, 'Salin alamat Space dari browser (mis. ', h('code', {}, 'https://huggingface.co/spaces/nama/tts-scorm'), '), tempel ke kotak di atas, tekan ', h('b', {}, 'Cek'), '.')),
      h('p', { class: 'hint' }, 'Space gratis "tidur" bila 48 jam tidak dipakai — buka alamatnya sekali untuk membangunkan. Bila suatu saat gagal membuat suara, buka Settings Space → Factory rebuild agar memakai edge-tts terbaru. Catatan: edge-tts memakai layanan suara Microsoft Edge yang tidak resmi; audio yang sudah jadi tetap aman tersimpan di paket.')),
  );
  if (cfg.url) check();
}

// ================================================================ tambah slide & impor
const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (!confirm('Proyek yang sedang dibuka akan diganti. Lanjutkan?')) return;
  try { await openProjectJson(JSON.parse(await f.text())); toast('Proyek diimpor.'); } catch (err) { toast(err.message, 'error'); }
} });
const fileImport = h('input', { type: 'file', multiple: true, accept: ACCEPT_ALL, hidden: true, onchange: (e) => { runImport([...e.target.files]); e.target.value = ''; } });
document.body.append(importInput, fileImport);
let pdfAsNarration = false;

function openAddPicker() {
  const cards = Object.entries(TYPES).map(([k, t]) => h('button', { class: 'type-card', type: 'button', style: { '--tc': t.color }, onclick: () => {
    m.close(); const s = newSlide(k); insertSlides([s]);
  } }, h('span', { class: 'type-icon' }, icon(k)), h('b', {}, t.name), h('small', {}, t.desc)));
  const imp = [
    ['ppt', 'PowerPoint', '.pptx'], ['pdf', 'PDF', '.pdf'], ['word', 'Word', '.docx'],
    ['image', 'Gambar / GIF', 'image/*'], ['video', 'Video', 'video/*,.mp4,.mov,.webm'], ['zip', 'HTML / ZIP', '.html,.htm,.zip'],
  ].map(([ic, label, acc]) => h('button', { class: 'import-chip', type: 'button', onclick: () => { m.close(); fileImport.accept = acc; fileImport.click(); setTimeout(() => (fileImport.accept = ACCEPT_ALL), 1000); } }, icon(ic), label));
  const pdfOpt = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: pdfAsNarration, onchange: (e) => (pdfAsNarration = e.target.checked) }), 'Teks halaman PDF dijadikan naskah narasi');
  const m = modal('Tambah slide', h('div', {},
    h('div', { class: 'type-grid' }, cards),
    h('h3', { class: 'sep' }, 'Atau impor dari file'),
    h('div', { class: 'import-grid' }, imp), pdfOpt,
    h('p', { class: 'hint' }, 'PowerPoint: judul, teks, gambar, video & catatan pembicara (jadi naskah narasi) ikut terbawa. Ingin tampilan persis sama? Simpan PowerPoint sebagai PDF, lalu impor PDF-nya.')), { wide: true });
}

async function runImport(files) {
  if (!files.length) return;
  const b = busy('Membaca file…');
  try {
    const { slides, notes } = await importFiles(files, { onProgress: (t) => b.set(t), pdfTextAsNarration: pdfAsNarration });
    b.done();
    if (slides.length) {
      if (project.slides.length === 1 && project.slides[0].title === 'Selamat datang' && /Tulis pengantar/.test(project.slides[0].body || '')) project.slides = [];
      if (!project.slides.length) { project.slides.push(...slides); select(slides[0].id, true); ctx.changed({ list: true }); } else insertSlides(slides);
      if (project.title === 'Kursus baru' && files.length === 1) { project.title = files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); }
      toast(`${slides.length} slide ditambahkan.`, 'ok');
    }
    if (notes.length) modal('Catatan impor', h('ul', { class: 'notes' }, notes.map((n) => h('li', {}, n))));
  } catch (e) { b.done(); toast(e.message, 'error'); }
}

// Seret file ke mana saja di Builder.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('dropOverlay').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropOverlay').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('dropOverlay').hidden = true;
  if (e.defaultPrevented && e.target.closest?.('.asset')) return;
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length && !e.target.closest?.('.asset')) runImport(files);
});

// ================================================================ proyek: baru, contoh, ekspor/impor
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function mapAssets(v, fn) {
  if (isAsset(v)) return fn(v);
  if (Array.isArray(v)) return Promise.all(v.map((x) => mapAssets(x, fn)));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await mapAssets(x, fn); return o; }
  return v;
}
async function exportProject() {
  const b = busy('Menyiapkan file proyek…');
  try {
    const copy = await mapAssets(project, async (a) => ({ ...a, data: await blobToDataUrl(a.data) }));
    const blob = new Blob([JSON.stringify({ format: 'studio-scorm-proyek', formatVersion: 2, project: copy })], { type: 'application/json' });
    download(blob, `${(project.title || 'proyek').replace(/[^\w-]+/g, '-').toLowerCase()}.studio-scorm.json`);
  } finally { b.done(); }
}
async function openProjectJson(json) {
  if (json?.format !== 'studio-scorm-proyek' || !json.project?.slides) throw new Error('File ini bukan proyek Studio SCORM.');
  const revive = async (v) => {
    if (v && typeof v === 'object' && typeof v.data === 'string' && v.data.startsWith('data:')) {
      const blob = await (await fetch(v.data)).blob();
      return { ...v, data: blob, type: v.type || blob.type };
    }
    if (Array.isArray(v)) return Promise.all(v.map(revive));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await revive(x); return o; }
    return v;
  };
  const base = blankProject();
  project = migrate({ ...base, ...(await revive(json.project)), id: json.project.id || base.id });
  currentId = project.slides[0]?.id;
  ctx.changed({ list: true }); renderEditor(); schedulePreview(true);
  if (sideTab !== 'lihat') setSideTab(sideTab);
}
async function loadSample() {
  if (project && project.slides.length > 1 && !confirm('Muat contoh kursus "Pengenalan APD"? Proyek sekarang akan diganti (ekspor dulu bila perlu).')) return;
  const b = busy('Memuat contoh…');
  try { await openProjectJson(await (await fetch('contoh-apd.json', { cache: 'no-cache' })).json()); toast('Contoh dimuat — coba tab Lihat!', 'ok'); } catch (e) { toast(`Contoh gagal dimuat: ${e.message}`, 'error'); } finally { b.done(); }
}
function newProject() {
  if (!confirm('Mulai proyek baru? Proyek sekarang akan diganti (ekspor dulu bila perlu).')) return;
  project = blankProject(); currentId = project.slides[0].id;
  ctx.changed({ list: true }); renderEditor(); setSideTab(sideTab); schedulePreview(true);
}
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// ================================================================ build & coba di Player
async function makeZip() {
  const problems = validateProject(project);
  if (problems.length) {
    modal('Masih ada yang perlu dilengkapi', h('div', {}, h('ul', { class: 'notes' }, problems.map((p) => {
      const m = /^Slide (\d+)/.exec(p);
      return h('li', {}, p, m ? h('button', { class: 'link', type: 'button', onclick: (e) => { e.target.closest('.modal-wrap').remove(); select(project.slides[+m[1] - 1].id, true); } }, ' buka') : null);
    }))));
    return null;
  }
  const size = projectSize(project);
  if (size > 250 * 1048576 && !confirm(`Ukuran media ${formatBytes(size)} — paket sebesar ini bisa ditolak LMS dan lambat dibuat di HP. Lanjutkan?`)) return null;
  const b = busy('Menyiapkan paket SCORM…');
  try {
    const template = await loadTemplate();
    return await buildPackage(project, { template, onProgress: (t) => b.set(t) });
  } finally { b.done(); }
}
$('btnBuild').onclick = async () => {
  try {
    const out = await makeZip();
    if (!out) return;
    download(out.data, out.filename);
    modal('Paket SCORM siap', h('div', { class: 'success' },
      h('div', { class: 'success-icon' }, icon('check')),
      h('p', {}, h('b', {}, out.filename), ` (${formatBytes(out.data.size)}) sudah diunduh.`),
      h('ol', { class: 'steps' },
        h('li', {}, 'Moodle: Tambah aktivitas → ', h('b', {}, 'Paket SCORM'), ' → unggah file .zip ini.'),
        h('li', {}, 'LMS lain: cari menu "SCORM package" / "Upload course".'),
        h('li', {}, 'Ingin mengecek dulu? Buka ', h('a', { href: 'player.html' }, 'Player'), ' lalu unggah file yang sama.'))));
  } catch (e) { console.error(e); toast(e.message, 'error'); }
};
$('btnPreviewFull').onclick = async () => {
  const win = window.open('about:blank', '_blank');
  try {
    const out = await makeZip();
    if (!out) { win?.close(); return; }
    await kv.set('pratinjau-zip', out.data);
    if (win) win.location.href = 'player.html#pratinjau'; else location.href = 'player.html#pratinjau';
  } catch (e) { win?.close(); toast(e.message, 'error'); }
};

// ================================================================ tampilan HP
function setView(v) {
  const b = $('builder');
  b.dataset.view = v;
  document.querySelectorAll('.mobile-nav [data-view]').forEach((x) => x.setAttribute('aria-current', String(x.dataset.view === v)));
  if (v === 'lihat' && sideTab !== 'lihat') setSideTab('lihat');
  if (v === 'atur' && sideTab === 'lihat') setSideTab('atur');
  if (v === 'lihat') requestAnimationFrame(fitPreview);
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.mobile-nav [data-view]').forEach((x) => (x.onclick = () => setView(x.dataset.view)));
document.querySelectorAll('.tabs [data-tab]').forEach((x) => (x.onclick = () => setSideTab(x.dataset.tab)));
document.querySelectorAll('input[name="dev"]').forEach((r) => (r.onchange = fitPreview));
$('pvCover').onchange = () => schedulePreview(true);
$('btnAdd').onclick = openAddPicker;
$('btnImport').onclick = () => { fileImport.accept = ACCEPT_ALL; fileImport.click(); };
new ResizeObserver(() => fitPreview()).observe($('pvStage'));

// ================================================================ selamat datang
function welcome() {
  const m = modal('Selamat datang di Studio SCORM', h('div', { class: 'welcome' },
    h('p', {}, 'Buat kursus e-learning interaktif lalu unduh sebagai paket SCORM untuk LMS. Mau mulai dari mana?'),
    h('div', { class: 'welcome-grid' },
      h('button', { class: 'welcome-card', type: 'button', onclick: async () => { m.close(); await loadSample(); } }, icon('book'), h('b', {}, 'Lihat contoh'), h('small', {}, 'Kursus APD lengkap: kartu, cari bahaya, kuis, urutkan')),
      h('button', { class: 'welcome-card', type: 'button', onclick: () => { m.close(); fileImport.accept = '.pptx,.pdf,.docx'; fileImport.click(); setTimeout(() => (fileImport.accept = ACCEPT_ALL), 1000); } }, icon('ppt'), h('b', {}, 'Impor PowerPoint / PDF'), h('small', {}, 'Ubah materi yang sudah ada jadi kursus')),
      h('button', { class: 'welcome-card', type: 'button', onclick: () => m.close() }, icon('plus'), h('b', {}, 'Mulai kosong'), h('small', {}, 'Susun slide sendiri dari awal')))));
}

// ================================================================ mulai
(async function init() {
  fillIcons();
  watchPreviewFrame();
  let stored = await kv.get(KEY).catch(() => null);
  let first = false;
  if (!stored) {
    const old = await kv.get('proyek-aktif').catch(() => null);
    if (old?.slides) stored = migrate(old); else first = true;
  }
  project = stored ? migrate(stored) : blankProject();
  currentId = project.slides[0]?.id;
  renderList(); renderEditor(); setSideTab('lihat'); schedulePreview(true);
  $('saveState').textContent = stored ? 'Tersimpan' : '';
  if (first) welcome();
})();
