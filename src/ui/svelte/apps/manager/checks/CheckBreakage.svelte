<!-- Svelte 5 runes mode -->
<!--
  Per-check tool-breakage trigger editor (issue 419).

  Authored only when the system's tool-breakage authority is `checkDriven`: under
  that authority the active check's triggers decide whether ALL required tools
  break for an attempt (a tool's own breakage mode is ignored except `immune`).
  Triggers are ORed; any match breaks the tools.

  Controlled component mirroring CheckDiceCrits' `{ value, rollFormula, onChange }`
  pattern: reads the `{ enabled, triggers[] }` block + the roll formula and emits the
  next block via onChange. Dice groups are enumerated from the formula via
  parseDiceGroups so a `diceGroup` trigger targets a group by its evaluated-term
  index (groupId); duplicate `NdS` groups are disambiguated `#1`/`#2`.

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

  const enabled = $derived(value?.enabled === true);
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

  function emit(next) {
    onChange({ enabled: next.enabled === true, triggers: Array.isArray(next.triggers) ? next.triggers : [] });
  }

  // The default preset (visible, not implicit): break all required tools when the
  // first d20 group rolls any die equal to 1. With no d20 in the formula, no trigger
  // is seeded and the empty state shows.
  function defaultPresetTrigger() {
    if (firstD20GroupId === null) return null;
    return {
      id: newId(),
      label: text('FABRICATE.Admin.Manager.Checks.Breakage.DefaultPresetLabel', 'Natural 1 on the first d20'),
      condition: { type: 'diceGroup', groupId: firstD20GroupId, aggregate: 'anyDie', operator: '==', value: 1 }
    };
  }

  function toggleEnabled() {
    if (enabled) {
      emit({ enabled: false, triggers });
      return;
    }
    // Seed the default preset on first enable (empty if no d20 group).
    const seeded = triggers.length === 0 ? [defaultPresetTrigger()].filter(Boolean) : triggers;
    emit({ enabled: true, triggers: seeded });
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
    emit({
      enabled: true,
      triggers: [
        ...triggers,
        {
          id: newId(),
          label: text('FABRICATE.Admin.Manager.Checks.Breakage.NewTriggerLabel', 'Break tools'),
          condition: defaultConditionFor(type)
        }
      ]
    });
  }

  function updateTrigger(id, patch) {
    emit({
      enabled: true,
      triggers: triggers.map((trigger) => (trigger.id === id ? { ...trigger, ...patch } : trigger))
    });
  }

  function updateCondition(id, patch) {
    emit({
      enabled: true,
      triggers: triggers.map((trigger) =>
        trigger.id === id
          ? { ...trigger, condition: { ...(trigger.condition || {}), ...patch } }
          : trigger
      )
    });
  }

  function setConditionType(id, type) {
    updateTrigger(id, { condition: defaultConditionFor(type) });
  }

  function removeTrigger(id) {
    emit({ enabled: true, triggers: triggers.filter((trigger) => trigger.id !== id) });
  }

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
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

<section class="manager-inspector-card" data-check-breakage>
  <div class="manager-checks-card-head">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Breakage.Title', 'Tool breakage triggers')}</h3>
    <button
      type="button"
      class={`manager-checks-state-pill ${enabled ? 'is-positive' : 'is-negative'}`}
      data-check-breakage-toggle
      aria-pressed={enabled}
      onclick={toggleEnabled}
    >
      {enabled
        ? text('FABRICATE.Admin.Manager.Checks.Breakage.EnabledOn', 'Enabled')
        : text('FABRICATE.Admin.Manager.Checks.Breakage.EnabledOff', 'Disabled')}
    </button>
  </div>

  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Checks.Breakage.Lead',
      'Any matching trigger breaks every required tool for the attempt (immune tools are never broken).'
    )}
  </p>

  {#if enabled}
    <div class="manager-checks-card-head">
      <span class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Breakage.TriggersTitle', 'Triggers')}</span>
      <button type="button" class="manager-button" data-add-breakage-trigger onclick={addTrigger}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.AddTrigger', 'Add trigger')}</span>
      </button>
    </div>

    {#if triggers.length === 0}
      <p class="manager-muted" data-breakage-empty>
        {firstD20GroupId === null
          ? text('FABRICATE.Admin.Manager.Checks.Breakage.EmptyNoD20', 'Add a trigger to break tools on this check. The formula has no d20 group to seed the natural-1 preset.')
          : text('FABRICATE.Admin.Manager.Checks.Breakage.Empty', 'No triggers yet. Add one to break tools on this check.')}
      </p>
    {:else}
      {#each triggers as trigger (trigger.id)}
        {@const condition = trigger.condition || {}}
        <div class="manager-checks-breakage-trigger" data-breakage-trigger={trigger.id}>
          <div class="manager-checks-breakage-trigger-head">
            <input
              class="manager-checks-breakage-label"
              data-breakage-trigger-label
              aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.TriggerLabel', 'Trigger label')}
              value={trigger.label || ''}
              oninput={(event) => updateTrigger(trigger.id, { label: event.currentTarget.value })}
            />
            <button
              type="button"
              class="manager-icon-button is-danger"
              data-remove-breakage-trigger
              aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.RemoveTrigger', 'Remove trigger')}
              onclick={() => removeTrigger(trigger.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>

          <div class="manager-checks-breakage-condition">
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.ConditionType', 'When')}</span>
              <select
                data-breakage-condition-type
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
                  data-breakage-group
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
                  data-breakage-aggregate
                  value={condition.aggregate || 'anyDie'}
                  onchange={(event) => updateCondition(trigger.id, { aggregate: event.currentTarget.value })}
                >
                  {#each AGGREGATES as option (option.value)}
                    <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                  {/each}
                </select>
              </label>
            {/if}

            {#if condition.type === 'outcomeTier'}
              <div class="manager-checks-breakage-tiers" role="group" aria-label={text('FABRICATE.Admin.Manager.Checks.Breakage.Tiers', 'Outcome tiers')}>
                {#if outcomeOptions.length === 0}
                  <p class="manager-muted" data-breakage-no-tiers>{text('FABRICATE.Admin.Manager.Checks.Breakage.NoTiers', 'Add named outcome tiers to target them.')}</p>
                {:else}
                  {#each outcomeOptions as option (option.id)}
                    <button
                      type="button"
                      class={`manager-checks-state-pill ${isOutcomeSelected(condition, option.id) ? 'is-positive' : 'is-negative'}`}
                      data-breakage-tier={option.id}
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
                  data-breakage-operator
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
                  data-breakage-value
                  value={condition.value ?? 0}
                  oninput={(event) => updateCondition(trigger.id, { value: numeric(event.currentTarget.value) })}
                />
              </label>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  {/if}
</section>
