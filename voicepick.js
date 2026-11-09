// ============================================================
// voicepick.js — pilihan jenis suara (perempuan / laki-laki) untuk semua mesin narasi
//   Microsoft & server  : Gadis (perempuan) / Ardi (laki-laki)
//   Suara AI di browser : satu model Indonesia (perempuan); versi laki-laki = nada & timbre diturunkan
// Murni (tanpa DOM) → bisa diuji di Node.
// ============================================================
export const FEMALE = 'id-ID-GadisNeural', MALE = 'id-ID-ArdiNeural';
/** Penurunan nada (satuan slider; faktor 2^(n/36)) untuk membuat suara AI terdengar laki-laki. */
export const MALE_PITCH_SHIFT = -16;

const isIdVoice = (v) => !v || v === FEMALE || v === MALE;
/** 'perempuan' | 'laki' dari pengaturan (gender eksplisit, kalau tidak dari nama suara). */
export const genderOf = (cfg = {}) => (cfg.gender === 'laki' || cfg.gender === 'perempuan' ? cfg.gender : cfg.voice === MALE ? 'laki' : 'perempuan');

/** Pilihan suara per slide (s.voice.v): '', Gadis, Ardi, 'piper' / 'piper-f' (AI perempuan), 'piper-m' (AI laki-laki). */
export function applyVoiceOverride(cfg, ov) {
  const c = { ...cfg };
  if (ov?.v === 'piper' || ov?.v === 'piper-f') { c.engine = 'piper'; c.gender = 'perempuan'; }
  else if (ov?.v === 'piper-m') { c.engine = 'piper'; c.gender = 'laki'; }
  else if (ov?.v) { c.engine = c.engine === 'server' ? 'server' : 'edge'; c.voice = ov.v; c.gender = ov.v === MALE ? 'laki' : ov.v === FEMALE ? 'perempuan' : c.gender; }
  return c;
}
/** Suara Microsoft/server yang dipakai: ikut jenis suara, kecuali suara khusus (bahasa lain) yang dipilih sendiri. */
export function edgeVoiceFor(cfg) { return isIdVoice(cfg.voice) ? (genderOf(cfg) === 'laki' ? MALE : FEMALE) : cfg.voice; }
/** Tambahan nada untuk suara AI di browser. */
export const piperPitchFor = (cfg, pitchN) => pitchN + (genderOf(cfg) === 'laki' ? MALE_PITCH_SHIFT : 0);
export const genderLabel = (cfg) => (genderOf(cfg) === 'laki' ? 'laki-laki' : 'perempuan');
