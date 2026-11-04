<!--
  A View Lab specimen, not a Fabricate surface. It mounts `Medallion`s through the page-session
  seam `game.fabricate.api.ui` binds, as a companion does: numbered tiles on four rungs of the art
  ladder, a numeral on each of three tones, a glyph tile inked by the accent, and a numbered tile
  beside the companion's own words. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-medallion-text` only.

  One 320px ground on `--fab-bg-1` holds the rows. A case addresses the ground by
  `data-lab-medallion-text`, a row by `data-lab-medallion-text-row` and a tile's target by its
  unique `data-lab-medallion-tile` key. A mark's target is `display: flex`, as the spec asks of a
  companion, stated inline because this file's scoped rule does not reach a nested target.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key and its tiles, a tile being its key and the props it mounts with. */
  const ROWS = Object.freeze([
    [
      'rungs',
      [
        ['rung-22', { size: 22, glyph: 10, text: '1' }],
        ['rung-26', { size: 26, glyph: 11, text: '2' }],
        ['rung-30', { size: 30, glyph: 12, text: '12' }],
        ['rung-44', { size: 44, glyph: 18, text: '99+' }],
      ],
    ],
    [
      'tones',
      [
        ['tone-success', { size: 26, glyph: 11, text: '1', tone: 'success' }],
        ['tone-accent', { size: 26, glyph: 11, text: '2', tone: 'accent' }],
        ['tone-info', { size: 26, glyph: 11, text: '3', tone: 'info' }],
      ],
    ],
    [
      'inks',
      [
        ['ink-accent', { size: 26, glyph: 11, icon: 'fas fa-coins', ink: 'accent' }],
        ['ink-none', { size: 26, glyph: 11, icon: 'fas fa-coins' }],
      ],
    ],
    ['named', [['named-3', { size: 26, glyph: 11, text: '3' }]]],
  ]);
  const KEYS = ROWS.flatMap(([, tiles]) => tiles.map(([key]) => key));

  let targets = $state({});

  $effect(() => {
    if (KEYS.some((key) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.flatMap(([, tiles]) =>
      tiles.map(([key, props]) => mount('Medallion', { target: targets[key], props }))
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-medallion-text-ground" data-lab-medallion-text>
  {#each ROWS as [row, tiles] (row)}
    <div class="published-medallion-text-row" data-lab-medallion-text-row={row}>
      {#each tiles as [key] (key)}
        <div style="display: flex" data-lab-medallion-tile={key} bind:this={targets[key]}></div>
      {/each}
      {#if row === 'named'}
        <span class="published-medallion-text-name">Stage 3</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .published-medallion-text-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-medallion-text-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .published-medallion-text-name {
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }
</style>
