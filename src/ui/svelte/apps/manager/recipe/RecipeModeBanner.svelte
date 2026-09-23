<!-- Svelte 5 runes mode -->
<!--
  The banner that heads a recipe editor tab: a medallion, a "<kicker>: <label>" title with an
  optional scope clause, one explanatory sentence, and an optional action chip routing elsewhere
  in the manager. It exists because a recipe editor keeps being shaped from OUTSIDE the recipe —
  the system's resolution mode dictates the editor's shape, and its check-modifier rule dictates
  whether Overview offers a per-recipe modifier control at all — and both answers read the same
  way: a fact set elsewhere, with a deep link to where it is set.

  FULLY PROP-DRIVEN, so a second instance needs no fork: the caller supplies the copy, including
  the resolution-mode call site, which reads the canonical `resolutionModeOptions.js` table itself
  so there is still exactly one such table in the tree.

  Props:
   - icon: Font Awesome classes for the medallion glyph.
   - kicker / label: the title reads "<kicker>: <label>", or just the label. Both arrive ALREADY
     LOCALIZED — this component authors no copy.
   - value: the state being reported, stamped as the `dataAttr` value so a capture case can
     assert WHICH state is on screen.
   - scope: the muted "· set for this crafting system" clause, omitted when empty.
   - description: the one sentence the banner exists to deliver, clamped to two lines.
   - tone: `info` (default), `neutral` or `warning`. COLOUR ONLY — the geometry is identical, so
     two banners stacked on one tab are distinguishable without either moving. `info` is the
     primary reading, `neutral` a fact that recedes behind it, `warning` a state in which the
     surface below can do nothing.
   - actionLabel / actionHint / onAction: the deep-link chip, rendered only when `onAction` is a
     function. `actionHint` is its `title` and must be authored per call site, because a
     hardcoded one describes the wrong destination on the second instance.
   - dataAttr / actionDataAttr: the capture hooks. `dataAttr` carries `value`, so two banners on
     one tab MUST NOT share it — their value spaces are disjoint and a shared hook would resolve
     to whichever rendered first. The defaults are the shipped resolution-mode hooks.
-->
<script>
  import Chip from '../../../components/Chip.svelte';

  let {
    icon = '',
    kicker = '',
    label = '',
    value = '',
    scope = '',
    description = '',
    tone = 'info',
    actionLabel = '',
    actionHint = '',
    onAction = null,
    dataAttr = 'data-recipe-mode-banner',
    actionDataAttr = 'data-recipe-mode-banner-settings',
  } = $props();

  // Colour families this banner paints, mirroring `Chip`'s tone vocabulary. Anything else falls
  // back to info rather than emitting an unstyled class.
  const TONES = new Set(['info', 'neutral', 'warning']);
  const chipTone = $derived(TONES.has(tone) ? tone : 'info');
  const title = $derived(kicker ? `${kicker}: ${label}` : label);
</script>

<div
  class="manager-recipe-mode-banner"
  class:is-neutral={chipTone === 'neutral'}
  class:is-warning={chipTone === 'warning'}
  {...{ [dataAttr]: value || true }}
>
  <span class="manager-recipe-mode-banner-medallion" aria-hidden="true">
    <i class={icon}></i>
  </span>
  <div class="manager-recipe-mode-banner-copy">
    <p class="manager-recipe-mode-banner-title">
      <strong>{title}</strong>
      {#if scope}
        <span class="manager-recipe-mode-banner-scope manager-muted">· {scope}</span>
      {/if}
    </p>
    <p class="manager-recipe-mode-banner-desc manager-muted">
      {description}
    </p>
  </div>
  {#if typeof onAction === 'function'}
    <Chip
      tag="button"
      tone={chipTone}
      icon="fas fa-arrow-up-right-from-square"
      class="manager-recipe-mode-banner-action"
      type="button"
      {...{ [actionDataAttr]: true }}
      title={actionHint}
      onclick={() => onAction()}
    >
      <span>{actionLabel}</span>
    </Chip>
  {/if}
</div>

<style>
  /* INFO-toned by default rather than a plain card: a `--fab-surface-soft` panel reads as just
     another card in a page made of cards. */
  .manager-recipe-mode-banner {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-info-border);
    border-radius: 10px;
    background: var(--fab-info-soft);
  }

  /* Tone is COLOUR ONLY — edge, medallion and fill — so two stacked banners stay the same shape
     and differ only in weight. */
  .manager-recipe-mode-banner.is-neutral {
    border-color: var(--fab-border);
    background: var(--fab-surface-soft);
  }

  .manager-recipe-mode-banner.is-neutral .manager-recipe-mode-banner-medallion {
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
  }

  .manager-recipe-mode-banner.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .manager-recipe-mode-banner.is-warning .manager-recipe-mode-banner-medallion {
    border-color: var(--fab-warning-border);
    color: var(--fab-warning-text);
  }

  .manager-recipe-mode-banner-medallion {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--fab-info-border);
    border-radius: 8px;
    color: var(--fab-info-text);
    background: var(--fab-bg-3);
    font-size: 0.85rem;
  }

  .manager-recipe-mode-banner-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-recipe-mode-banner-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--fab-space-1);
    margin: 0;
    font-size: 0.75rem;
  }

  .manager-recipe-mode-banner-title strong {
    color: var(--fab-text);
    font-weight: 600;
  }

  .manager-recipe-mode-banner-scope {
    font-size: 0.64rem;
    font-weight: 400;
  }

  /* The description WRAPS, clamped to two lines: `nowrap` plus ellipsis truncated it to a few
     words at 900px and for any longer localized string. */
  .manager-recipe-mode-banner-desc {
    display: -webkit-box;
    margin: 2px 0 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 0.64rem;
    line-height: 1.45;
    white-space: normal;
  }

  /* The action is a `Chip`, so this component's scoping hash is not on it: reach it through
     `:global`, nested under a selector that DOES carry the hash. */
  .manager-recipe-mode-banner :global(.manager-recipe-mode-banner-action) {
    flex: 0 0 auto;
  }
</style>
