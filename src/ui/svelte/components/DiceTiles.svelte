<!-- Svelte 5 runes mode -->
<!--
  THE DIE TILES OF A SUCCESS-COUNTING ROLL (issue 2006): one tile per active die in roll order,
  each explosion's die straight after the die that produced it, every mark on one tile.
  `countDiceTiles.js` builds the model and every string; its chat renderer emits this markup.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `model` | `{ tiles: [{ face, marks, generated }], more }` | `null` | `tileModel(...)`'s output. Nothing renders without a tile. |
  | `legend` | boolean | `false` | Adds the key under the tiles; the result boxes and the simulator draw it, chat does not. |
  | `faceDataAttr` / `marksDataAttr` / `legendDataAttr` | `data-*` names | `DICE_TILE_HOOKS` | A host's own hook names; a tile's marks are space-separated. |

  Invariants:
  - Every glyph is `aria-hidden`; each tile's `aria-label` names its face and marks, so colour is
    never the only signal.
  - The tiles wrap inside the host and never scroll sideways.
-->
<script>
  import {
    DICE_TILE_GLYPHS,
    DICE_TILE_HOOKS,
    legendText,
    moreText,
    tileLabel,
    tileTone,
  } from '../../presenters/countDiceTiles.js';
  import { localize } from '../util/foundryBridge.js';

  let {
    model = null,
    legend = false,
    faceDataAttr = DICE_TILE_HOOKS.face,
    marksDataAttr = DICE_TILE_HOOKS.marks,
    legendDataAttr = DICE_TILE_HOOKS.legend,
  } = $props();

  const tiles = $derived(Array.isArray(model?.tiles) ? model.tiles : []);
  const more = $derived(Number(model?.more) > 0 ? Number(model.more) : 0);
</script>

{#if tiles.length > 0 || more > 0}
  <div class="fabricate-dice-tiles">
    <ul class="fabricate-dice-tiles__list">
      {#each tiles as tile, position (position)}
        {@const tone = tileTone(tile.marks)}
        <li
          class="fabricate-dice-tiles__tile"
          class:fabricate-dice-tiles__tile--success={tone === 'success'}
          class:fabricate-dice-tiles__tile--danger={tone === 'danger'}
          {...{ [faceDataAttr]: tile.face, [marksDataAttr]: tile.marks.join(' ') }}
          data-dice-tile-generated={tile.generated ? '' : undefined}
          aria-label={tileLabel(tile, localize)}
        >
          <span class="fabricate-dice-tiles__face" aria-hidden="true">{tile.face}</span>
          {#if tile.marks.length > 0}
            <span class="fabricate-dice-tiles__marks" aria-hidden="true">
              {#each tile.marks as mark (mark)}
                <i class={DICE_TILE_GLYPHS[mark]} aria-hidden="true"></i>
              {/each}
            </span>
          {/if}
        </li>
      {/each}
      {#if more > 0}
        <li class="fabricate-dice-tiles__more" data-dice-tiles-more={more}>
          {moreText(more, localize)}
        </li>
      {/if}
    </ul>
    {#if legend}
      <p class="fabricate-dice-tiles__legend" {...{ [legendDataAttr]: '' }}>
        {legendText(localize)}
      </p>
    {/if}
  </div>
{/if}

<style>
  .fabricate-dice-tiles {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .fabricate-dice-tiles__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Frames 39 and 40: a 38 by 44 tile at radius 9, the face over its marks, toned by what it did. */
  .fabricate-dice-tiles__tile {
    display: inline-flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 38px;
    height: 44px;
    margin: 0;
    padding: 0 var(--fab-space-1);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    line-height: 1;
  }

  .fabricate-dice-tiles__tile--success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  .fabricate-dice-tiles__tile--danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  .fabricate-dice-tiles__face {
    font-size: 14px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fabricate-dice-tiles__tile--success .fabricate-dice-tiles__face {
    color: var(--fab-text);
  }

  .fabricate-dice-tiles__marks {
    display: flex;
    gap: var(--fab-space-2xs);
    font-size: 9px;
  }

  .fabricate-dice-tiles__more {
    align-self: center;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 11px;
  }

  .fabricate-dice-tiles__legend {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 10px;
  }
</style>
