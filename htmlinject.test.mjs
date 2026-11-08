import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml, defaultProject, runtimeConfig, TARGETS } from './htmlinject.js';

const base = (o = {}) => ({ ...defaultProject(), src: '<h1>Hai</h1><button>Ok</button>', ...o });

test('potongan HTML dibungkus jadi halaman lengkap', () => {
  const h = buildHtml(base());
  assert.match(h, /^<!doctype html>/i);
  assert.match(h, /<meta charset="utf-8">/);
  assert.match(h, /name="viewport"/);
  assert.ok(h.indexOf('<h1>Hai</h1>') < h.indexOf('</body>'));
});

test('halaman lengkap dipertahankan; judul & ikon diganti', () => {
  const src = '<!doctype html><html><head><meta charset="utf-8"><title>Lama</title><link rel="icon" href="x.png"></head><body><p>x</p></body></html>';
  const h = buildHtml(base({ src, title: 'Baru <&>', favicon: '🦺' }));
  assert.match(h, /<title>Baru &lt;&amp;&gt;<\/title>/);
  assert.ok(!h.includes('Lama') && !h.includes('x.png'));
  assert.match(h, /rel="icon" href="data:image\/svg\+xml,/);
  assert.equal((h.match(/<title/g) || []).length, 1);
});

test('tanpa fitur aktif: tidak ada runtime; dengan BGM/aturan: runtime tertanam sekali', () => {
  assert.ok(!buildHtml(base()).includes('id="sh-runtime"'));
  const h = buildHtml(base({ bgm: { mode: 'ambient', vol: 0.3, fade: 1 }, rules: [{ on: 'click', target: 'tombol', action: 'sfx', sfx: 'pop', vol: 0.5 }] }));
  assert.equal((h.match(/id="sh-runtime"/g) || []).length, 1);
  assert.ok(h.includes('button, a[href]'));
  assert.ok(h.indexOf('sh-runtime') < h.lastIndexOf('</body>'));
});

test('aturan: selector custom, kosong dibuang, aset hanya yang dipakai', () => {
  const p = base({
    rules: [
      { on: 'click', target: 'custom', custom: '.opsi', action: 'sfx', sfx: 'file:a1' },
      { on: 'click', target: 'custom', custom: '  ', action: 'sfx', sfx: 'klik' },
      { on: 'visible', target: 'judul', action: 'speak', text: 'Halo' },
    ],
    assets: [{ id: 'a1', name: 'a.mp3', data: 'data:audio/mpeg;base64,AAA' }, { id: 'a2', name: 'b.mp3', data: 'data:audio/mpeg;base64,BBB' }],
  });
  const c = runtimeConfig(p);
  assert.equal(c.rules.length, 2);
  assert.equal(c.rules[0].sel, '.opsi');
  assert.deepEqual(c.assets.map((a) => a.id), ['a1']);
  assert.equal(c.rules[1].sel, TARGETS.judul[1]);
});

test('BGM unggahan menanam datanya; pustaka memakai libBase atau libData', () => {
  const p = base({ bgm: { mode: 'upload', asset: 'm', vol: 0.4, fade: 0 }, assets: [{ id: 'm', name: 'm.mp3', data: 'data:audio/mpeg;base64,QUJD' }] });
  assert.ok(buildHtml(p).includes('QUJD'));
  const q = base({ bgm: { mode: 'lib', lib: 'bgm-x.mp3', vol: 0.4, fade: 0 } });
  assert.ok(buildHtml(q, { libBase: 'https://s.id/' }).includes('https://s.id/bgm-x.mp3'));
  assert.ok(buildHtml(q, { libBase: 'https://s.id/', libData: { 'https://s.id/bgm-x.mp3': 'data:audio/mpeg;base64,ZZZ' } }).includes('ZZZ'));
});

test('</script> di JS/CSS kustom dan konfigurasi tidak memecah halaman', () => {
  const h = buildHtml(base({ js: 'var a="</script><b>";', rules: [{ on: 'click', target: 'custom', custom: '[data-x="</script>"]', action: 'sfx', sfx: 'klik' }] }));
  assert.ok(!/<\/script><b>/.test(h));
  assert.equal((h.match(/<script/g) || []).length, (h.match(/<\/script>/g) || []).length);
});

test('layar sambutan, noSelect, CSS kustom', () => {
  const h = buildHtml(base({ intro: { on: true, title: 'A<b>', sub: 's', btn: 'Go', bg1: '#111', bg2: '#222', color: '#fff' }, noSelect: true, css: 'h1{color:red}' }));
  assert.ok(h.includes('#__sh_intro{background:linear-gradient(145deg,#111,#222)'));
  assert.ok(h.includes('user-select:none') && h.includes('h1{color:red}'));
  assert.ok(h.includes('"title":"A<b>"') === false); // dilolos sebagai <
});

test('judul berisi $& / $1 tidak dirusak, teks "</head>" di dalam script tidak jadi titik sisip', () => {
  const src = '<html><body><button>ok</button><script>var t=`<head></head>`; var p="$&"; window.__t=t;</script></body></html>';
  const h = buildHtml(base({ src, title: 'Harga $& $1 $` Rp', bgm: { mode: 'ambient', vol: 0.4, fade: 2 } }));
  assert.ok(h.includes('<title>Harga $&amp; $1 $` Rp</title>'));
  assert.ok(h.includes('var t=`<head></head>`;'));
  assert.ok(h.indexOf('id="sh-style"') < h.indexOf('<body'));
});

test('HTML tanpa tag <html> tetap mendapat head (judul, gaya) dan runtime di dalam body', () => {
  const h = buildHtml(base({ src: '<body onload="x=1"><h1>İİİ</h1></body>', title: 'T', bgm: { mode: 'ambient', vol: 0.4, fade: 2 } }));
  assert.match(h, /<head>[\s\S]*<title>T<\/title>[\s\S]*<\/head>/);
  assert.ok(h.indexOf('id="sh-runtime"') < h.lastIndexOf('</body>'));
  assert.ok(h.indexOf('id="sh-runtime"') > h.indexOf('<h1>'));
});
