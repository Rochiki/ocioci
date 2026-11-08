// ============================================================
// htmllint.js — pemeriksa & perbaik otomatis kode HTML (tanpa internet)
//   analyze(src) → { issues:[{id, level:'error'|'warn'|'info', msg, line, fix}] }
//   autofix(src) → { src, applied:[teks], issues:[sisa masalah] }
// Murni string → bisa diuji di Node dan dipakai di browser.
// ============================================================
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set(['script', 'style', 'textarea', 'title']);
// elemen yang penutupnya boleh dihilangkan menurut standar HTML (tidak dianggap salah)
const OPTIONAL = new Set('html head body p li dt dd tr td th thead tbody tfoot colgroup option optgroup rt rp caption'.split(' '));
const SKIP_HEAD = new Set(['html', 'head', 'body']);
const lineOf = (s, pos) => { let n = 1; for (let i = 0; i < pos && i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;

/** Pecah HTML menjadi token tag; komentar/doctype/isi script&style dilewati. */
export function scan(src) {
  const toks = [], raws = [], bad = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') { const e = src.indexOf('>', lt); i = e < 0 ? src.length : e + 1; continue; }
    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m) {
      if (/^<\/?[a-zA-Z]/.test(src.slice(lt, lt + 3))) bad.push({ pos: lt });
      i = lt + 1; continue;
    }
    const name = m[2].toLowerCase(), closing = m[1] === '/';
    const selfClose = !closing && /\/\s*$/.test(m[3]);
    const tok = { type: closing ? 'close' : 'open', name, pos: lt, end: lt + m[0].length, raw: m[0], attrs: m[3], selfClose };
    toks.push(tok);
    i = tok.end;
    if (!closing && RAW.has(name) && !selfClose) {
      const re = new RegExp(`</${name}\\s*>`, 'ig'); re.lastIndex = i;
      const c = re.exec(src);
      const bodyEnd = c ? c.index : src.length;
      raws.push({ name, start: i, end: bodyEnd, closed: !!c, tok, attrs: m[3] });
      if (c) { toks.push({ type: 'close', name, pos: c.index, end: c.index + c[0].length, raw: c[0], attrs: '' }); i = c.index + c[0].length; } else i = src.length;
    }
  }
  return { toks, raws, bad };
}

const attr = (attrs, n) => { const m = new RegExp(`(?:^|\\s)${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs || ''); return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null; };
const isJs = (r) => { if (r.name !== 'script' || /(?:^|\s)src\s*=/i.test(r.attrs)) return false; const t = (attr(r.attrs, 'type') || '').toLowerCase(); return !t || /^(text|application)\/(javascript|ecmascript)$/.test(t); };

function jsError(code) {
  try { new Function(code); return null; } catch (e) { return e instanceof SyntaxError ? e : null; }
}
const EOF_ERR = /end of input|unterminated|missing \)|expected expression, got end|unexpected end/i;
function jsErrorLine(code) {
  const lines = code.split('\n');
  for (let n = 1; n <= lines.length; n++) {
    const e = jsError(lines.slice(0, n).join('\n'));
    if (e && !EOF_ERR.test(e.message)) return n;
  }
  return null;
}
const JS_MSG = (m) => String(m).replace(/^Unexpected token/, 'Karakter tak terduga').replace(/^Unexpected identifier/, 'Nama tak terduga').replace(/^Unexpected end of input/, 'Kode terpotong (ada kurung/kurawal yang belum ditutup)').replace(/^Invalid or unexpected token/, 'Karakter tidak valid (sering: tanda kutip “ ” atau spasi aneh hasil copy-paste)').replace(/^missing \) after argument list/, 'Kurung ")" kurang');

const SMART = /[“”„‘’ ​﻿]/;
const deSmart = (s) => s.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/[ ]/g, ' ').replace(/[​﻿]/g, '');

const cssBalance = (css) => {
  let d = 0, i = 0, str = '', min = 0;
  while (i < css.length) {
    const c = css[i];
    if (str) { if (c === '\\') i++; else if (c === str) str = ''; }
    else if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 1; }
    else if (c === '"' || c === "'") str = c;
    else if (c === '{') d++;
    else if (c === '}') { d--; if (d < min) min = d; }
    i++;
  }
  return { open: d - min, extra: -min };
};

const hasFence = (s) => /^\s*```[a-z]*\s*\n/i.test(s) || /\n\s*```\s*$/.test(s);
const looksEscaped = (s) => !/<[a-zA-Z!]/.test(s) && (s.match(/&lt;\/?[a-zA-Z]/g) || []).length >= 2;

export function analyze(src) {
  const issues = [];
  const add = (id, level, msg, line, fix = false) => issues.push({ id, level, msg, line: line || null, fix });
  src = String(src || '');
  if (!src.trim()) return { issues };
  if (hasFence(src)) add('fence', 'error', 'Ada pagar markdown ``` di awal/akhir kode (hasil copy dari chat). Ini ikut tampil di halaman.', 1, true);
  if (looksEscaped(src)) add('escaped', 'error', 'Kode tersimpan sebagai teks (<div> tertulis &lt;div&gt;). Perlu dikembalikan ke tag asli.', 1, true);

  const { toks, raws, bad } = scan(src);
  for (const b of bad) add('badtag', 'error', 'Ada tag yang tidak ditutup dengan ">" (atau tanda kutip atribut tidak berpasangan).', lineOf(src, b.pos));

  for (const t of toks) {
    if (t.type === 'open' && t.name === 'script' && t.selfClose) add('selfscript', 'error', '<script …/> tidak boleh ditutup sendiri — browser mengabaikan penutupnya sehingga seluruh halaman setelahnya ikut dianggap kode.', lineOf(src, t.pos), true);
    if (t.type === 'open' && SMART.test(t.attrs) && /=\s*[“‘]/.test(t.attrs)) add('smartattr', 'error', 'Atribut memakai tanda kutip lengkung (“ ”) — tidak dikenali browser.', lineOf(src, t.pos), true);
  }
  for (const r of raws) {
    if (!r.closed && (r.name === 'script' || r.name === 'style')) add('unclosed-' + r.name, 'error', `<${r.name}> dibuka tapi tidak ditutup </${r.name}>.`, lineOf(src, r.tok.pos), true);
    const body = src.slice(r.start, r.end);
    if (r.name === 'style') {
      const b = cssBalance(body);
      if (b.open) add('css-open', 'error', `CSS kurang ${b.open} tanda "}" di akhir.`, lineOf(src, r.start), true);
      if (b.extra) add('css-extra', 'warn', `CSS kelebihan ${b.extra} tanda "}".`, lineOf(src, r.start));
    }
    if (isJs(r) && body.trim()) {
      const e = jsError(body);
      if (e) {
        const rel = jsErrorLine(body);
        const fixed = SMART.test(body) && !jsError(deSmart(body));
        add('js', 'error', `JavaScript bermasalah: ${JS_MSG(e.message)}${rel ? ` (sekitar baris ${lineOf(src, r.start) + rel - 1})` : ''}.`, rel ? lineOf(src, r.start) + rel - 1 : lineOf(src, r.start), fixed);
      }
    }
  }

  // struktur tag
  const stack = [];
  const seenIds = new Map();
  for (const t of toks) {
    if (t.type === 'open') {
      const idv = attr(t.attrs, 'id'); if (idv) seenIds.set(idv, [...(seenIds.get(idv) || []), lineOf(src, t.pos)]);
      if (VOID.has(t.name) || t.selfClose) continue;
      if (RAW.has(t.name)) continue;
      stack.push(t);
    } else if (!RAW.has(t.name) && !VOID.has(t.name)) {
      const k = stack.map((x) => x.name).lastIndexOf(t.name);
      if (k < 0) { if (!OPTIONAL.has(t.name)) add('stray', 'warn', `Tag penutup </${t.name}> tidak punya pembuka.`, lineOf(src, t.pos), true); continue; }
      for (const x of stack.splice(k + 1)) if (!OPTIONAL.has(x.name)) add('unclosed', 'error', `<${x.name}> (baris ${lineOf(src, x.pos)}) tidak ditutup sebelum </${t.name}>.`, lineOf(src, x.pos), true);
      stack.pop();
    }
  }
  for (const x of stack) if (!OPTIONAL.has(x.name)) add('unclosed', 'error', `<${x.name}> (baris ${lineOf(src, x.pos)}) tidak pernah ditutup.`, lineOf(src, x.pos), true);

  for (const [idv, ls] of seenIds) if (ls.length > 1) add('dupid', 'warn', `id="${idv}" dipakai ${ls.length}× (baris ${ls.join(', ')}). Tombol/JS yang memakai id ini bisa menyasar elemen yang salah.`, ls[1]);

  // sumber daya
  const rel = new Set(), http = [];
  for (const t of toks) {
    if (t.type !== 'open') continue;
    const k = t.name === 'link' ? 'href' : 'src';
    if (!['script', 'img', 'link', 'source', 'video', 'audio', 'iframe', 'embed'].includes(t.name)) continue;
    const u = attr(t.attrs, k); if (!u) continue;
    if (t.name === 'link' && !/stylesheet|icon/i.test(attr(t.attrs, 'rel') || '')) continue;
    if (/^http:\/\/(?!localhost|127\.)/i.test(u)) http.push([u, lineOf(src, t.pos)]);
    else if (!/^(https?:|data:|blob:|#|\/\/|about:|javascript:)/i.test(u)) rel.add(`${u}|${lineOf(src, t.pos)}`);
  }
  for (const [u, l] of http) add('http', 'warn', `Alamat tidak aman http:// — diblokir di halaman https: ${u}`, l, true);
  for (const r of rel) { const [u, l] = r.split('|'); add('relative', 'warn', `File lokal "${u}" tidak ikut dalam file tunggal (gambar/skrip tidak akan muncul). Ganti dengan alamat https:// atau data:URL.`, +l); }
  return { issues };
}

/** Terapkan semua perbaikan yang aman. */
export function autofix(input) {
  let s = String(input || '');
  const applied = [];
  const note = (t) => applied.push(t);
  if (hasFence(s)) { s = s.replace(/^\s*```[a-z]*\s*\n/i, '').replace(/\n\s*```\s*$/, '\n'); note('Membuang pagar markdown ```'); }
  if (looksEscaped(s)) { s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&'); note('Mengembalikan kode yang tersimpan sebagai teks (&lt; → <)'); }

  // tanda kutip lengkung pada atribut tag
  let n = 0;
  s = s.replace(/<[a-zA-Z][^>]*>/g, (tag) => { if (!/=\s*[“‘]/.test(tag)) return tag; n++; return tag.replace(/=\s*[“”]([^“”>]*)[“”]/g, '="$1"').replace(/=\s*[‘’]([^‘’>]*)[‘’]/g, "='$1'"); });
  if (n) note(`Mengganti tanda kutip lengkung pada atribut (${n} tag)`);

  // <script ... /> → <script ...></script>
  n = 0; s = s.replace(/<script\b((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*\/>/gi, (_, a) => { n++; return `<script${a}></script>`; });
  if (n) note(`Menutup <script …/> dengan benar (${n})`);

  // script/style tak tertutup, CSS & JS
  let sc = scan(s);
  for (const r of [...sc.raws].reverse()) {
    if (!r.closed && (r.name === 'script' || r.name === 'style')) { s += `\n</${r.name}>`; note(`Menutup <${r.name}> yang belum ditutup`); }
  }
  sc = scan(s);
  for (const r of [...sc.raws].reverse()) {
    const body = s.slice(r.start, r.end);
    if (r.name === 'style') { const b = cssBalance(body); if (b.open) { s = s.slice(0, r.end) + '\n' + '}'.repeat(b.open) + s.slice(r.end); note(`Menambah ${b.open} tanda "}" pada CSS`); } }
    else if (isJs(r) && body.trim() && jsError(body) && SMART.test(body) && !jsError(deSmart(body))) { s = s.slice(0, r.start) + deSmart(body) + s.slice(r.end); note('Mengganti tanda kutip lengkung/spasi aneh di dalam JavaScript'); }
  }

  // struktur tag: sisipkan penutup yang hilang, buang penutup yatim
  sc = scan(s);
  const edits = [], stack = [];
  const closers = (list) => list.filter((x) => !OPTIONAL.has(x.name)).reverse().map((x) => `</${x.name}>`).join('');
  let fixedTags = 0;
  for (const t of sc.toks) {
    if (t.type === 'open') { if (!VOID.has(t.name) && !t.selfClose && !RAW.has(t.name)) stack.push(t); continue; }
    if (RAW.has(t.name) || VOID.has(t.name)) continue;
    const k = stack.map((x) => x.name).lastIndexOf(t.name);
    if (k < 0) { if (!OPTIONAL.has(t.name)) { edits.push({ pos: t.pos, del: t.end - t.pos, ins: '' }); fixedTags++; } continue; }
    const between = stack.splice(k + 1); stack.pop();
    const c = closers(between); if (c) { edits.push({ pos: t.pos, del: 0, ins: c }); fixedTags += between.filter((x) => !OPTIONAL.has(x.name)).length; }
  }
  const left = stack.filter((x) => !SKIP_HEAD.has(x.name));
  const c = closers(left);
  if (c) {
    const bodyClose = [...sc.toks].reverse().find((t) => t.type === 'close' && t.name === 'body');
    const htmlClose = [...sc.toks].reverse().find((t) => t.type === 'close' && t.name === 'html');
    const pos = bodyClose ? bodyClose.pos : htmlClose ? htmlClose.pos : s.length;
    edits.push({ pos, del: 0, ins: c }); fixedTags += left.filter((x) => !OPTIONAL.has(x.name)).length;
  }
  for (const e of edits.sort((a, b) => b.pos - a.pos)) s = s.slice(0, e.pos) + e.ins + s.slice(e.pos + e.del);
  if (fixedTags) note(`Merapikan tag yang tidak berpasangan (${fixedTags})`);

  // http → https
  n = 0; s = s.replace(/<(script|img|link|source|video|audio|iframe|embed)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi, (tag) => tag.replace(/((?:src|href)\s*=\s*["']?)http:\/\/(?!localhost|127\.)/i, (m, p) => { n++; return `${p}https://`; }));
  if (n) note(`Mengubah alamat http:// menjadi https:// (${n})`);

  return { src: s, applied, issues: analyze(s).issues };
}
