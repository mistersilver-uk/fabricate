<!--
  A View Lab specimen, not a Fabricate surface (issue 2652). It mounts one `ActionMenu` through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does: a reagent's three commands,
  the second disabled and the third a danger, whose `onSelect` writes the chosen id on the ground.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it
  for `?specimen=published-action-menu` only.

  The ground is a 320px column on `--fab-bg-2`, padded past the trigger's ring and tall enough for
  the menu to open below the trigger, which ends a row along the ground's end edge. It is also the
  `overlayHost`, so the open menu is drawn in it. A case addresses the ground by
  `data-lab-action-menu`, the target by `data-lab-action-menu-target`, and the last choice by
  `data-lab-action-chosen`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** The menu's props but its callback. */
  const MENU = Object.freeze({
    items: [
      { id: 'duplicate', label: 'Duplicate reagent', icon: 'fas fa-copy' },
      { id: 'archive', label: 'Archive reagent', icon: 'fas fa-box-archive', disabled: true },
      { id: 'delete', label: 'Delete reagent', icon: 'fas fa-trash', danger: true },
    ],
    ariaLabel: 'Reagent actions for Flask',
  });

  let ground = $state(null);
  let target = $state(null);

  $effect(() => {
    if (!ground || !target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const props = {
      ...MENU,
      onSelect: (id) => ground.setAttribute('data-lab-action-chosen', id),
    };
    const menu = mount('ActionMenu', { target, props, overlayHost: ground });
    return () => menu.destroy();
  });
</script>

<div bind:this={ground} class="published-action-menu-ground" data-lab-action-menu="">
  <div class="published-action-menu-row">
    <div bind:this={target} data-lab-action-menu-target=""></div>
  </div>
</div>

<style>
  .published-action-menu-ground {
    position: relative;
    box-sizing: border-box;
    width: 320px;
    min-height: 240px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .published-action-menu-row {
    display: flex;
    justify-content: flex-end;
  }
</style>
