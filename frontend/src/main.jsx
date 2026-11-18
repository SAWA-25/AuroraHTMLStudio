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
import { flushSync } from 'react-dom';
import { MotionConfig, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Home } from './Home.jsx';
import { enterLegacyView, installLegacyBridge, isNativeTourPending, runLegacyAction } from './legacy.js';
import { isNativeWindowMode, isPresentationReady, isolateLegacyFocus } from './presentationSafety.js';
import './orrery.css';

const VIEW_KEY = 'orrery-view';
function readView() {
  try { return window.localStorage.getItem(VIEW_KEY) === 'workspace' ? 'workspace' : 'home'; }
  catch (error) { console.warn('[studio] unable to read last view', error); return 'home'; }
}
function saveView(view) {
  try { window.localStorage.setItem(VIEW_KEY, view); }
  catch (error) { console.warn('[studio] unable to save last view', error); }
}

function PresentationApp() {
  const reduced = useReducedMotion();
  const reducedRef = useRef(Boolean(reduced));
  reducedRef.current = Boolean(reduced);
  const initialView = useRef(readView());
  const [view, setView] = useState('workspace');
  const viewRef = useRef('workspace');
  const surfaceRef = useRef(null);
  const releaseFocus = useRef(null);
  const [night, setNight] = useState(() => !document.documentElement.classList.contains('light'));
  const [bridgeError, setBridgeError] = useState('');
  const transitionRef = useRef(null);

  const commitOpen = useCallback(next => {
    setBridgeError('');
    const leavingCover = viewRef.current === 'home' && next === 'workspace';
    if (leavingCover) { releaseFocus.current?.(); releaseFocus.current = null; }
    try {
      enterLegacyView(next);
      viewRef.current = next;
      setView(next);
      saveView(next);
      return true;
    } catch (error) {
      if (leavingCover) releaseFocus.current = isolateLegacyFocus(document, surfaceRef.current);
      setBridgeError(`创作入口暂不可用：${error instanceof Error ? error.message : String(error)}`);
      console.error('[studio] view entry failed', error);
      return false;
    }
  }, []);

  const open = useCallback((requested = 'home') => {
    const next = requested === 'workspace' ? 'workspace' : 'home';
    transitionRef.current?.skipTransition();
    if (next === viewRef.current || reducedRef.current || !document.startViewTransition || document.hidden) return commitOpen(next);
    const transition = document.startViewTransition(() => {
      flushSync(() => commitOpen(next));
    });
    transitionRef.current = transition;
    transition.ready.catch(error => {
      // Unsupported snapshots must never prevent navigation to the native workspace.
      console.warn('[studio] canvas transition unavailable', error);
    });
    transition.finished.finally(() => { if (transitionRef.current === transition) transitionRef.current = null; });
    return true;
  }, [commitOpen]);

  const handleNavigate = useCallback((target = 'home') => {
    if (target === 'home' || target === 'workspace') { open(target); return; }
    // Menus and dialogs are owned by the original application and must stay interactive.
    transitionRef.current?.skipTransition();
    if (!commitOpen('workspace')) return;
    runLegacyAction(target).then(ok => {
      if (!ok) setBridgeError('功能暂未就绪，可从工作台侧栏重试。');
    }).catch(error => {
      setBridgeError(`功能打开失败：${error.message || String(error)}`);
      console.error(`[studio] ${target} action failed`, error);
    });
  }, [open, commitOpen]);

  const toggleNight = useCallback(() => {
    const button = document.getElementById('btnTheme');
    if (!button || button.disabled || typeof button.onclick !== 'function') {
      setBridgeError('主题切换入口尚未就绪，请稍后重试。');
      return;
    }
    // Invoke the existing theme handler without sending a blocked click into the inert workspace.
    button.onclick.call(button);
  }, []);

  useEffect(() => {
    const update = () => setNight(!document.documentElement.classList.contains('light'));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let bridgeDispose;
    let observer;
    let rafId = 0;
    let attempts = 0;
    let entered = false;
    const maxAttempts = 300;
    const schedule = () => {
      if (disposed || entered || rafId || attempts >= maxAttempts) return;
      rafId = window.requestAnimationFrame(() => { rafId = 0; tryInstall(); });
    };
    const tryInstall = () => {
      if (disposed || entered) return;
      try {
        if (isNativeWindowMode(document)) return;
        if (window.__booted && document.querySelector('#rail .rail-top') && !bridgeDispose) bridgeDispose = installLegacyBridge(open);
        const tourPending = isNativeTourPending();
        if (bridgeDispose && tourPending) {
          setBridgeError('请先完成或跳过工作台的新手引导。');
          return;
        }
        if (bridgeDispose && document.querySelector('#modalRoot .modal-mask')) return;
        if (!bridgeDispose || !isPresentationReady(document, window.__booted, tourPending)) {
          attempts += 1;
          if (attempts >= maxAttempts) setBridgeError('工作台仍在启动，可刷新后重试创作起始台。');
          else schedule();
          return;
        }
        enterLegacyView(initialView.current);
        viewRef.current = initialView.current;
        setView(initialView.current);
        entered = true;
        observer?.disconnect();
        if (rafId) window.cancelAnimationFrame(rafId);
        rafId = 0;
        setBridgeError('');
      } catch (error) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          setBridgeError(`创作起始台初始化失败：${error.message || String(error)}`);
          console.error('[studio] readiness failed', error);
        } else schedule();
      }
    };
    document.body.dataset.orreryMounted = 'true';
    observer = new MutationObserver(tryInstall);
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
    tryInstall();
    return () => {
      disposed = true;
      transitionRef.current?.skipTransition();
      if (rafId) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      document.removeEventListener('DOMContentLoaded', tryInstall);
      bridgeDispose?.();
      delete document.body.dataset.orreryMounted;
      delete document.body.dataset.orreryView;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (view !== 'home') return;
    const release = isolateLegacyFocus(document, surfaceRef.current);
    releaseFocus.current = release;
    return () => { release(); releaseFocus.current?.(); releaseFocus.current = null; };
  }, [view]);

  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ ease: [0.22, 1, 0.36, 1] }}>
    <div ref={surfaceRef} tabIndex={-1} className={`orrery-app studio-view-${view}`} data-testid="orrery-app">
      {view === 'home' && <Home night={night} onToggleNight={toggleNight} onNavigate={handleNavigate}/>}
      {bridgeError && <div className="orrery-bridge-error" role="alert"><span>{bridgeError}</span><button type="button" onClick={() => setBridgeError('')}>关闭</button></div>}
    </div>
  </MotionConfig>;
}

function mount() {
  const existing = document.getElementById('aurora-orrery-root');
  const rootElement = existing || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'aurora-orrery-root' }));
  createRoot(rootElement).render(<PresentationApp/>);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
