<!--
  The staged set picker with its panel open, its candidates answered by an async `source`. The act
  opens Add and types the row's query, nothing more, so the footer still reads the committed count.
-->
<script module>
  import { click, type, waitFor } from '../fixtureActs.js';

  const searchOf = (root) => root.querySelector('.fabricate-set-picker-popover input');

  export async function act(root, data) {
    await click(root.querySelector('button[aria-haspopup]'));
    await waitFor(() => searchOf(root), 'the open panel');
    await type(searchOf(root), data.typed);
    await waitFor(() => reached(root), 'the matched candidates');
  }

  export function reached(root) {
    const listed = root.querySelector('.fabricate-set-picker-popover [role="option"]');
    return Boolean(searchOf(root)?.value && listed);
  }
</script>

<script>
  // `typed` is the act's query: declared so the row may pass it, and read by `act` from `data`.
  let { component: Specimen, props = {}, matches = [], total = 0, typed: _typed } = $props();

  const source = async () => ({ options: matches, total });

  function change() {}
</script>

<Specimen {...props} {source} onChange={change} />
