/* ============================================================
   lipsync.js — gerak bibir karakter mengikuti TEKS dan SUARA narasi
   Bentuk mulut: '0' tertutup · '1' setengah terbuka (i, u, e) · '2' terbuka lebar (a, o)
   Jalur waktu = satu huruf per bingkai 40 ms (25 bingkai/detik).

   fromText(teks, detik)        → jalur dari teks saja (cadangan; tahu durasi audio saja sudah cukup)
   fromAudio(blob, teks)        → jalur dari irama suara asli + vokal dari teks (dibuat di Builder)
   wordFrames(kata, ms)         → jalur satu kata (untuk suara perangkat peserta)
   Dipakai course.js (paket) dan Builder.
   ============================================================ */
(function (root) {
  'use strict';
  var FPS = 25;
  var SHAPE = { a: 2, o: 2, e: 1, i: 1, u: 1 };

  /** Bersihkan teks narasi: buang tanda markdown, ubah angka jadi bunyi kasar. */
  function normalize(text) {
    return String(text || '').toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*_#>`~|\[\]()]/g, ' ')
      .replace(/(\d)/g, 'a');
  }

  /** Teks → daftar token {s: bentuk mulut, w: bobot waktu}. */
  function tokens(text) {
    var t = normalize(text), out = [], i, ch;
    for (i = 0; i < t.length; i++) {
      ch = t.charAt(i);
      if (SHAPE[ch]) out.push({ s: SHAPE[ch], w: 1 });
      else if (ch >= 'a' && ch <= 'z') out.push({ s: (ch === 'm' || ch === 'b' || ch === 'p') ? 0 : 1, w: 0.55, c: 1 });
      else if (ch === ',' || ch === ';' || ch === ':') out.push({ s: 0, w: 3.5 });
      else if (ch === '.' || ch === '!' || ch === '?') out.push({ s: 0, w: 6 });
      else if (ch === '\n') out.push({ s: 0, w: 4 });
      else if (ch === ' ' || ch === '-' || ch === '/') out.push({ s: 0, w: 0.7 });
    }
    return out;
  }

  /** Jalur mulut dari teks, disebar rata sepanjang `detik`. */
  function fromText(text, seconds) {
    var tk = tokens(text), total = 0, i;
    var frames = Math.max(0, Math.round((seconds || 0) * FPS));
    var voiced = 0;
    for (i = 0; i < tk.length; i++) if (tk[i].s) voiced++;
    if (!voiced || !frames) return '';
    for (i = 0; i < tk.length; i++) total += tk[i].w;
    var out = new Array(frames), ends = [], acc = 0;
    for (i = 0; i < tk.length; i++) { acc += tk[i].w; ends.push(acc); }
    // Tiap bingkai ditentukan oleh huruf yang sedang diucapkan pada titik tengah bingkai itu.
    var ti = 0;
    for (var f = 0; f < frames; f++) {
      var tpos = (f + 0.5) / frames * total;
      while (ti < tk.length - 1 && ends[ti] < tpos) ti++;
      out[f] = tk[ti].s;
    }
    return out.join('');
  }

  /** Jalur satu kata (dipakai saat suara perangkat memberi tahu batas kata). */
  function wordFrames(word, ms) {
    var tk = tokens(word);
    if (!tk.length) return '';
    var dur = (ms || tk.length * 70) / 1000;
    return fromText(word, Math.max(dur, 0.12));
  }

  /** Daftar bentuk vokal dari teks, dikelompokkan per suku kata kasar (vokal berurutan = satu). */
  function vowelShapes(text) {
    var t = normalize(text), out = [], prev = false;
    for (var i = 0; i < t.length; i++) {
      var s = SHAPE[t.charAt(i)];
      if (s) { if (!prev) out.push(s); else if (s > out[out.length - 1]) out[out.length - 1] = s; prev = true; } else prev = false;
    }
    return out;
  }

  /** Jalur mulut dari irama suara asli; bentuk vokal diambil dari teks. Mengembalikan '' bila gagal. */
  function fromAudio(blob, text) {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC || !blob || !blob.arrayBuffer) return Promise.resolve('');
    var ctx;
    return blob.arrayBuffer().then(function (buf) {
      ctx = new AC();
      return new Promise(function (res, rej) { var p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    }).then(function (ab) {
      var ch = ab.getChannelData(0), sr = ab.sampleRate, hop = Math.max(1, Math.round(sr / FPS));
      var n = Math.floor(ch.length / hop), env = new Float32Array(n), i, j;
      for (i = 0; i < n; i++) { var sum = 0; for (j = 0; j < hop; j++) { var v = ch[i * hop + j]; sum += v * v; } env[i] = Math.sqrt(sum / hop); }
      var sorted = Array.prototype.slice.call(env).sort(function (a, b) { return a - b; });
      var ref = sorted[Math.floor(sorted.length * 0.95)] || 0;
      if (ref < 0.003) return '';
      var e = new Float32Array(n);
      for (i = 0; i < n; i++) e[i] = Math.min(1, env[i] / ref);
      var voiced = [];
      for (i = 0; i < n; i++) if (e[i] > 0.12) voiced.push(i);
      if (!voiced.length) return '';
      var V = vowelShapes(text), out = new Array(n);
      for (i = 0; i < n; i++) out[i] = 0;
      for (var r = 0; r < voiced.length; r++) {
        var idx = voiced[r], lvl = e[idx], shape;
        if (V.length) shape = V[Math.min(V.length - 1, Math.floor(r / voiced.length * V.length))];
        else shape = lvl > 0.55 ? 2 : 1;
        if (lvl < 0.2) shape = Math.min(shape, 1);
        // lembah di antara suku kata (konsonan): mulut menutup sebentar
        var a = e[Math.max(0, idx - 2)], b = e[Math.min(n - 1, idx + 2)];
        if (lvl < 0.55 * ((a + b) / 2)) shape = lvl < 0.3 ? 0 : Math.min(shape, 1);
        out[idx] = shape;
      }
      try { ctx.close(); } catch (x) { /* abaikan */ }
      var s = out.join('');
      return s.replace(/0+$/, '');
    }).catch(function () { try { ctx && ctx.close(); } catch (x) { /* abaikan */ } return ''; });
  }

  var api = { FPS: FPS, fromText: fromText, fromAudio: fromAudio, wordFrames: wordFrames, tokens: tokens, vowelShapes: vowelShapes };
  root.StudioLip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
