<!--
  A View Lab specimen, not a Fabricate surface (issue 2861). It mounts two open `Popover`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, with the wiring
  `publishedPopoverSpecimen.js` states: a companion's ability grid, a nudge under a top-row cell
  and one flipped above a bottom-row cell. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-popover` only.

  The ground is a positioned 520px by 440px pane on `--fab-bg-2` and each popover's `overlayHost`,
  so both panels are drawn and clamped in it. A case addresses the ground by
  `data-lab-popover-ground`, a grid row by `data-lab-popover-row`, a cell by its `id` and a panel by
  the id its anchor gives it.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  import { mountPopoverSpecimen } from './publishedPopoverSpecimen.js';

  let ground = $state(null);

  $effect(() => {
    if (!ground) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    return mountPopoverSpecimen({ mount, ground });
  });
</script>

<div bind:this={ground} class="published-popover-ground"></div>

<style>
  .published-popover-ground {
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 520px;
    height: 440px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .published-popover-ground :global([data-lab-popover-row]) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--fab-space-2);
  }

  .published-popover-ground :global([data-lab-popover-spacer]) {
    flex: 1 1 auto;
  }

  /* A 44px cell on the height ladder takes that band's 11px corner. */
  .published-popover-ground :global([data-lab-popover-row] > button) {
    height: 44px;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
    color: var(--fab-text);
    font: inherit;
  }
</style>
