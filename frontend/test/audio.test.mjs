import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, findLyricIndex, formatTime, parseLrc } from '../src/useLocalAudio.js';

test('clamp and time formatting cover bounds and invalid media time', () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(3, 0, 1), 1);
  assert.equal(clamp(Number.NaN, 0, 1), 0);
  assert.equal(formatTime(65.9), '01:05');
  assert.equal(formatTime(Number.NaN), '--:--');
});

test('LRC parses sorted multiple stamps and millisecond offset', () => {
  const lines = parseLrc('[offset:-250]\n[00:02.50][00:05.25]second\n[00:01.123]first');
  assert.deepEqual(lines, [
    { time: 0.873, text: 'first' },
    { time: 2.25, text: 'second' },
    { time: 5, text: 'second' },
  ]);
  assert.equal(findLyricIndex(lines, 0.872), -1);
  assert.equal(findLyricIndex(lines, 2.3), 1);
  assert.equal(findLyricIndex(lines, 8), 2);
});

test('LRC rejects oversized source and line count', () => {
  assert.throws(() => parseLrc('x'.repeat(1024 * 1024 + 1)), /1 MB/);
  const tooMany = Array.from({ length: 5001 }, (_, index) => `[00:${String(index % 60).padStart(2, '0')}][01:00]x`).join('\n');
  assert.throws(() => parseLrc(tooMany), /10,000/);
});
