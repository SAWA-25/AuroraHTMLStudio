export const TAU = Math.PI * 2;
export const PHI = (1 + Math.sqrt(5)) / 2;
export const ease = [0.22, 1, 0.36, 1];
export const birdPath = 'M-34,-7 C-24,-8 -15,-4 -6,0 C-15,-14 -24,-23 -34,-29 C-13,-25 -1,-13 4,-6 C11,-16 24,-22 39,-23 C28,-14 19,-4 12,3 C15,8 17,14 18,19 L7,12 L3,26 L-1,11 C-13,7 -24,2 -34,-7 Z';
export const polar = (cx, cy, rx, theta, ry = rx) => ({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
export function orbitPoint(theta, rotation = 0, cx = 500, cy = 450, rx = 356, ry = 168) {
  const x = rx * Math.cos(theta), y = ry * Math.sin(theta);
  return { x: cx + x * Math.cos(rotation) - y * Math.sin(rotation), y: cy + x * Math.sin(rotation) + y * Math.cos(rotation) };
}
export function orbitAngleFromPoint(pointValue, rotation = 0, cx = 500, cy = 450, rx = 356, ry = 168) {
  const dx = pointValue.x - cx, dy = pointValue.y - cy;
  const x = dx * Math.cos(rotation) + dy * Math.sin(rotation);
  const y = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.atan2(y / ry, x / rx);
}
export const point = p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
export function spiralPoint(t, cx = 500, cy = 450, radius = 322) {
  const r = radius * Math.exp(Math.log(PHI) / (Math.PI / 2) * (t - TAU * 1.65));
  return polar(cx, cy, r, t - 1.15, r * 0.96);
}
export function spiralSteps(count = 132, cx = 500, cy = 450, radius = 322) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / count * TAU * 1.65;
    const next = (i + 0.85) / count * TAU * 1.65;
    const a = spiralPoint(t, cx, cy, radius), b = spiralPoint(next, cx, cy, radius);
    const inside = p => ({ x: cx + (p.x - cx) * 0.53, y: cy + (p.y - cy) * 0.53 });
    const c = inside(b), innerStart = inside(a);
    return { d: `M${point(a)} L${point(b)} L${point(c)} L${point(innerStart)} Z`, shade: 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t - 0.8)), t, a, b, c, innerStart };
  });
}
export function eyeOutlinePath(count = 180, cx = 500, cy = 450, rx = 382, ry = 150) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const theta = -i / count * TAU;
    const sine = Math.sin(theta);
    const p = { x: cx + rx * Math.cos(theta), y: cy + ry * sine * Math.abs(sine) ** 0.45 };
    return `${i ? 'L' : 'M'}${point(p)}`;
  }).join(' ');
}
export function spiralPath(count = 180, cx = 500, cy = 450, radius = 322) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const p = spiralPoint(i / count * TAU * 1.65, cx, cy, radius);
    return `${i ? 'L' : 'M'}${point(p)}`;
  }).join(' ');
}
export function eyeToSpiralPath(count = 180, cx = 500, cy = 450, radius = 322) {
  const turns = TAU * 1.65;
  const outer = spiralPoint(turns, cx, cy, radius);
  const rotation = -Math.atan2(outer.y - cy, outer.x - cx);
  const scale = radius / Math.hypot(outer.x - cx, outer.y - cy);
  return Array.from({ length: count + 1 }, (_, i) => {
    const p = spiralPoint(turns * (1 - i / count), cx, cy, radius);
    const x = p.x - cx, y = p.y - cy;
    const aligned = { x: cx + (x * Math.cos(rotation) - y * Math.sin(rotation)) * scale, y: cy + (x * Math.sin(rotation) + y * Math.cos(rotation)) * scale };
    return `${i ? 'L' : 'M'}${point(aligned)}`;
  }).join(' ');
}
export function brushPath(progress) {
  const t = Math.max(0, Math.min(1, progress));
  const edge = 1320 * t;
  const wave = 120 * Math.sin(Math.PI * t);
  const n = value => value.toFixed(3);
  return `M0,0 L${n(edge)},0 C${n(edge + wave)},100 ${n(edge - wave)},180 ${n(edge)},260 C${n(edge - wave)},340 ${n(edge + wave)},420 ${n(edge)},500 C${n(edge + wave)},600 ${n(edge - wave)},700 ${n(edge)},780 C${n(edge - wave)},860 ${n(edge + wave)},940 ${n(edge)},1000 L0,1000 Z`;
}
export function eyeFacet(i, count = 132) {
  const theta = i / count * TAU, next = (i + 0.85) / count * TAU;
  const eyePoint = (a, inner) => {
    const x = Math.cos(a), s = Math.sin(a);
    return { x: 500 + x * (inner ? 104 : 390), y: 450 + s * (inner ? 104 : 150) * (inner ? 1 : Math.abs(s) ** 0.45) };
  };
  return `M${point(eyePoint(theta, false))} L${point(eyePoint(next, false))} L${point(eyePoint(next, true))} L${point(eyePoint(theta, true))} Z`;
}
export function arc(cx, cy, r, start, end) {
  const a = polar(cx, cy, r, start), b = polar(cx, cy, r, end);
  return `M${point(a)} A${r},${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(b)}`;
}
export function random(seed = 214013) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
export const wrapAngle = a => ((a % TAU) + TAU) % TAU;
export function nearestNode(angle, count = 5) {
  return ((Math.round(-angle / (TAU / count)) % count) + count) % count;
}
