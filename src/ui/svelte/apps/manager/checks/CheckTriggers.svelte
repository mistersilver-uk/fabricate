<!-- Svelte 5 runes mode -->
<!--
  Unified per-check trigger editor (issue 419 recombine).

  One trigger list per check, ALWAYS rendered. Each trigger pairs an expressive
  dice-matching CONDITION with two effects:
    - `outcome` — force the check to an Automatic success / Automatic failure, or
      leave it (No effect). For a progressive check the success/failure labels read
      Award all / Award none. Forcing applies under BOTH tool-breakage authorities.
    - `breakTools` — break every required tool for the attempt. Authored (and applied)
      ONLY under `checkDriven` authority: the per-trigger break pill is shown/enabled
      only when `showBreakTools` is true, and under `toolSpecific` a check never breaks
      tools.

  An `outcomeTier` condition (routed only) cannot force an outcome — the routed tier
  is resolved AFTER the forced outcome would run, so the outcome select is pinned to
  No effect and disabled for it (such a trigger may still break tools, evaluated at
  the engine seam where the tier is known).

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

  let {
    value = null,
    rollFormula = '',
    kind = 'simple',
    outcomeOptions = [],
    showBreakTools = false,
    onChange = () => {}
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
      const seen = new Map();
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
    { value: 'total', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateTotal', fallback: 'Group total' },
    { value: 'anyDie', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAnyDie', fallback: 'Any die' },
    { value: 'allDice', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAllDice', fallback: 'All dice' },
    { value: 'lowestDie', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateLowestDie', fallback: 'Lowest die' },
    { value: 'highestDie', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateHighestDie', fallback: 'Highest die' }
  ];

  // Condition types offered for this editor kind. progressiveValue is meaningful
  // only on progressive checks; outcomeTier only on routed checks.
  const conditionTypes = $derived(
    [
      { value: 'rollTotal', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeRollTotal', fallback: 'Roll total' },
      kind === 'progressive'
        ? { value: 'progressiveValue', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeProgressiveValue', fallback: 'Awarded value' }
        : null,
      { value: 'diceGroup', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeDiceGroup', fallback: 'Dice group' },
      kind === 'routed'
        ? { value: 'outcomeTier', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeOutcomeTier', fallback: 'Outcome tier' }
        : null
    ].filter(Boolean)
  );

  // Outcome toggle segments, ordered as a good→neutral→bad spectrum
  // (success | no effect | failure) so the neutral default sits in the middle.
  // Progressive checks relabel success/failure to award all/none (they have no
  // pass/fail, only a numeric value), reusing the existing AwardAll/AwardNone keys.
  const outcomeChoices = $derived(
    kind === 'progressive'
      ? [
          { value: 'success', variant: 'is-success', labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardAll', fallback: 'Award all' },
          { value: 'none', variant: 'is-neutral', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone', fallback: 'No effect' },
          { value: 'failure', variant: 'is-danger', labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardNone', fallback: 'Award none' }
        ]
      : [
          { value: 'success', variant: 'is-success', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceSuccess', fallback: 'Automatic success' },
          { value: 'none', variant: 'is-neutral', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone', fallback: 'No effect' },
          { value: 'failure', variant: 'is-danger', labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceFailure', fallback: 'Automatic failure' }
        ]
  );

  const breakOnLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break'));
  const breakOffLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break"));

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
      value: 1
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
        breakTools: showBreakTools === true
      }
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

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function outcomeFor(trigger) {
    const current = trigger?.outcome;
    return current === 'success' || current === 'failure' ? current : 'none';
  }

  function isOutcomeSelected(condition, id) {
    return Array.isArray(condition?.tierIds) && condition.tierIds.includes(id);
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
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Breakage.Title', 'Check triggers')}</h3>
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
      {text('FABRICATE.Admin.Manager.Checks.Breakage.Empty', 'No triggers yet. Add one to force an outcome or break tools on this check.')}
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
                onchange={(event) => updateCondition(trigger.id, { groupId: Number(event.currentTarget.value) })}
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
                onchange={(event) => updateCondition(trigger.id, { aggregate: event.currentTarget.value })}
              >
                {#each AGGREGATES as option (option.value)}
                  <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                {/each}
              </select>
            </label>
          {/if}

          {#if isOutcomeTier}
            <div class="manager-checks-breakage-tiers" role="group" aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.Tiers', 'Outcome tiers')}>
              {#if outcomeOptions.length === 0}
                <p class="manager-muted" data-trigger-no-tiers>{text('FABRICATE.Admin.Manager.Checks.Breakage.NoTiers', 'Add named outcome tiers to target them.')}</p>
              {:else}
                {#each outcomeOptions as option (option.id)}
                  <button
                    type="button"
                    class={`manager-checks-state-pill ${isOutcomeSelected(condition, option.id) ? 'is-positive' : 'is-negative'}`}
                    data-trigger-tier={option.id}
                    aria-pressed={isOutcomeSelected(condition, option.id)}
                    onclick={() => toggleOutcomeTier(trigger.id, option.id)}
                  >
                    {option.name || text('FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier', 'Unnamed tier')}
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
                onchange={(event) => updateCondition(trigger.id, { operator: event.currentTarget.value })}
              >
                {#each OPERATORS as operator (operator)}
                  <option value={operator}>{operator}</option>
                {/each}
              </select>
            </label>
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Value', 'Value')}</span>
              <input
                type="number"
                data-trigger-value
                value={condition.value ?? 0}
                oninput={(event) => updateCondition(trigger.id, { value: numeric(event.currentTarget.value) })}
              />
            </label>
          {/if}
          </div>

          <button
            type="button"
            class="manager-icon-button is-danger manager-checks-trigger-remove"
            data-remove-trigger
            aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.RemoveTrigger', 'Remove trigger')}
            onclick={() => removeTrigger(trigger.id)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>

        <hr class="manager-checks-trigger-divider" aria-hidden="true" />

        <div class="manager-checks-trigger-bottom">
          <div class="manager-field manager-checks-trigger-outcome">
            <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn', 'Outcome')}</span>
            <div
              class="manager-checks-outcome-toggle"
              role="group"
              aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn', 'Outcome')}
            >
              {#each outcomeChoices as option (option.value)}
                <button
                  type="button"
                  class={`manager-checks-outcome-option ${option.variant}`}
                  class:is-selected={selectedOutcome === option.value}
                  data-trigger-outcome={option.value}
                  aria-pressed={selectedOutcome === option.value}
                  disabled={isOutcomeTier && option.value !== 'none'}
                  onclick={() => updateTrigger(trigger.id, { outcome: option.value })}
                >{text(option.labelKey, option.fallback)}</button>
              {/each}
            </div>
          </div>

          {#if showBreakTools}
            <div class="manager-field manager-checks-trigger-break">
              <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}</span>
              <button
                type="button"
                class={`manager-checks-state-pill ${trigger.breakTools === true ? 'is-negative' : 'is-positive'}`}
                data-trigger-break
                aria-pressed={trigger.breakTools === true}
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}
                onclick={() => updateTrigger(trigger.id, { breakTools: !(trigger.breakTools === true) })}
              >
                {trigger.breakTools === true ? breakOnLabel : breakOffLabel}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</section>
