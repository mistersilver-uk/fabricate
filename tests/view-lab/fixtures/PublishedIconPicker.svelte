<!--
  A View Lab specimen, not a Fabricate surface (issue 2647). It mounts one `IconPicker` through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does: a reagent's icon, the flask,
  whose `onChange` passes the chosen glyph back in its own `update`, before it returns, and writes
  it on the ground's `data-lab-icon-chosen`. Nothing else writes it. Every word is a companion's
  final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-icon-picker` only.

  The ground is a 320px column on `--fab-bg-2`, padded past the trigger's ring, and it is also the
  `overlayHost`, so the open list is drawn in it. A case addresses the ground by
  `data-lab-icon-picker` and the target by `data-lab-icon-picker-target`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** The picker's props but its callback. */
  const PICKER = Object.freeze({
    value: 'fas fa-flask',
    ariaLabel: 'Reagent icon',
    listLabel: 'Reagent icons',
    searchLabel: 'Search reagent icons',
    searchPlaceholder: 'Search icons',
    noMatchesText: 'No reagent icon matches.',
  });

  let ground = $state(null);
  let target = $state(null);
  let chosen = $state(undefined);

  $effect(() => {
    if (!ground || !target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    // The picker's own copy of its value, so the effect reads no other state.
    let { value } = PICKER;
    const props = () => ({
      ...PICKER,
      value,
      onChange: (next) => {
        value = next;
        picker.update(props());
        chosen = next;
      },
    });
    const picker = mount('IconPicker', { target, props: props(), overlayHost: ground });
    return () => picker.destroy();
  });
</script>

<div
  bind:this={ground}
  class="published-icon-picker-ground"
  data-lab-icon-picker=""
  data-lab-icon-chosen={chosen}
>
  <div bind:this={target} data-lab-icon-picker-target=""></div>
</div>

<style>
  .published-icon-picker-ground {
    position: relative;
    box-sizing: border-box;
    width: 320px;
    min-height: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
