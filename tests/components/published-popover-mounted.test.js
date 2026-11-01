/**
 * The published `Popover` on Fabricate's real Svelte runtime (issue 2861), through a fresh seam
 * registered with the adapter's own table, with the module sheet loaded: `open` and the anchor
 * deciding whether the panel is drawn, the anchor followed by id as it is removed, re-rendered and
 * returned, the names the companion's strings give the dialog, every refusal the entry adds,
 * `onClose` reached by an Escape inside the panel and an outside press but not by a press on the
 * anchor or in a panel a slot-mounted `Select` opened, the focus it moves in, wraps and returns,
 * the panel hosted by a Fabricate window root, the `overlayHost` option and the standalone layer,
 * a second window, and the View Lab specimen.
 * Limit: happy-dom lays nothing out, so every box is empty and no clause here reads a placement;
 * `popover-rendered.test.js` measures those in Chromium.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
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
  standaloneRootIn,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  POPOVER_CASES,
  mountPopoverSpecimen,
} from '../view-lab/fixtures/publishedPopoverSpecimen.js';

const REPOSITORY = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const PANEL = '.fabricate-popover';
const ANCHOR_ID = 'strength-cell';
const REQUIRED = Object.freeze({ anchorId: ANCHOR_ID, ariaLabel: 'Adjust Strength' });
const SELECT = Object.freeze({
  options: [
    { value: 'gm', label: 'GM award' },
    { value: 'rest', label: 'Long rest' },
  ],
  ariaLabel: 'Reason',
});

const harness = createMountedComponentHarness({
  repoRoot: REPOSITORY,
  tmpPrefix: 'fabricate-published-popover-',
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
let sheet;

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
  sheet = document.createElement('style');
  sheet.textContent = readStylesheet();
  document.head.append(sheet);
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  sheet.remove();
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
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its panel');
  assert.ok(!document.querySelector(PANEL), 'no panel outlives its mount');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'no fault was reported');
});

const doc = (node) => node.ownerDocument;
const panelIn = (owner = document) => owner.querySelector(PANEL);

/** A companion's anchor button carrying `id`, in `shell`, before the target. */
function anchorIn(shell, id = ANCHOR_ID) {
  const anchor = doc(shell).createElement('button');
  Object.assign(anchor, { type: 'button', id, textContent: 'Strength 14' });
  shell.prepend(anchor);
  return anchor;
}

/**
 * An open popover over `REQUIRED` and its body slot, recording `onClose`, mounted with `props` into
 * `target` beside an anchor: its handle, anchor, an `update` passing `base` again beside `next`,
 * the recorded calls and the seam.
 */
function mountPopover(
  props = {},
  { target = fabricateTarget(shells, 'fabricate fabricate-app'), overlayHost, api = ui() } = {}
) {
  const anchor =
    target.ownerDocument.querySelector(`#${ANCHOR_ID}`) ?? anchorIn(target.parentElement);
  const close = recorder();
  const base = { ...REQUIRED, open: true, body: true, onClose: close.record, ...props };
  const handle = api.mount('Popover', { target, props: base, overlayHost });
  handles.push(handle);
  flushSync();
  return {
    api,
    target,
    anchor,
    handle,
    base,
    update: (next = {}) => {
      const done = handle.update({ ...base, ...next });
      flushSync();
      return done;
    },
    calls: close.calls,
  };
}

/** A companion element `tag` in `slot`, carrying `attributes`. */
function companion(slot, tag, attributes = {}) {
  const element = doc(slot).createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  slot.append(element);
  return element;
}

/** A cancelable, composed keydown of `key` on `element`. */
function press(element, key, init = {}) {
  const { KeyboardEvent } = doc(element).defaultView;
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

/** A bubbling `type` mouse event on `element`. */
function pointer(element, type = 'mousedown') {
  const { MouseEvent } = doc(element).defaultView;
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  flushSync();
}

/** Past the microtask focus moves on and one animation frame, where focus returns. */
const frame = (owner = document) =>
  new Promise((done) => owner.defaultView.requestAnimationFrame(() => setTimeout(done, 0)));

/** Past the anchor's coalesced read, the redraw it causes and the microtask focus moves on. */
async function afterRead() {
  for (let round = 0; round < 3; round += 1) {
    await frame();
    flushSync();
  }
  await settle();
}

function assertRefused(props, tail, target = fabricateTarget(shells)) {
  assert.throws(() => ui().mount('Popover', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

const required = () => ({ ...REQUIRED, onClose: () => {} });

describe('the published Popover opens and closes only through update', () => {
  it('draws only a hidden element in target while closed, and the panel outside target once open', async () => {
    const { target, update } = mountPopover({ open: false });
    await settle();
    assert.equal(target.children.length, 1, 'one element of Fabricate’s in target');
    assert.equal(target.firstElementChild.hidden, true, 'and it is hidden');
    assert.ok(!panelIn(), 'no panel');
    update({ open: true });
    await settle();
    const panel = panelIn();
    assert.ok(panel, 'drawn');
    assert.ok(!target.contains(panel), 'outside target');
    assert.ok(panel.parentElement.parentElement === target.parentElement, 'in the chain’s host');
    update({ open: false });
    await settle();
    assert.ok(!panelIn(), 'gone once closed');
    assert.equal(target.parentElement.children.length, 2, 'the anchor and target, no container');
  });

  it('draws nothing for an open that is not true, as nothing is coerced', async () => {
    for (const open of ['true', 1, {}]) {
      const { handle } = mountPopover({ open });
      await settle();
      assert.ok(!panelIn(), `${JSON.stringify(open)} draws no panel`);
      handle.destroy();
    }
  });

  it('draws nothing while anchorId names no element, then follows the anchor as it comes, goes and is re-rendered, calling nothing', async () => {
    const shell = fabricateTarget(shells, 'fabricate fabricate-app');
    const target = shell;
    const anchorShell = shell.parentElement;
    const { calls } = mountPopover({}, { target, api: ui() });
    const first = document.querySelector(`#${ANCHOR_ID}`);
    first.remove();
    await settle();
    assert.ok(!panelIn(), 'no panel once the anchor is removed');
    const second = anchorIn(anchorShell);
    await settle();
    flushSync();
    assert.ok(panelIn(), 'drawn again for the re-rendered anchor');
    second.id = 'renamed';
    await settle();
    flushSync();
    assert.ok(!panelIn(), 'not drawn while no element carries the id');
    second.id = ANCHOR_ID;
    await settle();
    flushSync();
    assert.ok(panelIn(), 'drawn once the id is back');
    assert.deepEqual(calls, [], 'onClose is never called for the anchor');
  });

  it('draws no panel while its target is in a slot an update detaches, calling nothing, and draws it again as the slot returns', async () => {
    const api = ui();
    const shell = fabricateTarget(shells, 'fabricate fabricate-app');
    const dialogProps = (open) => ({
      open,
      title: 'Ability scores',
      closeLabel: 'Close',
      body: true,
      onClose() {},
    });
    const dialog = api.mount('Modal', { target: shell, props: dialogProps(true) });
    handles.push(dialog);
    flushSync();
    const slot = dialog.slot('body');
    anchorIn(shell.parentElement);
    const target = companion(slot, 'div');
    const { calls } = mountPopover({}, { target, api });
    await settle();
    flushSync();
    assert.ok(panelIn(), 'drawn while the dialog is open');
    dialog.update(dialogProps(false));
    flushSync();
    await settle();
    flushSync();
    assert.ok(!panelIn(), 'not drawn once the slot is detached');
    dialog.update(dialogProps(true));
    flushSync();
    await settle();
    flushSync();
    assert.ok(panelIn(), 'drawn again once the slot returns');
    assert.deepEqual(calls, [], 'onClose is never called');
  });

  it('draws nothing for an anchorId that is not a string', async () => {
    mountPopover({ anchorId: 7 });
    await settle();
    assert.ok(!panelIn(), 'no panel');
  });

  it('keeps the slot element across a close, drawn again with its content on reopening', async () => {
    const { handle, update } = mountPopover();
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    assert.ok(panelIn().contains(input), 'in the panel');
    update({ open: false });
    await settle();
    assert.ok(!input.isConnected, 'detached while closed');
    update({ open: true });
    await settle();
    assert.ok(panelIn().contains(input), 'the same element, drawn again');
  });
});

describe('the published Popover refuses', () => {
  it('M9 for an absent or empty anchorId', () => {
    const { anchorId, ...rest } = required();
    assert.equal(anchorId, ANCHOR_ID);
    assertRefused(rest, 'Popover requires a non-empty "anchorId"');
    assertRefused({ ...rest, anchorId: '' }, 'Popover requires a non-empty "anchorId"');
  });

  it('M9 for neither a title nor an ariaLabel, and for no onClose', () => {
    const { ariaLabel, ...unnamed } = required();
    assert.equal(ariaLabel, REQUIRED.ariaLabel);
    assertRefused(unnamed, 'Popover requires a non-empty "title"');
    assertRefused({ ...unnamed, ariaLabel: '  ' }, 'Popover requires a non-empty "title"');
    const { onClose, ...silent } = required();
    assert.equal(typeof onClose, 'function');
    assertRefused(silent, 'Popover requires a non-empty "onClose"');
  });

  it('M22 for an ariaLabel that does not hold the title’s words', () => {
    assertRefused(
      { ...required(), title: 'Strength', ariaLabel: 'Adjust the score' },
      '"ariaLabel" must contain the text of "title" ("Strength" is not in "Adjust the score")'
    );
  });

  it('a key the entry does not publish, a function as data, and a title that is not a string', () => {
    for (const key of ['class', 'data-x', 'width', 'trapFocus']) {
      assertRefused({ ...required(), [key]: 'x' }, `"${key}" is not a prop of Popover`);
    }
    assertRefused(
      { ...required(), anchorId: () => ANCHOR_ID },
      '"anchorId" must not hold a function'
    );
    assertRefused({ ...required(), title: 3 }, '"title" must be a string');
  });
});

describe('the published Popover names', () => {
  it('is a dialog named by ariaLabel, with no heading, no aria-modal and its id for aria-controls', async () => {
    const { anchor } = mountPopover();
    await settle();
    const panel = panelIn();
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-label'), REQUIRED.ariaLabel);
    assert.equal(panel.hasAttribute('aria-modal'), false);
    assert.equal(panel.hasAttribute('aria-labelledby'), false);
    assert.ok(!panel.querySelector('h3'), 'no heading');
    assert.equal(panel.id, `${ANCHOR_ID}-popover`);
    assert.deepEqual(
      anchor.getAttributeNames().toSorted((a, b) => a.localeCompare(b)),
      ['id', 'type'],
      'nothing is written on the anchor'
    );
  });

  it('is named by its visible title heading when no ariaLabel is passed', async () => {
    mountPopover({ ariaLabel: undefined, title: 'Strength' });
    await settle();
    const panel = panelIn();
    const heading = panel.querySelector('h3');
    assert.equal(heading.textContent, 'Strength');
    assert.equal(panel.getAttribute('aria-labelledby'), heading.id);
    assert.equal(heading.id, `${ANCHOR_ID}-popover-title`);
    assert.equal(panel.hasAttribute('aria-label'), false);
  });

  it('takes ariaLabel over the title when both are passed and it holds the title', async () => {
    mountPopover({ title: 'Strength', ariaLabel: 'Adjust Strength' });
    await settle();
    assert.equal(panelIn().getAttribute('aria-label'), 'Adjust Strength');
    assert.equal(panelIn().querySelector('h3').textContent, 'Strength');
  });
});

describe('closing the published Popover', () => {
  it('calls onClose once for an Escape inside the panel and stops it there, and not for one outside', async () => {
    const { handle, calls } = mountPopover();
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    const heard = [];
    const listen = (event) => {
      heard.push(event.key);
    };
    document.defaultView.addEventListener('keydown', listen);
    try {
      const inside = press(input, 'Escape');
      assert.equal(calls.length, 1);
      assert.equal(inside.defaultPrevented, true);
      assert.deepEqual(heard, [], 'the window never hears it');
      press(document.body, 'Escape');
      assert.equal(calls.length, 1, 'an Escape outside calls nothing');
      press(input, 'Escape', { isComposing: true });
      assert.equal(calls.length, 1, 'a composing Escape calls nothing');
    } finally {
      document.defaultView.removeEventListener('keydown', listen);
    }
  });

  it('leaves an Escape to an expanded control inside the panel', async () => {
    const { handle, calls } = mountPopover();
    const disclosure = companion(handle.slot('body'), 'button', { 'aria-expanded': 'true' });
    await settle();
    press(disclosure, 'Escape');
    assert.deepEqual(calls, [], 'the expanded control keeps it');
    disclosure.setAttribute('aria-expanded', 'false');
    press(disclosure, 'Escape');
    assert.equal(calls.length, 1, 'collapsed, it closes the popover');
  });

  it('calls onClose for an outside mousedown, and not for one on the anchor or inside the panel', async () => {
    const { calls, anchor } = mountPopover();
    await settle();
    pointer(anchor);
    assert.deepEqual(calls, [], 'the anchor is no outside press');
    pointer(panelIn());
    assert.deepEqual(calls, [], 'nor is the panel');
    pointer(document.body);
    assert.equal(calls.length, 1, 'the page is');
  });

  it('calls nothing for an outside press with closeOnOutsideClick false, and keeps the default for any other value', async () => {
    const { calls, handle, update } = mountPopover({ closeOnOutsideClick: false });
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    pointer(document.body);
    assert.deepEqual(calls, [], 'false keeps it open');
    press(input, 'Escape');
    assert.equal(calls.length, 1, 'Escape inside still closes');
    update({ closeOnOutsideClick: 'false' });
    pointer(document.body);
    assert.equal(calls.length, 2, "'false' is not false");
  });

  it('counts a press in the list a slot-mounted published Select opened as inside', async () => {
    const { api, handle, calls } = mountPopover();
    const host = companion(handle.slot('body'), 'div');
    const select = api.mount('Select', { target: host, props: { ...SELECT, onChange() {} } });
    handles.push(select);
    flushSync();
    host.querySelector('button').click();
    flushSync();
    await settle();
    const option = document.querySelector('[role="listbox"] [role="option"]');
    assert.ok(option, 'the list is open');
    assert.ok(!panelIn().contains(option), 'portaled outside the panel');
    pointer(option);
    assert.deepEqual(calls, [], 'a press in it is inside');
    pointer(document.body);
    assert.equal(calls.length, 1, 'the page still is not');
  });
});

describe('focus and the published Popover', () => {
  it('moves focus to the first control of a body filled after mount, else to the body, else to the panel', async () => {
    const { handle } = mountPopover();
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    assert.ok(document.activeElement === input, 'the first control');
    handle.destroy();
    const empty = mountPopover();
    await settle();
    const body = panelIn().querySelector('[data-popover-body]');
    assert.ok(document.activeElement === body, 'the body, which the keyboard can scroll');
    assert.equal(body.getAttribute('tabindex'), '-1', 'a focus target, not a Tab stop');
    empty.handle.destroy();
    mountPopover({ body: undefined });
    await settle();
    assert.ok(document.activeElement === panelIn(), 'the panel itself');
  });

  it('moves focus in on the first draw of an open alone, so a redrawn anchor takes no focus the user moved', async () => {
    const { handle, anchor } = mountPopover();
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    assert.ok(document.activeElement === input, 'in on the first draw');
    const elsewhere = companion(document.body, 'input', { 'aria-label': 'Elsewhere' });
    try {
      anchor.remove();
      await afterRead();
      assert.ok(!panelIn(), 'undrawn while the anchor is gone');
      elsewhere.focus();
      anchor.parentElement ?? document.querySelector('section').prepend(anchor);
      await afterRead();
      assert.ok(panelIn(), 'drawn again');
      assert.ok(document.activeElement === elsewhere, 'focus stays where the user put it');
    } finally {
      elsewhere.remove();
    }
  });

  it('moves focus in again on a redraw when focus was inside as the anchor went', async () => {
    const { handle, anchor } = mountPopover();
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    const shell = anchor.parentElement;
    anchor.remove();
    await afterRead();
    assert.ok(!panelIn(), 'undrawn');
    shell.prepend(anchor);
    await afterRead();
    assert.ok(document.activeElement === input, 'back in its first control');
  });

  it('enters the panel on Tab from the anchor, and closes on Escape there', async () => {
    const { handle, anchor, calls } = mountPopover();
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    anchor.focus();
    const tab = press(anchor, 'Tab');
    assert.equal(tab.defaultPrevented, true);
    assert.ok(document.activeElement === input, 'Tab on the anchor enters the panel');
    anchor.focus();
    assert.equal(
      press(anchor, 'Tab', { shiftKey: true }).defaultPrevented,
      false,
      'Shift+Tab is the page’s'
    );
    const escape = press(anchor, 'Escape');
    assert.equal(escape.defaultPrevented, true);
    assert.equal(calls.length, 1, 'Escape on the anchor closes it');
  });

  it('closes on an Escape a control inside stops before it bubbles, as a published picker trigger does', async () => {
    const { handle, calls } = mountPopover();
    const trigger = companion(handle.slot('body'), 'button', { type: 'button' });
    trigger.addEventListener('keydown', (event) => event.stopPropagation());
    await settle();
    press(trigger, 'Escape');
    assert.equal(calls.length, 1, 'decided on the window, as the key goes down');
  });

  it('wraps Tab and Shift+Tab inside the panel, and enters it from the panel itself', async () => {
    const { handle } = mountPopover();
    const slot = handle.slot('body');
    const first = companion(slot, 'input', { 'aria-label': 'Value' });
    companion(slot, 'button', { type: 'button' });
    const last = companion(slot, 'input', { 'aria-label': 'Reason' });
    await settle();
    last.focus();
    assert.equal(press(last, 'Tab').defaultPrevented, true);
    assert.ok(document.activeElement === first, 'Tab from the last wraps to the first');
    press(first, 'Tab', { shiftKey: true });
    assert.ok(document.activeElement === last, 'Shift+Tab from the first wraps to the last');
    const middle = slot.querySelector('button');
    middle.focus();
    assert.equal(press(middle, 'Tab').defaultPrevented, false, 'the browser moves Tab inside');
    panelIn().focus();
    press(panelIn(), 'Tab');
    assert.ok(document.activeElement === first, 'from the panel Tab enters at the first');
  });

  it('returns focus to the anchor when it closes with focus inside, and leaves it where an outside press put it', async () => {
    const { handle, update, anchor } = mountPopover({ onClose: () => update({ open: false }) });
    const input = companion(handle.slot('body'), 'input', { 'aria-label': 'Value' });
    await settle();
    assert.ok(document.activeElement === input);
    press(input, 'Escape');
    await frame();
    assert.ok(document.activeElement === anchor, 'back on the anchor');
    update({ open: true });
    await settle();
    assert.ok(document.activeElement === input, 'in again');
    // A press on page content that takes no focus leaves focus on the page.
    const blank = companion(document.body, 'div');
    try {
      pointer(blank);
      document.activeElement.blur();
      await frame();
      assert.ok(!panelIn(), 'the outside press closed it');
      assert.ok(document.activeElement === document.body, 'not taken back to the anchor');
    } finally {
      blank.remove();
    }
  });

  it('keeps focus counted inside for a press on the anchor or in a panel opened from inside', async () => {
    const { api, handle, update, anchor } = mountPopover({
      onClose: () => update({ open: false }),
    });
    const host = companion(handle.slot('body'), 'div');
    handles.push(api.mount('Select', { target: host, props: { ...SELECT, onChange() {} } }));
    flushSync();
    host.querySelector('button').focus();
    host.querySelector('button').click();
    flushSync();
    await settle();
    pointer(document.querySelector('[role="listbox"] [role="option"]'));
    pointer(anchor);
    update({ open: false });
    document.activeElement.blur();
    await frame();
    assert.ok(document.activeElement === anchor, 'returned to the anchor');
  });
});

describe('the published Popover hosts its panel', () => {
  it('in the nearest Fabricate window root, in the overlayHost option, and on the standalone layer under a companion’s shell', async () => {
    const appTarget = fabricateTarget(shells, 'fabricate fabricate-app');
    const app = mountPopover({}, { target: appTarget });
    await settle();
    assert.ok(panelIn().parentElement.parentElement === appTarget.parentElement, 'the app root');
    app.handle.destroy();
    app.anchor.remove();

    const shell = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = document.createElement('section');
    shell.parentElement.append(overlayHost);
    const hosted = mountPopover({}, { target: shell, overlayHost });
    await settle();
    assert.ok(panelIn().parentElement.parentElement === overlayHost, 'the option');
    hosted.handle.destroy();
    hosted.anchor.remove();

    const bare = companionTarget(shells);
    mountPopover({}, { target: bare });
    await settle();
    standaloneRootIn(bare);
    const layer = document.querySelector(LAYER);
    assert.ok(layer?.contains(panelIn()), 'the standalone layer');
  });
});

describe('the published Popover in a second window', () => {
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

  it('finds its anchor and draws its panel in that document, never in this one', async () => {
    const decoy = anchorIn(fabricateTarget(shells));
    const target = detachedTarget();
    const anchor = anchorIn(target.parentElement);
    const { calls } = mountPopover({}, { target });
    await settle();
    assert.ok(!panelIn(), 'nothing is drawn in this window');
    const layer = second.document.querySelector(LAYER);
    assert.ok(layer?.contains(panelIn(second.document)), 'that document’s layer');
    pointer(anchor);
    pointer(decoy);
    assert.deepEqual(calls, [], 'neither its anchor nor this window is pressed outside it');
    pointer(second.document.body);
    press(panelIn(second.document), 'Escape');
    assert.equal(calls.length, 2, 'an outside press and an Escape there');
  });
});

describe('the popover View Lab specimen cases against the DOM the fixture draws', () => {
  const count = (selector) => document.querySelectorAll(selector).length;

  function drawFixture() {
    const shell = fabricateTarget(shells, 'fabricate fabricate-app');
    const ground = document.createElement('div');
    shell.replaceChildren(ground);
    const teardown = mountPopoverSpecimen({ mount: ui().mount, ground });
    flushSync();
    return teardown;
  }

  for (const id of POPOVER_CASES) {
    it(`${id} draws exactly one element for its wait, its centre hit and each layout control`, async () => {
      const viewCase = getCaseById(id);
      const teardown = drawFixture();
      try {
        await settle();
        flushSync();
        for (const selector of [
          viewCase.expectSelector,
          viewCase.expectCenterHit,
          ...viewCase.expectLayout.controls.map((control) => control.selector),
        ]) {
          assert.equal(count(selector), 1, `${selector} names one element`);
        }
      } finally {
        teardown();
      }
    });
  }
});
