// ============================================================
// importers.js — mengubah file menjadi slide
//   PowerPoint (.pptx)  → slide materi (judul, teks, gambar) + catatan pembicara jadi naskah narasi
//   PDF                 → satu slide gambar per halaman (tampilan persis seperti aslinya)
//   Word (.docx)        → slide materi per judul (Heading 1/2)
//   Gambar / GIF        → satu slide gambar per file
//   Video               → slide video
//   HTML / ZIP          → slide HTML (halaman tunggal atau mini-website)
// Semua diproses di browser — file tidak dikirim ke mana pun.
// ============================================================
import { uid } from './util.js';
import { findZipEntry } from './packager.js';

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };
const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();
const prettyName = (name) => String(name).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const all = (node, local) => [...node.getElementsByTagNameNS('*', local)];
const first = (node, local) => node.getElementsByTagNameNS('*', local)[0] || null;
const asset = (blob, name) => ({ data: blob, name, type: blob.type });

export const ACCEPT_ALL = '.pptx,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm,.mov,.m4v,.html,.htm,.zip';

/** Tebak jenis file dari ekstensi. */
export function kindOf(file) {
  const e = ext(file.name);
  if (e === 'pptx') return 'pptx';
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v'].includes(e)) return 'video';
  if (['html', 'htm'].includes(e)) return 'html';
  if (e === 'zip') return 'zip';
  if (['ppt', 'pps', 'ppsx', 'key', 'odp'].includes(e)) return 'old-ppt';
  if (['doc', 'odt', 'rtf'].includes(e)) return 'old-doc';
  if (['mp3', 'm4a', 'wav', 'ogg'].includes(e)) return 'audio';
  return 'unknown';
}

/**
 * Impor beberapa file sekaligus.
 * @returns {Promise<{slides: object[], notes: string[]}>}
 */
export async function importFiles(files, { onProgress = () => {}, pdfTextAsNarration = false } = {}) {
  const slides = [];
  const notes = [];
  for (const file of files) {
    const kind = kindOf(file);
    onProgress(`Membaca ${file.name}…`);
    try {
      if (kind === 'pptx') slides.push(...await importPptx(file, onProgress));
      else if (kind === 'pdf') slides.push(...await importPdf(file, { onProgress, textAsNarration: pdfTextAsNarration }));
      else if (kind === 'docx') slides.push(...await importDocx(file));
      else if (kind === 'image') slides.push(imageSlide(file));
      else if (kind === 'video') slides.push(videoSlide(file));
      else if (kind === 'html') { const r = await htmlSlide(file); slides.push(r.slide); if (r.note) notes.push(r.note); }
      else if (kind === 'zip') slides.push(await zipSlide(file));
      else if (kind === 'old-ppt') notes.push(`${file.name}: format lama/lain belum didukung. Di PowerPoint pilih File → Simpan Sebagai → PowerPoint (.pptx) atau PDF, lalu impor lagi.`);
      else if (kind === 'old-doc') notes.push(`${file.name}: simpan dulu sebagai Word (.docx) lalu impor lagi.`);
      else if (kind === 'audio') notes.push(`${file.name}: file audio dipasang lewat bagian "Narasi suara" di slide (tombol Unggah audio).`);
      else notes.push(`${file.name}: jenis file tidak dikenali.`);
    } catch (e) {
      console.error(e);
      notes.push(`${file.name}: gagal dibaca — ${e.message}`);
    }
  }
  return { slides, notes };
}

export function imageSlide(file) {
  return { id: uid('s'), type: 'image', title: prettyName(file.name), image: asset(file, file.name), imageAlt: '', caption: '', fit: 'contain', narration: '', audio: null };
}
export function videoSlide(file) {
  return { id: uid('s'), type: 'video', title: prettyName(file.name), source: 'file', video: asset(file, file.name), url: '', caption: '', mustWatch: false, narration: '', audio: null };
}
export async function htmlSlide(file) {
  const html = await file.text();
  const local = /\s(?:src|href)\s*=\s*["'](?!https?:|data:|#|mailto:|\/\/|javascript:)([^"']+\.(?:png|jpe?g|gif|svg|webp|css|js|mp4|mp3))["']/i.exec(html);
  return {
    slide: { id: uid('s'), type: 'html', title: prettyName(file.name), source: 'file', html, fileName: file.name, zip: null, height: 600, hideTitle: false, caption: '', narration: '', audio: null },
    note: local ? `${file.name} memakai file lain (mis. ${local[1]}). Agar gambar/CSS-nya ikut, bungkus semua file dalam satu .zip lalu impor .zip tersebut.` : null,
  };
}
export async function zipSlide(file) {
  const zip = await globalThis.JSZip.loadAsync(file);
  const entry = findZipEntry(Object.keys(zip.files).filter((n) => !zip.files[n].dir));
  if (!entry) throw new Error('tidak ada file .html di dalam zip. Untuk memutar paket SCORM, pakai halaman Player.');
  if (Object.keys(zip.files).some((n) => /(^|\/)imsmanifest\.xml$/i.test(n))) {
    // Tetap boleh, tapi beri tahu: paket SCORM di dalam SCORM tidak akan melapor nilai.
  }
  return { id: uid('s'), type: 'html', title: prettyName(file.name), source: 'zip', html: '', fileName: file.name, zip: asset(file, file.name), height: 600, hideTitle: false, caption: '', narration: '', audio: null };
}

// ------------------------------------------------------------ PowerPoint (.pptx)
function relsMap(doc) {
  const m = new Map();
  for (const r of all(doc, 'Relationship')) m.set(r.getAttribute('Id'), { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', mode: r.getAttribute('TargetMode') });
  return m;
}
function resolvePath(baseDir, target) {
  const parts = (target.startsWith('/') ? target.slice(1) : `${baseDir}/${target}`).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}
function paragraphsOf(txBody) {
  return all(txBody, 'p').map((p) => {
    const text = [...p.childNodes].map((n) => {
      if (n.localName === 'r' || n.localName === 'fld') return all(n, 't').map((t) => t.textContent).join('');
      if (n.localName === 'br') return '\n';
      return '';
    }).join('').replace(/\s+\n/g, '\n').trim();
    const lvl = +(first(p, 'pPr')?.getAttribute('lvl') || 0);
    const bulletOff = !!first(p, 'buNone');
    return { text, lvl, bulletOff };
  }).filter((x) => x.text);
}
function offsetOf(el) {
  const off = first(el, 'off');
  return off ? { x: +off.getAttribute('x') || 0, y: +off.getAttribute('y') || 0 } : { x: 0, y: 0 };
}

export async function importPptx(file, onProgress = () => {}) {
  const zip = await globalThis.JSZip.loadAsync(file);
  const read = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
  const presXml = await read('ppt/presentation.xml');
  if (!presXml) throw new Error('bukan file PowerPoint .pptx yang valid');
  const pres = xml(presXml);
  const presRels = relsMap(xml(await read('ppt/_rels/presentation.xml.rels') || '<x/>'));
  const order = all(pres, 'sldId').map((s) => presRels.get(s.getAttributeNS(NS_REL, 'id') || s.getAttribute('r:id'))?.target).filter(Boolean).map((t) => resolvePath('ppt', t));
  const slides = [];
  let n = 0;
  for (const path of order) {
    n++;
    onProgress(`PowerPoint: slide ${n} dari ${order.length}…`);
    const sx = await read(path);
    if (!sx) continue;
    const doc = xml(sx);
    const dir = path.slice(0, path.lastIndexOf('/'));
    const relsPath = `${dir}/_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`;
    const rels = relsMap(xml(await read(relsPath) || '<x/>'));

    // Teks: urutkan bentuk dari atas ke bawah, kiri ke kanan.
    let title = '';
    const blocks = [];
    const shapes = all(doc, 'sp').map((sp) => ({ sp, pos: offsetOf(sp) })).sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    for (const { sp } of shapes) {
      const ph = first(sp, 'ph');
      const phType = ph?.getAttribute('type') || '';
      if (['sldNum', 'dt', 'ftr', 'hdr'].includes(phType)) continue;
      const tx = first(sp, 'txBody');
      if (!tx) continue;
      const paras = paragraphsOf(tx);
      if (!paras.length) continue;
      if (!title && (phType === 'title' || phType === 'ctrTitle')) { title = paras.map((p) => p.text).join(' '); continue; }
      const isBody = phType === 'body' || phType === '' || phType === 'obj';
      if (paras.length > 1 && isBody && !paras.every((p) => p.bulletOff)) {
        blocks.push(paras.map((p) => `${'  '.repeat(Math.min(p.lvl, 1))}- ${p.text.replace(/\n/g, ' ')}`).join('\n'));
      } else {
        blocks.push(paras.map((p) => p.text).join('\n'));
      }
    }
    // Tabel → daftar baris.
    for (const tbl of all(doc, 'tbl')) {
      const rows = all(tbl, 'tr').map((tr) => all(tr, 'tc').map((tc) => all(tc, 't').map((t) => t.textContent).join('').trim()).join(' | ')).filter((r) => r.replace(/[|\s]/g, ''));
      if (rows.length) blocks.push(rows.map((r) => `- ${r}`).join('\n'));
    }

    // Gambar terbesar di slide.
    let best = null;
    for (const pic of all(doc, 'pic')) {
      const blip = first(pic, 'blip');
      const rid = blip?.getAttributeNS(NS_REL, 'embed') || blip?.getAttribute('r:embed');
      const rel = rid && rels.get(rid);
      if (!rel || rel.mode === 'External') continue;
      const ext2 = first(pic, 'ext');
      const area = ext2 ? (+ext2.getAttribute('cx') || 0) * (+ext2.getAttribute('cy') || 0) : 0;
      if (!best || area > best.area) best = { area, path: resolvePath(dir, rel.target) };
    }
    let image = null;
    if (best) {
      const f = zip.file(best.path);
      const e = ext(best.path);
      if (f && MIME[e]?.startsWith('image/') && e !== 'emf' && e !== 'wmf') {
        const blob = new Blob([await f.async('uint8array')], { type: MIME[e] });
        image = asset(blob, best.path.split('/').pop());
      }
    }

    // Video yang tertanam.
    let video = null;
    for (const rel of rels.values()) {
      if (rel.mode === 'External') continue;
      const e = ext(rel.target);
      if (['mp4', 'm4v', 'mov', 'webm'].includes(e)) {
        const f = zip.file(resolvePath(dir, rel.target));
        if (f) { video = asset(new Blob([await f.async('uint8array')], { type: MIME[e] }), rel.target.split('/').pop()); break; }
      }
    }

    // Catatan pembicara → naskah narasi.
    let narration = '';
    for (const rel of rels.values()) {
      if (/\/notesSlide$/.test(rel.type)) {
        const nx = await read(resolvePath(dir, rel.target));
        if (nx) {
          const nd = xml(nx);
          narration = all(nd, 'sp').filter((sp) => first(sp, 'ph')?.getAttribute('type') === 'body')
            .map((sp) => paragraphsOf(first(sp, 'txBody')).map((p) => p.text).join('\n')).join('\n').trim();
        }
      }
    }

    const body = blocks.join('\n\n').trim();
    const finalTitle = (title || body.split('\n')[0].replace(/^- /, '') || `Slide ${n}`).slice(0, 120);
    const finalBody = title ? body : body.split('\n').slice(1).join('\n').trim();
    if (!finalBody && image) {
      slides.push({ id: uid('s'), type: 'image', title: finalTitle, image, imageAlt: '', caption: '', fit: 'contain', narration, audio: null });
    } else {
      slides.push({ id: uid('s'), type: 'content', title: finalTitle, body: finalBody, image, imageAlt: '', layout: image ? (finalBody.length > 260 ? 'kanan' : 'atas') : 'atas', narration, audio: null });
    }
    if (video) slides.push({ id: uid('s'), type: 'video', title: `${finalTitle} — video`, source: 'file', video, url: '', caption: '', mustWatch: false, narration: '', audio: null });
  }
  if (!slides.length) throw new Error('tidak ada slide yang bisa dibaca');
  return slides;
}

// ------------------------------------------------------------ PDF
let pdfjsPromise;
function loadPdfJs() {
  pdfjsPromise ??= import('./pdf.min.mjs').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
    return lib;
  });
  return pdfjsPromise;
}

export async function importPdf(file, { onProgress = () => {}, textAsNarration = false, maxWidth = 1600 } = {}) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const slides = [];
  const base = prettyName(file.name);
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress(`PDF: halaman ${p} dari ${pdf.numPages}…`);
    const page = await pdf.getPage(p);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, maxWidth / v1.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    canvas.width = canvas.height = 0;
    let text = '';
    try { text = (await page.getTextContent()).items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim(); } catch { /* halaman hasil scan */ }
    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 2) || '';
    slides.push({
      id: uid('s'), type: 'image', title: (firstLine.length > 3 && firstLine.length < 90 ? firstLine : `${base} — halaman ${p}`),
      image: asset(blob, `halaman-${p}.jpg`), imageAlt: text.slice(0, 300), caption: '', fit: 'contain',
      narration: textAsNarration ? text : '', audio: null,
    });
    page.cleanup();
  }
  await pdf.destroy();
  return slides;
}

// ------------------------------------------------------------ Word (.docx)
export async function importDocx(file) {
  const zip = await globalThis.JSZip.loadAsync(file);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('bukan file Word .docx yang valid');
  const styles = new Map();
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (stylesXml) for (const s of all(xml(stylesXml), 'style')) styles.set(s.getAttribute('w:styleId') || s.getAttributeNS('*', 'styleId'), (first(s, 'name')?.getAttribute('w:val') || '').toLowerCase());
  const rels = relsMap(xml(await zip.file('word/_rels/document.xml.rels')?.async('string') || '<x/>'));
  const doc = xml(docXml);
  const body = first(doc, 'body');
  const slides = [];
  let cur = null;
  const startSlide = (title) => { cur = { id: uid('s'), type: 'content', title: title.slice(0, 120), lines: [], image: null }; slides.push(cur); };

  for (const node of [...body.childNodes]) {
    if (node.localName === 'tbl') {
      const rows = all(node, 'tr').map((tr) => all(tr, 'tc').map((tc) => all(tc, 't').map((t) => t.textContent).join('').trim()).join(' | ')).filter((r) => r.replace(/[|\s]/g, ''));
      if (rows.length) { if (!cur) startSlide(prettyName(file.name)); cur.lines.push(rows.map((r) => `- ${r}`).join('\n'), ''); }
      continue;
    }
    if (node.localName !== 'p') continue;
    const styleId = first(node, 'pStyle')?.getAttribute('w:val') || '';
    const styleName = styles.get(styleId) || styleId.toLowerCase();
    const text = [...node.getElementsByTagNameNS('*', '*')].map((n) => (n.localName === 't' ? n.textContent : n.localName === 'tab' ? ' ' : n.localName === 'br' ? '\n' : '')).join('').trim();
    const blip = first(node, 'blip');
    if (blip && cur && !cur.image) {
      const rel = rels.get(blip.getAttributeNS(NS_REL, 'embed') || blip.getAttribute('r:embed'));
      const path = rel && resolvePath('word', rel.target);
      const f = path && zip.file(path);
      const e = ext(path);
      if (f && MIME[e]?.startsWith('image/')) cur.image = asset(new Blob([await f.async('uint8array')], { type: MIME[e] }), path.split('/').pop());
    }
    if (!text) continue;
    if (/^(heading [12]|title|judul [12]|judul)$/.test(styleName)) { startSlide(text); continue; }
    if (!cur) startSlide(prettyName(file.name));
    if (/^heading [3-6]/.test(styleName)) { cur.lines.push(`## ${text}`, ''); continue; }
    if (first(node, 'numPr') || /list/.test(styleName)) cur.lines.push(`- ${text}`);
    else cur.lines.push(text, '');
  }
  if (!slides.length) throw new Error('dokumen kosong');
  return slides.map((s) => ({
    id: s.id, type: 'content', title: s.title,
    body: s.lines.join('\n').replace(/\n(- )/g, '\n$1').replace(/(- [^\n]+)\n(?!- )/g, '$1\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    image: s.image, imageAlt: '', layout: s.image ? 'kanan' : 'atas', narration: '', audio: null,
  }));
}
