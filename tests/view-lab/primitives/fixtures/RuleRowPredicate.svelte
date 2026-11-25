<!--
  One counter predicate, as `CounterRuleList` wires its rule: one condition the caller combines
  with its siblings, on one line, with its source, comparison and value as the field chain.
-->
<script>
  import Select from '../../../../src/ui/svelte/components/Select.svelte';
  import Stepper from '../../../../src/ui/svelte/components/Stepper.svelte';

  let {
    component: Specimen,
    props = {},
    icon,
    title,
    removeLabel,
    sourceLabel,
    opLabel,
    valueLabel,
  } = $props();

  const schema = $derived({
    head: () => ({ glyph: icon, title }),
    steps: [
      { key: 'source', render: source },
      { key: 'op', render: op },
      { key: 'value', render: amount },
    ],
    labels: { remove: removeLabel },
  });

  function change() {}
</script>

{#snippet source(rule)}
  <Select
    size="inline"
    ariaLabel={sourceLabel}
    value={rule.counterId}
    options={[{ value: rule.counterId, label: sourceLabel }]}
    onChange={change}
  />
{/snippet}

{#snippet op(rule)}
  <Select
    size="inline"
    ariaLabel={opLabel}
    value={rule.op}
    options={[{ value: rule.op, label: opLabel }]}
    onChange={change}
  />
{/snippet}

{#snippet amount(rule)}
  <Stepper ariaLabel={valueLabel} value={rule.value} onChange={change} />
{/snippet}

<Specimen {...props} {schema} onChange={change} />
