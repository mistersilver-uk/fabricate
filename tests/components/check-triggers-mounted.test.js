import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { stepMigratedNumberField } from '../helpers/numericKeyboardStep.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Real en.json so the tests assert LOCALIZED copy resolves — not the component's
// inline text() fallback (which would mask a missing or renamed key). The unified
// trigger editor is keyed under FABRICATE.Admin.Manager.Checks.Breakage (+ a few
// reused Crafting keys for the award/break labels).
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}

// Use the shared mounted-component harness; do not re-inline compile/mount
// boilerplate (it duplicates the other mount tests and trips the duplication gate).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-triggers-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/utils/craftingCheckExpression.js'
  ],
  compiledModules: [
    // The shipped segmented primitive: the outcome toggle and the tier-step mode
    // control both render it (issue 975). The harness validates the STATIC import
    // closure of every declared module, so this entry is required whether or not a
    // given test renders it.
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    // The shared numeric stepper: the condition Value field and the tier-step operand are
    // both built on it (issue 1050), and the same static-closure rule applies.
    'src/ui/svelte/components/Stepper.svelte',
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

// The segmented control's real control is the visually hidden radio — the `<label>`
// is only the styled surface. This is the idiom every other SegmentedControl consumer
// test uses (`selectRadio` in crafting-settings-view-mounted.test.js): set `.checked`,
// then dispatch a bubbling `change`. A bare `.click()` on the label is NOT it.
function chooseSegment(root, optionDataAttr, value) {
  const radio = root.querySelector(`[${optionDataAttr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `a radio exists for ${optionDataAttr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  return radio;
}

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

function mountRouted(tierStep, { outcomeOptions = ROUTED_TIERS, onChange } = {}) {
  return harness.mount({
    value: triggerBlock([routedTrigger(tierStep)]),
    rollFormula: '1d20',
    kind: 'routed',
    outcomeOptions,
    showBreakTools: false,
    ...(onChange ? { onChange } : {})
  });
}

/**
 * The simple-check mount: one `1d20` check over `triggers`, with the break pills off.
 *
 * The sibling of `mountRouted` above and there for the same reason — seven cases spelled out the
 * same four props to say "a simple check over 1d20", which is one call written seven times, and
 * SonarCloud counts duplication in `tests/**` exactly as it does in `src/`.
 */
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
    const labels = [...root.querySelectorAll('[data-trigger-outcome]')].map((b) =>
      b.textContent.trim()
    );
    assert.deepEqual(
      labels,
      [craftingKeys.AwardAll, breakageKeys.OutcomeForceNone, craftingKeys.AwardNone],
      'progressive reuses the Award all / Award none copy'
    );
  });

  it('gates the break-tools pill on showBreakTools (authority)', async () => {
    const hidden = await mountSimple([rollTotalTrigger]);
    assert.equal(
      hidden.querySelector('[data-trigger-break]'),
      null,
      'no break pill when showBreakTools is false (toolSpecific)'
    );
    harness.remount();

    const shown = await mountSimple([rollTotalTrigger], { showBreakTools: true });
    assert.ok(
      shown.querySelector('[data-trigger-break]'),
      'the break pill renders when showBreakTools is true (checkDriven)'
    );
  });

  it('toggles a trigger outcome through the segmented control and emits the new block', async () => {
    const emitted = [];
    const root = await mountSimple([rollTotalTrigger], { onChange: (next) => emitted.push(next) });
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
    const card = root.querySelector('[data-trigger="o1"]');
    const radioFor = (value) =>
      card.querySelector(`[data-trigger-outcome="${value}"] input[type="radio"]`);
    // Disabled on the RADIO, not merely a dimmed class: `select()` guards only
    // `next !== value`, so a live-but-dimmed segment would still force an outcome and
    // re-open the circularity this pin exists to prevent.
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
    // The row is a sibling of the outcome/break row, not a third field inside it.
    assert.ok(
      !routed.querySelector('.manager-checks-trigger-bottom [data-trigger-tier-step]'),
      'the tier-step control is not folded into the outcome/break row'
    );
    harness.remount();

    const simple = await mountSimple([rollTotalTrigger]);
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
    assert.ok(
      !progressive.querySelector('[data-trigger-tier-step]'),
      'a progressive check renders no tier-step control'
    );
  });

  it('renders the tier-step control even when tool breakage is not authored here', async () => {
    // Stepping is not a breakage concept: gating it on showBreakTools would hide it
    // under toolSpecific authority, which has nothing to do with tiers.
    const root = await mountRouted({ mode: 'up', steps: 2, tierId: null });
    assert.ok(root.querySelector('[data-trigger-tier-step]'), 'the row renders');
    assert.ok(!root.querySelector('[data-trigger-break]'), 'and the break pill does not');
  });

  it('gives the outcome and tier-step controls different radio group names', async () => {
    // A shared `name` makes the browser treat both radio sets as ONE group, so
    // choosing a tier-step mode would silently uncheck the outcome radio.
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

    // And the real behavioural consequence: choosing a step mode leaves the outcome
    // radio checked.
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
    const select = target.querySelector('[data-trigger-tier-step-target]');
    assert.ok(select, 'target renders the tier select');
    assert.equal(select.value, 'tier-b', 'the select reads back the persisted tier');
    assert.ok(!target.querySelector('[data-trigger-tier-step-steps]'), 'and no count input');
  });

  it('never shows a tier it has not persisted: a null tierId selects the placeholder', async () => {
    const root = await mountRouted({ mode: 'target', steps: 1, tierId: null });
    const select = root.querySelector('[data-trigger-tier-step-target]');
    assert.equal(select.value, '', 'nothing chosen reads as nothing chosen');
    const placeholder = select.querySelector('option[value=""]');
    assert.ok(placeholder, 'a placeholder option renders');
    assert.equal(placeholder.disabled, true, 'the placeholder cannot be re-chosen');
    // The real defect this guards: a <select> whose value matches no option renders
    // its FIRST option as selected, so without the placeholder a GM would read
    // "Ruined" off a check that persists null.
    assert.notEqual(
      select.options[select.selectedIndex].value,
      'tier-a',
      'the first real tier is not silently displayed as the selection'
    );
  });

  it('shows a dangling target as a Missing tier option plus an invalid field', async () => {
    const root = await mountRouted({ mode: 'target', steps: 1, tierId: 'tier-gone' });
    const select = root.querySelector('[data-trigger-tier-step-target]');
    assert.equal(select.value, 'tier-gone', 'the dangling id stays selected, not silently remapped');
    const dangling = select.querySelector('option[value="tier-gone"]');
    assert.ok(dangling, 'the dangling id is appended as its own option');
    assert.equal(dangling.disabled, true, 'and cannot be re-chosen');
    assert.equal(dangling.textContent.trim(), breakageKeys.TierStepMissingTier);
    assert.ok(
      root.querySelector('.manager-checks-trigger-step-operand.is-invalid'),
      'the field carries the invalid treatment'
    );
  });

  it('shows its OWN no-tiers cue for a target on a tier-less check', async () => {
    const root = await mountRouted({ mode: 'target', steps: 1, tierId: null }, {
      outcomeOptions: []
    });
    const cue = root.querySelector('[data-trigger-step-no-tiers]');
    assert.ok(cue, 'the tier-step cue renders');
    assert.equal(cue.textContent.trim(), breakageKeys.TierStepNoTiers);
    // Distinct from the outcomeTier CONDITION's cue: a trigger that is both
    // outcomeTier-conditioned and target-stepping must not carry two identically
    // hooked nodes in one card.
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
    const select = root.querySelector('[data-trigger-tier-step-target]');
    select.value = 'tier-a';
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
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
  // Issue 1050, Phase 2's keyboard non-regression entry. The condition Value field is a bare
  // `type="number"` no longer — it is a `Stepper`, which owns NO keydown handler, so Up/Down are
  // native `<input type="number">` behaviour and the only things keeping them alive are that the
  // element stays a number input and that its `input` event still reaches the commit path.
  // `stepUp()` throws on a non-steppable input, so a drift to `type="text"` fails here rather
  // than silently shipping a click-only control.
  it('still steps the condition value from the keyboard', async () => {
    const emitted = [];
    const root = await mountSimple([rollTotalTrigger], { onChange: (next) => emitted.push(next) });
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
