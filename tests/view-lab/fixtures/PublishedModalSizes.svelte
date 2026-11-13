<!--
  A View Lab specimen, not a Fabricate surface (issue 2840). It mounts three open `Modal`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, one per `size` rung
  (`sm`, `md` and `lg`), each with the user-plus `icon`, a title and a subtitle, in a pane of the
  companion's own that is also its `overlayHost`. Each pane sets `contain: layout`, so it is the box
  its dialog is centred in. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-modal-sizes` only.

  A case addresses the ground by `data-lab-modal-sizes` and a pane by `data-lab-modal-size`, whose
  value is the pane's `size`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const SIZES = Object.freeze(['sm', 'md', 'lg']);

  let panes = $state({});
  let targets = $state({});

  $effect(() => {
    if (SIZES.some((size) => !panes[size] || !targets[size])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = SIZES.map((size) => {
      const dialog = mount('Modal', {
        target: targets[size],
        overlayHost: panes[size],
        props: {
          open: true,
          title: 'Add a contributor',
          subtitle: 'Forge the guild hall bell',
          icon: 'fas fa-user-plus',
          size,
          closeLabel: 'Close',
          scrim: 'none',
          body: true,
          onClose: () => {},
        },
      });
      const paragraph = panes[size].ownerDocument.createElement('p');
      paragraph.textContent = 'Choose who works on this project while it is in the forge.';
      dialog.slot('body').append(paragraph);
      return dialog;
    });
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-modal-sizes-ground" data-lab-modal-sizes>
  {#each SIZES as size (size)}
    <section class="published-modal-sizes-pane" data-lab-modal-size={size} bind:this={panes[size]}>
      <div bind:this={targets[size]}></div>
    </section>
  {/each}
</div>

<style>
  .published-modal-sizes-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: 704px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-0);
  }

  .published-modal-sizes-pane {
    position: relative;
    contain: layout;
    box-sizing: border-box;
    height: 240px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    background: var(--fab-bg-1);
  }
</style>
