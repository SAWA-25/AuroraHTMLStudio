import { useEffect, useRef } from 'react';
import { useActivity } from './useActivity.js';

import { createBurstField, createStippleField } from './stipple.js';
function drawStipple(canvas, size, field, burstField, mobile, night, progress, reduced) {
  const { width, height } = size;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const boundary = width * (mobile ? (night ? 0.33 : 0.67) : (night ? 0.28 : 0.72));
  for (const particle of field) {
    ctx.fillStyle = night ? `rgba(236,233,225,${particle.alpha})` : `rgba(20,21,24,${particle.alpha})`;
    ctx.beginPath();
    ctx.arc(boundary + particle.distance, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (reduced || progress >= 1 || !burstField) return;
  const convergeAt = 0.38;
  const movingOut = progress >= convergeAt;
  const phase = movingOut ? (progress - convergeAt) / (1 - convergeAt) : progress / convergeAt;
  const eased = phase * (2 - phase);
  for (const particle of burstField) {
    const startX = particle.sourceX;
    const startY = particle.sourceY;
    const gatheredX = boundary;
    const gatheredY = particle.y;
    const x = movingOut ? gatheredX + particle.side * particle.spread * eased : startX + (gatheredX - startX) * eased;
    const y = movingOut ? gatheredY + particle.drift * eased * 14 : startY + (gatheredY - startY) * eased;
    const alpha = movingOut ? 0.62 * (1 - eased) : 0.2 + 0.44 * eased;
    ctx.fillStyle = night ? `rgba(236,233,225,${alpha})` : `rgba(13,43,216,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, particle.particleRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function CanvasStipple({ night, reduced = false, burstKey = 0, burstOrigin = null }) {
  const canvasRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0, mobile: false });
  const fieldRef = useRef({ key: '', value: [] });
  const burstRef = useRef({ key: -1, geometryKey: '', started: 0, value: null });
  const active = useActivity(canvasRef, true);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let frame = 0;
    let progress = 1;
    const draw = time => {
      const { width, height, mobile } = sizeRef.current;
      if (!width || !height) return;
      progress = reduced || !burstKey ? 1 : Math.min(1, (time - burstRef.current.started) / 760);
      drawStipple(canvas, sizeRef.current, fieldRef.current.value, burstRef.current.value, mobile, night, progress, reduced);
    };
    const measure = entry => {
      const rect = entry?.contentRect || canvas.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height, mobile: window.innerWidth <= 800 };
      const { width, height, mobile } = sizeRef.current;
      const fieldKey = `${Math.round(width)}:${Math.round(height)}:${reduced}`;
      if (fieldRef.current.key !== fieldKey) fieldRef.current = { key: fieldKey, value: createStippleField(width, height, reduced) };
      const burstGeometryKey = `${Math.round(width)}:${Math.round(height)}:${Math.round(burstOrigin?.x ?? width * 0.5)}:${Math.round(burstOrigin?.y ?? height * 0.5)}`;
      if (burstRef.current.key !== burstKey || burstRef.current.geometryKey !== burstGeometryKey) {
        burstRef.current = {
          key: burstKey,
          geometryKey: burstGeometryKey,
          started: burstKey ? performance.now() : 0,
          value: burstKey ? createBurstField(width, height, burstKey, burstOrigin) : null,
        };
      }
      if (mobile !== sizeRef.current.mobile) sizeRef.current.mobile = mobile;
      draw(performance.now());
    };
    const observer = new ResizeObserver(entries => measure(entries[0]));
    observer.observe(canvas);
    window.addEventListener('resize', measure);
    measure();
    const loop = time => {
      draw(time);
      if (active && !reduced && progress < 1) frame = window.requestAnimationFrame(loop);
      else frame = 0;
    };
    if (active && !reduced && burstKey > 0) frame = window.requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [active, night, reduced, burstKey, burstOrigin]);
  return <canvas ref={canvasRef} className="orrery-stipple" aria-hidden="true" />;
}
