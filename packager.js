// ============================================================
// packager.js — MERAKIT paket .zip SCORM dari proyek Builder
//
// Isi paket yang dihasilkan (folder di DALAM zip dibuat otomatis):
//   imsmanifest.xml        daftar isi untuk LMS
//   index.html             halaman yang dibuka LMS (dari paket-index.html)
//   assets/course.js       mesin kursus · assets/course.css · assets/scorm-api.js · assets/karakter.js · assets/lipsync.js
//   assets/course-data.js  isi kursus Anda
//   media/...              gambar, GIF, video, audio narasi
//   html-01/...            slide HTML (file, kode, atau mini-website .zip)
// ============================================================
import { buildManifest } from './manifest.js';
import { escapeXml, slugify, normalizeZipPath } from './util.js';

export const TEMPLATE_FILES = ['paket-index.html', 'course.css', 'scorm-api.js', 'course.js', 'karakter.js', 'lipsync.js'];
export const POSES = ['auto', 'diam', 'tunjuk', 'lambai', 'jempol', 'pikir', 'serius', 'sembunyi'];
/** Karakter ilustrasi (gambar): nama berkas yang ikut masuk paket bila dipilih. */
export const FOTO_CHARS = ['safee', 'safri', 'helen', 'vira', 'shendi', 'romi'];
export const fotoFiles = (id) => ['diam', 'tunjuk', 'lambai', 'jempol', 'pikir', 'serius'].flatMap((p) => [0, 1, 2].map((m) => `${id}-${p}-${m}.webp`));
export const BUTTON_ACTIONS = ['start', 'next', 'prev', 'pause', 'replay', 'goto', 'link', 'info', 'finish'];
export const TEXT_SIZES = ['auto', 'normal', 'besar', 'sangat'];
export const SLIDE_TYPES = ['content', 'image', 'video', 'html', 'flip', 'hotspot', 'quiz', 'sort'];

/** Ambil file template dari root aplikasi (di browser). */
export async function loadTemplate(base = './') {
  const out = {};
  for (const name of TEMPLATE_FILES) {
    const res = await fetch(base + name, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`File ${name} tidak ditemukan di repo (${res.status}). Pastikan semua file sudah diunggah.`);
    out[name] = await res.text();
  }
  // Berkas biner karakter ilustrasi diambil hanya bila dipakai.
  Object.defineProperty(out, '__bin', { enumerable: false, value: async (name) => {
    const res = await fetch(base + name, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`File karakter ${name} tidak ditemukan di repo (${res.status}). Unggah semua file karakter (*.webp).`);
    return new Uint8Array(await res.arrayBuffer());
  } });
  return out;
}

/** Apakah nilai ini file media (gambar/video/audio/zip)? */
export function isAsset(v) {
  if (!v || typeof v !== 'object' || !('data' in v)) return false;
  const d = v.data;
  return (typeof Blob !== 'undefined' && d instanceof Blob) || d instanceof Uint8Array || d instanceof ArrayBuffer;
}
const sizeOf = (a) => a.data.size ?? a.data.byteLength ?? 0;

/** Total ukuran semua media dalam proyek (byte). */
export function projectSize(p) {
  let total = 0;
  const walk = (v) => {
    if (isAsset(v)) { total += sizeOf(v); return; }
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(p);
  return total;
}

const filled = (arr) => (arr || []).filter((x) => String(x ?? '').trim());

/** Cek kelengkapan proyek. Mengembalikan daftar masalah (kosong = siap build). */
export function validateProject(p) {
  const problems = [];
  if (!p.title?.trim()) problems.push('Judul kursus masih kosong.');
  if (!p.slides?.length) problems.push('Belum ada slide.');
  p.slides?.forEach((s, i) => {
    const at = `Slide ${i + 1}${s.title ? ` "${s.title}"` : ''}`;
    if (!s.title?.trim()) problems.push(`${at}: judul kosong.`);
    switch (s.type) {
      case 'image': if (!isAsset(s.image)) problems.push(`${at}: belum ada gambar.`); break;
      case 'video': if (s.source === 'url' ? !s.url?.trim() : !isAsset(s.video)) problems.push(`${at}: belum ada video (unggah file atau tempel link).`); break;
      case 'html': if (s.source === 'zip' ? !isAsset(s.zip) : !s.html?.trim()) problems.push(`${at}: konten HTML kosong.`); break;
      case 'flip': if (!(s.cards || []).some((c) => c.front?.trim() && c.back?.trim())) problems.push(`${at}: isi minimal 1 kartu (depan & belakang).`); break;
      case 'hotspot':
        if (!isAsset(s.image)) problems.push(`${at}: belum ada gambar.`);
        if (!(s.points || []).length) problems.push(`${at}: ketuk gambar untuk menambah minimal 1 titik.`);
        break;
      case 'quiz':
        if (!s.questions?.length) problems.push(`${at}: belum ada soal.`);
        s.questions?.forEach((q, qi) => {
          const where = `${at}, soal ${qi + 1}`;
          if (!q.text?.trim()) problems.push(`${where}: pertanyaan kosong.`);
          if (q.type === 'tf') { if (!(q.correct?.length === 1)) problems.push(`${where}: pilih Benar atau Salah sebagai kunci.`); return; }
          if (filled(q.options).length < 2) problems.push(`${where}: minimal 2 pilihan jawaban.`);
          const keys = (q.correct || []).filter((k) => q.options[k]?.trim());
          if (!keys.length) problems.push(`${where}: tandai kunci jawaban yang benar.`);
          if (q.type !== 'multi' && keys.length > 1) problems.push(`${where}: soal satu jawaban hanya boleh 1 kunci.`);
        });
        break;
      case 'sort': if (filled(s.items).length < 2) problems.push(`${at}: isi minimal 2 langkah.`); break;
      default: break;
    }
  });
  return problems;
}

const extOf = (name = '', mime = '') => {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName;
  return {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  }[(mime || '').split(';')[0]] || 'bin';
};

/** Bersihkan tombol aksi slide: hanya aksi dikenal, tautan http(s)/mailto/tel, tujuan lompat harus ada. */
export function cleanButtons(list, slides = []) {
  const idOf = (x) => String(x.id).replace(/[^A-Za-z0-9_-]/g, '_');
  const out = [];
  for (const b of Array.isArray(list) ? list : []) {
    if (!b || !BUTTON_ACTIONS.includes(b.action) || out.length >= 6) continue;
    const o = { action: b.action, label: String(b.label || '').trim().slice(0, 40) };
    if (b.action === 'goto') {
      const t = slides.find((x) => String(x.id) === String(b.target));
      if (!t) continue;
      o.target = idOf(t);
    }
    if (b.action === 'link') {
      const u = String(b.url || '').trim();
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(u)) continue;
      o.url = u;
    }
    if (b.action === 'info') { o.title = String(b.title || '').trim().slice(0, 80); o.text = String(b.text || '').slice(0, 2000); if (!o.text && !o.title) continue; }
    out.push(o);
  }
  return out;
}

/**
 * Ubah proyek Builder menjadi data kursus (COURSE_DATA).
 * @param {object} project
 * @param {(asset:object, hint:string)=>string|Promise<string>} putAsset  mengembalikan URL/path untuk sebuah media
 * @param {(slide:object, index:number)=>Promise<object>} putHtml  mengembalikan {src}|{srcdoc}|{placeholder} untuk slide HTML
 */
export async function toCourseData(project, putAsset, putHtml) {
  const hasGraded = project.slides.some((s) => (s.type === 'quiz' && s.questions?.length) || (s.type === 'sort' && filled(s.items).length > 1));
  const a = async (v, hint) => (isAsset(v) ? putAsset(v, hint) : null);
  const slides = [];
  for (const [i, s] of project.slides.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const base = { id: String(s.id).replace(/[^A-Za-z0-9_-]/g, '_'), type: s.type, title: (s.title || '').trim(), narration: s.narration || '' };
    if (TEXT_SIZES.includes(s.textSize)) base.textSize = s.textSize;
    if (+s.textMin > 1) base.textMin = Math.min(1.8, +s.textMin);
    if (POSES.includes(s.pose) && s.pose !== 'auto') base.pose = s.pose;
    if (s.who === 'none' || (typeof s.who === 'string' && /^[a-z]{3,12}$/.test(s.who) && s.who !== 'sendiri')) base.who = s.who;
    const btns = cleanButtons(s.buttons, project.slides);
    if (btns.length) base.buttons = btns;
    base.audio = await a(s.audio, `narasi-${n}`);
    if (base.audio && typeof s.lip === 'string' && /^[012]+$/.test(s.lip) && s.lip.length < 20000) base.lip = s.lip;
    let o;
    switch (s.type) {
      case 'image': o = { image: await a(s.image, `gambar-${n}`), imageAlt: s.imageAlt || '', caption: s.caption || '', fit: s.fit || 'contain' }; break;
      case 'video': o = s.source === 'url' ? { url: (s.url || '').trim() } : { video: await a(s.video, `video-${n}`) };
        Object.assign(o, { caption: s.caption || '', mustWatch: !!s.mustWatch && s.source !== 'url' }); break;
      case 'html': o = { height: +s.height || 560, hideTitle: !!s.hideTitle, caption: s.caption || '', ...(await putHtml(s, i)) }; break;
      case 'flip': {
        const cards = [];
        for (const [k, c] of (s.cards || []).entries()) {
          if (!c.front?.trim() && !c.back?.trim()) continue;
          cards.push({ front: c.front || '', back: c.back || '', image: await a(c.image, `kartu-${n}-${k + 1}`) });
        }
        o = { intro: s.intro || '', requireAll: !!s.requireAll, cards };
        break;
      }
      case 'hotspot': o = {
        intro: s.intro || '', image: await a(s.image, `hotspot-${n}`), imageAlt: s.imageAlt || '', mode: s.mode === 'cari' ? 'cari' : 'jelajah',
        requireAll: !!s.requireAll, radius: +s.radius || 9,
        points: (s.points || []).map((p) => ({ x: Math.round(+p.x * 10) / 10, y: Math.round(+p.y * 10) / 10, title: p.title || '', text: p.text || '' })),
      }; break;
      case 'quiz': o = {
        intro: s.intro || '', shuffle: !!s.shuffle,
        questions: (s.questions || []).map((q, qi) => {
          const id = `${base.id}_q${qi + 1}`;
          if (q.type === 'tf') return { id, type: 'tf', text: q.text.trim(), options: ['Benar', 'Salah'], correct: [q.correct?.[0] === 1 ? 1 : 0], feedback: q.feedback || '' };
          const kept = q.options.map((t, oi) => ({ t: String(t || '').trim(), oi })).filter((x) => x.t);
          const correct = kept.map((x, k) => ((q.correct || []).includes(x.oi) ? k : -1)).filter((k) => k > -1);
          return { id, type: q.type === 'multi' ? 'multi' : 'single', text: q.text.trim(), options: kept.map((x) => x.t), correct: q.type === 'multi' ? correct : correct.slice(0, 1), feedback: q.feedback || '' };
        }),
      }; break;
      case 'sort': o = { intro: s.intro || '', items: filled(s.items).map((t) => t.trim()), feedback: s.feedback || '' }; break;
      default: o = { body: s.body || '', image: await a(s.image, `gambar-${n}`), imageAlt: s.imageAlt || '', layout: s.layout || 'atas' }; base.type = 'content';
    }
    if (s.full && ['image', 'video', 'html'].includes(s.type)) base.full = true;
    slides.push({ ...base, ...o });
  }
  const t = project.theme || {};
  const pr = project.presenter || {};
  const presenter = pr.on ? {
    on: true, who: pr.who || 'raka', name: pr.who === 'sendiri' ? (pr.name || '') : '', pos: pr.pos === 'kiri' ? 'kiri' : 'kanan', size: ['kecil', 'besar'].includes(pr.size) ? pr.size : 'sedang',
    img: pr.who === 'sendiri' ? await a(pr.img, 'karakter') : null,
    imgOpen: pr.who === 'sendiri' ? await a(pr.imgOpen, 'karakter-bicara') : null,
  } : { on: false, pos: pr.pos === 'kiri' ? 'kiri' : 'kanan', size: ['kecil', 'besar'].includes(pr.size) ? pr.size : 'sedang' };
  if (presenter.on && pr.who === 'sendiri' && !presenter.img) presenter.on = false;
  return {
    title: (project.title || '').trim(),
    description: project.description || '',
    version: project.version === '2004' ? '2004' : '1.2',
    passingScore: hasGraded ? Number(project.passingScore ?? 80) : null,
    navigation: project.navigation === 'berurutan' ? 'berurutan' : 'bebas',
    certificate: !!project.certificate,
    certificateIssuer: project.certificateIssuer || '',
    theme: { accent: t.accent, accent2: t.accent2, onAccent: t.onAccent, bg: t.bg, surface: t.surface, ink: t.ink, muted: t.muted, line: t.line, font: t.font || 'modern', transition: t.transition || 'geser' },
    logo: await a(project.logo, 'logo'),
    cover: await a(project.cover, 'sampul'),
    narration: {
      browser: project.narration?.browser !== false, autoplay: !!project.narration?.autoplay,
      voiceName: project.narration?.voiceName || '', rate: +project.narration?.rate || 1,
    },
    textSize: TEXT_SIZES.includes(project.textSize) ? project.textSize : 'auto',
    presenter,
    slides,
    builtWith: 'Studio SCORM',
    builtAt: new Date().toISOString(),
  };
}

/** Bungkus kode HTML potongan (mis. embed iframe) menjadi halaman utuh. */
export function wrapHtml(code, title = '') {
  if (/<html[\s>]/i.test(code) || /<!doctype/i.test(code)) return code;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeXml(title)}</title>
<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif}body>iframe:only-child{width:100%;height:100%;border:0;display:block}</style></head><body>
${code}
</body></html>`;
}

/** Cari halaman pembuka di dalam zip mini-website. */
export function findZipEntry(paths) {
  const htmls = paths.filter((p) => /\.html?$/i.test(p)).sort((x, y) => x.split('/').length - y.split('/').length || x.localeCompare(y));
  return htmls.find((p) => /(^|\/)index\.html?$/i.test(p)) || htmls[0] || null;
}

/**
 * Rakit paket SCORM.
 * @returns {Promise<{data:any, filename:string, files:string[]}>}
 */
export async function buildPackage(project, { template, JSZip = globalThis.JSZip, type = 'blob', onProgress = () => {} } = {}) {
  const problems = validateProject(project);
  if (problems.length) throw Object.assign(new Error(problems.join('\n')), { problems });
  const zip = new JSZip();
  let mediaCount = 0;
  const used = new Set();

  const putAsset = (asset, hint) => {
    const ext = extOf(asset.name, asset.type || asset.data?.type);
    let path = `media/${slugify(hint, 'media')}.${ext}`;
    while (used.has(path)) path = `media/${slugify(hint, 'media')}-${++mediaCount}.${ext}`;
    used.add(path);
    zip.file(path, asset.data, { compression: 'STORE' }); // media sudah terkompres; STORE jauh lebih cepat di HP
    return path;
  };
  const putHtml = async (s, i) => {
    const dir = `html-${String(i + 1).padStart(2, '0')}`;
    if (s.source === 'zip') {
      const inner = await JSZip.loadAsync(s.zip.data);
      const paths = [];
      for (const f of Object.values(inner.files)) {
        if (f.dir || /(^|\/)(__MACOSX|\.DS_Store)/.test(f.name)) continue;
        const p = normalizeZipPath(f.name);
        if (!p) continue;
        zip.file(`${dir}/${p}`, await f.async('uint8array'));
        paths.push(p);
      }
      const entry = findZipEntry(paths);
      if (!entry) throw new Error(`Slide ${i + 1}: file .zip tidak berisi halaman .html.`);
      return { src: `${dir}/${entry.split('/').map(encodeURIComponent).join('/')}` };
    }
    zip.file(`${dir}/index.html`, wrapHtml(s.html, s.title));
    return { src: `${dir}/index.html` };
  };

  onProgress('Menyusun isi kursus…');
  const data = await toCourseData(project, putAsset, putHtml);
  zip.file('assets/course-data.js', `/* Dibuat oleh Studio SCORM — isi kursus */\nwindow.COURSE_DATA = ${JSON.stringify(data, null, 1)};\n`);
  zip.file('index.html', template['paket-index.html'].replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(data.title)}</title>`));
  zip.file('assets/course.css', template['course.css']);
  zip.file('assets/scorm-api.js', template['scorm-api.js']);
  zip.file('assets/course.js', template['course.js']);
  zip.file('assets/karakter.js', template['karakter.js']);
  zip.file('assets/lipsync.js', template['lipsync.js']);
  const usedChars = new Set();
  if (data.presenter?.on && FOTO_CHARS.includes(data.presenter.who)) usedChars.add(data.presenter.who);
  for (const sl of data.slides) if (FOTO_CHARS.includes(sl.who)) usedChars.add(sl.who);
  if (usedChars.size) {
    if (typeof template.__bin !== 'function') throw new Error('Gambar karakter tidak tersedia untuk paket ini.');
    onProgress('Menyalin gambar karakter…');
    for (const id of usedChars) for (const f of fotoFiles(id)) zip.file(`assets/${f}`, await template.__bin(f));
  }

  const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  const identifier = `${slugify(data.title)}-${String(project.id || '').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'kursus'}`;
  zip.file('imsmanifest.xml', buildManifest({ version: data.version, identifier, title: data.title, files, passingScore: data.passingScore }));

  onProgress('Mengompres paket…');
  const filename = `${slugify(data.title)}-scorm${data.version === '2004' ? '2004' : '12'}.zip`;
  const out = await zip.generateAsync({ type, compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' },
    (m) => onProgress(`Mengompres paket… ${Math.round(m.percent)}%`));
  return { data: out, filename, files: [...files, 'imsmanifest.xml'].sort() };
}
