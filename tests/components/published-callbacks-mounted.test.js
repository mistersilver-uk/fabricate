/**
 * The published component seam's `callback` kind on Fabricate's real Svelte runtime (issue 2452),
 * drawing the test-only probe into bare companion-owned targets: the one forwarder a mount keeps,
 * the arguments it forwards and the copy it makes of each, its `untrack`, a callback that updates
 * or destroys its own mount from inside a press, and a mount destroyed while its click is still
 * being dispatched; then the published `Notice`'s dismissal through the shipped manifest, and the
 * focus its `onDismiss` holds. The refusals, the liveness check and the failure report are
 * `published-component-callbacks.test.js`'s, on the fake runtime.
 * Limit: happy-dom activates no button from a key, so a keyboard press here is `focus()` then
 * `click()`, and the Enter and Space presses are the View Lab's.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER as ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM as SEAM,
  companionTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-callbacks-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: [...PUBLISHED_COMPILED_MODULES, PROBE],
  componentPath: PROBE,
});

let runtime;
let components;
let createPublishedComponents;
let probe;
let reports;
let escaped;
let targets;
let stopRecording;

before(async () => {
  await harness.setup();
  ({ publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(ADAPTER));
  ({ createPublishedComponents } = await harness.loadRawModule(SEAM));
  probe = await harness.loadRuneModule(PROBE);
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
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** The probe mounted into a bare target, with what the suite reads of it. */
function mountProbe(props) {
  const seam = createPublishedComponents({
    table: [{ ...PROBE_ENTRY, component: probe.default }],
    ...runtime,
    isReady: () => true,
    report: (...args) => {
      reports.push(args);
    },
  });
  const target = companionTarget(targets);
  const handle = seam.publicApi.mount('PublishedProbe', { target, props });
  const paragraph = target.querySelector('.probe');
  return {
    seam,
    target,
    handle,
    button: () => target.querySelector('[data-probe-press]'),
    read: (name) => paragraph.getAttribute(`data-probe-${name}`),
  };
}

describe('a callback key on the real runtime', () => {
  it('passes onPing no argument, and onPick the one its entry states, as a plain copy', async () => {
    const ping = recorder();
    const pick = recorder();
    const { button, read } = mountProbe({ onPing: ping.record, onPick: pick.record });
    await settle();
    button().click();
    assert.deepEqual(ping.calls, [[]], 'called inside the click, with nothing');
    assert.equal(pick.calls.length, 2, 'the button, then the element around it');
    const [[received, ...extra], outer] = pick.calls;
    assert.deepEqual(extra, [], 'the second value the probe passes is not forwarded');
    assert.deepEqual(received, { id: 'probe', presses: 1 });
    assert.equal(Object.getPrototypeOf(received), Object.prototype);
    assert.deepEqual(outer, ['outer']);
    received.id = 'changed by the companion';
    await settle();
    assert.equal(read('picked'), 'probe', "a change to the copy does not reach the probe's object");
  });

  it('keeps one forwarder across updates, so nothing re-renders and a press calls the newest function', async () => {
    const first = recorder();
    const second = recorder();
    const { handle, button, read } = mountProbe({ label: 'Ping', onPing: first.record });
    await settle();
    const node = button();
    assert.equal(read('bindings'), '1');
    for (const onPing of [second.record, second.record]) {
      assert.equal(handle.update({ label: 'Ping', onPing }), true);
      await settle();
      assert.equal(read('bindings'), '1', 'the component saw no new function');
      assert.ok(button() === node, 'the same button node');
    }
    node.click();
    assert.deepEqual([first.calls.length, second.calls.length], [0, 1], 'the newest only');

    assert.equal(handle.update({ label: 'Ping' }), true);
    await settle();
    assert.equal(read('bindings'), '2', "omitted, so the component's own default applies");
    node.click();
    assert.equal(read('default-pings'), '0', 'not drawn before the flush');
    await settle();
    assert.equal(read('default-pings'), '1', "the probe's own default ran");
    assert.deepEqual(
      [first.calls.length, second.calls.length],
      [0, 1],
      'and no companion function'
    );

    assert.equal(handle.update({ label: 'Ping', onPing: first.record }), true);
    await settle();
    assert.equal(read('bindings'), '3', 'passed again');
    assert.ok(button() === node, 'still the same button node');
    node.click();
    assert.deepEqual([first.calls.length, second.calls.length], [1, 1]);
  });

  it('draws a key first passed by update, as it does a text key', async () => {
    const { calls, record } = recorder();
    const { handle, button } = mountProbe({});
    await settle();
    assert.equal(handle.update({ onPick: record }), true);
    await settle();
    button().click();
    assert.equal(calls.length, 2);
  });
});

describe('a callback called from an effect', () => {
  it('is not called again for an update that keeps pickAt, even one made from inside it', async () => {
    const held = { calls: 0, answers: [], pickAt: 1 };
    const onPick = () => {
      held.calls += 1;
      held.answers.push(held.handle.update({ pickAt: held.pickAt, onPick, text: 'Picked' }));
    };
    const { handle, target } = mountProbe({});
    held.handle = handle;
    assert.equal(handle.update({ pickAt: 1, onPick }), true);
    await settle();
    assert.equal(held.calls, 1, 'once for the one pickAt');
    assert.deepEqual(held.answers, [true]);
    assert.equal(target.querySelector('.probe-text').textContent, 'Picked', 'its update is drawn');
    held.pickAt = 2;
    assert.equal(handle.update({ pickAt: 2, onPick }), true);
    await settle();
    assert.equal(held.calls, 2, 'and once more for the next');
  });

  it('is not called again when a field of its argument changes later', async () => {
    const { calls, record } = recorder();
    const { handle, button } = mountProbe({});
    assert.equal(handle.update({ pickAt: 1, onPick: record }), true);
    await settle();
    assert.deepEqual(calls, [[{ id: 'probe', presses: 0 }]], 'the effect called it');
    button().click();
    assert.equal(calls.length, 3, 'the press and the element around it');
    await settle();
    assert.equal(
      calls.length,
      3,
      'the copy read every field under untrack, so the effect did not run again'
    );
    assert.deepEqual(calls[1], [{ id: 'probe', presses: 1 }]);
  });
});

describe('a callback that acts on its own mount from inside a press', () => {
  /**
   * A second probe left live through a clause, as a Fabricate window's own mount is in Foundry:
   * Svelte keeps its `document` click listener while any mount lives.
   */
  async function liveBeside() {
    const ping = recorder();
    const beside = mountProbe({ onPing: ping.record });
    await settle();
    return { ...beside, ping };
  }

  /** The mount beside a destroyed one is still live, and still takes a press. */
  function assertStillPressed({ handle, button, ping }) {
    assert.equal(handle.update({ onPing: ping.record }), true, 'the mount beside it is live');
    button().click();
    assert.equal(ping.calls.length, 1, 'and still takes a press');
  }

  it('has its update drawn on the next flush', async () => {
    const held = {};
    const { handle, target, button } = mountProbe({
      text: 'Held',
      onPing() {
        held.answer = held.handle.update({ text: 'Working' });
      },
    });
    held.handle = handle;
    await settle();
    button().click();
    assert.equal(held.answer, true);
    assert.equal(target.querySelector('.probe-text').textContent, 'Held', 'not inside the press');
    await settle();
    assert.equal(target.querySelector('.probe-text').textContent, 'Working');
  });

  it('empties its target on destroy, and the rest of the click calls nothing', async () => {
    const beside = await liveBeside();
    const pick = recorder();
    const held = {};
    const { seam, handle, target, button } = mountProbe({
      onPing() {
        held.handle.destroy();
      },
      onPick: pick.record,
    });
    held.handle = handle;
    await settle();
    button().click();
    assert.equal(target.childNodes.length, 0, 'empty when the press returns');
    assert.deepEqual(pick.calls, [], 'neither the button nor the element around it reached onPick');
    assert.equal(handle.update({}), false);
    assert.equal(seam.liveMountCount(), 0);
    assertStillPressed(beside);
    await settle();
  });

  it('is unharmed by a listener above the target that destroys the mount during the click', async () => {
    const beside = await liveBeside();
    const ping = recorder();
    const { seam, handle, target, button } = mountProbe({ onPing: ping.record });
    await settle();
    const destroyOnClick = () => handle.destroy();
    target.parentElement.addEventListener('click', destroyOnClick);
    button().click();
    target.parentElement.removeEventListener('click', destroyOnClick);
    assert.equal(ping.calls.length, 1, 'the press reached the companion before the listener');
    assert.equal(target.childNodes.length, 0);
    assert.equal(seam.liveMountCount(), 0);
    assertStillPressed(beside);
    await settle();
  });
});

describe("Notice's dismissal through the seam", () => {
  const REFUSAL = 'Fabricate | published components: ';
  const TITLE = 'Recipe saved.';
  const LABEL = 'Dismiss the saved-recipe notice';
  const DISMISSABLE = Object.freeze({ title: TITLE, dismissable: true, dismissLabel: LABEL });
  const WHEN = 'Notice requires a non-empty "dismissLabel" when "dismissable" is truthy';

  /** A dismissable notice in a bare target, beside a heading the companion owns, with its handle. */
  function mountNotice(onDismiss) {
    const report = (...args) => {
      reports.push(args);
    };
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report });
    const target = companionTarget(targets);
    const heading = target.ownerDocument.createElement('h2');
    heading.tabIndex = -1;
    target.before(heading);
    const held = { ui, target, heading, faults: [] };
    const onFault = (fault) => {
      held.faults.push(fault);
    };
    held.handle = ui.mount('Notice', { target, props: { ...DISMISSABLE, onDismiss }, onFault });
    held.dismiss = () => target.querySelector('[data-notice-dismiss]');
    return held;
  }

  /** Focuses the dismiss control and presses it, as a keyboard press reaches it here. */
  function press(held) {
    const button = held.dismiss();
    button.focus();
    button.click();
    return button;
  }

  it('calls onDismiss once, with no argument, inside the press while the control holds focus', async () => {
    const seen = [];
    const held = mountNotice((...args) => {
      seen.push({ args, focused: document.activeElement === held.dismiss() });
    });
    await settle();
    const button = press(held);
    assert.deepEqual(seen, [{ args: [], focused: true }], 'before the flush removed it');
    assert.ok(held.target.contains(button), 'still drawn when the press returns');
    await settle();
    assert.ok(!held.target.querySelector('.fab-notice'), 'the notice left the DOM');
    held.handle.destroy();
  });

  it('calls onDismiss once for a second press before the flush', async () => {
    const { calls, record } = recorder();
    const held = mountNotice(record);
    await settle();
    press(held).click();
    assert.equal(calls.length, 1, 'the second press calls nothing');
    await settle();
    held.handle.destroy();
  });

  it('dismisses nothing on Escape', async () => {
    const { calls, record } = recorder();
    const held = mountNotice(record);
    await settle();
    const button = held.dismiss();
    button.focus();
    const { KeyboardEvent } = held.target.ownerDocument.defaultView;
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    assert.equal(calls.length, 0);
    assert.ok(held.dismiss() === button, 'still drawn');
    held.handle.destroy();
  });

  it('leaves focus where onDismiss moved it, and its destroy there faults and reports nothing', async () => {
    const held = mountNotice(() => {
      held.heading.focus();
      held.handle.destroy();
    });
    await settle();
    press(held);
    assert.equal(held.target.childNodes.length, 0, 'empty when the press returns');
    assert.ok(document.activeElement === held.heading, 'focus is where the companion put it');
    await settle();
    assert.ok(document.activeElement === held.heading, 'and stays there after the flush');
    assert.deepEqual(held.faults, []);
    held.heading.remove();
  });

  it('reports an onDismiss that throws, and the notice is still dismissed', async () => {
    const failure = new Error('the companion focus move failed');
    const held = mountNotice(() => {
      throw failure;
    });
    await settle();
    press(held);
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Notice', 'onDismiss', failure]]);
    reports.length = 0;
    assert.ok(!held.target.querySelector('.fab-notice'), 'dismissed');
    assert.equal(held.handle.update({ ...DISMISSABLE, onDismiss: () => {} }), true, 'still live');
    assert.deepEqual(held.faults, []);
    held.handle.destroy();
  });

  it('validates an update after dismissal, draws nothing, and holds the target until destroy', async () => {
    const { record } = recorder();
    const held = mountNotice(record);
    await settle();
    press(held);
    await settle();
    assert.throws(() => held.handle.update({ ...DISMISSABLE, dismissLabel: '' }), {
      name: 'TypeError',
      message: REFUSAL + WHEN,
    });
    assert.equal(held.handle.update({ ...DISMISSABLE, tone: 'info', onDismiss: record }), true);
    await settle();
    assert.ok(!held.target.querySelector('.fab-notice'), 'final for the mount');
    const again = () => held.ui.mount('Notice', { target: held.target, props: { title: TITLE } });
    assert.throws(again, {
      name: 'TypeError',
      message: `${REFUSAL}target already holds a published component`,
    });
    held.handle.destroy();
    again().destroy();
  });

  it('refuses an update that drops dismissLabel, keeping the render and the onDismiss a press delivers', async () => {
    const { calls, record } = recorder();
    const held = mountNotice(record);
    await settle();
    const button = held.dismiss();
    const { title, dismissable } = DISMISSABLE;
    assert.throws(() => held.handle.update({ title, dismissable, onDismiss: () => {} }), {
      name: 'TypeError',
      message: REFUSAL + WHEN,
    });
    await settle();
    assert.ok(held.dismiss() === button, 'the same control');
    assert.equal(button.getAttribute('aria-label'), LABEL, 'the previous render');
    press(held);
    assert.equal(calls.length, 1, 'the previous onDismiss');
    await settle();
    held.handle.destroy();
  });
});
