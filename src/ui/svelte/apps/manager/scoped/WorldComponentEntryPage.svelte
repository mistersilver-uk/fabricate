<!-- Svelte 5 runes mode -->
<!--
  The world Component entry editor (issue 1362). PR 6a replaces this body.

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
  pageId="world-component-entry"
  icon="fas fa-cube"
  title={text('FABRICATE.Admin.Manager.Scoped.ComponentEntryTitle', 'Component entry')}
  subtitle={text(
    'FABRICATE.Admin.Manager.Scoped.ComponentEntrySubtitle',
    'Identity, the world category and tags, and a row per crafting system that has this Component.'
  )}
/>
