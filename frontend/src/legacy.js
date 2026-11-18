/* View-only adapter. Original panes, listeners, messages and saved layout stay owned by Aurora. */
import { installPreviewCaptureGuard, lockScreenshotButton } from './captureSafety.js';
const VIEWS = new Set(['home', 'chat', 'listen', 'workspace']);
let removeInstalledBridge;
let captureGuard;
let restoreShotButton;

function ensureCaptureGuard() {
  if (captureGuard) return;
  const preview = typeof PV !== 'undefined' ? PV : globalThis.PV;
  captureGuard = installPreviewCaptureGuard(preview, document);
}

function guardChatCapture(event) {
  if (document.body?.dataset?.orreryView !== 'chat' || !event.target?.closest?.('#tgShot')) return;
  if (event.type === 'click' || ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function reportFailure(action, error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[Orrery legacy:${action}]`, error);
  const notify = typeof toast === 'function' ? toast : globalThis.toast;
  if (typeof notify === 'function') notify(`无法打开此功能：${detail}`, 'err');
  else {
    const host = document.getElementById('toastRoot') || document.body;
    let notice = document.getElementById('orrery-bridge-notice');
    if (!notice) {
      notice = document.createElement('button');
      notice.id = 'orrery-bridge-notice';
      notice.type = 'button';
      notice.className = 'orrery-bridge-notice';
      notice.setAttribute('role', 'alert');
      notice.addEventListener('click', () => notice.remove(), { once: true });
      host.appendChild(notice);
    }
    notice.textContent = `无法打开此功能：${detail}。点击关闭。`;
  }
  return false;
}

/** Mirror the native guide's startup condition without marking it completed. */
export function isNativeTourPending() {
  if (document.querySelector('.c7-tour')) return true;
  if (typeof globalThis.C7?.tour !== 'function') return false;
  const store = typeof Store !== 'undefined' ? Store : globalThis.Store;
  return !store?.cache?.c7Tour && !globalThis.navigator?.webdriver
    && !new URLSearchParams(globalThis.location?.search || '').has('notour');
}

/** Call after __booted. This never changes App.settings.ui or writes its persistence. */
export function enterLegacyView(view) {
  if (!VIEWS.has(view)) throw new RangeError(`未知星盘视图：${String(view)}`);
  if (!document.body) throw new Error('Aurora 页面尚未就绪');
  ensureCaptureGuard();
  if (view !== 'workspace' && isNativeTourPending()) throw new Error('请先完成或跳过工作台的新手引导');
  if (view === 'chat') {
    const tab = document.querySelector('#sideTabs [data-side="chat"]');
    const chat = document.getElementById('viewChat');
    if (!tab || !chat) throw new Error('原生聊天面板尚未就绪');
    // Run the real tab handler: its active classes are also read by existing plugins.
    tab.click();
    if (!chat.classList.contains('active')) throw new Error('原生聊天入口尚未完成初始化');
  }
  if (document.body.dataset.orreryView !== view) captureGuard?.viewChanged();
  if (view === 'chat' && !restoreShotButton) restoreShotButton = lockScreenshotButton(document.getElementById('tgShot'));
  if (view !== 'chat') { restoreShotButton?.(); restoreShotButton = undefined; }
  document.body.dataset.orreryView = view;
  return view;
}

/** Resolve actual application entrypoints; false means a visible error was reported. */
export async function runLegacyAction(id) {
  try {
    if (id === 'workspace' || id === 'home') {
      enterLegacyView('workspace');
      return true;
    }
    const app = typeof App !== 'undefined' ? App : globalThis.App;
    const buttonIds = { new: 'btnNew', projects: 'projBtn', import: 'btnImport' };
    if (buttonIds[id]) {
      const button = document.getElementById(buttonIds[id]);
      if (!button || button.disabled || typeof button.onclick !== 'function') throw new Error('此创作入口尚未就绪');
      button.click();
      return true;
    }
    if (id === 'assistant') {
      if (typeof app?.showSide !== 'function') throw new Error('创作助手尚未就绪');
      app.showSide();
      return true;
    }
    if (id === 'hold') {
      // App/ToolHub are classic-script lexical globals, not necessarily window properties.
      const registry = typeof ToolHub !== 'undefined' ? ToolHub : globalThis.ToolHub;
      const tool = registry?.tools?.find(item => item.id === 'chat13-bookmarks');
      if (typeof tool?.open === 'function') await tool.open();
      else if (typeof globalThis.CHAT13?.open?.['chat13-bookmarks'] === 'function') {
        await globalThis.CHAT13.open['chat13-bookmarks']();
      } else throw new Error('消息收藏夹尚未加载');
      return true;
    }
    if (id === 'tools' || id === 'life') {
      if (typeof globalThis.HUB15?.open !== 'function') throw new Error('创作中心尚未加载');
      await globalThis.HUB15.open('home');
      return true;
    }
    if (id === 'settings') {
      const app = typeof App !== 'undefined' ? App : globalThis.App;
      if (typeof app?.openSettings === 'function') await app.openSettings();
      else {
        const button = document.getElementById('btnSettings');
        if (!button || button.disabled || typeof button.onclick !== 'function') throw new Error('设置入口尚未就绪');
        button.click();
      }
      return true;
    }
    throw new RangeError(`未知原生操作：${String(id)}`);
  } catch (error) {
    return reportFailure(id, error);
  }
}

function createOrreryMark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const append = (name, attrs) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    svg.appendChild(node);
  };
  for (const [key, value] of Object.entries({ viewBox: '0 0 40 40', width: 26, height: 26, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8, 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, String(value));
  append('path', { d: 'M3 6h34v28H3zM3 12h34M11 6v28', opacity: .55 });
  append('path', { d: 'm21 18-5 5 5 5m6-10 5 5-5 5', 'stroke-width': 1.2 });
  append('path', { d: 'M6 3V0M0 9h3M34 37v3M37 31h3' });
  return svg;
}

/** Installs one real rail button. onOpen receives 'home' or 'workspace'; returns full cleanup. */
export function installLegacyBridge(onOpen) {
  if (typeof onOpen !== 'function') throw new TypeError('星盘入口需要 onOpen 回调');
  const rail = document.querySelector('#rail .rail-top');
  if (!rail) throw new Error('原生侧栏尚未就绪，请在 __booted 后安装星盘入口');
  removeInstalledBridge?.();
  ensureCaptureGuard();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rail-btn orrery-rail-entry';
  button.dataset.rail = 'aurora-orrery';
  button.title = '创作起始台 · Aurora';
  button.setAttribute('aria-label', '返回创作起始台');
  const label = document.createElement('span');
  label.textContent = '创作起始台';
  button.append(createOrreryMark(), label);
  const open = view => {
    try {
      // The presentation owns the commit so old canvas pixels survive snapshot capture.
      const result = onOpen(view);
      if (result && typeof result.catch === 'function') result.catch(error => reportFailure(view, error));
    } catch (error) { reportFailure(view, error); }
  };
  const openHome = () => open('home');
  const leaveChatForNativeControl = event => {
    if (document.body.dataset.orreryView !== 'chat') return;
    const control = event.target?.closest?.('#sideTabs [data-side="design"], #btnCollapseSide');
    if (control && !control.disabled) open('workspace');
    // Do not cancel the event: the real design/collapse behavior must still execute.
  };
  button.addEventListener('click', openHome);
  document.addEventListener('click', leaveChatForNativeControl, true);
  document.addEventListener('click', guardChatCapture, true);
  document.addEventListener('keydown', guardChatCapture, true);
  rail.prepend(button);
  const cleanup = () => {
    button.removeEventListener('click', openHome);
    document.removeEventListener('click', leaveChatForNativeControl, true);
    button.remove();
    if (removeInstalledBridge === cleanup) {
      document.removeEventListener('click', guardChatCapture, true);
      document.removeEventListener('keydown', guardChatCapture, true);
      document.getElementById('orrery-bridge-notice')?.remove();
      document.body.dataset.orreryView = 'workspace';
      restoreShotButton?.(); restoreShotButton = undefined;
      captureGuard?.release(); captureGuard = undefined;
      removeInstalledBridge = undefined;
    }
  };
  removeInstalledBridge = cleanup;
  return cleanup;
}
