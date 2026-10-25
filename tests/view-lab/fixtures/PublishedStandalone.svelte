<!--
  A View Lab specimen, not a Fabricate surface (issue 2456). It mounts the five entries that state
  `standaloneRoot` through the page-session seam `game.fabricate.api.ui` binds, as a companion
  does: a `Button`, an `IconButton` and a `StatusToggle`, each into a target of its own, and an
  `InspectorCard` into a fourth whose content slot holds a `Well` and, in the well's content slot,
  a line of the companion's own text. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-standalone` only.

  Under a window with no Fabricate root the seam writes one standalone style root in each target
  and none for the well inside the card; under a Fabricate window it writes none. The props are the
  same in both, so the two frames differ only by the root.

  The ground is one 360px column on `--fab-bg-1`, the ground the standalone style root paints none
  of. It and its targets carry no `fabricate` class and no theme attribute, so the ink and scheme
  their content shows are the root's. A case addresses the ground by `data-lab-standalone-ground`
  and each target by its `data-lab-standalone-target` key; each target is `display: flex`, as the
  spec asks of a companion.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const KEYS = Object.freeze(['button', 'icon-button', 'toggle', 'card']);

  let targets = $state({});

  const noop = () => {};

  $effect(() => {
    if (KEYS.some((key) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const card = mount('InspectorCard', { target: targets.card, props: { children: true } });
    const slot = card.slot('children');
    const wellTarget = slot.ownerDocument.createElement('div');
    slot.append(wellTarget);
    const well = mount('Well', {
      target: wellTarget,
      props: { label: 'Chosen reagents', children: true },
    });
    const line = slot.ownerDocument.createElement('p');
    line.style.margin = '0';
    line.textContent = 'Moonpetal, silverleaf and ember salt';
    well.slot('children').append(line);
    const handles = [
      mount('Button', {
        target: targets.button,
        props: { children: 'Craft the tonic', role: 'primary', onclick: noop },
      }),
      mount('IconButton', {
        target: targets['icon-button'],
        props: { icon: 'fas fa-pen', ariaLabel: 'Rename the tonic', onclick: noop },
      }),
      mount('StatusToggle', {
        target: targets.toggle,
        props: { on: true, ariaLabel: 'Hidden tasks', onclick: noop },
      }),
      card,
    ];
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-standalone-ground" data-lab-standalone-ground>
  {#each KEYS as key (key)}
    <div
      class="published-standalone-target"
      data-lab-standalone-target={key}
      bind:this={targets[key]}
    ></div>
  {/each}
</div>

<style>
  .published-standalone-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-standalone-target {
    display: flex;
  }
</style>
