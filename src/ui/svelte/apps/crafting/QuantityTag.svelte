<!-- Svelte 5 runes mode -->
<!--
  QuantityTag is the shared have/need/missing pill used by the IO table (recipe
  detail) and the shopping-list materials table. Centralising it avoids repeating
  the same chip markup + tone CSS across both surfaces. `tone` maps to the
  semantic --fab-* token triplets; no colour literals here.
-->
<script>
  let { label = '', value = '', tone = 'neutral', icon = null } = $props();
</script>

<span class={`crafting-qty-tag tone-${tone}`} data-crafting-qty-tone={tone}>
  {#if icon}
    <i class={`fas ${icon}`} aria-hidden="true"></i>
  {/if}
  <span class="crafting-qty-tag-label">{label}</span>
  <span class="crafting-qty-tag-value">{value}</span>
</span>

<style>
  .crafting-qty-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
    white-space: nowrap;
  }

  .crafting-qty-tag-value {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .crafting-qty-tag i {
    font-size: 10px;
  }

  .crafting-qty-tag.tone-success {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .crafting-qty-tag.tone-info {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .crafting-qty-tag.tone-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .crafting-qty-tag.tone-danger {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-qty-tag.tone-success .crafting-qty-tag-value {
    color: var(--fab-success-text);
  }

  .crafting-qty-tag.tone-danger .crafting-qty-tag-value {
    color: var(--fab-danger-text);
  }
</style>
