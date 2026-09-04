/*
 * THE ANCHORED-POPOVER ACTION, ON SYNTHETIC RECTS (issue 1500).
 *
 * happy-dom computes no layout — every `getBoundingClientRect` is a zero box — so this suite
 * STUBS the rects rather than pretending to measure. That is the right level for the algorithm:
 * flip, clamp, the two `bounds` forms and the whole-row flooring are pure functions of four
 * boxes, and asserting them against numbers we chose is what makes a wrong branch visible.
 *
 * The complementary half is `tests/components/overlay-portal-host-position.test.js`, which drives
 * the real components in Chromium and asserts the panel is adjacent to its trigger inside the
 * resolved host. That suite deliberately does not pin the algorithm; this one does, and neither
 * is sufficient alone.
 *
 * Both shipped layout functions are exercised through the action rather than re-implemented here,
 * because the contract under test is the ARGUMENT SHAPE the action hands them — the boundary a
 * copy would have got wrong.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { anchoredPopover, hostRelativePopoverLayout } = await import(
  '../../src/ui/svelte/actions/anchoredPopover.js'
);
const { computeIconPickerPopoverLayout } = await import(
  '../../src/ui/svelte/util/iconPickerPopover.js'
);
const { computeActionMenuLayout } = await import('../../src/ui/svelte/util/actionMenuLayout.js');
const { pickerScrollerBounds, MANAGER_MAIN_SELECTOR } = await import(
  '../../src/ui/svelte/util/overlayBounds.js'
);
const { resetOverlayHostDiagnostics } = await import('../../src/ui/svelte/util/overlayHost.js');

const pickerLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);
const menuLayout = (triggerRect, panelRect, hostRect) =>
  computeActionMenuLayout(triggerRect, panelRect, hostRect);

/** A rect literal, in the shape `getBoundingClientRect` returns. */
function box(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** Give an element a fixed box, since happy-dom lays nothing out. */
function measuring(element, rect) {
  element.getBoundingClientRect = () => rect;
  return element;
}

/**
 * The DOM every case starts from: an application root, a picker root inside it, a trigger and an
 * unpositioned panel.
 *
 * @param {object} [rects]
 * @returns {{host: HTMLElement, root: HTMLElement, trigger: HTMLElement, panel: HTMLElement}}
 */
function scene({ host: hostRect = box(0, 0, 1000, 800), trigger: triggerRect = box(100, 100, 200, 30), panel: panelRect = box(0, 0, 200, 150) } = {}) {
  const host = measuring(document.createElement('div'), hostRect);
  host.className = 'fabricate-manager';
  const root = document.createElement('div');
  const trigger = measuring(document.createElement('button'), triggerRect);
  const panel = measuring(document.createElement('div'), panelRect);
  root.append(trigger, panel);
  host.append(root);
  document.body.append(host);
  return { host, root, trigger, panel };
}

/**
 * The action's own required options, plus the picker layout and a stated width band — the shape
 * every converted picker passes. Overrides replace whole keys, `layoutOptions` included.
 */
function options(overrides = {}) {
  return {
    component: 'TestPopover',
    layout: pickerLayout,
    layoutOptions: () => ({ horizontalAlign: 'left', minWidth: 240, maxWidth: 340 }),
    ...overrides,
  };
}

/**
 * happy-dom's globals are FLATTENED onto `globalThis`, and `addEventListener` is not among them —
 * so the shipped `typeof window.addEventListener !== 'function'` guard, which three of the six
 * converted components already carried, makes the action skip its listeners entirely here. A
 * browser has them, so the suite installs the smallest thing that behaves like one; without it
 * every re-measure assertion below would pass by never running.
 *
 * @returns {() => void} Restores `globalThis`.
 */
function installWindowEvents() {
  const registry = new Map();
  globalThis.addEventListener = (type, handler) => {
    if (!registry.has(type)) registry.set(type, new Set());
    registry.get(type).add(handler);
  };
  globalThis.removeEventListener = (type, handler) => registry.get(type)?.delete(handler);
  globalThis.dispatchEvent = (event) => {
    // A REAL `window.dispatchEvent` SETS `event.target` TO THE WINDOW, and the window is not a
    // `Node`. happy-dom leaves `target` null until a real dispatch, so a shim that skipped this
    // would hand every listener an event with no target — which is the one input that made
    // `node.contains(event.target)` safe by accident. The resize case below depends on it.
    Object.defineProperty(event, 'target', { configurable: true, value: globalThis });
    for (const handler of [...(registry.get(event.type) ?? [])]) handler(event);
    return true;
  };
  return () => {
    delete globalThis.addEventListener;
    delete globalThis.removeEventListener;
    delete globalThis.dispatchEvent;
  };
}

describe('anchoredPopover', () => {
  let restoreWindowEvents = () => {};

  before(() => {
    setupDOM();
    restoreWindowEvents = installWindowEvents();
  });
  after(() => {
    restoreWindowEvents();
    teardownDOM();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    resetOverlayHostDiagnostics();
  });

  it('portals the panel into the resolved host and measures against it', () => {
    const { host, trigger, panel } = scene();

    const handle = anchoredPopover(panel, options({ trigger }));

    assert.equal(panel.parentNode, host, 'the panel is portaled into the resolved application root');
    assert.equal(
      panel.getAttribute('style'),
      'left: 100px; right: auto; width: 240px; max-height: 380px; top: 136px; bottom: auto;'
    );
    handle.destroy();
  });

  it('measures in the host’s coordinates, not the viewport’s', () => {
    // The same trigger, in a host offset 400px right and 200px down. A pass that used viewport
    // coordinates against a `position: absolute` panel inside that host would write 100/136 again
    // and draw the panel 400px to the right of its trigger.
    const { trigger, panel } = scene({
      host: box(400, 200, 1000, 800),
      trigger: box(500, 300, 200, 30),
    });

    const handle = anchoredPopover(panel, options({ trigger }));

    assert.match(panel.getAttribute('style'), /^left: 100px;/);
    assert.match(panel.getAttribute('style'), /top: 136px;/);
    handle.destroy();
  });

  it('flips above the trigger at the bottom edge and writes `bottom`', () => {
    const { trigger, panel } = scene({ trigger: box(100, 700, 200, 30) });

    const handle = anchoredPopover(panel, options({ trigger }));

    assert.equal(
      panel.getAttribute('style'),
      'left: 100px; right: auto; width: 240px; max-height: 380px; top: auto; bottom: 106px;',
      'a flipped panel is pinned by its BOTTOM edge, with `top` released'
    );
    handle.destroy();
  });

  it('clamps the panel inside the host at the right edge', () => {
    const { trigger, panel } = scene({ trigger: box(900, 100, 80, 30) });

    const handle = anchoredPopover(panel, options({ trigger }));

    // Left-aligned to the trigger would be 900; the host's own right margin caps it at 744.
    assert.match(panel.getAttribute('style'), /^left: 744px;/);
    handle.destroy();
  });

  it('reads a string `bounds` as the anchor’s nearest matching ancestor', () => {
    const { host, root, trigger, panel } = scene();
    const scroller = measuring(document.createElement('div'), box(50, 0, 450, 800));
    scroller.className = 'manager-main';
    host.append(scroller);
    scroller.append(root);

    const seen = [];
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        bounds: MANAGER_MAIN_SELECTOR,
        layout: (triggerRect, panelRect, hostRect, bounds) => {
          seen.push(bounds);
          return null;
        },
      })
    );

    assert.deepEqual(
      seen,
      [{ minLeft: 66, maxRight: 484 }],
      'the boundary is inset 16px on each side and expressed in host coordinates'
    );
    handle.destroy();
  });

  it('contributes nothing when a string `bounds` matches no ancestor', () => {
    const { trigger, panel } = scene();

    const seen = [];
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        bounds: '.no-such-scroller',
        layout: (triggerRect, panelRect, hostRect, bounds) => {
          seen.push(bounds);
          return null;
        },
      })
    );

    assert.deepEqual(seen, [{}], 'a miss must not invent a boundary');
    handle.destroy();
  });

  it('calls a resolver `bounds` with the host box and the anchor', () => {
    const { host, trigger, panel } = scene();

    const calls = [];
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        bounds: (hostRect, anchor) => {
          calls.push({ width: hostRect.width, anchor });
          return { minLeft: 30, maxRight: 300 };
        },
        layout: (triggerRect, panelRect, hostRect, bounds) => {
          assert.deepEqual(bounds, { minLeft: 30, maxRight: 300 });
          return null;
        },
      })
    );

    assert.deepEqual(calls, [{ width: 1000, anchor: trigger }]);
    assert.equal(host.contains(panel), true);
    handle.destroy();
  });

  it('falls back to the host’s inset edges when the shipped picker walk finds no scroller', () => {
    const { trigger, panel } = scene();

    const seen = [];
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        bounds: pickerScrollerBounds,
        layout: (triggerRect, panelRect, hostRect, bounds) => {
          seen.push(bounds);
          return null;
        },
      })
    );

    assert.deepEqual(seen, [{ minLeft: 16, maxRight: 984 }]);
    handle.destroy();
  });

  it('floors the list target to whole rows', () => {
    const { trigger, panel } = scene();
    const list = document.createElement('div');
    panel.append(list);

    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        targets: () => ({ list }),
        layoutOptions: () => ({ rowPitch: 40, rowGap: 4, chromeHeight: 60 }),
      })
    );

    // 380 of max height less 60 of chrome leaves 320: eight 40px pitches, less the trailing gap.
    assert.equal(list.getAttribute('style'), 'max-height: 316px;');
    handle.destroy();
  });

  it('leaves the list unstyled when the layout cannot derive a row height', () => {
    const { trigger, panel } = scene();
    const list = document.createElement('div');
    panel.append(list);

    const handle = anchoredPopover(panel, options({ trigger, targets: () => ({ list }) }));

    assert.equal(list.getAttribute('style'), '');
    handle.destroy();
  });

  it('re-evaluates `layoutOptions` on every measure', () => {
    const { trigger, panel } = scene();
    let width = 240;
    const handle = anchoredPopover(
      panel,
      options({ trigger, layoutOptions: () => ({ minWidth: width, maxWidth: width }) })
    );

    assert.match(panel.getAttribute('style'), /width: 240px;/);
    width = 300;
    window.dispatchEvent(new Event('resize'));
    assert.match(panel.getAttribute('style'), /width: 300px;/);
    handle.destroy();
  });

  it('places an action menu with the second shipped layout, by its right edge', () => {
    const { trigger, panel } = scene({ trigger: box(100, 100, 200, 30) });

    const handle = anchoredPopover(panel, options({ trigger, layout: menuLayout }));

    assert.equal(panel.getAttribute('style'), 'left: auto; right: 700px; top: 134px; bottom: auto;');
    handle.destroy();
  });

  it('flips an action menu to `bottom` when it will not fit below', () => {
    const { trigger, panel } = scene({ trigger: box(100, 600, 200, 30), panel: box(0, 0, 200, 300) });

    const handle = anchoredPopover(panel, options({ trigger, layout: menuLayout }));

    assert.equal(panel.getAttribute('style'), 'left: auto; right: 700px; top: auto; bottom: 204px;');
    handle.destroy();
  });

  it('omits the width for a panel that sizes to its content', () => {
    const { trigger, panel } = scene();

    const handle = anchoredPopover(panel, options({ trigger, applyWidth: false }));

    assert.equal(
      panel.getAttribute('style'),
      'left: 100px; right: auto; max-height: 380px; top: 136px; bottom: auto;'
    );
    handle.destroy();
  });

  it('applies a caller’s own max-height cap', () => {
    const { trigger, panel } = scene();

    const handle = anchoredPopover(panel, options({ trigger, maxHeightCap: 200 }));

    assert.match(panel.getAttribute('style'), /max-height: 200px;/);
    handle.destroy();
  });

  it('clears both style targets when the layout declines to place the panel', () => {
    const { trigger, panel } = scene();
    const list = document.createElement('div');
    panel.append(list);
    panel.setAttribute('style', 'left: 1px;');
    list.setAttribute('style', 'max-height: 1px;');

    const handle = anchoredPopover(
      panel,
      options({ trigger, targets: () => ({ list }), layout: () => null })
    );

    assert.equal(panel.getAttribute('style'), '');
    assert.equal(list.getAttribute('style'), '');
    handle.destroy();
  });

  it('re-measures on scroll and resize while open', () => {
    const { trigger, panel } = scene();
    let measures = 0;
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        layout: (...args) => {
          measures += 1;
          return pickerLayout(...args);
        },
      })
    );

    assert.equal(measures, 1);
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    assert.equal(measures, 3);
    handle.destroy();
    document.dispatchEvent(new Event('scroll'));
    assert.equal(measures, 3, 'a destroyed action stops listening');
  });

  it('drops a scroll that started inside the panel when asked to', () => {
    const { trigger, panel } = scene();
    const inner = document.createElement('div');
    panel.append(inner);
    let measures = 0;
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        ignoreScrollWithin: true,
        layout: (...args) => {
          measures += 1;
          return pickerLayout(...args);
        },
      })
    );

    assert.equal(measures, 1);
    inner.dispatchEvent(new Event('scroll', { bubbles: true }));
    assert.equal(measures, 1, 'scrolling inside the panel moves neither the panel nor its trigger');
    document.body.dispatchEvent(new Event('scroll', { bubbles: true }));
    assert.equal(measures, 2, 'scrolling an ancestor still repositions');
    handle.destroy();
  });

  it('repositions on a window resize even while scrolls inside the panel are ignored', () => {
    // THE ONE DECLARED BEHAVIOUR CHANGE (issue 1500 r2). `resize` fires on `window`, and
    // `Node.contains()` takes a `Node?` — so the shipped `node.contains(event.target)` THREW on
    // every window resize in the one caller that sets `ignoreScrollWithin` (`IconPicker`), and
    // the reposition it was supposed to trigger never ran. A resize moves the host, so this is
    // exactly the event that must not be dropped.
    const { trigger, panel } = scene();
    // happy-dom's `contains` accepts ANY value and answers false, so this defect is invisible in
    // it — which is why it survived six copies and a conversion. `Node.contains()` is specified
    // to take a `Node?`, and a browser throws a TypeError on anything else, so the panel is given
    // the browser's contract here. Without this the case would pass over the bug it exists for.
    const containsNode = panel.contains.bind(panel);
    panel.contains = (other) => {
      if (!(other instanceof Node)) {
        throw new TypeError("Failed to execute 'contains' on 'Node': parameter 1 is not of type 'Node'.");
      }
      return containsNode(other);
    };

    let measures = 0;
    const handle = anchoredPopover(
      panel,
      options({
        trigger,
        ignoreScrollWithin: true,
        layout: (...args) => {
          measures += 1;
          return pickerLayout(...args);
        },
      })
    );

    assert.equal(measures, 1);
    window.dispatchEvent(new Event('resize'));
    assert.equal(
      measures,
      2,
      'a window resize re-measures: the window is not a Node, so it did not start inside the panel'
    );
    handle.destroy();
  });

  it('re-reads a function trigger, so an unmounting trigger can fall back', () => {
    const { root, trigger, panel } = scene();
    measuring(root, box(60, 100, 300, 30));
    let mounted = true;

    const handle = anchoredPopover(
      panel,
      options({ trigger: () => (mounted ? trigger : root) })
    );

    assert.match(panel.getAttribute('style'), /^left: 100px;/);
    mounted = false;
    handle.update(options({ trigger: () => (mounted ? trigger : root) }));
    assert.match(panel.getAttribute('style'), /^left: 60px;/);
    handle.destroy();
  });

  it('does nothing while closed, and removes the panel on destroy', () => {
    const { trigger, panel } = scene();

    const handle = anchoredPopover(panel, options({ trigger, open: false }));
    assert.equal(panel.getAttribute('style'), '');

    handle.update(options({ trigger, open: true }));
    assert.match(panel.getAttribute('style'), /^left: 100px;/);

    handle.destroy();
    assert.equal(panel.isConnected, false, 'the portaled panel is removed with its action');
  });

  it('refuses a call with no component name or no layout', () => {
    const { trigger, panel } = scene();

    assert.throws(
      () => anchoredPopover(panel, { trigger, layout: pickerLayout }),
      /requires a `component` name/
    );
    assert.throws(
      () => anchoredPopover(panel, { trigger, component: 'TestPopover' }),
      /requires a `layout` function/
    );
  });
});
