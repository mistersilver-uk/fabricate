import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Real en.json, so an assertion about copy fails on a missing or renamed key rather than
// silently passing against the component's inline fallback.
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-formula-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/config/modifierExpressionSuggestions.js',
    'src/config/gatheringCharacterModifierPresets.js',
    'src/utils/rollExpressionAverage.js',
  ],
  compiledModules: ['src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
});

before(async () => {
  await harness.setup();
  globalThis.game.i18n.localize = (key) => {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  };
});
after(() => harness.teardown());
afterEach(() => harness.remount());

const MODIFIERS = [
  { id: 'm-dex', name: 'Dexterity', icon: 'fas fa-feather' },
  { id: 'm-int', name: 'Intelligence', icon: 'fas fa-brain' },
];

describe('the formula card states what a roll actually resolves to (issue 1096)', () => {
  it('draws every applied modifier as a chip beside the authored formula', async () => {
    const target = await harness.mount({
      rollFormula: '1d20 + @abilities.int.mod',
      appliedModifiers: MODIFIERS,
      modifierPolicy: 'addAll',
    });

    const resolved = target.querySelector('[data-check-formula-resolved]');
    assert.ok(resolved, 'the WHAT ACTUALLY GETS ROLLED inset renders');
    assert.equal(
      resolved.querySelector('.manager-checks-formula-base').textContent.trim(),
      '1d20 + @abilities.int.mod',
      'the inset restates the AUTHORED formula, not a normalised one'
    );
    assert.deepEqual(
      [...resolved.querySelectorAll('[data-check-formula-modifier]')].map((chip) =>
        chip.textContent.trim()
      ),
      ['Dexterity', 'Intelligence'],
      'every applied modifier is a chip, in the order the resolver returned them'
    );
    assert.equal(
      resolved.querySelector('[data-check-formula-modifier="m-dex"] i').className,
      'fas fa-feather',
      "a chip carries its modifier's own glyph"
    );
  });

  it('names the combination rule in force rather than assuming one', async () => {
    for (const [policy, expected] of [
      ['addAll', 'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedAddAll'],
      ['highest', 'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedHighest'],
      ['playerPicks', 'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedPlayerPicks'],
    ]) {
      harness.remount();
      const target = await harness.mount({
        rollFormula: '1d20',
        appliedModifiers: MODIFIERS,
        modifierPolicy: policy,
      });
      const rule = target.querySelector(`[data-check-formula-rule="${policy}"]`);
      assert.ok(rule, `the rule sentence is stamped with the ${policy} rule`);
      assert.equal(rule.textContent.trim(), lookup(expected));
    }
  });

  it("puts the activity's own noun in the per-record rule sentence", async () => {
    const target = await harness.mount({
      rollFormula: '1d20',
      appliedModifiers: MODIFIERS,
      modifierPolicy: 'bySubject',
      recordNoun: 'gathering task',
    });
    const rule = target.querySelector('[data-check-formula-rule="bySubject"]').textContent;
    assert.match(rule, /gathering task/, 'the record noun is interpolated');
    assert.doesNotMatch(rule, /\{record\}/, 'no placeholder survives to the screen');
    assert.doesNotMatch(rule, /recipe/, 'a gathering check must not talk about recipes');
  });

  it('says so when nothing is added, rather than drawing an empty chip row', async () => {
    const target = await harness.mount({ rollFormula: '1d20', appliedModifiers: [] });
    assert.equal(target.querySelectorAll('[data-check-formula-modifier]').length, 0);
    assert.equal(
      target.querySelector('[data-check-formula-rule]').textContent.trim(),
      lookup('FABRICATE.Admin.Manager.Checks.Crafting.ResolvedNoModifiers')
    );
  });

  it('reads the average with every character value taken as zero', async () => {
    const target = await harness.mount({ rollFormula: '1d20 + @abilities.int.mod + 2' });
    // 1d20 averages 10.5, the roll-data term is taken as 0, and the flat +2 is exact.
    assert.equal(target.querySelector('[data-check-formula-average]').dataset.checkFormulaAverage, '12.5');
  });

  it('withholds the average rather than guessing one it cannot reduce', async () => {
    for (const formula of ['', 'not a formula at all']) {
      harness.remount();
      const target = await harness.mount({ rollFormula: formula });
      assert.equal(
        target.querySelector('[data-check-formula-average]'),
        null,
        `"${formula}" must show no average reading`
      );
    }
  });

  it('carries no DC and no comparison: those belong to the Difficulty card', async () => {
    const target = await harness.mount({ rollFormula: '1d20' });
    assert.equal(target.querySelector('[data-check-dc]'), null);
    assert.equal(target.querySelector('[data-threshold-mode]'), null);
  });
});

// ── The suggestion chips, THROUGH THE RENDERED CONTROL ────────────────────────────────
//
// Added after an audit of this change's controls asked which of them a test actually
// CLICKS. This one was asserted by presence only: `appendToken` was reachable by reading the
// source and by nothing else, which is the same exposure that let a preset button be
// reported inert with a green proof beside it.
describe('a suggestion chip appends its term when CLICKED', () => {
  it('appends to an authored formula with a joining +', async () => {
    const emitted = [];
    const target = await harness.mount({
      rollFormula: '1d20',
      foundrySystemId: '',
      onChange: (patch) => emitted.push(patch),
    });
    const chip = target.querySelector('[data-check-formula-token]');
    assert.ok(chip, 'at least one suggestion chip renders');
    assert.equal(chip.tagName, 'BUTTON', 'it is a real button, not a click-handled span');
    const token = chip.dataset.checkFormulaToken;
    chip.click();
    assert.equal(emitted.length, 1, 'the click reached the handler');
    assert.equal(emitted.at(-1).rollFormula, `1d20 + ${token}`);
  });

  it('yields the term alone when the formula is empty, never a leading +', async () => {
    const emitted = [];
    const target = await harness.mount({ rollFormula: '', onChange: (patch) => emitted.push(patch) });
    const chip = target.querySelector('[data-check-formula-token]');
    chip.click();
    assert.equal(emitted.at(-1).rollFormula, chip.dataset.checkFormulaToken);
  });
});
