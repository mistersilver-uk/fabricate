<!-- Svelte 5 runes mode -->
<!--
  One iterative result set's Produced when lines: each a Success or Failure end and the rules that
  must all hold with it, any one line producing the set. A set with no line is never produced, and
  a line that does not parse draws its own mark.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `lines` | `ResultGroup.producedWhen` | `[]` | the lines as drafted |
  | `sources` / `counterNames` | `{ id, label }[]` | `[]` | the Counter Instances a rule may name, and the library names of any other |
  | `actions` | `{ id, label }[]` | `[]` | the actions a Previous action rule may name |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onChange(lines)` — the whole next list; the last line removed hands `[]`.

  Invariants:
  - Removing a line hands focus to the next line's remove, else the When adder.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../../../components/Button.svelte';
  import IconButton from '../../../../components/IconButton.svelte';
  import Kicker from '../../../../components/Kicker.svelte';
  import SegmentedControl from '../../../../components/SegmentedControl.svelte';
  import { producedWhenLineFault } from '../../../../../../models/iterativeStepConfig.js';
  import { arrayOrEmpty, isPlainObject } from '../../../../../../utils/scalars.js';
  import CounterRuleList from '../../iterative/CounterRuleList.svelte';
  import FaultLine from '../../iterative/FaultLine.svelte';

  let {
    lines = [],
    sources = [],
    counterNames = [],
    actions = [],
    text = (_key, fallback) => fallback,
    onChange = () => {},
  } = $props();

  const uid = $props.id();
  let root = $state(null);

  const held = $derived(arrayOrEmpty(lines));
  const ends = $derived([
    {
      value: 'success',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.EndSuccess', 'Success'),
      icon: 'fas fa-check',
      variant: 'success',
    },
    {
      value: 'failure',
      label: text('FABRICATE.Admin.Manager.Recipe.Iterative.EndFailure', 'Failure'),
      icon: 'fas fa-xmark',
      variant: 'danger',
    },
  ]);
  const faultId = (index) => `${uid}-line-${index}-fault`;
  const viewOf = (line) => (isPlainObject(line) ? line : {});

  const replaceAt = (index, line) =>
    onChange(held.map((entry, at) => (at === index ? line : entry)));

  async function removeAt(index) {
    onChange(held.filter((_, at) => at !== index));
    await tick();
    const removes = root?.querySelectorAll('[data-produced-when-remove]') ?? [];
    (removes[index] ?? root?.querySelector('[data-produced-when-add]'))?.focus();
  }
</script>

<div class="manager-produced-when" bind:this={root} data-produced-when>
  <Kicker as="span"
    >{text('FABRICATE.Admin.Manager.Recipe.Iterative.ProducedWhen', 'Produced when')}</Kicker
  >
  {#each held as line, index (index)}
    {@const view = viewOf(line)}
    {@const fault = producedWhenLineFault(line)}
    <div class="manager-produced-when-line" data-produced-when-line={index}>
      <SegmentedControl
        options={ends}
        value={view.end ?? ''}
        density="inline"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.ProducedWhenEnd',
          'Success or failure'
        )}
        optionDataAttr="data-produced-when-end"
        aria-invalid={fault ? 'true' : undefined}
        aria-describedby={fault ? faultId(index) : undefined}
        onChange={(end) => replaceAt(index, { ...view, end, rules: arrayOrEmpty(view.rules) })}
      />
      <span class="manager-produced-when-and"
        >{text('FABRICATE.Admin.Manager.Iterative.JoinerAnd', 'and')}</span
      >
      <CounterRuleList
        rules={arrayOrEmpty(view.rules)}
        counterSources={sources}
        {counterNames}
        sourceScope="step"
        {actions}
        combineControl={false}
        joiner="and"
        adderLabel={text('FABRICATE.Admin.Manager.Recipe.Iterative.AddCondition', 'Condition')}
        emptyText={text('FABRICATE.Admin.Manager.Recipe.Iterative.AnyValue', 'Any value')}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Iterative.ProducedWhenRules', 'Conditions')}
        {text}
        onChange={({ rules }) => replaceAt(index, { ...view, rules })}
      />
      <IconButton
        role="ghost-danger"
        icon="fas fa-xmark"
        size="24"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.RemoveProducedWhen',
          'Remove this condition'
        )}
        data-produced-when-remove={index}
        onclick={() => removeAt(index)}
      />
      <div class="manager-produced-when-fault">
        <FaultLine
          id={faultId(index)}
          faults={fault ? [{ code: 'iterativeInvalidEntry', reason: fault }] : []}
          {text}
        />
      </div>
    </div>
  {/each}
  <FaultLine
    faults={held.length === 0
      ? [
          {
            tone: 'warning',
            message: text(
              'FABRICATE.Admin.Manager.Recipe.Iterative.NeverProduced',
              'Never produced. Add when it should be.'
            ),
          },
        ]
      : []}
    {text}
  />
  <div class="manager-produced-when-add">
    <Button
      role="dashed"
      size="26"
      icon="fas fa-plus"
      data-produced-when-add
      onclick={() => onChange([...held, { end: 'success', rules: [] }])}
      >{text('FABRICATE.Admin.Manager.Recipe.Iterative.AddProducedWhen', 'When')}</Button
    >
  </div>
</div>

<style>
  .manager-produced-when {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-produced-when-line {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--fab-space-2);
  }

  .manager-produced-when-and {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    color: var(--fab-text-muted);
    font-size: 0.72rem;
  }

  .manager-produced-when-fault {
    grid-column: 1 / -1;
  }

  .manager-produced-when-add {
    justify-self: start;
  }
</style>
