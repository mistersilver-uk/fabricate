<!--
  The boundary a published component renders in (issue 2426): `component`, its `initial` props and
  `onfault(error)`. `setProps` replaces the props cell, never merges it, and nothing remounts.
-->
<script>
  import { untrack } from 'svelte';

  let { component: Published, initial, onfault } = $props();

  let current = $state.raw(untrack(() => $state.snapshot(initial)));

  export function setProps(next) {
    untrack(() => {
      current = $state.snapshot(next);
    });
  }
</script>

<svelte:boundary onerror={(error) => onfault(error)}>
  <Published {...current} />
</svelte:boundary>
