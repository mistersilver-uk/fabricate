<!-- Svelte 5 runes mode -->
<!--
  The world Tools Catalogue (issue 1362). PR 6c replaces this body.

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
  pageId="world-tools"
  icon="fas fa-screwdriver-wrench"
  title={text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle', 'Tools Catalogue')}
  subtitle={text(
    'FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle',
    'One Tool per game-world Item, shared by every system. The world sets the defaults; each system inherits them or overrides its own.'
  )}
/>
