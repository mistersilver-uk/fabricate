<!--
  A View Lab specimen, not a Fabricate surface (issue 2884). It opens a `<dialog>` with
  `showModal()`, as a Foundry DialogV2 with `modal: true` is, and mounts one `Select` in it through
  the page-session seam `game.fabricate.api.ui` binds, passing no `overlayHost`, so its list is
  drawn on a standalone layer inside the dialog rather than under the browser's top layer.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-select-modal` only.

  The dialog is placed over the ground, inside the manager window's frame, so the frame shows it;
  the ground leaves room beneath the trigger for the list to open downward. A case addresses the
  dialog by `data-lab-select-dialog`, and the dialog records its last choice as `data-lab-value`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const OPTIONS = Object.freeze([
    { value: 'name', label: 'Name' },
    { value: 'tier', label: 'Tier' },
    { value: 'recent', label: 'Most recently crafted' },
  ]);

  let ground = $state(null);
  let dialog = $state(null);
  let target = $state(null);
  let chosen = $state('');

  $effect(() => {
    if (!ground || !dialog || !target) return undefined;
    const { left, top } = ground.getBoundingClientRect();
    Object.assign(dialog.style, { left: `${left + 16}px`, top: `${top + 16}px` });
    dialog.showModal();
    let handle = null;
    const props = (value) => ({
      options: OPTIONS,
      value,
      size: 'form',
      placeholder: 'Choose an order',
      ariaLabel: 'Sort recipes by',
      onChange: (next) => {
        chosen = String(next);
        handle.update(props(next));
      },
    });
    handle = publishedComponentSeam.publicApi.mount('Select', { target, props: props(null) });
    return () => {
      handle.destroy();
      dialog.close();
    };
  });
</script>

<div class="published-select-modal-ground" bind:this={ground}>
  <dialog
    class="published-select-modal"
    aria-labelledby="lab-select-modal-title"
    data-lab-select-dialog
    data-lab-value={chosen}
    bind:this={dialog}
  >
    <p class="select-modal-title" id="lab-select-modal-title">Sort recipes by</p>
    <div class="select-modal-target" bind:this={target}></div>
  </dialog>
</div>

<style>
  .published-select-modal-ground {
    box-sizing: border-box;
    width: 360px;
    height: 340px;
    background: var(--fab-bg-1);
  }

  /* Placed by the script over the ground, so the frame holds it; its list escapes its box. */
  .published-select-modal {
    position: fixed;
    right: auto;
    bottom: auto;
    box-sizing: border-box;
    width: 300px;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    color: var(--fab-text);
    background: var(--fab-bg-0);
  }

  .published-select-modal::backdrop {
    background: transparent;
  }

  .select-modal-title {
    margin: 0 0 var(--fab-space-1);
    font-size: 12px;
    font-weight: 600;
  }

  .select-modal-target {
    display: flex;
  }
</style>
