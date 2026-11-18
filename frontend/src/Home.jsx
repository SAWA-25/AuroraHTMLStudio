import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { arc, birdPath, ease, eyeFacet, polar, spiralSteps, wrapAngle } from './geometry.js';
import { CanvasStipple } from './CanvasStipple.jsx';

const NODES = [
  { id: 'chat', label: 'Chat', zh: '聊天', angle: -1.98, note: '信笺 / LETTERS' },
  { id: 'home', label: 'Home', zh: '小家', angle: -0.72, note: '星盘 / ORRERY' },
  { id: 'life', label: 'Life', zh: '生活', angle: 0.55, note: '日常 / DAILY' },
  { id: 'hold', label: 'Hold', zh: '贴贴', angle: 1.82, note: '收藏 / KEEP' },
  { id: 'listen', label: 'Listen', zh: '一起听', angle: 3.02, note: '唱针 / NEEDLE' },
];

function OrbitSvg({ angle, night, onSelect, onRotate }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [activeNode, setActiveNode] = useState(1);
  const points = useMemo(() => NODES.map(node => ({ ...node, point: polar(500, 450, 356, node.angle + angle, 168) })), [angle]);
  const pointerOrbitAngle = useCallback((event) => {
    const svg = ref.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const sx = ((event.clientX - rect.left) / rect.width) * 1000;
    const sy = ((event.clientY - rect.top) / rect.height) * 900;
    return Math.atan2((sy - 450) / 168, (sx - 500) / 356);
  }, []);
  const handlePointerDown = (event) => {
    const pointerAngle = pointerOrbitAngle(event);
    if (pointerAngle == null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startPointer: pointerAngle, startOrbit: angle };
    setDragging(true);
  };
  const handlePointerMove = (event) => {
    if (!dragging || !dragRef.current) return;
    const pointerAngle = pointerOrbitAngle(event);
    if (pointerAngle == null) return;
    let delta = pointerAngle - dragRef.current.startPointer;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    onRotate(wrapAngle(dragRef.current.startOrbit + delta));
  };
  const handlePointerUp = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };
  const setNode = (index) => {
    setActiveNode(index);
    onRotate(wrapAngle(-NODES[index].angle));
  };
  const spiral = spiralSteps(96, 500, 450, 300);
  return <svg ref={ref} className="orrery-svg" viewBox="0 0 1000 900" role="img" aria-label="可拖动的五节点星盘菜单" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
    <defs>
      <filter id="orrery-paper-noise" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" seed="17" result="grain" />
        <feColorMatrix in="grain" type="saturate" values="0" result="mono" />
        <feComponentTransfer in="mono"><feFuncA type="table" tableValues="0 .06" /></feComponentTransfer>
      </filter>
      <clipPath id="orrery-eye-clip"><ellipse cx="500" cy="450" rx="382" ry="150" /></clipPath>
      <radialGradient id="orrery-blue-core"><stop offset="0" stopColor="#7c8cff" stopOpacity=".9" /><stop offset=".54" stopColor="#0D2BD8" /><stop offset="1" stopColor="#0D2BD8" stopOpacity=".12" /></radialGradient>
    </defs>
    <rect width="1000" height="900" fill={night ? '#141518' : '#ECE9E1'} />
    <rect width="1000" height="900" filter="url(#orrery-paper-noise)" opacity=".9" />
    <g className="orrery-architectural" opacity={night ? '.22' : '.42'}>
      <path d="M82 118 H918 M38 190 H962 M102 736 H902 M164 95 V805 M286 80 V824 M712 76 V824 M836 94 V804" />
      <path d="M120 680 L500 112 L884 680 M202 680 L500 238 L798 680 M330 680 L500 384 L670 680" />
      {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${140 + i * 110} 680 L500 ${170 + i * 48}`} />)}
    </g>
    <g className="orrery-orbits" transform={`rotate(${(angle * 180) / Math.PI} 500 450)`}>
      <ellipse cx="500" cy="450" rx="356" ry="168" />
      <ellipse cx="500" cy="450" rx="294" ry="132" />
      <ellipse cx="500" cy="450" rx="208" ry="94" />
      <path d={arc(500, 450, 262, -2.6, 1.1)} />
      <path d={arc(500, 450, 321, 0.4, 3.35)} />
      {Array.from({ length: 7 }, (_, i) => <text key={i} x={180 + i * 106} y="222">0{i + 1}</text>)}
    </g>
    {night ? <g className="orrery-night-steps">{spiral.map((step, index) => <path key={index} d={step.d} opacity={0.12 + step.shade * .46} />)}</g> : <g className="orrery-eye" clipPath="url(#orrery-eye-clip)">
      {Array.from({ length: 48 }, (_, i) => <path key={i} d={eyeFacet(i, 48)} opacity={.12 + (i % 5) * .07} />)}
      <ellipse cx="500" cy="450" rx="112" ry="112" fill="url(#orrery-blue-core)" />
      <ellipse cx="500" cy="450" rx="48" ry="48" fill="#121316" />
      <ellipse cx="484" cy="432" rx="11" ry="18" fill="#ECE9E1" opacity=".75" />
      {Array.from({ length: 13 }, (_, i) => <path key={i} className="orrery-bird" d={birdPath} transform={`translate(${188 + i * 52} ${330 + Math.sin(i * 1.7) * 86}) scale(${.15 + (i % 3) * .035}) rotate(${i % 2 ? 12 : -8})`} />)}
    </g>}
    <g className="orrery-nodes" aria-label="功能入口">
      {points.map((node, index) => <g key={node.id} className={`orrery-node ${activeNode === index ? 'is-active' : ''}`} transform={`translate(${node.point.x} ${node.point.y})`}>
        <circle r={activeNode === index ? 31 : 25} />
        <circle className="node-dot" r={activeNode === index ? 5 : 3} />
        <text y="-45">{node.label}</text>
        <text className="node-zh" y="-28">{node.zh}</text>
        <text className="node-note" y="59">{node.note}</text>
        <foreignObject x="-44" y="-44" width="88" height="88"><button type="button" aria-label={`${node.label} ${node.zh}`} onPointerDown={event => event.stopPropagation()} onClick={() => { setNode(index); onSelect(node.id); }} /></foreignObject>
      </g>)}
    </g>
    <motion.g className="orrery-needle" animate={reduced ? undefined : { rotate: [0, 5, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: '500px 450px' }}>
      <path d="M500 450 L500 96" />
      <path d="M500 96 l-8 18 h16 Z" />
    </motion.g>
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
  const rotate = useCallback((next) => { setAngle(next); persistAngle(next); }, []);
  return <motion.main className={`orrery-home ${night ? 'is-night' : 'is-day'}`} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? .15 : .55, ease }}>
    <CanvasStipple night={night} reduced={Boolean(reduced)} />
    <header className="orrery-masthead"><span>16:53 · WED 11 NOV</span><span>FIELD NOTE 05 / AURORA</span></header>
    <section className="orrery-intro"><p className="eyebrow">A SMALL ORRERY FOR EVERYDAY THINGS</p><h1>Between a well<br />and the moon.</h1><p className="intro-copy">拖动星轨，进入一封信、一段声音，或把今天收进底舱。</p></section>
    <OrbitSvg angle={angle} night={night} onSelect={onNavigate} onRotate={rotate} />
    <Compass night={night} onToggle={onToggleNight} />
    <div className={`orrery-quarter ${menuOpen ? 'is-open' : ''}`}><button type="button" className="quarter-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} aria-label="打开快捷轮盘"><span>+</span></button><div className="quarter-menu"><button type="button" onClick={() => onNavigate('chat')}>01<br /><small>CHAT</small></button><button type="button" onClick={() => onNavigate('listen')}>02<br /><small>LISTEN</small></button><button type="button" onClick={() => onNavigate('workspace')}>03<br /><small>WORK</small></button></div></div>
    <footer className="orrery-footer"><span>BLUE EYE / PAPER GRAIN / 01—07</span><span>原生工作台仍在运行 · React presentation layer</span></footer>
  </motion.main>;
}
