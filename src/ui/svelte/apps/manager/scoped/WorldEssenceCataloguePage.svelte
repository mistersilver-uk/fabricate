<!-- Svelte 5 runes mode -->
<!--
  The world Essence Catalogue (issue 1362). PR 6b replaces this body.

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
  pageId="world-essences"
  icon="fas fa-flask-vial"
  title={text('FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle', 'Essence Catalogue')}
  subtitle={text(
    'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueSubtitle',
    'One Essence per world, shared by every system. The world sets the effect source and the property macro; each system inherits them or overrides its own.'
  )}
/>
