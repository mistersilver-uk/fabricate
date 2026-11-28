<!-- Svelte 5 runes mode -->
<!--
  A test-only manager rail: the label, a scope card and the real `NavSidebar` over `rows` plain
  rows, the one at `activeIndex` active. With `grouped`, that row is instead an expanded group whose
  parent and first child are active, as a route inside a group is. The rail is as tall as its
  body, as a side rail is.
-->
<script>
  import NavSidebar from '../../../src/ui/svelte/components/NavSidebar.svelte';

  let { rows = 30, activeIndex = 0, grouped = false } = $props();

  const row = (id, active, fields = {}) => ({
    id,
    domId: `nav-${id}`,
    hooks: {},
    markers: [],
    icon: 'fas fa-circle',
    label: id,
    active,
    current: active ? 'page' : undefined,
    ...fields,
  });

  const group = (id, active) => ({
    kind: 'group',
    id,
    expanded: true,
    locked: false,
    hooks: {},
    parent: row(id, active),
    toggle: { domId: `nav-${id}-toggle`, hooks: {}, label: `Toggle ${id}`, onToggle: () => {} },
    submenu: { domId: `nav-${id}-submenu`, hooks: {}, label: `${id} pages` },
    children: [row(`${id}-child`, active)],
    callout: null,
  });

  const entries = $derived(
    Array.from({ length: rows }, (_, index) =>
      grouped && index === activeIndex
        ? group(`row-${index}`, true)
        : row(`row-${index}`, !grouped && index === activeIndex)
    )
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
