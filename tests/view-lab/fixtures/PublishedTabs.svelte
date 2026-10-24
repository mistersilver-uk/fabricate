<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts one `EditorTabs` through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does: three tabs of a reagent
  sheet, two with a glyph, under `activePanelOnly`, and the one panel the companion draws beneath
  the strip, labelled by the tab that shows it and a tab stop because it holds no control. Its
  `onSelect` passes the reached tab back as `activeTab` in its own `update`, before any `await`,
  and shows that tab's panel. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-tabs` only.

  The ground is one 360px column on `--fab-bg-1`; the strip's target is a plain block. A case
  addresses the ground by `data-lab-tabs`, the strip's target by `data-lab-tabs-target` and the
  panel by `data-lab-tabs-panel`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const STEM = 'lab-reagents';
  /** The three tabs, in order, and each panel's line. */
  const TABS = Object.freeze([
    { id: 'inputs', label: 'Inputs', icon: 'fas fa-flask' },
    { id: 'outputs', label: 'Outputs', icon: 'fas fa-box-open' },
    { id: 'notes', label: 'Notes' },
  ]);
  const PANELS = Object.freeze({
    inputs: 'Iron ore and two measures of charcoal.',
    outputs: 'One iron ingot, and slag.',
    notes: 'Quench each ingot before the next pour.',
  });

  let target = $state(null);
  let shown = $state('inputs');

  $effect(() => {
    if (!target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    // The strip's own copy of the selection, so the effect reads no state and never remounts it.
    let active = 'inputs';
    const props = () => ({
      tabs: TABS,
      activeTab: active,
      ariaLabel: 'Reagent sections',
      idStem: STEM,
      activePanelOnly: true,
      onSelect: (id) => {
        active = id;
        strip.update(props());
        shown = id;
      },
    });
    const strip = mount('EditorTabs', { target, props: props() });
    return () => strip.destroy();
  });
</script>

<div class="published-tabs-ground" data-lab-tabs>
  <div bind:this={target} data-lab-tabs-target></div>
  <div
    id={`${STEM}-panel-${shown}`}
    role="tabpanel"
    tabindex="0"
    aria-labelledby={`${STEM}-tab-${shown}`}
    data-lab-tabs-panel
  >
    {PANELS[shown]}
  </div>
</div>

<style>
  .published-tabs-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
