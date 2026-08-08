<!-- Svelte 5 runes mode -->
<!--
  The banner that heads a recipe editor tab: a medallion, a "<kicker>: <label>" title
  with an optional scope clause, one explanatory sentence, and an optional action chip
  that routes somewhere else in the manager.

  It exists because a recipe editor keeps being shaped from OUTSIDE the recipe — the
  system's resolution mode dictates the editor's shape (one set vs. many, tier routing,
  alchemy slots), and the system's check-modifier AUTHORITY dictates whether the Overview
  tab offers a per-recipe modifier control at all (issue 1055). A GM staring at a tab
  needs to know why, and both answers read the same way: a fact set elsewhere, with a
  deep link to where it is set.

  FULLY PROP-DRIVEN (issue 1055). It used to own the resolution-mode lookup and its own
  copy; that made a second instance impossible without forking the component. The caller
  now supplies the copy — including the resolution-mode call site, which reads the
  canonical `resolutionModeOptions.js` table itself so there is still exactly one such
  table in the tree.

  Props:
   - icon: Font Awesome classes for the medallion glyph.
   - kicker / label: the title reads "<kicker>: <label>"; with no kicker it is just the
     label. Both arrive ALREADY LOCALIZED — this component authors no copy.
   - value: the state this banner is reporting, stamped as the `dataAttr` value so a
     capture case or a smoke step can assert WHICH state is on screen.
   - scope: the muted "· set for this crafting system" clause. Omitted when empty.
   - description: the one sentence the banner exists to deliver (clamped to two lines).
   - tone: `info` (default), `neutral` or `warning`. Colour only — the geometry is
     identical, which is the point: two banners stacked on one tab must be
     distinguishable without either of them changing size or position. `info` is the
     PRIMARY reading ("this is why the editor looks like this"), `neutral` a secondary
     fact that recedes behind it, and `warning` a state in which the surface below
     cannot do anything.
   - actionLabel / actionHint / onAction: the deep-link chip. Rendered only when
     `onAction` is a function; `actionHint` is its `title`, which must be authored per
     call site — a hardcoded one describes the wrong destination on the second instance.
   - dataAttr / actionDataAttr: the capture hooks. `dataAttr` carries `value`, so two
     banners on one tab MUST NOT share it: their value spaces are disjoint and a shared
     hook would resolve to whichever rendered first. The defaults are the shipped
     resolution-mode hooks, so that call site keeps them without restating them.
-->
<script>
  import Chip from '../Chip.svelte';

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

  // Colour families this banner paints, mirroring `Chip`'s tone vocabulary so the two
  // agree on what `info` / `neutral` / `warning` mean. Anything else falls back to the
  // default info treatment rather than emitting an unstyled class.
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
  /* The banner is INFO-toned by default, not a plain card: it explains why the editor
     below it has the shape it has, and a `--fab-surface-soft` panel reads as just another
     card in a page made of cards. */
  .manager-recipe-mode-banner {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-info-border);
    border-radius: 10px;
    background: var(--fab-info-soft);
  }

  /* Tone is COLOUR ONLY — edge, medallion and fill. Nothing here moves the geometry,
     so two stacked banners stay the same shape and differ only in weight. `neutral`
     recedes (it reports a fact rather than shaping the editor) and `warning` marks a
     state in which the control the banner replaced could do nothing anyway. */
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
    /* 0.75rem (~12px) matches the prototype banner title (issue 643 font-size audit). */
    font-size: 0.75rem;
  }

  .manager-recipe-mode-banner-title strong {
    color: var(--fab-text);
    font-weight: 600;
  }

  .manager-recipe-mode-banner-scope {
    /* 0.64rem (~10px) matches the prototype's banner secondary text (issue 643 audit). */
    font-size: 0.64rem;
    font-weight: 400;
  }

  /* The description is the ONE sentence this banner exists to deliver. It used to be
     `white-space: nowrap` + ellipsis, so at 900px — and for any longer localized
     string — it was truncated to a few words. It wraps, clamped to two lines. */
  .manager-recipe-mode-banner-desc {
    display: -webkit-box;
    margin: 2px 0 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    /* 0.64rem (~10px) matches the prototype banner description (issue 643 audit). */
    font-size: 0.64rem;
    line-height: 1.45;
    white-space: normal;
  }

  /* The action is a `Chip` (issue 883), so this component's scoping hash is not on it.
     Reach it through `:global`, nested under a selector that DOES carry the hash. */
  .manager-recipe-mode-banner :global(.manager-recipe-mode-banner-action) {
    flex: 0 0 auto;
  }
</style>
