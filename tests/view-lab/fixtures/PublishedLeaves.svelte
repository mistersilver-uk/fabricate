<!--
  A View Lab specimen, not a Fabricate surface (issue 2448). It mounts the seven data-only leaves
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does: one mount per
  section, each into an element it owns, all destroyed in the same effect's teardown. Every word is
  a companion's final text, so none is localized, and the art is the lab world's own, so
  `tests/view-lab-fixture-assets.test.js` resolves it. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-leaves` only.

  The ground is three 280px cells of three 88px tracks: a tile or a stat box takes one track and
  every other mount a whole cell. It sets the danger ink, so an ink a leaf fails to state shows in
  the frame. The case's `expectContained` addresses each section by its position in `MOUNTS`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
  import { LAB_SYSTEM_IDS, buildLabContent } from '../world/labContent.js';

  const smithing = buildLabContent().systems.find(({ id }) => id === LAB_SYSTEM_IDS.SMITHING);
  const artOf = (componentId) => smithing.components.find(({ id }) => id === componentId).img;

  const TILES = new Set(['Avatar', 'Medallion']);
  const ONE_TRACK = new Set([...TILES, 'StatBox']);

  const MOUNTS = Object.freeze([
    ['Avatar', { art: smithing.img, name: 'Karrun Forge', alt: '' }],
    ['Avatar', { name: 'Mira Voss' }],
    ['Avatar', { name: 'Ironvale Caravan', shape: 'square', tint: 'azure' }],
    ['Medallion', { art: artOf('sm-ruby'), size: 38, alt: '' }],
    ['Medallion', { size: 26, glyph: 11, icon: 'fas fa-hammer' }],
    ['Medallion', { size: 22, glyph: 10, icon: 'fas fa-gem', tint: 'rose' }],
    ['Medallion', { size: 30, glyph: 12, icon: 'fas fa-skull', tone: 'danger' }],
    ['FillBar', { value: 0 }],
    ['FillBar', { value: 64 }],
    ['FillBar', { value: 100, density: 'compact' }],
    ['Meter', { value: 3, max: 11, label: 'Labourers', valueText: '3 of 11 labourers' }],
    ['BandedBar', { rows: [{ name: 'Event chance', percent: 62 }] }],
    [
      'BandedBar',
      {
        rows: [
          { id: 'flawless', name: 'Flawless masterwork', percent: 12 },
          { id: 'sound', name: 'Sound', percent: 100 },
          { id: 'flawed', name: 'Flawed', percent: 40 },
        ],
      },
    ],
    ['StatBox', { value: '12', label: 'Runs', icon: 'fas fa-hourglass-half' }],
    ['StatBox', { value: '3', label: 'Failed', tone: 'danger' }],
    ['StatBox', { value: '48', label: 'Hours remaining' }],
    [
      'InfoStrip',
      {
        label: 'Conditions',
        badge: { label: 'Stable', tone: 'info' },
        facts: [
          { icon: 'fas fa-cloud-sun', label: 'Weather', value: 'Clear' },
          { icon: 'fas fa-clock', value: 'Dusk' },
          {
            icon: 'fas fa-mountain',
            label: 'Realm',
            value: 'The third gallery of the Karrun deeps, beyond the flooded shaft',
          },
        ],
      },
    ],
  ]);

  const targets = $state([]);

  $effect(() => {
    if (MOUNTS.some((_, index) => !targets[index])) return undefined;
    const handles = MOUNTS.map(([name, props], index) =>
      publishedComponentSeam.publicApi.mount(name, { target: targets[index], props })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-leaves-ground">
  {#each MOUNTS as [name], index (index)}
    <section
      data-published={name}
      class:is-one-track={ONE_TRACK.has(name)}
      class:is-tile={TILES.has(name)}
    >
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-leaves-ground {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(9, 88px);
    gap: var(--fab-space-2);
    align-items: start;
    width: max-content;
    padding: var(--fab-space-3);
    color: var(--fab-danger);
    background: var(--fab-bg-2);
  }

  section {
    grid-column: span 3;
    min-width: 0;
  }

  section.is-one-track {
    grid-column: span 1;
  }

  section.is-tile > div {
    display: flex;
  }
</style>
