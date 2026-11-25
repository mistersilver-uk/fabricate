<!-- Svelte 5 runes mode -->
<!--
  "Counters in this step": each Counter Instance's Hide from players and Lock for one step. A
  counter players never see is hidden in every step, so its Hide is checked, disabled and says so.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `config` | a normalized `StepIterative` | — | from `stepConfigOf` |
  | `sources` | `{ id, label, visible }[]` | `[]` | the Counter Instances, from `instanceSources` |
  | `stepNumber` | integer | `1` | the 1-based step the names say |
  | `disabled` | boolean | `false` | every control off |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onChange(config)` — the whole next config.
-->
<script>
  import DataTable from '../../../../components/DataTable.svelte';
  import SelectionCheckbox from '../../../../components/SelectionCheckbox.svelte';
  import { fill } from '../../../../../../utils/fillPlaceholders.js';
  import { arrayOrEmpty } from '../../../../../../utils/scalars.js';
  import { toggledId } from './iterativeStepConfig.js';

  let {
    config,
    sources = [],
    stepNumber = 1,
    disabled = false,
    text = (_key, fallback) => fallback,
    onChange = () => {},
  } = $props();

  const uid = $props.id();
  const hidden = $derived(arrayOrEmpty(config?.hiddenCounterIds));
  const locked = $derived(arrayOrEmpty(config?.lockedCounterIds));

  const columns = $derived([
    {
      key: 'counter',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.ColumnCounter', 'Counter'),
      rowHeader: true,
    },
    {
      key: 'players',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.ColumnPlayers', 'Players'),
      width: '220px',
    },
    {
      key: 'changes',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.ColumnChanges', 'Changes'),
      width: '120px',
    },
  ]);
  const name = (key, fallback, row) =>
    fill(text(key, fallback), { counter: row.label, n: stepNumber });
</script>

{#snippet cell(row, col)}
  {#if col.key === 'counter'}
    <span class="manager-iterative-step-counter-name">{row.label}</span>
  {:else if col.key === 'players'}
    <span class="manager-iterative-step-counter-hide">
      <SelectionCheckbox
        checked={!row.visible || hidden.includes(row.id)}
        disabled={disabled || !row.visible}
        ariaLabel={name(
          'FABRICATE.Admin.Manager.Recipe.Iterative.HideName',
          'Hide {counter} in step {n}',
          row
        )}
        aria-describedby={row.visible ? undefined : `${uid}-${row.id}-never`}
        data-iterative-step-hide={row.id}
        onChange={() => onChange({ ...config, hiddenCounterIds: toggledId(hidden, row.id) })}
      >
        {#snippet label()}{text(
            'FABRICATE.Admin.Manager.Recipe.Iterative.HideFromPlayers',
            'Hide from players'
          )}{/snippet}
      </SelectionCheckbox>
      {#if !row.visible}
        <span class="manager-muted" id={`${uid}-${row.id}-never`} data-iterative-step-never-shown
          >{text(
            'FABRICATE.Admin.Manager.Recipe.Iterative.HiddenEveryStep',
            'Hidden from players in every step'
          )}</span
        >
      {/if}
    </span>
  {:else}
    <SelectionCheckbox
      checked={locked.includes(row.id)}
      {disabled}
      ariaLabel={name(
        'FABRICATE.Admin.Manager.Recipe.Iterative.LockName',
        'Lock {counter} in step {n}',
        row
      )}
      data-iterative-step-lock={row.id}
      onChange={() => onChange({ ...config, lockedCounterIds: toggledId(locked, row.id) })}
    >
      {#snippet label()}{text('FABRICATE.Admin.Manager.Recipe.Iterative.Lock', 'Lock')}{/snippet}
    </SelectionCheckbox>
  {/if}
{/snippet}

<div class="manager-iterative-step-counters" data-iterative-step-part="counters">
  <DataTable
    heading={text(
      'FABRICATE.Admin.Manager.Recipe.Iterative.StepCountersHeading',
      'Counters in this step'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Recipe.Iterative.StepCountersHint',
      'Locked counters don’t change in this step.'
    )}
    {columns}
    rows={sources}
    rowKey={(row) => row.id}
    {cell}
    rowData={(row) => ({ 'data-iterative-step-counter': row.id })}
  />
</div>

<style>
  .manager-iterative-step-counters :global(.fabricate-data-table-table) {
    min-width: 520px;
  }

  .manager-iterative-step-counter-name {
    font-weight: 600;
  }

  .manager-iterative-step-counter-hide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1) var(--fab-space-2);
  }

  .manager-iterative-step-counter-hide .manager-muted {
    margin: 0;
  }
</style>
