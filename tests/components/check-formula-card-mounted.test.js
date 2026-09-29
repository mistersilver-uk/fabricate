import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { formulaTokenIcon } from '../../src/ui/svelte/apps/manager/checks/checksCopy.js';

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
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/config/modifierExpressionSuggestions.js',
    'src/config/gatheringCharacterModifierPresets.js',
    'src/utils/rollExpressionAverage.js',
    'src/utils/rollFormulaRollability.js',
    // The direction axis and the roll-prompt group (issue 2005).
    'src/systems/normalize/checkEvaluation.js',
    'src/ui/svelte/apps/manager/checks/checksCopy.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckPromptOptions.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
  ],
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
    assert.deepEqual(
      [...resolved.querySelector('[data-check-formula-modifier="m-dex"] i').classList].filter(
        (token) => token.startsWith('fa')
      ),
      ['fas', 'fa-feather'],
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
    const average = target.querySelector('[data-check-formula-average]');
    assert.equal(average.dataset.checkFormulaAverage, '12.5');
    assert.ok(average.id, 'the reading carries an id');
    assert.equal(
      target.querySelector('[data-check-roll-formula]').getAttribute('aria-describedby'),
      average.id,
      'the formula input is described by its average reading'
    );
  });

  it('renders a visible and accessible withheld average for transformed formulas', async () => {
    for (const formula of ['1d20cs>15', '2d6cs>=5', '1d20odd']) {
      harness.remount();
      const target = await harness.mount({ rollFormula: formula });
      const average = target.querySelector('[data-check-formula-average-withheld="die-modifiers"]');
      assert.ok(average, `${formula}: the withheld slot remains visible`);
      assert.match(average.textContent, /avg\s*—/, `${formula}: visible avg dash`);
      assert.equal(
        average.querySelector('.visually-hidden').textContent.trim(),
        lookup('FABRICATE.Admin.Manager.Checks.Crafting.AverageWithheld'),
        `${formula}: the withheld reason is available without hover`
      );
      assert.equal(
        target.querySelector('[data-check-roll-formula]').getAttribute('aria-describedby'),
        average.id,
        `${formula}: the formula input is described by the withheld reading`
      );
      assert.ok(!target.querySelector('[data-check-formula-average]'), `${formula}: no numeric reading`);
    }
  });

  it('withholds the average rather than guessing one it cannot reduce', async () => {
    for (const formula of ['', 'not a formula at all', '1d20cs>']) {
      harness.remount();
      const target = await harness.mount({ rollFormula: formula });
      assert.ok(
        !target.querySelector('[data-check-formula-average]'),
        `"${formula}" must show no average reading`
      );
      assert.ok(
        !target.querySelector('[data-check-formula-average-withheld]'),
        `"${formula}" must show no withheld reading either`
      );
      assert.ok(
        !target.querySelector('[data-check-roll-formula]').hasAttribute('aria-describedby'),
        `"${formula}" describes the input by nothing`
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

describe('a suggestion chip carries its reference kind glyph (issue 2005, prototype)', () => {
  it('draws the prototype kind glyph after the + verb, and none for a kind it has no glyph for', async () => {
    const target = await harness.mount({ rollFormula: '1d20', foundrySystemId: 'dnd5e' });
    const kinds = Object.fromEntries(
      [...target.querySelectorAll('[data-check-formula-token]')].map((chip) => [
        chip.dataset.checkFormulaToken,
        [...(chip.querySelector('[data-check-formula-token-kind]')?.classList ?? [])]
          .filter((token) => token.startsWith('fa'))
          .join(' '),
      ])
    );
    assert.deepEqual(kinds, {
      '@abilities.int.mod': 'fas fa-hand',
      '@abilities.wis.mod': 'fas fa-hand',
      '@skills.sur.total': '',
      2: '',
      '1d4': 'fas fa-dice-d20',
    });
    const chip = target.querySelector('[data-check-formula-token="1d4"]');
    assert.deepEqual(
      [...chip.children].map((child) => child.tagName),
      ['I', 'I', 'SPAN'],
      'the + verb, then the kind glyph, then the term'
    );
  });

  it('maps every prototype kind to its Font Awesome Free glyph', () => {
    assert.deepEqual(
      ['@prof', '@abilities.wis.mod', '@ingredients', '@level', '1d4', '@skills.sur.total', '2'].map(
        formulaTokenIcon
      ),
      ['fas fa-medal', 'fas fa-hand', 'fas fa-flask', 'fas fa-arrow-up-9-1', 'fas fa-dice-d20', '', '']
    );
  });
});

describe('the formula card under a roll-under check (issue 2005, Q14)', () => {
  const under = (target = {}) => ({
    product: 'sum',
    direction: 'under',
    target: { source: 'fixed', expression: '', adjustmentKind: 'add', ...target },
  });
  const EVALUATIONS = [
    under(),
    under({ source: 'attribute', expression: '@skills.craft.value' }),
    under({ source: 'attribute', expression: '@skills.craft.value', adjustmentKind: 'multiply' }),
  ];

  /** The inset's direct children in reading order, each as its visible text. */
  const insetTerms = (target) =>
    [...target.querySelector('.manager-checks-formula-expression').children].map((node) =>
      node.textContent.trim()
    );

  it('joins the target and the modifier chips with + and joins nothing to the dice (Q14)', async () => {
    for (const thresholdMode of ['meet', 'exceed']) {
      harness.remount();
      const cmp = thresholdMode === 'meet' ? 'at or under' : 'under';
      const target = await harness.mount({
        rollFormula: '1d100',
        appliedModifiers: MODIFIERS,
        evaluation: under(),
        thresholdMode,
        targetChip: 'Target 12',
      });
      assert.deepEqual(insetTerms(target), [
        '1d100',
        cmp,
        'Target 12',
        '+',
        'Dexterity',
        '+',
        'Intelligence',
      ]);
      assert.match(
        target.querySelector('[data-check-direction-note]').textContent,
        new RegExp(`stay ${cmp} the target`)
      );
    }
  });

  it('with no target, lists the modifiers without joining the first to the dice', async () => {
    const target = await harness.mount({
      rollFormula: '1d100',
      appliedModifiers: MODIFIERS,
      evaluation: under(),
    });
    assert.deepEqual(insetTerms(target), ['1d100', 'Dexterity', '+', 'Intelligence']);
    assert.ok(!target.querySelector('[data-check-formula-target]'));
  });

  it('states only the raw-dice rule under, with or without modifiers (maintainer ruling M2)', async () => {
    const raw = lookup('FABRICATE.Admin.Manager.Checks.Evaluation.UnderRule');
    for (const [policy, appliedModifiers] of [
      ['addAll', MODIFIERS],
      ['highest', MODIFIERS],
      ['playerPicks', MODIFIERS],
      ['addAll', []],
    ]) {
      harness.remount();
      const target = await harness.mount({
        rollFormula: '1d100',
        appliedModifiers,
        modifierPolicy: policy,
        evaluation: under(),
      });
      const rule = target.querySelector('[data-check-formula-rule]').textContent.trim();
      assert.equal(rule, raw, `${policy} with ${appliedModifiers.length} modifiers`);
    }
  });

  it('omits the under note where the runtime refuses a roll-under check', async () => {
    const target = await harness.mount({ rollFormula: '1d20', evaluation: under(), underNote: false });
    assert.ok(!target.querySelector('[data-check-direction-note]'));
    assert.ok(target.querySelector('[data-check-direction]'), 'the axis stays so the GM can switch back');
  });

  it('names the roll-prompt options as a group and draws the offer without a glyph', async () => {
    const target = await harness.mount({ rollFormula: '1d20', evaluation: under() });
    const group = target.querySelector('[data-check-prompt-options]');
    assert.equal(group.getAttribute('role'), 'group');
    const title = target.querySelector(`[id="${group.getAttribute('aria-labelledby')}"]`);
    assert.equal(title?.textContent.trim(), 'In the roll prompt');
    assert.ok(!group.querySelector('.manager-recipe-status-icon'), 'the offer row has no icon');
  });

  it('keeps the withheld average under every direction, source and kind', async () => {
    for (const evaluation of EVALUATIONS) {
      harness.remount();
      const target = await harness.mount({
        rollFormula: '2d6cs>=5',
        evaluation,
        targetChip: evaluation.target.expression || 'Target 12',
      });
      assert.ok(
        target.querySelector('[data-check-formula-average-withheld="die-modifiers"]'),
        `${evaluation.target.source}/${evaluation.target.adjustmentKind}: avg — stays`
      );
    }
  });

  it('writes the direction through its segmented control and leaves the rest of the record', async () => {
    const emitted = [];
    const target = await harness.mount({
      rollFormula: '1d20',
      evaluation: under({ source: 'attribute', expression: '@a.b', adjustmentKind: 'multiply' }),
      onChange: (patch) => emitted.push(patch),
    });
    const radio = target.querySelector('[data-check-direction-option="over"] input[type="radio"]');
    radio.checked = true;
    radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.equal(emitted.at(-1).evaluation.direction, 'over');
    assert.equal(emitted.at(-1).evaluation.target.expression, '@a.b');
    assert.equal(emitted.at(-1).evaluation.target.adjustmentKind, 'multiply');
  });
});
