<!-- Svelte 5 runes mode -->
<!--
  The World Vocabulary route (issue 1362). PR 7 replaces this body, and the merged system vocabulary view with it. It is NOT a scoped-entity layer: the World Vocabulary is its own thing, which is why it has its own spec requirement rather than sharing the scoped-entity one.

  A THIN CALL to the shared `ScopedPlaceholderPage`: the title, the hook and the sentence are
  everything this file owns while the screen is a placeholder.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ScopedPlaceholderPage from './ScopedPlaceholderPage.svelte';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<ScopedPlaceholderPage
  pageId="world-vocabulary"
  icon="fas fa-tags"
  title={text('FABRICATE.Admin.Manager.Scoped.VocabularyTitle', 'Tags & Categories')}
/>
