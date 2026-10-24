<!--
  A View Lab specimen, not a Fabricate surface (issue 2644). It mounts two `SegmentedControl`s
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does: an ingredient
  filter, All, Owned and Missing, the last two with a glyph, at the default density; and a page
  size of 10, 25, 50 and 100 at the inline density across its target, numeric values with 100
  disabled. Each `onChange` passes the chosen value back in its own `update`, before it returns,
  and writes that value on its ground's `data-lab-segmented-chosen`, which nothing else writes.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts
  it for `?specimen=published-segmented` only.

  Each ground is a 360px column on `--fab-bg-1`, padded past the ring's overhang; each target is a
  plain block. A case addresses a ground by `data-lab-segmented-ground` and a target by
  `data-lab-segmented`, each naming its control.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each control's props but `onChange`, by the key its ground and target name. */
  const CONTROLS = Object.freeze({
    filter: {
      ariaLabel: 'Ingredient filter',
      value: 'all',
      options: [
        { value: 'all', label: 'All' },
        { value: 'owned', label: 'Owned', icon: 'fas fa-check' },
        { value: 'missing', label: 'Missing', icon: 'fas fa-xmark' },
      ],
    },
    inline: {
      ariaLabel: 'Results per page',
      value: 25,
      fill: true,
      density: 'inline',
      options: [
        { value: 10, label: '10' },
        { value: 25, label: '25' },
        { value: 50, label: '50' },
        { value: 100, label: '100', disabled: true },
      ],
    },
  });

  const targets = $state({ filter: null, inline: null });
  const chosen = $state({ filter: undefined, inline: undefined });

  for (const key of Object.keys(CONTROLS)) {
    $effect(() => {
      const target = targets[key];
      if (!target) return undefined;
      const { mount } = publishedComponentSeam.publicApi;
      // The control's own copy of the choice, so the effect reads no other state.
      let value = CONTROLS[key].value;
      const props = () => ({
        ...CONTROLS[key],
        value,
        onChange: (next) => {
          value = next;
          control.update(props());
          chosen[key] = next;
        },
      });
      const control = mount('SegmentedControl', { target, props: props() });
      return () => control.destroy();
    });
  }
</script>

<div class="published-segmented-lab">
  {#each Object.keys(CONTROLS) as key (key)}
    <div
      class="published-segmented-ground"
      data-lab-segmented-ground={key}
      data-lab-segmented-chosen={chosen[key]}
    >
      <div bind:this={targets[key]} data-lab-segmented={key}></div>
    </div>
  {/each}
</div>

<style>
  .published-segmented-lab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .published-segmented-ground {
    box-sizing: border-box;
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
