/**
 * Unit coverage for the on-drop GM environment-pick dialog (`environmentDialog.js`).
 *
 * The pure resolution precedence decides WHEN a dialog is needed; this module is
 * the thin Foundry `DialogV2` edge that presents it. These tests drive
 * `promptDropEnvironment` against a faked
 * `globalThis.foundry.applications.api.DialogV2`, asserting the empty-list and
 * DialogV2-unavailable guards return null, the default-preselect logic, the
 * HTML-escaping of option labels, and that a cancel/close resolves to null.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { promptDropEnvironment } from '../../src/canvas/environmentDialog.js';

// --- DialogV2 fake scaffolding ---------------------------------------------

function snapshotFoundry() {
  return globalThis.foundry;
}
function restoreFoundry(saved) {
  if (saved === undefined) delete globalThis.foundry;
  else globalThis.foundry = saved;
}

/**
 * Install a fake `DialogV2.prompt` that captures the config it is called with and
 * resolves with `resolveWith` (or rejects when `reject` is true, mimicking a
 * cancel/close with `rejectClose:false` turned off).
 *
 * @param {object} opts
 * @param {string|null} [opts.resolveWith]  The value `DialogV2.prompt` resolves to.
 * @param {boolean} [opts.reject=false]      Reject instead (cancel/close).
 * @param {boolean} [opts.available=true]    Whether DialogV2.prompt exists at all.
 * @returns {{ calls: object[] }}
 */
function installFakeDialog({ resolveWith = null, reject = false, available = true } = {}) {
  const calls = [];
  const prompt = available
    ? async (config) => {
      calls.push(config);
      if (reject) throw new Error('cancelled');
      // Mirror production: the ok.callback derives the value from the form; here
      // we simulate that the GM picked `resolveWith`.
      return resolveWith;
    }
    : undefined;
  globalThis.foundry = { applications: { api: { DialogV2: available ? { prompt } : {} } } };
  return { calls };
}

const ENVS = [
  { id: 'env-forest', name: 'Forest' },
  { id: 'env-cave', name: 'Cave' }
];

// --- guards -----------------------------------------------------------------

test('returns null when the environment list is empty', async () => {
  const saved = snapshotFoundry();
  try {
    const { calls } = installFakeDialog({ resolveWith: 'env-forest' });
    const result = await promptDropEnvironment({ environments: [] });
    assert.equal(result, null);
    assert.equal(calls.length, 0, 'the dialog is never opened with no environments');
  } finally {
    restoreFoundry(saved);
  }
});

test('returns null when DialogV2 is unavailable', async () => {
  const saved = snapshotFoundry();
  try {
    installFakeDialog({ available: false });
    const result = await promptDropEnvironment({ environments: ENVS });
    assert.equal(result, null);
  } finally {
    restoreFoundry(saved);
  }
});

// --- default pre-select -----------------------------------------------------

test('pre-selects the provided defaultEnvironmentId when it is a real option', async () => {
  const saved = snapshotFoundry();
  try {
    const { calls } = installFakeDialog({ resolveWith: 'env-cave' });
    const result = await promptDropEnvironment({ environments: ENVS, defaultEnvironmentId: 'env-cave' });
    assert.equal(result, 'env-cave');
    const { content } = calls[0];
    assert.match(content, /<option value="env-cave" selected>Cave<\/option>/);
    assert.doesNotMatch(content, /<option value="env-forest" selected>/);
  } finally {
    restoreFoundry(saved);
  }
});

test('pre-selects the first option when no (or an unknown) default is given', async () => {
  const saved = snapshotFoundry();
  try {
    const { calls } = installFakeDialog({ resolveWith: 'env-forest' });
    await promptDropEnvironment({ environments: ENVS, defaultEnvironmentId: 'env-missing' });
    const { content } = calls[0];
    assert.match(content, /<option value="env-forest" selected>Forest<\/option>/);
    assert.doesNotMatch(content, /<option value="env-cave" selected>/);
  } finally {
    restoreFoundry(saved);
  }
});

// --- HTML-escaping ----------------------------------------------------------

test('HTML-escapes option ids and labels to prevent markup injection', async () => {
  const saved = snapshotFoundry();
  try {
    const { calls } = installFakeDialog({ resolveWith: 'x' });
    await promptDropEnvironment({
      environments: [{ id: 'a&b', name: '<script>"Bad" & risky</script>' }]
    });
    const { content } = calls[0];
    assert.match(content, /value="a&amp;b"/, 'the id is entity-escaped');
    assert.match(content, /&lt;script&gt;&quot;Bad&quot; &amp; risky&lt;\/script&gt;/, 'the label is entity-escaped');
    assert.doesNotMatch(content, /<script>/, 'no raw script tag reaches the dialog markup');
  } finally {
    restoreFoundry(saved);
  }
});

// --- cancel / close ---------------------------------------------------------

test('returns null when the GM cancels / closes the dialog', async () => {
  const saved = snapshotFoundry();
  try {
    installFakeDialog({ reject: true });
    const result = await promptDropEnvironment({ environments: ENVS });
    assert.equal(result, null);
  } finally {
    restoreFoundry(saved);
  }
});

test('returns null when the dialog resolves with an empty string (no choice)', async () => {
  const saved = snapshotFoundry();
  try {
    installFakeDialog({ resolveWith: '   ' });
    const result = await promptDropEnvironment({ environments: ENVS });
    assert.equal(result, null);
  } finally {
    restoreFoundry(saved);
  }
});

// --- localization seam ------------------------------------------------------

test('surfaces the Alt-override modifier hint in the dialog body', async () => {
  const saved = snapshotFoundry();
  try {
    const { calls } = installFakeDialog({ resolveWith: 'env-forest' });
    // Echo the key so we can assert the hint is wired through the localize seam.
    await promptDropEnvironment({ environments: ENVS, localize: (key) => key });
    const { content } = calls[0];
    assert.match(content, /FABRICATE\.Canvas\.Interactable\.DropModifierHint/);
  } finally {
    restoreFoundry(saved);
  }
});
