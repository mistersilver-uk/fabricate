<!-- Svelte 5 runes mode -->
<!--
  PaletteAvailabilityLegend renders the small legend strip beneath the alchemy
  view explaining the colour dots used by ComponentPalette tiles.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
</script>

<div class="palette-availability-legend" role="note">
  <span class="palette-availability-legend__item">
    <span class="palette-availability-legend__dot palette-availability-legend__dot--available" aria-hidden="true"></span>
    {localize('FABRICATE.ActorApp.Alchemy.LegendAvailable')}
  </span>
  <span class="palette-availability-legend__item">
    <span class="palette-availability-legend__dot palette-availability-legend__dot--low" aria-hidden="true"></span>
    {localize('FABRICATE.ActorApp.Alchemy.LegendLowQuantity')}
  </span>
  <span class="palette-availability-legend__item">
    <span class="palette-availability-legend__dot palette-availability-legend__dot--unavailable" aria-hidden="true"></span>
    {localize('FABRICATE.ActorApp.Alchemy.LegendUnavailable')}
  </span>
</div>

<style>
  .palette-availability-legend {
    display: flex;
    align-items: center;
    gap: var(--fab-space-4);
    padding: var(--fab-space-2) var(--fab-space-3);
    font-size: 12px;
    color: var(--fab-text-muted);
    border-top: 1px solid var(--fab-border);
  }

  .palette-availability-legend__item {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .palette-availability-legend__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .palette-availability-legend__dot--available {
    background: var(--fab-accent);
  }

  .palette-availability-legend__dot--low {
    background: var(--fab-warning);
  }

  .palette-availability-legend__dot--unavailable {
    background: var(--fab-danger);
    opacity: 0.7;
  }

  @container actor-app (max-width: 540px) {
    .palette-availability-legend {
      flex-wrap: wrap;
      gap: var(--fab-space-2);
    }
  }
</style>
