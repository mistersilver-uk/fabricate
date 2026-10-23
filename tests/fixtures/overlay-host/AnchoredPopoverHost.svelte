<!--
  A test-only caller that opens `SearchablePopover` from an anchor it owns (issue 2459): a
  right-click, the ContextMenu key or Shift+F10 on the anchor sets the bound `open`, and the
  primitive renders no trigger of its own. `form` passes the anchor as an element or as a
  resolver; `globalThis.__anchoredHost` lets the suite swap, unmount or shut it without a pointer
  press that would itself count as an outside click.
-->
<script>
  import SearchablePopover from '../../../src/ui/svelte/components/SearchablePopover.svelte';

  let { form = 'element' } = $props();

  let open = $state(false);
  let first = $state(null);
  let second = $state(null);
  let useSecond = $state(false);
  let firstMounted = $state(true);
  let picked = $state('');

  const current = () => (useSecond ? second : first);
  const anchor = $derived(form === 'resolver' ? current : current());

  function openFrom(event) {
    event.preventDefault();
    open = true;
  }

  function openFromKey(event) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openFrom(event);
  }

  globalThis.__anchoredHost = {
    swap: () => (useSecond = true),
    unmount: () => (firstMounted = false),
    swapAndUnmount: () => {
      useSecond = true;
      firstMounted = false;
    },
    shut: () => (open = false),
    isOpen: () => open,
    picked: () => picked,
  };
</script>

<div class="anchored-host" tabindex="-1" data-anchored-host>
  {#if firstMounted}
    <button
      bind:this={first}
      type="button"
      class="anchored-host-first"
      aria-haspopup="dialog"
      aria-expanded={open}
      oncontextmenu={openFrom}
      onkeydown={openFromKey}>Hammer</button
    >
  {/if}
  <button
    bind:this={second}
    type="button"
    class="anchored-host-second"
    style="margin-left: 240px"
    oncontextmenu={openFrom}
    onkeydown={openFromKey}>Anvil</button
  >
  <SearchablePopover
    {anchor}
    bind:open
    options={[
      { id: 'hammer', label: 'Hammer', icon: 'fas fa-hammer' },
      { id: 'anvil', label: 'Anvil', icon: 'fas fa-anvil' },
    ]}
    panelLabel="Choose an icon"
    searchLabel="Search icons"
    onSelect={(id) => (picked = id)}
  />
</div>
