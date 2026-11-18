export function isPresentationReady(document, booted, tourPending = false) {
  return Boolean(booted && !tourPending && document.querySelector('#rail .rail-top')
    && !document.getElementById('boot') && !document.querySelector('.c7-tour'));
}

export function shouldExitPresentation(event, view, document) {
  return (view === 'chat' || view === 'listen') && event.key === 'Escape'
    && event.isTrusted !== false && !event.defaultPrevented && !event._auroraEsc
    && !event.isComposing && event.keyCode !== 229
    && !document.querySelector('#modalRoot .modal-mask, .dropmenu, dialog[open]');
}

export function isolateLegacyFocus(document, root) {
  const app = document.getElementById('app');
  if (!app || !root) return () => {};
  const previous = document.activeElement;
  const originalInert = app.getAttribute('inert');
  app.inert = true;
  // Native modals are siblings of #app and keep their own focus management.
  if (!document.querySelector('#modalRoot .modal-mask, .dropmenu, dialog[open]')) {
    root.focus({ preventScroll: true });
  }
  const protect = event => {
    if (!app.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    root.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', protect, true);
  document.addEventListener('click', protect, true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    document.removeEventListener('keydown', protect, true);
    document.removeEventListener('click', protect, true);
    if (originalInert === null) app.removeAttribute('inert');
    else app.setAttribute('inert', originalInert);
    const focus = document.activeElement;
    if (previous?.isConnected && !previous.closest('[inert]')
      && (focus === document.body || root.contains(focus))) previous.focus({ preventScroll: true });
  };
}
