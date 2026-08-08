<!-- Svelte 5 runes mode -->
<!--
  Unified per-check trigger editor (issue 419 recombine).

  One trigger list per check, ALWAYS rendered. Each trigger pairs an expressive
  dice-matching CONDITION with three effects:
    - `outcome` — force the check to an Automatic success / Automatic failure, or
      leave it (No effect). For a progressive check the success/failure labels read
      Award all / Award none. Forcing applies under BOTH tool-breakage authorities.
    - `breakTools` — break every required tool for the attempt. Authored (and applied)
      ONLY under `checkDriven` authority: the per-trigger break pill is shown/enabled
      only when `showBreakTools` is true, and under `toolSpecific` a check never breaks
      tools.
    - `tierStep` (issue 975) — move the rolled outcome tier: target a named tier, or
      step it up/down by N. Routed only (there are no tiers to step otherwise), and
      deliberately NOT gated on `showBreakTools`: stepping is not a breakage concept
      and does not belong to the tool-breakage authority.

  An `outcomeTier` condition (routed only) cannot force an outcome — the routed tier
  is resolved AFTER the forced outcome would run, so the outcome segments are pinned to
  No effect and disabled for it (such a trigger may still break tools, evaluated at
  the engine seam where the tier is known). It CAN step, though: a step reads the
  rolled tier and produces the final one, so there is no circularity to prevent.

  Controlled component mirroring the prior editors' `{ value, rollFormula, onChange }`
  pattern: reads the `{ triggers[] }` block + the roll formula and emits the next
  block via onChange. Dice groups are enumerated from the formula via parseDiceGroups
  so a `diceGroup` trigger targets a group by its evaluated-term index (groupId);
  duplicate `NdS` groups are disambiguated `#1`/`#2`.

  `kind` selects which condition types are offered: `progressive` adds the
  progressiveValue condition; `routed` adds the outcomeTier condition (which reads
  `outcomeOptions`).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    value = null,
    rollFormula = '',
    kind = 'simple',
    outcomeOptions = [],
    showBreakTools = false,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const triggers = $derived(Array.isArray(value?.triggers) ? value.triggers : []);

  // Dice groups in evaluated-term order. groupId is the index (matching the engine's
  // roll.dice term index); duplicate NdS labels are disambiguated by an occurrence
  // counter so `1d20 + 1d20` reads `1d20 #1` / `1d20 #2`.
  const diceGroups = $derived(
    (() => {
      const parsed = parseDiceGroups(rollFormula);
      // Function-local counters, discarded when the $derived IIFE returns.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const seen = new Map();
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const counts = new Map();
      for (const group of parsed) counts.set(group.raw, (counts.get(group.raw) || 0) + 1);
      return parsed.map((group, groupId) => {
        const occurrence = (seen.get(group.raw) || 0) + 1;
        seen.set(group.raw, occurrence);
        const duplicated = (counts.get(group.raw) || 0) > 1;
        const label = duplicated
          ? text('FABRICATE.Admin.Manager.Checks.Breakage.GroupOrdinal', '{die} #{n}')
              .replace('{die}', group.raw)
              .replace('{n}', String(occurrence))
          : group.raw;
        return { groupId, raw: group.raw, count: group.count, sides: group.sides, label };
      });
    })()
  );

  const firstD20GroupId = $derived(diceGroups.find((group) => group.sides === 20)?.groupId ?? null);

  const OPERATORS = ['==', '<=', '>=', '<', '>'];
  const AGGREGATES = [
    {
      value: 'total',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateTotal',
      fallback: 'Group total',
    },
    {
      value: 'anyDie',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAnyDie',
      fallback: 'Any die',
    },
    {
      value: 'allDice',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAllDice',
      fallback: 'All dice',
    },
    {
      value: 'lowestDie',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateLowestDie',
      fallback: 'Lowest die',
    },
    {
      value: 'highestDie',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateHighestDie',
      fallback: 'Highest die',
    },
  ];

  // Condition types offered for this editor kind. progressiveValue is meaningful
  // only on progressive checks; outcomeTier only on routed checks.
  const conditionTypes = $derived(
    [
      {
        value: 'rollTotal',
        labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeRollTotal',
        fallback: 'Roll total',
      },
      kind === 'progressive'
        ? {
            value: 'progressiveValue',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeProgressiveValue',
            fallback: 'Awarded value',
          }
        : null,
      {
        value: 'diceGroup',
        labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeDiceGroup',
        fallback: 'Dice group',
      },
      kind === 'routed'
        ? {
            value: 'outcomeTier',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeOutcomeTier',
            fallback: 'Outcome tier',
          }
        : null,
    ].filter(Boolean)
  );

  // Outcome toggle segments, ordered as a good→neutral→bad spectrum
  // (success | no effect | failure) so the neutral default sits in the middle.
  // Progressive checks relabel success/failure to award all/none (they have no
  // pass/fail, only a numeric value), reusing the existing AwardAll/AwardNone keys.
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

  // The forcing segments are DISABLED (on the radio itself, not merely dimmed) for an
  // outcomeTier condition — that pin is what keeps forcing non-circular.
  function outcomeSegments(isOutcomeTier) {
    return outcomeChoices.map((option) => ({
      ...option,
      disabled: isOutcomeTier && option.value !== 'none',
    }));
  }

  // The tier-step effect's four modes. `none` is inert; `up`/`down` take a count;
  // `target` names a tier. Rendered for routed checks only — there is nothing to
  // step on a simple or progressive check.
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
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStep', 'Tier step')
  );
  const tierStepModeLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepMode', 'Tier step mode')
  );

  // The tier-step operand's ONLY name is "Steps up" / "Steps down", so parametrizing the
  // shared adjunct strings with it reads as "Decrease Steps up". Its adjuncts take the
  // row's own label — "Tier step" — instead, which is both grammatical and the name this
  // surface already gives the control the operand belongs to. So the shared derivation is
  // spread from `tierStepLabel` and only `ariaLabel` is overridden after it, at the tag.
  const tierStepAdjunctLabels = $derived(stepperLabels(tierStepLabel));
  const conditionValueLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.Value', 'Value')
  );

  const breakOnLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break')
  );
  const breakOffLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break")
  );

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

  function addTrigger() {
    const type = conditionTypes[0]?.value || 'rollTotal';
    emit([
      ...triggers,
      {
        id: newId(),
        condition: defaultConditionFor(type),
        outcome: 'none',
        // Default a new trigger to breaking tools only where that effect is reachable.
        breakTools: showBreakTools === true,
        // Authored here rather than left to the normalizer so a freshly added trigger
        // and a saved-then-reloaded one are the same object — no round trip needed for
        // the editor and the normalizer to agree.
        tierStep: { mode: 'none', steps: 1, tierId: null },
      },
    ]);
  }

  function updateTrigger(id, patch) {
    emit(triggers.map((trigger) => (trigger.id === id ? { ...trigger, ...patch } : trigger)));
  }

  function updateCondition(id, patch) {
    emit(
      triggers.map((trigger) =>
        trigger.id === id
          ? { ...trigger, condition: { ...(trigger.condition || {}), ...patch } }
          : trigger
      )
    );
  }

  function setConditionType(id, type) {
    // Switching to an outcomeTier condition cannot force an outcome → pin to none.
    const patch = { condition: defaultConditionFor(type) };
    if (type === 'outcomeTier') patch.outcome = 'none';
    updateTrigger(id, patch);
  }

  function removeTrigger(id) {
    emit(triggers.filter((trigger) => trigger.id !== id));
  }

  function outcomeFor(trigger) {
    const current = trigger?.outcome;
    return current === 'success' || current === 'failure' ? current : 'none';
  }

  function isOutcomeSelected(condition, id) {
    return Array.isArray(condition?.tierIds) && condition.tierIds.includes(id);
  }

  // The trigger's tierStep effect, read defensively: a trigger authored before issue
  // 975 (or hand-edited) may carry none at all. Flat rather than a discriminated
  // union so switching mode never destroys the other mode's operand.
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

  function updateTierStep(id, patch) {
    const trigger = triggers.find((entry) => entry.id === id);
    updateTrigger(id, { tierStep: { ...tierStepFor(trigger), ...patch } });
  }

  // A target naming no tier on the ACTIVE list. Reachable by design and not only by
  // import: the relative↔fixed type switch swaps the whole tier list, dangling every
  // authored tierId at once.
  function isDanglingTarget(step) {
    return Boolean(step.tierId) && !outcomeOptions.some((option) => option.id === step.tierId);
  }

  function toggleOutcomeTier(id, optionId) {
    const trigger = triggers.find((entry) => entry.id === id);
    const current = Array.isArray(trigger?.condition?.tierIds) ? trigger.condition.tierIds : [];
    const next = current.includes(optionId)
      ? current.filter((value) => value !== optionId)
      : [...current, optionId];
    updateCondition(id, { tierIds: next });
  }
</script>

<section class="manager-inspector-card" data-check-triggers>
  <div class="manager-checks-card-head">
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.Checks.Breakage.Title', 'Check triggers')}
    </h3>
    <button type="button" class="manager-button" data-add-trigger onclick={addTrigger}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.AddTrigger', 'Add trigger')}</span>
    </button>
  </div>

  <p class="manager-muted">
    {showBreakTools
      ? text(
          'FABRICATE.Admin.Manager.Checks.Breakage.Lead',
          'Each trigger can force the check outcome and/or break every required tool for the attempt (immune tools are never broken).'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Breakage.LeadOutcomeOnly',
          'Each trigger can force the check outcome. Switch the tool-breakage authority to check-driven to let triggers break tools.'
        )}
  </p>

  {#if triggers.length === 0}
    <p class="manager-muted" data-triggers-empty>
      {text(
        'FABRICATE.Admin.Manager.Checks.Breakage.Empty',
        'No triggers yet. Add one to force an outcome or break tools on this check.'
      )}
    </p>
  {:else}
    {#each triggers as trigger (trigger.id)}
      {@const condition = trigger.condition || {}}
      {@const isOutcomeTier = condition.type === 'outcomeTier'}
      {@const selectedOutcome = isOutcomeTier ? 'none' : outcomeFor(trigger)}
      <div class="manager-checks-breakage-trigger" data-trigger={trigger.id}>
        <div class="manager-checks-trigger-top">
          <div class="manager-checks-breakage-condition">
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.ConditionType', 'When')}</span>
              <select
                data-trigger-condition-type
                value={condition.type || 'rollTotal'}
                onchange={(event) => setConditionType(trigger.id, event.currentTarget.value)}
              >
                {#each conditionTypes as option (option.value)}
                  <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                {/each}
              </select>
            </label>

            {#if condition.type === 'diceGroup'}
              <label class="manager-field">
                <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Group', 'Group')}</span>
                <select
                  data-trigger-group
                  value={String(condition.groupId ?? '')}
                  onchange={(event) =>
                    updateCondition(trigger.id, { groupId: Number(event.currentTarget.value) })}
                >
                  {#each diceGroups as group (group.groupId)}
                    <option value={String(group.groupId)}>{group.label}</option>
                  {/each}
                </select>
              </label>
              <label class="manager-field">
                <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Aggregate', 'Measure')}</span>
                <select
                  data-trigger-aggregate
                  value={condition.aggregate || 'anyDie'}
                  onchange={(event) =>
                    updateCondition(trigger.id, { aggregate: event.currentTarget.value })}
                >
                  {#each AGGREGATES as option (option.value)}
                    <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                  {/each}
                </select>
              </label>
            {/if}

            {#if isOutcomeTier}
              <div
                class="manager-checks-breakage-tiers"
                role="group"
                aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.Tiers', 'Outcome tiers')}
              >
                {#if outcomeOptions.length === 0}
                  <p class="manager-muted" data-trigger-no-tiers>
                    {text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.NoTiers',
                      'Add named outcome tiers to target them.'
                    )}
                  </p>
                {:else}
                  {#each outcomeOptions as option (option.id)}
                    <button
                      type="button"
                      class={`manager-checks-state-pill ${isOutcomeSelected(condition, option.id) ? 'is-positive' : 'is-negative'}`}
                      data-trigger-tier={option.id}
                      aria-pressed={isOutcomeSelected(condition, option.id)}
                      onclick={() => toggleOutcomeTier(trigger.id, option.id)}
                    >
                      {option.name ||
                        text('FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier', 'Unnamed tier')}
                    </button>
                  {/each}
                {/if}
              </div>
            {:else}
              <label class="manager-field">
                <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Operator', 'Is')}</span>
                <select
                  data-trigger-operator
                  value={condition.operator || '=='}
                  onchange={(event) =>
                    updateCondition(trigger.id, { operator: event.currentTarget.value })}
                >
                  {#each OPERATORS as operator (operator)}
                    <option value={operator}>{operator}</option>
                  {/each}
                </select>
              </label>
              <!-- A `<div>`, not the `<label>` it was: see the NAMING contract in
                   `Stepper.svelte`. -->
              <div class="manager-field">
                <span>{conditionValueLabel}</span>
                <Stepper
                  fill
                  value={condition.value ?? 0}
                  {...stepperLabels(conditionValueLabel)}
                  inputProps={{ 'data-trigger-value': '' }}
                  onChange={(next) => updateCondition(trigger.id, { value: next })}
                />
              </div>
            {/if}
          </div>

          <button
            type="button"
            class="manager-icon-button is-danger manager-checks-trigger-remove"
            data-remove-trigger
            aria-label={text(
              'FABRICATE.Admin.Manager.Checks.Breakage.RemoveTrigger',
              'Remove trigger'
            )}
            onclick={() => removeTrigger(trigger.id)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>

        <hr class="manager-checks-trigger-divider" aria-hidden="true" />

        <div class="manager-checks-trigger-bottom">
          <div class="manager-field manager-checks-trigger-outcome">
            <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn', 'Outcome')}</span>
            <SegmentedControl
              options={outcomeSegments(isOutcomeTier)}
              value={selectedOutcome}
              groupName={`outcome-${trigger.id}`}
              ariaLabel={text('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn', 'Outcome')}
              optionDataAttr="data-trigger-outcome"
              onChange={(next) => updateTrigger(trigger.id, { outcome: next })}
            />
          </div>

          {#if showBreakTools}
            <div class="manager-field manager-checks-trigger-break">
              <span
                >{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}</span
              >
              <button
                type="button"
                class={`manager-checks-state-pill ${trigger.breakTools === true ? 'is-negative' : 'is-positive'}`}
                data-trigger-break
                aria-pressed={trigger.breakTools === true}
                aria-label={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak',
                  'Break tools'
                )}
                onclick={() =>
                  updateTrigger(trigger.id, { breakTools: !(trigger.breakTools === true) })}
              >
                {trigger.breakTools === true ? breakOnLabel : breakOffLabel}
              </button>
            </div>
          {/if}
        </div>

        {#if kind === 'routed'}
          {@const step = tierStepFor(trigger)}
          {@const dangling = isDanglingTarget(step)}
          <!-- Its OWN row, not a third field in the bottom row: at the pinned 1280
               manager geometry the outcome toggle plus the break pill already spend
               most of the trigger card's width, and a four-segment control plus an
               operand does not fit what is left. -->
          <div class="manager-checks-trigger-step-row" data-trigger-tier-step>
            <div class="manager-field manager-checks-trigger-step-mode">
              <span>{tierStepLabel}</span>
              <SegmentedControl
                options={TIER_STEP_MODES}
                value={step.mode}
                groupName={`tierstep-${trigger.id}`}
                ariaLabel={tierStepModeLabel}
                optionDataAttr="data-trigger-tier-step-mode"
                onChange={(mode) => updateTierStep(trigger.id, { mode })}
              />
            </div>

            <!-- The operand slot is ALWAYS present at one pinned width and only its
                 contents swap, so changing mode never moves the control out from
                 under the pointer in this wrapping row. -->
            <div
              class={`manager-field manager-checks-trigger-step-operand ${dangling ? 'is-invalid' : ''}`}
            >
              {#if step.mode === 'up' || step.mode === 'down'}
                <!-- `fill` is what keeps the canonical no-movement guarantee (ui-integration
                     spec, "a stable operand slot at one pinned width"): the slot stays
                     pinned at 160px and the primitive stretches into it, so swapping mode
                     between this stepper, the tier `<select>` and the inert placeholder
                     leaves the control's POSITION and BOX SIZE unchanged — which is the
                     guarantee the spec actually makes, and all the no-movement rule needs.
                     Radius and fill still differ (the stepper paints 8px /
                     `--fab-surface-soft`, a `.manager-field` control 6px / `--fab-mv2-bg`);
                     claiming otherwise was an overclaim corrected alongside the spec text.
                     `data-trigger-tier-step-steps` rides `inputProps` onto the real
                     `<input>` — the smoke harness calls Playwright's `fill()` and
                     `inputValue()` on it, and neither resolves against a wrapper `<div>`.
                     `Math.trunc` stays: `Stepper` clamps but does not truncate. -->
                <Stepper
                  fill
                  value={step.steps}
                  min={1}
                  {...tierStepAdjunctLabels}
                  ariaLabel={step.mode === 'up'
                    ? text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsUp', 'Steps up')
                    : text(
                        'FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsDown',
                        'Steps down'
                      )}
                  inputProps={{ 'data-trigger-tier-step-steps': '' }}
                  onChange={(next) =>
                    updateTierStep(trigger.id, { steps: Math.max(1, Math.trunc(next)) })}
                />
              {:else if step.mode === 'target' && outcomeOptions.length > 0}
                <!-- A <select> whose value matches no option renders its FIRST option as
                     selected, so a null tierId would show a real tier the check has not
                     persisted. The disabled placeholder is what makes "nothing chosen"
                     read as nothing chosen. -->
                <select
                  data-trigger-tier-step-target
                  aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepTier', 'Tier')}
                  value={step.tierId ?? ''}
                  onchange={(event) =>
                    updateTierStep(trigger.id, { tierId: event.currentTarget.value || null })}
                >
                  <option value="" disabled
                    >{text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.TierStepChoose',
                      'Choose a tier…'
                    )}</option
                  >
                  {#each outcomeOptions as option (option.id)}
                    <option value={option.id}
                      >{option.name ||
                        text(
                          'FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier',
                          'Unnamed tier'
                        )}</option
                    >
                  {/each}
                  {#if dangling}
                    <option value={step.tierId} disabled
                      >{text(
                        'FABRICATE.Admin.Manager.Checks.Breakage.TierStepMissingTier',
                        'Missing tier'
                      )}</option
                    >
                  {/if}
                </select>
              {:else}
                <input type="text" value="" disabled aria-hidden="true" tabindex="-1" />
              {/if}
            </div>

            {#if step.mode === 'target' && outcomeOptions.length === 0}
              <!-- Its own hook, distinct from the outcomeTier condition's: a trigger that
                   is both outcomeTier-conditioned and target-stepping on a tier-less check
                   would otherwise carry two identically-hooked nodes in one card. -->
              <p class="manager-muted manager-checks-trigger-step-hint" data-trigger-step-no-tiers>
                {text(
                  'FABRICATE.Admin.Manager.Checks.Breakage.TierStepNoTiers',
                  'Add named outcome tiers to step to one.'
                )}
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</section>
