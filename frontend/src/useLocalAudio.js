import { useCallback, useEffect, useRef, useState } from 'react';

const VOLUME_KEY = 'orr-listen-volume';
const TIME_PREFIX = 'orr-listen-time-';
const STORAGE_NOTE = '浏览器无法保存设置；音量与进度仅保留到本次离开。';
const EMPTY = { name: '', size: 0, duration: 0, currentTime: 0, playing: false, status: 'empty', error: '' };
export const clamp = (value, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds), minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export function parseLrc(text) {
  if (typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('LRC 内容超过 1 MB，或不是文本。');
  const offsets = [...text.matchAll(/^\\[offset:([+-]?\\d+)\\]\\s*$/gim)];
  const offset = Number(offsets.at(-1)?.[1] || 0) / 1000;
  if (!Number.isFinite(offset)) throw new Error('LRC 时间偏移无效。');
  const lines = [];
  for (const row of text.replace(/^\\uFEFF/, '').split(/\\r?\\n/)) {
    const stamps = [...row.matchAll(/\\[(\\d{1,4}):([0-5]\\d)(?:[.:](\\d{1,3}))?\\]/g)];
    if (!stamps.length) continue;
    const lyric = row.replace(/\\[(\\d{1,4}):([0-5]\\d)(?:[.:](\\d{1,3}))?\\]/g, '').trim();
    for (const stamp of stamps) {
      const fraction = Number(`0.${stamp[3] || '0'}`);
      lines.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + fraction + offset), text: lyric });
      if (lines.length > 10000) throw new Error('LRC 时间行超过 10,000 条，请选取更短的歌词文件。');
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
export function findLyricIndex(lines, time) {
  let low = 0, high = lines.length - 1, answer = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].time <= time) { answer = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return answer;
}
function timeKey(file) {
  let hash = 2166136261;
  for (const char of `${file.name}|${file.size}|${file.lastModified}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${TIME_PREFIX}${(hash >>> 0).toString(16)}`;
}
function mediaError(audio) {
  return ({ 1: '音频载入已中断，请重新选取文件。', 2: '无法读取本地音频，请确认文件仍可访问。',
    3: '音频解码失败，请尝试其他格式或文件。', 4: '浏览器不支持此音频格式，请尝试 MP3、WAV 或 M4A。' })[audio.error?.code] || '音频无法载入，请重新选取文件。';
}

export default function useLocalAudio(active = true) {
  const [state, setState] = useState(EMPTY);
  const [volume, setVolumeState] = useState(0.7);
  const [storageNote, setStorageNote] = useState('');
  const [lyrics, setLyrics] = useState({ lines: [], name: '', error: '', loading: false });
  const audioRef = useRef(null), releaseRef = useRef(null), mounted = useRef(false);
  const volumeRef = useRef(0.7), activeRef = useRef(active), playVersion = useRef(0), playPending = useRef(false), lyricVersion = useRef(0);
  const saveRef = useRef(null);
  activeRef.current = active;
  const storageFailed = useCallback(() => { if (mounted.current) setStorageNote(STORAGE_NOTE); }, []);
  const storeNumber = useCallback((key, value) => {
    try { window.localStorage.setItem(key, String(value)); } catch { storageFailed(); }
  }, [storageFailed]);

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = window.localStorage.getItem(VOLUME_KEY);
      if (saved !== null) { volumeRef.current = clamp(Number(saved), 0, 1); setVolumeState(volumeRef.current); }
    } catch { storageFailed(); }
    const save = () => saveRef.current?.();
    const visibility = () => { if (document.hidden) save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false; playVersion.current += 1; playPending.current = false; lyricVersion.current += 1;
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', visibility);
      releaseRef.current?.(); releaseRef.current = null; saveRef.current = null;
    };
  }, [storageFailed]);

  useEffect(() => {
    if (!active) { playVersion.current += 1; playPending.current = false; audioRef.current?.pause(); saveRef.current?.(); }
  }, [active]);

  const importAudio = useCallback((file) => {
    if (!file || !mounted.current) return;
    if (!file.size || (!file.type.startsWith('audio/') && !/\\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|aiff?)$/i.test(file.name))) {
      setState((s) => ({ ...s, error: '请选择非空的本地音频文件，例如 MP3、WAV 或 M4A。' })); return;
    }
    playVersion.current += 1; playPending.current = false; lyricVersion.current += 1;
    releaseRef.current?.(); releaseRef.current = null; saveRef.current = null;
    setLyrics({ lines: [], name: '', error: '', loading: false });
    setState({ ...EMPTY, name: file.name, size: file.size, status: 'loading' });
    let objectUrl = '', audio;
    try { objectUrl = URL.createObjectURL(file); audio = new Audio(); }
    catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setState((s) => ({ ...s, status: 'error', error: '浏览器无法打开此本地文件，请重新选取。' })); return;
    }
    audioRef.current = audio; audio.preload = 'metadata'; audio.volume = volumeRef.current;
    const key = timeKey(file), listeners = [];
    let released = false, resume = 0, lastSave = -Infinity;
    try { resume = clamp(Number(window.localStorage.getItem(key)), 0, Number.MAX_SAFE_INTEGER); }
    catch { storageFailed(); }
    const valid = () => !released && mounted.current && audioRef.current === audio;
    const patch = (next) => { if (valid()) setState((s) => ({ ...s, ...next })); };
    const save = () => { if (Number.isFinite(audio.currentTime) && audio.readyState > 0) storeNumber(key, audio.currentTime); };
    saveRef.current = save;
    const syncTime = () => {
      patch({ currentTime: audio.currentTime });
      if (Date.now() - lastSave > 2500) { save(); lastSave = Date.now(); }
    };
    const on = (name, handler) => { audio.addEventListener(name, handler); listeners.push([name, handler]); };
    on('loadedmetadata', () => {
      if (!valid()) return;
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        patch({ status: 'error', error: '此文件没有可读取的有限时长，请重新选取音频。' }); return;
      }
      patch({ duration: audio.duration, status: 'ready', error: '' });
      try { audio.currentTime = resume < audio.duration - 0.5 ? resume : 0; }
      catch { patch({ error: '已载入音频，但无法恢复上次位置；可从开头播放。' }); }
      syncTime();
    });
    on('durationchange', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) patch({ duration: audio.duration });
    });
    on('timeupdate', syncTime);
    on('playing', () => patch({ playing: true, status: 'playing', error: '' }));
    on('pause', () => { patch({ playing: false, status: audio.error ? 'error' : 'ready' }); save(); });
    on('waiting', () => patch({ status: 'buffering' }));
    on('stalled', () => patch({ status: 'buffering', error: '音频读取暂时停顿；可暂停后重试，或重新选取文件。' }));
    on('canplay', () => patch({ status: audio.paused ? 'ready' : 'playing' }));
    on('ended', () => { patch({ playing: false, currentTime: audio.duration, status: 'ended' }); save(); });
    on('error', () => patch({ playing: false, status: 'error', error: mediaError(audio) }));
    releaseRef.current = () => {
      released = true;
      for (const [name, handler] of listeners) audio.removeEventListener(name, handler);
      save(); audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(objectUrl);
      if (audioRef.current === audio) audioRef.current = null;
    };
    audio.src = objectUrl;
    audio.load();
  }, [storageFailed, storeNumber]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !activeRef.current || audio.readyState < 1 || audio.error) return;
    if (playPending.current) {
      playVersion.current += 1; playPending.current = false; audio.pause();
      setState((s) => ({ ...s, playing: false, status: 'ready' })); return;
    }
    if (!audio.paused) { playVersion.current += 1; audio.pause(); return; }
    const version = ++playVersion.current;
    playPending.current = version;
    setState((s) => ({ ...s, status: 'buffering', error: '' }));
    try {
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
      if (audio !== audioRef.current || version !== playVersion.current || !activeRef.current) audio.pause();
    } catch (error) {
      if (!mounted.current || audio !== audioRef.current || version !== playVersion.current) return;
      setState((s) => ({ ...s, playing: false, status: 'ready', error: error.name === 'NotAllowedError'
        ? '浏览器拦截了播放，请再次点击播放按钮。' : '播放未能开始；请重试，或重新选取受支持的音频。' }));
    } finally {
      if (playPending.current === version) playPending.current = false;
    }
  }, []);
  const seek = useCallback((value) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      audio.currentTime = clamp(Number(value), 0, audio.duration);
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
    } catch { setState((s) => ({ ...s, error: '该位置暂时无法读取，请稍后重试。' })); }
  }, []);
  const skip = useCallback((seconds) => seek((audioRef.current?.currentTime || 0) + seconds), [seek]);
  const setVolume = useCallback((value) => {
    const next = clamp(Number(value), 0, 1);
    volumeRef.current = next; setVolumeState(next); storeNumber(VOLUME_KEY, next);
    if (audioRef.current) audioRef.current.volume = next;
  }, [storeNumber]);
  const importLrc = useCallback(async (file) => {
    if (!file || !audioRef.current || !mounted.current) return;
    const version = ++lyricVersion.current;
    if (!/\\.lrc$/i.test(file.name) || file.size > 1024 * 1024) {
      setLyrics((s) => ({ ...s, loading: false, error: '请选择 1 MB 以内的 .lrc 歌词文件。' })); return;
    }
    setLyrics((s) => ({ ...s, loading: true, error: '' }));
    try {
      const text = await file.text();
      if (!mounted.current || version !== lyricVersion.current) return;
      const lines = parseLrc(text);
      if (!lines.length) throw new Error('未找到 [mm:ss.xx] 时间标签，请检查 LRC 内容。');
      setLyrics({ lines, name: file.name, error: '', loading: false });
    } catch (error) {
      if (mounted.current && version === lyricVersion.current) setLyrics((s) => ({ ...s, loading: false,
        error: error instanceof Error ? error.message : '歌词读取失败，请重新选取 UTF-8 编码的 LRC。' }));
    }
  }, []);
  return { ...state, volume, storageNote, lyrics, audioRef, importAudio, importLrc, toggle, seek, skip, setVolume };
}
