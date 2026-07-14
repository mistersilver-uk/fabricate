<!-- Svelte 5 runes mode -->
<!--
  CraftingStatusBadge renders a recipe's browse-status callout chip (tone + icon +
  localized label) from the pure craftingRecipeStatus() presentation map. Mirrors
  the gathering callout-chip pattern; tones resolve to the shared --fab-* token
  triplets via CSS (never colour literals).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { craftingRecipeStatus } from '../../util/craftingRecipeStatus.js';

  let { status = '', compact = false } = $props();

  const descriptor = $derived(craftingRecipeStatus(status));
  const label = $derived(localize(descriptor.labelKey));
</script>

<span
  class={`crafting-status-badge tone-${descriptor.tone}`}
  class:is-compact={compact}
  data-crafting-status={status}
  data-crafting-status-tone={descriptor.tone}
  title={label}
>
  <i class={descriptor.icon} aria-hidden="true"></i>
  {#if !compact}
    <span class="crafting-status-badge-label">{label}</span>
  {/if}
</span>

<style>
  .crafting-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text);
    white-space: nowrap;
  }

  .crafting-status-badge.is-compact {
    padding: 2px;
    width: 20px;
    height: 20px;
    justify-content: center;
  }

  .crafting-status-badge i {
    font-size: 10px;
  }

  .crafting-status-badge.tone-success {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .crafting-status-badge.tone-info {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .crafting-status-badge.tone-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .crafting-status-badge.tone-danger {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  /* The neutral tone keeps the muted surface base. */
  .crafting-status-badge.tone-neutral {
    color: var(--fab-text-muted);
  }
</style>
