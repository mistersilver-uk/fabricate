/** `InlineRenameField` mounted, both branches (issue 1521): commit, revert and reseed. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const FIELD_PATH = 'src/ui/svelte/apps/manager/InlineRenameField.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-inline-rename-field-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: ['src/ui/svelte/components/Field.svelte', FIELD_PATH],
  componentPath: FIELD_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const BRANCHES = [
  {
    labelled: false,
    ownName: 'Party name',
    hook: '[data-manager-party-name-field]',
    input: (root) =>
      root.querySelector(':scope input.manager-party-name-input[data-manager-party-name-field]'),
  },
  {
    labelled: true,
    ownName: 'Realm name',
    hook: '[data-manager-realm-name-field]',
    input: (root) =>
      root.querySelector(':scope .manager-realm-name-field[data-manager-realm-name-field] input'),
  },
];

/** Mount one branch over `name`, focus its input, and record every rename it reports. */
async function mountField(branch, { name = 'Wardens', label = 'Caller name' } = {}) {
  const renamed = [];
  const root = await harness.mount({
    name,
    label,
    labelled: branch.labelled,
    onRename: (next) => {
      renamed.push(next);
    },
  });
  const input = branch.input(root);
  assert.ok(Boolean(input), 'the branch renders its input under its own class and hook');
  input.focus();
  assert.ok(document.activeElement === input, 'the case starts focused on the input');
  return { root, input, renamed };
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

function press(input, key) {
  input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  flushSync();
}

for (const branch of BRANCHES) {
  describe(`InlineRenameField, ${branch.labelled ? 'labelled' : 'bare'}`, () => {
    for (const [label, name] of [
      ['Caller name', 'Caller name'],
      ['', branch.ownName],
    ]) {
      it(`names the input ${JSON.stringify(name)} from a label of ${JSON.stringify(label)}`, async () => {
        const { root, input } = await mountField(branch, { label });
        assert.equal(input.getAttribute('aria-label'), name);
        assert.ok(Boolean(root.querySelector(branch.hook)), 'the branch hook is present');
        const caption = root.querySelector(':scope .manager-realm-name-field > span');
        assert.equal(caption?.textContent ?? null, branch.labelled ? name : null);
      });
    }

    it('commits the trimmed text on Enter and leaves the input', async () => {
      const { input, renamed } = await mountField(branch);
      type(input, '  Vanguard  ');
      press(input, 'Enter');
      assert.ok(document.activeElement !== input, 'Enter blurs the input');
      assert.deepEqual(renamed, ['Vanguard']);
    });

    it('reverts on Escape without renaming, and leaves the input', async () => {
      const { input, renamed } = await mountField(branch);
      type(input, 'Vanguard');
      press(input, 'Escape');
      assert.ok(document.activeElement !== input, 'Escape blurs the input');
      assert.deepEqual(renamed, []);
      assert.equal(input.value, 'Wardens');
    });

    for (const [label, value] of [
      ['empty', ''],
      ['whitespace-only', ' '.repeat(3)],
    ]) {
      it(`reverts an ${label} name without renaming`, async () => {
        const { input, renamed } = await mountField(branch);
        type(input, value);
        press(input, 'Enter');
        assert.ok(document.activeElement !== input, 'Enter blurs the input');
        assert.deepEqual(renamed, []);
        assert.equal(input.value, 'Wardens');
      });
    }

    it('keeps the draft while typing', async () => {
      const { input, renamed } = await mountField(branch);
      type(input, 'Vang');
      flushSync();
      assert.equal(input.value, 'Vang', 'a flush does not reseed over the edit in progress');
      assert.deepEqual(renamed, []);
    });

    it('reseeds from an upstream rename', async () => {
      const { input } = await mountField(branch);
      await harness.setProps({ name: 'Renamed upstream' });
      assert.equal(input.value, 'Renamed upstream');
    });
  });
}
