/* ============================================================
   sfx.js — efek suara sintetis (tanpa file) — WebAudio
   Dipakai: course.js (paket SCORM), htmlinject.js (HTML Creator), Builder (tombol "coba").
   StudioSfx.presets()  → {id: function(ctx, waktu, volume)}  (fungsi mandiri; aman di-toString)
   StudioSfx.player()   → {play(id, vol), unlock()}  (membuat AudioContext saat pertama dipakai)
   ============================================================ */
(function (root) {
  'use strict';
  function presets() {
    function tone(c, t, type, f0, dur, vol, f1) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(c, t, dur, vol, f0, f1) {
      var n = Math.max(1, Math.floor(c.sampleRate * dur)), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), i;
      for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
      var s = c.createBufferSource(); s.buffer = b;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + dur + 0.02);
    }
    return {
      klik: function (c, t, v) { tone(c, t, 'square', 1100, 0.045, v * 0.22, 700); },
      pop: function (c, t, v) { tone(c, t, 'sine', 420, 0.09, v * 0.5, 980); },
      ding: function (c, t, v) { tone(c, t, 'sine', 1318, 0.55, v * 0.45); tone(c, t + 0.01, 'sine', 1976, 0.4, v * 0.15); },
      sukses: function (c, t, v) { [523, 659, 784, 1046].forEach(function (f, i) { tone(c, t + i * 0.09, 'triangle', f, 0.28, v * 0.4); }); },
      salah: function (c, t, v) { tone(c, t, 'sawtooth', 220, 0.28, v * 0.3, 110); tone(c, t + 0.14, 'sawtooth', 170, 0.3, v * 0.3, 85); },
      whoosh: function (c, t, v) { noise(c, t, 0.45, v * 0.7, 300, 3800); },
      tada: function (c, t, v) { [392, 523, 659, 784].forEach(function (f, i) { tone(c, t + i * 0.1, 'square', f, 0.2, v * 0.2); }); tone(c, t + 0.45, 'triangle', 1046, 0.7, v * 0.4); tone(c, t + 0.45, 'triangle', 784, 0.7, v * 0.3); },
      notif: function (c, t, v) { tone(c, t, 'sine', 880, 0.14, v * 0.4); tone(c, t + 0.15, 'sine', 1175, 0.28, v * 0.4); },
      koin: function (c, t, v) { tone(c, t, 'square', 988, 0.07, v * 0.22); tone(c, t + 0.07, 'square', 1319, 0.4, v * 0.22); },
      alarm: function (c, t, v) { for (var i = 0; i < 3; i++) { tone(c, t + i * 0.22, 'square', 880, 0.12, v * 0.25); tone(c, t + i * 0.22 + 0.11, 'square', 660, 0.1, v * 0.25); } }
    };
  }
  var LIST = [['klik', 'Klik'], ['pop', 'Pop'], ['ding', 'Ding'], ['sukses', 'Berhasil'], ['salah', 'Salah'], ['whoosh', 'Whoosh'], ['tada', 'Tada!'], ['notif', 'Notifikasi'], ['koin', 'Koin'], ['alarm', 'Alarm singkat']];
  function player() {
    var AC = null, P = null;
    function ctx() {
      if (!AC) { var A = root.AudioContext || root.webkitAudioContext; if (A) { try { AC = new A(); } catch (e) { AC = null; } } }
      if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) { /* abaikan */ } }
      return AC;
    }
    return {
      unlock: function () { ctx(); },
      play: function (id, vol) {
        var c = ctx(); P = P || presets(); if (!c || !P[id]) return;
        try { P[id](c, c.currentTime + 0.005, vol == null ? 0.8 : vol); } catch (e) { /* abaikan */ }
      }
    };
  }
  var api = { presets: presets, player: player, LIST: LIST };
  root.StudioSfx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
