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
  - The `fabricate-dice-tiles` family is styled once in `styles/fabricate.css`, because a chat card
    sits outside every Fabricate window and draws the same markup.
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
