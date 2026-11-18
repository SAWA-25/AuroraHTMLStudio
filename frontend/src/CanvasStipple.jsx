import { useEffect, useRef } from 'react';
import { useActivity } from './useActivity.js';

function drawStipple(canvas, width, height, night, reduced) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const boundary = width * (night ? 0.18 : 0.72);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const count = reduced ? Math.round(height * 0.08) : Math.round(height * 0.42);
  let seed = Math.round(width * 13 + height * 7 + (night ? 911 : 271));
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    const y = random() * height;
    const distance = (random() ** 2) * (reduced ? 18 : 82) * (random() > 0.5 ? 1 : -1);
    const x = boundary + distance;
    const radius = 0.3 + random() * (reduced ? 0.45 : 1.15);
    const alpha = (0.05 + random() * 0.22) * (1 - Math.min(1, Math.abs(distance) / (reduced ? 22 : 110)));
    ctx.fillStyle = night ? `rgba(236,233,225,${alpha})` : `rgba(20,21,24,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function CanvasStipple({ night, reduced = false }) {
  const canvasRef = useRef(null);
  const active = useActivity(canvasRef, true);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      drawStipple(canvas, rect.width, rect.height, night, reduced);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let frame = 0;
    let last = 0;
    const loop = (time) => {
      if (active && !reduced && time - last > 140) {
        last = time;
        resize();
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [active, night, reduced]);
  return <canvas ref={canvasRef} className="orrery-stipple" aria-hidden="true" />;
}
