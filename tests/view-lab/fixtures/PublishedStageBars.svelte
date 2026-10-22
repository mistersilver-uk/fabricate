<!--
  A View Lab specimen, not a Fabricate surface (issue 2455). It mounts three `StageBars` through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beneath the text
  the companion draws to name it. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-stage-bars` only.

  `forge` is numbered and captions four named stages; `brew` is unnumbered and labels each of its
  three unnamed stages; `copy` is one named stage. Each name is short enough that its caption fits
  its bar on one line. The ground is one 360px column on `--fab-bg-2`, which the caption's ink is
  held against. A case addresses the ground by `data-lab-stage-bars-ground` and each section by
  its `data-lab-stage-bars` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each group's key in fixture order, its heading and the props the companion passes. */
  const GROUPS = Object.freeze([
    [
      'forge',
      {
        ariaLabel: 'Forging progress',
        currentIndex: 2,
        stages: [
          { name: 'Gather', value: 100 },
          { name: 'Smelt', value: 100 },
          { name: 'Forge', value: 45 },
          { name: 'Temper', value: 0 },
        ],
      },
    ],
    [
      'brew',
      {
        ariaLabel: 'Brewing progress',
        currentIndex: 0,
        numbered: false,
        stages: [
          { label: 'Stage 1 of 3', value: 30 },
          { label: 'Stage 2 of 3', value: 0 },
          { label: 'Stage 3 of 3', value: 0 },
        ],
      },
    ],
    ['copy', { ariaLabel: 'Copying a scroll', stages: [{ name: 'Copy', value: 70 }] }],
  ]);

  const targets = $state([]);

  $effect(() => {
    if (GROUPS.some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = GROUPS.map(([, props], index) =>
      mount('StageBars', { target: targets[index], props })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-stage-bars-ground" data-lab-stage-bars-ground>
  {#each GROUPS as [key, { ariaLabel }], index (key)}
    <section data-lab-stage-bars={key}>
      <p class="stage-bars-heading">{ariaLabel}</p>
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-stage-bars-ground {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-4);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .stage-bars-heading {
    margin: 0 0 var(--fab-space-2);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }
</style>
