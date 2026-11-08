// ============================================================
// htmlinject.js — menyisipkan musik latar, efek suara, layar sambutan, dll
// ke dalam HTML apa pun, menghasilkan SATU file .html mandiri.
// Murni (tanpa DOM) sehingga bisa diuji dengan node --test.
//
// project = {
//   src, title, favicon, viewport,
//   intro:{on,title,sub,btn,bg1,bg2,color},
//   bgm:{mode:'none'|'upload'|'ambient'|'lib', asset, vol, fade},
//   mute:{on,pos}, fs:{on,pos}, noRight, noSelect, css, js,
//   rules:[{id,on,target,custom,action,sfx,text,vol,rate}],
//   assets:[{id,name,data}]       // data = data:URL (audio)
// }
// ============================================================

import './sfx.js';
const studioSfx = globalThis.StudioSfx.presets;

export const SFX_LIST = [
  ['klik', 'Klik'], ['pop', 'Pop'], ['ding', 'Ding'], ['sukses', 'Berhasil'], ['salah', 'Salah'],
  ['whoosh', 'Whoosh'], ['tada', 'Tada!'], ['notif', 'Notifikasi'], ['koin', 'Koin'], ['alarm', 'Alarm singkat'],
];

export const TARGETS = {
  tombol: ['Semua tombol & tautan', 'button, a[href], [role="button"], input[type="button"], input[type="submit"], summary'],
  tautan: ['Tautan saja', 'a[href]'],
  gambar: ['Gambar', 'img'],
  judul: ['Judul (H1–H3)', 'h1, h2, h3'],
  paragraf: ['Paragraf', 'p'],
  input: ['Kolom isian & pilihan', 'input, textarea, select'],
  daftar: ['Item daftar', 'li'],
  halaman: ['Seluruh halaman', 'body'],
  custom: ['Elemen pilihan sendiri…', ''],
};

export const EVENTS = [['click', 'Diklik / diketuk'], ['hover', 'Kursor di atasnya'], ['visible', 'Muncul di layar (saat di-scroll)'], ['load', 'Saat halaman dimulai']];

export function defaultProject() {
  return {
    src: '', title: '', favicon: '', viewport: true,
    intro: { on: false, title: 'Selamat datang', sub: 'Ketuk tombol untuk memulai', btn: 'Mulai', bg1: '#0f3d2e', bg2: '#145a43', color: '#ffffff' },
    bgm: { mode: 'none', asset: '', lib: '', vol: 0.45, fade: 2 },
    mute: { on: true, pos: 'kanan-bawah' }, fs: { on: false, pos: 'kanan-bawah' },
    noRight: false, noSelect: false, css: '', js: '', rules: [], assets: [],
  };
}

/** Kode yang berjalan DI DALAM halaman hasil. Ditulis ES5, tanpa dependensi, dibungkus sebagai string. */
function studioRuntime(C, PRESET) {
  'use strict';
  var AC = null, unlocked = false, muted = false, queue = [], bgm = null, bgmWanted = false, ambTimer = null, ambGain = null;
  function ctx() {
    if (!AC) { var A = window.AudioContext || window.webkitAudioContext; if (A) { try { AC = new A(); } catch (e) { AC = null; } } }
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) { /* abaikan */ } }
    return AC;
  }
  var assetMap = {}; (C.assets || []).forEach(function (a) { assetMap[a.id] = a.data; });
  function playSfx(id, vol) {
    if (muted) return;
    vol = vol == null ? 1 : vol;
    if (id && id.indexOf('file:') === 0) {
      var src = assetMap[id.slice(5)]; if (!src) return;
      try { var a = new Audio(src); a.volume = Math.min(1, vol); var p = a.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* abaikan */ }
      return;
    }
    var c = ctx(); if (!c || !PRESET[id]) return;
    try { PRESET[id](c, c.currentTime + 0.005, vol); } catch (e) { /* abaikan */ }
  }
  function speak(text, el, rate) {
    if (muted || !window.speechSynthesis) return;
    var t = (text || '').trim() || (el && (el.innerText || el.textContent) || '').trim();
    if (!t) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(t.slice(0, 700)); u.lang = 'id-ID'; u.rate = rate || 1;
      var vs = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [], i;
      for (i = 0; i < vs.length; i++) if (/^id[-_]/i.test(vs[i].lang)) { u.voice = vs[i]; break; }
      speechSynthesis.speak(u);
    } catch (e) { /* abaikan */ }
  }
  // ---- musik latar
  function ambientStart(vol) {
    var c = ctx(); if (!c || ambTimer) return;
    ambGain = c.createGain(); ambGain.gain.value = 0; ambGain.connect(c.destination);
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.connect(ambGain);
    var chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]], k = 0;
    function bar() {
      var t = c.currentTime, ch = chords[k++ % chords.length];
      ch.forEach(function (fr, i) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = fr * (i === 0 ? 0.5 : 1); o.detune.value = (i - 1) * 4;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 / (1 + i * 0.4), t + 1.4); g.gain.linearRampToValueAtTime(0.0001, t + 4.3);
        o.connect(g); g.connect(f); o.start(t); o.stop(t + 4.4);
      });
    }
    bar(); ambTimer = setInterval(bar, 4000);
    ambGain.gain.linearRampToValueAtTime(vol, c.currentTime + (C.bgm.fade || 0) + 0.1);
  }
  function startBgm() {
    var B = C.bgm; if (!B || B.mode === 'none' || bgmWanted) return;
    bgmWanted = true;
    var vol = B.vol == null ? 0.45 : B.vol;
    if (B.mode === 'ambient') { ambientStart(vol); return; }
    var src = B.mode === 'lib' ? B.libUrl : assetMap[B.asset];
    if (!src) return;
    bgm = new Audio(src); bgm.loop = true; bgm.volume = 0; bgm.muted = muted;
    var p = bgm.play(); if (p && p.catch) p.catch(function () { bgmWanted = false; });
    var steps = Math.max(1, Math.round((B.fade || 0) * 20)), i = 0;
    var iv = setInterval(function () { i++; bgm.volume = Math.min(vol, vol * i / steps); if (i >= steps) clearInterval(iv); }, 50);
  }
  function setMuted(m) {
    muted = m;
    if (bgm) bgm.muted = m;
    if (ambGain && AC) ambGain.gain.value = m ? 0 : (C.bgm.vol == null ? 0.45 : C.bgm.vol);
    if (m && window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) { /* abaikan */ } }
    var b = document.getElementById('__sh_mute'); if (b) { b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-pressed', String(m)); b.title = m ? 'Nyalakan suara' : 'Matikan suara'; }
  }
  document.addEventListener('visibilitychange', function () {
    if (bgm && bgmWanted && !muted) { if (document.hidden) bgm.pause(); else { var p = bgm.play(); if (p && p.catch) p.catch(function () {}); } }
    if (AC) { try { document.hidden ? AC.suspend() : AC.resume(); } catch (e) { /* abaikan */ } }
  });
  // ---- aturan efek
  function safeSel(s) { try { document.createDocumentFragment().querySelector(s); return true; } catch (e) { return false; } }
  var rules = (C.rules || []).filter(function (r) { return r && r.sel && safeSel(r.sel); });
  function fire(r, el) { if (r.action === 'speak') speak(r.text, el, r.rate); else playSfx(r.sfx, r.vol); }
  function onClick(e) { rules.forEach(function (r) { if (r.on === 'click' && e.target.closest && e.target.closest(r.sel)) fire(r, e.target.closest(r.sel)); }); }
  var lastHover = 0;
  function onOver(e) {
    var now = Date.now(); if (now - lastHover < 120) return;
    rules.forEach(function (r) {
      if (r.on !== 'hover' || !e.target.closest) return;
      var el = e.target.closest(r.sel); if (!el || el.contains(e.relatedTarget)) return;
      lastHover = now; fire(r, el);
    });
  }
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  function watchVisible() {
    var vr = rules.filter(function (r) { return r.on === 'visible'; }); if (!vr.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        vr.forEach(function (r) { if (en.target.matches(r.sel)) fire(r, en.target); });
      });
    }, { threshold: 0.4 });
    function scan() { vr.forEach(function (r) { [].forEach.call(document.querySelectorAll(r.sel), function (el) { if (seen && seen.has(el)) return; if (seen) seen.add(el); io.observe(el); }); }); }
    scan();
    if ('MutationObserver' in window) { var t; new MutationObserver(function () { clearTimeout(t); t = setTimeout(scan, 250); }).observe(document.body, { childList: true, subtree: true }); }
  }
  function unlock() {
    if (unlocked) return; unlocked = true;
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.removeEventListener(ev, unlock, true); });
    ctx(); startBgm();
    rules.forEach(function (r) { if (r.on === 'load') fire(r, document.body); });
  }
  // ---- elemen UI
  function el(tag, attrs, html) { var n = document.createElement(tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function init() {
    var I = C.intro;
    if (I && I.on) {
      var ov = el('div', { id: '__sh_intro', role: 'dialog', 'aria-modal': 'true' },
        '<div class="__sh_card"><h1>' + esc(I.title) + '</h1><p>' + esc(I.sub) + '</p><button type="button" id="__sh_go">' + esc(I.btn || 'Mulai') + '</button></div>');
      document.body.appendChild(ov);
      document.getElementById('__sh_go').addEventListener('click', function () {
        ov.classList.add('__sh_out'); setTimeout(function () { ov.remove(); }, 450); unlock();
      });
      document.getElementById('__sh_go').focus();
    }
    var posOf = function (p) { return (p || 'kanan-bawah').split('-'); };
    var addBtn = function (id, label, pos, fn) {
      var pp = posOf(pos), b = el('button', { id: id, type: 'button', class: '__sh_fab __sh_' + pp[0] + ' __sh_' + pp[1], 'aria-label': label, title: label }, '');
      b.addEventListener('click', fn); document.body.appendChild(b); return b;
    };
    if (C.mute && C.mute.on && (C.bgm.mode !== 'none' || rules.length)) {
      var mb = addBtn('__sh_mute', 'Matikan suara', C.mute.pos, function () { setMuted(!muted); });
      var ss = 0; if (C.mute.pos === C.fs.pos && C.fs.on) mb.style.marginBottom = '56px';
      setMuted(false);
    }
    if (C.fs && C.fs.on) {
      var fb = addBtn('__sh_fs', 'Layar penuh', C.fs.pos, function () {
        var d = document, r = d.documentElement;
        if (!d.fullscreenElement && !d.webkitFullscreenElement) (r.requestFullscreen || r.webkitRequestFullscreen || function () {}).call(r);
        else (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
      });
      fb.textContent = '⛶';
    }
    if (C.noRight) document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('click', onClick, true); document.addEventListener('mouseover', onOver, true);
    watchVisible();
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.addEventListener(ev, unlock, true); });
    if (C.pick) picker();
  }
  // ---- pemilih elemen (hanya pratinjau Builder)
  function picker() {
    var on = false, box = el('div', { id: '__sh_pick' }), last = null;
    document.documentElement.appendChild(box);
    function sel(n) {
      if (n.id && !/\d{4,}/.test(n.id)) return '#' + CSS.escape(n.id);
      var tag = n.tagName.toLowerCase(), cls = [].filter.call(n.classList, function (c) { return !/^__sh|\d/.test(c); })[0];
      if (cls) return tag + '.' + CSS.escape(cls);
      var path = [], x = n, d = 0;
      while (x && x.nodeType === 1 && x !== document.body && d++ < 4) {
        var t = x.tagName.toLowerCase(), sib = x.parentNode ? [].filter.call(x.parentNode.children, function (s) { return s.tagName === x.tagName; }) : [];
        path.unshift(sib.length > 1 ? t + ':nth-of-type(' + (sib.indexOf(x) + 1) + ')' : t); x = x.parentNode;
      }
      return path.join(' > ') || tag;
    }
    function move(e) {
      if (!on) return; var n = e.target; if (n === box || n.closest('#__sh_intro')) return; last = n;
      var r = n.getBoundingClientRect(); box.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    }
    function stop() { on = false; box.style.display = 'none'; document.documentElement.classList.remove('__sh_picking'); }
    window.addEventListener('message', function (e) { if (e.data && e.data.type === 'sh-pick') { on = true; document.documentElement.classList.add('__sh_picking'); } if (e.data && e.data.type === 'sh-pick-off') stop(); });
    document.addEventListener('mouseover', move, true);
    document.addEventListener('click', function (e) {
      if (!on) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      var s = sel(e.target); stop(); parent.postMessage({ type: 'sh-picked', sel: s }, '*');
    }, true);
    document.addEventListener('keydown', function (e) { if (on && e.key === 'Escape') { stop(); parent.postMessage({ type: 'sh-picked', sel: '' }, '*'); } }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}

const RUNTIME_CSS = `
#__sh_intro{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transition:opacity .45s}
#__sh_intro.__sh_out{opacity:0;pointer-events:none}
#__sh_intro .__sh_card{max-width:520px}
#__sh_intro h1{font-size:clamp(1.8rem,6vw,3rem);margin:0 0 .4em;line-height:1.15}
#__sh_intro p{font-size:1.1rem;opacity:.85;margin:0 0 1.6em}
#__sh_intro button{font:700 1.1rem system-ui,sans-serif;padding:14px 38px;border:0;border-radius:999px;background:#ffc21a;color:#2b2100;cursor:pointer;box-shadow:0 5px 0 #c99500}
#__sh_intro button:active{transform:translateY(3px);box-shadow:0 2px 0 #c99500}
.__sh_fab{position:fixed;z-index:2147482000;width:46px;height:46px;border-radius:50%;border:0;background:rgba(15,61,46,.9);color:#fff;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.__sh_fab:hover{background:#145a43}
.__sh_kanan{right:14px}.__sh_kiri{left:14px}.__sh_atas{top:14px}.__sh_bawah{bottom:14px}
#__sh_pick{position:fixed;display:none;z-index:2147483600;pointer-events:none;border:2px solid #ffc21a;background:rgba(255,194,26,.22);border-radius:3px}
.__sh_picking,.__sh_picking *{cursor:crosshair!important}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');

/** Ubah aturan editor menjadi konfigurasi runtime (selector sudah dihitung). */
export function runtimeConfig(p, { preview = false, libBase = '' } = {}) {
  const rules = (p.rules || []).filter((r) => r && r.on).map((r) => {
    const sel = r.target === 'custom' ? String(r.custom || '').trim() : (TARGETS[r.target]?.[1] || '');
    return { on: r.on, sel, action: r.action === 'speak' ? 'speak' : 'sfx', sfx: r.sfx || 'klik', text: r.text || '', vol: clamp(r.vol ?? 0.8, 0, 1), rate: clamp(r.rate ?? 1, 0.5, 2) };
  }).filter((r) => r.sel);
  const usedIds = new Set();
  for (const r of rules) if (r.sfx?.startsWith('file:')) usedIds.add(r.sfx.slice(5));
  if (p.bgm?.mode === 'upload' && p.bgm.asset) usedIds.add(p.bgm.asset);
  const assets = (p.assets || []).filter((a) => usedIds.has(a.id)).map((a) => ({ id: a.id, data: a.data }));
  const b = p.bgm || {};
  return {
    intro: { ...defaultProject().intro, ...(p.intro || {}) },
    bgm: { mode: b.mode || 'none', asset: b.asset || '', vol: clamp(b.vol ?? 0.45, 0, 1), fade: clamp(b.fade ?? 2, 0, 10), libUrl: b.mode === 'lib' && b.lib ? libBase + b.lib : '' },
    mute: p.mute || { on: true, pos: 'kanan-bawah' }, fs: p.fs || { on: false, pos: 'kanan-bawah' },
    noRight: !!p.noRight, rules, assets, pick: !!preview,
  };
}
const clamp = (n, a, b) => Math.min(b, Math.max(a, Number(n)));

/** Hasilkan HTML akhir. Opsi libInline: {url → dataURL} untuk menanam musik pustaka. */
export function buildHtml(p, { preview = false, libBase = '', libData = null } = {}) {
  let html = String(p.src || '').trim();
  if (!html) html = '<main style="font-family:system-ui;padding:3rem;text-align:center"><h1>Halaman kosong</h1><p>Tempel kode HTML Anda di editor.</p></main>';
  if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) {
    html = `<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n${html}\n</body>\n</html>`;
  } else if (!/<!doctype/i.test(html)) html = `<!doctype html>\n${html}`;
  if (!/<head[\s>]/i.test(html)) html = html.replace(/<html[^>]*>/i, (m) => `${m}\n<head></head>`);
  if (!/<body[\s>]/i.test(html)) html = html.replace(/<\/head>/i, '</head>\n<body>') + '\n</body>';

  const cfg = runtimeConfig(p, { preview, libBase });
  if (libData && cfg.bgm.mode === 'lib' && libData[cfg.bgm.libUrl]) cfg.bgm.libUrl = libData[cfg.bgm.libUrl];

  const headBits = [];
  if (p.viewport !== false && !/<meta[^>]+name=["']?viewport/i.test(html)) headBits.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  if (!/<meta[^>]+charset/i.test(html)) headBits.unshift('<meta charset="utf-8">');
  if (p.favicon) {
    html = html.replace(/<link[^>]+rel=["']?(?:shortcut )?icon["']?[^>]*>/gi, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${esc(p.favicon)}</text></svg>`;
    headBits.push(`<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}">`);
  }
  if (p.title) {
    if (/<title[\s>]/i.test(html)) html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${esc(p.title)}</title>`);
    else headBits.push(`<title>${esc(p.title)}</title>`);
  }
  const I = cfg.intro;
  let css = RUNTIME_CSS;
  if (I.on) css += `#__sh_intro{background:linear-gradient(145deg,${esc(I.bg1)},${esc(I.bg2)});color:${esc(I.color)}}\n`;
  if (p.noSelect) css += 'html,body{-webkit-user-select:none;user-select:none}\ninput,textarea{-webkit-user-select:text;user-select:text}\n';
  headBits.push(`<style id="sh-style">${css}</style>`);
  if (p.css?.trim()) headBits.push(`<style id="sh-custom">\n${p.css}\n</style>`);
  const injectHead = headBits.join('\n');
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${injectHead}\n</head>`) : html.replace(/<head[^>]*>/i, (m) => `${m}\n${injectHead}`);

  const needRuntime = cfg.bgm.mode !== 'none' || cfg.rules.length || cfg.intro.on || cfg.fs.on || cfg.noRight || cfg.pick;
  let tail = '';
  if (needRuntime) tail += `<script id="sh-runtime">(${studioRuntime.toString()})(${jsonForScript(cfg)},(${studioSfx.toString()})());</script>\n`;
  if (p.js?.trim()) tail += `<script id="sh-custom-js">\n${String(p.js).replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
  tail += '<!-- Dibuat dengan Studio SCORM · HTML Creator -->\n';
  const i = html.toLowerCase().lastIndexOf('</body>');
  html = i >= 0 ? html.slice(0, i) + tail + html.slice(i) : html + tail;
  return html;
}
