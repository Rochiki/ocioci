import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('./lipsync.js'); // skrip biasa: mendaftar ke globalThis.StudioLip
const StudioLip = globalThis.StudioLip;

test('fromText: panjang jalur = durasi × 25, hanya 0/1/2', () => {
  const t = StudioLip.fromText('Selamat datang di pelatihan keselamatan kerja.', 4);
  assert.equal(t.length, 100);
  assert.match(t, /^[012]+$/);
});

test('fromText: huruf a/o membuka lebar, i/u/e setengah, jeda di titik & koma', () => {
  const a = StudioLip.fromText('aaaa', 1), i = StudioLip.fromText('iiii', 1);
  assert.ok(a.includes('2') && !a.includes('1'), a);
  assert.ok(i.includes('1') && !i.includes('2'), i);
  const t = StudioLip.fromText('mata. mata', 2);
  const mid = t.slice(Math.round(t.length * 0.45), Math.round(t.length * 0.62));
  assert.match(mid, /0{3,}/, 'ada jeda mulut tertutup di titik: ' + t);
});

test('fromText: teks kosong / tanpa durasi → kosong; markdown tidak dibaca', () => {
  assert.equal(StudioLip.fromText('', 3), '');
  assert.equal(StudioLip.fromText('halo', 0), '');
  assert.equal(StudioLip.fromText('**#**', 2), '');
});

test('wordFrames & vowelShapes', () => {
  assert.ok(StudioLip.wordFrames('keselamatan', 800).length >= 18);
  assert.deepEqual(StudioLip.vowelShapes('saya mau'), [2, 2, 2]);
  assert.deepEqual(StudioLip.vowelShapes('ibu'), [1, 1]);
});
