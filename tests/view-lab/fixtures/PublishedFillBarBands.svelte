<!--
  A View Lab specimen, not a Fabricate surface (issue 2863). It mounts eight centred `FillBar`s
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside the
  signed reading and its band the companion draws as text, because the bar announces nothing and
  its inks never say good or bad. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-fill-bar-bands` only.

  `unbanded` is +10 with no band, for comparison; `within`, `edge`, `beyond` and `below` are +10,
  -20, +21 and -45 at a band of 20; `thin-unbanded` is +10 on the thin track with no band, for
  comparison, and `thin-within` and `thin-beyond` are +10 and -60 on it at the same band. The ground is one 320px column on `--fab-bg-2`. A case addresses the
  ground by `data-lab-fill-bar-bands` and each row by its `data-lab-fill-bar-band` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key in fixture order, the reading the companion prints, and the props it passes. */
  const ROWS = Object.freeze([
    ['unbanded', '+10, no band', { value: 10 }],
    ['within', '+10, neutral', { value: 10, neutralBand: 20 }],
    ['edge', '-20, neutral', { value: -20, neutralBand: 20 }],
    ['beyond', '+21, friendly', { value: 21, neutralBand: 20 }],
    ['below', '-45, hostile', { value: -45, neutralBand: 20 }],
    ['thin-unbanded', '+10, no band', { value: 10, density: 'thin' }],
    ['thin-within', '+10, neutral', { value: 10, neutralBand: 20, density: 'thin' }],
    ['thin-beyond', '-60, hostile', { value: -60, neutralBand: 20, density: 'thin' }],
  ]);

  const targets = $state([]);

  $effect(() => {
    if (ROWS.some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([, , props], index) =>
      mount('FillBar', { target: targets[index], props: { origin: 'center', ...props } })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-fill-bar-bands" data-lab-fill-bar-bands>
  {#each ROWS as [key, reading], index (key)}
    <div class="fill-bar-band-row" data-lab-fill-bar-band={key}>
      <div class="fill-bar-band-target" bind:this={targets[index]}></div>
      <span class="fill-bar-band-reading">{reading}</span>
    </div>
  {/each}
</div>

<style>
  .published-fill-bar-bands {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-2);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .fill-bar-band-row {
    display: grid;
    grid-template-columns: 1fr 96px;
    gap: var(--fab-space-2);
    align-items: center;
  }

  .fill-bar-band-target {
    display: flex;
    min-width: 0;
  }

  .fill-bar-band-reading {
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 11px;
  }
</style>
