<!--
  The routing line with Assign open. The act presses Assign and nothing more, so the panel lists the
  row's candidates, each with where it routes today, under the row's note.
-->
<script module>
  import { click, waitFor } from '../fixtureActs.js';

  export async function act(root) {
    await click(root.querySelector('[data-route-sources-assign]'));
    await waitFor(() => reached(root), 'the open Assign panel');
  }

  export function reached(root) {
    return Boolean(root.querySelector('.fabricate-route-sources-popover [role="option"]'));
  }
</script>

<script>
  let { component: Specimen, props = {} } = $props();

  function assign() {}

  function remove() {}
</script>

<Specimen {...props} onAssign={assign} onRemove={remove} />
