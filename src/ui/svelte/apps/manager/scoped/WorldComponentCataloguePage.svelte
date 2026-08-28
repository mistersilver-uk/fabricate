<!-- Svelte 5 runes mode -->
<!--
  The world Component catalogue (issue 1362). PR 6a replaces this body with the catalogue list, its inspector and its bulk selection; the route, the rail entry and the full-width treatment are already here.

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
  pageId="world-components"
  icon="fas fa-cubes-stacked"
  title={text('FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle', 'Component catalogue')}
  subtitle={text(
    'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueSubtitle',
    'One Component per game-world Item, shared by every system. The world sets the defaults; each system inherits them or overrides its own.'
  )}
/>
