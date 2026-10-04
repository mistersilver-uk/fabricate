<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the Medallion member and two text runs, shared by the crafting detail's three award lists rather than offered as a vocabulary member -->
<!--
  AwardPill is one awarded output in the crafting detail (issue 1773): its art, or a currency or
  knowledge reward's glyph, its name, and its amount, which a reward states itself and an item
  reads as `×qty`. The detail's output list, its outcome tiers and the roll result each render it,
  as `variant` `output`, `tier` or `roll`, which sets the pill's size and keeps each host's classes.
-->
<script>
  import Medallion from '../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';

  // Each class is spelled whole, so a selector naming one finds it in the source.
  const VARIANTS = Object.freeze({
    output: {
      base: 'crafting-io-output',
      name: 'crafting-io-output-name',
      qty: 'crafting-io-output-qty',
      size: 32,
    },
    tier: {
      base: 'crafting-tier-award',
      name: 'crafting-tier-award-name',
      qty: 'crafting-tier-award-qty',
      size: 26,
    },
    roll: {
      base: 'crafting-roll-award',
      name: 'crafting-roll-award-name',
      qty: 'crafting-roll-award-qty',
      size: 24,
    },
  });

  let { item, variant = 'output' } = $props();

  const shape = $derived(VARIANTS[variant] ?? VARIANTS.output);
  const kind = $derived(item?.kind ?? 'component');
  const artwork = $derived(resolveCraftingArt(item?.img, item?.glyph));
</script>

<li
  class={shape.base}
  data-award-kind={kind}
  data-io-output={variant === 'output' ? kind : undefined}
>
  <!-- ratchet-exempt(design-system): the three hosts' sizes moved here unchanged (32, 26, 24); the geometry sweep owns their rungs -->
  <Medallion art={artwork.art} icon={artwork.icon} alt="" size={shape.size} />
  <span class={shape.name}>{item?.name}</span>
  <span class={shape.qty}>{item?.amountText ?? `×${item?.qty ?? 1}`}</span>
</li>

<style>
  /* Each variant keeps the geometry its host drew before the pill was shared: a rounded rectangle
     matching the rounded-square art it wraps, and the roll result's single-line capsule. */
  .crafting-io-output {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
    /* ratchet-exempt(design-system): the 10px trailing inset moved unchanged from IoTable */
    padding: var(--fab-space-1) 10px var(--fab-space-1) var(--fab-space-1);
    border: 1px solid var(--fab-border);
    /* ratchet-exempt(design-system): moved unchanged from IoTable, which carried it at base */
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-io-output-name {
    font-size: 13px;
  }

  .crafting-tier-award {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    padding: var(--fab-space-2xs) var(--fab-space-2) var(--fab-space-2xs) var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    /* ratchet-exempt(design-system): moved unchanged from OutcomeTierTable, which carried it at base */
    border-radius: 8px;
    background: var(--fab-surface);
    font-size: 12px;
  }

  /* Capped to the column so a long name ellipsizes instead of widening or wrapping the pill, so
     every roll pill is the thumb's height (issue 687). */
  .crafting-roll-award {
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    /* ratchet-exempt(design-system): the 5px gap moved unchanged from RollResultBox */
    gap: 5px;
    padding: var(--fab-space-2xs) var(--fab-space-2) var(--fab-space-2xs) var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface);
    font-size: 12px;
  }

  .crafting-roll-award-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crafting-io-output-qty,
  .crafting-tier-award-qty,
  .crafting-roll-award-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }
</style>
