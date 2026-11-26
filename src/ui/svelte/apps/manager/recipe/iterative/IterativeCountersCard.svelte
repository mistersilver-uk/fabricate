<!-- Svelte 5 runes mode -->
<!--
  The recipe Overview's Counters table: one row per Counter Instance, an adder for the library
  counters the recipe does not use yet, and an empty state that adds every library counter. Every
  write is `onUpdateRecipe({ iterative: { ...recipe.iterative, counters } })`; a remove also
  prunes the counter from each step's hide and lock lists in that one patch (`counterRemovalPatch`).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `recipe` | the staged draft | `null` | an absent `iterative` starts as `{ counters: [] }` |
  | `iterative` | the iterative route model | — | reads `counters` and `systemName`; `openCounters()` routes |
  | `isMultiStep` | boolean | `false` | picks the table's hint |
  | `disabled` | boolean | `false` | every control off |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Invariants:
  - Adding focuses the added row's Start; removing focuses the next row's remove, else the adder,
    else the empty state's action. The table scrolls inside its frame below its minimum width.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../../../components/Button.svelte';
  import DataTable from '../../../../components/DataTable.svelte';
  import Select from '../../../../components/Select.svelte';
  import { fill } from '../../../../../../utils/fillPlaceholders.js';
  import { arrayOrEmpty } from '../../../../../../utils/scalars.js';
  import IterativeCounterCell from './IterativeCounterCell.svelte';
  import {
    counterInstanceRows,
    counterRemovalPatch,
    unusedCounters,
  } from './iterativeCounterRows.js';

  let {
    recipe = null,
    iterative,
    isMultiStep = false,
    disabled = false,
    text = (_key, fallback) => fallback,
    onUpdateRecipe = () => {},
  } = $props();

  const uid = $props.id();
  const noteId = `${uid}-adder-note`;
  const ADD_SENTINEL = '';
  let root = $state(null);

  const instances = $derived(arrayOrEmpty(recipe?.iterative?.counters));
  const library = $derived(arrayOrEmpty(iterative?.counters));
  const systemName = $derived(iterative?.systemName ?? '');
  const rows = $derived(counterInstanceRows(instances, library));
  const unused = $derived(unusedCounters(instances, library));
  const say = (key, fallback, values = {}) =>
    fill(text(key, fallback), { system: systemName, ...values });

  /** `[key, label key, fallback, width]`; the Counter column is bounded so its faults wrap in it. */
  const COLUMNS = [
    ['counter', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnCounter', 'Counter', '180px'],
    ['start', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnStart', 'Start', ''],
    ['min', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnMin', 'Min', '112px'],
    ['max', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnMax', 'Max', '112px'],
    ['target', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnTarget', 'Target', '112px'],
    ['visible', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnPlayerSees', 'Player sees', '84px'],
    ['remove', 'FABRICATE.Admin.Manager.Recipe.Iterative.ColumnRemove', 'Remove', '44px'],
  ];
  const columns = $derived(
    COLUMNS.map(([key, labelKey, fallback, width]) => {
      const label = say(labelKey, fallback);
      if (key === 'remove') return { key, label: '', ariaLabel: label, width };
      return { key, label, width, rowHeader: key === 'counter' };
    })
  );

  function write(counters) {
    onUpdateRecipe({ iterative: { ...(recipe?.iterative ?? { counters: [] }), counters } });
  }

  /** After the write renders, focuses the first of `targets` that resolves. */
  async function focusAfter(...targets) {
    await tick();
    for (const target of targets) {
      const element = target(root);
      if (element) return element.focus();
    }
  }
  const nth = (hook, index) => (scope) => scope?.querySelectorAll(`[${hook}]`)[index] ?? null;
  const first = (hook) => (scope) => scope?.querySelector(`[${hook}]`) ?? null;

  const instanceOf = (counterId) => ({ counterId, start: 0, visible: true });

  /** The added row is found by its counter, because a Formula row above it draws no Start stepper. */
  function addCounter(counterId) {
    if (!counterId || disabled) return;
    write([...instances, instanceOf(counterId)]);
    const row = `[data-iterative-counter-row="${counterId}"]`;
    focusAfter(
      first(`data-iterative-counter-start="${counterId}"`),
      (scope) => scope?.querySelector(`${row} input:not([disabled])`) ?? null
    );
  }

  function addAll() {
    if (library.length === 0) return;
    write(library.map((counter) => instanceOf(counter.id)));
    focusAfter(first('data-iterative-counter-start'));
  }

  function remove(index) {
    onUpdateRecipe(counterRemovalPatch(recipe, index));
    focusAfter(
      nth('data-iterative-counter-remove', index),
      first('data-iterative-counter-add'),
      first('data-iterative-counters-add-all')
    );
  }

  const change = (index, next) =>
    write(instances.map((entry, at) => (at === index ? next : entry)));

  const adderOptions = $derived([
    {
      value: ADD_SENTINEL,
      label: say('FABRICATE.Admin.Manager.Recipe.Iterative.AddCounter', '+ Counter'),
    },
    ...unused.map((counter) => ({ value: counter.id, label: counter.label || counter.id })),
  ]);
  const adderNote = $derived(
    library.length
      ? say(
          'FABRICATE.Admin.Manager.Recipe.Iterative.EveryCounterUsed',
          'Every counter in {system} is already in this recipe.'
        )
      : say(
          'FABRICATE.Admin.Manager.Recipe.Iterative.NoLibraryCounters',
          'There are no counters in {system} yet.'
        )
  );
  const addAllLabel = $derived(
    library.length === 1
      ? say('FABRICATE.Admin.Manager.Recipe.Iterative.AddAllCountersOne', 'Add 1 counter')
      : say('FABRICATE.Admin.Manager.Recipe.Iterative.AddAllCounters', 'Add all {count} counters', {
          count: library.length,
        })
  );
  const empty = $derived({
    icon: 'fas fa-gauge-simple-high',
    title: say(
      'FABRICATE.Admin.Manager.Recipe.Iterative.CountersEmptyTitle',
      'No counters set up for this step'
    ),
    hint: say(
      'FABRICATE.Admin.Manager.Recipe.Iterative.CountersEmptyHint',
      'The recipe can’t be crafted until it has at least one counter.'
    ),
    action: emptyAction,
  });
</script>

{#snippet countersLink()}
  <span class="manager-counter-instances-note" id={noteId} data-iterative-counters-note>
    <i class="fas fa-circle-info" aria-hidden="true"></i>{adderNote}
    <Button
      role="ghost"
      size="24"
      data-iterative-counters-open
      onclick={() => iterative?.openCounters?.()}
      >{say(
        'FABRICATE.Admin.Manager.Recipe.Iterative.CreateInCounters',
        'Create one in Counters'
      )}</Button
    >
  </span>
{/snippet}

{#snippet emptyAction()}
  <Button
    role="primary"
    disabled={disabled || library.length === 0}
    aria-describedby={library.length === 0 ? noteId : undefined}
    data-iterative-counters-add-all
    data-validation-target="iterative-counters-add"
    onclick={addAll}>{addAllLabel}</Button
  >
  {#if library.length === 0}{@render countersLink()}{/if}
{/snippet}

{#snippet footer()}
  <Select
    value={ADD_SENTINEL}
    options={adderOptions}
    size="inline"
    showTick={false}
    disabled={disabled || unused.length === 0}
    ariaLabel={say(
      'FABRICATE.Admin.Manager.Recipe.Iterative.AddCounterLabel',
      'Add a counter to this step'
    )}
    ariaDescribedBy={unused.length === 0 ? noteId : ''}
    triggerProps={{ 'data-iterative-counter-add': '', 'data-chip-remove-fallback': '' }}
    onChange={addCounter}
  />
  {#if unused.length === 0}{@render countersLink()}{/if}
  <span class="manager-counter-instances-optional"
    >{say(
      'FABRICATE.Admin.Manager.Recipe.Iterative.CountersOptional',
      'Max and target are optional.'
    )}</span
  >
{/snippet}

{#snippet cell(row, col)}
  <IterativeCounterCell
    {row}
    column={col.key}
    idPrefix={`${uid}-${row.index}`}
    {systemName}
    {disabled}
    {text}
    onChange={(next) => change(row.index, next)}
    onRemove={() => remove(row.index)}
    onCreateCounter={() => iterative?.openCounters?.()}
  />
{/snippet}

<!-- `tabindex="-1"`: a Counter Instance issue's Validation row focuses the table it is in. -->
<div
  class="manager-counter-instances"
  bind:this={root}
  tabindex="-1"
  data-keyboard-focus="true"
  data-recipe-section="iterative-counters"
  data-validation-target="iterative-counters"
>
  <DataTable
    heading={say('FABRICATE.Admin.Manager.Recipe.Iterative.CountersHeading', 'Counters')}
    hint={isMultiStep
      ? say(
          'FABRICATE.Admin.Manager.Recipe.Iterative.CountersHintMulti',
          'Counters carry on from step to step.'
        )
      : say(
          'FABRICATE.Admin.Manager.Recipe.Iterative.CountersHintSingle',
          'Start values, bounds and targets.'
        )}
    {columns}
    {rows}
    rowKey={(row) => row.key}
    {cell}
    {empty}
    footer={rows.length ? footer : undefined}
    rowData={(row) => ({ 'data-iterative-counter-row': row.key })}
  />
</div>

<style>
  .manager-counter-instances :global(.fabricate-data-table-table) {
    min-width: 920px;
  }

  .manager-counter-instances :global(.fabricate-data-table-cell) {
    vertical-align: top;
  }

  .manager-counter-instances-note {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 500;
  }

  .manager-counter-instances-optional {
    margin-inline-start: auto;
    color: var(--fab-text-subtle);
    font-size: 0.625rem;
  }
</style>
