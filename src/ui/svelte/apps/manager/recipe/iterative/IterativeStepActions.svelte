<!-- Svelte 5 runes mode -->
<!--
  A recipe step's allowed actions: All, or Only the ones chosen through a staged `SetPicker`.
  Switching to Only seeds every library action, and an empty Only list is stated as an error.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `config` | a normalized `StepIterative` | — | from `stepConfigOf` |
  | `options` | `SetPicker` options | `[]` | the library actions, from `actionOptions` |
  | `disabled` | boolean | `false` | every control off |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onChange(config)` — the whole next config.
-->
<script>
  import Kicker from '../../../../components/Kicker.svelte';
  import SegmentedControl from '../../../../components/SegmentedControl.svelte';
  import SetPicker from '../../../../components/SetPicker.svelte';
  import { fill } from '../../../../../../utils/fillPlaceholders.js';
  import FaultLine from '../../iterative/FaultLine.svelte';
  import { actionModeOf, allowedIdsOf } from './iterativeStepConfig.js';

  let {
    config,
    options = [],
    disabled = false,
    text = (_key, fallback) => fallback,
    onChange = () => {},
  } = $props();

  const uid = $props.id();
  const faultId = `${uid}-actions-fault`;

  const mode = $derived(actionModeOf(config));
  const allowed = $derived(allowedIdsOf(config));
  const known = $derived(new Set(options.map((option) => option.id)));
  const allowedCount = $derived(allowed.filter((id) => known.has(id)).length);
  const none = $derived(mode === 'only' && allowed.length === 0);

  const modes = $derived([
    {
      value: 'all',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.ActionsAll', 'All actions'),
    },
    {
      value: 'only',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.ActionsOnly', 'Only these'),
    },
  ]);
  const countText = $derived(
    mode === 'only'
      ? fill(
          text(
            'FABRICATE.Admin.Manager.Recipe.Iterative.ActionsOnlyCount',
            '{count} of {total} allowed'
          ),
          {
            count: allowedCount,
            total: options.length,
          }
        )
      : fill(
          text(
            'FABRICATE.Admin.Manager.Recipe.Iterative.ActionsAllCount',
            'All {total}, including actions added later'
          ),
          {
            total: options.length,
          }
        )
  );

  const write = (actions) => onChange({ ...config, actions });
  function selectMode(next) {
    if (next === mode) return;
    write(
      next === 'only'
        ? { mode: 'only', actionIds: options.map((option) => option.id) }
        : { mode: 'all', actionIds: [] }
    );
  }
</script>

<div class="manager-iterative-step-actions" data-iterative-step-part="actions">
  <div>
    <Kicker>{text('FABRICATE.Admin.Manager.Recipe.Iterative.ActionsHeading', 'Actions')}</Kicker>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.ActionsHint',
        'The actions players can take.'
      )}
    </p>
  </div>
  <div class="manager-iterative-step-actions-mode">
    <SegmentedControl
      options={modes}
      value={mode}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.ActionsModeLabel',
        'Actions allowed in this step'
      )}
      optionDataAttr="data-iterative-step-actions-mode"
      onChange={selectMode}
    />
    <span class="manager-iterative-step-count" data-iterative-step-actions-count>{countText}</span>
  </div>
  {#if mode === 'only'}
    <SetPicker
      value={allowed}
      {options}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.ActionsPickerLabel',
        'Allowed actions'
      )}
      searchLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsSearch', 'Search actions')}
      emptyLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsEmpty', 'No actions yet.')}
      addLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsAdd', 'Choose actions')}
      addProps={{
        'data-iterative-step-actions': '',
        disabled,
        ...(none && { 'aria-invalid': 'true' }),
      }}
      ariaDescribedBy={none ? faultId : ''}
      onChange={(actionIds) => write({ mode: 'only', actionIds })}
    />
  {/if}
  <FaultLine
    id={faultId}
    faults={none
      ? [
          {
            message: text(
              'FABRICATE.Admin.Manager.Recipe.Iterative.ActionsNone',
              'No actions are allowed, so players can’t work this step. Pick at least one.'
            ),
          },
        ]
      : []}
    {text}
  />
</div>

<style>
  .manager-iterative-step-actions {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-iterative-step-actions-mode {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-iterative-step-count {
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
  }
</style>
