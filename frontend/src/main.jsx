/*! @license
Third-party software included in this bundle:
React, React DOM and Scheduler — MIT License
Copyright (c) Meta Platforms, Inc. and affiliates.
Framer Motion — The MIT License (MIT)
Copyright (c) 2018 Framer B.V.
Motion DOM and Motion Utils — The MIT License (MIT)
Copyright (c) 2024 [Motion](https://motion.dev) B.V.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

tslib — Zero-Clause BSD
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
*/
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Home } from './Home.jsx';
import { Listen } from './Listen.jsx';
import { enterLegacyView, installLegacyBridge, runLegacyAction } from './legacy.js';
import { isPresentationReady, isolateLegacyFocus, shouldExitPresentation } from './presentationSafety.js';
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
  const initialView = useRef(readView());
  const [view, setView] = useState('workspace');
  const viewRef = useRef('workspace');
  const surfaceRef = useRef(null);
  const releaseFocus = useRef(null);
  const [night, setNight] = useState(readNight);
  const [bridgeError, setBridgeError] = useState('');

  const open = useCallback((nextView = 'home') => {
    const next = VALID_VIEWS.has(nextView) ? nextView : 'home';
    setBridgeError('');
    const leavingCover = (viewRef.current === 'home' || viewRef.current === 'listen') && (next === 'workspace' || next === 'chat');
    if (leavingCover) { releaseFocus.current?.(); releaseFocus.current = null; }
    try {
      enterLegacyView(next);
      viewRef.current = next;
      setView(next);
      writeStorage(VIEW_KEY, next);
      return true;
    } catch (error) {
      if (leavingCover) releaseFocus.current = isolateLegacyFocus(document, surfaceRef.current);
      setBridgeError(`旧工作台入口暂不可用：${error instanceof Error ? error.message : String(error)}`);
      console.error('[orrery] legacy bridge failed', error);
      return false;
    }
  }, []);

  const handleNavigate = useCallback((target = 'home') => {
    if (target === 'hold' || target === 'life') {
      // Native tools own their full-screen surfaces; remove the overlay before invoking them.
      if (!open('workspace')) return;
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
      const ready = isPresentationReady(document, window.__booted);
      if (!ready) {
        if (attempts >= maxAttempts) setBridgeError('原生侧栏仍在启动，星盘入口将在刷新后重试。');
        else schedule();
        return;
      }
      try {
        bridgeDispose = installLegacyBridge((nextView = 'home') => open(nextView));
        enterLegacyView(initialView.current);
        viewRef.current = initialView.current;
        setView(initialView.current);
        observer?.disconnect();
        if (rafId) window.cancelAnimationFrame(rafId);
        rafId = 0;
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
  }, [open]);

  useEffect(() => {
    document.body.dataset.orreryNight = String(night);
  }, [night]);

  const covered = view === 'home' || view === 'listen';
  useLayoutEffect(() => {
    if (!covered) return;
    const release = isolateLegacyFocus(document, surfaceRef.current);
    releaseFocus.current = release;
    return () => { release(); releaseFocus.current?.(); releaseFocus.current = null; };
  }, [covered]);

  useEffect(() => {
    const onKey = event => {
      if (shouldExitPresentation(event, viewRef.current, document)) open('home');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ ease: [0.22, 1, 0.36, 1] }}>
    <div ref={surfaceRef} tabIndex={-1} className={`orrery-app orrery-view-${view} ${night ? 'orrery-night' : 'orrery-day'}`} data-testid="orrery-app">
      {covered && <AnimatePresence mode="wait" initial={false}>
        {view === 'home' && <Home key="home" night={night} onToggleNight={toggleNight} onNavigate={handleNavigate} />}
        {view === 'listen' && <Listen key="listen" active />}
      </AnimatePresence>}
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
