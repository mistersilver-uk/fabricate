<!-- Svelte 5 runes mode -->
<!--
  The World Vocabulary route (issue 1362). PR 7 replaces this body, and the merged system vocabulary view with it. It is NOT a scoped-entity layer: the World Vocabulary is its own thing, which is why it has its own spec requirement rather than sharing the scoped-entity one.

  A THIN CALL to the shared `ScopedPlaceholderPage`: the route hook, the glyph and the
  screen name are everything this file owns while the screen is a placeholder. The shell
  resolves the lang key, so no page repeats a `localize` import or a `text()` helper.
-->
<script>
  import ScopedPlaceholderPage from './ScopedPlaceholderPage.svelte';
</script>

<ScopedPlaceholderPage
  pageId="world-vocabulary"
  icon="fas fa-tags"
  titleKey="FABRICATE.Admin.Manager.Scoped.VocabularyTitle"
  titleFallback="Tags & Categories"
/>
