/**
 * The published `ActionMenu` on Fabricate's real Svelte runtime (issue 2652), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window root it needs: the trigger,
 * menu and items named by the companion's strings, an item's `data` dropped, the menu opening with
 * focus on an item, the keys among the items, Escape and Tab closing it, the held Enter it cancels,
 * a choice reaching `onSelect` with the item's `id`, the keys and presses that stop at the trigger
 * and the menu, the menu hosted by the `overlayHost` option, the nearest `.fabricate-app` and the
 * standalone layer, `destroy` and `update` while open, a second window, every refusal the entry
 * adds, and both View Lab specimens.
 * Limit: happy-dom activates no button on a key, so a choice by key is its click.
 * Limit: happy-dom's synchronous `dispatchEvent` runs no microtask checkpoint between listeners, so
 * no clause here claims where Escape in the menu stops.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { fixtureLiteral } from '../helpers/labFixtureLiterals.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REPOSITORY = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const NAME = 'Reagent actions for Flask';
/** Three commands, the second disabled and the third a danger. */
const ACTIONS = Object.freeze([
  Object.freeze({ id: 'duplicate', label: 'Duplicate reagent', icon: 'fas fa-copy' }),
  Object.freeze({
    id: 'archive',
    label: 'Archive reagent',
    icon: 'fas fa-box-archive',
    disabled: true,
  }),
  Object.freeze({ id: 'delete', label: 'Delete reagent', icon: 'fas fa-trash', danger: true }),
]);
const UNPUBLISHED = Object.freeze([
  'disabled',
  'triggerClass',
  'triggerIcon',
  'triggerTitle',
  'triggerProps',
  'menuClass',
  'panelLabel',
  'heading',
  'trigger',
  'open',
  'class',
  'data-x',
]);

const harness = createMountedComponentHarness({
  repoRoot: REPOSITORY,
  tmpPrefix: 'fabricate-published-action-menu-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let shells;
let handles;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  shells = [];
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its menu');
  assert.ok(!document.querySelector('[role="menu"]'), 'no menu outlives its mount');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/**
 * A menu of `ACTIONS` named `NAME`, recording `onSelect`, mounted with `props` into `target`: its
 * handle, an `update` that passes those props again beside `next`, the recorded calls, and its
 * trigger, which is the one focusable element in `target`.
 */
function mountMenu(
  props = {},
  { target = fabricateTarget(shells, 'fabricate fabricate-app'), overlayHost } = {}
) {
  const select = recorder();
  const base = { items: ACTIONS, ariaLabel: NAME, onSelect: select.record, ...props };
  const handle = ui().mount('ActionMenu', { target, props: base, overlayHost });
  handles.push(handle);
  flushSync();
  return {
    target,
    handle,
    update: (next = {}) => handle.update({ ...base, ...next }),
    calls: select.calls,
    trigger: () => target.querySelector('button'),
  };
}

const doc = (node) => node.ownerDocument;
const menuIn = (owner = document) => owner.querySelector('[role="menu"]');
const itemsIn = (owner = document) => [...owner.querySelectorAll('[role="menuitem"]')];
const itemIn = (id, owner = document) =>
  itemsIn(owner).find((item) => item.textContent.trim() === labelOf(id));
const labelOf = (id) => ACTIONS.find((action) => action.id === id).label;
const focused = (node) => doc(node).activeElement;

/** A cancelable keydown of `key` on `element`, once it has bubbled. */
function press(element, key, init = {}) {
  const { KeyboardEvent } = doc(element).defaultView;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

/** Opens the menu from its trigger, as a press does, and answers the menu once focus has moved. */
async function open(trigger) {
  trigger.click();
  flushSync();
  await settle();
  return menuIn(doc(trigger));
}

/** Presses `key` on `element` and settles past the focus Fabricate moves after a tick. */
async function pressAndSettle(element, key, init = {}) {
  const event = press(element, key, init);
  await settle();
  return event;
}

/** A positioned element of the companion's own, attached inside the Fabricate window `shell`. */
function companionHost(shell) {
  const host = shell.ownerDocument.createElement('section');
  host.style.position = 'relative';
  shell.append(host);
  return host;
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(shells), overlayHost = undefined) {
  assert.throws(() => ui().mount('ActionMenu', { target, props, overlayHost }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

const required = () => ({ items: ACTIONS, ariaLabel: NAME, onSelect: () => {} });

/** Every `type` event `nodes` hear while bubbling, each as `<node>:<detail>`. */
function hearing(type, nodes) {
  const heard = [];
  const stops = nodes.map(([name, node]) => {
    const listen = (event) => {
      heard.push(`${name}:${event.key ?? event.target?.tagName}`);
    };
    node.addEventListener(type, listen);
    return () => node.removeEventListener(type, listen);
  });
  return {
    heard,
    stop: () => {
      for (const stop of stops) stop();
    },
  };
}

describe('the published ActionMenu mounts, updates on its root and destroys', () => {
  it('draws one menu root whose one focusable element is its trigger', async () => {
    const { target, handle, update, trigger } = mountMenu();
    await settle();
    assert.equal(target.children.length, 1, 'one root in target');
    const root = target.firstElementChild;
    assert.ok(root.classList.contains('fabricate-action-menu'), "the menu's own root class");
    assert.equal(target.querySelectorAll('button, a, input, select, [tabindex]').length, 1);
    assert.ok(target.querySelector('button') === trigger(), 'the return-focus selector');
    assert.equal(update({ ariaLabel: 'Reagent actions for Salt' }), true);
    await settle();
    assert.ok(target.firstElementChild === root, 'the same root, so nothing remounted');
    assert.equal(trigger().getAttribute('aria-label'), 'Reagent actions for Salt');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(reports, []);
  });
});

describe('the published ActionMenu names', () => {
  it('its trigger and menu by ariaLabel, and each item by its label with no selection state', async () => {
    const { trigger } = mountMenu();
    assert.equal(trigger().getAttribute('aria-label'), NAME);
    assert.equal(trigger().getAttribute('data-tooltip-text'), NAME, 'its tooltip');
    assert.equal(trigger().getAttribute('aria-haspopup'), 'menu');
    assert.equal(trigger().getAttribute('aria-expanded'), 'false');
    const menu = await open(trigger());
    assert.equal(trigger().getAttribute('aria-expanded'), 'true');
    assert.equal(menu.getAttribute('aria-label'), NAME);
    assert.deepEqual(
      itemsIn().map((item) => item.textContent.trim()),
      ACTIONS.map(({ label }) => label)
    );
    assert.deepEqual(
      itemsIn().filter((item) => item.hasAttribute('aria-selected')),
      [],
      'no item carries a selection state'
    );
  });

  it('drops an item’s data on mount and on update, and leaves the caller’s item unchanged', async () => {
    const data = { 'data-action': 'close', 'data-x': '1' };
    const carrying = [{ ...ACTIONS[0], data }, ACTIONS[2]];
    const { update, trigger } = mountMenu({ items: carrying });
    await open(trigger());
    const drawn = () =>
      itemsIn().filter((item) => item.hasAttribute('data-action') || item.hasAttribute('data-x'));
    assert.equal(drawn().length, 0, 'neither attribute is drawn on mount');
    assert.equal(update({ items: [...carrying] }), true);
    flushSync();
    await settle();
    assert.equal(itemsIn().length, 2, 'the menu is redrawn');
    assert.equal(drawn().length, 0, 'nor on update');
    assert.deepEqual(carrying[0].data, { 'data-action': 'close', 'data-x': '1' });
  });

  it('calls no game.i18n while it mounts, opens and closes', async () => {
    const { game } = globalThis;
    const saved = game.i18n;
    const asked = [];
    const record = (key) => {
      asked.push(key);
      return key;
    };
    game.i18n = { localize: record, format: record, has: () => true };
    try {
      const { trigger } = mountMenu();
      await open(trigger());
      await pressAndSettle(focused(trigger()), 'Escape');
    } finally {
      game.i18n = saved;
    }
    assert.deepEqual(asked, []);
  });
});

describe('the published ActionMenu opens its menu', () => {
  it('in the chain’s host on a press of the trigger, with focus on its first enabled item', async () => {
    const { target, trigger } = mountMenu();
    const menu = await open(trigger());
    assert.ok(Boolean(menu), 'the menu opens');
    assert.ok(!target.contains(menu), 'outside target');
    assert.ok(target.parentElement.contains(menu), 'in the app root that hosts it');
    assert.ok(focused(trigger()) === itemIn('duplicate'), 'focus rests on duplicate');
  });

  it('on ArrowDown onto the first enabled item, and on ArrowUp onto the last', async () => {
    const { trigger } = mountMenu();
    const down = await pressAndSettle(trigger(), 'ArrowDown');
    assert.equal(down.defaultPrevented, true);
    assert.ok(focused(trigger()) === itemIn('duplicate'));
    await pressAndSettle(focused(trigger()), 'Escape');
    assert.ok(!menuIn(), 'Escape closed it');
    await pressAndSettle(trigger(), 'ArrowUp');
    assert.ok(focused(trigger()) === itemIn('delete'));
  });

  for (const [shape, items] of [
    ['no items', []],
    ['every item disabled', ACTIONS.map((action) => ({ ...action, disabled: true }))],
  ]) {
    it(`with ${shape}, with focus on the menu itself`, async () => {
      const { trigger } = mountMenu({ items });
      const menu = await open(trigger());
      assert.ok(Boolean(menu), 'the menu opens');
      assert.ok(focused(trigger()) === menu, 'focus rests on the role="menu" element');
      await pressAndSettle(menu, 'Escape');
      assert.ok(!menuIn(), 'and Escape closes it');
    });
  }

  it('closes on a second press made as a pointer makes it, choosing nothing and leaving focus on the trigger', async () => {
    const { calls, trigger } = mountMenu();
    await open(trigger());
    trigger().focus();
    trigger().click();
    flushSync();
    await settle();
    assert.ok(!menuIn(), 'the second press closes the menu');
    assert.equal(trigger().getAttribute('aria-expanded'), 'false');
    assert.ok(focused(trigger()) === trigger(), 'focus is still on the trigger');
    assert.deepEqual(calls, []);
  });

  it('with align start', async () => {
    const { trigger } = mountMenu({ align: 'start' });
    const menu = await open(trigger());
    assert.ok(Boolean(menu), 'the menu opens');
    assert.ok(focused(trigger()) === itemIn('duplicate'));
  });
});

describe('the keyboard in the published ActionMenu', () => {
  it('moves among the enabled items on the arrows, wrapping, and to the ends on Home and End', async () => {
    const { trigger } = mountMenu();
    await open(trigger());
    const at = () => focused(trigger());
    const steps = [];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'End', 'Home']) {
      assert.equal(press(at(), key).defaultPrevented, true, key);
      steps.push(at().textContent.trim());
    }
    assert.deepEqual(steps, [
      'Delete reagent',
      'Duplicate reagent',
      'Delete reagent',
      'Duplicate reagent',
      'Delete reagent',
      'Duplicate reagent',
    ]);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { calls, trigger } = mountMenu();
    await open(trigger());
    await pressAndSettle(focused(trigger()), 'Escape');
    assert.ok(!menuIn(), 'Escape closes the menu');
    assert.ok(focused(trigger()) === trigger(), 'focus returns to the trigger');
    assert.deepEqual(calls, []);
  });

  for (const shiftKey of [false, true]) {
    it(`closes on ${shiftKey ? 'Shift+Tab' : 'Tab'}, cancelling the key, with focus on the trigger`, async () => {
      const { calls, trigger } = mountMenu();
      await open(trigger());
      const tab = await pressAndSettle(focused(trigger()), 'Tab', { shiftKey });
      assert.equal(tab.defaultPrevented, true);
      assert.ok(!menuIn(), 'Tab closes the menu');
      assert.ok(focused(trigger()) === trigger(), 'focus returns to the trigger');
      assert.deepEqual(calls, []);
    });
  }

  it('cancels a repeating Enter on the item opening focused, and leaves a fresh Enter alone', async () => {
    const { calls, trigger } = mountMenu();
    await open(trigger());
    const item = itemIn('duplicate');
    assert.ok(focused(trigger()) === item);
    const repeat = press(item, 'Enter', { repeat: true });
    assert.equal(repeat.defaultPrevented, true, 'the held Enter’s repeat is cancelled');
    const fresh = press(item, 'Enter');
    assert.equal(fresh.defaultPrevented, false, 'a fresh Enter is not');
    assert.ok(Boolean(menuIn()), 'the menu is still open');
    assert.deepEqual(calls, []);
  });
});

describe('a choice in the published ActionMenu', () => {
  it('calls onSelect once with the item’s id, closes, and returns focus to the trigger', async () => {
    const { calls, trigger } = mountMenu();
    await open(trigger());
    itemIn('delete').click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [['delete']]);
    assert.ok(!menuIn(), 'a choice closes the menu');
    assert.ok(focused(trigger()) === trigger(), 'focus returns to the trigger');
    await open(trigger());
    itemIn('delete').click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [['delete'], ['delete']], 'the same item again calls it again');
  });

  it('calls nothing on a press of a disabled item, which leaves the menu open', async () => {
    const { calls, trigger } = mountMenu();
    await open(trigger());
    itemIn('archive').click();
    flushSync();
    await settle();
    assert.deepEqual(calls, []);
    assert.ok(Boolean(menuIn()), 'the menu stays open');
  });

  it('calls nothing on mount, update, open, close, the arrows, Escape, Tab or an outside press', async () => {
    const { update, calls, trigger } = mountMenu();
    assert.equal(update({ ariaLabel: 'Reagent actions for Salt' }), true);
    await open(trigger());
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) press(focused(trigger()), key);
    await pressAndSettle(focused(trigger()), 'Escape');
    await open(trigger());
    await pressAndSettle(focused(trigger()), 'Tab');
    await open(trigger());
    trigger().click();
    flushSync();
    await open(trigger());
    document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await settle();
    assert.ok(!menuIn(), 'an outside press closes');
    assert.deepEqual(calls, []);
  });

  it('reports an onSelect that throws, still closes, and stays live', async () => {
    const failure = new Error('the companion refused the command');
    const { update, trigger } = mountMenu({
      onSelect() {
        throw failure;
      },
    });
    await open(trigger());
    itemIn('duplicate').click();
    flushSync();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'ActionMenu', 'onSelect', failure]]);
    assert.ok(!menuIn(), 'the menu closes');
    assert.equal(update(), true);
  });

  it('returns focus to the trigger past focus moved inside onSelect, and keeps focus moved from a later task', async () => {
    for (const later of [false, true]) {
      const elsewhere = document.createElement('button');
      const target = fabricateTarget(shells, 'fabricate fabricate-app');
      target.parentElement.append(elsewhere);
      let moved = Promise.resolve();
      const { trigger } = mountMenu(
        {
          onSelect() {
            if (later) moved = new Promise((done) => setTimeout(() => done(elsewhere.focus()), 0));
            else elsewhere.focus();
          },
        },
        { target }
      );
      await open(trigger());
      itemIn('duplicate').click();
      flushSync();
      await settle();
      await moved;
      const expected = later ? elsewhere : trigger();
      assert.ok(focused(trigger()) === expected, later ? 'kept' : 'back on the trigger');
    }
  });
});

describe('the keys the published ActionMenu keeps', () => {
  it('stops ArrowDown and ArrowUp on its trigger and its own click, and lets a and a closed-menu Escape bubble', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { trigger } = mountMenu({}, { target });
    const heardOnTrigger = async (key) => {
      const keys = hearing('keydown', [['above', target.parentElement]]);
      try {
        trigger().focus();
        await pressAndSettle(trigger(), key);
      } finally {
        keys.stop();
      }
      if (menuIn()) await pressAndSettle(focused(trigger()), 'Escape');
      return keys.heard;
    };
    for (const key of ['ArrowDown', 'ArrowUp']) {
      assert.deepEqual(await heardOnTrigger(key), [], `${key} stops at the trigger`);
    }
    for (const key of ['a', 'Escape']) {
      assert.deepEqual(await heardOnTrigger(key), [`above:${key}`], `${key} bubbles`);
    }
    const clicks = hearing('click', [['above', target.parentElement]]);
    try {
      trigger().click();
      flushSync();
      await settle();
      trigger().click();
      flushSync();
      await settle();
    } finally {
      clicks.stop();
    }
    assert.deepEqual(clicks.heard, [], 'no press of the trigger reached the companion');
  });

  it('stops every click in the menu, and lets ArrowDown in it reach the overlayHost', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { calls, trigger } = mountMenu({}, { target, overlayHost });
    await open(trigger());
    const clicks = hearing('click', [
      ['host', overlayHost],
      ['shell', target.parentElement],
      ['body', document.body],
    ]);
    const keys = hearing('keydown', [['host', overlayHost]]);
    try {
      press(focused(trigger()), 'ArrowDown');
      menuIn().click();
      itemIn('archive').click();
      flushSync();
      itemIn('delete').click();
      flushSync();
      await settle();
    } finally {
      clicks.stop();
      keys.stop();
    }
    assert.deepEqual(calls, [['delete']], 'the item was chosen');
    assert.deepEqual(clicks.heard, [], 'no click left the menu');
    assert.deepEqual(keys.heard, ['host:ArrowDown'], 'ArrowDown reached the host');
  });
});

describe('the published ActionMenu hosts its menu', () => {
  /** The `display: contents` element the seam portaled the panel into. */
  function containerOf(menu) {
    const container = menu.parentElement;
    assert.equal(container.style.display, 'contents', 'the container is display: contents');
    return container;
  }

  it('in the overlayHost option, and a choice there reaches onSelect', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { calls, trigger, handle } = mountMenu({}, { target, overlayHost });
    const menu = await open(trigger());
    assert.ok(containerOf(menu).parentElement === overlayHost, 'the option hosts the container');
    itemIn('duplicate').click();
    flushSync();
    assert.deepEqual(calls, [['duplicate']]);
    handle.destroy();
    assert.equal(overlayHost.children.length, 0, 'destroy leaves no container');
  });

  it('in the nearest .fabricate-app above target when no overlayHost is passed', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { trigger } = mountMenu({}, { target });
    const menu = await open(trigger());
    assert.ok(containerOf(menu).parentElement === target.parentElement, 'the app root hosts');
    assert.ok(!document.querySelector(LAYER), 'no standalone layer is made');
  });

  it('in the standalone layer under a Fabricate frame with no app root, which goes when it closes', async () => {
    const { calls, trigger } = mountMenu({}, { target: fabricateTarget(shells, 'fabricate') });
    const menu = await open(trigger());
    const layer = document.querySelector(LAYER);
    assert.ok(layer?.parentElement === document.body, 'a layer on the target’s body');
    assert.ok(containerOf(menu).parentElement === layer);
    itemIn('delete').click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [['delete']]);
    assert.ok(!document.querySelector(LAYER), 'the layer goes with its last menu');
  });

  it('leaves no panel, container or layer when destroyed while open', async () => {
    const { handle, trigger } = mountMenu({}, { target: fabricateTarget(shells, 'fabricate') });
    const menu = await open(trigger());
    const container = containerOf(menu);
    handle.destroy();
    await settle();
    assert.ok(!menu.isConnected && !container.isConnected, 'no panel and no container');
    assert.ok(!document.querySelector(LAYER), 'no layer');
    assert.deepEqual(reports, []);
  });

  it('relabels the items in place on an update while open, focus staying on the same item', async () => {
    const { update, trigger } = mountMenu();
    const menu = await open(trigger());
    const item = itemIn('duplicate');
    const relabelled = ACTIONS.map((action) => ({ ...action, label: `${action.label} now` }));
    assert.equal(update({ items: relabelled }), true);
    flushSync();
    await settle();
    assert.ok(menuIn() === menu, 'the menu is the same node');
    assert.ok(itemsIn()[0] === item, 'the item is the same node');
    assert.equal(item.textContent.trim(), 'Duplicate reagent now');
    assert.ok(focused(trigger()) === item, 'focus stays on it');
  });
});

describe('the published ActionMenu in a second window', () => {
  let second;

  beforeEach(() => {
    second = new Window({ url: 'http://localhost/detached' });
  });

  afterEach(async () => {
    await second.happyDOM.close();
  });

  /** A target under a Fabricate window frame in the second window's own document. */
  function detachedTarget() {
    const owner = second.document;
    const shell = owner.createElement('section');
    shell.className = 'fabricate';
    const target = owner.createElement('div');
    shell.append(target);
    owner.body.append(shell);
    return target;
  }

  it('opens in that document’s layer, with its focus and arrow keys there', async () => {
    const { trigger } = mountMenu({}, { target: detachedTarget() });
    const menu = await open(trigger());
    const layer = second.document.querySelector(LAYER);
    assert.ok(layer?.parentElement === second.document.body, "the second document's body");
    assert.ok(layer.contains(menu), 'the menu is in it');
    assert.ok(!document.querySelector(LAYER), 'nothing is drawn in this window');
    assert.ok(second.document.activeElement === itemIn('duplicate', second.document));
    press(second.document.activeElement, 'ArrowDown');
    assert.ok(second.document.activeElement === itemIn('delete', second.document));
    await pressAndSettle(second.document.activeElement, 'Escape');
    assert.ok(!menuIn(second.document), 'Escape closes it');
    assert.ok(
      second.document.activeElement === trigger(),
      "focus returns to that document's trigger"
    );
  });

  it('closes on an outside press in that document', async () => {
    const { calls, trigger } = mountMenu({}, { target: detachedTarget() });
    await open(trigger());
    second.document.body.dispatchEvent(new second.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await settle();
    assert.ok(!menuIn(second.document), 'an outside press there closes it');
    assert.deepEqual(calls, []);
  });
});

describe('the published ActionMenu refuses', () => {
  it('a missing or empty required key (M9), and an onSelect that is no function (M17)', () => {
    for (const key of ['items', 'ariaLabel', 'onSelect']) {
      const props = required();
      delete props[key];
      assertRefused(props, `ActionMenu requires a non-empty "${key}"`);
    }
    assertRefused({ ...required(), ariaLabel: '' }, 'ActionMenu requires a non-empty "ariaLabel"');
    for (const onSelect of ['', 'x']) {
      assertRefused({ ...required(), onSelect }, '"onSelect" must be a function');
    }
  });

  it('every unpublished prop, class and a data-* key (M8)', () => {
    for (const key of UNPUBLISHED) {
      assertRefused({ ...required(), [key]: 'x' }, `"${key}" is not a prop of ActionMenu`);
    }
  });

  it('a target outside a Fabricate window (M16), and an overlayHost of another document (M18)', async () => {
    assertRefused(
      required(),
      'ActionMenu needs a Fabricate window ancestor',
      companionTarget(shells)
    );
    const other = new Window({ url: 'http://localhost/other' });
    try {
      assertRefused(
        required(),
        "overlayHost must be an element in the target's document",
        fabricateTarget(shells),
        other.document.createElement('section')
      );
    } finally {
      await other.happyDOM.close();
    }
  });
});

describe('the action menu View Lab specimen cases against the DOM the fixture draws', () => {
  const FIXTURE = 'tests/view-lab/fixtures/PublishedActionMenu.svelte';
  const count = (selector) => document.querySelectorAll(selector).length;

  /** The fixture's ground, which is the overlay host, and its menu mounted into the target. */
  function drawFixture() {
    const fixed = fixtureLiteral(FIXTURE, 'MENU');
    const ground = document.createElement('div');
    ground.setAttribute('data-lab-action-menu', '');
    const row = document.createElement('div');
    const slot = document.createElement('div');
    slot.setAttribute('data-lab-action-menu-target', '');
    row.append(slot);
    ground.append(row);
    fabricateTarget(shells, 'fabricate fabricate-app').append(ground);
    const props = {
      ...fixed,
      onSelect: (id) => ground.setAttribute('data-lab-action-chosen', id),
    };
    handles.push(ui().mount('ActionMenu', { target: slot, props, overlayHost: ground }));
    flushSync();
    return { slot };
  }

  /** Runs each of the case's steps on the one element it names; a key is pressed, Enter clicks. */
  async function runSteps(viewCase) {
    for (const [at, step] of viewCase.steps.entries()) {
      assert.equal(count(step.selector), 1, `step ${at} names one element`);
      const node = document.querySelector(step.selector);
      node.focus();
      const event = press(node, step.press);
      if (step.press === 'Enter' && !event.defaultPrevented) node.click();
      flushSync();
      await settle();
    }
  }

  const assertNamesOne = (viewCase) => {
    for (const selector of [
      viewCase.expectCenterHit,
      ...viewCase.expectLayout.controls.map((control) => control.selector),
    ]) {
      assert.equal(count(selector), 1, `${selector} names one element`);
    }
  };

  for (const { id, reached } of [
    { id: 'manager-published-action-menu-specimen', reached: () => itemIn('duplicate') },
    { id: 'manager-published-action-menu-choice', reached: (slot) => slot.querySelector('button') },
  ]) {
    const viewCase = getCaseById(id);

    it(`${id} waits on exactly one element once its steps have run`, async () => {
      const { slot } = drawFixture();
      await settle();
      assert.equal(count(viewCase.expectSelector), 0, 'not before the steps');
      await runSteps(viewCase);
      assert.equal(count(viewCase.expectSelector), 1, 'one element after them');
      assert.ok(document.querySelector(viewCase.expectSelector) === reached(slot));
      assertNamesOne(viewCase);
    });
  }
});
