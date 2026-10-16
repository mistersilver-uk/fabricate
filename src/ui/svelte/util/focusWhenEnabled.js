/**
 * Focus a control and keep it across its caller's pending command: Chromium drops focus to `<body>`
 * the moment a focused control is disabled, so once this one is enabled again it takes focus back,
 * unless the keyboard has moved on meanwhile (issue 1644). It restores at most once.
 */
export function focusWhenEnabled(element) {
  if (!element) return;
  element.focus();
  const observer = new MutationObserver(() => {
    if (element.disabled) return;
    stop();
    const active = element.ownerDocument.activeElement;
    if (element.isConnected && (!active || active === element.ownerDocument.body)) element.focus();
  });
  // Focus that moves to another control, or leaves while this one is still enabled, is not lost.
  const leave = (event) => {
    if (event.relatedTarget || !element.disabled) stop();
  };
  function stop() {
    observer.disconnect();
    element.removeEventListener('focusout', leave);
  }
  observer.observe(element, { attributes: true, attributeFilter: ['disabled'] });
  element.addEventListener('focusout', leave);
}
