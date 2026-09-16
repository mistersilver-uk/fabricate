<!-- Svelte 5 runes mode -->
<!--
  The shared body of the seven world scoped-entity routes, while they are placeholders
  (issue 1362, epic 1357).

  ONE COMPONENT, SEVEN THIN CALLERS. Each route's page file is a call to this one rather than
  a repeated block, because the seven differ only in a title, a hook and a glyph — and because
  those seven files are exactly what PRs 6a, 6b, 6c and 7 replace. A repeated block would mean
  four later lanes each deleting their own copy of the same markup.

  IT TAKES THE LANG KEY, NOT THE RESOLVED STRING. Each caller passed `title={text(KEY, FALL)}`,
  which obliged all seven to declare the same `localize` import and the same four-line `text()`
  helper — a fifteen-line IDENTICAL block, over SonarCloud's ten-line duplication floor, in
  files whose whole point is to be thin. `.svelte` IS duplication-analysed. Taking `titleKey`
  and `titleFallback` leaves each caller with an import and a call.

  IT RENDERS ITS OWN `<main class="manager-main">`, as every world route in this Manager does,
  carrying a per-page `data-scoped-page` hook. That hook is what the View Lab cases assert
  their route by, and what a later lane replaces rather than renames.

  THE COPY IS HONEST ABOUT WHAT IS NOT BUILT, and it does not repeat the page header. The
  header above already carries the screen's title and its subtitle, so the empty state carries
  a STATUS PHRASE — the prototype's own treatment for its `stub` screen, which puts "Already
  world-scoped" or "Premium · world-scoped" in that slot and never the screen's name. The
  first frame of this page showed the screen title twice and the subtitle three times.

  It draws no disabled facsimile of the editor to come, because a disabled control is a promise
  about a shape nobody has designed.

  Props:
   - pageId: the `data-scoped-page` value.
   - titleKey / titleFallback: the screen's name, resolved here for the `<main>` accessible
     name. NOT rendered inside the empty state — the `<h1>` above already shows it.
   - icon: the empty state's glyph.

  ITS ONE RULE IS SCOPED HERE, not in `styles/fabricate.css`. The class is STATIC, so Svelte can
  prove the selector is used and `lint:svelte:warnings` stays at zero — the dynamic-class reason
  that keeps `ScopedEntityPreview`'s stem in the global sheet does not apply to it. It matters
  because `### GM World Scoped Entity Routes` requirement 7 closes that stylesheet to PRs 6a, 6b,
  6c and 7 — the four lanes that DELETE these pages — so a rule left there would outlive its only
  subject as an orphan no epic PR is permitted to remove.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../EmptyState.svelte';

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
  /* The placeholder body. It states what is not built yet and draws no facsimile of the editor
     that is coming: a disabled control is a promise about a shape nobody has designed. */
  .manager-scoped-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
  }
</style>
