<!--
  A link field's action column as a caller wires it: unlink always, copy and Relink where the row's
  `data` asks for them. The labels are the row's props.
-->
<script>
  let { component: Specimen, props = {}, copy = false, relink = false } = $props();

  function ignore() {}
</script>

<Specimen
  {...props}
  onCopy={copy ? ignore : null}
  onUnlink={ignore}
  onRelink={relink ? ignore : null}
/>
