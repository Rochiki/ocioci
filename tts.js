// ============================================================
// tts.js — suara untuk Builder. Tiga jalur, semuanya gratis:
//
// 1. BrowserTTS  — suara bawaan perangkat (Web Speech API).
//    Langsung jalan tanpa pemasangan apa pun. Di paket SCORM, narasi
//    dibacakan oleh perangkat peserta saat kursus dibuka.
// 2. Recorder    — rekam suara Anda sendiri lewat mikrofon.
// 3. EdgeTTS     — MP3 suara natural (id-ID-GadisNeural / ArdiNeural)
//    lewat server kecil main.py (bisa dipasang gratis di Hugging Face).
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
