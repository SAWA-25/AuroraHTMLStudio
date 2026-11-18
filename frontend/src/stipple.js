const seedRandom = seed => {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
};

export function createStippleField(width, height, reduced = false) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const random = seedRandom(Math.imul(safeWidth, 13) + Math.imul(safeHeight, 7) + (reduced ? 53 : 97));
  const count = Math.round(safeHeight * (reduced ? 0.08 : 0.82));
  return Array.from({ length: count }, () => {
    const y = random() * safeHeight;
    const distance = random() ** 2 * (reduced ? 18 : 82) * (random() > 0.5 ? 1 : -1);
    const alpha = (0.05 + random() * 0.22) * (1 - Math.min(1, Math.abs(distance) / (reduced ? 22 : 110)));
    const radius = 0.3 + random() * (reduced ? 0.45 : 1.15);
    return { y, distance, alpha, radius };
  });
}

export function createBurstField(width, height, key, origin) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const random = seedRandom(0x6d2b79f5 ^ key ^ Math.imul(safeWidth, 31) ^ Math.imul(safeHeight, 17));
  const centerX = Math.max(0, Math.min(safeWidth, origin?.x ?? safeWidth * 0.5));
  const centerY = Math.max(0, Math.min(safeHeight, origin?.y ?? safeHeight * 0.5));
  const count = Math.min(1600, Math.round(safeHeight * 1.1));
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 34;
    return {
      sourceX: centerX + Math.cos(angle) * radius,
      sourceY: centerY + Math.sin(angle) * radius,
      y: random() * safeHeight,
      side: random() > 0.5 ? 1 : -1,
      spread: 8 + random() ** 2 * Math.min(130, safeWidth * 0.2),
      particleRadius: 0.35 + random() * 1.35,
      drift: random() - 0.5,
    };
  });
}
