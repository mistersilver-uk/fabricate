<!--
  A GM progressive stage, as the recipe and salvage editors wire `ProgressiveStageList`: one
  numbered stage naming its component, its DC and Edit link, and the component's
  `StageComplicationList` in the row's body (issues 2445, 2511).
-->
<script>
  import { format } from '../fixtureActs.js';

  let { component: Specimen, props = {}, editAriaKey } = $props();

  const nameOf = (stage) =>
    (props.componentOptions ?? []).find((option) => option.id === stage.componentId)?.name;

  function ignore() {}
</script>

<Specimen
  {...props}
  itemLabel={nameOf}
  editAriaLabel={(stage) => format(editAriaKey, { name: nameOf(stage) })}
  onItemChange={ignore}
  onReorder={ignore}
  onRemove={ignore}
  onOpenComponent={ignore}
/>
