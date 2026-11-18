import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { arc, birdPath, ease, eyeFacet, eyeOutlinePath, eyeToSpiralPath, orbitAngleFromPoint, orbitPoint, polar, spiralPath, spiralPoint, spiralSteps, wrapAngle } from './geometry.js';
import { CanvasStipple } from './CanvasStipple.jsx';
import { useActivity } from './useActivity.js';

const NODES = [
  { id: 'chat', label: 'Chat', zh: '聊天', angle: -1.98, note: '信笺 / LETTERS' },
  { id: 'home', label: 'Home', zh: '小家', angle: -0.72, note: '星盘 / ORRERY' },
  { id: 'life', label: 'Life', zh: '生活', angle: 0.55, note: '日常 / DAILY' },
  { id: 'hold', label: 'Hold', zh: '贴贴', angle: 1.82, note: '收藏 / KEEP' },
  { id: 'listen', label: 'Listen', zh: '一起听', angle: 3.02, note: '唱针 / NEEDLE' },
];

function OrbitSvg({ forwardedRef, pupilRef, angle, night, onToggleNight, onSelect, onRotate, birdsPaused }) {
  const reduced = useReducedMotion();
  const ref = forwardedRef;
  const dragRef = useRef(null);
  const nodeButtonRefs = useRef([]);
  const layoutRef = useRef(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [dragging, setDragging] = useState(false);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return undefined;
    const measure = () => {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const next = { a: matrix.a, c: matrix.c, e: matrix.e, boundary: window.innerWidth * (window.innerWidth <= 800 ? .67 : .72) };
      const prior = layoutRef.current;
      if (prior && prior.a === next.a && prior.c === next.c && prior.e === next.e && prior.boundary === next.boundary) return;
      layoutRef.current = next;
      setLayoutVersion(version => version + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    const svg = ref.current;
    if (!svg?.pauseAnimations) return;
    if (birdsPaused) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [birdsPaused, night, reduced]);
  const points = useMemo(() => NODES.map(node => {
    const base = polar(500, 450, 356, node.angle, 168);
    const rotated = orbitPoint(node.angle, angle);
    const matrix = layoutRef.current;
    const screenX = matrix ? matrix.a * rotated.x + matrix.c * rotated.y + matrix.e : rotated.x;
    const boundary = matrix?.boundary ?? (window.innerWidth <= 800 ? 670 : 720);
    return { ...node, point: base, onDark: !night && screenX > boundary };
  }), [angle, night, layoutVersion]);
  const activeNode = useMemo(() => NODES.reduce((best, node, index) => {
    const distance = Math.abs(Math.atan2(Math.sin(node.angle + angle), Math.cos(node.angle + angle)));
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Infinity }).index, [angle]);
  const eyePath = useMemo(() => eyeOutlinePath(), []);
  const spiralMorph = useMemo(() => eyeToSpiralPath(180, 500, 450, 382), []);
  const flightPath = useMemo(() => spiralPath(), []);
  const spiral = useMemo(() => spiralSteps(96, 500, 450, 300), []);
  const toSvgPoint = useCallback(event => {
    const svg = ref.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }, []);
  const pointerOrbitAngle = useCallback((event, rotation) => {
    const point = toSvgPoint(event);
    return point ? orbitAngleFromPoint(point, rotation) : null;
  }, [toSvgPoint]);
  const handlePointerDown = event => {
    if (event.target.closest?.('button')) return;
    const pointerAngle = pointerOrbitAngle(event, angle);
    if (pointerAngle == null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startPointer: pointerAngle, startOrbit: angle };
    setDragging(true);
  };
  const handlePointerMove = event => {
    const drag = dragRef.current;
    if (!drag) return;
    const pointerAngle = pointerOrbitAngle(event, drag.startOrbit);
    if (pointerAngle == null) return;
    let delta = pointerAngle - drag.startPointer;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    onRotate(wrapAngle(drag.startOrbit + delta));
  };
  const handlePointerUp = event => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };
  const focusNode = index => {
    onRotate(wrapAngle(-NODES[index].angle));
    nodeButtonRefs.current[index]?.focus();
  };
  const selectNode = (node, index) => {
    onRotate(wrapAngle(-node.angle));
    onSelect(node.id, index);
  };
  const handleNodeKey = (event, index) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % NODES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + NODES.length) % NODES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = NODES.length - 1;
    else return;
    event.preventDefault();
    focusNode(next);
  };
  const lashAngles = Array.from({ length: 15 }, (_, i) => Math.PI + 0.12 + i / 14 * (Math.PI - 0.24));
  return <svg ref={ref} className={`orrery-svg ${dragging ? 'is-dragging' : ''}`} viewBox="0 0 1000 900" role="group" aria-label="可拖动的五节点星盘菜单" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
    <defs>
      <filter id="orrery-paper-noise" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" seed="17" result="grain" />
        <feColorMatrix in="grain" type="saturate" values="0" result="mono" />
        <feComponentTransfer in="mono"><feFuncA type="table" tableValues="0 .06" /></feComponentTransfer>
      </filter>
      <clipPath id="orrery-eye-clip"><ellipse cx="500" cy="450" rx="382" ry="150" /></clipPath>
      <radialGradient id="orrery-blue-core"><stop offset="0" stopColor="#7c8cff" stopOpacity=".9" /><stop offset=".54" stopColor="#0D2BD8" /><stop offset="1" stopColor="#0D2BD8" stopOpacity=".12" /></radialGradient>
      <path id="orrery-night-flight-path" d={flightPath} fill="none" />
    </defs>
    <rect className="orrery-grain" width="1000" height="900" fill="#fff" filter="url(#orrery-paper-noise)" opacity=".06" pointerEvents="none" />
    <g className="orrery-architectural" opacity={night ? '.22' : '.42'} aria-hidden="true">
      <path d="M82 118 H918 M38 190 H962 M102 736 H902 M164 95 V805 M286 80 V824 M712 76 V824 M836 94 V804" />
      <path d="M120 680 L500 112 L884 680 M202 680 L500 238 L798 680 M330 680 L500 384 L670 680" />
      {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${140 + i * 110} 680 L500 ${170 + i * 48}`} />)}
    </g>
    <g className="orrery-orbits" transform={`rotate(${(angle * 180) / Math.PI} 500 450)`} aria-hidden="true">
      <ellipse cx="500" cy="450" rx="356" ry="168" />
      <ellipse cx="500" cy="450" rx="294" ry="132" />
      <ellipse cx="500" cy="450" rx="208" ry="94" />
      <path d={arc(500, 450, 262, -2.6, 1.1)} />
      <path d={arc(500, 450, 321, 0.4, 3.35)} />
      {Array.from({ length: 7 }, (_, i) => { const x = 180 + i * 106; return <text key={i} x={x} y="222" transform={`rotate(${-angle * 180 / Math.PI} ${x} 222)`}>0{i + 1}</text>; })}
    </g>
    <motion.path className="orrery-morph-path" d={eyePath} initial={false} animate={{ d: night ? spiralMorph : eyePath, fillOpacity: night ? 0 : .14, strokeOpacity: night ? .22 : 1 }} transition={{ duration: reduced ? .16 : .68, ease }} aria-hidden="true" />
    <motion.g className="orrery-eye" initial={false} animate={{ opacity: night ? 0 : 1 }} transition={{ duration: reduced ? .16 : .38, ease }} aria-hidden="true">
      <g clipPath="url(#orrery-eye-clip)">
        {Array.from({ length: 48 }, (_, i) => <path key={i} d={eyeFacet(i, 48)} opacity={.12 + (i % 5) * .07} />)}
        <ellipse cx="500" cy="450" rx="112" ry="112" fill="url(#orrery-blue-core)" />
        <ellipse cx="500" cy="450" rx="48" ry="48" fill="#121316" />
        <ellipse cx="484" cy="432" rx="11" ry="18" fill="#ECE9E1" opacity=".75" />
      </g>
      {lashAngles.map((theta, i) => {
        const x = 500 + 390 * Math.cos(theta);
        const sin = Math.sin(theta);
        const y = 450 + 150 * sin * Math.abs(sin) ** .45;
        return <path key={i} className="orrery-bird" d={birdPath} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${.12 + (i % 3) * .018}) rotate(${(Math.cos(theta) * 24).toFixed(1)})`} />;
      })}
    </motion.g>
    <motion.g className="orrery-night-steps" initial={false} animate={{ opacity: night ? 1 : 0 }} transition={{ duration: reduced ? .16 : .5, ease }} aria-hidden="true">
      {spiral.map((step, index) => <path key={index} d={step.d} opacity={0.12 + step.shade * .46} />)}
    </motion.g>
    {night && !reduced && <g className="orrery-night-birds" aria-hidden="true">
      {[{ color: 'paper', begin: '0s' }, { color: 'blue', begin: '-2.4s' }, { color: 'paper', begin: '-4.8s' }].map((bird, index) => <path key={index} className={`orrery-flight-bird ${bird.color}`} d={birdPath} transform={`scale(${index === 1 ? .22 : .17})`}>
        <animateMotion dur="7.2s" begin={bird.begin} repeatCount="indefinite" rotate="auto"><mpath href="#orrery-night-flight-path" /></animateMotion>
      </path>)}
    </g>}
    {night && reduced && <g className="orrery-night-birds" aria-hidden="true">
      {[{ t: 1.3, color: 'paper' }, { t: 3.4, color: 'blue' }, { t: 5.5, color: 'paper' }].map((bird, index) => {
        const p = spiralPoint(bird.t, 500, 450, 300);
        return <path key={index} className={`orrery-flight-bird ${bird.color}`} d={birdPath} transform={`translate(${p.x} ${p.y}) scale(${index === 1 ? .22 : .17})`} />;
      })}
    </g>}
    <foreignObject className={`orrery-pupil-hitbox ${night ? 'is-night' : ''}`} x="452" y="402" width="96" height="96">
      <button ref={pupilRef} type="button" className="orrery-pupil-button" onPointerDown={event => event.stopPropagation()} onClick={onToggleNight} aria-label={night ? '切换昼间星盘' : '切换夜间螺旋'} title={night ? '切换昼间星盘' : '切换夜间螺旋'} />
    </foreignObject>
    <g className="orrery-nodes" transform={`rotate(${(angle * 180) / Math.PI} 500 450)`} aria-label="功能入口">
      {points.map((node, index) => <g key={node.id} className={`orrery-node ${activeNode === index ? 'is-active' : ''} ${node.onDark ? 'on-dark' : ''}`} transform={`translate(${node.point.x} ${node.point.y})`}>
        <circle r={activeNode === index ? 31 : 25} aria-hidden="true" />
        <circle className="node-dot" r={activeNode === index ? 5 : 3} aria-hidden="true" />
        <g transform={`rotate(${-angle * 180 / Math.PI})`}>
          <text y="-45" aria-hidden="true">{node.label}</text>
          <text className="node-zh" y="-28" aria-hidden="true">{node.zh}</text>
          <text className="node-note" y="59" aria-hidden="true">{node.note}</text>
        </g>
        <foreignObject x="-44" y="-44" width="88" height="88"><button ref={element => { nodeButtonRefs.current[index] = element; }} type="button" aria-label={`${node.label} ${node.zh}`} onKeyDown={event => handleNodeKey(event, index)} onPointerDown={event => event.stopPropagation()} onClick={() => selectNode(node, index)} /></foreignObject>
      </g>)}
    </g>
  </svg>;
}

function Compass({ night, onToggle }) {
  return <button type="button" className="orrery-compass" onClick={onToggle} aria-label={night ? '切换昼间星盘' : '切换夜间螺旋'}>
    <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="64" /><circle cx="80" cy="80" r="47" /><path d="M80 18 V32 M80 128 V142 M18 80 H32 M128 80 H142" /><path d="M80 53 C95 53 106 64 106 80 C106 96 95 107 80 107 C65 107 54 96 54 80 C54 64 65 53 80 53 Z" /><circle cx="80" cy="80" r="8" /></svg>
    <span>{night ? 'NIGHT / 螺旋' : 'DAY / 星盘'}</span>
  </button>;
}

function readAngle() {
  try {
    const value = Number(window.localStorage.getItem('orrery-angle'));
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    console.warn('[orrery] unable to read orbit angle', error);
    return 0;
  }
}

function persistAngle(value) {
  try { window.localStorage.setItem('orrery-angle', String(value)); }
  catch (error) { console.warn('[orrery] orbit angle was not persisted', error); }
}

export function Home({ night, onToggleNight, onNavigate }) {
  const reduced = useReducedMotion();
  const [angle, setAngle] = useState(readAngle);
  const [menuOpen, setMenuOpen] = useState(false);
  const [birdsPaused, setBirdsPaused] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const svgRef = useRef(null);
  const pupilRef = useRef(null);
  const homeRef = useRef(null);
  const [burstOrigin, setBurstOrigin] = useState(null);
  const pageActive = useActivity(svgRef, true);
  const shouldPauseBirds = birdsPaused || !pageActive || Boolean(reduced);
  const menuToggleRef = useRef(null);
  const firstMenuActionRef = useRef(null);
  const rotate = useCallback(next => { setAngle(next); persistAngle(next); }, []);
  const toggleNight = useCallback(() => {
    const hostRect = homeRef.current?.getBoundingClientRect();
    const pupilRect = pupilRef.current?.getBoundingClientRect();
    if (hostRect && pupilRect && hostRect.width > 0 && hostRect.height > 0) {
      setBurstOrigin({
        x: pupilRect.left + pupilRect.width / 2 - hostRect.left,
        y: pupilRect.top + pupilRect.height / 2 - hostRect.top,
      });
    } else setBurstOrigin(null);
    setBurstKey(key => key + 1);
    onToggleNight();
  }, [onToggleNight]);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuToggleRef.current?.focus();
  }, []);
  useEffect(() => { if (menuOpen) firstMenuActionRef.current?.focus(); }, [menuOpen]);
  const actions = [
    { id: 'chat', label: '01', sub: 'CHAT', title: '打开信笺聊天' },
    { id: 'listen', label: '02', sub: 'LISTEN', title: '打开音乐页' },
    { id: 'workspace', label: '03', sub: 'WORK', title: '返回原生工作台' },
  ];
  return <motion.main ref={homeRef} className={`orrery-home ${night ? 'is-night' : 'is-day'}`} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? .15 : .55, ease }}>
    <CanvasStipple night={night} reduced={Boolean(reduced)} burstKey={burstKey} burstOrigin={burstOrigin} />
    <header className="orrery-masthead"><span>16:53 · WED 11 NOV</span><span>FIELD NOTE 05 / AURORA</span></header>
    <section className="orrery-intro"><p className="eyebrow">A SMALL ORRERY FOR EVERYDAY THINGS</p><h1>Between a well<br />and the moon.</h1><p className="intro-copy">拖动星轨，进入一封信、一段声音，或把今天收进底舱。</p></section>
    <OrbitSvg forwardedRef={svgRef} pupilRef={pupilRef} angle={angle} night={night} onToggleNight={toggleNight} onSelect={onNavigate} onRotate={rotate} birdsPaused={shouldPauseBirds} />
    {night && !reduced && <button type="button" className="orrery-motion-toggle" aria-label={birdsPaused ? '继续飞燕动画' : '暂停飞燕动画'} aria-pressed={birdsPaused} onClick={() => setBirdsPaused(value => !value)}>{birdsPaused ? '继续飞燕' : '暂停飞燕'}</button>}
    <Compass night={night} onToggle={toggleNight} />
    <div className={`orrery-quarter ${menuOpen ? 'is-open' : ''}`} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(); } }}>
      <button ref={menuToggleRef} type="button" className="quarter-toggle" aria-controls="orrery-quarter-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? '关闭快捷轮盘' : '打开快捷轮盘'}><span aria-hidden="true">+</span></button>
      <div id="orrery-quarter-menu" className="quarter-menu" aria-label="快捷入口" aria-hidden={!menuOpen} inert={!menuOpen}>
        <svg className="quarter-arc" viewBox="0 0 150 150" aria-hidden="true"><path d="M18 132 A114 114 0 0 1 132 18" /></svg>
        {actions.map((action, index) => {
          const theta = -Math.PI / 2 + index * Math.PI / 4;
          const radius = 102;
          const left = 27 + Math.cos(theta) * radius - 32;
          const top = 153 + Math.sin(theta) * radius - 23;
          return <button key={action.id} ref={index === 0 ? firstMenuActionRef : null} type="button" tabIndex={menuOpen ? 0 : -1} style={{ left, top }} aria-label={action.title} onClick={() => { setMenuOpen(false); onNavigate(action.id); }}>{action.label}<br /><small>{action.sub}</small></button>;
        })}
      </div>
    </div>
    <footer className="orrery-footer"><span>BLUE EYE / PAPER GRAIN / 01—07</span><span>原生工作台仍在运行 · React presentation layer</span></footer>
  </motion.main>;
}
