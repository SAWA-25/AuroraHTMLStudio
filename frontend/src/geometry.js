export const TAU = Math.PI * 2;
export const PHI = (1 + Math.sqrt(5)) / 2;
export const ease = [0.22, 1, 0.36, 1];
export const birdPath = 'M-34,-7 C-24,-8 -15,-4 -6,0 C-15,-14 -24,-23 -34,-29 C-13,-25 -1,-13 4,-6 C11,-16 24,-22 39,-23 C28,-14 19,-4 12,3 C15,8 17,14 18,19 L7,12 L3,26 L-1,11 C-13,7 -24,2 -34,-7 Z';
export const polar = (cx, cy, rx, theta, ry = rx) => ({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
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
