<!--
  A GM progressive salvage stage, as `ComponentSalvageStages` wires its `SortableList`: the stage's
  name in `row` and the row's `StageComplicationList` in `body` (issue 2445).
-->
<script>
  import SortableList from '../../../../src/ui/svelte/components/SortableList.svelte';

  let { component: Specimen, props = {}, stages = [] } = $props();

  const itemLabel = (stage) => stage.name;

  function ignore() {}
</script>

<SortableList
  items={stages}
  {itemLabel}
  numbered
  alwaysOpen
  removable
  onReorder={ignore}
  onRemove={ignore}
>
  {#snippet row(stage)}{stage.name}{/snippet}
  {#snippet body()}<Specimen {...props} />{/snippet}
</SortableList>
