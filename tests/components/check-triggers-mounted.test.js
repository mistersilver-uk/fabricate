import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { stepMigratedNumberField } from '../helpers/numericKeyboardStep.js';
// The five converted controls are driven by open-then-click on a portaled panel (issue 1510).
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionLabels,
  selectOptionValues,
  selectTriggerText,
} from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Real en.json so the tests assert LOCALIZED copy resolves.
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}

// Use the shared mounted-component harness.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-triggers-',
  rawModules: [
    // The popover closure the shared picker composes (issue 1510); it spreads the Foundry bridge.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/utils/craftingCheckExpression.js',
    'src/ui/svelte/apps/manager/checks/checksCopy.js',
    'src/ui/svelte/apps/manager/checks/checkTriggerSummary.js',
    'src/ui/svelte/apps/manager/checks/checkTriggerPresets.js',
    // The studio's converted option vocabularies (issue 1510).
    'src/ui/svelte/apps/manager/checks/checksSelectOptions.js'
  ],
  compiledModules: [
    // The shipped segmented primitive.
    'src/ui/svelte/components/SegmentedControl.svelte',
    // The shared numeric stepper: the condition Value field and the tier-step operand are
    // both built on it (issue 1050), and the same static-closure rule applies.
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/Field.svelte',
    // The shared button primitive: the `Add trigger` control is the prototype's full-width
    // dashed row under the list rather than a button in the card head (issue 1096).
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    // The shared status card: a trigger's break-tools effect is its own bordered card with an
    // icon, a sentence and a switch (issue 1096), which is exactly this primitive.
    'src/ui/svelte/components/ToggleCard.svelte',
    // THE SHARED ONE-OF-N PICKER and its whole compiled graph (issue 1510); an omission HANGS this
    // suite (# cancelled) rather than failing it.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte'
});

const breakageKeys = en.FABRICATE.Admin.Manager.Checks.Breakage;
const craftingKeys = en.FABRICATE.Admin.Manager.Checks.Crafting;

before(async () => {
  await harness.setup();
  globalThis.game.i18n.localize = (key) => {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  };
});
after(() => harness.teardown());
afterEach(() => harness.remount());

function triggerBlock(triggers) {
  return { triggers };
}

// The segmented control's real control is the visually hidden radio.
function chooseSegment(root, optionDataAttr, value) {
  const radio = root.querySelector(`[${optionDataAttr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `a radio exists for ${optionDataAttr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  return radio;
}

// A trigger's controls live behind a disclosure (issue 1096).
function expandTrigger(root, id) {
  const disclosure = root.querySelector(`[data-trigger-disclosure="${id}"]`);
  assert.ok(Boolean(disclosure), `a disclosure renders for trigger ${id}`);
  assert.equal(disclosure.getAttribute('aria-expanded'), 'false', `trigger ${id} starts collapsed`);
  disclosure.click();
  flushSync();
  const body = root.querySelector(`[data-trigger-body="${id}"]`);
  assert.ok(Boolean(body), `clicking the head of trigger ${id} reveals its body`);
  return body;
}

// The five converted controls, each by the hook that rode onto its trigger (issue 1510).
const CONDITION_TYPE = '[data-trigger-condition-type]';
const DICE_GROUP = '[data-trigger-group]';
const AGGREGATE = '[data-trigger-aggregate]';
const OPERATOR = '[data-trigger-operator]';
const TIER_TARGET = '[data-trigger-tier-step-target]';

const rollTotalTrigger = {
  id: 't1',
  condition: { type: 'rollTotal', operator: '<=', value: 3 },
  outcome: 'failure',
  breakTools: false,
  tierStep: { mode: 'none', steps: 1, tierId: null }
};

const ROUTED_TIERS = [
  { id: 'tier-a', name: 'Ruined' },
  { id: 'tier-b', name: 'Masterwork' }
];

function routedTrigger(tierStep, overrides = {}) {
  return {
    id: 'r1',
    condition: { type: 'rollTotal', operator: '<=', value: 3 },
    outcome: 'none',
    breakTools: false,
    tierStep,
    ...overrides
  };
}

async function mountRouted(tierStep, { outcomeOptions = ROUTED_TIERS, onChange, expand = true } = {}) {
  const root = await harness.mount({
    value: triggerBlock([routedTrigger(tierStep)]),
    rollFormula: '1d20',
    kind: 'routed',
    outcomeOptions,
    showBreakTools: false,
    ...(onChange ? { onChange } : {})
  });
  if (expand) expandTrigger(root, 'r1');
  return root;
}

/** The simple-check mount: one `1d20` check over `triggers`, with the break pills off. */
function mountSimple(triggers, overrides = {}) {
  return harness.mount({
    value: triggerBlock(triggers),
    rollFormula: '1d20',
    kind: 'simple',
    showBreakTools: false,
    ...overrides
  });
}

describe('CheckTriggers (mounted): unified outcome + break editor', () => {
  it('always renders the trigger list and its outcome toggle; never a label input', async () => {
    const root = await mountSimple([rollTotalTrigger]);
    assert.ok(root.querySelector('[data-check-triggers]'), 'the trigger editor renders');
    expandTrigger(root, 't1');
    const selected = root.querySelector('[data-trigger="t1"] [data-trigger-outcome="failure"]');
    assert.ok(selected, 'the failure outcome segment renders for a trigger');
    assert.ok(
      selected.classList.contains('is-active'),
      'the toggle reflects the trigger outcome'
    );
    assert.equal(
      selected.querySelector('input[type="radio"]').checked,
      true,
      'the selected segment’s radio is the checked one'
    );
    // No free-text label input survives the recombine.
    assert.ok(
      !root.querySelector('[data-breakage-trigger-label]'),
      'no trigger label input is rendered'
    );
  });

  it('offers Automatic success / No effect / Automatic failure for a non-progressive check', async () => {
    const root = await mountSimple([rollTotalTrigger]);
    expandTrigger(root, 't1');
    const labels = [...root.querySelectorAll('[data-trigger-outcome]')].map((b) =>
      b.textContent.trim()
    );
    assert.deepEqual(
      labels,
      [breakageKeys.OutcomeForceSuccess, breakageKeys.OutcomeForceNone, breakageKeys.OutcomeForceFailure],
      'the outcome segments use the localized force-outcome copy in success | none | failure order'
    );
  });

  it('relabels the outcome segments Award all / Award none for a progressive check', async () => {
    const root = await harness.mount({
      value: triggerBlock([
        { id: 'p1', condition: { type: 'progressiveValue', operator: '>=', value: 10 }, outcome: 'success', breakTools: false }
      ]),
      rollFormula: '2d6',
      kind: 'progressive',
      showBreakTools: false
    });
    expandTrigger(root, 'p1');
    const labels = [...root.querySelectorAll('[data-trigger-outcome]')].map((b) =>
      b.textContent.trim()
    );
    assert.deepEqual(
      labels,
      [craftingKeys.AwardAll, breakageKeys.OutcomeForceNone, craftingKeys.AwardNone],
      'progressive reuses the Award all / Award none copy'
    );
  });

  it('gates the break-tools card on showBreakTools (authority)', async () => {
    const hidden = await mountSimple([rollTotalTrigger]);
    expandTrigger(hidden, 't1');
    assert.ok(
      !hidden.querySelector('[data-trigger-break]'),
      'no break card when showBreakTools is false (toolSpecific)'
    );
    // And the GM is told WHY, in the place the control would have been.
    const hint = hidden.querySelector('[data-trigger-break-unavailable]');
    assert.ok(Boolean(hint), 'the authority is explained where the missing card would be');
    assert.equal(hint.textContent.trim(), breakageKeys.LeadOutcomeOnly);
    harness.remount();

    const shown = await mountSimple([rollTotalTrigger], { showBreakTools: true });
    expandTrigger(shown, 't1');
    const card = shown.querySelector('[data-recipe-section="trigger-break-tools"]');
    assert.ok(Boolean(card), 'the break-tools card renders when showBreakTools is true');
    assert.equal(
      card.querySelector('.manager-recipe-status-title').textContent.trim(),
      breakageKeys.BreakToolsCardTitle,
      'and it is a titled card, not a two-word pill'
    );
    assert.ok(Boolean(card.querySelector('i.fa-hammer')), 'wearing the prototype’s wrench glyph');
    assert.ok(
      Boolean(shown.querySelector('[data-trigger-break]')),
      'the switch keeps its own hook'
    );
    assert.ok(
      !shown.querySelector('[data-trigger-break-unavailable]'),
      'and the authority hint stands down'
    );
  });

  it('OPERATING the break-tools switch writes breakTools onto the trigger', async () => {
    const emitted = [];
    const root = await mountSimple([rollTotalTrigger], {
      showBreakTools: true,
      onChange: (next) => emitted.push(next)
    });
    expandTrigger(root, 't1');
    const toggle = root.querySelector('[data-trigger="t1"] [data-trigger-break]');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'the fixture starts not breaking');
    toggle.click();
    assert.equal(
      emitted.at(-1).triggers[0].breakTools,
      true,
      'clicking the switch emits the flipped flag'
    );
  });

  it('toggles a trigger outcome through the segmented control and emits the new block', async () => {
    const emitted = [];
    const root = await mountSimple([rollTotalTrigger], { onChange: (next) => emitted.push(next) });
    expandTrigger(root, 't1');
    chooseSegment(
      root.querySelector('[data-trigger="t1"]'),
      'data-trigger-outcome',
      'success'
    );
    assert.equal(
      emitted.at(-1).triggers[0].outcome,
      'success',
      'choosing a segment emits the updated outcome'
    );
  });

  it('adds a trigger from the empty state, defaulting breakTools to showBreakTools', async () => {
    const emitted = [];
    const root = await mountSimple([], {
      showBreakTools: true,
      onChange: (next) => emitted.push(next)
    });
    assert.ok(root.querySelector('[data-triggers-empty]'), 'the empty state renders with no triggers');
    root.querySelector('[data-add-trigger]').click();
    const added = emitted.at(-1).triggers;
    assert.equal(added.length, 1, 'Add seeds exactly one trigger');
    assert.equal(added[0].outcome, 'none', 'a new trigger forces no outcome by default');
    assert.equal(added[0].breakTools, true, 'a new trigger defaults breakTools to showBreakTools');
    assert.deepEqual(
      added[0].tierStep,
      { mode: 'none', steps: 1, tierId: null },
      'a new trigger authors the inert tierStep default so no normalizer round trip is needed'
    );
  });

  it('disables the forcing segments for an outcomeTier condition (routed)', async () => {
    const root = await harness.mount({
      value: triggerBlock([
        { id: 'o1', condition: { type: 'outcomeTier', tierIds: ['tier-a'], outcomeKeys: [] }, outcome: 'none', breakTools: true, tierStep: { mode: 'none', steps: 1, tierId: null } }
      ]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: [{ id: 'tier-a', name: 'Critical' }],
      showBreakTools: true
    });
    expandTrigger(root, 'o1');
    const card = root.querySelector('[data-trigger="o1"]');
    const radioFor = (value) =>
      card.querySelector(`[data-trigger-outcome="${value}"] input[type="radio"]`);
    // Disabled on the RADIO, not merely a dimmed class.
    assert.ok(radioFor('success').disabled, 'the success segment is disabled for an outcomeTier condition');
    assert.ok(radioFor('failure').disabled, 'the failure segment is disabled for an outcomeTier condition');
    assert.equal(radioFor('none').disabled, false, 'No effect stays choosable');
    assert.ok(
      card.querySelector('[data-trigger-outcome="none"]').classList.contains('is-active'),
      'the outcome is pinned to No effect'
    );
    assert.ok(
      card.querySelector('[data-trigger-outcome="success"]').classList.contains('is-disabled'),
      'the disabled segment also carries the component-scoped disabled treatment'
    );
    // The outcomeTier pills still render so the trigger can break tools on a tier.
    assert.ok(root.querySelector('[data-trigger-tier="tier-a"]'), 'the tier pill renders');
  });
});

describe('CheckTriggers (mounted): tier-step effect', () => {
  it('renders the four modes on their own row for a routed check only', async () => {
    const routed = await mountRouted({ mode: 'none', steps: 1, tierId: null });
    const row = routed.querySelector('[data-trigger="r1"] [data-trigger-tier-step]');
    assert.ok(row, 'the tier-step row renders for a routed check');
    assert.deepEqual(
      [...row.querySelectorAll('[data-trigger-tier-step-mode]')].map((seg) =>
        seg.getAttribute('data-trigger-tier-step-mode')
      ),
      ['none', 'up', 'down', 'target'],
      'four modes render in order'
    );
    // Its own row under the outcome group, not a third field inside it.
    assert.ok(
      !routed.querySelector('[data-trigger-tier-step] [data-trigger-outcome]'),
      'the tier-step control is not folded into the outcome row'
    );
    harness.remount();

    const simple = await mountSimple([rollTotalTrigger]);
    expandTrigger(simple, 't1');
    assert.ok(
      !simple.querySelector('[data-trigger-tier-step]'),
      'a simple check has no tiers to step and renders no control'
    );
    harness.remount();

    const progressive = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '2d6',
      kind: 'progressive',
      showBreakTools: false
    });
    expandTrigger(progressive, 't1');
    assert.ok(
      !progressive.querySelector('[data-trigger-tier-step]'),
      'a progressive check renders no tier-step control'
    );
  });

  it('renders the tier-step control even when tool breakage is not authored here', async () => {
    // Stepping is not a breakage concept.
    const root = await mountRouted({ mode: 'up', steps: 2, tierId: null });
    assert.ok(root.querySelector('[data-trigger-tier-step]'), 'the row renders');
    assert.ok(!root.querySelector('[data-trigger-break]'), 'and the break card does not');
  });

  it('gives the outcome and tier-step controls different radio group names', async () => {
    // A shared `name` makes the browser treat both radio sets as ONE group.
    const root = await mountRouted({ mode: 'none', steps: 1, tierId: null });
    const card = root.querySelector('[data-trigger="r1"]');
    const outcomeName = card
      .querySelector('[data-trigger-outcome="none"] input[type="radio"]')
      .getAttribute('name');
    const stepName = card
      .querySelector('[data-trigger-tier-step-mode="none"] input[type="radio"]')
      .getAttribute('name');
    assert.ok(outcomeName, 'the outcome radios are named');
    assert.ok(stepName, 'the tier-step radios are named');
    assert.notEqual(outcomeName, stepName, 'the two controls are separate radio groups');

    // And the real behavioural consequence.
    chooseSegment(card, 'data-trigger-tier-step-mode', 'up');
    assert.equal(
      card.querySelector('[data-trigger-outcome="none"] input[type="radio"]').checked,
      true,
      'the outcome selection survives a tier-step choice'
    );
  });

  it('swaps the operand per mode while keeping the slot present', async () => {
    const none = await mountRouted({ mode: 'none', steps: 1, tierId: null });
    assert.ok(!none.querySelector('[data-trigger-tier-step-steps]'), 'no count input for none');
    assert.ok(!none.querySelector('[data-trigger-tier-step-target]'), 'no tier select for none');
    assert.ok(
      none.querySelector('.manager-checks-trigger-step-operand input:disabled'),
      'the slot still holds an inert disabled placeholder'
    );
    harness.remount();

    for (const mode of ['up', 'down']) {
      const relative = await mountRouted({ mode, steps: 3, tierId: null });
      const input = relative.querySelector('[data-trigger-tier-step-steps]');
      assert.ok(input, `${mode} renders a count input`);
      assert.equal(input.getAttribute('min'), '1', 'the count cannot go below one step');
      assert.equal(input.value, '3', 'the count reads back the authored magnitude');
      assert.ok(input.getAttribute('aria-label'), `${mode} labels its operand`);
      assert.ok(
        !relative.querySelector('[data-trigger-tier-step-target]'),
        `${mode} renders no tier select`
      );
      harness.remount();
    }

    const target = await mountRouted({ mode: 'target', steps: 1, tierId: 'tier-b' });
    assert.ok(target.querySelector(TIER_TARGET), 'target renders the tier control');
    assert.equal(
      selectTriggerText(target, TIER_TARGET),
      'Masterwork',
      'the trigger reads back the persisted tier by name'
    );
    assert.ok(!target.querySelector('[data-trigger-tier-step-steps]'), 'and no count input');
  });

  it('never shows a tier it has not persisted: a null tierId shows the placeholder', async () => {
    const root = await mountRouted({ mode: 'target', steps: 1, tierId: null });
    assert.equal(
      selectTriggerText(root, TIER_TARGET),
      breakageKeys.TierStepChoose,
      'nothing chosen reads as nothing chosen'
    );
    assert.ok(
      Boolean(
        root
          .querySelector(`${TIER_TARGET} .fabricate-select-value`)
          .classList.contains('fabricate-select-value-placeholder')
      ),
      'and reads as the placeholder rather than as a chosen value'
    );
    // The real defect this guards: without a placeholder the trigger would state the FIRST
    // tier, so a GM would read "Ruined" off a check that persists null.
    assert.deepEqual(
      selectOptionValues(root, TIER_TARGET),
      ['tier-a', 'tier-b'],
      'and the placeholder is the trigger’s own text, never a re-choosable row in the list'
    );
  });

  it('shows a dangling target as a Missing tier row plus an invalid field', async () => {
    const root = await mountRouted({ mode: 'target', steps: 1, tierId: 'tier-gone' });
    assert.equal(
      selectTriggerText(root, TIER_TARGET),
      breakageKeys.TierStepMissingTier,
      'the dangling id stays selected, not silently remapped'
    );
    const rows = selectOptionValues(root, TIER_TARGET);
    assert.deepEqual(rows, ['tier-a', 'tier-b', 'tier-gone'], 'appended as its own row, last');
    assert.equal(
      root
        .querySelector('[data-popover-option="tier-gone"]')
        .getAttribute('aria-disabled'),
      'true',
      'and cannot be re-chosen'
    );
    assert.equal(
      root.querySelector(TIER_TARGET).getAttribute('aria-invalid'),
      'true',
      'the trigger carries the invalid treatment the deleted `.is-invalid select` rule painted'
    );
    assert.ok(
      !root.querySelector('.manager-checks-trigger-step-operand.is-invalid'),
      'and the slot carries no state class the sheet no longer paints anything from'
    );
  });

  it('shows its OWN no-tiers cue for a target on a tier-less check', async () => {
    const root = await mountRouted({ mode: 'target', steps: 1, tierId: null }, {
      outcomeOptions: []
    });
    const cue = root.querySelector('[data-trigger-step-no-tiers]');
    assert.ok(cue, 'the tier-step cue renders');
    assert.equal(cue.textContent.trim(), breakageKeys.TierStepNoTiers);
    // Distinct from the outcomeTier CONDITION's cue.
    assert.ok(
      !root.querySelector('[data-trigger-no-tiers]'),
      'the condition cue is a different hook and does not render here'
    );
    // The mode control itself stays visible so an authored target is never hidden.
    assert.ok(
      root.querySelector('[data-trigger-tier-step-mode="target"]').classList.contains('is-active'),
      'the authored target mode is still shown'
    );
  });

  it('emits the whole tierStep record on every edit, retaining the other mode’s operand', async () => {
    const emitted = [];
    const root = await mountRouted(
      { mode: 'up', steps: 2, tierId: 'tier-b' },
      { onChange: (next) => emitted.push(next) }
    );
    const card = root.querySelector('[data-trigger="r1"]');

    chooseSegment(card, 'data-trigger-tier-step-mode', 'target');
    assert.deepEqual(
      emitted.at(-1).triggers[0].tierStep,
      { mode: 'target', steps: 2, tierId: 'tier-b' },
      'switching mode keeps the other mode’s operand (flat record, not a union)'
    );

    const input = card.querySelector('[data-trigger-tier-step-steps]');
    input.value = '0';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    assert.equal(
      emitted.at(-1).triggers[0].tierStep.steps,
      1,
      'a zero magnitude clamps to a usable one-tier step'
    );
  });

  it('writes the chosen tier id onto the tierStep record', async () => {
    const emitted = [];
    const root = await mountRouted(
      { mode: 'target', steps: 1, tierId: null },
      { onChange: (next) => emitted.push(next) }
    );
    assert.equal(
      assertSelectHasResolvedName(root, TIER_TARGET),
      breakageKeys.TierStepTier,
      'the tier control names itself, the slot caption beside it naming the AMOUNT'
    );
    chooseSelectOption(root, TIER_TARGET, 'tier-a');
    assert.equal(emitted.at(-1).triggers[0].tierStep.tierId, 'tier-a', 'the chosen tier persists');
  });

  it('lets an outcomeTier-conditioned trigger step even though it cannot force', async () => {
    const emitted = [];
    const root = await harness.mount({
      value: triggerBlock([
        routedTrigger(
          { mode: 'none', steps: 1, tierId: null },
          { condition: { type: 'outcomeTier', tierIds: ['tier-a'], outcomeKeys: [] } }
        )
      ]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false,
      onChange: (next) => emitted.push(next)
    });
    expandTrigger(root, 'r1');
    const card = root.querySelector('[data-trigger="r1"]');
    assert.ok(
      card.querySelector('[data-trigger-outcome="success"] input[type="radio"]').disabled,
      'forcing stays pinned off'
    );
    for (const value of ['none', 'up', 'down', 'target']) {
      assert.equal(
        card.querySelector(`[data-trigger-tier-step-mode="${value}"] input[type="radio"]`).disabled,
        false,
        `the ${value} step mode stays live for an outcomeTier condition`
      );
    }
    chooseSegment(card, 'data-trigger-tier-step-mode', 'down');
    assert.equal(emitted.at(-1).triggers[0].tierStep.mode, 'down', 'the step is authored');
  });
  // Issue 1050's keyboard non-regression entry.
  it('still steps the condition value from the keyboard', async () => {
    const emitted = [];
    const root = await mountSimple([rollTotalTrigger], { onChange: (next) => emitted.push(next) });
    expandTrigger(root, 't1');
    const field = root.querySelector('[data-trigger="t1"] [data-trigger-value]');
    assert.equal(
      stepMigratedNumberField(field, 'up', 'the condition value field'),
      '4',
      'ArrowUp steps the displayed value'
    );
    assert.equal(
      emitted.at(-1).triggers[0].condition.value,
      4,
      'and the step reaches the trigger through the commit path'
    );
  });
});

// ── THE COLLAPSED HEAD AND ITS DISCLOSURE (issue 1096) ─────────────────────────────────
describe('CheckTriggers (mounted): the collapsed head', () => {
  const stepUp = {
    id: 'u1',
    condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 20 },
    outcome: 'none',
    breakTools: false,
    tierStep: { mode: 'up', steps: 1, tierId: null }
  };
  const stepDown = {
    id: 'd1',
    condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 1 },
    outcome: 'none',
    breakTools: false,
    tierStep: { mode: 'down', steps: 2, tierId: null }
  };

  function mountPair(overrides = {}) {
    return harness.mount({
      value: triggerBlock([stepUp, stepDown]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false,
      ...overrides
    });
  }

  it('draws no card around the list: the triggers sit in the pane', async () => {
    const root = await mountPair();
    // The invented `Check triggers` wrapper is what the structural parity pass reported as an
    // EXTRA CARD. Its class is the tell: a `manager-inspector-card` around the whole list.
    assert.ok(
      !root.querySelector('.manager-inspector-card [data-trigger]'),
      'no card wraps the trigger list'
    );
    assert.ok(
      Boolean(root.querySelector('[data-check-triggers] > .manager-checks-trigger-list')),
      'the list is a direct child of the route wrapper'
    );
  });

  it('states each trigger’s condition, effect, glyph and result chip while collapsed', async () => {
    const root = await mountPair();
    const up = root.querySelector('[data-trigger="u1"]');
    assert.equal(
      up.querySelector('[data-trigger-summary="u1"]').textContent.trim(),
      'Group total of 1d20 is exactly 20',
      'the title summarises the condition rather than repeating the word When'
    );
    assert.ok(
      Boolean(up.querySelector('.manager-checks-trigger-glyph.is-info i.fa-arrow-up')),
      'a step-up wears the up-arrow tile in the info family'
    );
    assert.equal(
      up.querySelector('[data-trigger-chip="u1"]').textContent.trim(),
      'Step up 1',
      'and its chip states the effect'
    );

    const down = root.querySelector('[data-trigger="d1"]');
    assert.ok(
      Boolean(down.querySelector('.manager-checks-trigger-glyph.is-warning i.fa-arrow-down')),
      'a step-down wears the down-arrow tile in the warning family'
    );
    assert.equal(down.querySelector('[data-trigger-chip="d1"]').textContent.trim(), 'Step down 2');

    // Collapsed means collapsed: none of the authoring controls is in the document.
    assert.ok(!root.querySelector('[data-trigger-condition-type]'), 'no condition control renders');
    assert.ok(!root.querySelector('[data-trigger-tier-step]'), 'no tier-step row renders');
  });

  it('opens ONE trigger at a time and closes the one it replaces', async () => {
    const root = await mountPair();
    expandTrigger(root, 'u1');
    assert.ok(Boolean(root.querySelector('[data-trigger-body="u1"]')), 'the first trigger is open');

    root.querySelector('[data-trigger-disclosure="d1"]').click();
    flushSync();
    assert.ok(Boolean(root.querySelector('[data-trigger-body="d1"]')), 'the second trigger opens');
    assert.ok(
      !root.querySelector('[data-trigger-body="u1"]'),
      'and the first one closes rather than stacking'
    );

    // Clicking the open one again closes it.
    root.querySelector('[data-trigger-disclosure="d1"]').click();
    flushSync();
    assert.ok(!root.querySelector('[data-trigger-body="d1"]'), 'the head toggles rather than pins');
    assert.equal(
      root.querySelector('[data-trigger-disclosure="d1"]').getAttribute('aria-expanded'),
      'false',
      'and says so on the control'
    );
  });

  it('SCROLLS a newly added trigger into view, opened', async () => {
    // The defect this closes: a preset-authored trigger landed at the foot of a list taller
    // than the pane, so clicking the preset looked like it did nothing at all.
    const scrolled = [];
    const original = globalThis.Element.prototype.scrollIntoView;
    globalThis.Element.prototype.scrollIntoView = function record(options) {
      scrolled.push({ node: this, options });
    };
    try {
      const emitted = [];
      const root = await mountPair({ onChange: (next) => emitted.push(next) });
      root.querySelector('[data-add-trigger]').click();
      // The parent owns the list, so feed the emitted block back the way one would.
      await harness.setProps({ value: emitted.at(-1) });
      const added = emitted.at(-1).triggers.at(-1);
      assert.ok(
        Boolean(root.querySelector(`[data-trigger-body="${added.id}"]`)),
        'the new trigger arrives open, ready to author'
      );
      assert.equal(scrolled.length, 1, 'exactly one scroll was requested');
      assert.equal(
        scrolled[0].node.getAttribute('data-trigger'),
        added.id,
        'and it was the new card that was scrolled to'
      );
      assert.deepEqual(
        scrolled[0].options,
        { block: 'nearest' },
        'nearest, so an already-visible card does not move the pane'
      );
    } finally {
      globalThis.Element.prototype.scrollIntoView = original;
    }
  });

  it('reads the comparison in words, not in operator symbols', async () => {
    const root = await mountPair();
    expandTrigger(root, 'u1');
    assert.deepEqual(
      selectOptionValues(root, OPERATOR),
      ['==', '>=', '<=', '>', '<'],
      'every persisted operator is still offered'
    );
    assert.deepEqual(
      selectOptionLabels(root, OPERATOR),
      [
        breakageKeys.OpSelectExactly,
        breakageKeys.OpSelectAtLeast,
        breakageKeys.OpSelectAtMost,
        breakageKeys.OpSelectOver,
        breakageKeys.OpSelectUnder
      ],
      'and each reads as a comparison a GM can say out loud'
    );
    assert.equal(selectOptionLabels(root, OPERATOR)[0], 'is exactly', 'not "=="');
  });

  it('CHOOSING a comparison writes it onto the condition', async () => {
    const emitted = [];
    const root = await mountPair({ onChange: (next) => emitted.push(next) });
    expandTrigger(root, 'u1');
    const operator = `[data-trigger="u1"] ${OPERATOR}`;
    assert.equal(
      assertSelectHasResolvedName(root, operator),
      breakageKeys.Operator,
      'the demoted wrapper’s caption still names the control'
    );
    chooseSelectOption(root, operator, '>=');
    assert.equal(emitted.at(-1).triggers[0].condition.operator, '>=');
  });

  it('CHOOSING a condition type re-authors the whole condition record', async () => {
    const emitted = [];
    const root = await mountPair({ onChange: (next) => emitted.push(next) });
    expandTrigger(root, 'u1');
    const when = `[data-trigger="u1"] ${CONDITION_TYPE}`;
    assert.equal(
      assertSelectHasResolvedName(root, when),
      breakageKeys.ConditionType,
      'the demoted wrapper’s caption still names the control'
    );
    assert.deepEqual(
      selectOptionValues(root, when),
      ['rollTotal', 'diceGroup', 'outcomeTier'],
      'a routed check offers no progressive value'
    );
    chooseSelectOption(root, when, 'outcomeTier');
    assert.deepEqual(
      emitted.at(-1).triggers[0].condition,
      { type: 'outcomeTier', tierIds: [], outcomeKeys: [] },
      'the type is not patched onto the old record: the default for the new type replaces it'
    );
    assert.equal(
      emitted.at(-1).triggers[0].outcome,
      'none',
      'and an outcomeTier condition cannot force, so the outcome is pinned with it'
    );
  });

  it('CHOOSING a dice group writes a NUMERIC groupId, not the row’s string', async () => {
    const emitted = [];
    const root = await harness.mount({
      value: triggerBlock([
        {
          id: 'g1',
          condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
          outcome: 'none',
          breakTools: false,
          tierStep: { mode: 'none', steps: 1, tierId: null }
        }
      ]),
      rollFormula: '1d20 + 2d6',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false,
      onChange: (next) => emitted.push(next)
    });
    expandTrigger(root, 'g1');
    assert.equal(assertSelectHasResolvedName(root, DICE_GROUP), breakageKeys.Group);
    assert.deepEqual(
      selectOptionLabels(root, DICE_GROUP),
      ['1d20', '2d6'],
      'the groups read as the dice a GM typed, in evaluated-term order'
    );
    chooseSelectOption(root, DICE_GROUP, '1');
    assert.strictEqual(
      emitted.at(-1).triggers[0].condition.groupId,
      1,
      'the engine indexes `roll.dice` by NUMBER, so a forwarded "1" would match no group'
    );

    assert.equal(assertSelectHasResolvedName(root, AGGREGATE), breakageKeys.Aggregate);
    assert.deepEqual(selectOptionValues(root, AGGREGATE), [
      'total',
      'anyDie',
      'allDice',
      'lowestDie',
      'highestDie'
    ]);
    chooseSelectOption(root, AGGREGATE, 'lowestDie');
    assert.equal(
      emitted.at(-1).triggers[0].condition.aggregate,
      'lowestDie',
      'and the measure is written onto the same condition'
    );
  });

  it('TYPING a threshold writes it: the value is a plain input, not a stepper', async () => {
    const emitted = [];
    const root = await mountPair({ onChange: (next) => emitted.push(next) });
    expandTrigger(root, 'u1');
    const field = root.querySelector('[data-trigger="u1"] [data-trigger-value]');
    assert.equal(field.tagName, 'INPUT', 'the value is the input itself');
    assert.ok(
      !root.querySelector('[data-trigger="u1"] .manager-checks-breakage-condition .fab-stepper'),
      'the condition row carries no stepper'
    );
    field.value = '17';
    field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    assert.equal(emitted.at(-1).triggers[0].condition.value, 17, 'typing reaches the commit path');
  });

  it('closes the expanded body with a quotation restating the whole rule', async () => {
    const root = await mountPair();
    expandTrigger(root, 'd1');
    const quote = root.querySelector('[data-trigger-quote="d1"]');
    assert.ok(Boolean(quote), 'the expanded trigger ends with its own summary line');
    assert.equal(
      quote.querySelector('span').textContent.trim(),
      'When group total of 1d20 is exactly 1, the result steps down 2 tier(s).'
    );
    assert.ok(Boolean(quote.querySelector('i.fa-quote-left')), 'quotation-marked');
  });
});

// ── The common-trigger presets, THROUGH THE RENDERED CONTROL (issue 1096) ──────────────
describe('the common-trigger presets author a trigger when CLICKED', () => {
  it('renders a preset button per offered preset for a routed check', async () => {
    const root = await harness.mount({
      value: triggerBlock([]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false
    });
    const buttons = [...root.querySelectorAll('[data-add-trigger-preset]')];
    assert.equal(buttons.length, 2, 'both presets render');
    assert.equal(buttons[0].tagName, 'BUTTON', 'the preset is a real button');
    assert.equal(buttons[0].disabled, false, 'and it is not disabled');
  });

  it('CLICKING a preset emits a fully authored trigger', async () => {
    const emitted = [];
    const root = await harness.mount({
      value: triggerBlock([]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false,
      onChange: (next) => emitted.push(next)
    });

    root.querySelector('[data-add-trigger-preset="high"]').click();
    assert.equal(emitted.length, 1, 'the click reached the handler');
    const trigger = emitted.at(-1).triggers.at(-1);
    assert.deepEqual(trigger.condition, {
      type: 'diceGroup',
      groupId: 0,
      aggregate: 'anyDie',
      operator: '==',
      value: 20
    });
    assert.deepEqual(trigger.tierStep, { mode: 'up', steps: 1, tierId: null });
    assert.ok(trigger.id, 'it carries a real id');
  });

  it('APPENDS to the existing list rather than replacing it', async () => {
    const emitted = [];
    const root = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false,
      onChange: (next) => emitted.push(next)
    });
    root.querySelector('[data-add-trigger-preset="low"]').click();
    assert.deepEqual(
      emitted.at(-1).triggers.map((entry) => entry.id.slice(0, 2)),
      ['t1', emitted.at(-1).triggers.at(-1).id.slice(0, 2)],
      'the authored trigger survives'
    );
    assert.equal(emitted.at(-1).triggers.length, 2);
  });

  it('offers no preset row at all when the formula rolls no dice', async () => {
    const root = await harness.mount({
      value: triggerBlock([]),
      rollFormula: '@abilities.int.mod',
      kind: 'routed',
      outcomeOptions: ROUTED_TIERS,
      showBreakTools: false
    });
    assert.equal(root.querySelector('[data-check-trigger-presets]'), null);
  });
});
