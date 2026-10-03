<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): PlayerDetailHeader is a composition of design-system members (Medallion, Avatar and Button, with the caller's own Chip row), so it draws no control of its own and takes no manifest row -->
<!--
  The identity row a player detail pane leads with: the art tile, the name, optional meta and
  chips, and at most one primary action. Zero primaries is a correct state; two never is.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `name` | string | `''` | The record's name, drawn on the row's one `h2`. |
  | `art` / `icon` / `tint` | resolved image path / Font Awesome classes / bare `--fab-tag-*` key | `''` / the tile's own / `''` | Forwarded to the tile: a 38px record tile, or a 32px portrait. The caller resolves the image. |
  | `portrait` | boolean | `false` | The subject is an actor, so the tile is an `Avatar` drawing initials from `name` when `art` is empty. |
  | `artDimmed` | boolean | `false` | Fades the artwork beneath `tileOverlay`, never the overlay itself. |
  | `primaryLabel` | string | `''` | The primary's visible text. Empty renders no primary at all. |
  | `primaryIcon` / `primaryDisabled` | Font Awesome classes / boolean | `''` / `false` | The primary's leading glyph and its disabled state. |
  | `primaryProps` | attribute map | `{}` | Spread onto the primary: `data-*` hooks, `class`, `title`, `aria-*`. |
  | `class` | class string | `''` | An extra class on the root, appended to the row's own. |

  Snippets:
  - `tileOverlay` — drawn over the tile inside its positioning box, for a status scrim or pip.
  - `meta` — quiet text facts, first in the row beneath the name.
  - `chips` — the `Chip` row, after `meta` in that same wrapping row.

  Callbacks:
  - `onclick(event)` — the primary was activated.

  Rest spread:
  - `{...rest}` lands on the root `div`, written after `class={…}`.

  Invariants:
  - The primary is a `Button role="primary"` this row renders itself, so a caller cannot
    pass a second one — pinned by `tests/components/player-detail-header-mounted.test.js`.
-->
<script>
  import Avatar from '../components/Avatar.svelte';
  import Button from '../components/Button.svelte';
  import Medallion from '../components/Medallion.svelte';

  let {
    name = '',
    art = '',
    icon = undefined,
    tint = '',
    portrait = false,
    artDimmed = false,
    primaryLabel = '',
    primaryIcon = '',
    primaryDisabled = false,
    primaryProps = {},
    onclick = () => {},
    tileOverlay = null,
    meta = null,
    chips = null,
    class: extraClass = '',
    ...rest
  } = $props();
</script>

<div
  class={['player-detail-header', extraClass].filter(Boolean).join(' ')}
  data-player-detail-header
  {...rest}
>
  <span class="player-detail-header-tile" class:is-dimmed={artDimmed}>
    <span class="player-detail-header-art">
      {#if portrait}
        <Avatar {art} {name} alt="" size={32} />
      {:else}
        <Medallion {art} {icon} {tint} alt="" size={38} />
      {/if}
    </span>
    {@render tileOverlay?.()}
  </span>
  <div class="player-detail-header-copy">
    <h2 class="player-detail-header-name">{name}</h2>
    {#if meta || chips}
      <div class="player-detail-header-meta">
        {@render meta?.()}
        {@render chips?.()}
      </div>
    {/if}
  </div>
  {#if primaryLabel}
    <div class="player-detail-header-action">
      <!-- ratchet-exempt(design-system): the spread is `primaryProps`, the caller's extra `class` and the `data-*`, `title` and `aria-*` Button takes through rest -->
      <Button role="primary" disabled={primaryDisabled} {onclick} {...primaryProps}>
        {#if primaryIcon}<i class={primaryIcon} aria-hidden="true"></i>{/if}
        <span>{primaryLabel}</span>
      </Button>
    </div>
  {/if}
</div>

<style>
  .player-detail-header {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .player-detail-header-tile {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .player-detail-header-art {
    display: inline-flex;
  }

  .player-detail-header-tile.is-dimmed .player-detail-header-art {
    opacity: 0.4;
  }

  .player-detail-header-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .player-detail-header-name {
    margin: 0;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .player-detail-header-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-text-subtle);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .player-detail-header-action {
    flex: 0 0 auto;
  }
</style>
