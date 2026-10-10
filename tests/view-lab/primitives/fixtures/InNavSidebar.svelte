<!-- The labelled rows standing in their real parent: the manager rail's `NavSidebar`, unboxed. -->
<script>
  import NavSidebar from '../../../../src/ui/svelte/components/NavSidebar.svelte';
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, labelKey } = $props();
</script>

<NavSidebar variant="labelled" label={localize(labelKey)}>
  {#snippet content()}
    <Specimen {...props} />
  {/snippet}
</NavSidebar>
