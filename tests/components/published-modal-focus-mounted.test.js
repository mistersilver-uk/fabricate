/**
 * The published `Modal`'s `trapFocus`, `initialFocus` and `footerLayout` (issue 2776) on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table:
 * the trap's focus, `aria-modal`, Tab wrap and keyboard ownership, the opener focus returns to a
 * frame after the close, the marked element focus enters on, the equal footer, what a value outside
 * each key's set draws, and a companion root that makes its own stacking context with
 * `isolation: isolate`, the dialog portaled out of it to the app root or to an overlay host in it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  recordEscapes,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const DIALOG_HOOK = '[data-manager-modal]';
const REQUIRED = Object.freeze({ title: 'Add a requirement', closeLabel: 'Close' });

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-modal-focus-',
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

afterEach(async () => {
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  await frame();
  assert.ok(!document.querySelector(DIALOG_HOOK), 'no dialog outlives its mount');
  assert.deepEqual(reports, [], 'nothing was reported');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

const frame = () => new Promise((done) => document.defaultView.requestAnimationFrame(done));
const dialogs = () => [...document.querySelectorAll(DIALOG_HOOK)];
const dialogNamed = (title) => dialogs().find((node) => node.getAttribute('aria-label') === title);
const closeOf = (dialog) => dialog.querySelector('[data-manager-modal-close]');

/** A `tag` of the companion's own, appended to `parent` with `attributes`. */
function companionElement(parent, tag, attributes = {}) {
  const element = parent.ownerDocument.createElement(tag);
  if (tag === 'button') {
    element.type = 'button';
    element.textContent = 'Probe';
  }
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  parent.append(element);
  return element;
}

/**
 * A closed dialog over `REQUIRED`, both slots and `props`, mounted into `target`, whose body slot
 * holds a search field and a list button and whose footer holds two buttons, as premium's pickers
 * draw; `open(next)` and `close(next)` update it with the same keys beside `next`.
 */
function closedModal(props = {}, { target, overlayHost, api = ui() } = {}) {
  const close = recorder();
  const base = { ...REQUIRED, open: false, body: true, footer: true, onClose: close.record };
  const handle = api.mount('Modal', { target, overlayHost, props: { ...base, ...props } });
  handles.push(handle);
  flushSync();
  const body = handle.slot('body');
  const search = companionElement(body, 'input', { type: 'search', 'aria-label': 'Search' });
  const row = companionElement(body, 'button');
  const footer = handle.slot('footer');
  const secondary = companionElement(footer, 'button');
  const primary = companionElement(footer, 'button');
  const update = (next = {}) => {
    handle.update({ ...base, ...props, ...next });
    flushSync();
  };
  return {
    handle,
    calls: close.calls,
    search,
    row,
    secondary,
    primary,
    open: (next) => update({ ...next, open: true }),
    close: (next) => update({ ...next, open: false }),
  };
}

/** A keydown of `key` on `element`, cancelable and bubbling. */
function press(element, key, init = {}) {
  const { KeyboardEvent } = element.ownerDocument.defaultView;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

/** A focused opener button beside `target`, as the control a companion opens its dialog from. */
function focusedOpener(target) {
  const opener = companionElement(target.parentElement, 'button');
  opener.focus();
  return opener;
}

const appTarget = () => fabricateTarget(shells, 'fabricate fabricate-app');

describe('trapFocus on the published Modal', () => {
  it('moves focus in as it opens, marks it aria-modal, wraps Tab, and returns focus to the opener a frame after an update closes it', async () => {
    const target = appTarget();
    const opener = focusedOpener(target);
    const modal = closedModal({ trapFocus: true }, { target });
    modal.open();
    const dialog = dialogNamed(REQUIRED.title);
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.ok(document.activeElement === closeOf(dialog), 'focus enters on the first control');
    modal.primary.focus();
    assert.equal(press(modal.primary, 'Tab').defaultPrevented, true, 'Tab from the last wraps');
    assert.ok(document.activeElement === closeOf(dialog), 'to the close control');
    press(closeOf(dialog), 'Tab', { shiftKey: true });
    assert.ok(document.activeElement === modal.primary, 'Shift+Tab from the first wraps back');
    modal.close();
    assert.ok(document.activeElement !== opener, 'focus is returned a frame later, not at once');
    await frame();
    assert.ok(document.activeElement === opener, 'focus returns to the opener');
    assert.deepEqual(modal.calls, [], 'no onClose');
  });

  it('owns every key pressed in the dialog: its host hears it and no window listener does', () => {
    const target = appTarget();
    focusedOpener(target);
    const modal = closedModal({ trapFocus: true }, { target });
    modal.open();
    const heard = [];
    const view = document.defaultView;
    const onHost = () => {
      heard.push('host');
    };
    const onWindow = () => {
      heard.push('window');
    };
    target.parentElement.addEventListener('keydown', onHost);
    view.addEventListener('keydown', onWindow);
    try {
      press(modal.search, 'a');
    } finally {
      target.parentElement.removeEventListener('keydown', onHost);
      view.removeEventListener('keydown', onWindow);
    }
    assert.deepEqual(heard, ['host']);
  });

  it('counts the text "false" as true, and traps nothing once an update that opens it drops the key', async () => {
    const target = appTarget();
    const opener = focusedOpener(target);
    const modal = closedModal({ trapFocus: 'false' }, { target });
    modal.open();
    assert.equal(dialogNamed(REQUIRED.title).getAttribute('aria-modal'), 'true', 'not coerced');
    modal.close({ trapFocus: undefined });
    await frame();
    opener.focus();
    modal.open({ trapFocus: undefined });
    const dialog = dialogNamed(REQUIRED.title);
    assert.ok(!dialog.hasAttribute('aria-modal'), 'no aria-modal without the key');
    assert.ok(document.activeElement === opener, 'focus stays on the opener');
    assert.equal(press(modal.primary, 'Tab').defaultPrevented, false, 'Tab is left to the browser');
  });
});

describe('initialFocus on the published Modal', () => {
  it('focuses the first control at or inside the element whose data-initial-focus it equals', () => {
    const target = appTarget();
    focusedOpener(target);
    const modal = closedModal({ trapFocus: true, initialFocus: 'rows' }, { target });
    modal.search.setAttribute('data-initial-focus', 'search');
    modal.row.setAttribute('data-initial-focus', 'rows');
    modal.open();
    assert.ok(document.activeElement === modal.row, 'the marked row, past an earlier other mark');
  });

  /** Moves `modal`'s two footer buttons into a wrapper of the companion's own, marked `name`. */
  function markedActions(modal, name) {
    const wrapper = companionElement(modal.handle.slot('footer'), 'div', {
      'data-initial-focus': name,
    });
    wrapper.append(modal.secondary, modal.primary);
    return wrapper;
  }

  it('reaches a control inside a marked element of the companion’s own', () => {
    const target = appTarget();
    focusedOpener(target);
    const modal = closedModal({ trapFocus: true, initialFocus: 'actions' }, { target });
    markedActions(modal, 'actions');
    modal.open();
    assert.ok(document.activeElement === modal.secondary, 'the first control in the mark');
  });

  it('passes over a matching element that holds no control to the next one that does', () => {
    const target = appTarget();
    focusedOpener(target);
    const modal = closedModal({ trapFocus: true, initialFocus: 'actions' }, { target });
    const note = companionElement(modal.handle.slot('body'), 'p', {
      'data-initial-focus': 'actions',
    });
    note.textContent = 'Choose who takes it on.';
    markedActions(modal, 'actions');
    modal.open();
    assert.ok(document.activeElement === modal.secondary, 'the first mark holding a control');
  });

  for (const [claim, value] of [
    ['a name no element is marked with', 'missing'],
    ['a selector, which is never read as one', 'input'],
    ['a malformed selector', 'a[b'],
    ['a value that is no string', 7],
  ]) {
    it(`falls back to the first control for ${claim}`, () => {
      const target = appTarget();
      focusedOpener(target);
      const modal = closedModal({ trapFocus: true, initialFocus: value }, { target });
      modal.search.setAttribute('data-initial-focus', 'search');
      modal.open();
      assert.ok(document.activeElement === closeOf(dialogNamed(REQUIRED.title)), 'close control');
    });
  }

  it('reads the key as the dialog opens, so an update that drops it focuses the first control next time', async () => {
    const target = appTarget();
    const opener = focusedOpener(target);
    const modal = closedModal({ trapFocus: true, initialFocus: 'search' }, { target });
    modal.search.setAttribute('data-initial-focus', 'search');
    modal.open();
    assert.ok(document.activeElement === modal.search);
    modal.close({ initialFocus: undefined });
    await frame();
    assert.ok(document.activeElement === opener);
    modal.open({ initialFocus: undefined });
    assert.ok(document.activeElement === closeOf(dialogNamed(REQUIRED.title)), 'close control');
  });

  it('moves no focus without trapFocus', () => {
    const target = appTarget();
    const opener = focusedOpener(target);
    const modal = closedModal({ initialFocus: 'search' }, { target });
    modal.search.setAttribute('data-initial-focus', 'search');
    modal.open();
    assert.ok(document.activeElement === opener);
  });
});

describe('footerLayout on the published Modal', () => {
  const footerOf = (dialog) => dialog.querySelector('.manager-modal-footer');

  it('lays the footer out as a grid of equal columns for equal, and an update to end puts the end rail back', () => {
    const modal = closedModal({ footerLayout: 'equal' }, { target: appTarget() });
    modal.open();
    const footer = footerOf(dialogNamed(REQUIRED.title));
    assert.ok(footer.classList.contains('is-equal'));
    const equal = getComputedStyle(footer);
    assert.equal(equal.display, 'grid', 'a grid, so the slot wrappers draw no box of their own');
    assert.equal(equal.gridAutoFlow, 'column');
    assert.equal(equal.gridAutoColumns, 'minmax(0, 1fr)');
    modal.open({ footerLayout: 'end' });
    assert.ok(!footer.classList.contains('is-equal'));
    assert.equal(getComputedStyle(footer).display, 'flex');
    assert.equal(getComputedStyle(footer).justifyContent, 'flex-end');
  });

  it('draws the end rail for a value outside the set', () => {
    const modal = closedModal({ footerLayout: 'stretch' }, { target: appTarget() });
    modal.open();
    assert.ok(!footerOf(dialogNamed(REQUIRED.title)).classList.contains('is-equal'));
  });
});

describe('a published Modal mounted in a companion root with its own stacking context', () => {
  /** A Studio-like root with `isolation: isolate` inside a Fabricate window, holding `target`. */
  function isolatedRoot() {
    const target = appTarget();
    const app = target.parentElement;
    const root = companionElement(app, 'section', { 'data-companion-root': '' });
    root.style.position = 'relative';
    root.style.isolation = 'isolate';
    root.append(target);
    assert.equal(getComputedStyle(root).isolation, 'isolate');
    return { app, root, target };
  }

  async function assertTrappedAndReturned(modal, opener) {
    const dialog = dialogNamed(REQUIRED.title);
    assert.ok(dialog.contains(document.activeElement), 'focus is inside the dialog');
    modal.primary.focus();
    press(modal.primary, 'Tab');
    assert.ok(document.activeElement === closeOf(dialog), 'Tab wraps inside it');
    modal.close();
    await frame();
    assert.ok(document.activeElement === opener, 'focus returns to the opener');
  }

  it('draws the dialog in the app root, outside the isolated root, traps focus and returns it', async () => {
    const { app, root, target } = isolatedRoot();
    const opener = focusedOpener(target);
    const modal = closedModal({ trapFocus: true, initialFocus: 'search' }, { target });
    modal.search.setAttribute('data-initial-focus', 'search');
    modal.open();
    const dialog = dialogNamed(REQUIRED.title);
    assert.ok(!root.contains(dialog), 'portaled out of the isolated root');
    assert.ok(dialog.parentElement.parentElement === app, 'into the app root above it');
    assert.ok(document.activeElement === modal.search, 'onto the marked field');
    await assertTrappedAndReturned(modal, opener);
  });

  it('draws the dialog in an overlay host inside the isolated root, outside target, traps focus and returns it', async () => {
    const { root, target } = isolatedRoot();
    const overlayHost = companionElement(root, 'div', { 'data-companion-overlays': '' });
    overlayHost.style.position = 'relative';
    const opener = focusedOpener(target);
    const modal = closedModal({ trapFocus: true }, { target, overlayHost });
    modal.open();
    const dialog = dialogNamed(REQUIRED.title);
    assert.ok(!target.contains(dialog), 'portaled out of target');
    assert.ok(dialog.parentElement.parentElement === overlayHost, 'into the in-panel host');
    await assertTrappedAndReturned(modal, opener);
  });

  it('leaves focus in a trapped dialog opened in the frame another closed, never on the first one’s opener', async () => {
    const { target } = isolatedRoot();
    const opener = focusedOpener(target);
    const api = ui();
    const first = closedModal({ trapFocus: true, title: 'First' }, { target, api });
    const secondTarget = companionElement(target.parentElement, 'div');
    const second = closedModal({ trapFocus: true, title: 'Second' }, { target: secondTarget, api });
    first.open();
    assert.ok(dialogNamed('First').contains(document.activeElement));
    first.close();
    second.open();
    const next = dialogNamed('Second');
    assert.ok(next.contains(document.activeElement), 'the second dialog took focus');
    await frame();
    assert.ok(next.contains(document.activeElement), 'and keeps it a frame later');
    assert.ok(document.activeElement !== opener, 'the first one’s opener is not focused');
  });
});
