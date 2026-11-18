import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { readStudioProject, selectStudioProject, staticProjectPreview } from './studioProject.js';

const ease = [0.22, 1, 0.36, 1];

function StudioMark() {
  return <svg viewBox="0 0 44 36" fill="none" aria-hidden="true"><path d="M15 8 3 18l12 10M29 8l12 10-12 10M25 3l-6 30" stroke="currentColor" strokeWidth="1.3"/><path d="M0 1h44M0 35h44M22 0v5M22 31v5" stroke="currentColor" strokeWidth=".5" opacity=".4"/></svg>;
}

function Arrow({ diagonal = false }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.2"/></svg>;
}

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value) : '尚未修改';
}

function useProject() {
  const [project, setProject] = useState(readStudioProject);
  const refresh = () => setProject(readStudioProject());
  useEffect(() => {
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 100); };
    const observer = new MutationObserver(schedule);
    for (const id of ['projName', 'projType', 'editorTabs', 'frame']) {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['srcdoc'] });
    }
    const frame = document.getElementById('frame');
    frame?.addEventListener('load', schedule);
    window.addEventListener('focus', schedule);
    return () => { clearTimeout(timer); observer.disconnect(); frame?.removeEventListener('load', schedule); window.removeEventListener('focus', schedule); };
  }, []);
  return [project, refresh];
}

export function Home({ night, onToggleNight, onNavigate }) {
  const reduced = useReducedMotion();
  const [project, refresh] = useProject();
  const [error, setError] = useState('');
  const [mode, setMode] = useState('preview');
  const [loadedSource, setLoadedSource] = useState('');
  const source = useMemo(() => staticProjectPreview(project.previewDoc), [project.previewDoc]);
  const [frameSize, setFrameSize] = useState({ width: 960, height: 600 });
  const frameRef = useRef(null);
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const resize = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setFrameSize({ width: 960, height: width ? Math.round(entry.contentRect.height * 960 / width) : 600, scale: width / 960 });
    });
    resize.observe(node);
    return () => resize.disconnect();
  }, []);
  const choose = id => {
    try { selectStudioProject(id); refresh(); setError(''); }
    catch (failure) { setError(failure.message); }
  };
  const actions = [
    { id: 'new', label: '从模板开始', note: '空白页面、网页与扩展', index: '01' },
    { id: 'projects', label: '项目档案', note: '查找、重命名与管理作品', index: '02' },
    { id: 'tools', label: '创作工具', note: '素材、组件与实用工具', index: '03' },
  ];
  return <motion.main className="studio-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }} aria-label="Aurora 创作起始台">
    <header className="studio-masthead">
      <a className="studio-brand" href="#workspace" onClick={event => { event.preventDefault(); onNavigate('workspace'); }}><StudioMark/><span>Aurora<small>HTML STUDIO</small></span></a>
      <span className="studio-edition">从代码，到作品。<small>YOUR LOCAL CREATIVE WORKSPACE</small></span>
      <div className="studio-header-actions"><button type="button" onClick={onToggleNight} aria-label={night ? '切换为浅色主题' : '切换为深色主题'} aria-pressed={night}>{night ? '浅色纸面' : '深色纸面'}</button><button type="button" onClick={() => onNavigate('settings')}>设置</button></div>
    </header>
    <div className="studio-main">
      <section className="studio-intro">
        <p className="studio-eyebrow"><span className="studio-cross" aria-hidden="true"/> WORK / IN PROGRESS</p>
        <h1>让想法，<br/><em>成为可见。</em></h1>
        <p className="studio-description">写下代码，随手预览。<br/>从上次停下的地方，继续完成你的作品。</p>
        <button type="button" className="studio-continue" onClick={() => onNavigate(project.id ? 'workspace' : 'new')}><span>{project.id ? '继续创作' : '创建第一个作品'}<small>{project.id ? project.name : '打开模板与空白项目'}</small></span><Arrow/></button>
        <nav className="studio-actions" aria-label="创作入口">{actions.map(action => <button key={action.id} type="button" onClick={() => onNavigate(action.id)}><span className="studio-action-index">{action.index}</span><span>{action.label}<small>{action.note}</small></span><Arrow diagonal/></button>)}</nav>
      </section>
      <section className="studio-work" aria-label="当前作品">
        <div className="studio-work-heading"><p className="studio-eyebrow">CURRENT CANVAS <span>/ 当前作品</span></p><span className="studio-file-count">{String(project.fileCount).padStart(2, '0')} FILES</span></div>
        <div className="studio-sheet" data-mode={mode}>
          <div className="studio-sheet-bar"><span title={project.name}>{project.name}</span><div className="studio-view-toggle" aria-label="作品视图"><button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>预览</button><button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>代码</button></div></div>
          <div className="studio-composition">
            <div className="studio-source" aria-label={`${project.sourceFile || '当前文件'}代码摘录`}><div className="studio-source-label">{project.sourceFile || 'SOURCE'} <span>↘</span></div><ol>{(project.sourceLines.length ? project.sourceLines : ['从一个空白页面开始。', '你的代码会在这里出现。']).map((line, i) => <li key={i}><code>{line.slice(0, 180)}</code></li>)}</ol><span className="studio-source-foot">SOURCE → CANVAS</span></div>
            <div className="studio-preview-mat">
              <div className="studio-preview-ruler" aria-hidden="true"><span>0</span><span>480</span><span>960</span></div>
              <div ref={frameRef} className="studio-preview" style={{ viewTransitionName: 'aurora-canvas' }}>
                <AnimatePresence mode="wait" initial={false}><motion.div className="studio-preview-content" key={project.id + source.length} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .12 }}>
                  {source ? <><iframe sandbox="" referrerPolicy="no-referrer" title={`${project.name} 静态预览`} srcDoc={source} tabIndex={-1} onLoad={() => setLoadedSource(source)} style={{ width: frameSize.width, height: frameSize.height, transform: `scale(${frameSize.scale || 1})` }}/>{loadedSource !== source && <div className="studio-preview-loading" role="status">正在铺开作品…</div>}</> : <div className="studio-empty"><StudioMark/><h2>{project.id ? '这件作品还在酝酿。' : '留一张纸，给下一个想法。'}</h2><p>{project.id ? '进入工作台，预览将在这里接续。' : '新建项目后，这里会呈现你的作品。'}</p></div>}
                </motion.div></AnimatePresence>
              </div>
              <button type="button" className="studio-open-canvas" onClick={() => onNavigate(project.id ? 'workspace' : 'new')}>{project.id ? '展开到工作台' : '开始新作品'}<Arrow diagonal/></button>
            </div>
          </div>
          <div className="studio-sheet-caption"><span>{project.type}</span><span>{source ? '本地静态预览 · 完整交互请进入工作台' : '等待作品预览'}</span></div>
        </div>
        <div className="studio-recent-heading"><h2>最近的作品</h2><button type="button" onClick={() => onNavigate('projects')}>全部项目 <span aria-hidden="true">↗</span></button></div>
        <div className="studio-recent">{project.recent.length ? project.recent.map((item, i) => <button key={item.id} type="button" aria-pressed={item.id === project.id} onClick={() => choose(item.id)}><span className="studio-recent-index">{String(i + 1).padStart(2, '0')}</span><span className="studio-recent-name">{item.name}<small>{item.type}</small></span><time dateTime={item.updated ? new Date(item.updated).toISOString() : undefined}>{dateLabel(item.updated)}</time><span className="studio-recent-status">{item.id === project.id ? '当前' : '选用'}</span></button>) : <p className="studio-no-projects">还没有项目。从模板或空白页面开始。</p>}</div>
        {error && <p className="studio-project-error" role="alert">{error}</p>}
      </section>
    </div>
    <footer className="studio-footer"><span>AURORA / HTML STUDIO</span><span>代码与预览，在同一张工作台上。</span><button type="button" onClick={() => onNavigate('assistant')}>打开创作助手 <span aria-hidden="true">↗</span></button></footer>
  </motion.main>;
}
