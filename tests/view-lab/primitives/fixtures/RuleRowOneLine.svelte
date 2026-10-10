<!-- A gathering condition modifier, as `GatheringModifierEditor` wires its rule: the condition heads it. -->
<script>
  let { component: Specimen, props = {}, icon, title, removeLabel } = $props();

  const schema = $derived({
    head: () => ({ glyph: icon, title }),
    steps: [],
    labels: { remove: removeLabel },
  });

  function change() {}
</script>

<Specimen {...props} {schema} onChange={change} />
