<!--
  A set card's call site: the rename and action handlers its callers pass, and the caller's closing
  note, from the row's `note`, where the row has one.
-->
<script>
  let { component: Specimen, props = {}, note = '' } = $props();

  function rename() {}

  function act() {}
</script>

{#snippet closing()}{note}{/snippet}

<Specimen {...props} onRename={rename} onAction={act} note={note ? closing : undefined} />
