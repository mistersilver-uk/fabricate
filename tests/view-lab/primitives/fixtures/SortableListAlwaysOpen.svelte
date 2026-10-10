<!-- Recipe steps on a tab whose subject is the body, as `RecipeStepAccordion` wires `alwaysOpen`. -->
<script>
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import Well from '../../../../src/ui/svelte/components/Well.svelte';

  let { component: Specimen, props = {}, bodyLabel } = $props();

  const itemLabel = (item) => item.name;
</script>

<Specimen {...props} {itemLabel}>
  {#snippet row(item)}
    {item.name}
    <Chip>{item.badge}</Chip>
  {/snippet}
  {#snippet body()}
    <Well label={bodyLabel} />
  {/snippet}
</Specimen>
