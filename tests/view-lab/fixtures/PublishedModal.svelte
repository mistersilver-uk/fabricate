<!--
  A View Lab specimen, not a Fabricate surface (issue 2656). It mounts one `Modal` through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, with the wiring
  `publishedModalSpecimen.js` states: a published `Button` opener, a paragraph in the body slot and
  a published "Done" `Button` in the footer slot. Every word is a companion's final text, so none
  is localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-modal` only.

  The ground is a padded, positioned column on `--fab-bg-2`, and it is also the `overlayHost`, so
  the open dialog is drawn in it. A case addresses the ground by `data-lab-modal`, the opener by
  `data-lab-modal-open`, the footer by `data-lab-modal-footer`, and a close by
  `data-lab-modal-closed`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  import { mountModalSpecimen } from './publishedModalSpecimen.js';

  let ground = $state(null);
  let opener = $state(null);
  let target = $state(null);

  $effect(() => {
    if (!ground || !opener || !target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    return mountModalSpecimen({ mount, ground, opener, target });
  });
</script>

<div bind:this={ground} class="published-modal-ground" data-lab-modal="">
  <div bind:this={opener} data-lab-modal-open=""></div>
  <div bind:this={target}></div>
</div>

<style>
  .published-modal-ground {
    position: relative;
    box-sizing: border-box;
    width: 480px;
    min-height: 400px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
