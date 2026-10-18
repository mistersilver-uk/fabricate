<!--
  A tag requirement row with its adder open and a query typed. The act clicks `+ Tag` and types the
  row's query, nothing more, so the panel lists the matching tags, the held one selected and its
  name whole at the site's 300px panel minimum, over the new-tag footer naming the query.
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
    const heldName = held[0]?.querySelector('.manager-travel-option-name');
    return Boolean(
      searchOf(root)?.value &&
      options.length === 5 &&
      held.length === 1 &&
      heldName &&
      heldName.scrollWidth <= heldName.clientWidth &&
      options.every((option) => option.querySelector('.manager-travel-option-trailing')) &&
      root.querySelector('.fabricate-picker-popover [data-recipe-tag-create]')
    );
  }
</script>

<script>
  // `typed` is the act's query: declared so the row may pass it, and read by `act` from `data`.
  let { component: Specimen, props = {}, typed: _typed } = $props();

  function change() {}

  function remove() {}

  function select() {}

  function createTag() {}
</script>

<Specimen
  {...props}
  onChange={change}
  onRemove={remove}
  onSelect={select}
  onCreateTag={createTag}
/>
