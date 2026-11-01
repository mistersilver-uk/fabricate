<!--
  A View Lab specimen, not a Fabricate surface (issue 2837). It mounts four `StageBars` through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each beneath the text the
  companion draws to name it and state which stage is done and which is current, because neither
  the shares nor the thin track's colours carry that alone. Every word is a companion's final
  text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-stage-bars-forms` only.

  `states` is the default track, for comparison; `thin-states` the same three stages on the thin
  track; `shares` a pooled project on the thin track at the tight gap, its finished and current
  stages split among contributors, its last stage, not current, begun early and split too, and
  each of its first two stages carrying a hover `title` (issue 2857); `default-shares` the same on
  the default track. The
  ground is one 360px column on `--fab-bg-2`. A case addresses the ground by
  `data-lab-stage-bars-forms` and each row by its `data-lab-stage-bars-form` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const STAGES = Object.freeze([
    { label: 'Gather, done', value: 100 },
    { label: 'Smelt, current', value: 45 },
    { label: 'Forge, ahead', value: 0 },
  ]);
  const POOLED = Object.freeze([
    {
      label: 'Survey, done',
      title: 'Survey: 6 of 6 days',
      value: 100,
      weight: 2,
      shares: [
        { weight: 3, tone: 'ember' },
        { weight: 2, tone: 'azure' },
        { weight: 1, tone: 'verdant' },
      ],
    },
    {
      label: 'Build, current',
      title: 'Build: 6 of 10 days',
      value: 60,
      weight: 3,
      shares: [
        { weight: 1, tone: 'ember' },
        { weight: 1, tone: 'azure' },
      ],
    },
    {
      label: 'Dedicate, ahead, begun early',
      value: 50,
      weight: 1,
      shares: [
        { weight: 1, tone: 'verdant' },
        { weight: 1, tone: 'rose' },
      ],
    },
  ]);

  /** Each row's key in fixture order, its heading, its reading and the props the companion passes. */
  const ROWS = Object.freeze([
    ['states', 'Default track', 'Gather done, Smelt current at 45%', { stages: STAGES }],
    [
      'thin-states',
      'Thin track',
      'Gather done, Smelt current at 45%',
      { stages: STAGES, track: 'thin' },
    ],
    [
      'shares',
      'Shrine project',
      'Survey done; Build current at 60%; Dedicate begun early at 50%',
      { stages: POOLED, track: 'thin', gap: 'tight' },
    ],
    [
      'default-shares',
      'Shrine project, default track',
      'Survey done; Build current at 60%; Dedicate begun early at 50%',
      { stages: POOLED },
    ],
  ]);

  const targets = $state([]);

  $effect(() => {
    if (ROWS.some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([, heading, , props], index) =>
      mount('StageBars', {
        target: targets[index],
        props: { ariaLabel: heading, currentIndex: 1, numbered: false, ...props },
      })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-stage-bars-forms" data-lab-stage-bars-forms>
  {#each ROWS as [key, heading, reading], index (key)}
    <section data-lab-stage-bars-form={key}>
      <p class="stage-bars-forms-heading">{heading}</p>
      <div bind:this={targets[index]}></div>
      <p class="stage-bars-forms-reading">{reading}</p>
    </section>
  {/each}
</div>

<style>
  .published-stage-bars-forms {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-3);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .stage-bars-forms-heading {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .stage-bars-forms-reading {
    margin: var(--fab-space-1) 0 0;
    color: var(--fab-text-muted);
    font-size: 11px;
  }
</style>
