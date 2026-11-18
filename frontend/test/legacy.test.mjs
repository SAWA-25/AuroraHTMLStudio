import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/legacy.js', import.meta.url), 'utf8');

function fixture({ ready = true, withRail = true } = {}) {
  const listeners = new Map();
  const document = {
    createElement: name => new Element(name),
    createElementNS: (_ns, name) => new Element(name),
    addEventListener(type, callback) {
      const set = listeners.get(type) || new Set();
      set.add(callback); listeners.set(type, set);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    getElementById(id) { return walk(document.body).find(node => node.id === id); },
    querySelector(selector) {
      if (selector === '#rail .rail-top') return withRail ? rail : null;
      if (selector === '#sideTabs [data-side="chat"]') return ready ? chatTab : null;
      throw new Error(`Unmodeled selector: ${selector}`);
    },
  };
  function walk(node) { return [node, ...node.children.flatMap(walk)]; }
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {};
      this.events = new Map(); this.classes = new Set(); this.disabled = false;
      this.classList = { contains: name => this.classes.has(name), add: name => this.classes.add(name) };
    }
    append(...nodes) { nodes.forEach(node => { node.remove(); node.parentNode = this; this.children.push(node); }); }
    appendChild(node) { this.append(node); return node; }
    prepend(node) { node.remove(); node.parentNode = this; this.children.unshift(node); }
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
      this.parentNode = null;
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, callback) {
      const set = this.events.get(type) || new Set(); set.add(callback); this.events.set(type, set);
    }
    removeEventListener(type, callback) { this.events.get(type)?.delete(callback); }
    closest() {
      if (this.id === 'btnCollapseSide' || this.dataset.side === 'design') return this;
      return this.parentNode?.closest() || null;
    }
    click() {
      if (this.disabled) return;
      const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners.get('click')?.forEach(fn => fn(event));
      if (this.onclick) this.onclick(event);
      this.events.get('click')?.forEach(fn => fn(event));
      return event;
    }
  }
  document.body = new Element('body');
  const workspace = new Element('main'); workspace.id = 'workspace';
  const pane = new Element('section'); pane.id = 'paneSide';
  const side = new Element('div');
  const chat = new Element('div'); chat.id = 'viewChat';
  const chatTab = new Element('button'); chatTab.dataset.side = 'chat';
  const design = new Element('button'); design.dataset.side = 'design';
  const collapse = new Element('button'); collapse.id = 'btnCollapseSide';
  const rail = new Element('nav');
  const settings = new Element('button'); settings.id = 'btnSettings';
  const toasts = new Element('div'); toasts.id = 'toastRoot';
  chatTab.onclick = () => { calls.tabs++; chat.classList.add('active'); };
  const calls = { tabs: 0, settings: 0, holds: 0, life: [], errors: [], notices: [], callbacks: [] };
  side.append(chat); pane.append(chatTab, design, collapse, side); workspace.append(pane);
  document.body.append(workspace, rail, settings, toasts);
  const context = vm.createContext({ document, console: { error: (...args) => calls.errors.push(args) } });
  // A classic-script const intentionally has no window/globalThis property, matching Aurora.
  vm.runInContext('const App = { settings: { ui: Object.freeze({ hideSide: true, sideW: 360 }) } }; const ToolHub = { tools: [] };', context);
  context.fixtureCalls = calls;
  vm.runInContext('App.openSettings = () => fixtureCalls.settings++; ToolHub.tools.push({ id: "chat13-bookmarks", open: () => fixtureCalls.holds++ });', context);
  context.HUB15 = { open: async category => calls.life.push(category) };
  context.toast = (message, kind) => calls.notices.push({ message, kind });
  vm.runInContext(`${source.replace(/^export /gm, '')}\nglobalThis.bridge = { enterLegacyView, runLegacyAction, installLegacyBridge };`, context);
  return { context, bridge: context.bridge, document, listeners, calls, pane, side, chat, design, collapse, rail, settings };
}

test('chat activates the real tab without reparenting nodes or writing saved layout', () => {
  const f = fixture();
  const before = vm.runInContext('JSON.stringify(App.settings.ui)', f.context);
  assert.equal(f.bridge.enterLegacyView('chat'), 'chat');
  assert.equal(f.document.body.dataset.orreryView, 'chat');
  assert.equal(f.calls.tabs, 1);
  assert.equal(f.chat.parentNode, f.side);
  assert.equal(f.side.parentNode, f.pane);
  assert.equal(vm.runInContext('JSON.stringify(App.settings.ui)', f.context), before);
  assert.equal(f.bridge.enterLegacyView('workspace'), 'workspace');
  assert.equal(f.calls.tabs, 1);
  assert.throws(() => f.bridge.enterLegacyView('other'), /未知星盘视图/);
  assert.equal(f.document.body.dataset.orreryView, 'workspace');
});

test('unready chat fails before switching the visible view', () => {
  const f = fixture({ ready: false });
  f.document.body.dataset.orreryView = 'home';
  assert.throws(() => f.bridge.enterLegacyView('chat'), /原生聊天面板尚未就绪/);
  assert.equal(f.document.body.dataset.orreryView, 'home');
});

test('action routing reaches lexical globals and the real tool center', async () => {
  const f = fixture();
  assert.equal(f.context.App, undefined);
  assert.equal(f.context.ToolHub, undefined);
  for (const id of ['hold', 'life', 'settings']) assert.equal(await f.bridge.runLegacyAction(id), true);
  assert.equal(f.calls.holds, 1); assert.equal(f.calls.settings, 1);
  assert.deepEqual(f.calls.life, ['home']);
  assert.equal(await f.bridge.runLegacyAction('home'), true);
  assert.equal(f.document.body.dataset.orreryView, 'workspace');
});

test('settings uses the bound original button when its App entrypoint is unavailable', async () => {
  const f = fixture();
  vm.runInContext('delete App.openSettings', f.context);
  f.settings.onclick = () => f.calls.settings++;
  assert.equal(await f.bridge.runLegacyAction('settings'), true);
  assert.equal(f.calls.settings, 1);
});

test('a missing or rejected action reports failure instead of inventing a successful route', async () => {
  const f = fixture();
  delete f.context.HUB15;
  assert.equal(await f.bridge.runLegacyAction('life'), false);
  assert.equal(f.calls.notices.length, 1); assert.match(f.calls.notices[0].message, /创作中心尚未加载/);
  f.context.HUB15 = { open: async () => { throw new Error('storage unavailable'); } };
  assert.equal(await f.bridge.runLegacyAction('life'), false);
  assert.match(f.calls.notices[1].message, /storage unavailable/);
  assert.equal(await f.bridge.runLegacyAction('unknown'), false);
  assert.equal(f.calls.errors.length, 3);
});

test('rail registration is single-instance and cleanup removes only owned nodes/listeners', () => {
  const f = fixture();
  const cleanup = f.bridge.installLegacyBridge(view => f.calls.callbacks.push(view));
  assert.equal(f.rail.children.length, 1);
  const firstButton = f.rail.children[0];
  assert.equal(firstButton.dataset.rail, 'aurora-orrery');
  assert.equal(firstButton.children[0].tagName, 'svg');
  firstButton.click(); assert.deepEqual(f.calls.callbacks, ['home']);
  const cleanupAgain = f.bridge.installLegacyBridge(view => f.calls.callbacks.push(view));
  assert.equal(f.rail.children.length, 1); assert.notEqual(f.rail.children[0], firstButton);
  assert.equal(firstButton.events.get('click').size, 0);
  cleanup(); assert.equal(f.rail.children.length, 1);
  cleanupAgain(); assert.equal(f.rail.children.length, 0);
  assert.equal(f.listeners.get('click').size, 0);
  assert.equal(f.chat.parentNode, f.side);
});

test('native design and collapse controls leave letter view without cancelling their handlers', () => {
  const f = fixture();
  const cleanup = f.bridge.installLegacyBridge(view => f.calls.callbacks.push(view));
  let nativeActions = 0;
  f.design.onclick = f.collapse.onclick = () => nativeActions++;
  for (const control of [f.design, f.collapse]) {
    f.bridge.enterLegacyView('chat');
    const event = control.click();
    assert.equal(event.defaultPrevented, false);
    assert.equal(f.document.body.dataset.orreryView, 'workspace');
  }
  assert.equal(nativeActions, 2); assert.deepEqual(f.calls.callbacks, ['workspace', 'workspace']);
  cleanup();
});

test('bridge requires a real ready rail and callback', () => {
  const f = fixture({ withRail: false });
  assert.throws(() => f.bridge.installLegacyBridge(() => {}), /原生侧栏尚未就绪/);
  assert.throws(() => f.bridge.installLegacyBridge(), /onOpen/);
});
