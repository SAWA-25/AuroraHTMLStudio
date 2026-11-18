import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/studioProject.js', import.meta.url), 'utf8').replace(/^export /gm, '');
function fixture() {
  const context = vm.createContext({});
  vm.runInContext(`
    const PROJECT_TYPES = { web: { name: '网页' } };
    const App = {
      project: { id: 'one', name: '作品一', type: 'web', updated: 30, files: { css: 'body {}', html: '<h1>作品一</h1>\\n<p>正文</p>' } },
      projects: [{ id: 'two', name: '作品二', type: 'web', updated: 50 }, { id: 'one', name: '作品一', type: 'web', updated: 30 }],
      openProject(id) { this.project = this.projects.find(project => project.id === id); }
    };
    const PV = { lastProj: 'one', lastDoc: '<html>真实预览</html>' };
    ${source}
    globalThis.api = { readStudioProject, selectStudioProject };
  `, context);
  return context;
}

test('home reads native lexical project data without changing source order or project files', () => {
  const f = fixture();
  const before = vm.runInContext('JSON.stringify(App)', f);
  const project = f.api.readStudioProject();
  assert.equal(project.id, 'one');
  assert.equal(project.type, '网页');
  assert.equal(project.fileCount, 2);
  assert.equal(project.sourceFile, 'html');
  assert.equal(project.sourceLines.join('\n'), '<h1>作品一</h1>\n<p>正文</p>');
  assert.equal(project.previewDoc, '<html>真实预览</html>');
  assert.equal(project.recent.map(item => item.id).join(','), 'two,one');
  assert.equal(vm.runInContext('JSON.stringify(App)', f), before);
});

test('real source newlines produce separate excerpt rows', () => {
  const f = fixture();
  vm.runInContext('App.project.files.html = ["<h1>第一行</h1>", "<p>第二行</p>"].join(String.fromCharCode(10))', f);
  assert.equal(f.api.readStudioProject().sourceLines.length, 2);
});

test('home never pairs another project with stale preview pixels', () => {
  const f = fixture();
  vm.runInContext('PV.lastProj = "two";', f);
  assert.equal(f.api.readStudioProject().previewDoc, '');
  vm.runInContext('App.project = null; App.projects = [];', f);
  const empty = f.api.readStudioProject();
  assert.equal(empty.id, '');
  assert.equal(empty.fileCount, 0);
  assert.equal(empty.previewDoc, '');
  assert.equal(empty.recent.length, 0);
});

test('project selection falls back to new source while the native iframe still has old pixels', () => {
  const f = fixture();
  vm.runInContext(`
    function liveDocument(html) {
      return {
        body: { childElementCount: 1 },
        documentElement: { cloneNode() { return { outerHTML: html, querySelectorAll() { return []; } }; } },
        querySelectorAll() { return []; }
      };
    }
    PV.frame = { contentDocument: liveDocument('<html>OLD LIVE</html>') };
    App.openProject = function(id) {
      this.project = this.projects.find(project => project.id === id);
      PV.lastProj = id;
      PV.lastDoc = '<html>NEW SOURCE</html>';
    };
  `, f);
  assert.equal(f.api.readStudioProject().previewDoc, '<html>OLD LIVE</html>');
  f.api.selectStudioProject('two');
  assert.equal(f.api.readStudioProject().previewDoc, '<html>NEW SOURCE</html>');
  vm.runInContext("PV.frame.contentDocument = liveDocument('<html>NEW LIVE</html>')", f);
  assert.equal(f.api.readStudioProject().previewDoc, '<html>NEW LIVE</html>');
});

test('recent project selection invokes native open and rejects missing or failed selections', () => {
  const f = fixture();
  f.api.selectStudioProject('two');
  assert.equal(f.api.readStudioProject().id, 'two');
  assert.throws(() => f.api.selectStudioProject('removed'), /已不在当前列表/);
  vm.runInContext('App.openProject = () => {};', f);
  assert.throws(() => f.api.selectStudioProject('one'), /尚未打开/);
});
