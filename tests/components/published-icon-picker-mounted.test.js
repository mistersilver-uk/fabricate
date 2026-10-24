/**
 * The published `IconPicker` on Fabricate's real Svelte runtime (issue 2647), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window roots it needs: the trigger,
 * the list and its query field named by the companion's strings, the list opening with focus in
 * its query field, a choice by pointer and by key reaching `onChange` with the glyph's class
 * string, Escape and an outside press closing without one, the keys and presses that stop at the
 * picker, the list hosted by the `overlayHost` option, the nearest `.fabricate-app` and the
 * standalone layer, `destroy` and `update` while open, a second window, and every refusal the entry
 * adds. The query field and the panel's names are held here because the static gates pin them to
 * the picker's defaults and keys, and the choice because it crosses into the shared picker.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  assertClipped,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REPOSITORY = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const LABELS = Object.freeze({
  ariaLabel: 'Reagent icon',
  listLabel: 'Reagent icons',
  searchLabel: 'Search reagent icons',
  searchPlaceholder: 'Search icons',
  noMatchesText: 'No reagent icon matches.',
});
/** Fabricate's own English for the five strings, none of which a published picker draws. */
const FABRICATE_COPY = Object.freeze([
  'Choose icon',
  'Essence icon picker',
  'Search essence icons',
  'Search icons...',
  'No icons match that search.',
]);
const NO_MATCH_QUERY = 'zzzznotaglyph';

const harness = createMountedComponentHarness({
  repoRoot: REPOSITORY,
  tmpPrefix: 'fabricate-published-icon-picker-',
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
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its list');
  assert.ok(!document.querySelector('[role="dialog"]'), 'no list outlives its mount');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/**
 * A picker mounted with `props` over its labels and `value: 'fas fa-flask'`, recording `onChange`,
 * into `target`: its handle, an `update` that passes those props again beside `next`, the recorded
 * calls, and its trigger, which is the one focusable element in `target`.
 */
function mountPicker(
  props = {},
  { target = fabricateTarget(shells, 'fabricate fabricate-app'), overlayHost, onFault } = {}
) {
  const change = recorder();
  const base = { ...LABELS, value: 'fas fa-flask', onChange: change.record, ...props };
  const handle = ui().mount('IconPicker', { target, props: base, overlayHost, onFault });
  handles.push(handle);
  flushSync();
  return {
    target,
    handle,
    update: (next = {}) => handle.update({ ...base, ...next }),
    calls: change.calls,
    trigger: () => target.querySelector('button'),
  };
}

const doc = (node) => node.ownerDocument;
const panelIn = (owner = document) => owner.querySelector('[role="dialog"]');
const listboxIn = (owner = document) => owner.querySelector('[role="listbox"]');
const rowsIn = (owner = document) => [...owner.querySelectorAll('[role="option"]')];
const fieldIn = (owner = document) => panelIn(owner)?.querySelector('input');
const rowText = (row) => row.textContent.replaceAll(/\s+/g, ' ').trim();
const glyphOf = (node) => node.querySelector(':scope .essence-icon-picker-preview i').className;

/** Opens the list from its trigger, as a press does, and answers the panel once focus has moved. */
async function open(trigger) {
  trigger.click();
  flushSync();
  await settle();
  return panelIn(doc(trigger));
}

/** A cancelable keydown of `key` on `element`, once it has bubbled. */
function press(element, key) {
  const { KeyboardEvent } = doc(element).defaultView;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

/** Types `query` into the open list's query field. */
async function search(query, owner = document) {
  const field = fieldIn(owner);
  field.value = query;
  field.dispatchEvent(new owner.defaultView.Event('input', { bubbles: true }));
  flushSync();
  await settle();
}

/** A positioned element of the companion's own, attached inside the Fabricate window `shell`. */
function companionHost(shell) {
  const host = document.createElement('section');
  host.style.position = 'relative';
  shell.append(host);
  return host;
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(shells), overlayHost = undefined) {
  assert.throws(() => ui().mount('IconPicker', { target, props, overlayHost }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

const required = () => ({
  ariaLabel: LABELS.ariaLabel,
  listLabel: LABELS.listLabel,
  searchLabel: LABELS.searchLabel,
  noMatchesText: LABELS.noMatchesText,
  onChange: () => {},
});

describe('the published IconPicker mounts, updates on its root and destroys', () => {
  it('draws one picker root whose one focusable element is its trigger', async () => {
    const { target, handle, update, trigger } = mountPicker();
    await settle();
    assert.equal(target.children.length, 1, 'one root in target');
    const root = target.firstElementChild;
    assert.ok(root.classList.contains('fabricate-icon-picker'), "the picker's own root class");
    assert.equal(target.querySelectorAll('button, a, input, select, [tabindex]').length, 1);
    assert.equal(trigger().getAttribute('type'), 'button');
    assert.equal(trigger().getAttribute('data-keyboard-focus'), 'true');
    assert.equal(trigger().getAttribute('aria-haspopup'), 'dialog');
    assert.equal(trigger().getAttribute('aria-expanded'), 'false');
    assert.equal(glyphOf(trigger()), 'fas fa-flask');
    assert.equal(update({ ariaLabel: 'Tool icon' }), true);
    await settle();
    assert.ok(target.firstElementChild === root, 'the same root, so nothing remounted');
    assert.equal(trigger().getAttribute('aria-label'), 'Tool icon');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(reports, []);
  });
});

describe('the published IconPicker names', () => {
  it('its trigger by ariaLabel, its list and dialog by listLabel, and its field by searchLabel', async () => {
    const { trigger } = mountPicker();
    assert.equal(trigger().getAttribute('aria-label'), LABELS.ariaLabel);
    assert.equal(trigger().getAttribute('title'), LABELS.ariaLabel, 'its native tooltip');
    const panel = await open(trigger());
    assert.equal(panel.getAttribute('aria-label'), LABELS.listLabel);
    assert.equal(listboxIn().getAttribute('aria-label'), LABELS.listLabel);
    assert.equal(fieldIn().getAttribute('aria-label'), LABELS.searchLabel);
    assert.equal(fieldIn().getAttribute('placeholder'), LABELS.searchPlaceholder);
  });

  it('each row by its glyph’s label, the pinned flask row first', async () => {
    const { trigger } = mountPicker();
    await open(trigger());
    const rows = rowsIn();
    assert.ok(rows.length > 100, `the vocabulary is listed: ${rows.length} rows`);
    assert.equal(rowText(rows[0]), 'Flask');
    assert.deepEqual(
      rows.filter((row) => rowText(row) !== row.getAttribute('title')).map((row) => row.id),
      [],
      'each row draws its label, which is also its tooltip'
    );
  });

  it('writes an empty placeholder when the companion passes none', async () => {
    const { trigger } = mountPicker({ searchPlaceholder: undefined });
    await open(trigger());
    assert.equal(fieldIn().getAttribute('placeholder'), '');
  });

  it('draws no copy of its own and calls no game.i18n while it mounts, opens and finds nothing', async () => {
    const { game } = globalThis;
    const saved = game.i18n;
    const asked = [];
    const record = (key) => {
      asked.push(key);
      return key;
    };
    game.i18n = { localize: record, format: record, has: () => true };
    try {
      const { trigger } = mountPicker({ searchPlaceholder: undefined });
      await open(trigger());
      press(fieldIn(), 'ArrowDown');
      await search(NO_MATCH_QUERY);
      const drawn = `${document.body.textContent} ${[
        ...document.querySelectorAll('[aria-label], [title], [placeholder]'),
      ]
        .flatMap((node) =>
          ['aria-label', 'title', 'placeholder'].map((name) => node.getAttribute(name))
        )
        .join(' ')}`;
      for (const copy of FABRICATE_COPY) assert.ok(!drawn.includes(copy), `no "${copy}"`);
    } finally {
      game.i18n = saved;
    }
    assert.deepEqual(asked, []);
  });

  it('clips the no-match line’s polite live region under a Fabricate window', async () => {
    const sheet = readStylesheet();
    const rule = /\.fabricate \.visually-hidden \{[^}]*\}/.exec(sheet)?.[0];
    assert.ok(rule, 'the module utility was read');
    await underSheet(rule, async () => {
      const { trigger } = mountPicker();
      const panel = await open(trigger());
      assertClipped(panel.querySelector('[data-popover-live]'), 'the live region');
    });
  });
});

describe('the published IconPicker opens its list', () => {
  it('in the chain’s host on a press of the trigger, with focus in its query field', async () => {
    const { target, trigger } = mountPicker();
    const panel = await open(trigger());
    assert.ok(Boolean(panel), 'the list opens');
    assert.ok(!target.contains(panel), 'outside target');
    assert.ok(target.parentElement.contains(panel), 'in the app root that hosts it');
    assert.equal(trigger().getAttribute('aria-expanded'), 'true');
    assert.ok(document.activeElement === fieldIn(), 'focus rests on the query field');
    trigger().click();
    flushSync();
    await settle();
    assert.ok(!panelIn(), 'a second press closes it');
  });

  it('pins the value’s row first and selected while the query is empty', async () => {
    const { trigger } = mountPicker();
    await open(trigger());
    const [first, ...rest] = rowsIn();
    assert.equal(glyphOf(first), 'fas fa-flask');
    assert.ok(first.classList.contains('pinned'), 'the pinned row');
    assert.equal(first.getAttribute('aria-selected'), 'true');
    assert.equal(rest.filter((row) => row.getAttribute('aria-selected') === 'true').length, 0);
  });

  for (const value of [undefined, '']) {
    it(`pins a row for ${value === undefined ? 'an absent' : 'an empty'} value too`, async () => {
      const { trigger } = mountPicker({ value });
      await open(trigger());
      assert.equal(document.querySelectorAll('[role="option"].pinned').length, 1);
    });
  }

  it('pins a value the vocabulary does not list as a row of its own, whose class string a choice passes', async () => {
    const { calls, trigger } = mountPicker({ value: 'fas fa-notaglyph' });
    await open(trigger());
    const [first] = rowsIn();
    assert.equal(glyphOf(first), 'fas fa-notaglyph');
    assert.equal(rowText(first), 'Notaglyph', 'named from its own name');
    first.click();
    flushSync();
    assert.deepEqual(calls, [['fas fa-notaglyph']]);
  });

  it('draws noMatchesText in a status region and no listbox for a query matching nothing', async () => {
    const { trigger } = mountPicker();
    await open(trigger());
    await search(NO_MATCH_QUERY);
    assert.ok(!listboxIn(), 'no listbox');
    const status = panelIn().querySelector('.manager-travel-popover-empty[role="status"]');
    assert.equal(status?.textContent.replaceAll(/\s+/g, ' ').trim(), LABELS.noMatchesText);
  });
});

describe('a choice in the published IconPicker', () => {
  it('calls onChange once with the row’s class string by pointer, closes, and returns focus to the trigger', async () => {
    const { update, calls, trigger } = mountPicker();
    await open(trigger());
    const row = rowsIn()[1];
    const chosen = glyphOf(row);
    row.click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [[chosen]]);
    assert.match(chosen, /^fas fa-[a-z0-9-]+$/);
    assert.ok(!panelIn(), 'a choice closes the list');
    assert.ok(document.activeElement === trigger(), 'focus returns to the trigger');
    assert.equal(glyphOf(trigger()), 'fas fa-flask', 'drawn only when the update passes it');
    assert.equal(update({ value: chosen }), true);
    await settle();
    assert.equal(glyphOf(trigger()), chosen);
  });

  it('calls onChange with the pinned row on ArrowDown then Enter in the query field, and nothing on Enter alone', async () => {
    const { calls, trigger } = mountPicker();
    await open(trigger());
    press(fieldIn(), 'Enter');
    await settle();
    assert.deepEqual(calls, [], 'Enter with no active row chooses nothing');
    assert.ok(Boolean(panelIn()), 'and leaves the list open');
    press(fieldIn(), 'ArrowDown');
    const active = document.querySelector(
      `[id="${fieldIn().getAttribute('aria-activedescendant')}"]`
    );
    assert.equal(glyphOf(active), 'fas fa-flask', 'the field names the active row');
    press(fieldIn(), 'Enter');
    await settle();
    assert.deepEqual(calls, [['fas fa-flask']], 'the selected row is chosen too');
    assert.ok(!panelIn(), 'Enter closes the list');
  });

  it('calls nothing on mount, update, open, a query, Escape or an outside press', async () => {
    const { update, calls, trigger } = mountPicker();
    assert.equal(update({ value: 'fas fa-gear' }), true);
    await open(trigger());
    await search('gear');
    press(fieldIn(), 'Escape');
    await settle();
    assert.ok(!panelIn(), 'Escape closes');
    await open(trigger());
    document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await settle();
    assert.ok(!panelIn(), 'an outside press closes');
    assert.deepEqual(calls, []);
  });

  it('reports an onChange that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion refused the glyph');
    const { update, trigger } = mountPicker({
      onChange() {
        throw failure;
      },
    });
    await open(trigger());
    rowsIn()[0].click();
    flushSync();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'IconPicker', 'onChange', failure]]);
    assert.equal(update(), true);
  });
});

describe('the keys the published IconPicker keeps', () => {
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

  it('stops every keydown on its trigger, and its own click, at the trigger', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { trigger } = mountPicker({}, { target });
    const keys = hearing('keydown', [['above', target.parentElement]]);
    const clicks = hearing('click', [['above', target.parentElement]]);
    try {
      trigger().focus();
      for (const key of ['ArrowDown', 'a', 'Enter', ' ', 'Escape', 'Tab']) press(trigger(), key);
      trigger().click();
      flushSync();
      await settle();
      trigger().click();
      flushSync();
      await settle();
    } finally {
      keys.stop();
      clicks.stop();
    }
    assert.deepEqual(keys.heard, [], 'no key reached the companion above target');
    assert.deepEqual(clicks.heard, [], 'no press of the trigger reached it either');
  });

  it('stops a click on a row or in the query field inside the list', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { calls, trigger } = mountPicker({}, { target, overlayHost });
    await open(trigger());
    const clicks = hearing('click', [
      ['host', overlayHost],
      ['shell', target.parentElement],
      ['body', document.body],
    ]);
    try {
      fieldIn().click();
      flushSync();
      rowsIn()[0].click();
      flushSync();
      await settle();
    } finally {
      clicks.stop();
    }
    assert.deepEqual(calls, [['fas fa-flask']], 'the row was chosen');
    assert.deepEqual(clicks.heard, [], 'no click left the list');
  });

  it('closes on Escape in the query field, returns focus to the trigger, and stops the key there', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { trigger } = mountPicker({}, { target, overlayHost });
    await open(trigger());
    const keys = hearing('keydown', [
      ['host', overlayHost],
      ['shell', target.parentElement],
      ['window', document.defaultView],
    ]);
    try {
      press(fieldIn(), 'Escape');
      await settle();
    } finally {
      keys.stop();
    }
    assert.ok(!panelIn(), 'Escape closes the list');
    assert.ok(document.activeElement === trigger(), 'focus returns to the trigger');
    assert.deepEqual(keys.heard, [], 'no listener above the field heard Escape');
  });

  it('leaves the list open when Tab takes focus out of the field, and the next Escape closes it', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { trigger } = mountPicker({}, { target });
    const elsewhere = document.createElement('button');
    target.parentElement.append(elsewhere);
    await open(trigger());
    press(fieldIn(), 'Tab');
    elsewhere.focus();
    await settle();
    assert.ok(Boolean(panelIn()), 'Tab leaves the list open');
    press(elsewhere, 'Escape');
    await settle();
    assert.ok(!panelIn(), 'Escape closes the list');
    assert.ok(document.activeElement === trigger(), 'and returns focus to the trigger');
  });
});

describe('the published IconPicker hosts its list', () => {
  /** The `display: contents` element the seam portaled the panel into. */
  function containerOf(panel) {
    const container = panel.parentElement;
    assert.equal(container.style.display, 'contents', 'the container is display: contents');
    return container;
  }

  it('in the overlayHost option, and a choice there reaches onChange', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { calls, trigger, handle } = mountPicker({}, { target, overlayHost });
    const panel = await open(trigger());
    assert.ok(containerOf(panel).parentElement === overlayHost, 'the option hosts the container');
    rowsIn()[0].click();
    flushSync();
    assert.deepEqual(calls, [['fas fa-flask']]);
    handle.destroy();
    assert.equal(overlayHost.children.length, 0, 'destroy leaves no container');
  });

  it('in the nearest .fabricate-app above target when no overlayHost is passed', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { trigger } = mountPicker({}, { target });
    const panel = await open(trigger());
    assert.ok(containerOf(panel).parentElement === target.parentElement, 'the app root hosts');
    assert.ok(!document.querySelector(LAYER), 'no standalone layer is made');
  });

  it('in the standalone layer under a Fabricate frame with no app root, which goes when it closes', async () => {
    const { calls, trigger } = mountPicker({}, { target: fabricateTarget(shells, 'fabricate') });
    const panel = await open(trigger());
    const layer = document.querySelector(LAYER);
    assert.ok(layer?.parentElement === document.body, 'a layer on the target’s body');
    assert.ok(containerOf(panel).parentElement === layer);
    rowsIn()[0].click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [['fas fa-flask']]);
    assert.ok(!document.querySelector(LAYER), 'the layer goes with its last list');
  });

  it('leaves no panel, container or layer when destroyed while open', async () => {
    const { handle, trigger } = mountPicker({}, { target: fabricateTarget(shells, 'fabricate') });
    const panel = await open(trigger());
    const container = containerOf(panel);
    handle.destroy();
    await settle();
    assert.ok(!panel.isConnected && !container.isConnected, 'no panel and no container');
    assert.ok(!document.querySelector(LAYER), 'no layer');
    assert.deepEqual(reports, []);
  });

  it('redraws the selection in place on an update while open', async () => {
    const { update, trigger } = mountPicker();
    const panel = await open(trigger());
    assert.equal(update({ value: 'fas fa-gear' }), true);
    flushSync();
    await settle();
    assert.ok(panelIn() === panel, 'the panel is the same node');
    const [first] = rowsIn();
    assert.equal(glyphOf(first), 'fas fa-gear');
    assert.equal(first.getAttribute('aria-selected'), 'true');
    assert.equal(glyphOf(trigger()), 'fas fa-gear');
  });
});

describe('the published IconPicker in a second window', () => {
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

  /** Counts each window's `getComputedStyle` calls while `run` runs. */
  async function countingStyles(run) {
    const counts = { first: 0, second: 0 };
    const spy = (view, key) => {
      const original = view.getComputedStyle;
      view.getComputedStyle = function counted(...args) {
        counts[key] += 1;
        return original.apply(view, args);
      };
      return () => {
        view.getComputedStyle = original;
      };
    };
    const restores = [spy(document.defaultView, 'first'), spy(second, 'second')];
    try {
      await run();
    } finally {
      for (const restore of restores) restore();
    }
    return counts;
  }

  it('opens in that document’s layer with its focus, measures and choice there', async () => {
    const target = detachedTarget();
    const { calls, trigger } = mountPicker({}, { target });
    let panel;
    const counts = await countingStyles(async () => {
      panel = await open(trigger());
    });
    const layer = second.document.querySelector(LAYER);
    assert.ok(layer?.parentElement === second.document.body, "the second document's body");
    assert.ok(layer.contains(panel), 'the panel is in it');
    assert.ok(!document.querySelector(LAYER), 'nothing is drawn in this window');
    assert.ok(second.document.activeElement === fieldIn(second.document), 'its query field');
    assert.ok(counts.second > 0, `measured in the second window: ${counts.second}`);
    assert.equal(counts.first, 0, 'and never in this one');
    rowsIn(second.document)[0].click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [['fas fa-flask']]);
    assert.ok(
      second.document.activeElement === trigger(),
      "focus returns to that document's trigger"
    );
  });
});

describe('the published IconPicker refuses', () => {
  it('a missing or empty required key (M9), and an onChange that is no function (M17)', () => {
    for (const key of ['ariaLabel', 'listLabel', 'searchLabel', 'noMatchesText']) {
      const props = required();
      delete props[key];
      assertRefused(props, `IconPicker requires a non-empty "${key}"`);
      assertRefused({ ...required(), [key]: '' }, `IconPicker requires a non-empty "${key}"`);
    }
    for (const onChange of ['', 'x']) {
      assertRefused({ ...required(), onChange }, '"onChange" must be a function');
    }
  });

  it('every unpublished prop, class and a data-* key (M8)', () => {
    for (const key of [
      'disabled',
      'iconOnly',
      'bounds',
      'triggerClass',
      'triggerStyle',
      'onTriggerContextMenu',
      'onTriggerKeydown',
      'class',
      'data-x',
    ]) {
      assertRefused({ ...required(), [key]: 'x' }, `"${key}" is not a prop of IconPicker`);
    }
  });

  it('a target outside a Fabricate window (M16), and an overlayHost of another kind (M18)', () => {
    assertRefused(
      required(),
      'IconPicker needs a Fabricate window ancestor',
      companionTarget(shells)
    );
    assertRefused(
      required(),
      "overlayHost must be an element in the target's document",
      fabricateTarget(shells),
      document.createTextNode('host')
    );
  });
});
