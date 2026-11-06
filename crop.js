// ============================================================
// crop.js — potong (crop) & putar gambar langsung di Builder
//   openCropper(asset) → Promise<asset baru | null>
//   cropBlob(blob, {l,t,r,b}) → potong berdasarkan persen (dipakai importer PowerPoint)
// Gambar asli disimpan di asset.original agar bisa dikembalikan kapan saja.
// ============================================================
import { h, icon, modal, toast } from './ui.js';

/** Muat Blob gambar menjadi elemen <img> yang siap digambar ke canvas. */
export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca.')); };
    img.src = url;
  });
}

const outType = (type) => (/png|gif|webp|svg/.test(type || '') ? 'image/png' : 'image/jpeg');
const outExt = (type) => (type === 'image/png' ? 'png' : 'jpg');

/**
 * Gambar ulang sebagian gambar ke canvas.
 * box = {x, y, w, h} dalam piksel gambar asli; rotate = 0/90/180/270.
 */
async function render(blob, box, rotate = 0, type) {
  const { img, url } = await loadImage(blob);
  try {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const x = Math.max(0, Math.round(box.x)), y = Math.max(0, Math.round(box.y));
    const w = Math.max(1, Math.min(W - x, Math.round(box.w))), hh = Math.max(1, Math.min(H - y, Math.round(box.h)));
    // Batasi sisi terpanjang 2400 px agar paket SCORM tetap ringan.
    const k = Math.min(1, 2400 / Math.max(w, hh));
    const ow = Math.round(w * k), oh = Math.round(hh * k);
    const rot = ((rotate % 360) + 360) % 360;
    const cv = document.createElement('canvas');
    cv.width = rot % 180 ? oh : ow; cv.height = rot % 180 ? ow : oh;
    const g = cv.getContext('2d');
    const t = outType(type);
    if (t === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); }
    g.translate(cv.width / 2, cv.height / 2);
    g.rotate((rot * Math.PI) / 180);
    g.drawImage(img, x, y, w, hh, -ow / 2, -oh / 2, ow, oh);
    const out = await new Promise((res) => cv.toBlob(res, t, 0.9));
    cv.width = cv.height = 0;
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Potong berdasarkan persen tiap sisi (format srcRect PowerPoint: 100000 = 100%).
 * Nilai negatif (PowerPoint memberi ruang kosong) diabaikan.
 */
export async function cropBlob(blob, { l = 0, t = 0, r = 0, b = 0 } = {}) {
  const { img, url } = await loadImage(blob);
  const W = img.naturalWidth, H = img.naturalHeight;
  URL.revokeObjectURL(url);
  const f = (v) => Math.max(0, Math.min(0.95, (+v || 0) / 100000));
  const L = f(l), T = f(t), R = f(r), B = f(b);
  if (L + R >= 0.98 || T + B >= 0.98) return blob;
  return render(blob, { x: W * L, y: H * T, w: W * (1 - L - R), h: H * (1 - T - B) }, 0, blob.type);
}

const RATIOS = [['bebas', 'Bebas', 0], ['16:9', '16:9', 16 / 9], ['4:3', '4:3', 4 / 3], ['1:1', 'Kotak', 1], ['3:4', 'Tegak', 3 / 4]];

/** Jendela potong gambar. Mengembalikan aset baru, atau null bila dibatalkan. */
export async function openCropper(asset) {
  if (!asset?.data) return null;
  if (/gif/.test(asset.type || asset.data.type || '')) {
    if (!confirm('GIF animasi akan menjadi gambar diam setelah dipotong. Lanjutkan?')) return null;
  }
  const source = asset.original?.data || asset.data;
  let loaded;
  try { loaded = await loadImage(source); } catch (e) { toast(e.message, 'error'); return null; }
  const { img, url } = loaded;
  const W = img.naturalWidth, H = img.naturalHeight;
  // Kotak potong dalam pecahan 0..1 terhadap gambar asli.
  let box = asset.crop ? { ...asset.crop } : { x: 0, y: 0, w: 1, h: 1 };
  let rotate = asset.rotate || 0;
  let ratio = 0;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(v); };
    const pic = h('img', { src: url, alt: '', draggable: false });
    const frame = h('div', { class: 'crop-box' }, ...['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map((d) => h('span', { class: `crop-h h-${d}`, 'data-d': d })));
    const stage = h('div', { class: 'crop-stage' }, pic, h('div', { class: 'crop-shade' }), frame);
    const info = h('span', { class: 'muted small' });
    const draw = () => {
      frame.style.left = `${box.x * 100}%`; frame.style.top = `${box.y * 100}%`;
      frame.style.width = `${box.w * 100}%`; frame.style.height = `${box.h * 100}%`;
      stage.style.setProperty('--x', `${box.x * 100}%`); stage.style.setProperty('--y', `${box.y * 100}%`);
      stage.style.setProperty('--w', `${box.w * 100}%`); stage.style.setProperty('--h', `${box.h * 100}%`);
      info.textContent = `${Math.round(box.w * W)} × ${Math.round(box.h * H)} px${rotate ? ` · diputar ${rotate}°` : ''}`;
    };
    const clamp = () => {
      box.w = Math.max(0.03, Math.min(1, box.w)); box.h = Math.max(0.03, Math.min(1, box.h));
      box.x = Math.max(0, Math.min(1 - box.w, box.x)); box.y = Math.max(0, Math.min(1 - box.h, box.y));
    };
    const applyRatio = () => {
      if (!ratio) return;
      // ratio dalam piksel; ubah ke pecahan.
      const want = ratio * (H / W); // w/h dalam pecahan
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      let w = box.w, hh = w / want;
      if (hh > 1) { hh = 1; w = hh * want; }
      if (w > 1) { w = 1; hh = w / want; }
      box = { x: cx - w / 2, y: cy - hh / 2, w, h: hh }; clamp();
    };

    // Seret kotak / pegangan dengan jari atau mouse.
    stage.addEventListener('pointerdown', (e) => {
      const r = stage.getBoundingClientRect();
      const d = e.target.dataset?.d || (e.target === frame ? 'move' : null);
      if (!d) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const start = { ...box }, px = e.clientX, py = e.clientY;
      const move = (ev) => {
        const dx = (ev.clientX - px) / r.width, dy = (ev.clientY - py) / r.height;
        const b = { ...start };
        if (d === 'move') { b.x += dx; b.y += dy; } else {
          if (d.includes('w')) { b.x = Math.min(start.x + start.w - 0.03, start.x + dx); b.w = start.w + (start.x - b.x); }
          if (d.includes('e')) b.w = start.w + dx;
          if (d.includes('n')) { b.y = Math.min(start.y + start.h - 0.03, start.y + dy); b.h = start.h + (start.y - b.y); }
          if (d.includes('s')) b.h = start.h + dy;
          if (ratio) {
            const want = ratio * (H / W);
            if (d === 'n' || d === 's') b.w = b.h * want; else b.h = b.w / want;
            if (d.includes('n')) b.y = start.y + start.h - b.h;
            if (d.includes('w')) b.x = start.x + start.w - b.w;
          }
          b.x = Math.max(0, b.x); b.y = Math.max(0, b.y);
          b.w = Math.min(b.w, 1 - b.x); b.h = Math.min(b.h, 1 - b.y);
        }
        box = b; clamp(); draw();
      };
      const up = () => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up); };
      stage.addEventListener('pointermove', move); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    });

    const ratioBtns = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Perbandingan sisi' }, RATIOS.map(([k, label, v]) => {
      const inp = h('input', { type: 'radio', name: 'cropRatio', value: k, checked: !v, onchange: () => { ratio = v; applyRatio(); draw(); } });
      return h('label', {}, inp, h('span', {}, label));
    }));
    const rotBtn = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { rotate = (rotate + 90) % 360; draw(); } }, icon('retry'), 'Putar 90°');
    const resetBtn = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { box = { x: 0, y: 0, w: 1, h: 1 }; rotate = 0; draw(); } }, 'Atur ulang');

    const save = h('button', { class: 'btn btn-primary', type: 'button' }, icon('check'), 'Simpan potongan');
    const restore = asset.original ? h('button', { class: 'btn', type: 'button', onclick: () => {
      finish({ ...asset.original });
      m.close();
    } }, 'Kembalikan gambar asli') : null;
    save.onclick = async () => {
      save.disabled = true;
      try {
        const full = box.x < 0.002 && box.y < 0.002 && box.w > 0.996 && box.h > 0.996 && !rotate;
        const original = asset.original || { data: asset.data, name: asset.name, type: asset.type || asset.data.type };
        if (full) { finish({ ...original }); m.close(); return; }
        const blob = await render(source, { x: box.x * W, y: box.y * H, w: box.w * W, h: box.h * H }, rotate, original.type);
        const base = String(original.name || 'gambar').replace(/\.[^.]+$/, '');
        finish({ data: blob, name: `${base}-potong.${outExt(blob.type)}`, type: blob.type, original, crop: { ...box }, rotate });
        m.close();
      } catch (e) { toast(e.message, 'error'); save.disabled = false; }
    };

    const m = modal('Potong gambar', h('div', { class: 'cropper' },
      h('p', { class: 'hint' }, 'Seret kotak untuk memindah, seret titik di sudut/sisi untuk mengubah ukuran.'),
      stage,
      h('div', { class: 'row wrap crop-tools' }, ratioBtns, rotBtn, resetBtn, info),
      h('div', { class: 'row wrap crop-actions' }, restore, h('span', { class: 'spacer' }), save)), { wide: true, onClose: () => finish(null) });
    if (!pic.complete) pic.onload = draw;
    draw();
  });
}
