<!--
  A disclosure card as the library draws it: the row's `data` gives the head's name and the body's
  line, and the fixture holds `open`, so a press in the lab opens and closes the card as a caller's
  own state would.
-->
<script>
  import { untrack } from 'svelte';

  let { component: Specimen, props = {}, headName, bodyText } = $props();
  let open = $state(untrack(() => props.open === true));
</script>

<Specimen {...props} {open} onToggle={(next) => (open = next)}>
  {#snippet head()}{headName}{/snippet}
  {#snippet body()}{bodyText}{/snippet}
</Specimen>
