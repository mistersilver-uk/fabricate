<!--
  A tag requirement row with its adder open and a query typed. The act clicks `+ Tag` and types the
  row's query, nothing more, so the panel lists the matching tags, the held one selected.
-->
<script module>
  import { click, type, waitFor } from '../fixtureActs.js';

  const searchOf = (root) => root.querySelector('.fabricate-picker-popover input');

  export async function act(root, data) {
    await click(root.querySelector('[data-recipe-add-tag]'));
    await waitFor(() => searchOf(root), 'the open panel');
    await type(searchOf(root), data.typed);
    await waitFor(() => reached(root), 'the counted, held tags');
  }

  export function reached(root) {
    const listbox = root.querySelector(
      '.fabricate-picker-popover [role="listbox"][aria-multiselectable="true"]'
    );
    const options = [...(listbox?.querySelectorAll('[role="option"]') ?? [])];
    const held = listbox?.querySelectorAll('[role="option"][aria-selected="true"]') ?? [];
    return Boolean(
      searchOf(root)?.value &&
      options.length === 5 &&
      held.length === 1 &&
      options.every((option) => option.querySelector('.manager-travel-option-trailing'))
    );
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
