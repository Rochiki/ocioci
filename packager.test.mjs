import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { buildPackage, validateProject, toCourseData, TEMPLATE_FILES, findZipEntry, wrapHtml } from './packager.js';
import { parseManifest } from './manifest.js';
import { revive } from './build-sample.mjs';

const root = new URL('./', import.meta.url);
const template = Object.fromEntries(await Promise.all(TEMPLATE_FILES.map(async (f) => [f, await readFile(new URL(f, root), 'utf8')])));
const { project: raw } = JSON.parse(await readFile(new URL('contoh-apd.json', root), 'utf8'));
const sample = () => revive(structuredClone(raw));
const readData = async (zip) => { const js = await zip.file('assets/course-data.js').async('string'); return JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1)); };

test('contoh lolos validasi', () => assert.deepEqual(validateProject(sample()), []));

test('validasi menangkap kekurangan tiap jenis slide', () => {
  const p = sample();
  p.title = '';
  p.slides.push({ id: 'a', type: 'image', title: 'G', image: null });
  p.slides.push({ id: 'b', type: 'video', title: 'V', source: 'url', url: '' });
  p.slides.push({ id: 'c', type: 'html', title: 'H', source: 'code', html: ' ' });
  p.slides.push({ id: 'd', type: 'flip', title: 'F', cards: [{ front: 'x', back: '' }] });
  p.slides.push({ id: 'e', type: 'hotspot', title: 'S', image: null, points: [] });
  p.slides.push({ id: 'f', type: 'quiz', title: 'Q', questions: [{ type: 'single', text: 'a', options: ['x', 'y'], correct: [0, 1] }, { type: 'multi', text: '', options: ['x', ''], correct: [1] }] });
  p.slides.push({ id: 'g', type: 'sort', title: 'U', items: ['satu', ''] });
  const msg = validateProject(p).join('\n');
  for (const re of [/Judul kursus/, /belum ada gambar/, /belum ada video/, /HTML kosong/, /minimal 1 kartu/, /minimal 1 titik/, /hanya boleh 1 kunci/, /pertanyaan kosong/, /minimal 2 pilihan/, /tandai kunci/, /minimal 2 langkah/]) assert.match(msg, re);
});

for (const version of ['1.2', '2004']) {
  test(`paket SCORM ${version}: file lengkap, manifest valid, data benar`, async () => {
    const p = sample();
    p.version = version;
    p.slides.push({ id: 'html1', type: 'html', title: 'Embed', source: 'code', html: '<iframe src="https://example.com"></iframe>', height: 500 });
    const mini = new JSZip(); mini.file('situs/index.html', '<h1>Halo</h1><img src="img/a.png">'); mini.file('situs/img/a.png', new Uint8Array([1, 2, 3]));
    p.slides.push({ id: 'html2', type: 'html', title: 'Mini', source: 'zip', zip: { data: await mini.generateAsync({ type: 'uint8array' }), name: 'mini.zip', type: 'application/zip' } });
    p.slides.push({ id: 'vid', type: 'video', title: 'Video', source: 'file', video: { data: new Uint8Array([0, 0, 0]), name: 'klip.MP4', type: 'video/mp4' }, mustWatch: true });
    p.slides[0].audio = { data: new Uint8Array([73, 68, 51]), name: 'narasi.mp3', type: 'audio/mpeg' };
    const out = await buildPackage(p, { template, JSZip, type: 'nodebuffer' });
    const zip = await JSZip.loadAsync(out.data);
    for (const f of ['imsmanifest.xml', 'index.html', 'assets/course.js', 'assets/course.css', 'assets/scorm-api.js', 'assets/course-data.js', 'html-06/index.html', 'html-07/situs/index.html', 'html-07/situs/img/a.png', 'media/video-08.mp4', 'media/narasi-01.mp3', 'media/sampul.svg']) {
      assert.ok(zip.file(f), `ada ${f}`);
    }
    const xml = await zip.file('imsmanifest.xml').async('string');
    const m = parseManifest(xml, DOMParser);
    assert.equal(m.version, version);
    assert.equal(xml.match(/<file href=/g).length, out.files.length - 1);
    const d = await readData(zip);
    assert.equal(d.slides.length, 8);
    assert.deepEqual(d.slides.map((s) => s.type), ['content', 'flip', 'hotspot', 'sort', 'quiz', 'html', 'html', 'video']);
    assert.equal(d.slides[5].src, 'html-06/index.html');
    assert.equal(d.slides[6].src, 'html-07/situs/index.html');
    assert.equal(d.slides[7].video, 'media/video-08.mp4');
    assert.equal(d.slides[7].mustWatch, true);
    assert.match(d.slides[1].cards[0].image, /^media\/kartu-02-1\.svg$/);
    const quiz = d.slides[4];
    assert.deepEqual(quiz.questions.map((q) => q.id), ['s_kuis_q1', 's_kuis_q2', 's_kuis_q3']);
    assert.deepEqual(quiz.questions[1].correct, [0, 1, 3]);
    assert.deepEqual(quiz.questions[2].options, ['Benar', 'Salah']);
    assert.equal(d.passingScore, 80);
    assert.equal(d.certificate, true);
    assert.match(await zip.file('index.html').async('string'), /<title>Pengenalan Alat Pelindung Diri \(APD\)<\/title>/);
    assert.match(await zip.file('html-06/index.html').async('string'), /<!doctype html>[\s\S]*<iframe src="https:\/\/example.com">/);
  });
}

test('pilihan kosong dibuang & kunci ikut bergeser; kursus tanpa kuis tanpa nilai lulus', async () => {
  const p = { title: 'T', slides: [{ id: 'q', type: 'quiz', title: 'K', questions: [{ type: 'multi', text: 'x', options: ['', 'A', '', 'B', 'C'], correct: [1, 4] }] }] };
  const d = await toCourseData(p, () => '', async () => ({}));
  assert.deepEqual(d.slides[0].questions[0].options, ['A', 'B', 'C']);
  assert.deepEqual(d.slides[0].questions[0].correct, [0, 2]);
  const d2 = await toCourseData({ title: 'T', slides: [{ id: 'c', type: 'content', title: 'a', body: 'b' }] }, () => '', async () => ({}));
  assert.equal(d2.passingScore, null);
});

test('findZipEntry & wrapHtml', () => {
  assert.equal(findZipEntry(['a/b/page.html', 'a/index.html', 'z.css']), 'a/index.html');
  assert.equal(findZipEntry(['x/hal.htm']), 'x/hal.htm');
  assert.equal(findZipEntry(['x.css']), null);
  assert.equal(wrapHtml('<!doctype html><p>x'), '<!doctype html><p>x');
  assert.match(wrapHtml('<p>x</p>', 'Judul'), /<title>Judul<\/title>[\s\S]*<p>x<\/p>/);
});
