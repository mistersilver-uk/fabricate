import assert from 'node:assert/strict';
import test from 'node:test';

import { confirmDialog as compatConfirmDialog } from '../../src/ui/foundryCompat.js';
import { confirmDialog as bridgeConfirmDialog } from '../../src/ui/svelte/util/foundryBridge.js';
import {
  choiceDialog,
  confirmDialog,
  renderDialog,
} from '../../src/ui/svelte/util/foundryDialogs.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';

/** A DialogV2 that records every constructed bag and render, and optionally "clicks" on render. */
function capturingDialogV2({ click } = {}) {
  const captured = [];
  const renders = [];
  class FakeDialogV2 {
    constructor(options) {
      this.options = options;
      captured.push(options);
    }
    render(force) {
      renders.push(force);
      if (click === 'close') this.options.close?.();
      else if (click) this.options.buttons.find((button) => button.action === click)?.callback?.();
      return this;
    }
  }
  return { FakeDialogV2, captured, renders };
}

test('confirmDialog calls DialogV2.confirm and returns result', async () => {
  const env = installFoundryBridgeEnv({
    dialog: { confirm: async (options) => ({ confirmed: true, options }) },
  });

  const result = await confirmDialog({ title: 'Are you sure?' });

  assert.equal(result.confirmed, true);
  assert.equal(result.options.window.title, 'Are you sure?');
  env.restore();
});

test('confirmDialog without DialogV2 returns false', async () => {
  const env = installFoundryBridgeEnv();
  delete globalThis.foundry;

  assert.equal(await confirmDialog({ title: 'Test' }), false);
  env.restore();
});

test('renderDialog constructs DialogV2 and calls render(true)', () => {
  const { FakeDialogV2, renders } = capturingDialogV2();
  const env = installFoundryBridgeEnv({ dialog: FakeDialogV2 });

  const result = renderDialog({
    title: 'Hello',
    buttons: [{ action: 'ok', label: 'OK', default: true }],
  });

  assert.ok(result instanceof FakeDialogV2);
  assert.deepEqual(renders, [true]);
  env.restore();
});

test('renderDialog without DialogV2 returns null', () => {
  const env = installFoundryBridgeEnv();
  delete globalThis.foundry;

  assert.equal(renderDialog({ title: 'Test' }), null);
  env.restore();
});

test('renderDialog namespaces the dialog (.fabricate-dialog) and gives it a sensible width', () => {
  const { FakeDialogV2, captured } = capturingDialogV2();
  const env = installFoundryBridgeEnv({ dialog: FakeDialogV2 });

  renderDialog({ title: 'Hello', buttons: [{ action: 'ok', label: 'OK', default: true }] });

  assert.ok(captured[0].classes.includes('fabricate'), 'carries the .fabricate root class');
  assert.ok(
    captured[0].classes.includes('fabricate-dialog'),
    'carries the .fabricate-dialog class for button CSS'
  );
  assert.ok(Number(captured[0].position?.width) >= 360, 'default width fits a multi-button row');
  env.restore();
});

test('renderDialog respects an explicit caller width + does not duplicate classes', () => {
  const { FakeDialogV2, captured } = capturingDialogV2();
  const env = installFoundryBridgeEnv({ dialog: FakeDialogV2 });

  renderDialog({ title: 'Hello', classes: ['fabricate'], position: { width: 600 } });

  assert.equal(captured[0].position.width, 600, 'explicit width is preserved');
  assert.equal(
    captured[0].classes.filter((name) => name === 'fabricate').length,
    1,
    'no duplicate fabricate class'
  );
  env.restore();
});

const CHOICES = [
  { action: 'save', label: 'Save' },
  { action: 'discard', label: 'Discard' },
  { action: 'cancel', label: 'Keep Editing' },
];

for (const action of ['save', 'discard', 'cancel']) {
  test(`choiceDialog resolves '${action}' when that button is clicked`, async () => {
    const { FakeDialogV2 } = capturingDialogV2({ click: action });
    const env = installFoundryBridgeEnv({ dialog: FakeDialogV2 });

    const result = await choiceDialog({
      title: 'T',
      content: '<p>C</p>',
      choices: CHOICES,
      defaultAction: 'save',
    });

    assert.equal(result, action);
    env.restore();
  });
}

test("choiceDialog resolves 'cancel' when the dialog is closed", async () => {
  const { FakeDialogV2 } = capturingDialogV2({ click: 'close' });
  const env = installFoundryBridgeEnv({ dialog: FakeDialogV2 });

  const result = await choiceDialog({ title: 'T', content: '<p>C</p>', choices: CHOICES });

  assert.equal(result, 'cancel');
  env.restore();
});

test("choiceDialog resolves 'cancel' when DialogV2 is unavailable", async () => {
  const env = installFoundryBridgeEnv();
  delete globalThis.foundry;

  const result = await choiceDialog({ title: 'T', content: '<p>C</p>', choices: CHOICES });

  assert.equal(result, 'cancel');
  env.restore();
});

test('choiceDialog marks the defaultAction button as default', async () => {
  const { FakeDialogV2, captured } = capturingDialogV2({ click: 'close' });
  const env = installFoundryBridgeEnv({ dialog: FakeDialogV2 });

  await choiceDialog({
    title: 'T',
    content: '<p>C</p>',
    choices: CHOICES,
    defaultAction: 'discard',
  });

  const defaults = captured[0].buttons.filter((button) => button.default).map((b) => b.action);
  assert.deepEqual(defaults, ['discard']);
  env.restore();
});

// The confirm seam's OPTIONS SHAPE (issue 1154), pinned across BOTH wrappers: the manager app wires
// foundryCompat and the player app wires foundryBridge, so they are one seam over one primitive.
const SEAMS = [
  ['foundryCompat', compatConfirmDialog],
  ['foundryBridge', bridgeConfirmDialog],
];

/** Captures exactly what reaches `DialogV2.confirm`, which is the thing under test. */
function captureConfirmOptions() {
  const received = [];
  const env = installFoundryBridgeEnv({
    dialog: {
      confirm: async (options) => {
        received.push(options);
        return true;
      },
    },
  });
  return { received, env };
}

for (const [seam, seamConfirmDialog] of SEAMS) {
  test(`${seam} confirmDialog maps a top-level title onto window.title`, async () => {
    const { received, env } = captureConfirmOptions();
    await seamConfirmDialog({ title: 'Delete Alchemy?', content: '<p>Gone for good.</p>' });
    env.restore();

    assert.equal(received[0].window?.title, 'Delete Alchemy?');
  });

  test(`${seam} confirmDialog keeps an explicit window.title`, async () => {
    const { received, env } = captureConfirmOptions();
    await seamConfirmDialog({
      title: 'ignored',
      window: { title: 'Delete Alchemy?', icon: 'fa-x' },
    });
    env.restore();

    assert.equal(received[0].window.title, 'Delete Alchemy?');
    assert.equal(received[0].window.icon, 'fa-x', 'the rest of the window bag survives');
  });

  test(`${seam} confirmDialog wraps a function yes/no so its callback is merged`, async () => {
    const { received, env } = captureConfirmOptions();
    await seamConfirmDialog({ yes: () => 'affirmed', no: () => 'declined' });
    env.restore();

    const { yes, no } = received[0];
    assert.equal(typeof yes, 'object', 'a bare function contributes no own enumerable keys');
    assert.equal(yes.callback(), 'affirmed');
    assert.equal(typeof no, 'object');
    assert.equal(no.callback(), 'declined');
  });

  test(`${seam} confirmDialog leaves an object yes/no untouched`, async () => {
    const { received, env } = captureConfirmOptions();
    const yes = { label: 'Delete', icon: 'fa-solid fa-trash', callback: () => true };
    await seamConfirmDialog({ yes });
    env.restore();

    assert.equal(received[0].yes, yes);
  });

  test(`${seam} confirmDialog does not invent buttons`, async () => {
    const { received, env } = captureConfirmOptions();
    await seamConfirmDialog({ title: 'Delete Alchemy?' });
    env.restore();

    assert.equal(
      Object.hasOwn(received[0], 'buttons'),
      false,
      'an injected buttons array would unshift into a THREE-button confirm'
    );
  });

  test(`${seam} confirmDialog does not mutate the caller's options`, async () => {
    const { received, env } = captureConfirmOptions();
    const options = { title: 'Delete Alchemy?', yes: () => true };
    await seamConfirmDialog(options);
    env.restore();

    assert.equal(Object.hasOwn(options, 'window'), false, 'the caller keeps its own bag');
    assert.equal(typeof options.yes, 'function');
    assert.notEqual(received[0], options);
  });

  test(`${seam} confirmDialog returns false when DialogV2 is unavailable`, async () => {
    const env = installFoundryBridgeEnv();
    const result = await seamConfirmDialog({ title: 'Delete Alchemy?' });
    env.restore();

    assert.equal(result, false);
  });
}
