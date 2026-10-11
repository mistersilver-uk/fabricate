<!--
  A requirement row, or a choice group, with its kind menu open. The act clicks the one menu
  trigger the row draws, the bare row's `or…` or the box's `Alternative` adder, and nothing more.
-->
<script module>
  import { click, waitFor } from '../fixtureActs.js';

  export async function act(root) {
    await click(root.querySelector('[aria-haspopup="menu"]'));
    await waitFor(() => reached(root), 'the open kind menu');
  }

  export function reached(root) {
    return Boolean(root.querySelector('.manager-recipe-or-menu [role="menu"]'));
  }
</script>

<script>
  let { component: Specimen, props = {} } = $props();

  function change() {}
</script>

<Specimen {...props} onChange={change} />
