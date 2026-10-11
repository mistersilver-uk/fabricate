<!-- A progressive recipe's stage list, as `ProgressiveBody` wires `SortableList` (issue 2381). -->
<script>
  import ProgressiveStageBand from '../../../../src/ui/svelte/apps/crafting/detail/ProgressiveStageBand.svelte';
  import ProgressiveStageRow, {
    stageLabel,
    stageRowClass,
    stageRowData,
  } from '../../../../src/ui/svelte/apps/crafting/detail/ProgressiveStageRow.svelte';

  let { component: Specimen, props = {}, tense } = $props();

  function ignore() {}
</script>

<Specimen
  {...props}
  itemLabel={stageLabel}
  rowClass={stageRowClass}
  rowData={(stage) => stageRowData(stage, props.reorderable)}
  onReorder={ignore}
  onReorderSettled={ignore}
>
  {#snippet row(stage)}<ProgressiveStageRow {stage} />{/snippet}
  {#snippet body(stage)}<ProgressiveStageBand {stage} {tense} />{/snippet}
</Specimen>
