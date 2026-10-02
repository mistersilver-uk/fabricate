<!-- Svelte 5 runes mode -->
<!--
  RecipeDetailHeader is the shared header for every recipe-detail mode: the identity row with the
  pane's one Craft primary, the flavor text, and the blocking-reasons callout (when the recipe is
  not craftable). For a redaction teaser it shows only the generic identity + a discovery hint —
  never any ingredient/result detail.

  Props: `recipe`, `authorityRefusal` (the localized refusal, or `''`), `canCraft` (the live
  craftability: `true`, `false`, or `null` when nothing evaluated it), `craftLabel` (the commit
  verb, or `''` when it is unavailable, which renders no primary), `busy`, `onCraft`.
-->
<script>
  import PlayerDetailHeader from '../PlayerDetailHeader.svelte';
  import { resolveCraftingArt } from '../../util/craftingArtResolution.js';
  import { localize } from '../../util/foundryBridge.js';
  import { withRollPromptOrigin } from '../../util/rollPromptOrigin.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import Chip from '../../components/Chip.svelte';
  import Notice from '../../components/Notice.svelte';
  import { craftingRecipeStatus } from '../../util/craftingRecipeStatus.js';
  import {
    BROWSE_BLOCKING_REASON_KEYS,
    CRAFTING_BROWSE_STATUS,
  } from '../../../presenters/craftingBrowseStatus.js';
  import { TIME_UNITS, formatTimeRequirementCompact } from '../../util/recipeDuration.js';

  let {
    recipe = null,
    authorityRefusal = '',
    canCraft = null,
    craftLabel = '',
    busy = false,
    onCraft = null,
  } = $props();

  const name = $derived(String(recipe?.name ?? ''));
  const modeLabel = $derived(String(recipe?.modeLabel ?? ''));
  const flavor = $derived(String(recipe?.flavor ?? ''));
  const redacted = $derived(recipe?.redaction?.redacted === true);
  // The listing bakes its status once, while the player's own choices re-evaluate craftability, so
  // a baked "available" yields to the live reading: `false` reads as missing materials, and
  // `null` claims nothing, neither readiness nor a shortfall.
  const listedStatus = $derived(String(recipe?.browseStatus ?? ''));
  const unconfirmed = $derived(
    listedStatus === CRAFTING_BROWSE_STATUS.AVAILABLE && !redacted && !busy && canCraft !== true
  );
  const status = $derived(
    unconfirmed && canCraft === false ? CRAFTING_BROWSE_STATUS.MISSING_MATERIALS : listedStatus
  );
  // Pre-craft duration: the recipe's authored time requirement, surfaced read-only so a
  // player can see how long a timed recipe takes BEFORE starting the craft (issue 846).
  // Reuse the manager's compact formatter so both surfaces render durations identically.
  // A zero/absent duration is an instant craft — the chip is omitted entirely rather than
  // labelled, so an instant recipe shows no misleading time.
  const durationTime = $derived(recipe?.duration ?? null);
  const hasDuration = $derived(
    !!durationTime &&
      typeof durationTime === 'object' &&
      TIME_UNITS.some((unit) => Number(durationTime[unit] || 0) > 0)
  );
  const durationLabel = $derived(hasDuration ? formatTimeRequirementCompact(durationTime) : '');
  const isMultiStep = $derived(
    recipe?.modeToken === 'simple' && Array.isArray(recipe?.steps) && recipe.steps.length > 1
  );
  const durationTitle = $derived(
    localize(
      isMultiStep
        ? 'FABRICATE.App.Crafting.Detail.TotalDuration'
        : 'FABRICATE.App.Crafting.Detail.Duration'
    )
  );
  const descriptor = $derived(craftingRecipeStatus(status));
  // Danger tone === the player cannot craft this (missing materials, or a check that refuses
  // this character). Gate on the tone so the presentation map stays the single source of
  // truth, mirroring the RecipeListRow treatment.
  const uncraftable = $derived(descriptor.tone === 'danger');
  const statusLabel = $derived(localize(descriptor.labelKey));
  const blockingReasons = $derived.by(() => {
    if (status !== listedStatus) return [localize(BROWSE_BLOCKING_REASON_KEYS[status])];
    return Array.isArray(recipe?.blockingReasons) ? recipe.blockingReasons : [];
  });
  // An authority refusal blocks the craft whatever the recipe's own browse status says, so it
  // drops the status chip. The recipe's own blocker leads the callout, because it is the one the
  // player can act on, and the refusal states its consequence because the primary stays enabled:
  // availability is a cache, and a stale `false` must not disable the pane's only way forward.
  const refusal = $derived(String(authorityRefusal ?? '').trim());
  const refusalLine = $derived(
    refusal ? `${refusal} ${localize('FABRICATE.App.Crafting.Blocking.AuthorityRefused')}` : ''
  );
  const calloutReasons = $derived(
    refusalLine ? [...blockingReasons, refusalLine] : blockingReasons
  );
  const primaryLabel = $derived(
    busy && craftLabel ? localize('FABRICATE.App.Crafting.Button.Crafting') : craftLabel
  );
</script>

<header class="crafting-detail-header" data-recipe-header>
  <PlayerDetailHeader
    {name}
    {...resolveCraftingArt(recipe?.img)}
    artDimmed={uncraftable}
    {primaryLabel}
    primaryIcon={busy ? 'fas fa-spinner fa-spin' : 'fas fa-hammer'}
    primaryDisabled={busy}
    primaryProps={{ 'data-crafting-craft': '', 'data-crafting-craft-disabled': String(busy) }}
    onclick={(event) => withRollPromptOrigin(event, () => onCraft?.())}
  >
    {#snippet tileOverlay()}
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
    {/snippet}
    {#snippet chips()}
      <!-- The mode and duration chips reveal the crafting mechanism and its timing, so a
           redacted teaser shows neither; an instant recipe shows no duration at all. -->
      {#if !redacted && modeLabel}
        <span class="crafting-detail-mode-chip">{modeLabel}</span>
      {/if}
      {#if !redacted && hasDuration}
        <span
          class="crafting-detail-duration-chip"
          data-recipe-duration
          data-recipe-duration-kind={isMultiStep ? 'total' : 'recipe'}
          title={durationTitle}
          aria-label={`${durationTitle}: ${durationLabel}`}
        >
          <i class="fas fa-clock" aria-hidden="true"></i>
          <span>{durationTitle}: {durationLabel}</span>
        </span>
      {/if}
      <!-- Uncraftable moves the status onto the tile's pip, so the labelled chip is dropped. -->
      {#if !uncraftable && !refusal && !unconfirmed}
        <Chip
          density="list"
          tone={statusChipTone(descriptor.tone)}
          icon={descriptor.icon}
          data-crafting-status={status}
          title={statusLabel}>{statusLabel}</Chip
        >
      {/if}
    {/snippet}
  </PlayerDetailHeader>

  {#if redacted}
    <p class="crafting-detail-teaser" data-recipe-teaser>
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      {localize('FABRICATE.App.Crafting.Blocking.Discovery')}
    </p>
  {:else}
    {#if flavor}
      <p class="crafting-detail-flavor">{flavor}</p>
    {/if}

    {#if calloutReasons.length > 0}
      <!-- THE SHARED `Notice`, NON-BLOCKING (issue 1514). This well already carried
           `role="status"`, and `Notice` is the only primitive that can keep it: `Callout` emits
           `role="note"` or nothing (`Callout.svelte:131`) and cannot express a live status
           region. Non-blocking is what KEEPS the role — and with it the polite live region the
           role already implied, since `role="status"` carries an implicit `aria-live="polite"`
           and `aria-atomic="true"`. The explicit attribute the primitive writes changes nothing
           here; it is the role, present before and after, that announces. The tone is the one
           this well already painted — the same
           `--fab-warning-*` and `--fab-danger-*` triples, switched on the same `uncraftable`
           reading — so the conversion moves the frame, not the meaning.

           THE `<ul>` GOES, AND THE PRODUCER IS WHY. `Notice` takes `title` and `detail` as
           STRINGS and has no children slot, so a bulleted list of N reasons has nowhere to go.
           `CraftingListingBuilder._blockingReasons` returns `key ? [this.localize(key)] : []` —
           AT MOST ONE reason, for every browse status there is — so the list this markup drew
           has always been a one-item list wearing a `list-style: disc`. The first reason is the
           title and any further one lands in `detail` rather than being dropped, which keeps a
           future second reason visible instead of silent. -->
      <Notice
        tone={uncraftable ? 'danger' : 'warning'}
        icon="fas fa-triangle-exclamation"
        title={calloutReasons[0]}
        detail={calloutReasons.slice(1).join(' ')}
        data-recipe-blocking=""
        data-recipe-authority-blocked={refusal ? 'true' : undefined}
      />
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

  /* Flat error wash over the dimmed tile, at the tile's own radius. */
  .crafting-detail-thumb-scrim {
    position: absolute;
    inset: 0;
    border-radius: 9px;
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
    font-family: var(--fab-font-mono);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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
</style>
