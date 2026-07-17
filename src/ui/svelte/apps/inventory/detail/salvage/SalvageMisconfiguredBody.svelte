<!-- Svelte 5 runes mode -->
<!--
  SalvageMisconfiguredBody is the GM-config state: a routed or progressive salvage
  with no authored roll formula.

  Both modes REQUIRE a check to produce an outcome (routed routes on the tier name;
  progressive spends the roll total as its budget), so the engine aborts such an
  attempt with `{ success: false, misconfigured: true }` and zero mutation. Rendering
  the authored tiers or stages here would put a plausible contract under a footer
  that always fails — so this body says what is wrong instead, and the footer is
  disabled rather than inviting a doomed press.
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';

  let { mode = 'routed' } = $props();
</script>

<div class="salvage-misconfigured" data-inventory-salvage-body="misconfigured" role="status">
  <p class="salvage-misconfigured-title">
    <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Salvage.MisconfiguredTitle')}</span>
  </p>
  <p class="salvage-misconfigured-rule">
    {mode === 'progressive'
      ? localize('FABRICATE.App.Inventory.Salvage.MisconfiguredProgressive')
      : localize('FABRICATE.App.Inventory.Salvage.MisconfiguredRouted')}
  </p>
</div>

<style>
  .salvage-misconfigured {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--fab-warning-border);
    border-radius: 9px;
    background: var(--fab-warning-soft);
  }

  .salvage-misconfigured-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--fab-warning-text);
  }

  .salvage-misconfigured-rule {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }
</style>
