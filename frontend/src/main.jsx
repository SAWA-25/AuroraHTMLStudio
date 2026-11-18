import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Home } from './Home.jsx';
import { Listen } from './Listen.jsx';
import { enterLegacyView, installLegacyBridge, runLegacyAction } from './legacy.js';
import './orrery.css';
import './letter.css';

const VIEW_KEY = 'orrery-view';
const NIGHT_KEY = 'orrery-night';
const VALID_VIEWS = new Set(['home', 'chat', 'listen', 'workspace']);

function readStorage(key) {
  try { return window.localStorage.getItem(key); }
  catch (error) { console.warn(`[orrery] unable to read ${key}`, error); return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); return true; }
  catch (error) { console.warn(`[orrery] unable to persist ${key}`, error); return false; }
}

function readView() {
  const candidate = readStorage(VIEW_KEY);
  return VALID_VIEWS.has(candidate) ? candidate : 'home';
}

function readNight() {
  return readStorage(NIGHT_KEY) === 'true';
}

function PageMark({ view, onNavigate }) {
  if (view === 'home' || view === 'workspace') return null;
  return <motion.nav className="orrery-page-mark" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22 }} aria-label="星盘导航">
    <button type="button" className="orrery-back" onClick={() => onNavigate('home')} aria-label="返回星盘主页">
      <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><path d="M22 14H6M12 7l-7 7 7 7" /></svg>
    </button>
    <span>{view === 'listen' ? 'LISTEN / 一起听' : 'CHAT / 聊天'}</span>
    <button type="button" className="orrery-home-link" onClick={() => onNavigate('home')}>回到星盘</button>
  </motion.nav>;
}

function PresentationApp() {
  const reduced = useReducedMotion();
  const [view, setView] = useState(readView);
  const [night, setNight] = useState(readNight);
  const [bridgeError, setBridgeError] = useState('');

  const open = useCallback((nextView = 'home') => {
    const next = VALID_VIEWS.has(nextView) ? nextView : 'home';
    setBridgeError('');
    if (next === 'home') {
      try { enterLegacyView('workspace'); } catch (error) {
        setBridgeError(`旧工作台入口暂不可用：${error instanceof Error ? error.message : String(error)}`);
        console.error('[orrery] legacy workspace exit failed', error);
      }
      setView('home');
      writeStorage(VIEW_KEY, 'home');
      return;
    }
    try {
      const result = enterLegacyView(next);
      if (result !== next) console.warn('[orrery] legacy view returned', result);
      setView(next);
      writeStorage(VIEW_KEY, next);
    } catch (error) {
      setBridgeError(`旧工作台入口暂不可用：${error instanceof Error ? error.message : String(error)}`);
      console.error('[orrery] legacy bridge failed', error);
    }
  }, []);

  const handleNavigate = useCallback((target = 'home') => {
    if (target === 'hold' || target === 'life') {
      // Native tools own their full-screen surfaces; remove the overlay before invoking them.
      setBridgeError('');
      setView('workspace');
      writeStorage(VIEW_KEY, 'workspace');
      runLegacyAction(target).then(ok => {
        if (!ok) {
          setBridgeError(`原生功能“${target === 'hold' ? '贴贴' : '生活'}”暂不可用，请稍后重试。`);
        }
      }).catch(error => {
        setBridgeError(`原生功能暂不可用：${error instanceof Error ? error.message : String(error)}`);
        console.error(`[orrery] ${target} action failed`, error);
      });
      return;
    }
    open(target);
  }, [open]);

  const toggleNight = useCallback(() => {
    setNight(current => {
      const next = !current;
      writeStorage(NIGHT_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let bridgeDispose;
    let observer;
    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 300;
    const schedule = () => {
      if (disposed || bridgeDispose || rafId || attempts >= maxAttempts) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        tryInstall();
      });
    };
    const tryInstall = () => {
      if (disposed || bridgeDispose) return;
      attempts += 1;
      const ready = Boolean(window.__booted && document.querySelector('#rail .rail-top'));
      if (!ready) {
        if (attempts >= maxAttempts) setBridgeError('原生侧栏仍在启动，星盘入口将在刷新后重试。');
        else schedule();
        return;
      }
      try {
        bridgeDispose = installLegacyBridge((nextView = 'home') => open(nextView));
        enterLegacyView(view === 'chat' ? 'chat' : 'workspace');
        document.body.dataset.orreryView = view;
        setBridgeError('');
      } catch (error) {
        bridgeDispose?.();
        bridgeDispose = undefined;
        if (attempts >= maxAttempts) {
          setBridgeError(`原生入口初始化失败：${error instanceof Error ? error.message : String(error)}`);
          console.error('[orrery] legacy bridge readiness failed', error);
        } else schedule();
      }
    };
    document.body.dataset.orreryMounted = 'true';
    document.body.dataset.orreryView = view;
    document.body.dataset.orreryNight = String(night);
    if (document.body) {
      observer = new MutationObserver(() => tryInstall());
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
    tryInstall();
    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      document.removeEventListener('DOMContentLoaded', tryInstall);
      bridgeDispose?.();
      delete document.body.dataset.orreryMounted;
      delete document.body.dataset.orreryView;
      delete document.body.dataset.orreryNight;
    };
  }, [open, view]);

  useEffect(() => {
    document.body.dataset.orreryView = view;
    document.body.dataset.orreryNight = String(night);
  }, [view, night]);

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && view !== 'home') open('home');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, view]);

  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ ease: [0.22, 1, 0.36, 1] }}>
    <div className={`orrery-app orrery-view-${view} ${night ? 'orrery-night' : 'orrery-day'}`} data-testid="orrery-app">
      <AnimatePresence mode="wait" initial={false}>
        {view === 'home' && <Home key="home" night={night} onToggleNight={toggleNight} onNavigate={handleNavigate} />}
        {view === 'listen' && <Listen key="listen" active />}
      </AnimatePresence>
      <PageMark view={view} onNavigate={handleNavigate} />
      {bridgeError && <div className="orrery-bridge-error" role="status"><span>{bridgeError}</span><button type="button" onClick={() => setBridgeError('')}>关闭</button></div>}
    </div>
  </MotionConfig>;
}

function mount() {
  const existing = document.getElementById('aurora-orrery-root');
  const rootElement = existing || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'aurora-orrery-root' }));
  createRoot(rootElement).render(<PresentationApp />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
