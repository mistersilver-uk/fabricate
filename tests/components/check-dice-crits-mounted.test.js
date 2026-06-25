import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Real en.json so the tests assert LOCALIZED copy resolves — not the component's
// inline text() fallback (which would mask a missing or renamed key). The crit
// editor is keyed under FABRICATE.Admin.Manager.Checks.Crafting.
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}
function interpolate(template, data) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(data?.[name] ?? ''));
}

// Use the shared mounted-component harness; do not re-inline compile/mount
// boilerplate (it duplicates the other mount tests and trips the duplication gate).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-crit-dice-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/craftingCheckExpression.js'
  ],
  compiledModules: ['src/ui/svelte/apps/manager/checks/CheckDiceCrits.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckDiceCrits.svelte'
});

before(async () => {
  await harness.setup();
  // Replace the harness's identity localize with one backed by en.json so the
  // component's text()/formatText() resolve real copy (and the fallback is never
  // silently exercised).
  globalThis.game.i18n.localize = (key) => {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  };
  globalThis.game.i18n.format = (key, data) => {
    const value = lookup(key);
    return typeof value === 'string' ? interpolate(value, data) : key;
  };
});
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('CheckDiceCrits (mounted): modified-pool gating + multi-die label', () => {
  it('renders no crit group and the localized modified-pool hint for a modified pool', async () => {
    const root = await harness.mount({ rollFormula: '2d20kh1', diceCrits: [] });
    assert.equal(
      root.querySelector('[data-crit-group]'),
      null,
      'a modified pool offers no crit group'
    );
    assert.equal(root.querySelector('[data-add-crit]'), null, 'no Add control for a modified pool');
    const hint = root.querySelector('[data-crit-modified-pool-hint]');
    assert.ok(hint, 'the modified-pool hint renders');
    assert.equal(
      hint.textContent.trim(),
      en.FABRICATE.Admin.Manager.Checks.Crafting.CritModifiedPoolHint,
      'the hint resolves to the localized copy, not the fallback'
    );
  });

  it('renders crit groups for plain single- and multi-die formulas', async () => {
    const root = await harness.mount({ rollFormula: '1d20+2d6', diceCrits: [] });
    assert.deepEqual(
      [...root.querySelectorAll('[data-crit-group]')].map((g) => g.getAttribute('data-crit-group')),
      ['1d20', '2d6'],
      'both plain dice render groups'
    );
    assert.equal(
      root.querySelector('[data-crit-modified-pool-hint]'),
      null,
      'no modified-pool hint when all dice are plain'
    );
  });

  it('surfaces a persisted crit orphaned by a modified pool under a removal notice', async () => {
    // A crit authored against 2d20kh1 was stored under the stripped key `2d20`.
    const root = await harness.mount({
      rollFormula: '2d20kh1',
      diceCrits: [{ id: 'orphan', die: '2d20', raw: 20, success: true, breakTools: false }]
    });
    assert.equal(
      root.querySelector('[data-crit-group]'),
      null,
      'the orphaned crit does NOT render as an editable group'
    );
    const notice = root.querySelector('[data-crit-orphaned-notice]');
    assert.ok(notice, 'the orphaned-crit removal notice renders (not a silent empty group)');
    assert.equal(
      notice.textContent.trim(),
      en.FABRICATE.Admin.Manager.Checks.Crafting.CritOrphanedNotice,
      'the notice resolves to the localized copy'
    );
    assert.ok(
      root.querySelector('[data-crit-orphaned-row="orphan"]'),
      'the orphaned crit row is shown so the GM sees what will be removed'
    );
  });

  it('keeps single-face copy for N=1 and adds the group-sum hint + encoded aria for N>1', async () => {
    const single = await harness.mount({ rollFormula: '1d20', diceCrits: [] });
    assert.ok(single.querySelector('[data-crit-group="1d20"]'), '1d20 renders a group');
    assert.equal(
      single.querySelector('[data-crit-multi-hint]'),
      null,
      'a single-die group shows no group-sum hint'
    );
    harness.remount();

    const multi = await harness.mount({
      rollFormula: '2d6',
      diceCrits: [{ id: 'm1', die: '2d6', raw: 7, success: true, breakTools: false }]
    });
    const hint = multi.querySelector('[data-crit-multi-hint]');
    assert.ok(hint, 'a multi-die group renders the group-sum hint line');
    const expectedHint = interpolate(
      en.FABRICATE.Admin.Manager.Checks.Crafting.CritMultiDieHint,
      { die: '2d6', min: 2, max: 12 }
    );
    assert.equal(hint.textContent.trim(), expectedHint, 'the hint resolves to localized copy');
    const rawInput = multi.querySelector('[data-crit-row="m1"] [data-crit-raw]');
    const expectedAria = interpolate(
      en.FABRICATE.Admin.Manager.Checks.Crafting.CritRawMultiAria,
      { die: '2d6', min: 2, max: 12 }
    );
    assert.equal(
      rawInput.getAttribute('aria-label'),
      expectedAria,
      'the multi-die input aria-label encodes the die and its total range'
    );
    assert.equal(rawInput.getAttribute('min'), '2', 'the input is still clamped to [N, N*S]');
    assert.equal(rawInput.getAttribute('max'), '12');
  });

  it('shows the localized NoDice copy (not the inline fallback) when the formula has no dice', async () => {
    const root = await harness.mount({ rollFormula: '5', diceCrits: [] });
    const empty = root.querySelector('[data-dice-empty]');
    assert.ok(empty, 'the empty state renders');
    assert.equal(
      empty.textContent.trim(),
      en.FABRICATE.Admin.Manager.Checks.Crafting.NoDice,
      'NoDice resolves to the localized "...in this expression." copy'
    );
  });
});
