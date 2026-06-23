<!-- Svelte 5 runes mode -->
<!--
  Routed-mode crafting check editor.

  A routed crafting check has a TYPE (relative or fixed), a roll EXPRESSION, and
  a table of OUTCOME TIERS:
    - relative: each tier's threshold is expressed relative to a recipe's DC
                (DC -5, DC +10, …).
    - fixed:    each tier owns a start/end segment of the expression's value
                range; segments must not overlap.
  Every outcome has a name, a generated secret id (kept in data, never shown), a
  success toggle, and a break-tools toggle. Both the relative DC and the fixed
  start/end are kept on each outcome so switching type never destroys the other
  mode's values.

  Reuses the shared GM-UI primitives: ResolutionModeCard for the type selector
  and manager-status-toggle for the per-tier switches. Controlled component:
  renders `value`, emits the next value through `onChange`. Parsing/validation
  lives in utils/craftingCheckExpression.js.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    parseDiceGroups,
    findRangeConflicts,
  } from '../../../../../utils/craftingCheckExpression.js';

  let { value = null, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const TYPE_OPTIONS = [
    {
      value: 'relative',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelative',
      fallback: 'Relative',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelativeDesc',
      descFallback: 'Tier thresholds are relative to the recipe DC, e.g. DC -5 or DC +10.',
    },
    {
      value: 'fixed',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixed',
      fallback: 'Fixed',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixedDesc',
      descFallback: 'Each tier owns a non-overlapping segment of the roll value range.',
    },
  ];

  const type = $derived(value?.type === 'fixed' ? 'fixed' : 'relative');
  // Relative and fixed tiers are independent lists; the editor only ever reads
  // and writes the active type's list, so changes in one mode never touch the other.
  const outcomesKey = $derived(type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes');
  const outcomes = $derived(Array.isArray(value?.[outcomesKey]) ? value[outcomesKey] : []);
  const diceGroups = $derived(parseDiceGroups(value?.rollExpression));
  const conflicts = $derived(type === 'fixed' ? findRangeConflicts(outcomes) : null);

  const validationMessages = $derived(
    [
      conflicts?.invalid.size
        ? text(
            'FABRICATE.Admin.Manager.Checks.Crafting.RangeInvalid',
            'Some tiers have a start greater than their end.'
          )
        : null,
      conflicts?.overlapping.size
        ? text(
            'FABRICATE.Admin.Manager.Checks.Crafting.RangeOverlap',
            'Some tier ranges overlap. Each value range must be unique.'
          )
        : null,
    ].filter(Boolean)
  );

  const successOnLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOn', 'Success'));
  const successOffLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOff', 'Failure'));
  const breakOnLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break'));
  const breakOffLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break"));

  function emit(patch) {
    onChange({ ...value, ...patch });
  }

  function setType(nextType) {
    if (nextType === type) return;
    emit({ type: nextType });
  }

  function updateOutcome(id, patch) {
    emit({
      [outcomesKey]: outcomes.map((outcome) =>
        outcome.id === id ? { ...outcome, ...patch } : outcome
      ),
    });
  }

  function removeOutcome(id) {
    emit({ [outcomesKey]: outcomes.filter((outcome) => outcome.id !== id) });
  }

  function addOutcome() {
    const base = { id: newId(), name: '', success: false, breakTools: false };
    let next;
    if (type === 'fixed') {
      const last = outcomes[outcomes.length - 1];
      const nextStart = last ? Number(last.end) + 1 : 1;
      next = { ...base, start: nextStart, end: nextStart };
    } else {
      next = { ...base, dc: 0 };
    }
    emit({ [outcomesKey]: [...outcomes, next] });
  }

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function rowInvalid(index) {
    return !!conflicts && (conflicts.overlapping.has(index) || conflicts.invalid.has(index));
  }
</script>

<div class="manager-checks-editor" data-crafting-check-editor>
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.TypeTitle', 'Check type')}</h3>
    <div class="manager-checks-type-options" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TypeTitle', 'Check type')}>
      {#each TYPE_OPTIONS as option (option.value)}
        <label
          class={`manager-resolution-option ${type === option.value ? 'is-active' : ''}`}
          data-check-type-option={option.value}
        >
          <input
            type="radio"
            name="crafting-check-type"
            value={option.value}
            checked={type === option.value}
            onchange={() => setType(option.value)}
          />
          <span class="manager-resolution-option-body">
            <span class="manager-resolution-option-name">{text(option.labelKey, option.fallback)}</span>
            <span class="manager-resolution-option-desc">{text(option.descKey, option.descFallback)}</span>
          </span>
        </label>
      {/each}
    </div>
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.ExpressionTitle', 'Roll expression')}</h3>
    <label class="manager-field">
      <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.ExpressionLabel', 'Expression')}</span>
      <input
        data-check-roll-expression
        value={value?.rollExpression || ''}
        placeholder="1d20"
        oninput={(event) => emit({ rollExpression: event.currentTarget.value })}
      />
    </label>
    <div class="manager-checks-dice">
      <span class="manager-field-label">{text('FABRICATE.Admin.Manager.Checks.Crafting.DiceGroups', 'Dice groups')}</span>
      {#if diceGroups.length > 0}
        <div class="manager-chip-row">
          {#each diceGroups as group, index (`${group.raw}-${index}`)}
            <span class="manager-chip" data-dice-group>{group.raw}</span>
          {/each}
        </div>
      {:else}
        <p class="manager-muted" data-dice-empty>{text('FABRICATE.Admin.Manager.Checks.Crafting.NoDice', 'No dice detected in this expression.')}</p>
      {/if}
    </div>
  </section>

  <section class="manager-inspector-card">
    <div class="manager-checks-card-head">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomesTitle', 'Outcome tiers')}</h3>
      <button type="button" class="manager-button" data-add-outcome onclick={addOutcome}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddOutcome', 'Add outcome')}</span>
      </button>
    </div>

    {#if outcomes.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.NoOutcomes', 'No outcome tiers yet. Add the tiers this check routes results into.')}</p>
    {:else}
      <div class={`manager-checks-outcome-table ${type === 'fixed' ? 'is-fixed' : 'is-relative'}`} role="table" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomesTitle', 'Outcome tiers')}>
        <div class="manager-checks-outcome-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}</span>
          {#if type === 'relative'}
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeDc', 'DC ±')}</span>
          {:else}
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeStart', 'Start')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeEnd', 'End')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeColumn', 'Outcome')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}</span>
          <span role="columnheader" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}></span>
        </div>

        {#each outcomes as outcome, index (outcome.id)}
          <div
            class={`manager-checks-outcome-row ${rowInvalid(index) ? 'is-invalid' : ''}`}
            role="row"
            data-outcome-row={outcome.id}
            data-outcome-id={outcome.id}
          >
            <input
              data-outcome-name
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}
              value={outcome.name || ''}
              oninput={(event) => updateOutcome(outcome.id, { name: event.currentTarget.value })}
            />

            {#if type === 'relative'}
              <input
                type="number"
                data-outcome-dc
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeDc', 'DC ±')}
                value={outcome.dc ?? 0}
                oninput={(event) => updateOutcome(outcome.id, { dc: numeric(event.currentTarget.value) })}
              />
            {:else}
              <input
                type="number"
                data-outcome-start
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeStart', 'Start')}
                value={outcome.start ?? 0}
                oninput={(event) => updateOutcome(outcome.id, { start: numeric(event.currentTarget.value) })}
              />
              <input
                type="number"
                data-outcome-end
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeEnd', 'End')}
                value={outcome.end ?? 0}
                oninput={(event) => updateOutcome(outcome.id, { end: numeric(event.currentTarget.value) })}
              />
            {/if}

            <button
              type="button"
              class={`manager-checks-state-pill ${outcome.success === true ? 'is-positive' : 'is-negative'}`}
              data-outcome-success
              aria-pressed={outcome.success === true}
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')}
              onclick={() => updateOutcome(outcome.id, { success: !(outcome.success === true) })}
            >
              {outcome.success === true ? successOnLabel : successOffLabel}
            </button>

            <button
              type="button"
              class={`manager-checks-state-pill ${outcome.breakTools === true ? 'is-negative' : 'is-positive'}`}
              data-outcome-break
              aria-pressed={outcome.breakTools === true}
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}
              onclick={() => updateOutcome(outcome.id, { breakTools: !(outcome.breakTools === true) })}
            >
              {outcome.breakTools === true ? breakOnLabel : breakOffLabel}
            </button>

            <button
              type="button"
              class="manager-icon-button is-danger"
              data-remove-outcome
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveOutcome', 'Remove outcome')}
              onclick={() => removeOutcome(outcome.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if validationMessages.length > 0}
      <ul class="manager-checks-validation" data-checks-validation>
        {#each validationMessages as message (message)}
          <li class="manager-chip is-danger">{message}</li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
