<!-- Svelte 5 runes mode -->
<!--
  The world Essence entry editor (issue 1362). PR 6b replaces this body.

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
  pageId="world-essence-entry"
  icon="fas fa-vial"
  title={text('FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle', 'Essence entry')}
  subtitle={text(
    'FABRICATE.Admin.Manager.Scoped.EssenceEntrySubtitle',
    'Identity and the two world defaults, each stating how many systems inherit it before the change lands.'
  )}
/>
