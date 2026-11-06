// ============================================================
// tts.js — suara untuk Builder. Semuanya gratis:
//
// 1. BrowserTTS    — suara bawaan perangkat (Web Speech API).
// 2. Recorder      — rekam suara Anda sendiri lewat mikrofon.
// 3. PiperTTS      — MP3 suara AI Bahasa Indonesia yang dibuat LANGSUNG
//    DI BROWSER (model Piper id_ID, lisensi MIT). Tanpa server, tanpa
//    daftar akun. Unduhan pertama ±90 MB lalu tersimpan di browser.
// 4. EdgeDirectTTS — MP3 suara Microsoft Gadis/Ardi, dihubungi langsung
//    dari browser (eksperimental: Microsoft bisa sewaktu-waktu menolak).
// 5. EdgeTTS       — MP3 Gadis/Ardi lewat server sendiri main.py.
// ============================================================

/** Kamus pelafalan: singkatan yang sering salah dibaca mesin suara. Tambahkan sendiri. */
export const PRONUNCIATION = {
  K3: 'K tiga', K3L: 'K tiga L', APD: 'A P D', SOP: 'S O P', LMS: 'L M S', SCORM: 'skorm', JSA: 'J S A', JSEA: 'J S E A',
};

export function cleanForSpeech(text = '') {
  let t = String(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[ \t]+/g, ' ');
  for (const [word, say] of Object.entries(PRONUNCIATION)) t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), say);
  return t.trim();
}

export function splitSentences(text, max = 220) {
  const out = [];
  for (const sentence of text.replace(/([.!?…])\s+/g, '$1\n').split(/\n+/)) {
    let s = sentence.trim();
    while (s.length > max) {
      let cut = s.lastIndexOf(',', max);
      if (cut < max / 2) cut = s.lastIndexOf(' ', max);
      if (cut < max / 2) cut = max;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

// ------------------------------------------------------------ 1) suara browser
export class BrowserTTS {
  static get supported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }

  /** Semua suara; suara Indonesia & "Natural/Online" di urutan atas. */
  static voices() {
    if (!BrowserTTS.supported) return Promise.resolve([]);
    const sort = (list) => [...list].sort((a, b) => {
      const id = (v) => (/^(id|in)[-_]/i.test(v.lang) ? 0 : 1);
      const q = (v) => (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2);
      return id(a) - id(b) || q(a) - q(b) || a.name.localeCompare(b.name);
    });
    return new Promise((resolve) => {
      const now = speechSynthesis.getVoices();
      if (now.length) return resolve(sort(now));
      const done = () => resolve(sort(speechSynthesis.getVoices()));
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }

  constructor() { this.stopped = true; }

  speak(text, { voice = null, rate = 1, onEnd = () => {} } = {}) {
    this.stop();
    if (!BrowserTTS.supported) throw new Error('Browser ini tidak punya fitur suara (Web Speech API).');
    const parts = splitSentences(cleanForSpeech(text));
    if (!parts.length) throw new Error('Belum ada teks untuk dibacakan.');
    this.stopped = false;
    const next = () => {
      if (this.stopped) return;
      const part = parts.shift();
      if (!part) { this.stopped = true; onEnd(); return; }
      const u = new SpeechSynthesisUtterance(part);
      u.lang = voice?.lang || 'id-ID';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onend = next;
      u.onerror = (e) => { if (!['interrupted', 'canceled'].includes(e.error)) next(); };
      speechSynthesis.speak(u);
    };
    next();
  }
  stop() { this.stopped = true; if (BrowserTTS.supported) speechSynthesis.cancel(); }
}

// ------------------------------------------------------------ 2) rekam suara sendiri
export class Recorder {
  static get supported() { return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }

  /** Mulai merekam. onLevel(0..1) dipanggil terus untuk indikator volume. */
  async start({ onLevel = () => {} } = {}) {
    if (!Recorder.supported) throw new Error('Perekaman suara tidak didukung browser ini.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      throw new Error(e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser lalu coba lagi.' : `Mikrofon tidak bisa dibuka: ${e.message}`);
    }
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    this.mime = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.started = Date.now();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const an = this.ctx.createAnalyser(); an.fftSize = 512;
      this.ctx.createMediaStreamSource(this.stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        if (!this.rec || this.rec.state !== 'recording') return;
        an.getByteTimeDomainData(buf);
        let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        onLevel(Math.min(1, peak / 90));
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* indikator volume opsional */ }
  }

  /** Berhenti & kembalikan {data: Blob, name, type}. */
  stop() {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(null);
      this.rec.onstop = () => {
        const type = (this.rec.mimeType || this.mime || 'audio/webm').split(';')[0];
        const blob = new Blob(this.chunks, { type });
        this.cleanup();
        resolve({ data: blob, name: `rekaman.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, type });
      };
      this.rec.stop();
    });
  }
  cleanup() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close?.().catch?.(() => {});
    this.rec = null;
  }
}

// ------------------------------------------------------------ 3) MP3 natural via server main.py
export class EdgeTTS {
  constructor(serverUrl) { this.base = String(serverUrl || '').trim().replace(/\/+$/, ''); }

  async #req(path, opt) {
    if (!this.base) throw new Error('Alamat server suara belum diisi. Buka tab Suara untuk memasangnya.');
    if (location.protocol === 'https:' && this.base.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(this.base)) {
      throw new Error('Alamat server harus diawali https:// (halaman ini memakai https).');
    }
    let res;
    try { res = await fetch(this.base + path, opt); } catch {
      throw new Error(`Server suara tidak bisa dihubungi (${this.base}). Bila memakai Hugging Face, buka alamat Space-nya dulu sampai status "Running", lalu coba lagi.`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server suara menjawab ${res.status}.`);
    }
    return res;
  }
  async health() { return (await this.#req('/health')).json(); }
  async voices(lang = 'id') { return (await this.#req(`/voices?lang=${encodeURIComponent(lang)}`)).json(); }
  async synthesize(text, { voice = 'id-ID-GadisNeural', rate = 0, pitch = 0 } = {}) {
    const sign = (n, unit) => `${n >= 0 ? '+' : ''}${Math.round(n)}${unit}`;
    const res = await this.#req('/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanForSpeech(text), voice, rate: sign(rate, '%'), pitch: sign(pitch, 'Hz') }),
    });
    return res.blob();
  }
}

/** Ubah alamat Space Hugging Face (huggingface.co/spaces/user/nama) menjadi alamat API (user-nama.hf.space). */
export function normalizeServerUrl(url) {
  const u = String(url || '').trim();
  const m = /huggingface\.co\/spaces\/([^/\s]+)\/([^/\s?#]+)/i.exec(u);
  if (m) return `https://${m[1].toLowerCase()}-${m[2].toLowerCase().replace(/[_.]/g, '-')}.hf.space`;
  if (u && !/^https?:\/\//i.test(u)) return `https://${u}`;
  return u.replace(/\/+$/, '');
}

// ================================================================ alat bantu audio
const CDN = {
  ort: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.wasm.min.js',
  ortWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/',
  phonemizeJs: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.js',
  phonemizeWasm: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
  phonemizeData: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
  lame: 'https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1.2.7/dist/lamejs.iife.js',
};
const scriptCache = new Map();
/** Muat skrip klasik dari CDN sekali saja. */
function loadScript(src, globalName) {
  if (globalName && globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  if (!scriptCache.has(src)) {
    scriptCache.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.async = true; el.crossOrigin = 'anonymous';
      el.onload = () => resolve(globalName ? globalThis[globalName] : true);
      el.onerror = () => { scriptCache.delete(src); reject(new Error(`Gagal memuat ${src.split('/').pop()} dari internet. Cek koneksi (atau jaringan kantor memblokir cdn.jsdelivr.net).`)); };
      document.head.append(el);
    }));
  }
  return scriptCache.get(src);
}

const CACHE_NAME = 'studio-scorm-suara-v1';
/** Unduh file besar sekali, simpan di Cache Storage browser, laporkan progres (0..1). */
async function fetchCached(url, onProgress = () => {}) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); const hit = await cache.match(url); if (hit) { onProgress(1); return new Uint8Array(await hit.arrayBuffer()); } } catch { cache = null; }
  let res;
  try { res = await fetch(url, { mode: 'cors' }); } catch { throw new Error(`Tidak bisa mengunduh ${url.split('/').pop()}. Pastikan ada internet (unduhan pertama saja).`); }
  if (!res.ok) throw new Error(`Unduhan ${url.split('/').pop()} gagal (${res.status}).`);
  const total = +res.headers.get('Content-Length') || 0;
  const reader = res.body?.getReader();
  let bytes;
  if (!reader) bytes = new Uint8Array(await res.arrayBuffer());
  else {
    const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (total) onProgress(Math.min(0.99, got / total)); }
    bytes = new Uint8Array(got); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  }
  onProgress(1);
  try { await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' } })); } catch { /* kuota penuh: tetap jalan, unduh ulang lain kali */ }
  return bytes;
}

/** Float32 PCM → MP3 (lamejs). Jatuh ke WAV bila encoder gagal dimuat. */
export async function pcmToMp3(pcm, sampleRate, kbps = 64) {
  let lame;
  try { lame = await loadScript(CDN.lame, 'lamejs'); } catch { lame = null; }
  if (!lame?.Mp3Encoder) return { blob: pcmToWav(pcm, sampleRate), name: 'narasi.wav', type: 'audio/wav' };
  const enc = new lame.Mp3Encoder(1, sampleRate, kbps);
  const i16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  const parts = [];
  for (let i = 0; i < i16.length; i += 1152) { const b = enc.encodeBuffer(i16.subarray(i, i + 1152)); if (b.length) parts.push(new Uint8Array(b)); }
  const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  return { blob: new Blob(parts, { type: 'audio/mpeg' }), name: 'narasi.mp3', type: 'audio/mpeg' };
}
export function pcmToWav(pcm, sampleRate) {
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([view.buffer], { type: 'audio/wav' });
}
/** Gabungkan potongan PCM dengan jeda hening, buang hening di ujung, samakan kerasnya suara. */
export function joinPcm(parts, sampleRate, gapSec = 0.32) {
  const gap = Math.round(sampleRate * gapSec);
  const trimmed = parts.map((p) => {
    let a = 0, b = p.length - 1;
    while (a < b && Math.abs(p[a]) < 0.004) a++;
    while (b > a && Math.abs(p[b]) < 0.004) b--;
    return p.subarray(Math.max(0, a - 400), Math.min(p.length, b + 1200));
  }).filter((p) => p.length);
  const total = trimmed.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, trimmed.length - 1) + Math.round(sampleRate * 0.15);
  const out = new Float32Array(total);
  let o = Math.round(sampleRate * 0.1), peak = 0;
  trimmed.forEach((p, i) => { out.set(p, o); o += p.length + (i < trimmed.length - 1 ? gap : 0); });
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.01) { const g = Math.min(4, 0.89 / peak); for (let i = 0; i < out.length; i++) out[i] *= g; }
  return out;
}

// ================================================================ 3) Piper — suara AI langsung di browser
export const PIPER_VOICES = {
  'id_ID-news_tts-medium': {
    label: 'Bahasa Indonesia — suara AI (Piper)',
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx.json',
    size: 63,
  },
};

export class PiperTTS {
  static #loaded = new Map(); // voiceId -> Promise<{ort, session, config, wasm, data}>

  /** Sudah pernah diunduh di browser ini? (untuk menampilkan peringatan ukuran unduhan) */
  static async isCached(voiceId = 'id_ID-news_tts-medium') {
    try { const c = await caches.open(CACHE_NAME); return !!(await c.match(PIPER_VOICES[voiceId].model)); } catch { return false; }
  }

  static load(voiceId = 'id_ID-news_tts-medium', onProgress = () => {}) {
    if (!PiperTTS.#loaded.has(voiceId)) {
      const p = (async () => {
        const v = PIPER_VOICES[voiceId];
        if (!v) throw new Error('Suara Piper tidak dikenal.');
        const prog = { model: 0, data: 0 };
        const report = () => onProgress(prog.model * 0.75 + prog.data * 0.25);
        const [ort, , config, modelBytes, wasm, data] = await Promise.all([
          loadScript(CDN.ort, 'ort'),
          loadScript(CDN.phonemizeJs, 'createPiperPhonemize'),
          fetchCached(v.config).then((b) => JSON.parse(new TextDecoder().decode(b))),
          fetchCached(v.model, (x) => { prog.model = x; report(); }),
          fetchCached(CDN.phonemizeWasm),
          fetchCached(CDN.phonemizeData, (x) => { prog.data = x; report(); }),
        ]);
        ort.env.wasm.wasmPaths = CDN.ortWasm;
        ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
        const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        const dataUrl = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
        return { ort, session, config, wasm, dataUrl };
      })();
      p.catch(() => PiperTTS.#loaded.delete(voiceId));
      PiperTTS.#loaded.set(voiceId, p);
    }
    return PiperTTS.#loaded.get(voiceId);
  }

  /** Teks → daftar ID fonem (espeak-ng versi WebAssembly). */
  static async #phonemeIds(eng, text) {
    const create = globalThis.createPiperPhonemize;
    const result = await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) reject(new Error('Pengubah teks ke fonem tidak merespons.')); }, 20000);
      create({
        wasmBinary: eng.wasm.buffer.slice(0),
        print: (line) => { try { const j = JSON.parse(line); done = true; clearTimeout(timer); resolve(j); } catch { /* baris lain */ } },
        printErr: (m) => console.warn('[piper]', m),
        locateFile: (u) => (u.endsWith('.data') ? eng.dataUrl : u.endsWith('.wasm') ? CDN.phonemizeWasm : u),
      }).then((mod) => {
        mod.callMain(['-l', eng.config.espeak?.voice || 'id', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
      }).catch((e) => { clearTimeout(timer); reject(e); });
    });
    // Utamakan peta fonem milik model (model Piper versi baru); bila tidak ada, pakai ID dari pustaka.
    const map = eng.config.phoneme_id_map;
    const phon = Array.isArray(result.phonemes) ? result.phonemes.flat(Infinity) : null;
    if (map && phon?.length) {
      const pad = map._?.[0] ?? 0, ids = [...(map['^'] || [1]), pad];
      for (const ph of [...phon.join('')]) { if (map[ph]) { ids.push(...map[ph], pad); } }
      ids.push(...(map.$ || [2]));
      return ids;
    }
    if (Array.isArray(result.phoneme_ids)) return result.phoneme_ids.flat(Infinity);
    throw new Error('Fonem tidak terbaca.');
  }

  /**
   * Teks → {blob, name, type} MP3.
   * @param {number} speed 0.7..1.4 (1 = normal)
   */
  static async synthesize(text, { voiceId = 'id_ID-news_tts-medium', speed = 1, pitch = 0, noise = null, onProgress = () => {}, onStatus = () => {} } = {}) {
    const clean = cleanForSpeech(text);
    if (!clean) throw new Error('Belum ada teks untuk dibacakan.');
    const cached = await PiperTTS.isCached(voiceId);
    onStatus(cached ? 'Menyiapkan suara AI…' : 'Mengunduh suara AI (sekali saja)…');
    const eng = await PiperTTS.load(voiceId, onProgress);
    const { ort, session, config } = eng;
    const inf = config.inference || {};
    const sentences = splitSentences(clean, 260);
    const pcm = [];
    // Nada: -10..+10 → faktor 2^(n/36). Dibuat dengan resampling; kecepatan dikompensasi di length_scale.
    const pf = Math.pow(2, (+pitch || 0) / 36);
    for (const [i, sent] of sentences.entries()) {
      onStatus(`Membuat suara ${i + 1}/${sentences.length}…`);
      const ids = await PiperTTS.#phonemeIds(eng, sent);
      const feeds = {
        input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([noise ?? inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / Math.max(0.5, speed / pf), inf.noise_w ?? 0.8]), [3]),
      };
      if ((config.num_speakers || 1) > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
      const out = await session.run(feeds);
      pcm.push(Float32Array.from((out.output || Object.values(out)[0]).data));
    }
    const rate = config.audio?.sample_rate || 22050;
    onStatus('Mengubah ke MP3…');
    let joined = joinPcm(pcm, rate);
    if (Math.abs(pf - 1) > 0.001) {
      const n = Math.floor(joined.length / pf), o = new Float32Array(n);
      for (let i = 0; i < n; i++) { const p = i * pf, a = Math.floor(p), f = p - a; o[i] = joined[a] * (1 - f) + (joined[Math.min(a + 1, joined.length - 1)] * f); }
      joined = o;
    }
    return pcmToMp3(joined, rate, 64);
  }
}

// ================================================================ 4) Microsoft Gadis/Ardi langsung dari browser (eksperimental)
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_GEC_VERSION = '1-143.0.3650.75';
const xmlEsc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export class EdgeDirectTTS {
  static async #gec() {
    let ticks = BigInt(Math.floor(Date.now() / 1000)) + 11644473600n;
    ticks -= ticks % 300n;
    ticks *= 10000000n;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ticks}${EDGE_TOKEN}`));
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  static #stamp() { return `${new Date().toUTCString().replace(/,/g, '')} GMT+0000 (Coordinated Universal Time)`; }
  static #uuid() { return (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^a-f0-9]/gi, '').slice(0, 32).padEnd(32, '0'); }

  static async #chunk(text, { voice, rate, pitch }) {
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}&Sec-MS-GEC=${await EdgeDirectTTS.#gec()}&Sec-MS-GEC-Version=${EDGE_GEC_VERSION}&ConnectionId=${EdgeDirectTTS.#uuid()}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      const audio = [];
      let finished = false;
      const fail = (msg) => { if (finished) return; finished = true; clearTimeout(timer); try { ws.close(); } catch { /* */ } reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Server suara Microsoft tidak menjawab (batas waktu).'), 30000);
      ws.onopen = () => {
        ws.send(`X-Timestamp:${EdgeDirectTTS.#stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
        const sign = (n, u) => `${n >= 0 ? '+' : ''}${Math.round(n)}${u}`;
        ws.send(`X-RequestId:${EdgeDirectTTS.#uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${EdgeDirectTTS.#stamp()}Z\r\nPath:ssml\r\n\r\n` +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='id-ID'><voice name='${voice}'><prosody pitch='${sign(pitch, 'Hz')}' rate='${sign(rate, '%')}' volume='+0%'>${xmlEsc(text)}</prosody></voice></speak>`);
      };
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          if (e.data.includes('Path:turn.end')) { finished = true; clearTimeout(timer); ws.close(); resolve(audio); }
          return;
        }
        const buf = new Uint8Array(e.data);
        if (buf.length < 2) return;
        const headLen = (buf[0] << 8) | buf[1];
        const head = new TextDecoder().decode(buf.subarray(2, 2 + headLen));
        if (head.includes('Path:audio')) { const body = buf.subarray(2 + headLen); if (body.length) audio.push(body); }
      };
      ws.onerror = () => fail('Sambungan langsung ke suara Microsoft gagal (ditolak Microsoft atau diblokir jaringan).');
      ws.onclose = () => { if (!finished) { if (audio.length) { finished = true; clearTimeout(timer); resolve(audio); } else fail('Sambungan ke server suara Microsoft terputus sebelum suara diterima.'); } };
    });
  }

  /** @returns {Promise<{blob, name, type}>} */
  static async synthesize(text, { voice = 'id-ID-GadisNeural', rate = 0, pitch = 0, onStatus = () => {} } = {}) {
    const clean = cleanForSpeech(text);
    if (!clean) throw new Error('Belum ada teks untuk dibacakan.');
    // Potong per ±1.500 huruf di batas kalimat.
    const chunks = [];
    let cur = '';
    for (const s of splitSentences(clean, 400)) { if ((cur + ' ' + s).length > 1500 && cur) { chunks.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s; }
    if (cur) chunks.push(cur);
    const parts = [];
    for (const [i, c] of chunks.entries()) {
      onStatus(chunks.length > 1 ? `Menghubungi Microsoft ${i + 1}/${chunks.length}…` : 'Menghubungi Microsoft…');
      parts.push(...await EdgeDirectTTS.#chunk(c, { voice, rate, pitch }));
    }
    if (!parts.length) throw new Error('Tidak ada suara yang diterima dari Microsoft.');
    return { blob: new Blob(parts, { type: 'audio/mpeg' }), name: 'narasi.mp3', type: 'audio/mpeg' };
  }
}
