<!-- Svelte 5 runes mode -->
<!--
  A test-only manager rail: the label, a scope card and the real `NavSidebar` over `rows` plain
  rows, the one at `activeIndex` active. The rail is as tall as its body, as a side rail is.
-->
<script>
  import NavSidebar from '../../../src/ui/svelte/components/NavSidebar.svelte';

  let { rows = 30, activeIndex = 0 } = $props();

  const entries = $derived(
    Array.from({ length: rows }, (_, index) => ({
      id: `row-${index}`,
      domId: `nav-row-${index}`,
      hooks: {},
      markers: [],
      icon: 'fas fa-circle',
      label: `Row ${index}`,
      active: index === activeIndex,
      current: index === activeIndex ? 'page' : undefined,
    }))
  );
</script>

<aside class="manager-rail">
  <p class="manager-rail-title">GM Management</p>
  <section class="manager-rail-block">
    <div class="manager-scope-card">
      <button type="button" class="manager-scope-return"><span>All crafting systems</span></button>
    </div>
  </section>
  <NavSidebar variant="labelled" label="Manager sections">
    {#snippet content(renderRows)}
      {@render renderRows(entries)}
    {/snippet}
  </NavSidebar>
</aside>
