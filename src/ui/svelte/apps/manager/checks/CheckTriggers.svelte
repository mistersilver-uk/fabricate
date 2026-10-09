<!-- Svelte 5 runes mode -->
<!--
  Unified per-check trigger editor. One trigger list per check, ALWAYS rendered, each pairing an
  expressive dice-matching CONDITION with three effects: `outcome` forces an automatic success or
  failure under BOTH breakage authorities; `breakTools` is authored and applied ONLY under
  `checkDriven`; and `tierStep` moves the rolled outcome tier, routed only and deliberately NOT
  gated on `showBreakTools`, stepping not being a breakage concept.

  An `outcomeTier` condition cannot force an outcome — the routed tier resolves AFTER the forced
  outcome would run — so its outcome segments are pinned to No effect and disabled. It CAN step.

  Controlled. Dice groups come from `triggerDiceGroups`, so a `diceGroup` trigger targets a group
  by its evaluated-term index, and `kind` selects which condition types are offered. A counting
  check reads its pool as the one group and its total as net successes (issue 2006). Each trigger
  is a collapsible `RuleRow`, and the presets are the unauthored one (issue 1782).
-->
<script>
  import Field from '../../../components/Field.svelte';
  import Button from '../../../components/Button.svelte';
  import Select from '../../../components/Select.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import { interpolate } from './checksCopy.js';
  import {
    buildPresetTrigger,
    checkTriggerPresets,
    countPoolDiceGroup,
    triggerDiceGroups,
  } from './checkTriggerPresets.js';
  import {
    TIER_LIST_JOIN,
    summariseCondition,
    summariseHeadline,
    summariseRule,
  } from './checkTriggerSummary.js';
  import {
    CONDITION_OPERATORS,
    DICE_AGGREGATES,
    conditionTypesFor,
    diceGroupOptions,
    localizedOptions,
    tierStepTargetOptions,
  } from './checksSelectOptions.js';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import RuleRow from '../../../components/RuleRow.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    value = null,
    rollFormula = '',
    kind = 'simple',
    outcomeOptions = [],
    showBreakTools = false,
    // The check's evaluation: a roll-under check's best face is 1, so the presets follow it.
    evaluation = null,
    // A routed check's lowest-ranked tier, which the count Botch preset targets.
    lowestTierId = null,
    onChange = () => {},
  } = $props();

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const triggers = $derived(Array.isArray(value?.triggers) ? value.triggers : []);

  // Dice groups in evaluated-term order; a counting check reads its pool as the one group.
  const diceGroups = $derived(triggerDiceGroups({ evaluation, rollFormula }, localizeOr));
  const counting = $derived(countPoolDiceGroup(evaluation) !== null);

  const firstD20GroupId = $derived(diceGroups.find((group) => group.sides === 20)?.groupId ?? null);

  // The five converted lists' vocabularies and their picker rows (issue 1510). `conditionTypes`
  // keeps its `{value, labelKey}` shape because `addTrigger` reads the first entry's value.
  const conditionTypes = $derived(conditionTypesFor(kind, { counting }));
  const conditionTypeOptions = $derived(localizedOptions(conditionTypes, localizeOr));
  const aggregateOptions = $derived(localizedOptions(DICE_AGGREGATES, localizeOr));
  const operatorOptions = $derived(localizedOptions(CONDITION_OPERATORS, localizeOr));
  const diceGroupRows = $derived(diceGroupOptions(diceGroups));

  // Outcome toggle segments, good→neutral→bad so the neutral default sits in the middle; a
  // progressive check has no pass/fail, only a value, so it relabels.
  const outcomeChoices = $derived(
    kind === 'progressive'
      ? [
          {
            value: 'success',
            variant: 'success',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardAll',
            fallback: 'Award all',
          },
          {
            value: 'none',
            variant: 'neutral',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone',
            fallback: 'No effect',
          },
          {
            value: 'failure',
            variant: 'danger',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardNone',
            fallback: 'Award none',
          },
        ]
      : [
          {
            value: 'success',
            variant: 'success',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceSuccess',
            fallback: 'Automatic success',
          },
          {
            value: 'none',
            variant: 'neutral',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone',
            fallback: 'No effect',
          },
          {
            value: 'failure',
            variant: 'danger',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceFailure',
            fallback: 'Automatic failure',
          },
        ]
  );

  // DISABLED on the radio itself, not merely dimmed, for an outcomeTier condition: that pin
  // is what keeps forcing non-circular.
  function outcomeSegments(isOutcomeTier) {
    return outcomeChoices.map((option) => ({
      ...option,
      disabled: isOutcomeTier && option.value !== 'none',
    }));
  }

  // The tier-step effect's four modes, for routed checks only.
  const TIER_STEP_MODES = [
    {
      value: 'none',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeNone',
      fallback: 'No step',
    },
    {
      value: 'up',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeUp',
      fallback: 'Step up',
    },
    {
      value: 'down',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeDown',
      fallback: 'Step down',
    },
    {
      value: 'target',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeTarget',
      fallback: 'Target tier',
    },
  ];

  const tierStepLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStep', 'Tier step')
  );
  const tierStepModeLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStepMode', 'Tier step mode')
  );

  // The tier-step operand's only name is "Steps up"/"Steps down", so the shared adjuncts
  // parametrized with it read as "Decrease Steps up"; they take the ROW's label instead, and
  // only `ariaLabel` is overridden after the spread.
  const tierStepAdjunctLabels = $derived(stepperLabels(tierStepLabel));
  const conditionValueLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.Value', 'Value')
  );

  // The expanded body's micro-labels. `TierStep`/`OutcomeColumn` stay the CONTROL's own
  // accessible names, a radiogroup announced as "And the tier moves" reading as a fragment.
  const conditionLegend = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.ConditionLegend', 'Condition')
  );
  const outcomeLegend = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeLegend', 'And the outcome')
  );
  const tierStepLegend = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStepLegend', 'And the tier moves')
  );
  const tierStepAmountLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStepAmount', 'By how many')
  );

  // THE LIST COLLAPSES: at most ONE trigger is open and none on arrival, three full editors
  // being taller than the pane — which is why authoring a preset looked inert. So a new
  // trigger OPENS, and an opened `RuleRow` scrolls itself to the nearest view.
  let expandedId = $state(null);
  let route = $state(null);

  function toggleExpanded(id) {
    expandedId = expandedId === id ? null : id;
  }

  function emit(nextTriggers) {
    onChange({ triggers: Array.isArray(nextTriggers) ? nextTriggers : [] });
  }

  function defaultConditionFor(type) {
    if (type === 'rollTotal') return { type, operator: '<=', value: 1 };
    if (type === 'progressiveValue') return { type, operator: '>=', value: 1 };
    if (type === 'outcomeTier') return { type, tierIds: [], outcomeKeys: [] };
    return {
      type: 'diceGroup',
      groupId: firstD20GroupId ?? diceGroups[0]?.groupId ?? 0,
      aggregate: 'anyDie',
      operator: '==',
      value: 1,
    };
  }

  /** Appends an authored trigger and opens it, for `addTrigger`'s reason. */
  function appendTrigger(trigger) {
    if (!trigger) return;
    expandedId = trigger.id;
    emit([...triggers, trigger]);
  }

  function addTrigger() {
    const type = conditionTypes[0]?.value || 'rollTotal';
    appendTrigger({
      id: newId(),
      condition: defaultConditionFor(type),
      outcome: 'none',
      // Default a new trigger to breaking tools only where that effect is reachable.
      breakTools: showBreakTools === true,
      // Authored here, so a freshly added trigger and a saved-then-reloaded one are one object.
      tierStep: { mode: 'none', steps: 1, tierId: null },
    });
  }

  function replaceTrigger(id, next) {
    emit(triggers.map((trigger) => (trigger.id === id ? next : trigger)));
  }

  // The last trigger gone, focus lands on the control that grows the list again.
  function removeTrigger(id) {
    if (expandedId === id) expandedId = null;
    const last = triggers.length === 1;
    emit(triggers.filter((trigger) => trigger.id !== id));
    if (last) route?.querySelector('[data-add-trigger]')?.focus();
  }

  function withCondition(trigger, patch) {
    return { ...trigger, condition: { ...(trigger.condition || {}), ...patch } };
  }

  // Switching to an outcomeTier condition cannot force an outcome → pin to none.
  function withConditionType(trigger, type) {
    const next = { ...trigger, condition: defaultConditionFor(type) };
    return type === 'outcomeTier' ? { ...next, outcome: 'none' } : next;
  }

  function outcomeFor(trigger) {
    const current = trigger?.outcome;
    return current === 'success' || current === 'failure' ? current : 'none';
  }

  function isOutcomeSelected(condition, id) {
    return Array.isArray(condition?.tierIds) && condition.tierIds.includes(id);
  }

  // The trigger's tierStep effect, read defensively because an older trigger may carry none,
  // and FLAT, so switching mode never destroys the other mode's operand.
  function tierStepFor(trigger) {
    const source =
      trigger?.tierStep && typeof trigger.tierStep === 'object' ? trigger.tierStep : {};
    const steps = Number(source.steps);
    const tierId = typeof source.tierId === 'string' ? source.tierId.trim() : '';
    return {
      mode: ['none', 'target', 'up', 'down'].includes(source.mode) ? source.mode : 'none',
      steps: Number.isFinite(steps) ? Math.max(1, Math.trunc(steps)) : 1,
      tierId: tierId || null,
    };
  }

  function withTierStep(trigger, patch) {
    return { ...trigger, tierStep: { ...tierStepFor(trigger), ...patch } };
  }

  // A target naming no tier on the ACTIVE list, reachable by ordinary authoring: the
  // relative↔fixed switch dangles every `tierId` at once.
  function isDanglingTarget(step) {
    return Boolean(step.tierId) && !outcomeOptions.some((option) => option.id === step.tierId);
  }

  function withOutcomeTierToggled(trigger, optionId) {
    const current = Array.isArray(trigger?.condition?.tierIds) ? trigger.condition.tierIds : [];
    const next = current.includes(optionId)
      ? current.filter((value) => value !== optionId)
      : [...current, optionId];
    return withCondition(trigger, { tierIds: next });
  }

  // What each trigger says about itself, composed by the pure `checkTriggerSummary` module;
  // this is only the localization bridge, hence the `{ key, fallback }` fragments.
  const unnamedTier = $derived(
    localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier', 'Unnamed tier')
  );
  const tierNames = $derived(
    Object.fromEntries(
      (outcomeOptions ?? []).map((option) => [option.id, option.name || unnamedTier])
    )
  );
  const summaryContext = $derived({
    diceGroups,
    tierNames,
    tierJoin: localizeOr(TIER_LIST_JOIN.key, TIER_LIST_JOIN.fallback),
    counting,
    progressive: kind === 'progressive',
    showBreakTools,
  });

  /** Resolve one fragment, filling any nested fragment in its data first. */
  function phrase(fragment) {
    const data = Object.fromEntries(
      Object.entries(fragment.data ?? {}).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' ? localizeOr(entry.key, entry.fallback) : entry,
      ])
    );
    return interpolate(localizeOr(fragment.key, fragment.fallback), data);
  }

  /** The collapsed head: the condition as its title, and the effect's glyph, tone and chip. */
  function headOf(trigger) {
    const headline = summariseHeadline(trigger, summaryContext);
    return {
      glyph: headline.glyph,
      tone: headline.tone,
      title: phrase(summariseCondition(trigger?.condition ?? {}, summaryContext)),
      chip: headline.chip ? phrase(headline.chip) : null,
    };
  }

  const triggerSchema = $derived({
    head: headOf,
    steps: [
      { key: 'condition', legend: conditionLegend, render: conditionStep },
      { key: 'outcome', render: outcomeStep },
      ...(kind === 'routed' ? [{ key: 'tierStep', render: tierStepStep }] : []),
      { key: 'breakTools', render: breakToolsStep },
    ],
    sentence: (trigger) => summariseRule(trigger, summaryContext),
    labels: {
      remove: localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.RemoveTrigger', 'Remove trigger'),
      expand: localizeOr(
        'FABRICATE.Admin.Manager.Checks.Breakage.ExpandTrigger',
        "Show this trigger's settings"
      ),
      collapse: localizeOr(
        'FABRICATE.Admin.Manager.Checks.Breakage.CollapseTrigger',
        "Hide this trigger's settings"
      ),
    },
  });

  // The preset row, withheld when the formula rolls no dice: a preset offered against one
  // would author a condition pointing at a group that does not exist. Each builds its trigger
  // when chosen, so every preset trigger takes a fresh id.
  const presets = $derived(
    checkTriggerPresets({ kind, diceGroups, evaluation, lowestTierId }).map((preset) => ({
      id: preset.id,
      icon: preset.icon,
      label: phrase(preset),
      value: () =>
        buildPresetTrigger({
          presetId: preset.id,
          kind,
          diceGroups,
          showBreakTools,
          newId,
          evaluation,
          lowestTierId,
        }),
    }))
  );
</script>

{#snippet conditionStep(trigger, change)}
  {@const condition = trigger.condition || {}}
  <div class="manager-checks-breakage-condition">
    <!-- A `<div>` per cell rather than the `<label>` it was, for `Select.svelte`'s own
     `<div>`-host reason; the caption names the trigger off the id the card body keys on. -->
    <Field as="div">
      <span id={`fab-trigger-${trigger.id}-when`}
        >{localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.ConditionType', 'When')}</span
      >
      <Select
        size="inline"
        value={condition.type || 'rollTotal'}
        options={conditionTypeOptions}
        ariaLabelledBy={`fab-trigger-${trigger.id}-when`}
        minWidth={140}
        triggerProps={{ 'data-trigger-condition-type': '' }}
        onChange={(next) => change(withConditionType(trigger, next))}
      />
    </Field>

    {#if condition.type === 'diceGroup'}
      <Field as="div">
        <span id={`fab-trigger-${trigger.id}-group`}
          >{localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.Group', 'Group')}</span
        >
        <Select
          size="inline"
          value={String(condition.groupId ?? '')}
          options={diceGroupRows}
          ariaLabelledBy={`fab-trigger-${trigger.id}-group`}
          minWidth={140}
          triggerProps={{ 'data-trigger-group': '' }}
          onChange={(next) => change(withCondition(trigger, { groupId: Number(next) }))}
        />
      </Field>
      <Field as="div">
        <span id={`fab-trigger-${trigger.id}-aggregate`}
          >{localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.Aggregate', 'Measure')}</span
        >
        <Select
          size="inline"
          value={condition.aggregate || 'anyDie'}
          options={aggregateOptions}
          ariaLabelledBy={`fab-trigger-${trigger.id}-aggregate`}
          minWidth={140}
          triggerProps={{ 'data-trigger-aggregate': '' }}
          onChange={(next) => change(withCondition(trigger, { aggregate: next }))}
        />
      </Field>
    {/if}

    {#if condition.type === 'outcomeTier'}
      <div
        class="fab-cluster"
        data-gap="2"
        role="group"
        aria-label={localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.Tiers', 'Outcome tiers')}
      >
        {#if outcomeOptions.length === 0}
          <p class="manager-muted" data-trigger-no-tiers>
            {localizeOr(
              'FABRICATE.Admin.Manager.Checks.Breakage.NoTiers',
              'Add named outcome tiers to target them.'
            )}
          </p>
        {:else}
          {#each outcomeOptions as option (option.id)}
            <button
              type="button"
              data-keyboard-focus="true"
              class={`manager-checks-state-pill ${isOutcomeSelected(condition, option.id) ? 'is-positive' : 'is-negative'}`}
              data-trigger-tier={option.id}
              aria-pressed={isOutcomeSelected(condition, option.id)}
              onclick={() => change(withOutcomeTierToggled(trigger, option.id))}
            >
              {option.name || unnamedTier}
            </button>
          {/each}
        {/if}
      </div>
    {:else}
      <Field as="div">
        <span id={`fab-trigger-${trigger.id}-operator`}
          >{localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.Operator', 'Is')}</span
        >
        <Select
          size="inline"
          value={condition.operator || '=='}
          options={operatorOptions}
          ariaLabelledBy={`fab-trigger-${trigger.id}-operator`}
          minWidth={140}
          triggerProps={{ 'data-trigger-operator': '' }}
          onChange={(next) => change(withCondition(trigger, { operator: next }))}
        />
      </Field>
      <!-- A PLAIN NUMBER FIELD: a threshold is typed rather than walked to, and reaching 20 from
           1 is nineteen clicks. `Stepper` still owns the tier-step operand below. -->
      <Field as="label" class="manager-checks-trigger-value">
        <span>{conditionValueLabel}</span>
        <input
          type="number"
          data-trigger-value
          value={condition.value ?? 0}
          oninput={(event) =>
            change(withCondition(trigger, { value: Number(event.currentTarget.value) || 0 }))}
        />
      </Field>
    {/if}
  </div>
{/snippet}

<!-- THE FORCED OUTCOME, where the effect groups read as a sequence: the condition, what it does
     to the outcome, what it does to the tier. -->
{#snippet outcomeStep(trigger, change)}
  {@const isOutcomeTier = trigger.condition?.type === 'outcomeTier'}
  <div class="manager-checks-trigger-effect-row">
    <Field as="div" class="manager-checks-trigger-outcome">
      <span>{outcomeLegend}</span>
      <SegmentedControl
        density="field"
        options={outcomeSegments(isOutcomeTier)}
        value={isOutcomeTier ? 'none' : outcomeFor(trigger)}
        groupName={`outcome-${trigger.id}`}
        ariaLabel={localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn', 'Outcome')}
        optionDataAttr="data-trigger-outcome"
        onChange={(next) => change({ ...trigger, outcome: next })}
      />
    </Field>
  </div>
{/snippet}

<!-- Its OWN row: at the pinned manager geometry the outcome toggle and the break pill already
     spend most of the card's width. -->
{#snippet tierStepStep(trigger, change)}
  {@const step = tierStepFor(trigger)}
  {@const dangling = isDanglingTarget(step)}
  <div class="manager-checks-trigger-effect-row" data-trigger-tier-step>
    <Field as="div" class="manager-checks-trigger-step-mode">
      <span>{tierStepLegend}</span>
      <SegmentedControl
        density="field"
        options={TIER_STEP_MODES}
        value={step.mode}
        groupName={`tierstep-${trigger.id}`}
        ariaLabel={tierStepModeLabel}
        optionDataAttr="data-trigger-tier-step-mode"
        onChange={(mode) => change(withTierStep(trigger, { mode }))}
      />
    </Field>

    <!-- The operand slot is ALWAYS present at one pinned width and only its contents swap, so
         changing mode never moves the control out from under the pointer. -->
    <Field as="div" class="manager-checks-trigger-step-operand">
      <span>{tierStepAmountLabel}</span>
      {#if step.mode === 'up' || step.mode === 'down'}
        <!-- `fill` is what keeps the canonical no-movement guarantee
             (`openspec/specs/ui-system-studio/spec.md`, "a stable operand slot at one pinned
             width"): the slot stays pinned and the primitive stretches into it, so a mode swap
             leaves POSITION and WIDTH unchanged, not height — this fill renders 38px tall
             (the primitive's default fill height) against the inert placeholder's 38px and the
             target `Select`'s 30px (the `inline` rung), and the row's
             own `align-items: flex-end` is what keeps their bottoms level.
             `data-trigger-tier-step-steps` rides `inputProps` onto the real `<input>`, and
             `Math.trunc` stays: `Stepper` clamps but does not truncate. -->
        <Stepper
          fill
          value={step.steps}
          min={1}
          {...tierStepAdjunctLabels}
          ariaLabel={step.mode === 'up'
            ? localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsUp', 'Steps up')
            : localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsDown', 'Steps down')}
          inputProps={{ 'data-trigger-tier-step-steps': '' }}
          onChange={(next) =>
            change(withTierStep(trigger, { steps: Math.max(1, Math.trunc(next)) }))}
        />
      {:else if step.mode === 'target' && outcomeOptions.length > 0}
        <!-- `placeholder` is what makes "nothing chosen" read as nothing chosen: a null `tierId`
             must never display a tier the check has not persisted. Its own `ariaLabel`, the slot
             caption naming the amount for whichever operand the mode renders. -->
        <Select
          size="inline"
          value={step.tierId ?? ''}
          options={tierStepTargetOptions({
            outcomeOptions,
            danglingTierId: dangling ? step.tierId : null,
            unnamedLabel: unnamedTier,
            missingLabel: localizeOr(
              'FABRICATE.Admin.Manager.Checks.Breakage.TierStepMissingTier',
              'Missing tier'
            ),
          })}
          placeholder={localizeOr(
            'FABRICATE.Admin.Manager.Checks.Breakage.TierStepChoose',
            'Choose a tier…'
          )}
          invalid={dangling}
          ariaLabel={localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.TierStepTier', 'Tier')}
          triggerProps={{ 'data-trigger-tier-step-target': '' }}
          onChange={(next) => change(withTierStep(trigger, { tierId: next || null }))}
        />
      {:else}
        <input type="text" value="" disabled aria-hidden="true" tabindex="-1" />
      {/if}
    </Field>

    {#if step.mode === 'target' && outcomeOptions.length === 0}
      <!-- Its own hook, distinct from the outcomeTier condition's: a trigger that is both
           outcomeTier-conditioned and target-stepping on a tier-less check would otherwise carry
           two identically-hooked nodes in one card. -->
      <p class="manager-muted manager-checks-trigger-step-hint" data-trigger-step-no-tiers>
        {localizeOr(
          'FABRICATE.Admin.Manager.Checks.Breakage.TierStepNoTiers',
          'Add named outcome tiers to step to one.'
        )}
      </p>
    {/if}
  </div>
{/snippet}

<!-- BREAKING THE TOOLS IS ITS OWN CARD: a hazard with a glyph, a title and a sentence, through the
     shared `ToggleCard` the On failure screen's own flags use. -->
{#snippet breakToolsStep(trigger, change)}
  {#if showBreakTools}
    <ToggleCard
      icon="fas fa-hammer"
      section="trigger-break-tools"
      toggleDataAttr="data-trigger-break"
      title={localizeOr(
        'FABRICATE.Admin.Manager.Checks.Breakage.BreakToolsCardTitle',
        'Break the required tools'
      )}
      sub={localizeOr(
        'FABRICATE.Admin.Manager.Checks.Breakage.BreakToolsCardDesc',
        'When this trigger fires, the tools break regardless of the failure policy.'
      )}
      toggleLabel={localizeOr(
        'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak',
        'Break tools'
      )}
      on={trigger.breakTools === true}
      onToggle={(next) => change({ ...trigger, breakTools: next })}
    />
  {:else}
    <!-- WHY THERE IS NO BREAK CARD, stated where the missing control would be. -->
    <p class="manager-muted manager-checks-trigger-hint" data-trigger-break-unavailable>
      {localizeOr(
        'FABRICATE.Admin.Manager.Checks.Breakage.LeadOutcomeOnly',
        'Each trigger can force the check outcome. Switch the tool-breakage authority to check-driven to let triggers break tools.'
      )}
    </p>
  {/if}
{/snippet}

<!-- ADD A COMMON TRIGGER, in its own card above the list: the shortcut past having to learn
     the editor first. A preset authors an ORDINARY trigger, with no marker field and nothing
     downstream treating it differently. -->
{#if presets.length > 0}
  <InspectorCard class="manager-checks-card" data-check-trigger-presets="">
    <div class="manager-checks-card-head">
      <div>
        <h3 class="manager-checks-card-title">
          {localizeOr(
            'FABRICATE.Admin.Manager.Checks.Breakage.PresetsTitle',
            'Add a common trigger'
          )}
        </h3>
        <p class="manager-checks-card-description">
          {localizeOr(
            'FABRICATE.Admin.Manager.Checks.Breakage.PresetsLead',
            'One click for the conditions almost every system writes.'
          )}
        </p>
      </div>
    </div>
    <div class="manager-checks-card-body">
      <RuleRow
        class="manager-checks-trigger-presets"
        schema={triggerSchema}
        value={null}
        {presets}
        onChange={appendTrigger}
      />
    </div>
  </InspectorCard>
{/if}

<!-- THE TRIGGER LIST IS NOT A CARD. Its members are, one per trigger, sitting directly in the
     pane; this wrapper carries the route's hooks and the stacking gutter and paints nothing.
     The section head above the pane already names the section and leads it. -->
<!-- THE CONTROL HALF of the Validation route's row action, and it is SET-LEVEL. Both trigger
     issues are about the tier targets across the WHOLE list rather than about one control: the
     row carries no trigger id, and each trigger's own tier control sits inside a collapsed
     disclosure that is not in the DOM until the GM opens it. So the LIST is the destination,
     addressed as `checks-triggers`. A `<div>` is not natively focusable, so it declares both
     the tabindex and the attribute telling Foundry the window is focused; without the second,
     Space pauses the game and the arrows pan the canvas. -->
<div
  class="manager-checks-trigger-route"
  data-check-triggers
  data-validation-target="checks-triggers"
  tabindex="-1"
  data-keyboard-focus="true"
  bind:this={route}
>
  {#if triggers.length === 0}
    <p class="manager-muted" data-triggers-empty>
      {localizeOr(
        'FABRICATE.Admin.Manager.Checks.Breakage.Empty',
        'No triggers yet. Add one to force an outcome or break tools on this check.'
      )}
    </p>
  {:else}
    <div class="manager-checks-trigger-list" role="list">
      {#each triggers as trigger (trigger.id)}
        <RuleRow
          class="manager-checks-breakage-trigger"
          role="listitem"
          data-trigger={trigger.id}
          schema={triggerSchema}
          value={trigger}
          collapsible={{
            open: expandedId === trigger.id,
            onToggle: () => toggleExpanded(trigger.id),
          }}
          onChange={(next) =>
            next === null ? removeTrigger(trigger.id) : replaceTrigger(trigger.id, next)}
        />
      {/each}
    </div>
  {/if}

  <!-- A full-width dashed control UNDER the list rather than a button in a card head: the
         action that grows the list belongs at the end of the list it grows. -->
  <Button role="dashed" data-add-trigger onclick={addTrigger}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{localizeOr('FABRICATE.Admin.Manager.Checks.Breakage.AddTrigger', 'Add trigger')}</span>
  </Button>
</div>
