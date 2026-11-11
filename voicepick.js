// ============================================================
// voicepick.js — katalog & logika pilihan suara narasi (perempuan / laki-laki)
//   Microsoft & server  : suara Indonesia (Gadis/Ardi) + suara multibahasa
//                         internasional yang fasih membaca Bahasa Indonesia.
//   Suara AI di browser : satu model Indonesia (perempuan); versi laki-laki =
//                         nada & warna suara diturunkan.
// Murni (tanpa DOM) → bisa diuji di Node.
// ============================================================
export const FEMALE = 'id-ID-GadisNeural', MALE = 'id-ID-ArdiNeural';

/**
 * Katalog suara Microsoft yang tersedia lewat mesin "Microsoft" dan "Server sendiri".
 * Suara "Internasional" adalah suara multibahasa: sangat natural membaca Bahasa
 * Indonesia, kadang dengan sedikit logat. Nada (pitch) tidak berpengaruh padanya.
 */
export const VOICE_CATALOG = [
  { id: FEMALE, nama: 'Gadis', gender: 'perempuan', asal: 'Indonesia', ket: 'standar' },
  { id: 'en-US-AvaMultilingualNeural', nama: 'Ava', gender: 'perempuan', asal: 'Internasional', ket: 'hangat' },
  { id: 'en-US-EmmaMultilingualNeural', nama: 'Emma', gender: 'perempuan', asal: 'Internasional', ket: 'ceria' },
  { id: 'fr-FR-VivienneMultilingualNeural', nama: 'Vivienne', gender: 'perempuan', asal: 'Internasional', ket: 'lembut' },
  { id: 'de-DE-SeraphinaMultilingualNeural', nama: 'Seraphina', gender: 'perempuan', asal: 'Internasional', ket: 'tenang' },
  { id: MALE, nama: 'Ardi', gender: 'laki', asal: 'Indonesia', ket: 'standar' },
  { id: 'en-US-AndrewMultilingualNeural', nama: 'Andrew', gender: 'laki', asal: 'Internasional', ket: 'hangat, berat' },
  { id: 'en-US-BrianMultilingualNeural', nama: 'Brian', gender: 'laki', asal: 'Internasional', ket: 'santai' },
  { id: 'fr-FR-RemyMultilingualNeural', nama: 'Remy', gender: 'laki', asal: 'Internasional', ket: 'muda, ringan' },
  { id: 'de-DE-FlorianMultilingualNeural', nama: 'Florian', gender: 'laki', asal: 'Internasional', ket: 'tegas' },
];
export const voiceInfo = (id) => VOICE_CATALOG.find((v) => v.id === id) || null;
export const voicesFor = (gender) => VOICE_CATALOG.filter((v) => v.gender === gender);
export const defaultVoice = (gender) => (gender === 'laki' ? MALE : FEMALE);

/** Penurunan nada (satuan slider; faktor 2^(n/36)) untuk membuat suara AI terdengar laki-laki. */
export const MALE_PITCH_SHIFT = -16;

/** 'perempuan' | 'laki' dari pengaturan (gender eksplisit; kalau tidak, dari katalog suara). */
export const genderOf = (cfg = {}) => (cfg.gender === 'laki' || cfg.gender === 'perempuan' ? cfg.gender : voiceInfo(cfg.voice)?.gender || 'perempuan');

/**
 * Pilihan suara per slide (s.voice.v):
 *   '' ikut pengaturan · nama suara dari katalog (Gadis, Ardi, Andrew, …) ·
 *   'piper' / 'piper-f' (AI perempuan) · 'piper-m' (AI laki-laki).
 */
export function applyVoiceOverride(cfg, ov) {
  const c = { ...cfg };
  if (ov?.v === 'piper' || ov?.v === 'piper-f') { c.engine = 'piper'; c.gender = 'perempuan'; }
  else if (ov?.v === 'piper-m') { c.engine = 'piper'; c.gender = 'laki'; }
  else if (ov?.v) { c.engine = c.engine === 'server' ? 'server' : 'edge'; c.voice = ov.v; c.gender = voiceInfo(ov.v)?.gender || c.gender; }
  return c;
}

/**
 * Suara Microsoft/server yang dipakai: suara terpilih bila jenisnya cocok;
 * bila jenis suara diganti tanpa memilih suara baru, pakai suara standar jenis itu.
 * Suara di luar katalog (daftar dari server) dibiarkan apa adanya.
 */
export function edgeVoiceFor(cfg) {
  const info = voiceInfo(cfg.voice);
  if (!cfg.voice) return defaultVoice(genderOf(cfg));
  if (info && info.gender !== genderOf(cfg)) return defaultVoice(genderOf(cfg));
  return cfg.voice;
}
/** Tambahan nada untuk suara AI di browser. */
export const piperPitchFor = (cfg, pitchN) => pitchN + (genderOf(cfg) === 'laki' ? MALE_PITCH_SHIFT : 0);
export const genderLabel = (cfg) => (genderOf(cfg) === 'laki' ? 'laki-laki' : 'perempuan');
