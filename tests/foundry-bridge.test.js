import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localize,
  confirmDialog,
  renderDialog,
  choiceDialog,
  notifyInfo,
  notifyWarn,
  notifyError,
  getDragEventData,
  viewScene
} from '../src/ui/svelte/util/foundryBridge.js';

// deepClone that preserves functions (button callbacks), like foundry.utils.deepClone
function preservingDeepClone(obj) {
  if (Array.isArray(obj)) return obj.map(preservingDeepClone);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const key of Object.keys(obj)) out[key] = preservingDeepClone(obj[key]);
    return out;
  }
  return obj;
}

// Builds a DialogV2 stub that "clicks" the button with the given action on render,
// or invokes close() when action is the literal 'close'.
function dialogClicking(action) {
  return class FakeDialogV2 {
    constructor(opts) { this.opts = opts; }
    render() {
      if (action === 'close') this.opts.close?.();
      else this.opts.buttons.find(b => b.action === action)?.callback?.();
      return this;
    }
  };
}

// --- viewScene ---

test('viewScene resolves the uuid and calls scene.view()', async () => {
  let viewed = 0;
  globalThis.fromUuid = async (uuid) => uuid === 'Scene.a' ? { view: async () => { viewed++; } } : null;
  const ok = await viewScene('Scene.a');
  assert.equal(ok, true);
  assert.equal(viewed, 1);
  delete globalThis.fromUuid;
});

test('viewScene is a no-op for empty uuid or missing resolver', async () => {
  assert.equal(await viewScene(''), false);
  globalThis.fromUuid = async () => null;
  assert.equal(await viewScene('Scene.missing'), false);
  delete globalThis.fromUuid;
});

// --- localize ---

test('localize(key) calls game.i18n.localize and returns result', () => {
  globalThis.game = { i18n: { localize: (k) => `localized:${k}`, format: () => 'bad' } };
  const result = localize('MY.Key');
  assert.equal(result, 'localized:MY.Key');
  delete globalThis.game;
});

test('localize(key, data) calls game.i18n.format and returns result', () => {
  const data = { name: 'foo' };
  const calls = [];
  globalThis.game = {
    i18n: {
      localize: () => 'bad',
      format: (k, d) => {
        calls.push({ key: k, data: d });
        return `formatted:${k}:${d.name}`;
      }
    }
  };
  const result = localize('MY.Key', data);
  assert.equal(result, 'formatted:MY.Key:foo');
  assert.deepEqual(calls, [{ key: 'MY.Key', data }]);
  delete globalThis.game;
});

test('localize without game.i18n returns key', () => {
  delete globalThis.game;
  const result = localize('MY.Key');
  assert.equal(result, 'MY.Key');
});

test('localize with data without game.i18n returns key', () => {
  delete globalThis.game;
  const result = localize('MY.Key', { name: 'foo' });
  assert.equal(result, 'MY.Key');
});

// --- confirmDialog ---

test('confirmDialog calls DialogV2.confirm and returns result (rejectClose:false default)', async () => {
  const opts = { title: 'Are you sure?' };
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          confirm: async (o) => ({ confirmed: true, options: o })
        }
      }
    }
  };
  const result = await confirmDialog(opts);
  // A dismiss must resolve (not reject) so callers treat it as cancel: the seam
  // defaults rejectClose:false, merged ahead of the caller's options.
  assert.deepEqual(result, { confirmed: true, options: { rejectClose: false, title: 'Are you sure?' } });
  delete globalThis.foundry;
});

test('confirmDialog lets a caller override the rejectClose default', async () => {
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          confirm: async (o) => ({ confirmed: true, options: o })
        }
      }
    }
  };
  const result = await confirmDialog({ title: 'Keep?', rejectClose: true });
  assert.equal(result.options.rejectClose, true, 'explicit rejectClose wins over the default');
  delete globalThis.foundry;
});

test('confirmDialog without DialogV2 returns false', async () => {
  delete globalThis.foundry;
  const result = await confirmDialog({ title: 'Test' });
  assert.equal(result, false);
});

// --- renderDialog ---

test('renderDialog constructs DialogV2 and calls render(true)', () => {
  const renderCalls = [];
  class FakeDialogV2 {
    constructor(opts) { this.opts = opts; }
    render(force) { renderCalls.push(force); return this; }
  }
  globalThis.foundry = {
    applications: { api: { DialogV2: FakeDialogV2 } },
    utils: { deepClone: (o) => JSON.parse(JSON.stringify(o)) }
  };
  const result = renderDialog({ title: 'Hello', buttons: [{ action: 'ok', label: 'OK', default: true }] });
  assert.ok(result instanceof FakeDialogV2);
  assert.deepEqual(renderCalls, [true]);
  delete globalThis.foundry;
});

test('renderDialog without DialogV2 returns null', () => {
  delete globalThis.foundry;
  const result = renderDialog({ title: 'Test' });
  assert.equal(result, null);
});

test('renderDialog namespaces the dialog (.fabricate-dialog) and gives it a sensible width', () => {
  let captured = null;
  class FakeDialogV2 {
    constructor(opts) { this.opts = opts; captured = opts; }
    render() { return this; }
  }
  globalThis.foundry = {
    applications: { api: { DialogV2: FakeDialogV2 } },
    utils: { deepClone: (o) => JSON.parse(JSON.stringify(o)) }
  };
  renderDialog({ title: 'Hello', buttons: [{ action: 'ok', label: 'OK', default: true }] });
  assert.ok(captured.classes.includes('fabricate'), 'carries the .fabricate root class');
  assert.ok(captured.classes.includes('fabricate-dialog'), 'carries the .fabricate-dialog class for button CSS');
  assert.ok(Number(captured.position?.width) >= 360, 'default width fits a multi-button row');
  delete globalThis.foundry;
});

test('renderDialog respects an explicit caller width + does not duplicate classes', () => {
  let captured = null;
  class FakeDialogV2 {
    constructor(opts) { this.opts = opts; captured = opts; }
    render() { return this; }
  }
  globalThis.foundry = {
    applications: { api: { DialogV2: FakeDialogV2 } },
    utils: { deepClone: (o) => JSON.parse(JSON.stringify(o)) }
  };
  renderDialog({ title: 'Hello', classes: ['fabricate'], position: { width: 600 } });
  assert.equal(captured.position.width, 600, 'explicit width is preserved');
  assert.equal(captured.classes.filter((c) => c === 'fabricate').length, 1, 'no duplicate fabricate class');
  delete globalThis.foundry;
});

// --- choiceDialog ---

const CHOICES = [
  { action: 'save', label: 'Save' },
  { action: 'discard', label: 'Discard' },
  { action: 'cancel', label: 'Keep Editing' }
];

for (const action of ['save', 'discard', 'cancel']) {
  test(`choiceDialog resolves '${action}' when that button is clicked`, async () => {
    globalThis.foundry = {
      applications: { api: { DialogV2: dialogClicking(action) } },
      utils: { deepClone: preservingDeepClone }
    };
    const result = await choiceDialog({ title: 'T', content: '<p>C</p>', choices: CHOICES, defaultAction: 'save' });
    assert.equal(result, action);
    delete globalThis.foundry;
  });
}

test('choiceDialog resolves \'cancel\' when the dialog is closed', async () => {
  globalThis.foundry = {
    applications: { api: { DialogV2: dialogClicking('close') } },
    utils: { deepClone: preservingDeepClone }
  };
  const result = await choiceDialog({ title: 'T', content: '<p>C</p>', choices: CHOICES });
  assert.equal(result, 'cancel');
  delete globalThis.foundry;
});

test('choiceDialog resolves \'cancel\' when DialogV2 is unavailable', async () => {
  delete globalThis.foundry;
  const result = await choiceDialog({ title: 'T', content: '<p>C</p>', choices: CHOICES });
  assert.equal(result, 'cancel');
});

test('choiceDialog marks the defaultAction button as default', async () => {
  let captured = null;
  globalThis.foundry = {
    applications: { api: { DialogV2: class { constructor(opts) { this.opts = opts; captured = opts; } render() { this.opts.close?.(); return this; } } } },
    utils: { deepClone: preservingDeepClone }
  };
  await choiceDialog({ title: 'T', content: '<p>C</p>', choices: CHOICES, defaultAction: 'discard' });
  const defaults = captured.buttons.filter(b => b.default).map(b => b.action);
  assert.deepEqual(defaults, ['discard']);
  delete globalThis.foundry;
});

// --- notifyInfo ---

test('notifyInfo calls ui.notifications.info', () => {
  const calls = [];
  globalThis.ui = { notifications: { info: (m) => calls.push(m) } };
  notifyInfo('hello info');
  assert.deepEqual(calls, ['hello info']);
  delete globalThis.ui;
});

test('notifyInfo without ui.notifications does not throw', () => {
  delete globalThis.ui;
  assert.doesNotThrow(() => notifyInfo('hello'));
});

// --- notifyWarn ---

test('notifyWarn calls ui.notifications.warn', () => {
  const calls = [];
  globalThis.ui = { notifications: { warn: (m) => calls.push(m) } };
  notifyWarn('hello warn');
  assert.deepEqual(calls, ['hello warn']);
  delete globalThis.ui;
});

test('notifyWarn without ui.notifications does not throw', () => {
  delete globalThis.ui;
  assert.doesNotThrow(() => notifyWarn('hello'));
});

// --- notifyError ---

test('notifyError calls ui.notifications.error', () => {
  const calls = [];
  globalThis.ui = { notifications: { error: (m) => calls.push(m) } };
  notifyError('hello error');
  assert.deepEqual(calls, ['hello error']);
  delete globalThis.ui;
});

test('notifyError without ui.notifications does not throw', () => {
  delete globalThis.ui;
  assert.doesNotThrow(() => notifyError('hello'));
});

// --- getDragEventData ---

test('getDragEventData calls TextEditor.getDragEventData and returns result', () => {
  const fakeEvent = { dataTransfer: { getData: () => '{"type":"Item"}' } };
  globalThis.foundry = {
    applications: {
      ux: {
        TextEditor: {
          implementation: {
            getDragEventData: (e) => ({ type: 'Item', event: e })
          }
        }
      }
    }
  };
  const result = getDragEventData(fakeEvent);
  assert.deepEqual(result, { type: 'Item', event: fakeEvent });
  delete globalThis.foundry;
});

test('getDragEventData without TextEditor returns null', () => {
  delete globalThis.foundry;
  const result = getDragEventData({});
  assert.equal(result, null);
});

test('getDragEventData without TextEditor falls back to text/plain JSON', () => {
  delete globalThis.foundry;
  const payload = { type: 'Item', uuid: 'Item.abc123' };
  const fakeEvent = {
    dataTransfer: { getData: (type) => type === 'text/plain' ? JSON.stringify(payload) : '' }
  };
  const result = getDragEventData(fakeEvent);
  assert.deepEqual(result, payload);
});

test('getDragEventData without TextEditor returns null for invalid JSON in text/plain', () => {
  delete globalThis.foundry;
  const fakeEvent = {
    dataTransfer: { getData: (type) => type === 'text/plain' ? 'not-valid-json' : '' }
  };
  const result = getDragEventData(fakeEvent);
  assert.equal(result, null);
});

test('getDragEventData without TextEditor returns null when dataTransfer is absent', () => {
  delete globalThis.foundry;
  const result = getDragEventData({ dataTransfer: null });
  assert.equal(result, null);
});

test('getDragEventData without TextEditor returns null when text/plain is empty', () => {
  delete globalThis.foundry;
  const fakeEvent = {
    dataTransfer: { getData: () => '' }
  };
  const result = getDragEventData(fakeEvent);
  assert.equal(result, null);
});

test('getDragEventData without TextEditor returns null when event is null', () => {
  delete globalThis.foundry;
  const result = getDragEventData(null);
  assert.equal(result, null);
});
