<!-- Svelte 5 runes mode -->
<!--
  CraftButton is the single craft-action primitive used by every recipe-detail
  body and the run-summary "craft next step" action. The `label` prop differs by
  context ("Craft 1 item" vs "Craft Another" vs "Craft next step"); the disabled
  state carries an accessible reason (title + aria-label) so a player learns WHY a
  craft is blocked, and `busy` reflects store.craftInFlight.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    label = '',
    disabled = false,
    disabledReason = '',
    busy = false,
    onCraft = null
  } = $props();

  const blocked = $derived(disabled || busy);
  const accessibleLabel = $derived(
    busy
      ? localize('FABRICATE.App.Crafting.Button.Crafting')
      : disabled && disabledReason
        ? disabledReason
        : label
  );
</script>

<button
  type="button"
  class="crafting-craft-button"
  data-crafting-craft
  data-crafting-craft-disabled={blocked ? 'true' : 'false'}
  disabled={blocked}
  title={accessibleLabel}
  aria-label={accessibleLabel}
  onclick={() => onCraft?.()}
>
  {#if busy}
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Crafting.Button.Crafting')}</span>
  {:else}
    <i class="fas fa-hammer" aria-hidden="true"></i>
    <span>{label}</span>
  {/if}
</button>

<style>
  .crafting-craft-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: auto;
    min-height: 44px;
    padding: 8px 16px;
    border: 1px solid var(--fab-accent);
    border-radius: 8px;
    background: var(--fab-accent);
    color: var(--fab-on-accent, var(--fab-surface));
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }

  .crafting-craft-button:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .crafting-craft-button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-craft-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    border-color: var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }
</style>
