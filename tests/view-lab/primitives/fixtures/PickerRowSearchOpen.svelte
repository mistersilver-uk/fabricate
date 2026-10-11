<!--
  An empty requirement row with its search typed into, as an ingredient set wires it. The act opens
  the suggestions with a synthetic focus and types the row's query, nothing more.
-->
<script module>
  import { focus, type, waitFor } from '../fixtureActs.js';

  const searchOf = (root) => root.querySelector('.manager-recipe-option-search input');

  export async function act(root, data) {
    await focus(searchOf(root));
    await type(searchOf(root), data.typed);
    await waitFor(() => reached(root), 'the suggestions');
  }

  export function reached(root) {
    return root.querySelectorAll('.manager-recipe-option-suggestions [role="option"]').length === 3;
  }
</script>

<script>
  // `typed` is the act's query: declared so the row may pass it, and read by `act` from `data`.
  let { component: Specimen, props = {}, typed: _typed } = $props();

  function change() {}

  function remove() {}

  function select() {}
</script>

<Specimen {...props} onChange={change} onRemove={remove} onSelect={select} />
