<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the Medallion member and two text runs, shared by the crafting detail's two award lists rather than offered as a vocabulary member -->
<!--
  AwardPill is one awarded output in the crafting detail (issue 1773): its art, or a currency or
  knowledge reward's glyph, its name, and its amount, which a reward states itself and an item
  reads as `×qty`. The detail's output list and the roll result render it, as `variant` `output`
  or `roll`, which sets the pill's size and keeps each host's classes; the outcome tiers draw the
  shared ladder's rows (issue 1644).
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
    },
    roll: {
      base: 'crafting-roll-award',
      name: 'crafting-roll-award-name',
      qty: 'crafting-roll-award-qty',
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
  {#if variant === 'roll'}<Medallion art={artwork.art} icon={artwork.icon} alt="" size={22} />
  {:else}<Medallion art={artwork.art} icon={artwork.icon} alt="" size={30} />{/if}
  <span class={shape.name}>{item?.name}</span>
  <span class={shape.qty}>{item?.amountText ?? `×${item?.qty ?? 1}`}</span>
</li>

<style>
  /* The output pill is a rounded rectangle around its square art; the roll pill is a single line. */
  .crafting-io-output {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-3) var(--fab-space-1) var(--fab-space-1);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .crafting-io-output-name {
    font-size: 13px;
  }

  /* Capped to the column so a long name ellipsizes instead of widening or wrapping the pill, so
     every roll pill is the thumb's height (issue 687). */
  .crafting-roll-award {
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2xs) var(--fab-space-2) var(--fab-space-2xs) var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
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
  .crafting-roll-award-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }
</style>
