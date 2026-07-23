<!-- Svelte 5 runes mode -->
<!--
  RecipeDetailHeader is the shared header for every recipe-detail mode: the
  thumbnail, name, mode chip, flavor text, and the blocking-reasons callout (when
  the recipe is not craftable). For a redaction teaser it shows only the generic
  identity + a discovery hint — never any ingredient/result detail.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';
  import CraftingStatusBadge from './CraftingStatusBadge.svelte';
  import { craftingRecipeStatus } from '../../util/craftingRecipeStatus.js';
  import { TIME_UNITS, formatTimeRequirementCompact } from '../../util/recipeDuration.js';

  let { recipe = null } = $props();

  const name = $derived(String(recipe?.name ?? ''));
  const modeLabel = $derived(String(recipe?.modeLabel ?? ''));
  const flavor = $derived(String(recipe?.flavor ?? ''));
  const status = $derived(String(recipe?.browseStatus ?? ''));
  const redacted = $derived(recipe?.redaction?.redacted === true);
  // Pre-craft duration: the recipe's authored time requirement, surfaced read-only so a
  // player can see how long a timed recipe takes BEFORE starting the craft (issue 846).
  // Reuse the manager's compact formatter so both surfaces render durations identically.
  // A zero/absent duration is an instant craft — the chip is omitted entirely rather than
  // labelled, so an instant recipe shows no misleading time.
  const durationTime = $derived(recipe?.result?.time ?? null);
  const hasDuration = $derived(
    !!durationTime &&
      typeof durationTime === 'object' &&
      TIME_UNITS.some((unit) => Number(durationTime[unit] || 0) > 0)
  );
  const durationLabel = $derived(hasDuration ? formatTimeRequirementCompact(durationTime) : '');
  const durationTitle = $derived(localize('FABRICATE.App.Crafting.Detail.Duration'));
  const descriptor = $derived(craftingRecipeStatus(status));
  // Danger tone === the player cannot craft this (missing materials). Gate on the
  // tone so the presentation map stays the single source of truth, mirroring the
  // RecipeListRow treatment.
  const uncraftable = $derived(descriptor.tone === 'danger');
  const statusLabel = $derived(localize(descriptor.labelKey));
  const blockingReasons = $derived(
    Array.isArray(recipe?.blockingReasons) ? recipe.blockingReasons : []
  );
</script>

<header class="crafting-detail-header" data-recipe-header>
  <div class="crafting-detail-header-top">
    <span class="crafting-detail-thumb" class:is-uncraftable={uncraftable}>
      <span class="crafting-detail-thumb-media">
        <CraftingThumb src={recipe?.img} alt="" size={56} />
      </span>
      {#if uncraftable}
        <span class="crafting-detail-thumb-scrim" aria-hidden="true"></span>
        <span
          class="crafting-detail-pip"
          data-crafting-status={status}
          role="img"
          aria-label={statusLabel}
          title={statusLabel}
        >
          <i class={descriptor.icon} aria-hidden="true"></i>
        </span>
      {/if}
    </span>
    <div class="crafting-detail-header-copy">
      <h2 class="crafting-detail-name" title={name}>{name}</h2>
      <div class="crafting-detail-header-meta">
        <!-- The mode chip reveals the crafting mechanism, so it is suppressed for a
             redacted (discovery) teaser — only the generic identity + status show.
             The {#if modeLabel} guard also avoids painting an empty bordered pill
             when no label resolved. -->
        {#if !redacted && modeLabel}
          <span class="crafting-detail-mode-chip">{modeLabel}</span>
        {/if}
        <!-- Authored craft duration (timed recipes only). Suppressed for a redacted
             teaser (a hidden recipe's timing is a spoiler) and omitted for instant
             recipes so no misleading "0 min" is shown. -->
        {#if !redacted && hasDuration}
          <span
            class="crafting-detail-duration-chip"
            data-recipe-duration
            title={durationTitle}
            aria-label={`${durationTitle}: ${durationLabel}`}
          >
            <i class="fas fa-clock" aria-hidden="true"></i>
            <span>{durationLabel}</span>
          </span>
        {/if}
        <!-- Uncraftable moves the status onto the thumbnail pip, so the labelled
             badge is dropped here to avoid a duplicate icon; the blocking-reasons
             callout below still spells out the reason. -->
        {#if !uncraftable}
          <CraftingStatusBadge {status} />
        {/if}
      </div>
    </div>
  </div>

  {#if redacted}
    <p class="crafting-detail-teaser" data-recipe-teaser>
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      {localize('FABRICATE.App.Crafting.Blocking.Discovery')}
    </p>
  {:else}
    {#if flavor}
      <p class="crafting-detail-flavor">{flavor}</p>
    {/if}

    {#if blockingReasons.length > 0}
      <div
        class="crafting-detail-blocking"
        class:is-uncraftable={uncraftable}
        data-recipe-blocking
        role="status"
      >
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <ul class="crafting-detail-blocking-list">
          {#each blockingReasons as reason, index (index)}
            <li>{reason}</li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</header>

<style>
  .crafting-detail-header {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding-bottom: var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
  }

  .crafting-detail-header-top {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  /* Thumbnail wrapper: a positioning context for the uncraftable scrim + pip,
     mirroring RecipeListRow. */
  .crafting-detail-thumb {
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
  }

  .crafting-detail-thumb-media {
    display: inline-flex;
  }

  /* Fade the artwork so the error pip reads as the focal point. */
  .crafting-detail-thumb.is-uncraftable .crafting-detail-thumb-media {
    opacity: 0.4;
  }

  /* Flat error wash over the dimmed thumbnail (matches CraftingThumb's radius). */
  .crafting-detail-thumb-scrim {
    position: absolute;
    inset: 0;
    border-radius: 6px;
    background: var(--fab-danger-soft);
    pointer-events: none;
  }

  /* The status icon, moved onto the thumbnail as a solid error pip. on-accent is a
     near-black foreground in every theme, legible over the mid-tone danger fill. */
  .crafting-detail-pip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid var(--fab-danger-border);
    background: var(--fab-danger);
    color: var(--fab-on-accent);
    box-shadow: var(--fab-shadow-sm);
    pointer-events: none;
  }

  .crafting-detail-pip i {
    font-size: 13px;
    line-height: 1;
  }

  .crafting-detail-header-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-detail-name {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crafting-detail-header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .crafting-detail-mode-chip {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  /* Duration chip: a sibling of the mode chip in the meta row, distinguished by a
     leading clock icon. Shares the pill shape/border so the metadata reads as one row. */
  .crafting-detail-duration-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .crafting-detail-duration-chip i {
    font-size: 10px;
    line-height: 1;
  }

  .crafting-detail-flavor {
    margin: 0;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .crafting-detail-teaser {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px dashed var(--fab-border);
    border-radius: 8px;
    font-size: 13px;
    font-style: italic;
    color: var(--fab-text-muted);
  }

  .crafting-detail-blocking {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-warning-border);
    border-radius: 8px;
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  /* Missing materials is an error, not a warning: align the callout with the row
     tint + thumbnail pip. Other blockers (locked/unknown/exhausted) keep the amber
     warning treatment. */
  .crafting-detail-blocking.is-uncraftable {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  .crafting-detail-blocking-list {
    margin: 0;
    padding-left: 16px;
    font-size: 13px;
  }
</style>
