import test from 'node:test';
import assert from 'node:assert/strict';
import { genderOf, applyVoiceOverride, edgeVoiceFor, piperPitchFor, FEMALE, MALE, MALE_PITCH_SHIFT } from './voicepick.js';

test('jenis suara default perempuan; mengikuti pilihan eksplisit atau nama suara', () => {
  assert.equal(genderOf({}), 'perempuan');
  assert.equal(genderOf({ voice: MALE }), 'laki');
  assert.equal(genderOf({ voice: MALE, gender: 'perempuan' }), 'perempuan');
});

test('suara Microsoft/server mengikuti jenis suara; suara khusus bahasa lain tidak ditimpa', () => {
  assert.equal(edgeVoiceFor({ gender: 'laki' }), MALE);
  assert.equal(edgeVoiceFor({ gender: 'perempuan', voice: MALE }), FEMALE);
  assert.equal(edgeVoiceFor({ gender: 'laki', voice: 'en-US-GuyNeural' }), 'en-US-GuyNeural');
});

test('suara AI laki-laki menurunkan nada; perempuan tidak berubah', () => {
  assert.equal(piperPitchFor({}, 3), 3);
  assert.equal(piperPitchFor({ gender: 'laki' }, 3), 3 + MALE_PITCH_SHIFT);
  assert.ok(Math.pow(2, MALE_PITCH_SHIFT / 36) < 0.76);
});

test('pilihan per slide: piper (lama) = perempuan, piper-m = laki-laki, Ardi/Gadis ikut', () => {
  const base = { engine: 'edge', voice: FEMALE, gender: 'perempuan' };
  assert.deepEqual([applyVoiceOverride(base, { v: 'piper' }).engine, applyVoiceOverride(base, { v: 'piper' }).gender], ['piper', 'perempuan']);
  const m = applyVoiceOverride({ ...base, engine: 'piper' }, { v: 'piper-m' });
  assert.deepEqual([m.engine, m.gender], ['piper', 'laki']);
  const a = applyVoiceOverride({ engine: 'piper', gender: 'perempuan' }, { v: MALE });
  assert.deepEqual([a.engine, a.voice, a.gender], ['edge', MALE, 'laki']);
  assert.equal(applyVoiceOverride({ engine: 'server', url: 'x' }, { v: FEMALE }).engine, 'server');
  assert.deepEqual(applyVoiceOverride(base, null), base);
});
