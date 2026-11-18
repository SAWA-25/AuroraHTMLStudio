const COVERED_VIEWS = new Set(['home', 'chat', 'listen']);
const BLOCKED_MESSAGE = '当前星盘视图已停用预览截图，请返回工作台后使用';

/** Protect the real capture boundary, including callers that already cloned their request context. */
export function installPreviewCaptureGuard(preview, document) {
  if (!preview || typeof preview.capture !== 'function') throw new Error('预览截图保护尚未就绪');
  const descriptor = Object.getOwnPropertyDescriptor(preview, 'capture');
  if (!descriptor || !descriptor.configurable || !('value' in descriptor)) {
    throw new Error('预览截图入口不可安全保护，已取消打开星盘视图');
  }
  let delegate = descriptor.value;
  let epoch = 0;
  let active = true;
  const covered = () => COVERED_VIEWS.has(document.body?.dataset?.orreryView);
  const wrap = capture => async function (...args) {
    if (covered()) throw new Error(BLOCKED_MESSAGE);
    const started = epoch;
    const result = await capture.apply(this, args);
    if (started !== epoch || covered()) throw new Error('截图期间视图已改变，截图结果已丢弃');
    return result;
  };
  let guarded = wrap(delegate);
  const get = () => guarded;
  const set = replacement => {
    if (replacement === guarded) return;
    if (typeof replacement !== 'function') throw new TypeError('预览截图入口必须是函数');
    delegate = replacement;
    guarded = wrap(replacement);
  };
  Object.defineProperty(preview, 'capture', { configurable: true, enumerable: descriptor.enumerable, get, set });
  return {
    viewChanged() { epoch++; },
    release() {
      if (!active) return;
      active = false;
      epoch++;
      if (Object.getOwnPropertyDescriptor(preview, 'capture')?.get === get) {
        Object.defineProperty(preview, 'capture', { ...descriptor, value: delegate });
      }
    },
  };
}

/** This changes only the control, never App.settings or saved preferences. */
export function lockScreenshotButton(button) {
  if (!button) return () => {};
  const attributes = ['disabled', 'title', 'aria-disabled', 'data-orrery-shot-locked'];
  const saved = attributes.map(name => [name, button.getAttribute(name)]);
  const disabled = button.disabled;
  const wasOn = button.classList.contains('on');
  const apply = () => {
    if (!button.disabled) button.disabled = true;
    if (button.getAttribute('title') !== BLOCKED_MESSAGE) button.setAttribute('title', BLOCKED_MESSAGE);
    if (button.getAttribute('aria-disabled') !== 'true') button.setAttribute('aria-disabled', 'true');
    if (button.getAttribute('data-orrery-shot-locked') !== 'true') button.setAttribute('data-orrery-shot-locked', 'true');
    if (button.classList.contains('on')) button.classList.remove('on');
  };
  const Observer = button.ownerDocument?.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(apply) : null;
  observer?.observe(button, { attributes: true, attributeFilter: [...attributes, 'class'] });
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    observer?.disconnect();
    button.disabled = disabled;
    for (const [name, value] of saved) {
      if (value === null) button.removeAttribute(name);
      else button.setAttribute(name, value);
    }
    button.classList.toggle('on', wasOn);
  };
}
