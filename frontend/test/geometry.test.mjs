import test from 'node:test';
import assert from 'node:assert/strict';
import { brushPath, eyeOutlinePath, eyeToSpiralPath, orbitAngleFromPoint, orbitPoint, spiralPath, spiralSteps, eyeFacet } from '../src/geometry.js';

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('rotated elliptical orbit points invert to their original parameter', () => {
  for (const rotation of [-Math.PI, -1.2, 0, 0.8, Math.PI]) {
    for (const theta of [-Math.PI, -1.98, -0.72, 0.55, 1.82, 3.02, Math.PI]) {
      const actual = orbitAngleFromPoint(orbitPoint(theta, rotation), rotation);
      near(Math.atan2(Math.sin(actual - theta), Math.cos(actual - theta)), 0);
    }
  }
});

test('elliptical nodes follow the actual rotated ellipse, not a re-parameterized ellipse', () => {
  const rotation = 0.73, theta = -1.98;
  const p = orbitPoint(theta, rotation);
  const dx = p.x - 500, dy = p.y - 450;
  const x = dx * Math.cos(rotation) + dy * Math.sin(rotation);
  const y = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
  near((x / 356) ** 2 + (y / 168) ** 2, 1);
});

test('eye morph begins at the same outer anchor and brush wipe spans the viewport', () => {
  const eye = eyeOutlinePath();
  const spiral = eyeToSpiralPath(180, 500, 450, 382);
  assert.equal(eye.match(/^M([^ ]+)/)?.[1], spiral.match(/^M([^ ]+)/)?.[1]);
  assert.equal(spiral.match(/^M([^ ]+)/)?.[1], '882.000,450.000');
  assert.ok(brushPath(0).startsWith('M0,0 L0.000,0'));
  assert.ok(brushPath(1).startsWith('M0,0 L1320.000,0'));
  assert.ok(brushPath(.5).startsWith('M0,0 L660.000,0'));
  assert.notEqual(brushPath(.5), brushPath(0));
});

test('spiral geometry is complete and numerically finite', () => {
  const path = spiralPath();
  const steps = spiralSteps(96);
  const eye = eyeOutlinePath();
  assert.match(path, /^M/);
  assert.equal((path.match(/L/g) || []).length, 180);
  assert.equal((eye.match(/L/g) || []).length, 180);
  assert.equal(steps.length, 96);
  assert.ok(steps.every(step => Number.isFinite(step.a.x + step.a.y + step.b.x + step.b.y)));
  assert.match(eyeFacet(3, 48), /^M/);
});
