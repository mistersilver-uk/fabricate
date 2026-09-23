<!-- Svelte 5 runes mode -->
<!--
  The shared body of the seven world scoped-entity routes while they are placeholders (issue 1362).
  ONE COMPONENT, SEVEN THIN CALLERS: it takes `titleKey`/`titleFallback`, not a resolved string, so
  no caller repeats the `localize` helper. `pageId` is the `data-scoped-page` hook View Lab asserts.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../../../components/EmptyState.svelte';

  let { pageId = '', titleKey = '', titleFallback = '', icon = 'fas fa-cubes-stacked' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const title = $derived(text(titleKey, titleFallback));
</script>

<main class="manager-main" data-scoped-page={pageId} aria-label={title}>
  <section class="manager-scoped-placeholder">
    <EmptyState
      {icon}
      title={text('FABRICATE.Admin.Manager.Scoped.Placeholder.Title', 'Not built yet')}
      hint={text(
        'FABRICATE.Admin.Manager.Scoped.Placeholder.Body',
        'The authoring surface for this screen is not built yet. The route, its rail entry and its shared patterns are in place; the catalogue and its editors arrive next.'
      )}
      dataAttr="data-scoped-placeholder"
      dataValue={pageId}
    />
  </section>
</main>

<style>
  /* Scoped here, not in `styles/fabricate.css`, which requirement 7 closes to the deleting lanes. */
  .manager-scoped-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
  }
</style>
