<!--
  Identity art picked as a picture: the art with a pencil, an empty dashed slot, or the art locked
  under a padlock, and never the stored path. The caller's `onPick` opens Foundry's picker.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `art` / `alt` | resolved image path / string | `''` | Falsy `art` draws the empty slot. |
  | `ariaLabel` | pre-localized string | `''` | The pick button's name. |
  | `onPick` / `disabled` | function / boolean | no-op / `false` | The pick button's handler and its native `disabled`. |
  | `onClear` / `clearLabel` | function / string | `null` / `''` | A visible text button under filled art, rendered only when both are set. |
  | `locked` / `lockedLabel` / `lockedHint` | boolean / strings | `false` / `''` / `''` | A `role="img"` named by `lockedLabel` and titled by `lockedHint`, with a padlock and no button. |
  | `pickProps` / `clearProps` | attribute bags | `{}` | Hooks and handlers for the pick and clear buttons. |
  | `class` | class string | `''` | An extra class on the root, after `fab-art-picker`. |

  Rest spread:
  - `{...rest}` lands on the root `div`, written after `class={…}`.

  Invariants:
  - A caller sizes the tile through `--art-picker-size` (96px unset) and sets nothing else.
  - The tile sets its own `height`, `min-height` and `padding`, which keeps Foundry's `button` rule
    off it.
-->
<script>
  let {
    art = '',
    alt = '',
    ariaLabel = '',
    onPick = () => {},
    disabled = false,
    onClear = null,
    clearLabel = '',
    locked = false,
    lockedLabel = '',
    lockedHint = '',
    pickProps = {},
    clearProps = {},
    class: extraClass = '',
    ...rest
  } = $props();

  const classes = $derived(['fab-art-picker', extraClass].filter(Boolean).join(' '));
  const showClear = $derived(Boolean(art) && typeof onClear === 'function' && Boolean(clearLabel));
</script>

<div class={classes} {...rest}>
  {#if locked}
    <span
      class="fab-art-picker-tile is-locked"
      role="img"
      aria-label={lockedLabel || undefined}
      title={lockedHint || undefined}
    >
      <img src={art} {alt} />
      <i class="fas fa-lock" aria-hidden="true"></i>
    </span>
  {:else}
    <button
      type="button"
      class="fab-art-picker-tile"
      class:is-empty={!art}
      data-keyboard-focus="true"
      aria-label={ariaLabel || undefined}
      {disabled}
      onclick={onPick}
      {...pickProps}
    >
      {#if art}
        <img src={art} {alt} />
        <i class="fas fa-pen" aria-hidden="true"></i>
      {/if}
    </button>
    {#if showClear}
      <button
        type="button"
        class="fab-art-picker-clear"
        data-keyboard-focus="true"
        onclick={onClear}
        {...clearProps}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
        <span>{clearLabel}</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .fab-art-picker {
    display: inline-flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .fab-art-picker-tile {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--art-picker-size, 96px);
    height: var(--art-picker-size, 96px);
    min-height: 0;
    padding: 0;
    border: 1px solid var(--fab-border);
    /* ratchet-exempt(design-system): moved unchanged from the retired sheet family; a 9px rung moves every filled and locked frame */
    border-radius: 8px;
    background: var(--fab-bg-2);
    overflow: hidden;
  }

  .fab-art-picker-tile.is-empty {
    border-style: dashed;
    border-color: var(--fab-border-strong);
  }

  .fab-art-picker-tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: var(--fab-space-2);
  }

  /* The pencil or padlock: a badge pinned to the tile's bottom-right corner. */
  .fab-art-picker-tile .fa-pen,
  .fab-art-picker-tile .fa-lock {
    position: absolute;
    right: 5px;
    bottom: 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 1px solid var(--fab-border);
    border-radius: 50%;
    color: var(--fab-warning-text);
    background: var(--fab-surface-raised);
    font-size: 0.72rem;
  }

  .fab-art-picker-tile:not(:disabled):hover .fa-pen,
  .fab-art-picker-tile:focus-visible .fa-pen {
    border-color: var(--fab-accent);
  }

  /* Locked art mirrors its source, muted, and its padlock reads as a fact rather than an action. */
  .fab-art-picker-tile.is-locked {
    cursor: default;
  }

  .fab-art-picker-tile.is-locked img {
    object-fit: cover;
    padding: 0;
    filter: saturate(0.65) brightness(0.85);
  }

  .fab-art-picker-tile.is-locked .fa-lock {
    color: var(--fab-text-muted);
  }

  .fab-art-picker-clear {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    height: 30px;
    min-height: 30px;
    padding: 0;
    border: 0;
    color: var(--fab-text-muted);
    background: transparent;
    font-size: 0.86rem;
  }

  .fab-art-picker-clear:hover {
    color: var(--fab-text);
  }
</style>
