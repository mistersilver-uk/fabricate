<!-- An inspector section holding a dense list row. No shipped `Rail` caller hosts one: the drawing's. -->
<script>
  import ListRow from '../../../../src/ui/svelte/components/ListRow.svelte';

  let { component: Specimen, props = {}, name } = $props();
</script>

<Specimen {...props}>
  <ListRow {name} icon="fas fa-hammer" density="dense" markSize={22} />
</Specimen>
