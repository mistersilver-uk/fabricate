<!-- Svelte 5 runes mode -->
<!-- A test-only `labelled` caller (issue 1777): `content` hands each section to `rows`. -->
<script>
  import NavSidebar from '../../../src/ui/svelte/components/NavSidebar.svelte';

  let { label = 'Manager sections', sections = [] } = $props();
</script>

<NavSidebar variant="labelled" {label}>
  {#snippet content(rows)}
    {#each sections as section, index (index)}
      {@render rows(section.entries, section.options)}
    {/each}
  {/snippet}
</NavSidebar>
