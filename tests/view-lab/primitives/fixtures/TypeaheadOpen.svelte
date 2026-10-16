<!--
  The open typeahead, as the required-knowledge field wires it. The act opens the list with a
  synthetic focus, which no other specimen's real focus can take away, and moves to the second option.
-->
<script module>
  import { KEYS, focus, press, waitFor } from '../fixtureActs.js';

  export async function act(root) {
    const input = root.querySelector('input');
    await focus(input);
    await waitFor(() => root.querySelector('[role="option"]'), 'the suggestion list');
    await press(input, KEYS.ARROW_DOWN);
    await press(input, KEYS.ARROW_DOWN);
  }

  export function reached(root) {
    return Boolean(root.querySelector('[role="option"]:nth-child(2)[aria-selected="true"]'));
  }
</script>

<script>
  let { component: Specimen, props = {}, items = [] } = $props();

  const source = () => items;
  const itemLabel = (item) => item.name;
  const itemIcon = (item) => item.icon;

  function choose() {}
</script>

<Specimen {...props} {source} {itemLabel} {itemIcon} onChoose={choose} />
