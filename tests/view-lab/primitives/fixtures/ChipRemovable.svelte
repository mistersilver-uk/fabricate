<!-- A removable chip's call site: a member of an editable set, with the handler it requires. -->
<script>
  let { component: Specimen, props = {}, children } = $props();

  function remove() {}
</script>

<Specimen {...props} onRemove={remove}>{@render children?.()}</Specimen>
