<!-- A notice's action as a caller wires it: the row's `action` label, with the handler it needs. -->
<script>
  let { component: Specimen, props = {} } = $props();

  function ignore() {}
</script>

<Specimen {...props} onAction={ignore} />
