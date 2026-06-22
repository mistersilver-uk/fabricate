<!-- Svelte 5 runes mode -->
<!--
  Routed-mode crafting check editor.

  A routed crafting check has a TYPE (relative or fixed), a roll EXPRESSION, and
  a table of OUTCOME TIERS:
    - relative: each tier carries a +/- DC applied to a recipe's DC.
    - fixed:    each tier carries a start/end segment of the expression's value
                range; segments must not overlap.
  Every outcome has a name, a generated secret id, a success toggle, and a
  break-tools toggle. Both the relative DC and the fixed start/end are kept on
  each outcome so switching type never destroys the other mode's values.

  Controlled component: it renders `value` and emits the next value through
  `onChange`. Parsing/validation lives in utils/craftingCheckExpression.js.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    parseDiceGroups,
    expressionRange,
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

  const TYPES = [
    {
      id: 'relative',
      label: text('FABRICATE.Admin.Manager.Checks.Crafting.TypeRelative', 'Relative'),
      desc: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelativeDesc',
        'Each tier shifts a recipe DC up or down by a fixed amount.'
      ),
    },
    {
      id: 'fixed',
      label: text('FABRICATE.Admin.Manager.Checks.Crafting.TypeFixed', 'Fixed'),
      desc: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixedDesc',
        'Each tier owns a non-overlapping segment of the roll value range.'
      ),
    },
  ];

  const type = $derived(value?.type === 'fixed' ? 'fixed' : 'relative');
  const outcomes = $derived(Array.isArray(value?.outcomes) ? value.outcomes : []);
  const diceGroups = $derived(parseDiceGroups(value?.rollExpression));
  const range = $derived(expressionRange(value?.rollExpression));
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

  function emit(patch) {
    onChange({ ...value, ...patch });
  }

  function setType(nextType) {
    if (nextType === type) return;
    emit({ type: nextType });
  }

  function updateOutcome(id, patch) {
    emit({ outcomes: outcomes.map((outcome) => (outcome.id === id ? { ...outcome, ...patch } : outcome)) });
  }

  function removeOutcome(id) {
    emit({ outcomes: outcomes.filter((outcome) => outcome.id !== id) });
  }

  function addOutcome() {
    const last = outcomes[outcomes.length - 1];
    const nextStart = type === 'fixed' && last ? Number(last.end) + 1 : range.valid ? range.min : 1;
    emit({
      outcomes: [
        ...outcomes,
        { id: newId(), name: '', success: false, breakTools: false, dc: 0, start: nextStart, end: nextStart },
      ],
    });
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
    <div class="manager-checks-type-toggle" role="group" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TypeTitle', 'Check type')}>
      {#each TYPES as option (option.id)}
        <button
          type="button"
          class={`manager-checks-type-option ${type === option.id ? 'is-active' : ''}`}
          aria-pressed={type === option.id}
          data-check-type-option={option.id}
          onclick={() => setType(option.id)}
        >
          <span class="manager-checks-type-name">{option.label}</span>
          <span class="manager-checks-type-desc">{option.desc}</span>
        </button>
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
    {#if type === 'fixed'}
      <p class="manager-muted" data-expression-range>
        {#if range.valid}
          {text('FABRICATE.Admin.Manager.Checks.Crafting.ValueRange', 'Value range')} {range.min}–{range.max}
        {:else}
          {text('FABRICATE.Admin.Manager.Checks.Crafting.ValueRangeUnknown', 'Enter a valid expression to bound the value range.')}
        {/if}
      </p>
    {/if}
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
      <ul class="manager-checks-outcomes">
        {#each outcomes as outcome, index (outcome.id)}
          <li class={`manager-checks-outcome-row ${rowInvalid(index) ? 'is-invalid' : ''}`} data-outcome-row={outcome.id}>
            <label class="manager-field manager-checks-outcome-name">
              <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}</span>
              <input
                data-outcome-name
                value={outcome.name || ''}
                oninput={(event) => updateOutcome(outcome.id, { name: event.currentTarget.value })}
              />
            </label>

            {#if type === 'relative'}
              <label class="manager-field manager-checks-outcome-value">
                <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeDc', 'DC ±')}</span>
                <input
                  type="number"
                  data-outcome-dc
                  value={outcome.dc ?? 0}
                  oninput={(event) => updateOutcome(outcome.id, { dc: numeric(event.currentTarget.value) })}
                />
              </label>
            {:else}
              <label class="manager-field manager-checks-outcome-value">
                <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeStart', 'Start')}</span>
                <input
                  type="number"
                  data-outcome-start
                  value={outcome.start ?? 0}
                  oninput={(event) => updateOutcome(outcome.id, { start: numeric(event.currentTarget.value) })}
                />
              </label>
              <label class="manager-field manager-checks-outcome-value">
                <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeEnd', 'End')}</span>
                <input
                  type="number"
                  data-outcome-end
                  value={outcome.end ?? 0}
                  oninput={(event) => updateOutcome(outcome.id, { end: numeric(event.currentTarget.value) })}
                />
              </label>
            {/if}

            <label class="manager-toggle">
              <input
                type="checkbox"
                data-outcome-success
                checked={outcome.success === true}
                onchange={(event) => updateOutcome(outcome.id, { success: event.currentTarget.checked })}
              />
              <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')}</span>
            </label>
            <label class="manager-toggle">
              <input
                type="checkbox"
                data-outcome-break
                checked={outcome.breakTools === true}
                onchange={(event) => updateOutcome(outcome.id, { breakTools: event.currentTarget.checked })}
              />
              <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}</span>
            </label>

            <span class="manager-checks-outcome-id" title={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeId', 'Secret outcome ID')} data-outcome-id={outcome.id}>#{String(outcome.id).slice(0, 6)}</span>
            <button
              type="button"
              class="manager-icon-button is-danger"
              data-remove-outcome
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveOutcome', 'Remove outcome')}
              onclick={() => removeOutcome(outcome.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>
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
