<!-- Svelte 5 runes mode -->
<!--
  A rolled choice group alternative's range cell: the lowest and the highest selection roll that
  award it, as two inline number fields in the row's convert slot, with the cell's problem on a line
  of its own after the row's controls. It renders a fragment into a `PickerRow`'s `trailing`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `range` | `{ from, to }` \| `null` | `null` | Either end is `null` while unfilled. |
  | `name` | string | `''` | The alternative's subject, or its kind word while unnamed, which names each field. |
  | `problem` | localized string | `''` | Marks both fields invalid and describes them with it. |
  | `disabled` | boolean | `false` | Both fields off. |
  | `class` | class string | `''` | Appended to the cell's own. |

  Callbacks:
  - `onChange(range)` — `{ from, to }` on every edit, a cleared end being `null`.

  Rest spread:
  - `{...rest}` lands on the cell, written after `class`.
-->
<script module>
  // Minted per instance: the problem line's id, which both fields reference.
  let rangeSeq = 0;
</script>

<script>
  import Field from '../../../components/Field.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';

  let {
    range = null,
    name = '',
    problem = '',
    disabled = false,
    class: className = '',
    onChange = () => {},
    ...rest
  } = $props();

  rangeSeq += 1;
  const problemId = `fabricate-range-problem-${rangeSeq}`;

  const ends = $derived({ from: range?.from ?? null, to: range?.to ?? null });
  const invalidAttrs = $derived(
    problem ? { 'aria-invalid': 'true', 'aria-describedby': problemId } : {}
  );

  const FIELDS = [
    ['from', 'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RangeLow', 'Lowest roll selecting {name}'],
    ['to', 'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RangeHigh', 'Highest roll selecting {name}'],
  ];

  function write(end, raw) {
    const typed = raw === '' ? null : Number(raw);
    onChange({ ...ends, [end]: Number.isFinite(typed) ? typed : null });
  }
</script>

<span
  class={['manager-recipe-range-cell', className].filter(Boolean).join(' ')}
  data-recipe-range-cell
  {...rest}
>
  {#each FIELDS as [end, key, fallback], index (end)}
    {#if index > 0}<span class="manager-recipe-range-dash" aria-hidden="true">–</span>{/if}
    <Field as="label" class="manager-recipe-range-field">
      <span class="visually-hidden">{localizeOr(key, fallback, { name })}</span>
      <input
        type="number"
        step="1"
        inputmode="numeric"
        value={ends[end] ?? ''}
        {disabled}
        data-recipe-range={end}
        {...invalidAttrs}
        oninput={(event) => write(end, event.currentTarget.value)}
      />
    </Field>
  {/each}
</span>
{#if problem}
  <span id={problemId} class="manager-recipe-option-invalid" data-recipe-range-problem
    >{problem}</span
  >
{/if}

<style>
  .manager-recipe-option-invalid {
    color: var(--fab-danger-text);
    font-size: 0.66rem;
  }
</style>
