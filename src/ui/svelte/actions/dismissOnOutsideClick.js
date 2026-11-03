// Whether `target` is a node inside `node` or `extras`, a node, an array or a resolver of either,
// every node told by `nodeType`.
function holds([node, extras], target) {
  if (typeof target?.nodeType !== 'number') return false;
  const resolved = typeof extras === 'function' ? extras() : extras;
  return [node, ...[resolved ?? []].flat()].some(
    (each) => typeof each?.nodeType === 'number' && each.contains(target)
  );
}

const CAPTURE = Object.freeze({ capture: true });

// Calls `current()`, read as each mutation is delivered, once `node` has left the document `sync`
// was given; a node disconnected at `sync`, or a document with no `MutationObserver`, is not watched.
function watchDetach(node, current) {
  let watch = null;
  const stop = () => {
    watch?.disconnect();
    watch = null;
  };
  return {
    stop,
    sync(doc) {
      const Observer = doc?.defaultView?.MutationObserver;
      if (!doc || typeof current() !== 'function') stop();
      else if (!watch && node.isConnected && typeof Observer === 'function') {
        watch = new Observer(() => {
          if (node.isConnected) return;
          stop();
          const report = current();
          if (typeof report === 'function') report();
        });
        watch.observe(doc, { childList: true, subtree: true });
      }
    },
  };
}

// Under `dismissOn: 'click'`, whether a primary-button press went down, then came up, `outside`;
// `clicked` answers it for a pointer's click, `detail` above 0, never a keyboard's or `click()`'s,
// and forgets it, as `reset` does.
function primaryPress(outside) {
  let state = 'idle';
  const primary = (event) => event.button === 0 && outside(event);
  return {
    down(event) {
      state = primary(event) ? 'down' : 'idle';
    },
    up(event) {
      state = state === 'down' && primary(event) ? 'up' : 'idle';
    },
    clicked(event) {
      const released = state === 'up' && event.button === 0 && event.detail > 0;
      state = 'idle';
      return released;
    },
    reset() {
      state = 'idle';
    },
  };
}

/**
 * Svelte action that calls a callback when a mousedown occurs outside the
 * bound node, or when Escape is pressed while the action is enabled. Both are
 * heard on the node's own document, and a node is told by `nodeType` (issue 2454).
 * With `dismissOn: 'click'` a press calls it only as the primary button's `click` fires, and only
 * when that button went down and came up outside, each judged as it happened (issue 2879).
 * While enabled, `onDetached` is called once when the node leaves that document, read when a
 * mutation is delivered, so a removal and re-insertion in one run of script calls nothing; a node
 * attached while disconnected is not watched, nor is a document the node moves to (issue 2671).
 * A node inside a shadow root is reported when that root's host leaves the document, and not when
 * the removal happens inside the root; a later mutation elsewhere in the document reports it.
 * `onFocusLeave` is called for a focusout from inside to a node outside, never for a `null` one.
 *
 * @param {HTMLElement} node
 * @param {{
 *   enabled?: boolean,
 *   dismissOn?: 'mousedown' | 'click',
 *   onDismiss?: Function,
 *   onDetached?: Function,
 *   onFocusLeave?: Function,
 *   additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 * }} [options]
 * @returns {{
 *   update(newOptions?: {
 *     enabled?: boolean,
 *     dismissOn?: 'mousedown' | 'click',
 *     onDismiss?: Function,
 *     onDetached?: Function,
 *     onFocusLeave?: Function,
 *     additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 *   }): void,
 *   destroy(): void
 * }}
 */
export function dismissOnOutsideClick(node, options = {}) {
  let enabled = options.enabled !== false;
  let onDismiss = options.onDismiss;
  let onDetached = options.onDetached;
  let onFocusLeave = options.onFocusLeave;
  let additionalNodes = options.additionalNodes;
  let onClick = options.dismissOn === 'click';
  // The document the pair is bound to, so it is removed from that one.
  let bound = null;
  const detachWatch = watchDetach(node, () => onDetached);

  function dismiss(event) {
    if (typeof onDismiss === 'function') onDismiss(event);
  }

  function outside({ target }) {
    return typeof target?.nodeType === 'number' && !holds([node, additionalNodes], target);
  }

  const press = primaryPress(outside);

  function handleMouseDown(event) {
    if (onClick) press.down(event);
    else if (outside(event)) dismiss(event);
  }

  function handleClick(event) {
    if (press.clicked(event) && onClick) dismiss(event);
  }

  function handleFocusOut(event) {
    const inside = [node, additionalNodes];
    if (typeof onFocusLeave !== 'function' || !holds(inside, event.target)) return;
    const next = event.relatedTarget;
    if (typeof next?.nodeType === 'number' && !holds(inside, next)) onFocusLeave(event);
  }

  function handleKeyDown(event) {
    press.reset();
    if (event.key === 'Escape') dismiss(event);
  }

  const listeners = [
    ['mousedown', handleMouseDown],
    ['mouseup', press.up],
    ['click', handleClick],
    ['keydown', handleKeyDown],
    ['focusout', handleFocusOut],
  ];

  function attach() {
    const doc = node?.ownerDocument;
    if (bound || typeof doc?.addEventListener !== 'function') return;
    for (const [type, listener] of listeners) doc.addEventListener(type, listener, CAPTURE);
    bound = doc;
  }

  function detach() {
    detachWatch.stop();
    press.reset();
    if (!bound) return;
    for (const [type, listener] of listeners) bound.removeEventListener(type, listener, CAPTURE);
    bound = null;
  }

  if (enabled) {
    attach();
    detachWatch.sync(bound);
  }

  return {
    update(newOptions = {}) {
      onDismiss = newOptions.onDismiss;
      onDetached = newOptions.onDetached;
      onFocusLeave = newOptions.onFocusLeave;
      additionalNodes = newOptions.additionalNodes;
      onClick = newOptions.dismissOn === 'click';
      const nextEnabled = newOptions.enabled !== false;
      if (nextEnabled !== enabled) {
        enabled = nextEnabled;
        if (enabled) attach();
        else detach();
      }
      detachWatch.sync(bound);
    },

    destroy() {
      detach();
    },
  };
}
