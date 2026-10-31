<!--
  A View Lab specimen, not a Fabricate surface (issue 2858). It mounts `Chip`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a caption of
  the companion's own: the icon-only chip, a glyph named by `ariaLabel` with no label, under each
  published tone and none at the default density and once at `list`; a labelled chip named by an
  `ariaLabel` that contains its label; and a locked chip in the `dashed` emphasis, the icon-only
  chip dashed, and the labelled chip undashed beside them for comparison.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts
  it for `?specimen=published-chip-forms` only.

  The ground is one 360px column on `--fab-bg-1` that spaces its rows by 6px; each row's target is
  `display: flex`, as the spec asks of a companion. A case addresses the ground by
  `data-lab-chip-forms` and a row by `data-lab-chip-form`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key, its caption and the chip's props. */
  const ROWS = Object.freeze([
    [
      'glyph-positive',
      "icon-only, tone 'positive'",
      { icon: 'fas fa-check', ariaLabel: 'Requirement met', tone: 'positive' },
    ],
    [
      'glyph-warning',
      "icon-only, tone 'warning'",
      { icon: 'fas fa-triangle-exclamation', ariaLabel: 'Requirement short', tone: 'warning' },
    ],
    [
      'glyph-info',
      "icon-only, tone 'info'",
      { icon: 'fas fa-question', ariaLabel: 'Requirement not checked', tone: 'info' },
    ],
    [
      'glyph-neutral',
      "icon-only, tone 'neutral'",
      { icon: 'fas fa-minus', ariaLabel: 'No requirement', tone: 'neutral' },
    ],
    [
      'glyph-danger',
      "icon-only, tone 'danger'",
      { icon: 'fas fa-xmark', ariaLabel: 'Requirement failed', tone: 'danger' },
    ],
    [
      'glyph-accent',
      "icon-only, tone 'accent'",
      { icon: 'fas fa-star', ariaLabel: 'Featured activity', tone: 'accent' },
    ],
    [
      'glyph-default',
      'icon-only, no tone',
      { icon: 'fas fa-hourglass-half', ariaLabel: 'Waiting on your roll' },
    ],
    [
      'glyph-list',
      "icon-only, density 'list'",
      { icon: 'fas fa-check', ariaLabel: 'Requirement met', tone: 'positive', density: 'list' },
    ],
    ['named', 'label 3, ariaLabel', { children: '3', ariaLabel: '3 days waiting', tone: 'info' }],
    [
      'dashed',
      "emphasis 'dashed'",
      { children: 'Locked until the harvest', icon: 'fas fa-lock', emphasis: 'dashed' },
    ],
    [
      'glyph-dashed',
      "icon-only, emphasis 'dashed'",
      { icon: 'fas fa-lock', ariaLabel: 'Locked', emphasis: 'dashed' },
    ],
    ['plain', 'no emphasis', { children: 'Locked until the harvest', icon: 'fas fa-lock' }],
  ]);

  let targets = $state({});

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, , props]) => mount('Chip', { target: targets[key], props }));
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-chip-forms-ground" data-lab-chip-forms>
  {#each ROWS as [key, caption] (key)}
    <section data-lab-chip-form={key}>
      <div class="published-chip-forms-target" bind:this={targets[key]}></div>
      <span>{caption}</span>
    </section>
  {/each}
</div>

<style>
  .published-chip-forms-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-chip-forms-ground > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .published-chip-forms-target {
    display: flex;
  }
</style>
