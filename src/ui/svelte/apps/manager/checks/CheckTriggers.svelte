<!-- Svelte 5 runes mode -->
<!--
  Unified per-check trigger editor. One trigger list per check, ALWAYS rendered, each pairing an
  expressive dice-matching CONDITION with three effects: `outcome` forces an automatic success or
  failure under BOTH breakage authorities; `breakTools` is authored and applied ONLY under
  `checkDriven`; and `tierStep` moves the rolled outcome tier, routed only and deliberately NOT
  gated on `showBreakTools`, stepping not being a breakage concept.

  An `outcomeTier` condition cannot force an outcome — the routed tier resolves AFTER the forced
  outcome would run — so its outcome segments are pinned to No effect and disabled. It CAN step.

  Controlled. Dice groups come from `parseDiceGroups`, so a `diceGroup` trigger targets a group
  by its evaluated-term index, and `kind` selects which condition types are offered.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';
  import { interpolate } from './checksCopy.js';
  import { buildPresetTrigger, checkTriggerPresets } from './checkTriggerPresets.js';
  import { summariseCondition, summariseEffect, summariseHeadline } from './checkTriggerSummary.js';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import IconButton from '../../../components/IconButton.svelte';

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

  // Dice groups in evaluated-term order, `groupId` matching the engine's `roll.dice` index.
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

  // The comparison a GM reads, not the symbol the model stores, and in the design order.
  const OPERATORS = [
    {
      value: '==',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectExactly',
      fallback: 'is exactly',
    },
    {
      value: '>=',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectAtLeast',
      fallback: 'is at least',
    },
    {
      value: '<=',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectAtMost',
      fallback: 'is at most',
    },
    {
      value: '>',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectOver',
      fallback: 'is more than',
    },
    {
      value: '<',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectUnder',
      fallback: 'is less than',
    },
  ];
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

  // Condition types offered for this editor kind.
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
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStep', 'Tier step')
  );
  const tierStepModeLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepMode', 'Tier step mode')
  );

  // The tier-step operand's only name is "Steps up"/"Steps down", so the shared adjuncts
  // parametrized with it read as "Decrease Steps up"; they take the ROW's label instead, and
  // only `ariaLabel` is overridden after the spread.
  const tierStepAdjunctLabels = $derived(stepperLabels(tierStepLabel));
  const conditionValueLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.Value', 'Value')
  );

  // The expanded body's micro-labels. `TierStep`/`OutcomeColumn` stay the CONTROL's own
  // accessible names, a radiogroup announced as "And the tier moves" reading as a fragment.
  const conditionLegend = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.ConditionLegend', 'Condition')
  );
  const outcomeLegend = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeLegend', 'And the outcome')
  );
  const tierStepLegend = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepLegend', 'And the tier moves')
  );
  const tierStepAmountLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepAmount', 'By how many')
  );

  // THE LIST COLLAPSES: at most ONE trigger is open and none on arrival, three full editors
  // being taller than the pane — which is why authoring a preset looked inert. So a new
  // trigger OPENS and is SCROLLED TO, without which the accordion moves an invisible card.
  let expandedId = $state(null);
  // Element per trigger, for the scroll. `$state` rather than a plain object, `bind:this` into
  // a plain member warning `binding_property_non_reactive` — and the warning is the truth.
  const triggerNodes = $state({});
  // The id already scrolled to, so re-rendering a still-expanded trigger does not yank back.
  let scrolledTo = null;

  $effect(() => {
    // Read the list too: `expandedId` is set BEFORE the parent emits the longer list back down.
    void triggers.length;
    const id = expandedId;
    if (!id || scrolledTo === id) return;
    const node = triggerNodes[id];
    if (!node) return;
    scrolledTo = id;
    // `nearest` so an already-visible card does not move the pane; happy-dom lacks it, hence `?.`
    node.scrollIntoView?.({ block: 'nearest' });
  });

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

  function addTrigger() {
    const type = conditionTypes[0]?.value || 'rollTotal';
    const id = newId();
    expandedId = id;
    emit([
      ...triggers,
      {
        id,
        condition: defaultConditionFor(type),
        outcome: 'none',
        // Default a new trigger to breaking tools only where that effect is reachable.
        breakTools: showBreakTools === true,
        // Authored here, so a freshly added trigger and a saved-then-reloaded one are one object.
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
    if (expandedId === id) expandedId = null;
    emit(triggers.filter((trigger) => trigger.id !== id));
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

  function updateTierStep(id, patch) {
    const trigger = triggers.find((entry) => entry.id === id);
    updateTrigger(id, { tierStep: { ...tierStepFor(trigger), ...patch } });
  }

  // A target naming no tier on the ACTIVE list, reachable by ordinary authoring: the
  // relative↔fixed switch dangles every `tierId` at once.
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

  // What each trigger says about itself, composed by the pure `checkTriggerSummary` module;
  // this is only the localization bridge, hence the `{ key, fallback }` fragments.
  const tierNames = $derived(
    Object.fromEntries((outcomeOptions ?? []).map((option) => [option.id, option.name || '']))
  );

  /** Resolve one fragment, filling any nested fragment in its data first. */
  function phrase(fragment) {
    const data = Object.fromEntries(
      Object.entries(fragment.data ?? {}).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' ? text(entry.key, entry.fallback) : entry,
      ])
    );
    return interpolate(text(fragment.key, fragment.fallback), data);
  }

  function conditionSummary(trigger) {
    return phrase(summariseCondition(trigger?.condition ?? {}, { diceGroups, tierNames }));
  }

  /** The collapsed head's glyph tile, tone and result chip. */
  function headlineFor(trigger) {
    return summariseHeadline(trigger, {
      tierNames,
      progressive: kind === 'progressive',
      showBreakTools,
    });
  }

  function effectSentence(trigger) {
    const clauses = summariseEffect(trigger, {
      tierNames,
      progressive: kind === 'progressive',
      showBreakTools,
    }).map((clause) => phrase(clause));
    const joined = clauses.join(
      text('FABRICATE.Admin.Manager.Checks.Breakage.SummaryJoin', ', and ')
    );
    return interpolate(
      text(
        'FABRICATE.Admin.Manager.Checks.Breakage.SummarySentence',
        'When {condition}, {effect}.'
      ),
      { condition: conditionSummary(trigger).toLowerCase(), effect: joined }
    );
  }

  // The preset row, withheld when the formula rolls no dice: a preset offered against one
  // would author a condition pointing at a group that does not exist.
  const presets = $derived(checkTriggerPresets({ kind, diceGroups }));

  function addPreset(presetId) {
    const trigger = buildPresetTrigger({
      presetId,
      kind,
      diceGroups,
      showBreakTools,
      newId,
    });
    if (!trigger) return;
    // Open and scroll to it for `addTrigger`'s reason, and MORE so: a preset's card lands at
    // the foot of a list routinely taller than the pane.
    expandedId = trigger.id;
    emit([...triggers, trigger]);
  }
</script>

<!-- ADD A COMMON TRIGGER, in its own card above the list: the shortcut past having to learn
     the editor first. A preset authors an ORDINARY trigger, with no marker field and nothing
     downstream treating it differently. -->
{#if presets.length > 0}
  <InspectorCard class="manager-checks-card" data-check-trigger-presets="">
    <div class="manager-checks-card-head">
      <div>
        <h3 class="manager-checks-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Breakage.PresetsTitle', 'Add a common trigger')}
        </h3>
        <p class="manager-checks-card-description">
          {text(
            'FABRICATE.Admin.Manager.Checks.Breakage.PresetsLead',
            'One click for the conditions almost every system writes.'
          )}
        </p>
      </div>
    </div>
    <div class="manager-checks-card-body">
      <div class="manager-checks-trigger-presets">
        {#each presets as preset (preset.id)}
          <ManagerButton
            role="dashed"
            data-add-trigger-preset={preset.id}
            onclick={() => addPreset(preset.id)}
          >
            <i class={preset.icon} aria-hidden="true"></i>
            <span>{phrase(preset)}</span>
          </ManagerButton>
        {/each}
      </div>
    </div>
  </InspectorCard>
{/if}

<!-- THE TRIGGER LIST IS NOT A CARD. Its members are, one per trigger, sitting directly in the
     pane; this wrapper carries the route's hooks and the stacking gutter and paints nothing.
     The section head above the pane already names the section and leads it. -->
<!-- THE CONTROL HALF of the Validation route's row action, and it is SET-LEVEL. Both trigger
     issues are about the tier targets across the WHOLE list rather than about one control: the
     row carries no trigger id, and each trigger's own tier `<select>` sits inside a collapsed
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
>
  {#if triggers.length === 0}
    <p class="manager-muted" data-triggers-empty>
      {text(
        'FABRICATE.Admin.Manager.Checks.Breakage.Empty',
        'No triggers yet. Add one to force an outcome or break tools on this check.'
      )}
    </p>
  {:else}
    <div class="manager-checks-trigger-list" role="list">
      {#each triggers as trigger (trigger.id)}
        {@const condition = trigger.condition || {}}
        {@const isOutcomeTier = condition.type === 'outcomeTier'}
        {@const selectedOutcome = isOutcomeTier ? 'none' : outcomeFor(trigger)}
        {@const expanded = expandedId === trigger.id}
        {@const headline = headlineFor(trigger)}
        <div
          class="manager-checks-breakage-trigger"
          class:is-expanded={expanded}
          role="listitem"
          data-trigger={trigger.id}
          bind:this={triggerNodes[trigger.id]}
        >
          <div class="manager-checks-trigger-head">
            <!-- The WHOLE head is the disclosure, glyph tile to chevron, the chevron alone being a 10px
                             target for the commonest action here. The delete button is its SIBLING and the title
                             a `<span>`: neither a button nor a heading may sit inside a button. -->
            <button
              type="button"
              class="manager-checks-trigger-disclosure"
              data-trigger-disclosure={trigger.id}
              aria-expanded={expanded}
              aria-controls={`fab-trigger-body-${trigger.id}`}
              onclick={() => toggleExpanded(trigger.id)}
            >
              <span class={`manager-checks-trigger-glyph is-${headline.tone}`} aria-hidden="true">
                <i class={headline.glyph}></i>
              </span>
              <span class="manager-checks-trigger-headline">
                <span class="manager-checks-trigger-title" data-trigger-summary={trigger.id}>
                  {conditionSummary(trigger)}
                </span>
                <span class="manager-checks-trigger-lead" data-trigger-effect={trigger.id}>
                  {effectSentence(trigger)}
                </span>
              </span>
              {#if headline.chip}
                <span
                  class={`manager-checks-trigger-chip is-${headline.tone}`}
                  data-trigger-chip={trigger.id}
                >
                  {phrase(headline.chip)}
                </span>
              {/if}
              <i
                class={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'} manager-checks-trigger-chevron`}
                aria-hidden="true"
              ></i>
              <!-- The accessible name of the disclosure, which its visible content does not supply. -->
              <span class="visually-hidden">
                {expanded
                  ? text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.CollapseTrigger',
                      "Hide this trigger's settings"
                    )
                  : text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.ExpandTrigger',
                      "Show this trigger's settings"
                    )}
              </span>
            </button>

            <IconButton
              class="is-danger manager-checks-trigger-remove"
              data-remove-trigger=""
              ariaLabel={text(
                'FABRICATE.Admin.Manager.Checks.Breakage.RemoveTrigger',
                'Remove trigger'
              )}
              onclick={() => removeTrigger(trigger.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </IconButton>
          </div>

          {#if expanded}
            <div
              class="manager-checks-trigger-body"
              id={`fab-trigger-body-${trigger.id}`}
              data-trigger-body={trigger.id}
            >
              <p class="manager-checks-trigger-legend">{conditionLegend}</p>
              <div class="manager-checks-breakage-condition">
                <Field as="label">
                  <span
                    >{text('FABRICATE.Admin.Manager.Checks.Breakage.ConditionType', 'When')}</span
                  >
                  <select
                    data-trigger-condition-type
                    value={condition.type || 'rollTotal'}
                    onchange={(event) => setConditionType(trigger.id, event.currentTarget.value)}
                  >
                    {#each conditionTypes as option (option.value)}
                      <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                    {/each}
                  </select>
                </Field>

                {#if condition.type === 'diceGroup'}
                  <Field as="label">
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
                  </Field>
                  <Field as="label">
                    <span
                      >{text('FABRICATE.Admin.Manager.Checks.Breakage.Aggregate', 'Measure')}</span
                    >
                    <select
                      data-trigger-aggregate
                      value={condition.aggregate || 'anyDie'}
                      onchange={(event) =>
                        updateCondition(trigger.id, { aggregate: event.currentTarget.value })}
                    >
                      {#each AGGREGATES as option (option.value)}
                        <option value={option.value}
                          >{text(option.labelKey, option.fallback)}</option
                        >
                      {/each}
                    </select>
                  </Field>
                {/if}

                {#if isOutcomeTier}
                  <div
                    class="fab-cluster"
                    data-gap="2"
                    role="group"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.Tiers',
                      'Outcome tiers'
                    )}
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
                            text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier',
                              'Unnamed tier'
                            )}
                        </button>
                      {/each}
                    {/if}
                  </div>
                {:else}
                  <Field as="label">
                    <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Operator', 'Is')}</span>
                    <select
                      data-trigger-operator
                      value={condition.operator || '=='}
                      onchange={(event) =>
                        updateCondition(trigger.id, { operator: event.currentTarget.value })}
                    >
                      {#each OPERATORS as operator (operator.value)}
                        <option value={operator.value}
                          >{text(operator.labelKey, operator.fallback)}</option
                        >
                      {/each}
                    </select>
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
                        updateCondition(trigger.id, {
                          value: Number(event.currentTarget.value) || 0,
                        })}
                    />
                  </Field>
                {/if}
              </div>

              <!-- THE FORCED OUTCOME, where the effect groups read as a sequence: the condition, what it
                                 does to the outcome, what it does to the tier. -->
              <div class="manager-checks-trigger-effect-row">
                <Field as="div" class="manager-checks-trigger-outcome">
                  <span>{outcomeLegend}</span>
                  <SegmentedControl
                    density="field"
                    options={outcomeSegments(isOutcomeTier)}
                    value={selectedOutcome}
                    groupName={`outcome-${trigger.id}`}
                    ariaLabel={text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn',
                      'Outcome'
                    )}
                    optionDataAttr="data-trigger-outcome"
                    onChange={(next) => updateTrigger(trigger.id, { outcome: next })}
                  />
                </Field>
              </div>

              {#if kind === 'routed'}
                {@const step = tierStepFor(trigger)}
                {@const dangling = isDanglingTarget(step)}
                <!-- Its OWN row: at the pinned manager geometry the outcome toggle and the break pill
                                     already spend most of the card's width. -->
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
                      onChange={(mode) => updateTierStep(trigger.id, { mode })}
                    />
                  </Field>

                  <!-- The operand slot is ALWAYS present at one pinned width and only its contents swap, so
                                         changing mode never moves the control out from under the pointer. -->
                  <Field
                    as="div"
                    class={`manager-checks-trigger-step-operand ${dangling ? 'is-invalid' : ''}`}
                  >
                    <span>{tierStepAmountLabel}</span>
                    {#if step.mode === 'up' || step.mode === 'down'}
                      <!-- `fill` is what keeps the canonical no-movement guarantee
                                                 (`openspec/specs/ui-integration/spec.md`, "a stable operand slot at one pinned
                                                 width"): the slot stays pinned and the primitive stretches into it, so a mode
                                                 swap leaves POSITION and BOX SIZE unchanged, radius and fill still differing.
                                                 `data-trigger-tier-step-steps` rides `inputProps` onto the real `<input>`, and
                                                 `Math.trunc` stays: `Stepper` clamps but does not truncate. -->
                      <Stepper
                        fill
                        value={step.steps}
                        min={1}
                        {...tierStepAdjunctLabels}
                        ariaLabel={step.mode === 'up'
                          ? text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsUp',
                              'Steps up'
                            )
                          : text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsDown',
                              'Steps down'
                            )}
                        inputProps={{ 'data-trigger-tier-step-steps': '' }}
                        onChange={(next) =>
                          updateTierStep(trigger.id, { steps: Math.max(1, Math.trunc(next)) })}
                      />
                    {:else if step.mode === 'target' && outcomeOptions.length > 0}
                      <!-- A <select> whose value matches no option renders its FIRST as selected, so a null
                                                 `tierId` would show a tier the check has not persisted; the disabled
                                                 placeholder is what makes "nothing chosen" read as nothing chosen. -->
                      <select
                        data-trigger-tier-step-target
                        aria-label={text(
                          'FABRICATE.Admin.Manager.Checks.Breakage.TierStepTier',
                          'Tier'
                        )}
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
                  </Field>

                  {#if step.mode === 'target' && outcomeOptions.length === 0}
                    <!-- Its own hook, distinct from the outcomeTier condition's: a trigger that is both
                                             outcomeTier-conditioned and target-stepping on a tier-less check would otherwise
                                             carry two identically-hooked nodes in one card. -->
                    <p
                      class="manager-muted manager-checks-trigger-step-hint"
                      data-trigger-step-no-tiers
                    >
                      {text(
                        'FABRICATE.Admin.Manager.Checks.Breakage.TierStepNoTiers',
                        'Add named outcome tiers to step to one.'
                      )}
                    </p>
                  {/if}
                </div>
              {/if}

              <!-- BREAKING THE TOOLS IS ITS OWN CARD: a hazard with a glyph, a title and a sentence,
                                 through the shared `ToggleCard` the On failure screen's own flags use. -->
              {#if showBreakTools}
                <ToggleCard
                  icon="fas fa-hammer"
                  section="trigger-break-tools"
                  toggleAttr="data-trigger-break"
                  title={text(
                    'FABRICATE.Admin.Manager.Checks.Breakage.BreakToolsCardTitle',
                    'Break the required tools'
                  )}
                  sub={text(
                    'FABRICATE.Admin.Manager.Checks.Breakage.BreakToolsCardDesc',
                    'When this trigger fires, the tools break regardless of the failure policy.'
                  )}
                  toggleLabel={text(
                    'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak',
                    'Break tools'
                  )}
                  on={trigger.breakTools === true}
                  onToggle={(next) => updateTrigger(trigger.id, { breakTools: next })}
                />
              {:else}
                <!-- WHY THERE IS NO BREAK CARD, stated where the missing control would be. -->
                <p class="manager-muted manager-checks-trigger-hint" data-trigger-break-unavailable>
                  {text(
                    'FABRICATE.Admin.Manager.Checks.Breakage.LeadOutcomeOnly',
                    'Each trigger can force the check outcome. Switch the tool-breakage authority to check-driven to let triggers break tools.'
                  )}
                </p>
              {/if}

              <!-- The rule restated in prose: the controls above are the parts, this is the sum. -->
              <p class="manager-checks-trigger-quote" data-trigger-quote={trigger.id}>
                <i class="fas fa-quote-left" aria-hidden="true"></i>
                <span>{effectSentence(trigger)}</span>
              </p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- A full-width dashed control UNDER the list rather than a button in a card head: the
         action that grows the list belongs at the end of the list it grows. -->
  <ManagerButton role="dashed" data-add-trigger onclick={addTrigger}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.AddTrigger', 'Add trigger')}</span>
  </ManagerButton>
</div>
