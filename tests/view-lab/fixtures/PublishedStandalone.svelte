<!--
  A View Lab specimen, not a Fabricate surface (issues 2456, 2679, 2680). It mounts the eighteen
  entries that state `standaloneRoot` through the page-session seam `game.fabricate.api.ui` binds,
  as a companion does, with the wiring `publishedStandaloneSpecimen.js` states.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-standalone` only.

  Under a window with no Fabricate root the seam writes one standalone style root in each target
  and none for the well inside the card; under a Fabricate window it writes none. The props are the
  same in both, so the two frames differ only by the root.

  The ground is three 360px columns on `--fab-bg-1`, the ground the standalone style root paints
  none of; none carries a `fabricate` class or a theme attribute, so the ink and scheme their
  content shows are the root's, and an open panel is drawn on the standalone layer. The first
  column holds the five issue 2456 widened, the switch and card states, the field and the search
  field; the second the stepper, segmented control, option cards, tabs, pager, an off card and a
  ticked checkbox; the third the select, icon picker, action menu, opener, dialog and two more
  cards. A case
  addresses the ground by `data-lab-standalone-ground`, a column by `data-lab-standalone-column`
  and each target by its `data-lab-standalone-target` key; the button, icon button, switch, search
  field, stepper, action menu and opener targets are `display: flex`, as their groups ask of a
  companion; the rest are blocks.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
  import { COLUMNS, mountStandaloneSpecimen } from './publishedStandaloneSpecimen.js';

  const KEYS = COLUMNS.flat();
  const FLEX = new Set([
    'button',
    'icon-button',
    'toggle',
    'toggle-switch',
    'search',
    'stepper',
    'menu',
    'opener',
  ]);

  let targets = $state({});

  $effect(() => {
    if (KEYS.some((key) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    return mountStandaloneSpecimen({ mount, targets });
  });
</script>

<div class="published-standalone-ground" data-lab-standalone-ground>
  {#each COLUMNS as keys, index (index)}
    <div class="published-standalone-column" data-lab-standalone-column={index + 1}>
      {#each keys as key (key)}
        <div
          class="published-standalone-target"
          class:is-flex={FLEX.has(key)}
          data-lab-standalone-target={key}
          bind:this={targets[key]}
        ></div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .published-standalone-ground {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
  }

  .published-standalone-column {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-standalone-target.is-flex {
    display: flex;
  }
</style>
