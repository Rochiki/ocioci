// ============================================================
// htmlstudio.js — HTML Creator: tempel/unggah HTML, tambah musik latar, efek suara,
// layar sambutan, dll → unduh satu file .html mandiri.
// ============================================================
import { h, icon, toast, formatBytes } from './ui.js';
import { buildHtml, defaultProject, SFX_LIST, TARGETS, EVENTS } from './htmlinject.js';
import { analyze, autofix } from './htmllint.js';
import { musicPicker, loadCatalog, titleOf } from './musiklib.js';
import { kv } from './store.js';

const $ = (id) => document.getElementById(id);
const KEY = 'studio-html:project';
const BASE = new URL('./', location.href).href;
const uid = (p = 'id') => `${p}${Math.random().toString(36).slice(2, 8)}`;
const sfxPlayer = () => (window.StudioSfx ? (sfxPlayer.p ||= window.StudioSfx.player()) : null);

let P = defaultProject();
let pvUrl = '', timer = 0, saveTimer = 0, catalog = null;

document.querySelectorAll('.ic-slot[data-icon]').forEach((el) => el.replaceWith(icon(el.dataset.icon)));

// ---------------------------------------------------------------- contoh halaman
const SAMPLE = `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Kuis APD</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f4f7f2;color:#15212b}
main{max-width:640px;margin:0 auto;padding:32px 20px}
h1{color:#0f3d2e}
.opsi{display:block;width:100%;text-align:left;padding:14px 16px;margin:10px 0;border:2px solid #cfd8cc;border-radius:12px;background:#fff;font:inherit;cursor:pointer}
.opsi:hover{border-color:#00704f}
.benar{background:#dcefe5;border-color:#00704f}
.salah{background:#fbe4e1;border-color:#c4372d}
</style></head>
<body><main>
<h1>Kuis Cepat: APD</h1>
<p>Alat pelindung diri apa yang <b>wajib</b> dipakai saat bekerja di area bising?</p>
<button class="opsi" data-ok="0">Kacamata las</button>
<button class="opsi" data-ok="1">Ear plug / ear muff</button>
<button class="opsi" data-ok="0">Masker kain</button>
<p id="hasil" aria-live="polite"></p>
<script>
document.querySelectorAll('.opsi').forEach(function(b){b.addEventListener('click',function(){
  var ok=b.dataset.ok==='1';b.classList.add(ok?'benar':'salah');
  document.getElementById('hasil').textContent=ok?'Benar! Pelindung telinga mengurangi paparan bising.':'Belum tepat, coba lagi.';
  b.dispatchEvent(new CustomEvent(ok?'jawab-benar':'jawab-salah',{bubbles:true}));
});});
</script>
</main></body></html>`;

// ---------------------------------------------------------------- penyimpanan
const setSaved = (t) => { $('saveState').textContent = t; };
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await kv.set(KEY, P); setSaved('Tersimpan'); } catch { setSaved('Gagal menyimpan otomatis'); }
  }, 600);
  setSaved('Menyimpan…');
}
function changed({ now = false } = {}) {
  persist();
  clearTimeout(timer);
  timer = setTimeout(refresh, now ? 0 : 600);
}
const normalize = (o) => {
  const d = defaultProject();
  return { ...d, ...o, intro: { ...d.intro, ...o.intro }, bgm: { ...d.bgm, ...o.bgm }, mute: { ...d.mute, ...o.mute }, fs: { ...d.fs, ...o.fs }, rules: o.rules || [], assets: o.assets || [] };
};

// ---------------------------------------------------------------- pratinjau
function refresh() {
  const html = buildHtml(P, { preview: true, libBase: BASE });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  runErrors.length = 0; panelCode.lint?.();
  const old = pvUrl; pvUrl = url; $('pv').src = url;
  if (old) setTimeout(() => URL.revokeObjectURL(old), 4000);
  const bytes = new Blob([html]).size + (P.bgm.mode === 'lib' && catalog ? (catalog.lagu.find((l) => l.file === P.bgm.lib)?.kb || 0) * 1365 : 0);
  $('sizeInfo').textContent = `Perkiraan file akhir: ${formatBytes(bytes)}`;
}
$('btnReload').onclick = refresh;
document.querySelectorAll('input[name=dev]').forEach((r) => r.addEventListener('change', () => { $('frameWrap').classList.toggle('hp', r.value === 'hp' && r.checked); }));
document.querySelectorAll('.hc-tabs button').forEach((b) => b.addEventListener('click', () => {
  $('hc').dataset.view = b.dataset.v;
  document.querySelectorAll('.hc-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.v === 'lihat') refresh();
}));

const runErrors = [];
window.addEventListener('message', (e) => {
  if (e.source !== $('pv').contentWindow || e.data?.type !== 'sh-error') return;
  if (!runErrors.includes(e.data.msg) && runErrors.length < 8) { runErrors.push(e.data.msg); panelCode.lint?.(); }
});
let pickCb = null;
window.addEventListener('message', (e) => {
  if (e.source !== $('pv').contentWindow || e.data?.type !== 'sh-picked') return;
  const cb = pickCb; pickCb = null; $('hc').dataset.view = $('hc').dataset.prevView || 'edit';
  if (cb && e.data.sel) cb(e.data.sel);
});
function startPick(cb) {
  pickCb = cb; $('hc').dataset.prevView = $('hc').dataset.view; $('hc').dataset.view = 'lihat';
  toast('Ketuk elemen yang diinginkan di pratinjau (Esc untuk batal).', 'info');
  setTimeout(() => $('pv').contentWindow?.postMessage({ type: 'sh-pick' }, '*'), 80);
}

// ---------------------------------------------------------------- pembantu UI
const card = (title, ic, ...body) => h('section', { class: 'editor-card' }, h('h3', { class: 'card-h' }, icon(ic), title), ...body);
const sw = (obj, key, label, hint, after) => {
  const inp = h('input', { type: 'checkbox', checked: !!obj[key], onchange: () => { obj[key] = inp.checked; changed(); after?.(); } });
  return h('label', { class: 'switch' }, inp, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, label), hint ? h('small', {}, hint) : null));
};
const fld = (label, control, hint) => { const id = uid('f'); control.id = id; return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('div', { class: 'hint' }, hint) : null); };
const inp = (obj, key, ph = '', type = 'text') => h('input', { type, value: obj[key] ?? '', placeholder: ph, oninput: (e) => { obj[key] = e.target.value; changed(); } });
const sel = (obj, key, opts, after) => h('select', { onchange: (e) => { obj[key] = e.target.value; changed(); after?.(); } }, opts.map(([v, l]) => h('option', { value: v, selected: (obj[key] ?? '') === v }, l)));
const range = (obj, key, min, max, step, fmt) => {
  const out = h('span', { class: 'rng-val' }, fmt(obj[key]));
  return h('div', { class: 'rng' }, h('input', { type: 'range', min, max, step, value: obj[key], oninput: (e) => { obj[key] = +e.target.value; out.textContent = fmt(+e.target.value); changed(); } }), out);
};
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const POS = [['kanan-bawah', 'Kanan bawah'], ['kiri-bawah', 'Kiri bawah'], ['kanan-atas', 'Kanan atas'], ['kiri-atas', 'Kiri atas']];

// ---------------------------------------------------------------- panel 1: kode
function panelCode() {
  const ta = h('textarea', { class: 'code', rows: 14, spellcheck: false, placeholder: 'Tempel kode HTML di sini — halaman lengkap (<html>…) atau potongan saja.', oninput: () => { P.src = ta.value; changed(); } });
  ta.value = P.src;
  const file = h('input', { type: 'file', accept: '.html,.htm,text/html', hidden: true, onchange: async () => { if (file.files[0]) { await loadHtmlFile(file.files[0]); file.value = ''; } } });
  const set = (v) => { P.src = v; ta.value = v; changed({ now: true }); panelCode.lint?.(); };
  panelCode.set = set;
  let undo = null, lt = 0;
  const box = h('div', { class: 'lint-box' });
  const lint = () => {
    const issues = analyze(P.src).issues;
    const fixable = issues.some((i) => i.fix);
    const rows = [
      ...issues.map((i) => h('li', { class: `lint-${i.level}` }, h('span', { class: 'lint-ic', 'aria-hidden': 'true' }, i.level === 'error' ? '✖' : '⚠'), h('span', {}, ...[i.line ? h('b', {}, `Baris ${i.line}: `) : '', i.msg, i.fix ? h('em', {}, ' · bisa diperbaiki otomatis') : '']))),
      ...runErrors.map((m) => h('li', { class: 'lint-error' }, h('span', { class: 'lint-ic', 'aria-hidden': 'true' }, '✖'), h('span', {}, h('b', {}, 'Error saat dijalankan: '), m))),
    ];
    const total = issues.length + runErrors.length;
    box.replaceChildren(
      h('div', { class: 'row gap wrap' },
        h('b', { class: total ? 'lint-bad' : 'lint-good' }, P.src.trim() ? (total ? `${total} masalah ditemukan` : '✓ Kode terlihat baik') : 'Pemeriksa kode'),
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', disabled: !fixable, onclick: () => {
          const r = autofix(P.src); if (!r.applied.length) return toast('Tidak ada yang bisa diperbaiki otomatis.', 'info');
          undo = P.src; set(r.src); toast(`Diperbaiki: ${r.applied.join('; ')}.`, 'ok'); lint();
        } }, icon('sparkle'), 'Perbaiki otomatis'),
        ...(undo != null ? [h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { const u = undo; undo = null; set(u); lint(); } }, 'Urungkan')] : [])),
      ...(rows.length ? [h('ul', { class: 'lint-list' }, rows)] : []));
  };
  panelCode.lint = () => { clearTimeout(lt); lt = setTimeout(lint, Math.min(1200, 250 + (P.src || '').length / 500)); };
  ta.addEventListener('input', () => { undo = null; panelCode.lint(); });
  lint();
  return card('1 · Kode HTML', 'html',
    ta, box,
    h('div', { class: 'row gap', style: { marginTop: '10px' } },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => file.click() }, icon('upload'), 'Unggah file .html'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => set(SAMPLE) }, icon('sparkle'), 'Isi dengan contoh'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { if (!P.src || confirm('Kosongkan kode HTML?')) set(''); } }, icon('trash'), 'Kosongkan'), file),
    h('p', { class: 'hint' }, 'Tips: bisa juga menyeret file .html ke halaman ini. Gambar/CSS yang dipanggil lewat alamat web (https://…) tetap bekerja; untuk satu file mandiri, pakai data:URL atau sematkan langsung.'));
}
async function loadHtmlFile(f) {
  if (!/\.html?$/i.test(f.name) && !/text\/html/.test(f.type)) return toast('Pilih file .html', 'error');
  panelCode.set(await f.text());
  if (!P.title) { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(P.src); if (m) { P.title = m[1].trim(); render(); } }
  toast(`${f.name} dimuat.`, 'ok');
}

// ---------------------------------------------------------------- panel 2: halaman
function panelPage() {
  const intro = P.intro;
  const colors = h('div', { class: 'row gap' },
    h('label', { class: 'row', style: { gap: '6px' } }, 'Warna 1', h('input', { type: 'color', class: 'swatch', value: intro.bg1, oninput: (e) => { intro.bg1 = e.target.value; changed(); } })),
    h('label', { class: 'row', style: { gap: '6px' } }, 'Warna 2', h('input', { type: 'color', class: 'swatch', value: intro.bg2, oninput: (e) => { intro.bg2 = e.target.value; changed(); } })),
    h('label', { class: 'row', style: { gap: '6px' } }, 'Teks', h('input', { type: 'color', class: 'swatch', value: intro.color, oninput: (e) => { intro.color = e.target.value; changed(); } })));
  return card('2 · Tampilan & layar sambutan', 'palette',
    h('div', { class: 'grid-fields' }, fld('Judul tab browser', inp(P, 'title', 'Contoh: Pelatihan APD')), fld('Ikon tab (emoji)', inp(P, 'favicon', '🦺'))),
    sw(intro, 'on', 'Layar sambutan dengan tombol Mulai', 'Peserta mengetuk "Mulai" dulu — sekaligus membuat musik & suara bisa langsung berbunyi (browser melarang suara otomatis tanpa ketukan).', render),
    intro.on ? h('div', { class: 'stack' },
      h('div', { class: 'grid-fields' }, fld('Judul', inp(intro, 'title')), fld('Teks bawah judul', inp(intro, 'sub')), fld('Teks tombol', inp(intro, 'btn'))),
      colors) : null,
    h('div', { class: 'grid-fields' },
      h('div', {}, sw(P.mute, 'on', 'Tombol bisu 🔊 melayang', 'Peserta bisa mematikan musik/efek'), P.mute.on ? fld('Posisi', sel(P.mute, 'pos', POS)) : null),
      h('div', {}, sw(P.fs, 'on', 'Tombol layar penuh ⛶'), P.fs.on ? fld('Posisi', sel(P.fs, 'pos', POS)) : null)),
    sw(P, 'noRight', 'Nonaktifkan klik kanan'), sw(P, 'noSelect', 'Cegah pemilihan/salin teks', 'Kolom isian tetap bisa diketik.'));
}

// ---------------------------------------------------------------- panel 3: musik latar
let picker = null;
function panelMusic() {
  const b = P.bgm;
  const modes = [['none', 'Tanpa musik'], ['lib', 'Pustaka (68 lagu)'], ['upload', 'Unggah MP3 sendiri'], ['ambient', 'Nada ambient (tanpa file)']];
  const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Sumber musik' }, modes.map(([v, l]) =>
    h('label', {}, h('input', { type: 'radio', name: 'bgm', value: v, checked: b.mode === v, onchange: () => { b.mode = v; changed(); render(); } }), h('span', {}, l))));
  let body = null;
  if (b.mode === 'lib') {
    picker?.stopPreview?.();
    picker = musicPicker({ value: b.lib, base: BASE, onPick: (f) => { b.lib = f; changed(); curr.textContent = titleOf(catalog, f); } });
    const curr = h('b', {}, b.lib ? titleOf(catalog, b.lib) : '— belum dipilih —');
    body = h('div', { class: 'stack' }, h('div', {}, 'Lagu dipilih: ', curr), picker);
  } else if (b.mode === 'upload') {
    const a = P.assets.find((x) => x.id === b.asset);
    const f = h('input', { type: 'file', accept: 'audio/*,.mp3,.ogg,.wav,.m4a', hidden: true, onchange: async () => {
      const file = f.files[0]; if (!file) return;
      if (file.size > 15 * 1024 * 1024 && !confirm('File besar (>15 MB) akan membuat HTML sangat berat. Lanjutkan?')) return;
      const id = uid('a'); P.assets.push({ id, name: file.name, data: await readFile(file) }); b.asset = id; changed(); render();
    } });
    body = h('div', { class: 'stack' }, h('div', { class: 'row gap' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => f.click() }, icon('upload'), a ? 'Ganti file' : 'Pilih file audio'), a ? h('b', {}, a.name) : h('span', { class: 'muted' }, 'Belum ada file'), f),
      a ? h('audio', { controls: true, src: a.data, style: { width: '100%' } }) : null);
  } else if (b.mode === 'ambient') body = h('p', { class: 'hint' }, 'Alunan pad lembut yang dibuat langsung oleh browser — nol ukuran file, cocok untuk latar santai.');
  return card('3 · Musik latar (BGM)', 'sound', seg, body,
    b.mode !== 'none' ? h('div', { class: 'grid-fields', style: { marginTop: '12px' } },
      fld('Volume', range(b, 'vol', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)),
      fld('Fade-in (detik)', range(b, 'fade', 0, 8, 0.5, (v) => `${v} dtk`))) : null,
    b.mode !== 'none' ? h('p', { class: 'hint' }, 'Musik diulang terus (loop), mulai saat peserta mengetuk layar pertama kali / tombol Mulai, dan berhenti sementara saat tab disembunyikan.') : null);
}

// ---------------------------------------------------------------- panel 4: efek & interaksi
const PRESETS = [
  ['Bunyi klik di semua tombol', { on: 'click', target: 'tombol', action: 'sfx', sfx: 'klik' }],
  ['Pop saat kursor di tautan', { on: 'hover', target: 'tautan', action: 'sfx', sfx: 'pop' }],
  ['Whoosh saat gambar muncul', { on: 'visible', target: 'gambar', action: 'sfx', sfx: 'whoosh' }],
  ['Bacakan judul saat muncul', { on: 'visible', target: 'judul', action: 'speak' }],
  ['Fanfare saat halaman dimulai', { on: 'load', target: 'halaman', action: 'sfx', sfx: 'tada' }],
];
function sfxOptions() {
  return [...SFX_LIST.map(([v, l]) => [v, `🔊 ${l}`]), ...P.assets.filter((a) => a.id !== P.bgm.asset).map((a) => [`file:${a.id}`, `📁 ${a.name}`])];
}
function panelRules() {
  const list = h('div', {});
  P.rules.forEach((r, i) => {
    const custom = r.target === 'custom';
    const testBtn = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
      if (r.action === 'speak') { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(r.text || 'Contoh bacaan'); u.lang = 'id-ID'; u.rate = r.rate || 1; speechSynthesis.speak(u); }
      else if (r.sfx?.startsWith('file:')) { const a = P.assets.find((x) => x.id === r.sfx.slice(5)); if (a) { const au = new Audio(a.data); au.volume = r.vol; au.play(); } }
      else sfxPlayer()?.play(r.sfx, r.vol);
    } }, icon('play'), 'Coba');
    list.append(h('div', { class: 'rule' },
      h('div', { class: 'rule-head' }, h('b', {}, `Aturan ${i + 1}`), testBtn,
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Hapus aturan', onclick: () => { P.rules.splice(i, 1); changed(); render(); } }, icon('trash'))),
      h('div', { class: 'grid-fields' },
        fld('Kapan', sel(r, 'on', EVENTS)),
        fld('Pada', sel(r, 'target', Object.entries(TARGETS).map(([k, v]) => [k, v[0]]), render)),
        fld('Lakukan', sel(r, 'action', [['sfx', 'Putar efek suara'], ['speak', 'Bacakan teks (suara perangkat)']], render))),
      custom ? fld('Selector CSS', h('div', { class: 'row gap' }, h('input', { type: 'text', style: { flex: 1 }, value: r.custom || '', placeholder: '.opsi, #tombol-mulai', oninput: (e) => { r.custom = e.target.value; changed(); } }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => startPick((s) => { r.custom = s; changed({ now: true }); render(); }) }, icon('hotspot'), 'Pilih dari pratinjau')), 'Contoh: .opsi (semua elemen berkelas "opsi") atau #id.') : null,
      r.action === 'speak'
        ? h('div', { class: 'grid-fields' }, fld('Teks yang dibaca (kosong = baca teks elemennya)', inp(r, 'text', 'Selamat datang…')), fld('Kecepatan baca', range(r, 'rate', 0.6, 1.6, 0.1, (v) => `${v}×`)))
        : h('div', { class: 'grid-fields' }, fld('Efek', sel(r, 'sfx', sfxOptions())), fld('Volume', range(r, 'vol', 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`)))));
  });
  const fileSfx = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true, onchange: async () => {
    for (const f of fileSfx.files) { if (f.size > 4 * 1024 * 1024) { toast(`${f.name} terlalu besar untuk efek (maks 4 MB).`, 'error'); continue; } P.assets.push({ id: uid('a'), name: f.name, data: await readFile(f) }); }
    fileSfx.value = ''; changed(); render();
  } });
  const mine = P.assets.filter((a) => a.id !== P.bgm.asset);
  return card('4 · Efek suara & interaksi', 'sparkle',
    h('p', { class: 'hint' }, 'Atur "kapan → pada apa → lakukan apa". 10 efek bawaan tanpa file, atau pakai file MP3/WAV sendiri.'),
    h('div', { class: 'chip-row', style: { marginBottom: '12px' } }, PRESETS.map(([l, r]) => h('button', { class: 'pick-chip add', type: 'button', onclick: () => { P.rules.push({ id: uid('r'), vol: 0.8, rate: 1, custom: '', text: '', ...r }); changed(); render(); } }, icon('plus'), l))),
    list.children.length ? list : h('p', { class: 'muted' }, 'Belum ada aturan. Pilih salah satu contoh di atas, atau tambah sendiri.'),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { P.rules.push({ id: uid('r'), on: 'click', target: 'tombol', action: 'sfx', sfx: 'klik', vol: 0.8, rate: 1, custom: '', text: '' }); changed(); render(); } }, icon('plus'), 'Tambah aturan'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => fileSfx.click() }, icon('upload'), 'Unggah efek suara saya'), fileSfx),
    mine.length ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'field-label' }, 'Efek suara saya'), mine.map((a) => h('div', { class: 'asset-row' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Putar ${a.name}`, onclick: () => new Audio(a.data).play() }, icon('play')),
      h('span', { class: 'grow' }, a.name),
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': `Hapus ${a.name}`, onclick: () => { P.assets = P.assets.filter((x) => x !== a); P.rules.forEach((r) => { if (r.sfx === `file:${a.id}`) r.sfx = 'klik'; }); changed(); render(); } }, icon('trash'))))) : null,
    h('p', { class: 'hint' }, 'Dari kode sendiri, efek bisa dipicu lewat JS kustom: ', h('code', {}, 'new Audio(...)'), ' — atau ketik peristiwa kustom lalu atur aturan pada elemen yang sama.'));
}

// ---------------------------------------------------------------- panel 5: lanjutan
function panelAdvanced() {
  const ta = (key, ph) => { const t = h('textarea', { class: 'code', rows: 6, spellcheck: false, placeholder: ph, oninput: () => { P[key] = t.value; changed(); } }); t.value = P[key] || ''; return t; };
  return card('5 · Lanjutan: CSS & JavaScript tambahan', 'edit',
    fld('CSS tambahan', ta('css', 'body { font-size: 18px; }'), 'Ditambahkan di akhir <head>, mengalahkan CSS bawaan halaman.'),
    fld('JavaScript tambahan', ta('js', "document.title += ' ✔';"), 'Dijalankan di akhir <body>, setelah semua elemen siap.'),
    sw(P, 'viewport', 'Tambahkan meta viewport bila belum ada', 'Agar tampil pas di HP.'));
}

function render() {
  const keepScroll = $('panels').scrollTop;
  picker?.stopPreview?.();
  $('panels').replaceChildren(panelCode(), panelPage(), panelMusic(), panelRules(), panelAdvanced());
  $('panels').scrollTop = keepScroll;
}

// ---------------------------------------------------------------- ekspor
const dlName = () => `${(P.title || 'halaman').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'halaman'}.html`;
const toDataUrl = (blob) => readFile(blob);
async function exportHtml() {
  try {
    let libData = null;
    if (P.bgm.mode === 'lib' && P.bgm.lib) {
      const res = await fetch(BASE + P.bgm.lib); if (!res.ok) throw new Error(`Lagu ${P.bgm.lib} tidak ditemukan di repo (${res.status}).`);
      libData = { [BASE + P.bgm.lib]: await toDataUrl(await res.blob()) };
    }
    const html = buildHtml(P, { libBase: BASE, libData });
    const blob = new Blob([html], { type: 'text/html' });
    const a = h('a', { href: URL.createObjectURL(blob), download: dlName() }); document.body.append(a); a.click(); a.remove();
    toast(`Diunduh (${formatBytes(blob.size)}) — satu file, bisa dibuka di mana saja.`, 'ok');
  } catch (e) { toast(e.message, 'error'); }
}
$('btnExport').onclick = exportHtml;
$('btnSave').onclick = () => {
  const blob = new Blob([JSON.stringify(P)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${dlName().replace(/\.html$/, '')}.htmlproject.json` }); document.body.append(a); a.click(); a.remove();
};
$('btnOpen').onclick = () => $('fileProject').click();
$('fileProject').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { P = normalize(JSON.parse(await f.text())); render(); changed({ now: true }); toast('Proyek dibuka.', 'ok'); } catch { toast('File proyek tidak valid.', 'error'); }
  e.target.value = '';
};
// seret & lepas file .html
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); document.body.classList.add('drop-over'); } }));
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { if (ev === 'dragleave' && e.relatedTarget) return; document.body.classList.remove('drop-over'); }));
document.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); loadHtmlFile(f); } });

// ---------------------------------------------------------------- mulai
(async () => {
  try { const saved = await kv.get(KEY); if (saved) P = normalize(saved); } catch { /* abaikan */ }
  try { catalog = await loadCatalog(BASE); } catch { /* pustaka opsional */ }
  render(); refresh(); setSaved('');
})();
