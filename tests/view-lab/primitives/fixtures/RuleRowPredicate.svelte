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
    selectSize,
  } = $props();

  function change() {}
</script>

<!-- The chain's renderers stand in the block that reads them, so each is wired and none is spare. -->
{#if Specimen}
  {#snippet source(rule)}
    <Select
      size={selectSize}
      ariaLabel={sourceLabel}
      value={rule.counterId}
      options={[{ value: rule.counterId, label: sourceLabel }]}
      onChange={change}
    />
  {/snippet}
  {#snippet op(rule)}
    <Select
      size={selectSize}
      ariaLabel={opLabel}
      value={rule.op}
      options={[{ value: rule.op, label: opLabel }]}
      onChange={change}
    />
  {/snippet}
  {#snippet amount(rule)}
    <Stepper ariaLabel={valueLabel} value={rule.value} onChange={change} />
  {/snippet}
  {@const schema = {
    head: () => ({ glyph: icon, title }),
    steps: [source, op, amount].map((render, index) => ({ key: index, render })),
    labels: { remove: removeLabel },
  }}
  <Specimen {...props} {schema} onChange={change} />
{/if}
