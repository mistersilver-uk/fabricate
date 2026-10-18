<!--
  A kind adder offering several kinds, with its kind menu open. The act clicks the adder and
  nothing more, so the menu lists the offered kinds from the button's start edge.
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

  function add() {}
</script>

<Specimen {...props} onAdd={add} />
