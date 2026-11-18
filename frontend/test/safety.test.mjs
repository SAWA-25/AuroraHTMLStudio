import test from 'node:test';
import assert from 'node:assert/strict';
import { installPreviewCaptureGuard, lockScreenshotButton } from '../src/captureSafety.js';
import { isPresentationReady, shouldExitPresentation, isolateLegacyFocus } from '../src/presentationSafety.js';

test('first presentation waits for the splash to finish restoring native focus state', () => {
  let splash = {}, rail = null, tour = null;
  const document = {
    getElementById: id => id === 'boot' ? splash : null,
    querySelector: selector => selector === '#rail .rail-top' ? rail : tour,
  };
  assert.equal(isPresentationReady(document, false), false);
  rail = {};
  assert.equal(isPresentationReady(document, true), false);
  splash = null;
  assert.equal(isPresentationReady(document, true), true);
  assert.equal(isPresentationReady(document, true, true), false);
  tour = {};
  assert.equal(isPresentationReady(document, true), false);
  tour = null;
  rail = null;
  assert.equal(isPresentationReady(document, true), false);
});

function captureFixture(capture) {
  const document = { body: { dataset: { orreryView: 'workspace' } } };
  const preview = { capture };
  return { document, preview, guard: installPreviewCaptureGuard(preview, document) };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('capture blocks every covered view before calling the native delegate', async () => {
  let calls = 0;
  const f = captureFixture(async function (region, width) {
    calls++; assert.equal(this, f.preview); assert.equal(region, null); assert.equal(width, 1280);
    return 'preview';
  });
  for (const view of ['home', 'chat', 'listen']) {
    f.document.body.dataset.orreryView = view;
    await assert.rejects(f.preview.capture(null, 1280), /停用预览截图/);
  }
  assert.equal(calls, 0);
  f.document.body.dataset.orreryView = 'workspace';
  assert.equal(await f.preview.capture(null, 1280), 'preview');
  assert.equal(calls, 1);
});

test('pending native pixels are discarded after switching away and back', async () => {
  const pending = deferred();
  const f = captureFixture(() => pending.promise);
  const result = f.preview.capture();
  const rejected = assert.rejects(result, /截图结果已丢弃/);
  f.document.body.dataset.orreryView = 'chat'; f.guard.viewChanged();
  f.document.body.dataset.orreryView = 'workspace'; f.guard.viewChanged();
  pending.resolve('private-pixels');
  await rejected;
});

test('teardown invalidates pending results and exactly restores the descriptor', async () => {
  const pending = deferred();
  const original = () => pending.promise;
  const f = captureFixture(original);
  const result = assert.rejects(f.preview.capture(), /截图结果已丢弃/);
  f.guard.release(); f.guard.release();
  pending.resolve('private-pixels');
  await result;
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.preview, 'capture'), {
    value: original, writable: true, enumerable: true, configurable: true,
  });
});

test('later plugin wrappers remain protected without recursion and survive cleanup', async () => {
  let calls = 0;
  const f = captureFixture(async () => { calls++; return 'preview'; });
  const prior = f.preview.capture;
  const replacement = async function (...args) { return `${await prior.apply(this, args)}:plugin`; };
  f.preview.capture = replacement;
  assert.equal(await f.preview.capture(), 'preview:plugin');
  assert.equal(calls, 1);
  f.document.body.dataset.orreryView = 'listen';
  await assert.rejects(f.preview.capture(), /停用预览截图/);
  assert.equal(calls, 1);
  f.document.body.dataset.orreryView = 'workspace';
  f.guard.release();
  assert.equal(f.preview.capture, replacement);
  assert.equal(await f.preview.capture(), 'preview:plugin');
});

test('unsupported capture boundaries fail closed and teardown respects a new owner', () => {
  const document = { body: { dataset: {} } };
  assert.throws(() => installPreviewCaptureGuard({}, document), /尚未就绪/);
  const frozen = Object.freeze({ capture() {} });
  assert.throws(() => installPreviewCaptureGuard(frozen, document), /不可安全保护/);
  const f = captureFixture(async () => 'original');
  const replacement = async () => 'new-owner';
  Object.defineProperty(f.preview, 'capture', { value: replacement, configurable: true });
  f.guard.release();
  assert.equal(f.preview.capture, replacement);
});

function domFixture() {
  const listeners = new Map();
  const document = {
    activeElement: null, modal: null,
    getElementById: id => id === 'app' ? app : null,
    querySelector: () => document.modal,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
    emit(type, target) {
      const event = { type, target, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
      };
      for (const fn of listeners.get(type) || []) { fn(event); if (event.stopped) break; }
      return event;
    },
  };
  class Element {
    constructor(parent = null) { this.parent = parent; this.attrs = new Map(); this.isConnected = true; this.classes = new Set(); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    removeAttribute(name) { this.attrs.delete(name); }
    get inert() { return this.attrs.has('inert'); }
    set inert(value) { if (value) this.attrs.set('inert', ''); else this.attrs.delete('inert'); }
    contains(node) { return Boolean(node && (node === this || this.contains(node.parent))); }
    closest() { return this.inert ? this : this.parent?.closest() || null; }
    focus() { document.activeElement = this; }
    classList = {
      contains: name => this.classes.has(name),
      remove: name => this.classes.delete(name),
      toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  const body = new Element(); document.body = body;
  const app = new Element(body), input = new Element(app), root = new Element(body), modal = new Element(body);
  document.activeElement = input;
  return { document, listeners, app, input, root, modal, Element };
}

test('covered legacy input cannot receive keyboard/click events; modal remains interactive', () => {
  const f = domFixture();
  const release = isolateLegacyFocus(f.document, f.root);
  assert.equal(f.app.inert, true);
  assert.equal(f.document.activeElement, f.root);
  for (const type of ['keydown', 'click']) {
    assert.equal(f.document.emit(type, f.input).stopped, true);
    assert.equal(f.document.emit(type, f.modal).stopped, false);
  }
  release(); release();
  assert.equal(f.app.getAttribute('inert'), null);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.listeners.get('keydown').size, 0);
  assert.equal(f.document.emit('keydown', f.input).stopped, false);
});

test('focus isolation preserves existing inert and does not steal modal focus', () => {
  const f = domFixture();
  f.app.setAttribute('inert', 'original');
  f.document.modal = f.modal; f.modal.focus();
  const release = isolateLegacyFocus(f.document, f.root);
  assert.equal(f.document.activeElement, f.modal);
  release();
  assert.equal(f.app.getAttribute('inert'), 'original');
  assert.equal(f.document.activeElement, f.modal);
});

test('Escape only returns from a presentation when no native handler or modal owns it', () => {
  const f = domFixture();
  const event = { key: 'Escape', isTrusted: true };
  assert.equal(shouldExitPresentation(event, 'chat', f.document), true);
  assert.equal(shouldExitPresentation(event, 'listen', f.document), true);
  for (const fields of [{ defaultPrevented: true }, { _auroraEsc: true }, { isTrusted: false }, { isComposing: true }, { keyCode: 229 }, { key: 'Enter' }]) {
    assert.equal(shouldExitPresentation({ ...event, ...fields }, 'chat', f.document), false);
  }
  for (const view of ['workspace', 'home']) assert.equal(shouldExitPresentation(event, view, f.document), false);
  f.document.modal = f.modal;
  assert.equal(shouldExitPresentation(event, 'listen', f.document), false);
});

test('screenshot control lock resists native rerender and restores only its own changes', () => {
  const f = domFixture();
  const button = new f.Element();
  let notify, disconnected = false;
  button.ownerDocument = { defaultView: { MutationObserver: class {
    constructor(fn) { notify = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  } } };
  button.disabled = false;
  button.classes.add('on'); button.classes.add('native'); button.setAttribute('title', 'original');
  const release = lockScreenshotButton(button);
  assert.equal(button.disabled, true); assert.equal(button.classList.contains('on'), false);
  button.disabled = false; button.classes.add('on'); notify();
  assert.equal(button.disabled, true); assert.equal(button.classList.contains('on'), false);
  button.classes.add('native-update');
  release(); release();
  assert.equal(disconnected, true); assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('title'), 'original'); assert.equal(button.getAttribute('aria-disabled'), null);
  assert.equal(button.classList.contains('on'), true); assert.equal(button.classList.contains('native-update'), true);
});
