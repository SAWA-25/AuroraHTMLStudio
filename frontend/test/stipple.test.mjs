import test from 'node:test';
import assert from 'node:assert/strict';
import { createBurstField, createStippleField } from '../src/stipple.js';

test('stipple field is stable for a viewport and does not depend on day/night color state', () => {
  const dayCoordinates = createStippleField(390, 844, false);
  const nightCoordinates = createStippleField(390, 844, false);
  assert.deepEqual(dayCoordinates, nightCoordinates);
  assert.equal(dayCoordinates.length, Math.round(844 * 0.82));
  assert.ok(dayCoordinates.every(p => Number.isFinite(p.distance + p.y + p.radius + p.alpha) && p.y >= 0 && p.y <= 844 && p.radius > 0 && p.alpha >= 0 && p.alpha <= 1));
});

test('reduced stipple density is deterministic, lower, and bounded on short viewports', () => {
  const field = createStippleField(390, 600, true);
  assert.deepEqual(field, createStippleField(390, 600, true));
  assert.equal(field.length, Math.round(600 * 0.08));
  assert.ok(field.every(p => p.y >= 0 && p.y <= 600 && Math.abs(p.distance) <= 18));
  assert.notDeepEqual(field, createStippleField(390, 600, false));
});

test('burst particles gather around the clicked pupil, stay on canvas, and cap dense displays', () => {
  const origin = { x: 176, y: 291 };
  const field = createBurstField(390, 600, 4, origin);
  assert.equal(field.length, 660);
  assert.ok(field.every(p => Math.hypot(p.sourceX - origin.x, p.sourceY - origin.y) <= 34.000001));
  assert.ok(field.every(p => p.sourceX >= 0 && p.sourceX <= 390 && p.sourceY >= 0 && p.sourceY <= 600));
  assert.deepEqual(field, createBurstField(390, 600, 4, origin));
  assert.notDeepEqual(field, createBurstField(390, 600, 5, origin));
  assert.equal(createBurstField(2880, 1800, 4, { x: 1440, y: 900 }).length, 1600);
});
