/**
 * A content host that must hold nothing focusable, such as the inside of a `<button>` (issue 2862).
 * `FOCUSABLE_CONTENT` matches HTML's interactive content and every element a key or a script can
 * focus; it does not see into a shadow root.
 */
export const FOCUSABLE_CONTENT = [
  'a[href]',
  'area[href]',
  'audio[controls]',
  'button',
  'details',
  'embed',
  'iframe',
  'img[usemap]',
  'input:not([type="hidden"])',
  'label',
  'object',
  'select',
  'summary',
  'textarea',
  'video[controls]',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

const WATCHED = Object.freeze({
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['href', 'controls', 'usemap', 'type', 'tabindex', 'contenteditable'],
});

/**
 * Calls `onFound(element)` with the first focusable element under `node`, at once and after each
 * change that makes one appear, until the action is destroyed.
 */
export function watchFocusable(node, onFound) {
  let report = onFound;
  const check = () => {
    const found = node.querySelector(FOCUSABLE_CONTENT);
    if (found) report?.(found);
  };
  const observer = new MutationObserver(check);
  observer.observe(node, WATCHED);
  check();
  return {
    update(next) {
      report = next;
    },
    destroy() {
      observer.disconnect();
    },
  };
}
