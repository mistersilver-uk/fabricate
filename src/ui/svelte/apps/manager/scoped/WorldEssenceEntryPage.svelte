<!-- Svelte 5 runes mode -->
<!--
  The world Essence entry editor (issue 1362). PR 6b replaces this body.

  A THIN CALL to the shared `ScopedPlaceholderPage`: the route hook, the glyph and the
  screen name are everything this file owns while the screen is a placeholder. The shell
  resolves the lang key, so no page repeats a `localize` import or a `text()` helper.
-->
<script>
  import ScopedPlaceholderPage from './ScopedPlaceholderPage.svelte';
</script>

<ScopedPlaceholderPage
  pageId="world-essence-entry"
  icon="fas fa-vial"
  titleKey="FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle"
  titleFallback="Essence entry"
/>
