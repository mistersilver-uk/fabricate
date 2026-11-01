/**
 * The published `Modal`'s `scrim` (issue 2859) on Fabricate's real Svelte runtime, through a fresh
 * seam registered with the adapter's own table: `'dim'` draws one hidden scrim with no `tabindex`
 * as the dialog's previous sibling in the container the overlay chain holds, every other value
 * draws none, an update adds and removes it while the dialog is open, it never sets `aria-modal`,
 * a press on it prevents its default and closes the dialog only as `closeOnOutsideClick` states, a
 * press on the scrim of a dimmed `Modal` mounted in another's slot closes only that one, and a
 * table that predates the key refuses it and leaves it out of `describe`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
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
const SCRIM_HOOK = '[data-manager-modal-scrim]';
const REQUIRED = Object.freeze({ title: 'Add a contributor', closeLabel: 'Close' });

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-modal-scrim-',
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

const report = (...args) => {
  reports.push(args);
};
const ui = () => shippedSeam({ ...seamParts, report });

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
  assert.ok(!document.querySelector(DIALOG_HOOK), 'no dialog outlives its mount');
  assert.ok(!document.querySelector(SCRIM_HOOK), 'no scrim outlives its mount');
  assert.deepEqual(reports, [], 'nothing was reported');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A dialog over `REQUIRED` and `props`; `update(next)` replaces every prop beside them. */
function mountModal(props = {}) {
  const closes = recorder();
  const base = { ...REQUIRED, open: true, onClose: closes.record };
  const target = fabricateTarget(shells, 'fabricate fabricate-app');
  const handle = ui().mount('Modal', { target, props: { ...base, ...props } });
  handles.push(handle);
  flushSync();
  return {
    closes,
    handle,
    update(next = {}) {
      handle.update({ ...base, ...next });
      flushSync();
    },
  };
}

const dialog = () => document.querySelector(DIALOG_HOOK);
const scrims = () => [...document.querySelectorAll(SCRIM_HOOK)];

/** A `mousedown` on `node` as a pointer press starts, and whether its default was prevented. */
function press(node) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  node.dispatchEvent(event);
  flushSync();
  return event.defaultPrevented;
}

describe('the published Modal scrim key', () => {
  it('lists scrim as an optional data key in describe', () => {
    assert.deepEqual(ui().describe('Modal').props.scrim, { kind: 'data', required: false });
  });

  it("draws one hidden scrim for 'dim', the dialog's previous sibling in the chain's container", () => {
    mountModal({ scrim: 'dim' });
    const [scrim, ...rest] = scrims();
    assert.deepEqual(rest, []);
    assert.equal(scrim.nextElementSibling, dialog(), 'the scrim sits just before the dialog');
    assert.equal(scrim.parentElement, dialog().parentElement);
    assert.equal(scrim.parentElement.style.display, 'contents', 'in the container the chain holds');
    assert.ok(!scrim.closest('[data-manager-modal-overlay]'), 'not in the marker in target');
    assert.equal(scrim.getAttribute('aria-hidden'), 'true');
    assert.equal(scrim.hasAttribute('tabindex'), false, 'no tabindex');
    assert.equal(scrim.hasAttribute('role'), false, 'no role');
    assert.equal(scrim.childNodes.length, 0, 'nothing to announce inside it');
  });

  it('draws none for any other value, coercing none of them', () => {
    const modal = mountModal({ scrim: 'none' });
    for (const scrim of ['none', 'dim ', 'DIM', 'Dim', '', 'true', true, 1, 0, null, {}, ['dim']]) {
      modal.update({ scrim });
      assert.deepEqual(scrims(), [], `${JSON.stringify(scrim)} draws no scrim`);
    }
    modal.update({});
    assert.deepEqual(scrims(), [], 'an absent key draws none');
    modal.update({ scrim: 'dim' });
    assert.equal(scrims().length, 1, 'the same mount draws one for dim');
  });

  it('adds and removes the scrim on an update while open, and draws none while closed', () => {
    const modal = mountModal({ scrim: 'none' });
    modal.update({ scrim: 'dim' });
    assert.equal(scrims()[0].nextElementSibling, dialog());
    modal.update({ scrim: 'none' });
    assert.deepEqual(scrims(), []);
    modal.update({ scrim: 'dim', open: false });
    assert.deepEqual(scrims(), [], 'a closed dialog draws no scrim');
    modal.update({ scrim: 'dim', open: true });
    assert.equal(scrims()[0].nextElementSibling, dialog(), 'reopening draws it again');
  });

  it('leaves aria-modal to trapFocus', () => {
    const modal = mountModal({ scrim: 'dim' });
    assert.equal(dialog().hasAttribute('aria-modal'), false, 'a dimmed dialog is not modal alone');
    modal.update({ scrim: 'dim', open: false });
    modal.update({ scrim: 'dim', trapFocus: true });
    assert.equal(dialog().getAttribute('aria-modal'), 'true');
  });
});

describe('a press on the published Modal scrim', () => {
  it('calls onClose once and prevents the press’s default, with closeOnOutsideClick by default', () => {
    const modal = mountModal({ scrim: 'dim', trapFocus: true });
    assert.equal(press(scrims()[0]), true, 'its default, moving focus, is prevented');
    assert.equal(modal.closes.calls.length, 1);
  });

  it('calls nothing with closeOnOutsideClick false', () => {
    const modal = mountModal({ scrim: 'dim', closeOnOutsideClick: false });
    assert.equal(press(scrims()[0]), true);
    assert.deepEqual(modal.closes.calls, []);
  });

  it('calls nothing for a press inside the dimmed dialog, whose outside presses are heard', () => {
    const modal = mountModal({ scrim: 'dim' });
    press(dialog().querySelector('.manager-modal-header'));
    assert.deepEqual(modal.closes.calls, []);
    press(document.body);
    assert.equal(modal.closes.calls.length, 1, 'an outside press is heard');
  });

  it('closes only the dimmed Modal mounted in another’s slot, not the one holding it', () => {
    const parent = mountModal({ body: true });
    const holder = document.createElement('div');
    parent.handle.slot('body').append(holder);
    const child = recorder();
    handles.unshift(
      ui().mount('Modal', {
        target: holder,
        props: { ...REQUIRED, title: 'Pick one', open: true, scrim: 'dim', onClose: child.record },
      })
    );
    flushSync();
    const [scrim, ...rest] = scrims();
    assert.deepEqual(rest, []);
    assert.equal(document.querySelectorAll(DIALOG_HOOK).length, 2, 'both dialogs are open');
    press(scrim);
    assert.equal(child.calls.length, 1, 'the dimmed Modal is asked to close');
    assert.deepEqual(parent.closes.calls, [], 'the Modal holding it is not');
  });
});

describe('a Fabricate whose table predates the scrim key', () => {
  const current = PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === 'Modal');
  const { scrim, ...earlier } = current.props;
  const older = () => {
    const instance = seamParts.createPublishedComponents({
      table: [{ ...current, props: earlier }],
      isReady: () => true,
      report,
    });
    instance.register({ ...seamParts.runtime, components: seamParts.components });
    return instance.publicApi;
  };

  it('describes no scrim and refuses it as a prop of Modal', () => {
    assert.ok(scrim, 'the shipped entry publishes scrim');
    assert.equal(Object.hasOwn(older().describe('Modal').props, 'scrim'), false);
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    assert.throws(
      () =>
        older().mount('Modal', {
          target,
          props: { ...REQUIRED, onClose: () => {}, scrim: 'dim' },
        }),
      { message: /"scrim" is not a prop of Modal/u }
    );
  });
});
