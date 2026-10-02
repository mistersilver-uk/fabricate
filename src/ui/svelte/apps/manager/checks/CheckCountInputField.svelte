<!-- Svelte 5 runes mode -->
<!--
  One counting-pool input, the base pool or the success threshold (issue 2006): a Number stepper or
  a Character value expression, chosen by a `Number` / `Character value` control.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `field` | `'base'` \| `'threshold'` | — | Names the hooks, `data-check-count-{field}`, `-mode` and `-expression`. |
  | `value` | string | `''` | The stored input; an integer literal reads as the Number mode. |
  | `min` / `max` | numbers | — | The stepper's editing bounds; a stored value outside them shows as stored. |
  | `label` / `sourceLabel` | localized strings | — | The input's accessible name, and the mode control's. |
  | `validationTarget` | string | — | The Validation route's id for this input, in either mode. |
  | `character` | `{ name, rollData }` \| `null` | `null` | The Preview-as actor the expression's reading resolves against. |

  Callbacks:
  - `onChange(value)` — the new stored string, only when the GM steps or types.

  Invariants:
  - The mode is view state: switching writes nothing, and each mode keeps its last entry for the
    session until a stored value this field did not write arrives (a Discard) —
    `tests/components/check-count-authoring-mounted.test.js`.
-->
<script>
  import { untrack } from 'svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import CheckCharacterValueField from './CheckCharacterValueField.svelte';
  import { isIntegerLiteral } from './countInsetModel.js';

  let {
    field,
    value = '',
    min,
    max,
    label,
    sourceLabel,
    validationTarget,
    character = null,
    onChange = () => {},
  } = $props();

  const OPTIONS = [
    {
      value: 'number',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Count.InputNumber',
      fallback: 'Number',
    },
    {
      value: 'value',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.SourceAttribute',
      fallback: 'Character value',
    },
  ];

  let chosen = $state(null);
  let drafts = $state({ number: null, value: null });
  const mode = $derived(chosen ?? (isIntegerLiteral(value) ? 'number' : 'value'));
  const numberShown = $derived(drafts.number ?? (isIntegerLiteral(value) ? Number(value) : null));
  const valueShown = $derived(drafts.value ?? String(value ?? ''));

  let seen = untrack(() => String(value));
  let written = null;
  $effect.pre(() => {
    const stored = String(value);
    if (stored !== seen && stored !== written) {
      chosen = null;
      drafts = { number: null, value: null };
    }
    seen = stored;
  });

  // Leaving a mode keeps what it showed, so returning to it shows that entry again.
  function choose(next) {
    if (next === mode) return;
    if (mode === 'number') drafts.number = numberShown;
    else drafts.value = valueShown;
    chosen = next;
  }

  function write(from, next) {
    drafts[from] = next;
    written = String(next);
    onChange(written);
  }

  // Spelled out per field, so each hook a test or capture names is greppable in source.
  const FIELD_HOOKS = {
    base: {
      input: 'data-check-count-base',
    },
    threshold: {
      input: 'data-check-count-threshold',
    },
  };
  const VALUE_HOOKS = {
    base: {
      expression: 'data-check-count-base-expression',
      hint: 'data-check-count-base-expression-hint',
      resolution: 'data-check-count-base-resolution',
    },
    threshold: {
      expression: 'data-check-count-threshold-expression',
      hint: 'data-check-count-threshold-expression-hint',
      resolution: 'data-check-count-threshold-resolution',
    },
  };
</script>

<span class="manager-checks-count-mode">
  <!-- One literal call site per field, so the capture-producer scan can read each option hook. -->
  {#if field === 'base'}
    <SegmentedControl
      fill
      density="field"
      options={OPTIONS}
      value={mode}
      groupName="check-count-base-mode"
      ariaLabel={sourceLabel}
      data-check-count-base-mode
      optionDataAttr="data-check-count-base-mode-option"
      onChange={choose}
    />
  {:else}
    <SegmentedControl
      fill
      density="field"
      options={OPTIONS}
      value={mode}
      groupName="check-count-threshold-mode"
      ariaLabel={sourceLabel}
      data-check-count-threshold-mode
      optionDataAttr="data-check-count-threshold-mode-option"
      onChange={choose}
    />
  {/if}
</span>
{#if mode === 'number'}
  <span class="manager-checks-count-stepper">
    <Stepper
      fill
      allowUnset
      placeholder="—"
      {min}
      {max}
      value={numberShown}
      {...stepperLabels(label)}
      inputProps={{ [FIELD_HOOKS[field].input]: '', 'data-validation-target': validationTarget }}
      onChange={(next) => next !== null && write('number', next)}
    />
  </span>
{:else}
  <span class="manager-checks-count-value">
    <CheckCharacterValueField
      value={valueShown}
      {character}
      {label}
      hooks={VALUE_HOOKS[field]}
      inputAttrs={{ 'data-validation-target': validationTarget }}
      onChange={(next) => write('value', next)}
    />
  </span>
{/if}

<style>
  .manager-checks-count-mode {
    width: 230px;
    max-width: 100%;
  }

  /* The Difficulty card's stepper rung: two 26px adjuncts round the value, at the field height. */
  .manager-checks-count-stepper {
    --fab-stepper-fill-height: 30px;

    width: 96px;
  }

  .manager-checks-count-value {
    flex: 1 1 200px;
    min-width: 0;
  }
</style>
