<!-- Svelte 5 runes mode -->
<script>
  import Medallion from './Medallion.svelte';

  let {
    label = '',
    ariaLabel = '',
    art = '',
    icon = 'fas fa-circle',
    tint = '',
    state = 'met',
    pip = '',
    pipKind = 'ratio',
    affordance = '',
    interactive = false,
    pressed = false,
    disabled = false,
    onActivate = () => {},
  } = $props();

  const states = new Set(['met', 'short', 'open']);
  const resolvedState = $derived(states.has(state) ? state : 'met');
  const host = $derived(interactive ? 'button' : 'div');
  const attributes = $derived(
    interactive
      ? {
          type: 'button',
          disabled,
          'aria-label': ariaLabel || label || undefined,
          'aria-pressed': pressed,
          'data-keyboard-focus': 'true',
        }
      : { role: 'img', 'aria-label': ariaLabel || label || undefined }
  );
</script>

<div class="fab-slot-tile-shell" data-slot-state={resolvedState}>
  <svelte:element
    this={host}
    class="fab-slot-tile is-{resolvedState}"
    class:is-selected={pressed}
    onclick={interactive && !disabled ? onActivate : undefined}
    {...attributes}
  >
    <Medallion {art} {icon} {tint} alt="" size={56} glyph={19} />
    {#if pip}
      <span class="fab-slot-pip is-{pipKind === 'candidate' ? 'candidate' : 'ratio'}">{pip}</span>
    {/if}
  </svelte:element>
  <span class="fab-slot-caption">{label}</span>
  {#if interactive && affordance}
    <span class="fab-slot-affordance" aria-hidden="true">
      <i class="fas fa-chevron-down"></i>{affordance}
    </span>
  {/if}
</div>

<style>
  .fab-slot-tile-shell {
    display: grid;
    width: 56px;
    gap: var(--fab-space-1);
    justify-items: center;
  }

  .fab-slot-tile {
    position: relative;
    display: grid;
    box-sizing: border-box;
    width: 56px;
    height: 56px;
    padding: 0;
    place-items: center;
    overflow: visible;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-3);
    color: inherit;
    font: inherit;
  }

  button.fab-slot-tile {
    cursor: pointer;
  }

  .fab-slot-tile.is-short {
    border-color: var(--fab-danger-border);
  }

  .fab-slot-tile.is-open {
    border-style: dashed;
    border-color: var(--fab-accent-border);
  }

  .fab-slot-tile.is-selected {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-slot-tile :global(.fab-medallion) {
    border: 0;
    border-radius: 11px;
    background: transparent;
  }

  .fab-slot-pip {
    position: absolute;
    top: -7px;
    left: 50%;
    z-index: 1;
    padding: 1px var(--fab-space-chip);
    transform: translateX(-50%);
    border-radius: 999px;
    background: var(--fab-success);
    color: var(--fab-bg-0);
    font-family: var(--fab-font-mono);
    font-size: 9px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
  }

  .is-short .fab-slot-pip {
    background: var(--fab-danger);
  }

  .fab-slot-pip.is-candidate {
    background: var(--fab-accent);
  }

  .fab-slot-caption {
    display: -webkit-box;
    width: 100%;
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-size: 9px;
    font-weight: 500;
    line-height: 1.2;
    text-align: center;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  [data-slot-state='short'] .fab-slot-caption {
    color: var(--fab-danger-text);
  }

  [data-slot-state='open'] .fab-slot-caption {
    color: var(--fab-accent-text);
  }

  .fab-slot-affordance {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--fab-accent);
    font-size: 8px;
    font-weight: 600;
  }

  .fab-slot-affordance i {
    font-size: 6px;
  }
</style>
