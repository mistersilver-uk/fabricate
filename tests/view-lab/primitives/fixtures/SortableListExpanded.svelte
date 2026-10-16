<!--
  Complications in an expandable list, as `RecipeStepAccordion` wires one. No caller ships the
  complication body, so it is composed from the primitives the drawing shows. The well stacks its
  two controls with the drawing's gap, and the severity track keeps its own width in that stack,
  both as the row's `data` styles: a well lays nothing out, so the stacking is the call site's.
-->
<script>
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import SegmentedControl from '../../../../src/ui/svelte/components/SegmentedControl.svelte';
  import ToggleCard from '../../../../src/ui/svelte/components/ToggleCard.svelte';
  import Well from '../../../../src/ui/svelte/components/Well.svelte';

  let {
    component: Specimen,
    props = {},
    severityLabel,
    severities = [],
    shownLabel,
    shownHint,
    wellStyle,
    severityStyle,
  } = $props();

  const itemLabel = (item) => item.name;

  function ignore() {}
</script>

<Specimen {...props} {itemLabel} onReorder={ignore} onRemove={ignore} onToggle={ignore}>
  {#snippet row(item)}
    {item.name}
    <Chip tone={item.tone}>{item.badge}</Chip>
  {/snippet}
  {#snippet body(item)}
    <Well label={severityLabel} style={wellStyle}>
      <SegmentedControl
        options={severities}
        value={item.severity}
        groupName={item.id}
        ariaLabel={severityLabel}
        density="field"
        style={severityStyle}
      />
      <ToggleCard icon="" title={shownLabel} sub={shownHint} on={item.shown} />
    </Well>
  {/snippet}
</Specimen>
