import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import useLocalAudio, { clamp, findLyricIndex, formatTime } from './useLocalAudio.js';
import './listen.css';

const CIRCUMFERENCE = Math.PI * 2 * 276;
const BIRD = 'M-20 3 C-14 0-10-8-4-11 C-5-5-4-2-1 0 C0-6 2-8 5-7 L7-10 8-6 C12-4 17-4 24-6 C20 0 13 3 7 3 L14 13 3 7-1 16-3 6 C-9 7-14 6-20 3Z';
export function compassPoint(radius, degrees) {
  const theta = degrees * Math.PI / 180;
  return [300 + radius * Math.cos(theta), 300 + radius * Math.sin(theta)];
}
export function compassStep(index, count = 84) {
  const angle = 360 / count, start = index * angle - 90, end = start + angle * 0.64;
  const height = 19 + Math.round((1 + Math.sin(index * 0.2)) * 13 + (1 + Math.cos(index * 0.47)) * 6);
  const inner = compassPoint(194, start), outer = compassPoint(194 + height, start);
  const edge = compassPoint(194 + height, end), close = compassPoint(194, end);
  return `M${inner.join(',')}L${outer.join(',')}A${194 + height},${194 + height} 0 0 1 ${edge.join(',')}L${close.join(',')}A194,194 0 0 0 ${inner.join(',')}Z`;
}
function Mark({ kind }) {
  const paths = {
    import: 'M12 3V16M7 8L12 3 17 8M4 16V21H20V16',
    lyric: 'M5 4H19M5 10H19M5 16H13M17 14V22M13 18H21',
    back: 'M8 5L3 10 8 15M3 10H13C19 10 21 14 21 19',
    next: 'M16 5L21 10 16 15M21 10H11C5 10 3 14 3 19',
  };
  return <svg className="orr-listen-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
function Compass({ player, active, reduced }) {
  const host = useRef(null), arc = useRef(null), bird = useRef(null);
  const steps = useMemo(() => Array.from({ length: 84 }, (_, index) => compassStep(index)), []);
  const paint = useCallback((time) => {
    const progress = player.duration ? clamp(time / player.duration, 0, 1) : 0;
    arc.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - progress)));
    const angle = reduced ? -90 : progress * 360 - 90;
    const [x, y] = compassPoint(276, angle);
    bird.current?.setAttribute('transform', `translate(${x} ${y}) rotate(${angle + 90}) scale(.7)`);
  }, [player.duration, reduced]);
  useEffect(() => { paint(player.currentTime); }, [paint, player.currentTime]);
  useEffect(() => {
    let frame = 0, visible = false, last = 0, disposed = false;
    const draw = (now) => {
      if (disposed) return;
      if (now - last >= 32) { paint(player.audioRef.current?.currentTime || 0); last = now; }
      frame = requestAnimationFrame(draw);
    };
    const sync = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (active && visible && !document.hidden && player.playing && !reduced) frame = requestAnimationFrame(draw);
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; sync();
    }, { threshold: 0.05 });
    if (observer && host.current) observer.observe(host.current);
    else visible = true;
    document.addEventListener('visibilitychange', sync); sync();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [active, paint, player.audioRef, player.playing, reduced]);
  return <figure className="orr-listen-compass" ref={host} aria-label="本地音频的环形播放进度">
    <svg className="orr-listen-dial" viewBox="0 0 600 600" aria-hidden="true">
      <g className="orr-listen-construction">
        <path d="M300 9V125M300 475V591M9 300H125M475 300H591M87 87L150 150M450 450L513 513" />
        <circle cx="300" cy="300" r="161" /><circle cx="300" cy="300" r="184" />
        <circle cx="300" cy="300" r="265" /><circle cx="300" cy="300" r="289" />
      </g>
      <g className="orr-listen-steps">{steps.map((path, index) => <path key={index} d={path} opacity={0.24 + (index % 7) * 0.085} />)}</g>
      <g className="orr-listen-ticks">{Array.from({ length: 60 }, (_, index) => {
        const start = compassPoint(index % 5 === 0 ? 169 : 174, index * 6);
        const end = compassPoint(180, index * 6);
        return <path key={index} d={`M${start.join(',')}L${end.join(',')}`} />;
      })}</g>
      <circle className="orr-listen-orbit" cx="300" cy="300" r="276" />
      <circle className="orr-listen-progress-arc" ref={arc} cx="300" cy="300" r="276"
        transform="rotate(-90 300 300)" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
      <g ref={bird} transform="translate(300 24) scale(.7)"><path className="orr-listen-bird" d={BIRD} /></g>
      <g className="orr-listen-dial-type"><text x="300" y="134" textAnchor="middle">00</text>
        <text x="466" y="304" textAnchor="middle">15</text><text x="300" y="475" textAnchor="middle">30</text>
        <text x="134" y="304" textAnchor="middle">45</text></g>
      <path className="orr-listen-axis" d="M284 300H316M300 284V316" />
    </svg>
    <div className="orr-listen-dial-center">
      <span className="orr-listen-micro">{player.name ? 'PLAY POSITION' : 'SOUND / AWAITING'}</span>
      <span className="orr-listen-dial-time">{player.name ? formatTime(player.currentTime) : '—'}</span>
      <span className="orr-listen-dial-state">{({ empty: '等待一首本地音频', loading: '正在读取音频', ready: '已暂停', playing: '正在播放',
        buffering: '正在缓冲', ended: '播放结束', error: '音源无法读取' })[player.status]}</span>
    </div>
    <figcaption className="orr-listen-compass-note"><span>TIME AS A CIRCLE</span><span>本地音频 · 时间刻度</span></figcaption>
  </figure>;
}
function LyricSheet({ player, inputRef }) {
  const { lines, name, loading, error } = player.lyrics;
  const current = findLyricIndex(lines, player.currentTime);
  const start = Math.min(Math.max(0, current - 2), Math.max(0, lines.length - 5));
  return <div className="orr-listen-lyrics">
    <div className="orr-listen-lyrics-heading">
      <h2 className="orr-listen-micro">LYRIC SHEET <span>歌词</span></h2>
      <button className="orr-listen-text-button" onClick={() => inputRef.current?.click()} disabled={!player.name || player.status === 'error'}>
        <Mark kind="lyric" />{loading ? '读取中…' : name ? '更换 LRC' : '导入 LRC'}
      </button>
    </div>
    {lines.length ? <div className="orr-listen-verses" aria-label="随播放进度同步的歌词">
      {current < 0 && <p className="orr-listen-first-line">等待第一句 · {formatTime(lines[0].time)}</p>}
      {lines.slice(start, start + 5).map((line, index) => {
        const number = start + index, distance = Math.abs(number - current);
        return <p className="orr-listen-verse" key={`${line.time}-${number}`} data-current={number === current}
          style={{ opacity: distance === 0 ? 1 : distance === 1 ? 0.64 : distance === 2 ? 0.42 : 0.3 }}>
          <span className="orr-listen-line-number">{String(number + 1).padStart(2, '0')}</span>
          <span>{line.text || '···'}</span>
        </p>;
      })}
    </div> : <div className="orr-listen-empty-lyrics">
      <span className="orr-listen-line-number">—</span><div>
        <p>{player.name ? '让歌词，在此展开。' : '在留白里，等一首歌。'}</p>
        <span>{player.name ? '导入带时间标签的 LRC，文字随音乐聚焦。' : '选取本地音频，再带上它的 LRC 歌词。'}</span>
      </div>
    </div>}
    {name && <p className="orr-listen-lyric-source" title={name}>{name}</p>}
    {error && <p className="orr-listen-error" role="alert">{error}</p>}
  </div>;
}
function Listen({ active = true }) {
  const player = useLocalAudio(active), reduced = useReducedMotion();
  const audioInput = useRef(null), lyricInput = useRef(null);
  const grain = `orr-listen-grain-${useId().replace(/:/g, '')}`;
  const ready = player.duration > 0 && !['empty', 'loading', 'error'].includes(player.status);
  const progress = player.duration ? clamp(player.currentTime / player.duration * 100, 0, 100) : 0;
  const selectFile = (handler) => (event) => { handler(event.target.files?.[0]); event.target.value = ''; };
  return <motion.section className="orr-listen-root" hidden={!active} aria-label="聆听，本地音乐播放器"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}>
    <svg className="orr-listen-grain" width="100%" height="100%" aria-hidden="true"><filter id={grain}>
      <feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" /></filter><rect width="100%" height="100%" filter={`url(#${grain})`} /></svg>
    <header className="orr-listen-heading">
      <p className="orr-listen-micro">A PRIVATE LISTENING ROOM <span>本地聆听</span></p>
      <h1>Listen<span>聆听</span><i>.</i></h1>
      <div className="orr-listen-track">
        <span className="orr-listen-micro">{player.name ? 'CURRENT AUDIO' : 'NO TRACK SELECTED'}</span>
        <h2 title={player.name}>{player.name || '尚未选取音频'}</h2>
        <p>{player.name ? `${(player.size / 1024 / 1024).toFixed(1)} MB · ${player.duration ? formatTime(player.duration) : '读取时长中'}` : '声音只在此处播放，文件不会上传。'}</p>
      </div>
      <button className="orr-listen-import" onClick={() => audioInput.current?.click()}>
        <Mark kind="import" />{player.name ? '更换本地音频' : '导入本地音频'}<span>↗</span>
      </button>
    </header>
    <Compass player={player} active={active} reduced={reduced} />
    <LyricSheet player={player} inputRef={lyricInput} />
    <div className="orr-listen-transport" aria-label="播放控制">
      <div className="orr-listen-seek-head"><label htmlFor={`${grain}-seek`}>播放进度</label>
        <span>{formatTime(player.currentTime)} <span className="orr-listen-time-divider">/</span> {player.duration ? formatTime(player.duration) : '--:--'}</span></div>
      <input className="orr-listen-range orr-listen-seek" id={`${grain}-seek`} type="range" min="0" max={player.duration || 1} step="0.1"
        value={player.currentTime} disabled={!ready} onChange={(event) => player.seek(event.target.value)}
        aria-valuetext={`${formatTime(player.currentTime)}，总时长 ${formatTime(player.duration)}`} style={{ '--orr-listen-progress': `${progress}%` }} />
      <div className="orr-listen-control-row">
        <div className="orr-listen-play-controls">
          <button className="orr-listen-skip" disabled={!ready} onClick={() => player.skip(-10)} aria-label="后退10秒"><Mark kind="back" /><span>10s</span></button>
          <button className="orr-listen-play" disabled={!ready} onClick={player.toggle} aria-label={player.playing ? '暂停' : '播放'} aria-pressed={player.playing}>
            <svg viewBox="0 0 28 28" aria-hidden="true"><path d={player.playing ? 'M8 5H12V23H8ZM17 5H21V23H17Z' : 'M9 5L23 14 9 23Z'} /></svg>
            <span>{player.playing ? '暂停' : '播放'}</span>
          </button>
          <button className="orr-listen-skip" disabled={!ready} onClick={() => player.skip(10)} aria-label="前进10秒"><Mark kind="next" /><span>10s</span></button>
        </div>
        <label className="orr-listen-volume"><span>音量 <b>{Math.round(player.volume * 100)}</b></span>
          <input className="orr-listen-range" type="range" min="0" max="1" step="0.01" value={player.volume}
            aria-label="音量" aria-valuetext={`${Math.round(player.volume * 100)}%`} onChange={(event) => player.setVolume(event.target.value)}
            style={{ '--orr-listen-progress': `${player.volume * 100}%` }} />
        </label>
      </div>
      <div className="orr-listen-notices" aria-live="polite">
        {player.error && <p className="orr-listen-error" role="alert">{player.error}</p>}
        {player.storageNote && <p className="orr-listen-storage-note">{player.storageNote}</p>}
        <p className="orr-listen-local-note">刷新后需重新选取音频与 LRC。浏览器仅记住音量与该文件的播放位置。</p>
      </div>
    </div>
    <input className="orr-listen-file" ref={audioInput} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.webm,.aif,.aiff" onChange={selectFile(player.importAudio)} aria-label="选取本地音频文件" tabIndex={-1} />
    <input className="orr-listen-file" ref={lyricInput} type="file" accept=".lrc" onChange={selectFile(player.importLrc)} aria-label="选取LRC歌词文件" tabIndex={-1} />
  </motion.section>;
}
export { Listen };
export default Listen;
