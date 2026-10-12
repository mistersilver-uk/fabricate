<!--
  VIEW LAB SPECIMEN, NOT A FABRICATE SURFACE (issue 2424). It mounts the published `TierTrack`
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does: into an element
  it owns, once that element is attached, and destroyed in the same effect's teardown. Every word
  is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-tier-track` only, and the `--fab-bg-2` ground names the frame's contrast.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const PROPS = Object.freeze({
    layout: 'column',
    direction: 'descending',
    currentIndex: 2,
    ariaLabel: 'Standing with the Ironvale Guild',
    currentLabel: 'You are here',
    reachedLabel: 'Reached',
    aheadLabel: 'Ahead',
    tiers: [
      { name: 'Revered', figure: '+20', notes: ['A seat at the guild table'], valence: 'positive' },
      {
        name: 'Honoured',
        figure: '+10',
        notes: ['Guild rates at every forge'],
        valence: 'positive',
      },
      { name: 'Accepted', figure: '0', notes: ['Trade at the market'], valence: 'positive' },
      { name: 'Wary', figure: '−10', notes: ['Watched in the guild hall'], valence: 'neutral' },
      { name: 'Hated', figure: '−20', notes: ['Refused service'], valence: 'negative' },
    ],
  });

  let target = $state(null);

  $effect(() => {
    if (!target) return undefined;
    const handle = publishedComponentSeam.publicApi.mount('TierTrack', { target, props: PROPS });
    return () => handle.destroy();
  });
</script>

<div class="published-tier-track-ground">
  <div bind:this={target}></div>
</div>

<style>
  .published-tier-track-ground {
    box-sizing: border-box;
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
