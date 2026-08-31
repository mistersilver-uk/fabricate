<!-- Svelte 5 runes mode -->
<!--
  The world Component catalogue (issue 1362). PR 6a replaces this body with the catalogue list, its inspector and its bulk selection; the route, the rail entry and the full-width treatment are already here.

  A THIN CALL to the shared `ScopedPlaceholderPage`: the route hook, the glyph and the
  screen name are everything this file owns while the screen is a placeholder. The shell
  resolves the lang key, so no page repeats a `localize` import or a `text()` helper.
-->
<script>
  import ScopedPlaceholderPage from './ScopedPlaceholderPage.svelte';
</script>

<ScopedPlaceholderPage
  pageId="world-components"
  icon="fas fa-cubes-stacked"
  titleKey="FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle"
  titleFallback="Component catalogue"
/>
