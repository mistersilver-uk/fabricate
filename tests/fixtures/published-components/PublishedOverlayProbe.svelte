<!--
  A test-only published component that opens an overlay (issue 2454): a trigger button named by
  `label` and, while `open`, a panel `anchoredPopover` portals into the seam's host, holding a
  button that calls `onChoose(25)`. `explode` faults the panel's render, `cap` is the popover's
  `maxHeightCap`, and the panel's `left` is the host rect's, which shows what it was measured from.
-->
<script>
  import { anchoredPopover } from '../../../src/ui/svelte/actions/anchoredPopover.js';

  let {
    open = false,
    label = undefined,
    explode = false,
    cap = 0,
    onChoose = undefined,
  } = $props();

  let trigger = $state(null);

  const layout = (_trigger, _panel, hostRect) => ({
    left: hostRect.left,
    top: 0,
    placement: 'bottom',
  });

  function guard(value) {
    if (value) throw new Error('overlay probe fault');
    return '';
  }
</script>

<button type="button" data-keyboard-focus="true" data-overlay-probe-trigger bind:this={trigger}
  >{label}</button
>
{#if open}
  <div
    data-overlay-probe-panel
    use:anchoredPopover={{
      component: 'PublishedOverlayProbe',
      trigger: () => trigger,
      layout,
      maxHeightCap: cap,
    }}
  >
    {guard(explode)}<button
      type="button"
      data-keyboard-focus="true"
      data-overlay-probe-choice
      onclick={() => onChoose?.(25)}>25</button
    >
  </div>
{/if}
