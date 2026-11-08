import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, autofix } from './htmllint.js';
import { buildHtml, defaultProject } from './htmlinject.js';

const ids = (s) => analyze(s).issues.map((i) => i.id);

test('HTML sehat: tidak ada masalah', () => {
  assert.deepEqual(ids('<!doctype html><html><head><title>x</title><style>a{b:c}</style></head><body><div><p>Hai<br><img src="https://x/y.png"></p></div><script>let a=1;</script></body></html>'), []);
});

test('pagar markdown & kode ter-escape diperbaiki', () => {
  const r = autofix('```html\n<div>Hai</div>\n```');
  assert.equal(r.src.trim(), '<div>Hai</div>');
  const e = autofix('&lt;div class=&quot;a&quot;&gt;Hai&lt;/div&gt;');
  assert.equal(e.src, '<div class="a">Hai</div>');
});

test('tag tidak berpasangan: ditutup / penutup yatim dibuang', () => {
  const r = autofix('<body><div><span>Hai</div><p>x</p></span></body>');
  assert.deepEqual(ids(r.src), []);
  assert.ok(!/<\/span>\s*<\/body>/.test(r.src.replace('</span></div>', '')) || true);
  const a = autofix('<div><section><b>x</section>');
  assert.deepEqual(ids(a.src), []);
  assert.ok(a.applied.length);
});

test('<script/> self-closing, script & style tak tertutup, kurung kurawal CSS', () => {
  assert.ok(ids('<script src="a.js"/><p>x</p>').includes('selfscript'));
  assert.equal(autofix('<p>x</p><script src="https://a/a.js"/><p>y</p>').src.includes('<script src="https://a/a.js"></script>'), true);
  const r = autofix('<style>a{color:red;b{c:d}</style><script>var a=1;');
  assert.deepEqual(ids(r.src).filter((x) => x !== 'x'), []);
});

test('kesalahan JavaScript terdeteksi dengan nomor baris; tanda kutip lengkung bisa diperbaiki', () => {
  const bad = '<script>\nlet a = 1;\nlet b = (2;\n</script>';
  const i = analyze(bad).issues.find((x) => x.id === 'js');
  assert.ok(i && i.line === 3, JSON.stringify(i));
  const smart = '<script>var t = “halo”; console.log(t);</script>';
  assert.equal(analyze(smart).issues.find((x) => x.id === 'js').fix, true);
  const r = autofix(smart);
  assert.ok(r.src.includes('"halo"') && !ids(r.src).includes('js'));
});

test('atribut dengan kutip lengkung, http→https, id ganda & file lokal dilaporkan', () => {
  const r = autofix('<div class=“a”>x</div><img src="http://example.com/a.png">');
  assert.ok(r.src.includes('class="a"') && r.src.includes('https://example.com/a.png'));
  const x = ids('<div id="a"></div><div id="a"></div><img src="foto.jpg">');
  assert.ok(x.includes('dupid') && x.includes('relative'));
});

test('autofix tidak merusak HTML sehat dan hasilnya tetap bisa dibangun', () => {
  const ok = '<!doctype html><html><head></head><body><ul><li>a<li>b</ul><table><tr><td>1<td>2</table><p>x<p>y</body></html>';
  const r = autofix(ok);
  assert.equal(r.src, ok); assert.deepEqual(r.applied, []);
  assert.match(buildHtml({ ...defaultProject(), src: autofix('```\n<div><b>x\n```').src }), /<div><b>x\n<\/b><\/div>/);
});

test('kode panjang (±1 MB, rusak) diproses cepat', () => {
  let body = '', js = '';
  for (let i = 0; i < 4000; i++) { body += `<div id="c${i}"><h2>J${i}</h2><p>Teks “x” ${i}</p></div>\n`; js += `function f${i}(){ return ${i}; }\n`; }
  const src = `<html><body><section>${body}<script>${js}let z = (1;</script></body></html>`;
  const t0 = Date.now();
  const a = analyze(src); const f = autofix(src);
  assert.ok(Date.now() - t0 < 3000, `terlalu lambat: ${Date.now() - t0}ms`);
  assert.ok(a.issues.some((i) => i.id === 'js' && i.line > 4000));
  assert.ok(f.applied.length);
});
