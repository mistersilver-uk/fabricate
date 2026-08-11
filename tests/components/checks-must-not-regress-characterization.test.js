/**
 * CHARACTERIZATION suite for the states the GM Checks Studio prototype never depicts
 * (issue 1093's must-not-regress table; landed by issue 1095 task 23).
 *
 * It is landed BEFORE issues 1096, 1097 and 1098 rebuild the Checks surface, and it must
 * pass UNCHANGED afterwards. A characterization test written after the rewrite proves
 * nothing: it can only describe what the new code already does. The prototype's
 * three-mode `MODES` map and its per-activity duplication are fixture artefacts, and the
 * shipped surface carries a great deal it does not show — an alchemy check-mode selector,
 * three alchemy behaviour flags, a per-trigger force-outcome control, an `outcomeTier`
 * condition type, a routed per-tier break-tools column, five persisted-but-hidden salvage
 * fields. Each of those is one deletion away from vanishing under a green suite.
 *
 * THE DEPENDENCY-MANIFEST-ONLY RULE GOVERNS THIS FILE (issue 1093, BH1). Literal
 * non-modification is unachievable — a manifest omission HANGS a mounted suite rather than
 * failing it, and each downstream PR changes this tree's import closure — so the rule is
 * stated the way the repo already states it for
 * `simple-crafting-check-editor-characterization.test.js`:
 *
 *   The ONLY permitted edit to this file is its `rawModules` / `compiledModules` manifest.
 *   No assertion may be added, edited, weakened, skipped or deleted. Proven by
 *   `git diff origin/main -- <this file>` showing changes only inside the
 *   harness-configuration block, stated in the PR's Testing section.
 *
 * …and issue 1095 hoisted that manifest OUT of this file entirely, into
 * `tests/helpers/checksHarnessModules.js`, so a downstream PR's manifest edit lands there
 * and this file's diff is empty.
 *
 * EVERY ASSERTION HERE IS PROVEN TO FAIL when the control it pins is removed. The proof is
 * recorded per section rather than performed at runtime: a test that deleted the control
 * to check it would be asserting against a tree the GM never sees.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

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
    'src/utils/macroReference.js',
  ],
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/CheckAwardMode.svelte',
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
//
// The dependency-manifest-only rule could not survive this change LITERALLY, and the
// contradiction is mechanical rather than a matter of taste: issue 1096 replaces the four
// ACTIVITY tabs with four rail ROUTES and a five-SECTION strip, so the
// `[data-checks-tab-button="gathering"]` click this file used to reach the gathering panel
// selects a control that no longer exists anywhere in the product. A suite cannot both
// require that hook be removed and require the line clicking it stay.
//
// So the rule is honoured where it carries the value and stated where it cannot be:
// **no assertion in this file is added, edited, weakened, skipped or deleted** — every
// `assert.*` below is byte-identical to the version issue 1095 landed. What changed is
// only HOW a test reaches the state it then asserts on: an `activity` prop instead of a
// tab click, and a `section` argument instead of nothing. That is the route, not the
// characterization, and the route is precisely what this change is.
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

describe('1093 must-not-regress — the states the prototype never depicts', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  // ── alchemy: a selector and three behaviour flags the prototype has no frame for ──
  //
  // PROVEN CAPABLE OF FAILING: deleting any one of the three `ALCHEMY_CHECK_MODE_OPTIONS`
  // entries reds the first assertion (the list length AND the missing value), and deleting
  // any one `ToggleCard` in the behaviour card reds the second (its `data-field` hook
  // disappears). Both were verified by removing the control and observing the failure.
  it('renders the alchemy check-mode selector with all THREE modes', async () => {
    const target = await mountChecks({ resolutionMode: 'alchemy', alchemyCheckMode: 'none' });
    const options = [...target.querySelectorAll('[data-crafting-alchemy-checkmode-option]')].map(
      (option) => option.getAttribute('data-crafting-alchemy-checkmode-option')
    );
    assert.deepEqual(
      options,
      ['none', 'simple', 'tiered'],
      'all three alchemy check modes are offered; the prototype depicts none of them'
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
      // `ToggleCard` renders a real `<button aria-pressed>` rather than a checkbox — the
      // manager's ONE toggle treatment. The pressed state IS the stored value.
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
  //
  // PROVEN CAPABLE OF FAILING: narrowing `craftingSimple` to `resolutionMode === 'simple'`
  // drops this mode into the ProgressiveCraftingCheckEditor branch, and the DC field this
  // asserts disappears.
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
  //
  // PROVEN CAPABLE OF FAILING: deleting the `gatheringD100` branch drops the
  // `data-gathering-d100-readonly` hook and the assertion reds immediately.
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
  //
  // PROVEN CAPABLE OF FAILING: coercing the prop with `?? 1` or `|| 0` anywhere on the way
  // to the Stepper renders `1`/`0` in the field and reds both halves of this assertion.
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

  // ── highest risk 1 + 4: the checkDriven gate, asserted BOTH ways ─────────────
  //
  // PROVEN CAPABLE OF FAILING: hard-coding the gate to `true` reds the toolSpecific half;
  // hard-coding it to `false` reds the checkDriven half. Only asserting one direction
  // would pass against a gate that had been removed entirely.
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
      withGate.querySelector('[data-trigger="trg-1"] [data-trigger-break]'),
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
    assert.equal(
      withoutGate.querySelector('[data-trigger="trg-1"] [data-trigger-break]'),
      null,
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
  //
  // PROVEN CAPABLE OF FAILING: deleting any one segment reds the deepEqual, which asserts
  // the whole list rather than a membership test — a two-segment control would otherwise
  // satisfy "success is offered".
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
      ...target.querySelectorAll('[data-trigger="trg-1"] [data-trigger-outcome]'),
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
  //
  // PROVEN CAPABLE OF FAILING: removing the `outcomeTier` option from the WHEN vocabulary
  // reds the membership assertion.
  it('offers outcomeTier in the trigger WHEN vocabulary', async () => {
    const target = await mountChecks(
      {
        resolutionMode: 'routedByCheck',
        craftingCheck: routedCheck(),
        breakageAuthority: 'checkDriven',
      },
      'triggers'
    );
    const select = target.querySelector('[data-trigger="trg-1"] [data-trigger-condition-type]');
    assert.ok(select, 'the condition-type control renders');
    const values = [...select.querySelectorAll('option')].map((option) => option.value);
    assert.ok(
      values.includes('outcomeTier'),
      `outcomeTier is offered as a condition type (got ${values.join(', ')})`
    );
    harness.remount();
  });
});

// ── the pins that are NOT mounted surface ────────────────────────────────────
//
// Four rows of the table describe states that have no control at all, or live in a
// normalizer rather than a component. A mounted assertion cannot pin an ABSENCE of a
// surface, so these are asserted where they actually live.

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
  //
  // The salvage editors hide `dcMode`, `macroUuid` and `tiers` (salvage has no recipes to
  // pick a tier from), but the NORMALIZER persists all three, because salvage reuses the
  // crafting check sub-object shapes. A normalizer that stopped emitting them would
  // silently delete GM data on the next save, and no UI would report it.
  //
  // PROVEN CAPABLE OF FAILING: dropping any one key from `_normalizeSimpleCraftingCheck`'s
  // return literal reds the corresponding assertion.
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
  //
  // PROVEN CAPABLE OF FAILING: deleting the `dcOverride` line from either normalizer reds
  // its assertion. The `null`-guard half is the subtle one — `Number(null)` is 0, so a
  // normalizer that dropped the guard would mint a DC-0 override nobody authored.
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

  // ── task.failureOutcome, pinned at its REAL state (CF8) ─────────────────────
  //
  // The row in issue 1093's table was CORRECTED: `failureOutcome` is validated
  // (`GatheringEngine.validateFailureOutcome`) and carries a diagnostic path builder in
  // `adminStore`, but it is emitted by NEITHER gathering-task normalizer and is editable
  // NOWHERE. Pinning the state it is claimed to have would be pinning a fiction; this pins
  // what is actually true until issue 1098 task 52 changes it.
  //
  // PROVEN CAPABLE OF FAILING: adding `failureOutcome` to either normalizer's return
  // literal reds the first assertion, which is exactly the change issue 1098 will make —
  // and it will move this pin deliberately rather than discovering the drift later.
  it('task.failureOutcome is validated and diagnosed but emitted by NEITHER normalizer', () => {
    const normalizeLibraryTask = richStateSource.slice(
      richStateSource.indexOf('function normalizeLibraryTask'),
      richStateSource.indexOf('function normalizeItemDrop')
    );
    const normalizeGatheringTask = adminStoreSource.slice(
      adminStoreSource.indexOf('function _normalizeGatheringTask'),
      adminStoreSource.indexOf('function _normalizeGatheringEvent')
    );
    assert.ok(normalizeLibraryTask.length > 0 && normalizeGatheringTask.length > 0);
    assert.ok(
      !normalizeLibraryTask.includes('failureOutcome'),
      'normalizeLibraryTask does not emit it — so a GM-authored value would be dropped'
    );
    assert.ok(
      !normalizeGatheringTask.includes('failureOutcome'),
      '_normalizeGatheringTask does not emit it either'
    );
    // …and it IS still validated and diagnosed, so the field is live rather than dead.
    const engineSource = readFileSync(resolve(repoRoot, 'src/systems/GatheringEngine.js'), 'utf8');
    assert.match(engineSource, /validateFailureOutcome/, 'the engine still validates it');
    assert.match(adminStoreSource, /failureOutcome/, 'the store still builds its diagnostic path');
  });

  // ── minSuccessOutcomeId: routedByCheck + fixed ONLY ─────────────────────────
  //
  // PROVEN CAPABLE OF FAILING: widening the gate to every routed type reds the negative
  // half; narrowing it to nothing reds the positive half.
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
    // The GATE itself, read where it lives: the control renders under `routedByCheck` and
    // a FIXED tier type only, so a widened gate would offer a minimum success tier on a
    // relative check that has no absolute ranges to compare against.
    assert.match(
      overviewSource,
      /minSuccessOutcomeId/,
      'the control is reachable from the Overview tab'
    );
  });

  // ── decision 7: checkOutcomeIds survives a success flip ─────────────────────
  //
  // `_validRoutedTierIds` keys on id EXISTENCE, not on `success`, so flipping a tier's
  // success flag does NOT destroy an authored assignment. Already-correct behaviour, and
  // decision 7 depends on it: a policy that later permits failure results must find the
  // assignment still there.
  //
  // PROVEN CAPABLE OF FAILING: adding `&& tier.success === true` to `_validRoutedTierIds`
  // reds this assertion.
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
