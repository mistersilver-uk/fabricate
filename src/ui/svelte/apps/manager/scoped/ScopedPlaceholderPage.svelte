<!-- Svelte 5 runes mode -->
<!--
  The shared body of the seven world scoped-entity routes, while they are placeholders
  (issue 1362, epic 1357).

  ONE COMPONENT, SEVEN THIN CALLERS. Each route's page file is a call to this one rather than
  a repeated block, because the seven differ only in a title, a hook and a sentence — and
  because those seven files are exactly what PRs 6a, 6b, 6c and 7 replace. A repeated block
  would mean four later lanes each deleting their own copy of the same markup.

  IT RENDERS ITS OWN `<main class="manager-main">`, as every world route in this Manager does,
  carrying a per-page `data-scoped-page` hook. That hook is what the View Lab cases assert
  their route by, and what a later lane replaces rather than renames.

  THE COPY IS HONEST ABOUT WHAT IS NOT BUILT. It names the screen and says the authoring
  surface is not here yet; it does not draw a disabled facsimile of the editor, because a
  disabled control is a promise about a shape that has not been designed.

  Props:
   - pageId: the `data-scoped-page` value.
   - title / subtitle: already localized by the caller.
   - icon: the empty state's glyph.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../EmptyState.svelte';

  let { pageId = '', title = '', subtitle = '', icon = 'fas fa-cubes-stacked' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<main class="manager-main manager-scoped-main" data-scoped-page={pageId} aria-label={title}>
  <section class="manager-scoped-placeholder">
    <EmptyState
      {icon}
      {title}
      hint={subtitle}
      dataAttr="data-scoped-placeholder"
      dataValue={pageId}
    >
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Scoped.Placeholder.Body',
          'The authoring surface for this screen is not built yet. The route, its rail entry and its shared patterns are in place; the catalogue and its editors arrive next.'
        )}
      </p>
    </EmptyState>
  </section>
</main>
