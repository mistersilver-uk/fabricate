<!-- A stage's requirement row, as `StepDetails` wires its `SlotRow`: held stock by component, each tile named by its slot. -->
<script>
  let { component: Specimen, props = {}, held = {} } = $props();

  const heldCount = (componentId) => held[componentId] ?? 0;
  const slotLabel = (slot) => slot.label;

  function choose() {}
</script>

<Specimen {...props} held={heldCount} onChoose={choose} {slotLabel} />
