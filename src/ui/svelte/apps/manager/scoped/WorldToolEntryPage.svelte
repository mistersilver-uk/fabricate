<!-- Svelte 5 runes mode -->
<!--
  The world Tool entry editor (issue 1362). PR 6c replaces this body.

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
  pageId="world-tool-entry"
  icon="fas fa-hammer"
  title={text('FABRICATE.Admin.Manager.Scoped.ToolEntryTitle', 'Tool entry')}
/>
