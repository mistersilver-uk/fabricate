<!--
  A View Lab specimen, not a Fabricate surface (issues 2850 and 2851). It mounts `ListRow`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, at the geometry and
  state keys it publishes: a read-only row at the 26px mark, a whole-row button at 28, a
  default-density button at 30, a four-column board of truncated rows at 30, a four-column board of
  34px cards, three read-only stage rows, the second current and selected and the third, not yet
  reachable, muted, and a busy button.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it
  for `?specimen=published-list-row-forms` only.

  The ground is one 480px column on `--fab-bg-2` that spaces its sections by 8px; a board section
  lays its mounts in four `minmax(0, 1fr)` columns, and the stages section stacks its rows 4px apart. A case addresses the ground by
  `data-lab-list-row-forms` and a section by `data-lab-list-row-form`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  function ignore() {}

  const LONG = 'Forge a Pattern-Welded Blade of the Deep Seam';
  /** Each section's key and the rows it mounts; a section of four is a board, of three a list. */
  const SECTIONS = Object.freeze([
    ['portrait', [{ name: 'Mira Voss', detail: 'Contributor', markSize: 26 }]],
    ['queue', [{ name: 'Ember salt reserve', quantity: 3, markSize: 28, onOpen: ignore }]],
    ['default', [{ name: 'Moonlit Glade', density: 'default', markSize: 30, onOpen: ignore }]],
    [
      'board',
      Array.from({ length: 4 }, () => ({
        name: LONG,
        detail: 'Recipe',
        truncateName: true,
        detailAlign: 'end',
        markSize: 30,
      })),
    ],
    [
      'cards',
      Array.from({ length: 4 }, () => ({
        name: LONG,
        detail: 'Forest',
        layout: 'card',
        truncateName: true,
        markSize: 34,
        onOpen: ignore,
      })),
    ],
    [
      'stages',
      [
        { name: 'Gather the ore', detail: 'Done' },
        { name: 'Quench the blade', detail: 'Now', selected: true, current: 'step' },
        { name: 'Temper the edge', detail: 'Not yet reachable', muted: true },
      ],
    ],
    [
      'reward',
      [{ name: 'Ember salt reserve', detail: 'Claiming the reward', busy: true, onOpen: ignore }],
    ],
  ]);

  /** Each section's key and its cells, each a mount target's id and the row's props. */
  const CELLS = SECTIONS.map(([key, rows]) => [
    key,
    rows.map((props, index) => ({ id: `${key}-${index}`, props })),
  ]);

  let targets = $state({});

  $effect(() => {
    const cells = CELLS.flatMap(([, row]) => row);
    if (cells.some(({ id }) => !targets[id])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = cells.map(({ id, props }) => mount('ListRow', { target: targets[id], props }));
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-list-row-forms-ground" data-lab-list-row-forms>
  {#each CELLS as [key, cells] (key)}
    <section
      data-lab-list-row-form={key}
      class:is-board={cells.length === 4}
      class:is-list={cells.length === 3}
    >
      {#each cells as cell (cell.id)}
        <div bind:this={targets[cell.id]}></div>
      {/each}
    </section>
  {/each}
</div>

<style>
  .published-list-row-forms-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 480px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .is-board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--fab-space-2);
  }

  .is-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }
</style>
