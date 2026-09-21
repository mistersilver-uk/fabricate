/**
 * CHARACTERIZATION suite for the states the GM Checks Studio prototype never depicts
 * (issue 1093's must-not-regress table; landed by issue 1095 task 23).
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
// The condition-type control is the shared `<Select>` since issue 1510, so its options exist only
// while the panel is open. Manifest and reader only: the claim below did not move.
import { selectOptionValues } from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// ── the harness-configuration block ──────────────────────────────────────────
// The ONE part of this file a downstream PR may touch, and issue 1095 moved even that into
// the shared constants above.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-checks-must-not-regress-',
  rawModules: [
    ...CHECKS_TREE_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/model/macroReference.js',
  ],
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDcMacroCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/CheckAwardMode.svelte',
    'src/ui/svelte/apps/manager/checks/CheckModeCallout.svelte',
    'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
});
// ── end of the harness-configuration block ───────────────────────────────────

const SIMPLE_CHECK = { rollFormula: '1d20', dc: 15, thresholdMode: 'meet', dcMode: 'static' };

/** A routed check whose tiers, triggers and columns the highest-risk assertions read. */
function routedCheck(overrides = {}) {
  return {
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: [
      { id: 'tier-fine', name: 'Fine', dc: 0, success: true, breakTools: false },
      { id: 'tier-ruined', name: 'Ruined', dc: -5, success: false, breakTools: true },
    ],
    fixedOutcomes: [],
    checkBreakage: {
      triggers: [
        {
          id: 'trg-1',
          condition: { type: 'rollTotal', operator: '<=', value: 3 },
          outcome: 'failure',
          breakTools: true,
          tierStep: { mode: 'none', steps: 1, tierId: null },
        },
      ],
    },
    ...overrides,
  };
}

// ── NAVIGATION ONLY (issue 1096) ──
function mountChecks(props, section = '') {
  const mounted = harness.mount({
    activity: 'crafting',
    resolutionMode: 'simple',
    craftingCheckSimple: SIMPLE_CHECK,
    features: { salvage: true, gathering: true },
    activation: {},
    ...props,
  });
  if (!section) return mounted;
  return mounted.then((target) => {
    const button = target.querySelector('#checks-section-' + section);
    if (!button) throw new Error('the section strip should offer "' + section + '"');
    button.click();
    return Promise.resolve().then(() => target);
  });
}

/**
 * Open a trigger's disclosure so its controls are in the document.
 *
 * @param {HTMLElement} target Mounted root.
 * @param {string} id The trigger id.
 * @returns {HTMLElement} The trigger's card.
 */
function openTrigger(target, id) {
  const disclosure = target.querySelector(`[data-trigger-disclosure="${id}"]`);
  assert.ok(Boolean(disclosure), `the head of trigger ${id} renders`);
  disclosure.click();
  flushSync();
  assert.ok(
    Boolean(target.querySelector(`[data-trigger-body="${id}"]`)),
    `the head of trigger ${id} opens its body`
  );
  return target.querySelector(`[data-trigger="${id}"]`);
}

describe('1093 must-not-regress — the states the prototype never depicts', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  // ── alchemy: a selector and three behaviour flags the prototype has no frame for ──
  it('renders the alchemy check-mode selector with both SHAPE modes', async () => {
    const target = await mountChecks({ resolutionMode: 'alchemy', alchemyCheckMode: 'simple' });
    const options = [...target.querySelectorAll('[data-crafting-alchemy-checkmode-option]')].map(
      (option) => option.getAttribute('data-crafting-alchemy-checkmode-option')
    );
    assert.deepEqual(
      options,
      ['simple', 'tiered'],
      'both alchemy check shapes are offered; the prototype depicts neither'
    );
    harness.remount();
  });

  it('renders all THREE alchemy behaviour flags as real controls', async () => {
    const target = await mountChecks(
      {
        resolutionMode: 'alchemy',
        alchemyCheckMode: 'simple',
        alchemyLearnOnCraft: true,
        alchemyConsumeOnFail: false,
        alchemyShowAttemptHistory: true,
      },
      'on-failure'
    );
    const behaviour = target.querySelector('[data-alchemy-behaviour]');
    assert.ok(behaviour, 'the alchemy behaviour card renders');
    for (const [field, expected] of [
      ['learnOnCraft', true],
      ['consumeOnFail', false],
      ['showAttemptHistoryToPlayers', true],
    ]) {
      // `ToggleCard` renders a real `<button aria-pressed>` rather than a checkbox.
      const toggle = behaviour.querySelector(`[data-recipe-field="${field}"]`);
      assert.ok(toggle, `${field} has a control`);
      assert.equal(
        toggle.getAttribute('aria-pressed'),
        String(expected),
        `${field} reflects the stored value`
      );
    }
    harness.remount();
  });

  // ── routedByIngredients shares the SIMPLE slot ────────────────────────────────
  it('authors routedByIngredients on the SIMPLE editor, not a routed one', async () => {
    const target = await mountChecks({ resolutionMode: 'routedByIngredients' });
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-check-dc]'),
      'routedByIngredients keeps the OPTIONAL pass/fail check on the shared simple slot'
    );
    assert.equal(
      target.querySelector('[data-check-outcomes]'),
      null,
      'and it renders no outcome-tier editor: it routes on the ingredient set, not the check'
    );
    harness.remount();
  });

  // ── gathering d100: the read-only explanation panel ──────────────────────────
  it('renders the gathering d100 explanation panel, read-only', async () => {
    const target = await mountChecks({
      activity: 'gathering',
      features: { salvage: true, gathering: true },
      gatheringResolutionMode: 'd100',
    });
    assert.ok(
      target.querySelector('[data-gathering-d100-readonly]'),
      'd100 explains itself rather than rendering an editor for a roll nobody authors'
    );
    assert.equal(
      target.querySelector('[data-gathering-d100-readonly] [data-check-roll-formula]'),
      null,
      'and it offers no formula field, because there is no formula'
    );
    harness.remount();
  });

  // ── the maxModifierPicks UNLIMITED reading ───────────────────────────────────
  it('renders an ABSENT pick cap as a BLANK field behind an Unlimited placeholder', async () => {
    const target = await mountChecks(
      {
        checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
        craftingDefaultModifierPolicy: 'playerPicks',
        craftingMaxModifierPicks: null,
      },
      'modifiers'
    );
    const field = target.querySelector('[data-crafting-modifier-max-picks]');
    assert.ok(field, 'the cap renders under a selecting rule');
    assert.equal(
      field.getAttribute('data-crafting-modifier-max-picks'),
      'unlimited',
      'absence is a real value — unlimited — not a magic number'
    );
    const input = field.querySelector('[data-crafting-modifier-max-picks-input]');
    assert.equal(input.value, '', 'and it is a BLANK field, never a 0 or a 1');
    assert.match(input.getAttribute('placeholder') || '', /Unlimited/);
    harness.remount();
  });

  // ── highest risk 1 + 4: the checkDriven gate.
  it('gates per-trigger break-tools on breakageAuthority, in BOTH directions', async () => {
    const withGate = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'checkDriven',
      },
      'triggers'
    );
    assert.ok(
      openTrigger(withGate, 'trg-1').querySelector('[data-trigger-break]'),
      'checkDriven exposes the per-trigger break-tools toggle'
    );
    harness.remount();

    const withoutGate = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'toolSpecific',
      },
      'triggers'
    );
    assert.ok(
      !openTrigger(withoutGate, 'trg-1').querySelector('[data-trigger-break]'),
      'toolSpecific hides it: each tool’s own mode decides'
    );
    harness.remount();
  });

  it('gates the routed PER-TIER break-tools column on breakageAuthority', async () => {
    const withGate = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'checkDriven',
      },
      'outcomes'
    );
    assert.ok(
      withGate.querySelector('[data-outcome-row="tier-ruined"] [data-outcome-break]'),
      'checkDriven exposes the per-tier break-tools column'
    );
    harness.remount();

    const withoutGate = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'toolSpecific',
      },
      'outcomes'
    );
    assert.equal(
      withoutGate.querySelector('[data-outcome-row="tier-ruined"] [data-outcome-break]'),
      null,
      'and toolSpecific hides it'
    );
    harness.remount();
  });

  // ── highest risk 2: the per-trigger force-outcome SegmentedControl ───────────
  it('offers ALL THREE force-outcome segments on a trigger', async () => {
    const target = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'checkDriven',
      },
      'triggers'
    );
    const segments = [
      ...openTrigger(target, 'trg-1').querySelectorAll('[data-trigger-outcome]'),
    ].map((segment) => segment.getAttribute('data-trigger-outcome'));
    assert.deepEqual(
      segments,
      ['success', 'none', 'failure'],
      'a trigger may force a success, NOTHING, or a failure — the prototype shows none of ' +
        'it. The whole list is asserted rather than membership, because a two-segment ' +
        'control would satisfy "success is offered"'
    );
    harness.remount();
  });

  // ── highest risk 3: the outcomeTier condition type ───────────────────────────
  it('offers outcomeTier in the trigger WHEN vocabulary', async () => {
    const target = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'checkDriven',
      },
      'triggers'
    );
    openTrigger(target, 'trg-1');
    const control = '[data-trigger="trg-1"] [data-trigger-condition-type]';
    assert.ok(target.querySelector(control), 'the condition-type control renders');
    const values = selectOptionValues(target, control);
    assert.ok(
      values.includes('outcomeTier'),
      `outcomeTier is offered as a condition type (got ${values.join(', ')})`
    );
    harness.remount();
  });
});

// ── the pins that are NOT mounted surface ────────────────────────────────────

describe('1093 must-not-regress — persisted state with no surface', () => {
  const managerSource = readFileSync(
    resolve(repoRoot, 'src/systems/CraftingSystemManager.js'),
    'utf8'
  );
  const richStateSource = readFileSync(
    resolve(repoRoot, 'src/systems/GatheringRichStateService.js'),
    'utf8'
  );
  const adminStoreSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/stores/adminStore.js'),
    'utf8'
  );

  // ── highest risk 5: salvage's persisted-but-hidden fields ───────────────────
  it('salvage persists dcMode, macroUuid and tiers even though no editor shows them', async () => {
    const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
    globalThis.foundry ??= { utils: { randomID: () => 'id' } };
    const manager = new CraftingSystemManager({ getRecipes: () => [] });
    const normalized = manager._normalizeSalvageCraftingCheck({
      simple: {
        rollFormula: '1d20',
        dcMode: 'dynamic',
        macroUuid: 'Macro.abc',
        tiers: [{ id: 't', name: 'Tier', dc: 2 }],
      },
    });
    assert.equal(normalized.simple.dcMode, 'dynamic', 'dcMode survives');
    assert.equal(normalized.simple.macroUuid, 'Macro.abc', 'macroUuid survives');
    assert.equal(normalized.simple.tiers.length, 1, 'tiers survive');
  });

  // ── component.salvage.dcOverride and task.dcOverride ────────────────────────
  it('component.salvage.dcOverride round-trips, and a null stays null', async () => {
    const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
    globalThis.foundry ??= { utils: { randomID: () => 'id' } };
    const manager = new CraftingSystemManager({ getRecipes: () => [] });
    assert.equal(manager._normalizeSalvage({ dcOverride: 17 }).dcOverride, 17);
    assert.equal(
      manager._normalizeSalvage({ dcOverride: null }).dcOverride,
      null,
      'Number(null) is 0, so an unguarded normalizer mints a DC-0 override on every save'
    );
  });

  it('task.dcOverride is emitted by BOTH mirrored gathering-task normalizers', () => {
    // Both are whitelist rebuilds, and a key emitted by one and not the other survives one
    // save path and is dropped on the other — silently, and in one direction only.
    assert.match(richStateSource, /dcOverride: \(\(\) => \{/, 'normalizeLibraryTask emits it');
    assert.match(adminStoreSource, /dcOverride: \(\(\) => \{/, '_normalizeGatheringTask emits it');
  });

  // ── task.failureOutcome, THE PIN MOVED BY ISSUE 1098 (CF8) ──────────────────
  it('task.failureOutcome is emitted by ALL THREE gathering-task rebuilds', () => {
    const normalizeLibraryTask = richStateSource.slice(
      richStateSource.indexOf('function normalizeLibraryTask'),
      richStateSource.indexOf('function normalizeItemDrop')
    );
    const normalizeGatheringTask = adminStoreSource.slice(
      adminStoreSource.indexOf('function _normalizeGatheringTask'),
      adminStoreSource.indexOf('function _normalizeGatheringEvent')
    );
    const libraryTaskToRuntimeTask = richStateSource.slice(
      richStateSource.indexOf('_libraryTaskToRuntimeTask(task, environment = null)'),
      richStateSource.indexOf('function normalizeLibraryTask')
    );
    assert.ok(
      normalizeLibraryTask.length > 0 &&
        normalizeGatheringTask.length > 0 &&
        libraryTaskToRuntimeTask.length > 0
    );
    assert.ok(
      normalizeLibraryTask.includes('authoredFailureOutcome'),
      'normalizeLibraryTask emits it — otherwise a GM-authored value is dropped on save'
    );
    assert.ok(
      normalizeGatheringTask.includes('authoredFailureOutcome'),
      '_normalizeGatheringTask, its mirror, emits it too'
    );
    assert.ok(
      libraryTaskToRuntimeTask.includes('authoredFailureOutcome'),
      'the engine-facing runtime-task builder emits it — the half two mirrors leave dead'
    );
    // …and it IS still validated and diagnosed, so the field is live rather than dead.
    const engineSource = readFileSync(resolve(repoRoot, 'src/systems/GatheringEngine.js'), 'utf8');
    assert.match(engineSource, /validateFailureOutcome/, 'the engine still validates it');
    assert.match(adminStoreSource, /failureOutcome/, 'the store still builds its diagnostic path');
  });

  // ── minSuccessOutcomeId: routedByCheck + fixed ONLY ─────────────────────────
  it('offers minSuccessOutcomeId under routedByCheck + fixed and nowhere else', () => {
    const overviewSource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte'),
      'utf8'
    );
    assert.match(
      overviewSource,
      /minSuccessOutcomeId/,
      'the control exists — a deleted one would make the gate assertion below vacuous'
    );
    // The GATE itself, read where it lives.
    assert.match(
      overviewSource,
      /minSuccessOutcomeId/,
      'the control is reachable from the Overview tab'
    );
  });

  // ── decision 7: checkOutcomeIds survives a success flip ─────────────────────
  it('_validRoutedTierIds keys on id existence, never on success', () => {
    const derivation = adminStoreSource.slice(
      adminStoreSource.indexOf('function _validRoutedTierIds'),
      adminStoreSource.indexOf('function _filterGroupOutcomeIds')
    );
    assert.ok(derivation.length > 0, 'the derivation is found, or this scan proves nothing');
    assert.match(derivation, /if \(tier\?\.id\) ids\.add\(tier\.id\)/, 'it adds by ID');
    assert.ok(
      !derivation.includes('success'),
      'and it consults `success` nowhere: flipping the flag must not destroy an authored ' +
        'checkOutcomeIds assignment, which is what decision 7 later depends on'
    );
  });
});
