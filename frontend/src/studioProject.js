/* Read-only presentation model. Native Aurora remains the owner of projects and persistence. */
export function studioApp() {
  return typeof App !== 'undefined' ? App : globalThis.App;
}

export function studioPreview() {
  return typeof PV !== 'undefined' ? PV : globalThis.PV;
}

const supersededDocuments = new WeakSet();

function renderedPreview(preview) {
  try {
    const live = preview.frame?.contentDocument;
    if (live?.body?.childElementCount && !supersededDocuments.has(live)) {
      const clone = live.documentElement.cloneNode(true);
      const liveCanvases = live.querySelectorAll('canvas');
      clone.querySelectorAll('canvas').forEach((canvas, i) => {
        const original = liveCanvases[i];
        if (!original || original.width * original.height > 4000000) return;
        try {
          const image = live.createElement('img');
          for (const attribute of canvas.attributes) image.setAttribute(attribute.name, attribute.value);
          image.src = original.toDataURL('image/png');
          canvas.replaceWith(image);
        } catch (error) { console.warn('[studio] canvas snapshot unavailable', error); }
      });
      return clone.outerHTML;
    }
  } catch (error) { console.warn('[studio] using source preview fallback', error); }
  return preview.lastDoc || '';
}

export function readStudioProject() {
  const app = studioApp();
  const project = app?.project;
  const projects = Array.isArray(app?.projects) ? app.projects : [];
  const types = typeof PROJECT_TYPES !== 'undefined' ? PROJECT_TYPES : globalThis.PROJECT_TYPES;
  const files = project?.files && typeof project.files === 'object' ? project.files : {};
  const source = Object.entries(files).find(([key, value]) => /html/i.test(key) && typeof value === 'string')
    || Object.entries(files).find(([, value]) => typeof value === 'string' && value.trim());
  const preview = studioPreview();
  return {
    id: project?.id || '',
    name: project?.name || '还没有打开作品',
    type: types?.[project?.type]?.name || project?.type || '新建项目后开始创作',
    updated: Number(project?.updated) || 0,
    fileCount: Object.keys(files).length,
    sourceFile: source?.[0] || '',
    sourceLines: (source?.[1] || '').split('\n').filter(line => line.trim()).slice(0, 11),
    previewDoc: project && preview?.lastProj === project.id ? renderedPreview(preview) : '',
    recent: [...projects].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 4)
      .map(item => ({ id: item.id, name: item.name, type: types?.[item.type]?.name || item.type || '项目', updated: Number(item.updated) || 0 })),
  };
}

export function selectStudioProject(id) {
  const app = studioApp();
  if (!app?.projects?.some(project => project.id === id) || typeof app.openProject !== 'function') {
    throw new Error('此项目已不在当前列表中，请从项目档案重新选择。');
  }
  if (app.project?.id === id) return;
  // Native open sets lastProj before its iframe finishes navigating: never reuse old pixels.
  const previousDocument = studioPreview()?.frame?.contentDocument;
  app.openProject(id);
  if (previousDocument) supersededDocuments.add(previousDocument);
  if (app.project?.id !== id) throw new Error('项目尚未打开，请稍后重试。');
}

// Template parsing drops html/body wrappers; preserve only inert presentation attributes.
function documentPresentation(source, document) {
  const attributes = { html: '', body: '' };
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-zA-Z][\w:.-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;
  let match, depth = 0;
  while ((match = tags.exec(source))) {
    if (!match[1]) continue;
    const name = match[1].toLowerCase();
    const closing = match[0].startsWith('</');
    if (name === 'template') { depth = Math.max(0, depth + (closing ? -1 : 1)); continue; }
    if (!closing && /^(script|style|textarea|title|xmp|noscript|iframe|noembed|noframes)$/.test(name)) {
      const end = new RegExp('</' + name + '\\s*>', 'ig');
      end.lastIndex = tags.lastIndex;
      if (!end.exec(source)) break;
      tags.lastIndex = end.lastIndex;
      continue;
    }
    if (depth || closing || !(name in attributes) || attributes[name]) continue;
    const holder = document.createElement('template');
    holder.innerHTML = '<i' + match[2] + '></i>';
    const node = holder.content.firstElementChild;
    if (!node) continue;
    attributes[name] = Array.from(node.attributes)
      .filter(attr => /^(?:class|id|style|dir|lang|data-[\w-]+)$/i.test(attr.name))
      .map(attr => ' ' + attr.name + '="' + attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"').join('');
  }
  return attributes;
}

/** A second, static view of the existing render. No scripts, storage, forms or network. */
export function staticProjectPreview(source, document = globalThis.document) {
  if (!source || !document) return '';
  // Template contents stay inert even while their HTML is parsed: no image preloads.
  const presentation = documentPresentation(source, document);
  const template = document.createElement('template');
  template.innerHTML = source;
  const content = template.content;
  content.querySelectorAll('script, iframe, frame, object, embed, base, link, meta, audio, video, source, track, template').forEach(node => node.remove());
  content.querySelectorAll('*').forEach(node => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name) || /^(?:srcdoc|action|formaction|ping|autofocus|contenteditable)$/i.test(attr.name)) node.removeAttribute(attr.name);
      if (/^(?:src|srcset|href|poster|xlink:href)$/i.test(attr.name) && !/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)[;,]/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  });
  return '<!doctype html><html' + presentation.html + '><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; connect-src \'none\'; media-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '</head><body' + presentation.body + '>' + template.innerHTML
    + '<style>html{pointer-events:none;overflow:hidden}*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}</style></body></html>';
}
