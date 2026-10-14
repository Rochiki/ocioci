/* ============================================================
   course.js — mesin kursus (ikut di dalam paket SCORM)
   Membaca window.COURSE_DATA, menampilkan 8 jenis slide, memutar
   narasi, menilai kuis, dan melapor ke LMS lewat window.ScormAPI.

   Jenis slide: content (materi), image (gambar/GIF), video, html,
   flip (kartu balik), hotspot (gambar interaktif / cari bahaya),
   quiz (pilihan ganda, banyak jawaban, benar/salah), sort (urutkan).

   Mode pratinjau (window.STUDIO_PREVIEW): data dikirim Builder lewat
   postMessage, tidak ada yang disimpan.
   ============================================================ */
(function () {
  'use strict';
  var PREVIEW = !!window.STUDIO_PREVIEW;
  var S = window.ScormAPI;
  var app = document.getElementById('app');
  var C = null, slides = [], state = null, closed = false;
  var audio = new Audio();
  var speaking = false, narrationOn = false, captionsOn = false;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ ikon (SVG kecil)
  var ICON = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    prev: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    sound: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10.5a2 2 0 100 3M16 10.5a2 2 0 100 3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    grip: '<circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 21l5-3 5 3-1.5-7"/>',
    retry: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>',
    print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }

  // ------------------------------------------------------------ util
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
  }
  /** Markdown mini: ## judul, paragraf, daftar "- " dan "1. ", **tebal**, *miring*, [link](url). */
  function md(text) {
    return String(text || '').split(/\n\s*\n/).map(function (b) {
      var lines = b.trim().split('\n');
      if (!b.trim()) return '';
      if (lines.length === 1 && /^#{2,3}\s+/.test(lines[0])) return '<h3>' + inline(lines[0].replace(/^#+\s+/, '')) + '</h3>';
      if (lines.every(function (l) { return /^\s*[-•*]\s+/.test(l); })) {
        return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-•*]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      }
      if (lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); })) {
        return '<ol>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; }).join('') + '</ol>';
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
  function plain(text) { return String(text || '').replace(/[#*_>`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*[-•]\s+/gm, ''); }
  function letter(i) { return 'abcdefghijklmnopqrstuvwxyz'.charAt(i); }
  function $(sel, root) { return (root || app).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || app).querySelectorAll(sel)); }
  /** Acak deterministik (selalu sama untuk id yang sama) supaya urutan tidak berubah saat resume. */
  function seededOrder(n, seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    var idx = []; for (var k = 0; k < n; k++) idx.push(k);
    for (var j = n - 1; j > 0; j--) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      var r = Math.abs(h) % (j + 1); var t = idx[j]; idx[j] = idx[r]; idx[r] = t;
    }
    return idx;
  }
  function sameSet(a, b) { if (a.length !== b.length) return false; var x = a.slice().sort(), y = b.slice().sort(); return x.every(function (v, i) { return v === y[i]; }); }

  // ------------------------------------------------------------ tema
  function applyTheme() {
    var t = C.theme || {};
    var r = document.documentElement.style;
    var map = { accent: '--accent', accent2: '--accent-2', onAccent: '--on-accent', bg: '--bg', surface: '--surface', ink: '--ink', muted: '--muted', line: '--line' };
    Object.keys(map).forEach(function (k) { if (t[k]) r.setProperty(map[k], t[k]); });
    var fonts = {
      modern: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      klasik: 'Georgia, "Times New Roman", "Noto Serif", serif',
      bulat: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Trebuchet MS", "Segoe UI", sans-serif',
    };
    r.setProperty('--font', fonts[t.font] || fonts.modern);
    document.documentElement.setAttribute('data-anim', reduceMotion ? 'none' : (t.transition || 'geser'));
    document.title = C.title || 'Kursus';
  }

  // ------------------------------------------------------------ status & penilaian
  function freshState() { return { i: 0, v: [], a: {}, d: {}, f: {}, h: {}, w: {}, g: {} }; }
  function graded() { return slides.filter(function (s) { return (s.type === 'quiz' && s.questions && s.questions.length) || (s.type === 'sort' && s.items && s.items.length > 1); }); }
  function points() {
    var total = 0, right = 0;
    graded().forEach(function (s) {
      if (s.type === 'quiz') s.questions.forEach(function (q) { total++; if (isRight(q, state.a[q.id])) right++; });
      else { total++; if (sortRight(s, state.a[s.id])) right++; }
    });
    return { total: total, right: right, percent: total ? (right / total) * 100 : 0 };
  }
  function isRight(q, ans) { return !!ans && sameSet(ans, q.correct || []); }
  function sortRight(s, order) { return !!order && order.every(function (v, i) { return v === i; }); }
  function allGradedDone() { return graded().every(function (s) { return state.d[s.id]; }); }

  function isDone(s) {
    var idx = slides.indexOf(s);
    if (state.v.indexOf(idx) === -1) return false;
    switch (s.type) {
      case 'quiz': case 'sort': return !!state.d[s.id];
      case 'video': return !(s.mustWatch && s.video) || !!state.w[s.id];
      case 'flip': return !s.requireAll || (state.f[s.id] || []).length >= (s.cards || []).length;
      case 'hotspot':
        if (s.mode === 'cari') return !!state.g[s.id] || (state.h[s.id] || []).length >= (s.points || []).length;
        return !s.requireAll || (state.h[s.id] || []).length >= (s.points || []).length;
      default: return true;
    }
  }
  function courseFinished() { return slides.every(isDone); }

  function evaluate() {
    S.setProgress(slides.filter(isDone).length / Math.max(1, slides.length));
    if (graded().length) {
      if (allGradedDone()) { var p = points(); S.setScore(p.percent, p.percent >= C.passingScore); }
      else S.setIncomplete();
    } else if (courseFinished()) S.setCompleted();
    else S.setIncomplete();
  }
  function save() {
    if (PREVIEW) return;
    S.setLocation(String(state.i));
    var data = JSON.stringify(state);
    if (S.version === '1.2' && data.length > 4000) {
      data = JSON.stringify({ i: state.i, v: state.v, d: state.d, w: state.w, g: state.g, a: state.a, f: {}, h: {} });
      if (data.length > 4000) data = JSON.stringify({ i: state.i, v: state.v, d: state.d, w: state.w, g: state.g, a: {}, f: {}, h: {} });
    }
    S.setSuspend(data);
    S.commit();
  }

  // ------------------------------------------------------------ narasi
  function pickVoice() {
    if (!window.speechSynthesis) return null;
    var all = speechSynthesis.getVoices();
    var want = C.narration && C.narration.voiceName;
    var v = want && all.filter(function (x) { return x.name === want; })[0];
    if (v) return v;
    var id = all.filter(function (x) { return /^id|^in[-_]/i.test(x.lang); });
    id.sort(function (a, b) { return (/natural|neural|online/i.test(b.name) ? 1 : 0) - (/natural|neural|online/i.test(a.name) ? 1 : 0); });
    return id[0] || null;
  }
  function narrationText(s) {
    if (s.narration && s.narration.trim()) return s.narration;
    var parts = [s.title];
    if (s.type === 'content') parts.push(plain(s.body));
    if (s.caption) parts.push(s.caption);
    if (s.intro) parts.push(plain(s.intro));
    if (s.type === 'quiz') (s.questions || []).forEach(function (q, i) { parts.push('Soal ' + (i + 1) + '. ' + q.text); });
    return parts.filter(Boolean).join('. ');
  }
  function canNarrate(s) { return !!s.audio || (C.narration && C.narration.browser && !!window.speechSynthesis); }
  function stopNarration() {
    try { audio.pause(); } catch (e) {}
    if (window.speechSynthesis) speechSynthesis.cancel();
    speaking = false; narrationOn = false; syncVoiceBtn();
  }
  function syncVoiceBtn() {
    var b = $('#btnVoice'); if (!b) return;
    b.innerHTML = narrationOn ? icon('stop') : icon('sound');
    b.setAttribute('aria-label', narrationOn ? 'Hentikan narasi' : 'Putar narasi');
    b.classList.toggle('on', narrationOn);
  }
  function startNarration() {
    var s = slides[state.i];
    if (!s) return;
    if (s.audio) {
      if (audio.getAttribute('data-src') !== s.audio) { audio.src = s.audio; audio.setAttribute('data-src', s.audio); }
      else audio.currentTime = 0;
      narrationOn = true; syncVoiceBtn();
      audio.onended = function () { narrationOn = false; syncVoiceBtn(); };
      var p = audio.play();
      if (p && p.catch) p.catch(function () { narrationOn = false; syncVoiceBtn(); });
      return;
    }
    if (!(C.narration && C.narration.browser) || !window.speechSynthesis) return;
    var parts = narrationText(s).replace(/([.!?])\s+/g, '$1\n').split(/\n+/).filter(Boolean);
    var voice = pickVoice();
    var rate = (C.narration && C.narration.rate) || 1;
    speaking = true; narrationOn = true; syncVoiceBtn();
    (function next() {
      if (!speaking) return;
      if (!parts.length) { speaking = false; narrationOn = false; syncVoiceBtn(); return; }
      var u = new SpeechSynthesisUtterance(parts.shift());
      u.lang = voice ? voice.lang : 'id-ID'; if (voice) u.voice = voice; u.rate = rate;
      u.onend = next; u.onerror = function () { speaking = false; narrationOn = false; syncVoiceBtn(); };
      speechSynthesis.speak(u);
    })();
  }
  function toggleNarration() { if (narrationOn) stopNarration(); else startNarration(); }

  // ------------------------------------------------------------ kerangka layar
  function header() {
    var pct = Math.round(((state.i + 1) / slides.length) * 100);
    var s = slides[state.i];
    return '<header class="bar">' +
      '<button class="icon-btn" id="btnMenu" aria-label="Daftar isi" aria-expanded="false">' + icon('menu') + '</button>' +
      (C.logo ? '<img class="logo" src="' + esc(C.logo) + '" alt="">' : '') +
      '<div class="bar-title"><span class="course">' + esc(C.title) + '</span><span class="count">Bagian ' + (state.i + 1) + ' dari ' + slides.length + '</span></div>' +
      (canNarrate(s) ? '<button class="icon-btn" id="btnVoice" aria-label="Putar narasi">' + icon('sound') + '</button>' : '') +
      (canNarrate(s) ? '<button class="icon-btn" id="btnCC" aria-label="Teks narasi" aria-pressed="' + captionsOn + '">' + icon('cc') + '</button>' : '') +
      '<div class="track" role="progressbar" aria-label="Kemajuan" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><div style="width:' + pct + '%"></div></div>' +
      '</header>';
  }
  function locked(idx) {
    if (C.navigation !== 'berurutan') return false;
    for (var k = 0; k < idx; k++) if (!isDone(slides[k])) return true;
    return false;
  }
  function drawer() {
    return '<nav class="drawer" id="drawer" aria-label="Daftar isi" hidden><div class="drawer-head"><strong>Daftar isi</strong>' +
      '<button class="icon-btn" id="btnCloseMenu" aria-label="Tutup">' + icon('x') + '</button></div><ol>' +
      slides.map(function (s, k) {
        var lock = locked(k), done = isDone(s);
        return '<li><button data-go="' + k + '"' + (lock ? ' disabled' : '') + (k === state.i ? ' aria-current="true"' : '') + '>' +
          '<span class="dot ' + (done ? 'done' : '') + '">' + (done ? icon('check') : lock ? icon('lock') : (k + 1)) + '</span>' +
          '<span>' + esc(s.title || 'Bagian ' + (k + 1)) + '</span></button></li>';
      }).join('') + '</ol></nav><div class="scrim" id="scrim" hidden></div>';
  }
  function footer() {
    var last = state.i === slides.length - 1;
    var cur = slides[state.i];
    var blocked = C.navigation === 'berurutan' && !isDone(cur);
    return '<footer class="nav">' +
      '<button class="btn" id="btnPrev"' + (state.i === 0 ? ' disabled' : '') + '>' + icon('prev') + '<span>Sebelumnya</span></button>' +
      '<span class="hint" id="navHint">' + (blocked ? esc(blockHint(cur)) : '') + '</span>' +
      (last ? '<button class="btn primary" id="btnDone"' + (blocked ? ' disabled' : '') + '><span>Selesai</span>' + icon('check') + '</button>'
        : '<button class="btn primary" id="btnNext"' + (blocked ? ' disabled' : '') + '><span>Berikutnya</span>' + icon('next') + '</button>') +
      '</footer>';
  }
  function blockHint(s) {
    return { quiz: 'Kirim jawaban dulu untuk lanjut', sort: 'Kirim urutan dulu untuk lanjut', video: 'Tonton video sampai selesai', flip: 'Balik semua kartu dulu', hotspot: 'Temukan semua titik dulu' }[s.type] || '';
  }
  function refreshNav() {
    var cur = slides[state.i];
    var blocked = C.navigation === 'berurutan' && !isDone(cur);
    var n = $('#btnNext') || $('#btnDone');
    if (n) n.disabled = blocked;
    var h = $('#navHint'); if (h) h.textContent = blocked ? blockHint(cur) : '';
  }

  function show(i, opts) {
    opts = opts || {};
    stopNarration();
    if (!PREVIEW && locked(i)) return;
    state.i = Math.max(0, Math.min(slides.length - 1, i));
    if (state.v.indexOf(state.i) === -1) state.v.push(state.i);
    var s = slides[state.i];
    var r = RENDER[s.type] || RENDER.content;
    var dir = opts.dir || 'maju';
    app.innerHTML = header() + drawer() +
      '<main class="slide type-' + esc(s.type) + ' enter-' + dir + '" id="slide" tabindex="-1">' + r.html(s) +
      '<aside class="captions" id="captions"' + (captionsOn ? '' : ' hidden') + '><strong>Teks narasi</strong><p>' + esc(narrationText(s)) + '</p></aside></main>' +
      footer();
    bindFrame();
    if (r.bind) r.bind(s, $('#slide'));
    if (!opts.noFocus) { var sl = $('#slide'); if (sl) sl.focus({ preventScroll: true }); }
    evaluate(); save();
    if (opts.autoplay !== false && C.narration && C.narration.autoplay && canNarrate(s) && !PREVIEW) startNarration();
  }

  function bindFrame() {
    var go = function (d) { return function () { show(state.i + d, { dir: d > 0 ? 'maju' : 'mundur' }); }; };
    var p = $('#btnPrev'); if (p) p.onclick = go(-1);
    var n = $('#btnNext'); if (n) n.onclick = go(1);
    var d = $('#btnDone'); if (d) d.onclick = renderEnd;
    var v = $('#btnVoice'); if (v) v.onclick = toggleNarration;
    var cc = $('#btnCC'); if (cc) cc.onclick = function () {
      captionsOn = !captionsOn; cc.setAttribute('aria-pressed', String(captionsOn));
      var c = $('#captions'); if (c) c.hidden = !captionsOn;
    };
    var dr = $('#drawer'), sc = $('#scrim'), mb = $('#btnMenu');
    var open = function (o) { dr.hidden = !o; sc.hidden = !o; mb.setAttribute('aria-expanded', String(o)); if (o) { var f = dr.querySelector('button:not([disabled])'); if (f) f.focus(); } };
    mb.onclick = function () { open(dr.hidden); };
    $('#btnCloseMenu').onclick = function () { open(false); mb.focus(); };
    sc.onclick = function () { open(false); };
    $$('[data-go]', dr).forEach(function (b) { b.onclick = function () { var k = +b.getAttribute('data-go'); show(k, { dir: k >= state.i ? 'maju' : 'mundur' }); }; });
  }
  function markProgress() { evaluate(); save(); refreshNav(); }

  // ------------------------------------------------------------ jenis slide
  var RENDER = {};

  RENDER.content = {
    html: function (s) {
      var layout = s.image ? (s.layout || 'atas') : 'teks';
      var title = '<h2>' + esc(s.title) + '</h2>';
      var body = '<div class="body">' + md(s.body) + '</div>';
      var fig = s.image ? '<figure class="media"><img src="' + esc(s.image) + '" alt="' + esc(s.imageAlt || '') + '"></figure>' : '';
      if (layout === 'latar') {
        return '<section class="hero-bg" style="background-image:url(\'' + esc(s.image).replace(/'/g, '%27') + '\')"><div class="hero-card">' + title + body + '</div></section>';
      }
      if (layout === 'kiri' || layout === 'kanan') {
        return '<div class="content layout-' + layout + '">' + fig + '<div class="col">' + title + body + '</div></div>';
      }
      return '<div class="content layout-' + layout + '">' + title + fig + body + '</div>';
    },
  };

  RENDER.image = {
    html: function (s) {
      return '<h2>' + esc(s.title) + '</h2><figure class="full fit-' + esc(s.fit || 'contain') + '">' +
        (s.image ? '<img src="' + esc(s.image) + '" alt="' + esc(s.imageAlt || s.caption || s.title || '') + '">' : '<div class="empty-media">Belum ada gambar</div>') +
        (s.caption ? '<figcaption>' + inline(s.caption) + '</figcaption>' : '') + '</figure>';
    },
  };

  function embedUrl(url) {
    var m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
    if (m) return { kind: 'iframe', src: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0' };
    m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url || '');
    if (m) return { kind: 'iframe', src: 'https://player.vimeo.com/video/' + m[1] };
    m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url || '');
    if (m) return { kind: 'iframe', src: 'https://drive.google.com/file/d/' + m[1] + '/preview' };
    if (/\.(mp4|webm|ogv|mov)(\?|$)/i.test(url || '')) return { kind: 'video', src: url };
    return url ? { kind: 'iframe', src: url } : null;
  }

  RENDER.video = {
    html: function (s) {
      var inner;
      if (s.video) {
        inner = '<video id="vid" controls playsinline preload="metadata" src="' + esc(s.video) + '"' + (s.poster ? ' poster="' + esc(s.poster) + '"' : '') + '></video>';
      } else {
        var e = embedUrl(s.url);
        inner = !e ? '<div class="empty-media">Belum ada video</div>'
          : e.kind === 'video' ? '<video id="vid" controls playsinline preload="metadata" src="' + esc(e.src) + '"></video>'
            : '<iframe src="' + esc(e.src) + '" title="' + esc(s.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      }
      var need = s.mustWatch && s.video;
      return '<h2>' + esc(s.title) + '</h2><div class="video-wrap">' + inner + '</div>' +
        (s.caption ? '<div class="body">' + md(s.caption) + '</div>' : '') +
        (need ? '<p class="status-line" id="watchStatus">' + (state.w[s.id] ? icon('check') + ' Video sudah ditonton' : 'Tonton video sampai selesai untuk melanjutkan.') + '</p>' : '');
    },
    bind: function (s, root) {
      var v = $('#vid', root);
      if (!v || !(s.mustWatch && s.video)) return;
      var maxT = 0;
      v.addEventListener('timeupdate', function () { if (!v.seeking && v.currentTime > maxT && v.currentTime - maxT < 2) maxT = v.currentTime; });
      v.addEventListener('seeking', function () { if (!state.w[s.id] && v.currentTime > maxT + 1.5) v.currentTime = maxT; });
      var done = function () {
        if (state.w[s.id]) return;
        state.w[s.id] = 1;
        var st = $('#watchStatus', root); if (st) st.innerHTML = icon('check') + ' Video sudah ditonton';
        markProgress();
      };
      v.addEventListener('ended', done);
    },
  };

  RENDER.html = {
    html: function (s) {
      var h = Math.max(240, Math.min(2000, +s.height || 560));
      var frame = s.src ? '<iframe id="htmlFrame" src="' + esc(s.src) + '" title="' + esc(s.title) + '" style="height:' + h + 'px" allow="fullscreen; autoplay" allowfullscreen></iframe>'
        : s.srcdoc != null ? '<iframe id="htmlFrame" srcdoc="' + esc(s.srcdoc) + '" title="' + esc(s.title) + '" style="height:' + h + 'px" allow="fullscreen; autoplay" allowfullscreen></iframe>'
          : '<div class="empty-media">' + esc(s.placeholder || 'Konten HTML belum diisi') + '</div>';
      return (s.hideTitle ? '' : '<h2>' + esc(s.title) + '</h2>') + '<div class="html-wrap">' + frame +
        '<button class="btn small" id="btnFull">' + icon('full') + '<span>Layar penuh</span></button></div>' +
        (s.caption ? '<div class="body">' + md(s.caption) + '</div>' : '');
    },
    bind: function (s, root) {
      var b = $('#btnFull', root), f = $('#htmlFrame', root);
      if (!b) return;
      if (!f || !(f.requestFullscreen || f.webkitRequestFullscreen)) { b.hidden = true; return; }
      b.onclick = function () { (f.requestFullscreen || f.webkitRequestFullscreen).call(f); };
    },
  };

  RENDER.flip = {
    html: function (s) {
      var flipped = state.f[s.id] || [];
      return '<h2>' + esc(s.title) + '</h2>' + (s.intro ? '<div class="body">' + md(s.intro) + '</div>' : '') +
        '<p class="status-line" id="flipCount">Dibalik ' + flipped.length + ' dari ' + (s.cards || []).length + ' kartu' + (s.requireAll ? ' — balik semua untuk lanjut' : '') + '</p>' +
        '<div class="cards">' + (s.cards || []).map(function (c, k) {
          var on = flipped.indexOf(k) > -1;
          return '<button class="card' + (on ? ' flipped' : '') + '" data-card="' + k + '" aria-pressed="' + on + '">' +
            '<span class="face front">' + (c.image ? '<img src="' + esc(c.image) + '" alt="">' : '') + '<span>' + esc(c.front) + '</span><small>Ketuk untuk membalik</small></span>' +
            '<span class="face back"><span>' + inline(c.back) + '</span></span></button>';
        }).join('') + '</div>';
    },
    bind: function (s, root) {
      $$('[data-card]', root).forEach(function (b) {
        b.onclick = function () {
          var k = +b.getAttribute('data-card');
          var on = !b.classList.contains('flipped');
          b.classList.toggle('flipped', on); b.setAttribute('aria-pressed', String(on));
          var list = state.f[s.id] || (state.f[s.id] = []);
          if (list.indexOf(k) === -1) list.push(k);
          var c = $('#flipCount', root); if (c) c.textContent = 'Dibalik ' + list.length + ' dari ' + s.cards.length + ' kartu' + (s.requireAll ? ' — balik semua untuk lanjut' : '');
          markProgress();
        };
      });
    },
  };

  RENDER.hotspot = {
    html: function (s) {
      var found = state.h[s.id] || [];
      var seek = s.mode === 'cari';
      var gave = !!state.g[s.id];
      var pts = s.points || [];
      return '<h2>' + esc(s.title) + '</h2>' + (s.intro ? '<div class="body">' + md(s.intro) + '</div>' : '') +
        '<p class="status-line" id="hsCount">' + (seek ? 'Ditemukan ' + found.length + ' dari ' + pts.length + ' — ketuk bagian gambar yang menurut Anda berbahaya.' : 'Ketuk setiap titik untuk melihat penjelasan (' + found.length + '/' + pts.length + ').') + '</p>' +
        '<div class="hotspot' + (seek ? ' seek' : '') + '" id="hsBox">' + (s.image ? '<img src="' + esc(s.image) + '" alt="' + esc(s.imageAlt || s.title) + '" draggable="false">' : '<div class="empty-media">Belum ada gambar</div>') +
        pts.map(function (p, k) {
          var show = !seek || gave || found.indexOf(k) > -1;
          var ok = found.indexOf(k) > -1;
          return '<button class="pin' + (ok ? ' found' : '') + '" data-pin="' + k + '" style="left:' + (+p.x) + '%;top:' + (+p.y) + '%"' + (show ? '' : ' hidden') + ' aria-label="' + esc(p.title || 'Titik ' + (k + 1)) + '">' + (ok && seek ? icon('check') : (k + 1)) + '</button>';
        }).join('') + '<div class="pop" id="hsPop" hidden role="dialog" aria-live="polite"></div></div>' +
        (seek ? '<div class="row-actions"><span class="miss" id="hsMiss" aria-live="polite"></span><button class="btn small" id="btnGiveUp"' + (gave || found.length >= pts.length ? ' hidden' : '') + '>' + icon('eye') + '<span>Tampilkan semua</span></button></div>' : '');
    },
    bind: function (s, root) {
      var box = $('#hsBox', root), pop = $('#hsPop', root), pts = s.points || [];
      var seek = s.mode === 'cari';
      var list = function () { return state.h[s.id] || (state.h[s.id] = []); };
      var count = function () {
        var c = $('#hsCount', root), f = list();
        if (c) c.textContent = seek ? 'Ditemukan ' + f.length + ' dari ' + pts.length + (f.length >= pts.length ? ' — hebat, semua ketemu!' : ' — ketuk bagian gambar yang menurut Anda berbahaya.') : 'Ketuk setiap titik untuk melihat penjelasan (' + f.length + '/' + pts.length + ').';
      };
      var openPop = function (k) {
        var p = pts[k];
        pop.innerHTML = '<strong>' + esc(p.title || 'Titik ' + (k + 1)) + '</strong><p>' + inline(p.text || '') + '</p><button class="icon-btn" aria-label="Tutup">' + icon('x') + '</button>';
        pop.hidden = false;
        // Posisi dalam piksel agar kotak penjelasan tidak keluar dari gambar (penting di layar HP).
        var W = box.clientWidth, H = box.clientHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
        var left = Math.min(Math.max(+p.x / 100 * W - pw / 2, 6), Math.max(6, W - pw - 6));
        var above = +p.y > 55;
        var top = above ? +p.y / 100 * H - ph - 22 : +p.y / 100 * H + 22;
        pop.style.left = left + 'px';
        pop.style.top = Math.max(6, Math.min(top, H - 6)) + 'px';
        pop.querySelector('button').onclick = function (e) { e.stopPropagation(); pop.hidden = true; };
      };
      var reveal = function (k) {
        var f = list();
        if (f.indexOf(k) === -1) f.push(k);
        var b = box.querySelector('[data-pin="' + k + '"]');
        b.hidden = false; b.classList.add('found');
        if (seek) b.innerHTML = icon('check');
        openPop(k); count();
        if (seek && f.length >= pts.length) { var g = $('#btnGiveUp', root); if (g) g.hidden = true; celebrate(0.4); }
        markProgress();
      };
      $$('[data-pin]', box).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); reveal(+b.getAttribute('data-pin')); }; });
      if (seek && box) {
        var misses = 0;
        box.addEventListener('click', function (e) {
          if (e.target.closest('.pop')) return;
          var r = box.getBoundingClientRect();
          var x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
          var best = -1, bestD = 1e9, rad = +s.radius || 9;
          pts.forEach(function (p, k) { var dx = (x - p.x), dy = (y - p.y) * (r.height / r.width); var d = Math.sqrt(dx * dx + dy * dy); if (d < bestD) { bestD = d; best = k; } });
          if (best > -1 && bestD <= rad) { reveal(best); return; }
          misses++;
          var m = document.createElement('span'); m.className = 'ripple'; m.style.left = x + '%'; m.style.top = y + '%';
          box.appendChild(m); setTimeout(function () { m.remove(); }, 700);
          var ms = $('#hsMiss', root); if (ms) ms.textContent = 'Bukan di situ (' + misses + 'x meleset)';
        });
        var g = $('#btnGiveUp', root);
        if (g) g.onclick = function () {
          state.g[s.id] = 1;
          $$('[data-pin]', box).forEach(function (b) { b.hidden = false; });
          g.hidden = true; markProgress();
        };
      }
    },
  };

  RENDER.quiz = {
    html: function (s) {
      var done = !!state.d[s.id];
      var html = '<h2>' + esc(s.title) + '</h2>' + (s.intro ? '<div class="body">' + md(s.intro) + '</div>' : '');
      (s.questions || []).forEach(function (q, qi) {
        var ans = state.a[q.id] || [];
        var type = q.type || 'single';
        var order = s.shuffle && type !== 'tf' ? seededOrder(q.options.length, q.id) : q.options.map(function (_, k) { return k; });
        var right = done && isRight(q, ans);
        html += '<fieldset class="q q-' + type + (done ? (right ? ' is-right' : ' is-wrong') : '') + '" data-q="' + esc(q.id) + '"><legend><span class="qn">' + (qi + 1) + '</span>' + esc(q.text) + '</legend>' +
          (type === 'multi' ? '<p class="qhint">Pilih semua jawaban yang benar.</p>' : '') + '<div class="opts">';
        order.forEach(function (oi) {
          var checked = ans.indexOf(oi) > -1;
          var cls = '';
          if (done) cls = (q.correct || []).indexOf(oi) > -1 ? ' right' : checked ? ' wrong' : '';
          html += '<label class="opt' + cls + '"><input type="' + (type === 'multi' ? 'checkbox' : 'radio') + '" name="' + esc(q.id) + '" value="' + oi + '"' +
            (checked ? ' checked' : '') + (done ? ' disabled' : '') + '><span class="mark"></span><span class="txt">' + esc(q.options[oi]) + '</span></label>';
        });
        html += '</div>';
        if (done) html += '<p class="feedback">' + (right ? icon('check') + ' Benar. ' : icon('x') + ' Belum tepat. ') + esc(q.feedback || '') + '</p>';
        html += '</fieldset>';
      });
      return html + '<div class="quiz-actions" id="quizActions" aria-live="polite">' + (done ? resultBox() : '<button class="btn primary" id="btnSubmit">Kirim jawaban</button><span class="msg" id="quizMsg"></span>') + '</div>';
    },
    bind: function (s, root) {
      $$('input', root).forEach(function (inp) {
        inp.onchange = function () {
          var q = s.questions.filter(function (x) { return x.id === inp.name; })[0];
          if ((q.type || 'single') === 'multi') {
            state.a[q.id] = $$('input[name="' + cssEsc(q.id) + '"]:checked', root).map(function (x) { return +x.value; });
          } else state.a[q.id] = [+inp.value];
          save();
        };
      });
      var sub = $('#btnSubmit', root);
      if (sub) sub.onclick = function () {
        var missing = s.questions.filter(function (q) { return !(state.a[q.id] && state.a[q.id].length); }).length;
        if (missing) { $('#quizMsg', root).textContent = 'Masih ada ' + missing + ' soal yang belum dijawab.'; return; }
        state.d[s.id] = 1;
        s.questions.forEach(function (q) {
          var tf = q.type === 'tf';
          S.recordInteraction({
            id: q.id, description: q.text, type: tf ? 'true-false' : 'choice',
            response: tf ? [state.a[q.id][0] === 0] : state.a[q.id].slice().sort().map(letter),
            correct: tf ? [q.correct[0] === 0] : q.correct.slice().sort().map(letter),
            isCorrect: isRight(q, state.a[q.id]),
          });
        });
        afterGradedSubmit();
      };
      bindRetry(root);
    },
  };

  RENDER.sort = {
    html: function (s) {
      var done = !!state.d[s.id];
      var order = state.a[s.id];
      if (!order || order.length !== s.items.length) {
        order = seededOrder(s.items.length, s.id + 'urut');
        if (order.every(function (v, k) { return v === k; }) && order.length > 1) order.push(order.shift());
        state.a[s.id] = order;
      }
      var right = done && sortRight(s, order);
      return '<h2>' + esc(s.title) + '</h2>' + (s.intro ? '<div class="body">' + md(s.intro) + '</div>' : '<p class="qhint">Susun langkah berikut sesuai urutan yang benar. Seret pegangan atau pakai tombol panah.</p>') +
        '<ol class="sortable' + (done ? ' done' : '') + '" id="sortList">' + order.map(function (it, pos) {
          var ok = done ? (it === pos ? ' right' : ' wrong') : '';
          return '<li class="sort-item' + ok + '" data-item="' + it + '"><span class="grip" aria-hidden="true">' + icon('grip') + '</span><span class="pos">' + (pos + 1) + '</span><span class="txt">' + esc(s.items[it]) + '</span>' +
            (done ? '' : '<span class="arrows"><button class="icon-btn" data-up aria-label="Naikkan">' + icon('up') + '</button><button class="icon-btn" data-down aria-label="Turunkan">' + icon('down') + '</button></span>') + '</li>';
        }).join('') + '</ol>' +
        (done ? '<p class="feedback">' + (right ? icon('check') + ' Urutan benar! ' : icon('x') + ' Urutan belum tepat. Urutan yang benar: ' + s.items.map(function (t, k) { return (k + 1) + '. ' + esc(t); }).join(' → ') + '. ') + esc(s.feedback || '') + '</p>' : '') +
        '<div class="quiz-actions" aria-live="polite">' + (done ? resultBox() : '<button class="btn primary" id="btnSubmitSort">Kirim urutan</button>') + '</div>';
    },
    bind: function (s, root) {
      var list = $('#sortList', root);
      if (!list || state.d[s.id]) { bindRetry(root); return; }
      var sync = function () {
        state.a[s.id] = $$('.sort-item', list).map(function (li) { return +li.getAttribute('data-item'); });
        $$('.sort-item .pos', list).forEach(function (p, k) { p.textContent = k + 1; });
        save();
      };
      list.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var li = b.closest('.sort-item');
        if (b.hasAttribute('data-up') && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
        if (b.hasAttribute('data-down') && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
        b.focus(); sync();
      });
      // Seret dengan jari/mouse (pointer events).
      var drag = null;
      list.addEventListener('pointerdown', function (e) {
        var g = e.target.closest('.grip'); if (!g) return;
        var li = g.closest('.sort-item');
        drag = { li: li, id: e.pointerId };
        li.classList.add('dragging');
        try { g.setPointerCapture(e.pointerId); } catch (x) {}
        e.preventDefault();
      });
      list.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var items = $$('.sort-item', list).filter(function (x) { return x !== drag.li; });
        for (var k = 0; k < items.length; k++) {
          var r = items[k].getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) { if (items[k].previousElementSibling !== drag.li) list.insertBefore(drag.li, items[k]); return; }
        }
        if (list.lastElementChild !== drag.li) list.appendChild(drag.li);
      });
      var end = function () { if (!drag) return; drag.li.classList.remove('dragging'); drag = null; sync(); };
      list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
      $('#btnSubmitSort', root).onclick = function () {
        sync();
        state.d[s.id] = 1;
        var order = state.a[s.id];
        S.recordInteraction({
          id: s.id + '_urut', description: s.title, type: 'sequencing',
          response: order.map(letter), correct: s.items.map(function (_, k) { return letter(k); }), isCorrect: sortRight(s, order),
        });
        afterGradedSubmit();
      };
    },
  };

  function cssEsc(v) { return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/"/g, '\\"'); }
  function resultBox() {
    if (!allGradedDone()) return '<p class="msg ok">Jawaban tersimpan. Kerjakan soal lainnya untuk melihat nilai akhir.</p>';
    var p = points(), pass = p.percent >= C.passingScore;
    return '<div class="result ' + (pass ? 'pass' : 'fail') + '"><strong>Nilai Anda: ' + Math.round(p.percent) + '</strong><span>' + p.right + ' dari ' + p.total + ' benar · nilai lulus ' + C.passingScore + '</span>' +
      (pass ? '<span>Selamat, Anda lulus!</span>' : '<button class="btn small" id="btnRetry">' + icon('retry') + '<span>Ulangi semua soal</span></button>') + '</div>';
  }
  function afterGradedSubmit() {
    evaluate(); save();
    show(state.i, { autoplay: false, noFocus: true });
    if (allGradedDone() && points().percent >= C.passingScore) celebrate(1);
    var qa = $('#quizActions') || $('.quiz-actions'); if (qa) qa.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function bindRetry(root) {
    var r = $('#btnRetry', root);
    if (r) r.onclick = retryAll;
  }
  function retryAll() {
    graded().forEach(function (g) {
      delete state.d[g.id];
      if (g.type === 'quiz') g.questions.forEach(function (q) { delete state.a[q.id]; }); else delete state.a[g.id];
    });
    save();
    show(slides.indexOf(graded()[0]), { autoplay: false });
  }

  // ------------------------------------------------------------ perayaan (konfeti)
  function celebrate(power) {
    if (reduceMotion) return;
    var cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
    var cs = getComputedStyle(document.documentElement);
    var colors = [cs.getPropertyValue('--accent'), cs.getPropertyValue('--accent-2'), '#ffffff', '#ff6b6b', '#4dabf7'];
    var parts = [];
    for (var k = 0; k < 140 * power; k++) parts.push({ x: W / 2, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 4, c: colors[k % colors.length], a: Math.random() * 6, s: Math.random() * 0.3 - 0.15 });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.a += p.s; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }

  // ------------------------------------------------------------ layar awal, akhir, sertifikat
  function renderStart() {
    var resume = S.isResume() && (state.i > 0 || state.v.length > 1);
    var gradedCount = graded().length;
    app.innerHTML =
      '<section class="start' + (C.cover ? ' has-cover' : '') + '"' + (C.cover ? ' style="--cover:url(\'' + esc(C.cover).replace(/'/g, '%27') + '\')"' : '') + '>' +
      '<div class="start-card">' +
      (C.logo ? '<img class="start-logo" src="' + esc(C.logo) + '" alt="">' : '') +
      '<h1>' + esc(C.title) + '</h1>' +
      (C.description ? '<div class="lead">' + md(C.description) + '</div>' : '') +
      '<ul class="meta"><li><b>' + slides.length + '</b> bagian</li>' + (gradedCount ? '<li>nilai lulus <b>' + C.passingScore + '</b></li>' : '') +
      (C.narration && (C.narration.browser || slides.some(function (s) { return s.audio; })) ? '<li>dengan <b>narasi suara</b></li>' : '') +
      (C.certificate ? '<li><b>sertifikat</b> di akhir</li>' : '') + '</ul>' +
      (S.learnerName() ? '<p class="who">Halo, <b>' + esc(S.learnerName()) + '</b></p>' : '') +
      '<div class="start-actions">' +
      (resume ? '<button class="btn primary big" id="btnResume">Lanjutkan dari bagian ' + (state.i + 1) + icon('next') + '</button><button class="btn" id="btnRestart">Mulai dari awal</button>'
        : '<button class="btn primary big" id="btnStart">Mulai' + icon('next') + '</button>') +
      '</div>' +
      (S.connected || PREVIEW ? '' : '<p class="note">Mode mandiri: tidak terhubung ke LMS. Progres disimpan di browser ini saja.</p>') +
      '</div></section>';
    if (resume) {
      $('#btnResume').onclick = function () { show(state.i); };
      $('#btnRestart').onclick = function () { show(0); };
    } else $('#btnStart').onclick = function () { show(0); };
  }

  function renderEnd() {
    stopNarration(); evaluate(); save();
    var p = graded().length ? points() : null;
    var pendingGraded = graded().filter(function (g) { return !state.d[g.id]; });
    var pendingOther = slides.filter(function (s) { return !isDone(s); });
    var pass = p ? allGradedDone() && p.percent >= C.passingScore : !pendingOther.length;
    var html = '<section class="start end"><div class="start-card">';
    if (pendingOther.length) {
      html += '<h1>Hampir selesai</h1><p class="lead">Masih ada ' + pendingOther.length + ' bagian yang belum tuntas:</p><ul class="todo">' +
        pendingOther.map(function (s) { return '<li><button class="link" data-go="' + slides.indexOf(s) + '">' + esc(s.title) + '</button></li>'; }).join('') + '</ul>';
    } else if (p) {
      html += '<div class="score-ring ' + (pass ? 'pass' : 'fail') + '" style="--p:' + Math.round(p.percent) + '"><span>' + Math.round(p.percent) + '</span></div>' +
        '<h1>' + (pass ? 'Selamat, Anda lulus!' : 'Belum lulus') + '</h1><p class="lead">' + p.right + ' dari ' + p.total + ' jawaban benar. Nilai lulus ' + C.passingScore + '.</p>';
    } else {
      html += '<div class="score-ring pass" style="--p:100"><span>' + icon('check') + '</span></div><h1>Kursus selesai</h1><p class="lead">Terima kasih. Progres Anda sudah tercatat' + (S.connected ? ' di LMS' : '') + '.</p>';
    }
    html += '<div class="start-actions">';
    if (!pendingOther.length && pass && C.certificate) html += '<button class="btn primary big" id="btnCert">' + icon('award') + 'Lihat sertifikat</button>';
    if (p && !pass && !pendingGraded.length) html += '<button class="btn primary" id="btnRetry">' + icon('retry') + 'Ulangi soal</button>';
    html += '<button class="btn" id="btnBack">Kembali ke materi</button>';
    if (S.connected && !pendingOther.length) html += '<button class="btn" id="btnExit">Tutup kursus</button>';
    html += '</div></div></section>';
    app.innerHTML = html;
    if (pass && !pendingOther.length) celebrate(1);
    $$('[data-go]').forEach(function (b) { b.onclick = function () { show(+b.getAttribute('data-go')); }; });
    $('#btnBack').onclick = function () { show(state.i, { autoplay: false }); };
    var c = $('#btnCert'); if (c) c.onclick = renderCertificate;
    var r = $('#btnRetry'); if (r) r.onclick = retryAll;
    var ex = $('#btnExit'); if (ex) ex.onclick = function () { closed = true; S.finish(false); app.innerHTML = '<section class="start"><div class="start-card"><h1>Sesi ditutup</h1><p class="lead">Anda boleh menutup jendela ini.</p></div></section>'; };
  }

  function renderCertificate() {
    var p = graded().length ? points() : null;
    var name = S.learnerName() || (function () { try { return localStorage.getItem('studio-scorm:nama') || ''; } catch (e) { return ''; } })();
    var date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    app.innerHTML = '<section class="cert-page">' +
      '<div class="cert-tools"><button class="btn" id="btnBackEnd">' + icon('prev') + 'Kembali</button>' +
      (S.learnerName() ? '' : '<label class="name-field">Nama Anda <input id="certName" type="text" value="' + esc(name) + '" placeholder="Tulis nama lengkap"></label>') +
      '<button class="btn primary" id="btnPrint">' + icon('print') + 'Cetak / simpan PDF</button></div>' +
      '<article class="certificate" id="cert">' +
      (C.logo ? '<img class="cert-logo" src="' + esc(C.logo) + '" alt="">' : '') +
      '<p class="cert-kicker">Sertifikat Penyelesaian</p>' +
      '<p class="cert-small">diberikan kepada</p>' +
      '<h1 class="cert-name" id="certNameOut">' + esc(name || '…………………………') + '</h1>' +
      '<p class="cert-small">atas keberhasilan menyelesaikan kursus</p>' +
      '<h2 class="cert-course">' + esc(C.title) + '</h2>' +
      (p ? '<p class="cert-score">dengan nilai <b>' + Math.round(p.percent) + '</b></p>' : '') +
      '<div class="cert-foot"><span>' + esc(date) + '</span>' + (C.certificateIssuer ? '<span>' + esc(C.certificateIssuer) + '</span>' : '') + '</div>' +
      '</article></section>';
    $('#btnBackEnd').onclick = renderEnd;
    $('#btnPrint').onclick = function () { window.print(); };
    var inp = $('#certName');
    if (inp) inp.oninput = function () { $('#certNameOut').textContent = inp.value || '…………………………'; try { localStorage.setItem('studio-scorm:nama', inp.value); } catch (e) {} };
  }

  // ------------------------------------------------------------ mulai
  function boot(data, opts) {
    C = data; slides = C.slides || [];
    C.passingScore = C.passingScore == null ? 80 : +C.passingScore;
    applyTheme();
    if (!slides.length) { app.innerHTML = '<section class="start"><div class="start-card"><h1>' + esc(C.title || 'Kursus') + '</h1><p class="lead">Belum ada slide.</p></div></section>'; return; }
    if (PREVIEW) {
      state = (opts && opts.keepState && state) ? state : freshState();
      if (opts && opts.index === -1) renderStart();
      else show(Math.min((opts && opts.index) || 0, slides.length - 1), { autoplay: false, noFocus: true });
      return;
    }
    state = freshState();
    S.init();
    try {
      var saved = S.getSuspend();
      if (saved) {
        var p = JSON.parse(saved);
        if (p && typeof p === 'object') Object.keys(state).forEach(function (k) { if (p[k] != null) state[k] = p[k]; });
      } else {
        var loc = parseInt(S.getLocation(), 10); if (loc > 0) state.i = loc;
      }
    } catch (e) { /* suspend_data rusak: mulai baru */ }
    state.i = Math.min(state.i, slides.length - 1);
    S.setIncomplete();
    evaluate();
    S.commit();
    renderStart();
    var leave = function () {
      if (closed) return; closed = true; stopNarration(); save();
      var finished = graded().length ? allGradedDone() && courseFinished() : courseFinished();
      S.finish(!finished);
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('beforeunload', leave);
  }

  if (window.speechSynthesis) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }

  if (PREVIEW) {
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'studio:preview') return;
      boot(e.data.course, { index: e.data.index, keepState: e.data.keepState });
    });
    window.parent.postMessage({ type: 'studio:ready' }, location.origin);
  } else if (window.COURSE_DATA) {
    boot(window.COURSE_DATA);
  } else {
    app.textContent = 'Data kursus (course-data.js) tidak ditemukan.';
  }
})();
