/**
 * The overlay plumbing inside a second happy-dom `Window`, the stand-in for a Foundry 14 detached
 * window (issue 2454): each action binds its listeners to the node's own document and window and
 * reads that window's viewport and style, and tells a node by `nodeType`. Each clause is red
 * against an action that reads the global `document`, `window` or `instanceof`.
 * Limit: happy-dom 20 shares its classes between Windows, so its second Window's nodes pass this
 * realm's `instanceof`; a node of another realm is stood in by an object no class of this realm
 * recognises, which carries `nodeType` as a detached window's node does.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { portal } = await import('../../src/ui/svelte/actions/portal.js');
const { anchoredPopover, hostRelativePopoverLayout } =
  await import('../../src/ui/svelte/actions/anchoredPopover.js');
const { typeaheadPanel } = await import('../../src/ui/svelte/actions/typeaheadPanel.js');
const { dismissOnOutsideClick } =
  await import('../../src/ui/svelte/actions/dismissOnOutsideClick.js');
const { ancestorScrollerBounds } = await import('../../src/ui/svelte/util/overlayBounds.js');
const { resetOverlayHostDiagnostics, resolveOverlayHost } =
  await import('../../src/ui/svelte/util/overlayHost.js');

const box = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

function measuring(element, rect) {
  element.getBoundingClientRect = () => rect;
  return element;
}

let second;
let doc;

before(() => setupDOM());
after(() => teardownDOM());

beforeEach(() => {
  second = new Window({ url: 'http://localhost/detached' });
  doc = second.document;
});

afterEach(async () => {
  document.body.innerHTML = '';
  resetOverlayHostDiagnostics();
  await second.happyDOM.close();
});

/** A manager root holding a trigger and a panel, all made by the second window's document. */
function detachedScene() {
  const host = measuring(doc.createElement('div'), box(0, 0, 1000, 800));
  host.className = 'fabricate-manager';
  const root = doc.createElement('div');
  const trigger = measuring(doc.createElement('button'), box(100, 100, 200, 30));
  const panel = measuring(doc.createElement('div'), box(0, 0, 200, 150));
  root.append(trigger, panel);
  host.append(root);
  doc.body.append(host);
  return { host, root, trigger, panel };
}

/** A popover over `panel` whose layout counts its calls in `counter.measures`. */
function countedPopover(panel, trigger, counter, extra = {}) {
  return anchoredPopover(panel, {
    component: 'SecondWindowPopover',
    trigger,
    layout: () => {
      counter.measures += 1;
      return { left: 0, top: 0, placement: 'bottom' };
    },
    ...extra,
  });
}

/** A node of another realm: `nodeType` and what the action calls on it, and no class of this one. */
function foreignNode(nodeType, members = {}) {
  return Object.assign(Object.create(null), { nodeType }, members);
}

/** Dispatches `event` on `on`, read by every listener as if `target` were where it began. */
function dispatchAs(on, target, event) {
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  on.dispatchEvent(event);
}

describe('the stand-ins', () => {
  it('give the second window its own document and window, and a foreign node no class here', () => {
    assert.ok(doc.defaultView === second && second !== document.defaultView);
    const foreign = foreignNode(1);
    assert.ok(
      !(foreign instanceof globalThis.HTMLElement) && !(foreign instanceof globalThis.Node)
    );
  });
});

describe('a node of another realm', () => {
  it('is a portal target by nodeType', () => {
    const appended = [];
    const target = foreignNode(1, {
      appendChild: (node) => {
        appended.push(node);
      },
    });
    const node = doc.createElement('div');
    portal(node, () => target).destroy();
    assert.ok(appended.length === 1 && appended[0] === node, 'appended to the foreign element');
  });

  it('is an outside press that dismisses, and a typeahead outside press', () => {
    const node = doc.createElement('div');
    doc.body.append(node);
    const dismissed = [];
    const dismissal = dismissOnOutsideClick(node, {
      onDismiss: (event) => {
        dismissed.push(event);
      },
    });
    dispatchAs(doc.body, foreignNode(1), new second.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(dismissed.length, 1, 'a foreign target outside the node dismisses');
    dismissal.destroy();

    const { trigger, panel } = detachedScene();
    const presses = [];
    const panelHandle = typeaheadPanel(panel, {
      component: 'SecondWindowTypeahead',
      trigger,
      onOutsidePress: (event) => {
        presses.push(event);
      },
    });
    dispatchAs(doc.body, foreignNode(1), new second.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(presses.length, 1, 'a foreign target outside the field is reported');
    panelHandle.destroy();
  });

  it('is a scroll from inside the panel, which a popover that ignores those drops', () => {
    const { trigger, panel } = detachedScene();
    const inside = foreignNode(1);
    const contains = panel.contains.bind(panel);
    panel.contains = (other) => other === inside || contains(other);
    const counter = { measures: 0 };
    const handle = countedPopover(panel, trigger, counter, { ignoreScrollWithin: true });
    dispatchAs(doc.body, inside, new second.Event('scroll'));
    assert.equal(counter.measures, 1, 'a foreign node inside the panel moves nothing');
    dispatchAs(doc.body, foreignNode(1), new second.Event('scroll'));
    assert.equal(counter.measures, 2, 'one outside it re-measures');
    handle.destroy();
  });
});

describe('portal in a second window', () => {
  it('moves the node into an element of the other realm, by element and by resolver', () => {
    const target = doc.createElement('section');
    const node = doc.createElement('div');
    doc.body.append(target, doc.createElement('div'));
    doc.body.lastChild.append(node);

    const direct = portal(node, target);
    assert.ok(node.parentNode === target, 'an element of the other realm is a target');
    direct.destroy();

    const other = doc.createElement('div');
    doc.body.append(other, node);
    const resolved = portal(node, () => other);
    assert.ok(node.parentNode === other, 'a resolver answering one is too');
    resolved.destroy();
  });

  it('still refuses a non-element of the other realm', () => {
    const node = doc.createElement('div');
    const parent = doc.createElement('div');
    parent.append(node);
    doc.body.append(parent);
    const handle = portal(node, () => doc.createTextNode('text'));
    assert.ok(node.parentNode === parent, 'a text node is not a target');
    handle.destroy();
  });
});

describe('resolveOverlayHost in a second window', () => {
  it('falls back to the node’s own body, never this window’s', () => {
    const errors = [];
    const original = console.error;
    console.error = (...args) => {
      errors.push(args);
    };
    try {
      const node = doc.createElement('span');
      doc.body.append(node);
      const resolved = resolveOverlayHost(node, { component: 'SecondWindowHost' });
      assert.ok(resolved === doc.body, "the node's own document's body");
      assert.equal(errors.length, 1, 'the missing-host report still fires');
    } finally {
      console.error = original;
    }
  });
});

describe('anchoredPopover in a second window', () => {
  it('portals into the other realm’s root and measures on its window’s resize and its scroll', () => {
    const { host, trigger, panel } = detachedScene();
    const counter = { measures: 0 };
    const handle = countedPopover(panel, trigger, counter);
    assert.ok(panel.parentNode === host, 'portaled into the second window’s root');
    assert.equal(counter.measures, 1);

    second.dispatchEvent(new second.Event('resize'));
    assert.equal(counter.measures, 2, "a resize of the panel's own window re-measures");
    doc.body.dispatchEvent(new second.Event('scroll'));
    assert.equal(counter.measures, 3, "a scroll in the panel's own document re-measures");
    document.defaultView.dispatchEvent(new Event('resize'));
    document.body.dispatchEvent(new Event('scroll'));
    assert.equal(counter.measures, 3, "this window's events reach nothing");

    handle.destroy();
    second.dispatchEvent(new second.Event('resize'));
    doc.body.dispatchEvent(new second.Event('scroll'));
    assert.equal(counter.measures, 3, 'a destroyed popover leaves no listener');
  });

  it('drops a scroll from inside the panel, told apart by nodeType', () => {
    const { trigger, panel } = detachedScene();
    const inner = doc.createElement('div');
    panel.append(inner);
    const counter = { measures: 0 };
    const handle = countedPopover(panel, trigger, counter, { ignoreScrollWithin: true });
    inner.dispatchEvent(new second.Event('scroll'));
    assert.equal(counter.measures, 1, 'a scroll inside the panel moves nothing');
    second.dispatchEvent(new second.Event('resize'));
    assert.equal(counter.measures, 2, 'the window is no node, so its resize re-measures');
    handle.destroy();
  });

  it('sizes a host with no box by the panel’s own window', () => {
    Object.defineProperties(second, {
      innerWidth: { value: 640, configurable: true },
      innerHeight: { value: 480, configurable: true },
    });
    const seen = [];
    const layout = hostRelativePopoverLayout((trigger, viewport) => {
      seen.push(viewport);
      return null;
    });
    const { host, trigger, panel } = detachedScene();
    measuring(host, box(0, 0, 0, 0));
    const handle = anchoredPopover(panel, { component: 'SecondWindowPopover', trigger, layout });
    assert.deepEqual(seen, [{ width: 640, height: 480 }]);
    handle.destroy();
  });

  it('binds nothing and stays closed in a document without a window', () => {
    const windowless = document.implementation.createHTMLDocument('windowless');
    assert.equal(windowless.defaultView, null);
    const host = windowless.createElement('div');
    host.className = 'fabricate-manager';
    const trigger = windowless.createElement('button');
    const panel = windowless.createElement('div');
    panel.setAttribute('style', 'left: 1px;');
    host.append(trigger, panel);
    windowless.body.append(host);
    const counter = { measures: 0 };
    const handle = countedPopover(panel, trigger, counter);
    assert.equal(counter.measures, 0, 'never measured');
    assert.equal(panel.getAttribute('style'), '', 'cleared as a closed panel is');
    handle.destroy();
  });
});

describe('typeaheadPanel in a second window', () => {
  it('reports a press outside the field and the panel on the panel’s own document', () => {
    const { trigger, panel, host } = detachedScene();
    const outside = doc.createElement('button');
    host.append(outside);
    const presses = [];
    const handle = typeaheadPanel(panel, {
      component: 'SecondWindowTypeahead',
      trigger,
      onOutsidePress: (event) => {
        presses.push(event.target);
      },
    });
    panel.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(presses.length, 0, 'the panel and the field are inside');
    outside.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(presses.length === 1 && presses[0] === outside, 'a press outside is reported');
    handle.destroy();
    outside.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(presses.length, 1, 'a destroyed panel leaves no listener');
  });
});

describe('dismissOnOutsideClick in a second window', () => {
  it('dismisses on a press outside and on Escape in the node’s own document', () => {
    const node = doc.createElement('div');
    const inside = doc.createElement('button');
    const extra = doc.createElement('div');
    const outside = doc.createElement('button');
    node.append(inside);
    doc.body.append(node, extra, outside);
    const dismissed = [];
    const handle = dismissOnOutsideClick(node, {
      onDismiss: (event) => {
        dismissed.push(event.type);
      },
      additionalNodes: () => [extra],
    });
    inside.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    extra.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    assert.deepEqual(
      dismissed,
      [],
      'inside, an additional node, and this document dismiss nothing'
    );
    outside.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    doc.body.dispatchEvent(new second.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepEqual(dismissed, ['mousedown', 'keydown']);
    handle.destroy();
    outside.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(dismissed.length, 2, 'a destroyed action leaves no listener');
  });
});

describe('ancestorScrollerBounds in a second window', () => {
  it('reads a candidate’s display from its own window', () => {
    const { root, trigger } = detachedScene();
    root.className = 'manager-main';
    measuring(root, box(100, 0, 600, 800));
    const bounds = ancestorScrollerBounds('.manager-main');
    assert.deepEqual(bounds(box(0, 0, 1000, 800), trigger), { minLeft: 116, maxRight: 684 });
    root.style.display = 'contents';
    assert.deepEqual(
      bounds(box(0, 0, 1000, 800), trigger),
      { minLeft: 16, maxRight: 984 },
      'a display: contents scroller is skipped, read from the second window'
    );
  });
});
