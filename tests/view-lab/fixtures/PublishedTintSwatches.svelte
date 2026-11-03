<!--
  A View Lab specimen, not a Fabricate surface (issue 2901). It mounts four `TintSwatches` strips
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does, each holding its
  own `value` and passing the new one back through `update` from `onChange`, so a key or a press in
  the lab moves the check as a companion's own state would. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-tint-swatches` only.

  The ground is a 380px column on `--fab-bg-1`: a 360px strip with Rose checked, a 240px strip of
  four tints the companion names itself with Azure checked, a 360px strip with none checked, and a
  360px strip a case drives by the keyboard. A case addresses the ground by
  `data-lab-tint-swatches-ground` and a strip's target by its `data-lab-tint-swatches` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const STRIPS = Object.freeze([
    { key: 'checked', width: 360, props: { value: 'rose', ariaLabel: 'Activity colour' } },
    {
      key: 'subset',
      width: 240,
      props: {
        value: 'azure',
        ariaLabel: 'Faction colour',
        tints: ['sage', 'rose', 'butter', 'azure'],
        labels: { sage: 'Moss', rose: 'Blush', butter: 'Straw', azure: 'Sky' },
      },
    },
    { key: 'unchecked', width: 360, props: { value: '', ariaLabel: 'Camp colour' } },
    { key: 'keyboard', width: 360, props: { value: 'rose', ariaLabel: 'Banner colour' } },
  ]);

  let targets = $state({});

  /** Mounts one strip into `target`, keeping its `value` and drawing each choice through `update`. */
  function mountStrip(mount, target, initial) {
    let value = initial.value;
    const props = () => ({
      ...initial,
      value,
      onChange: (next) => {
        value = next;
        handle.update(props());
      },
    });
    const handle = mount('TintSwatches', { target, props: props() });
    return handle;
  }

  $effect(() => {
    if (STRIPS.some(({ key }) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = STRIPS.map(({ key, props }) => mountStrip(mount, targets[key], props));
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-tint-swatches-ground" data-lab-tint-swatches-ground>
  {#each STRIPS as strip (strip.key)}
    <div
      class="published-tint-swatches-target"
      style:width={`${strip.width}px`}
      data-lab-tint-swatches={strip.key}
      bind:this={targets[strip.key]}
    ></div>
  {/each}
</div>

<style>
  .published-tint-swatches-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: 380px;
    padding: var(--fab-space-2);
    background: var(--fab-bg-1);
  }
</style>
