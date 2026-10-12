<!--
  The boundary every published component renders inside (issue 2426): it draws `component` with
  the props in one `$state.raw` cell, and hands any render, update or effect fault to `onfault`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `component` | a Svelte component | — | a manifest entry's bound component |
  | `initial` | plain data | — | the seam's validated copy for the first render |

  Callbacks:
  - `onfault(error)` — fires from the boundary on the microtask after a fault; the seam unmounts.

  Invariants:
  - `setProps` replaces the cell, never merges it, and nothing remounts — pinned by
    `tests/components/published-components-mounted.test.js`.
-->
<script>
  import { untrack } from 'svelte';

  let { component: Published, initial, onfault } = $props();

  let current = $state.raw(untrack(() => $state.snapshot(initial)));

  export function setProps(next) {
    current = $state.snapshot(next);
  }
</script>

<svelte:boundary onerror={(error) => onfault(error)}>
  <Published {...current} />
</svelte:boundary>
