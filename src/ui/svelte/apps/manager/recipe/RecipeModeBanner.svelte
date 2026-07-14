<!-- Svelte 5 runes mode -->
<!--
  The resolution-mode banner that heads EVERY recipe editor tab.

  Resolution mode is a property of the crafting SYSTEM (`system.resolutionMode`),
  never of a recipe — the banner reports it and routes to Crafting Settings to
  change it, and offers no per-recipe control. That distinction is the whole point
  of the banner: the editor's shape (one set vs. many, tier routing, alchemy slots)
  is dictated from outside the recipe, and a GM staring at a tab needs to know why.

  The copy and icons are NOT re-authored here: `resolutionModeOptions.js` already
  owns the canonical { value, icon, labelKey, descKey } list that System Settings
  and Crafting Settings render, so a second table would drift.

  Props:
   - resolutionMode: the system's mode (one of resolutionModeOptions' values).
   - onOpenSettings(): routes to the Crafting Settings screen.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolutionModeOptions } from '../resolutionModeOptions.js';

  let { resolutionMode = 'simple', onOpenSettings = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const mode = $derived(
    resolutionModeOptions.find((option) => option.value === resolutionMode) || resolutionModeOptions[0]
  );
</script>

<div class="manager-recipe-mode-banner" data-recipe-mode-banner={mode.value}>
  <span class="manager-recipe-mode-banner-medallion" aria-hidden="true">
    <i class={mode.icon}></i>
  </span>
  <div class="manager-recipe-mode-banner-copy">
    <p class="manager-recipe-mode-banner-title">
      <span class="manager-recipe-mode-banner-kicker">{text('FABRICATE.Admin.Manager.Recipe.ModeBanner.Kicker', 'Resolution mode')}</span>
      <strong>{text(mode.labelKey, mode.fallback)}</strong>
    </p>
    <p class="manager-recipe-mode-banner-desc manager-muted">{text(mode.descKey, mode.descFallback)}</p>
  </div>
  <button
    type="button"
    class="manager-chip is-info manager-recipe-mode-banner-action"
    data-recipe-mode-banner-settings
    title={text('FABRICATE.Admin.Manager.Recipe.ModeBanner.SettingsHint', 'Resolution mode is set for the whole crafting system, not per recipe.')}
    onclick={() => onOpenSettings()}
  >
    <i class="fas fa-sliders" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Recipe.ModeBanner.Settings', 'System settings')}</span>
  </button>
</div>

<style>
  /* The banner is INFO-toned, not a plain card: it explains why the editor below it
     has the shape it has, and a `--fab-surface-soft` panel reads as just another card
     in a page made of cards. */
  .manager-recipe-mode-banner {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-info-border);
    border-radius: 10px;
    background: var(--fab-info-soft);
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
    align-items: baseline;
    gap: var(--fab-space-2);
    margin: 0;
    font-size: 0.82rem;
  }

  .manager-recipe-mode-banner-kicker {
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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
    font-size: 0.72rem;
    line-height: 1.45;
    white-space: normal;
  }

  .manager-recipe-mode-banner-action {
    flex: 0 0 auto;
  }
</style>
