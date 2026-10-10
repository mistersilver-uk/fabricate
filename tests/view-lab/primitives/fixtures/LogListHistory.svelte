<!-- The Journal's Finished list, as `HistoryList` wires it: each entry's dismiss beside its open control. -->
<script>
  import IconButton from '../../../../src/ui/svelte/components/IconButton.svelte';
  import { format } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    children,
    dismissKey,
    class: dismissClass = '',
  } = $props();

  const dismissLabel = (entry) => format(dismissKey, { name: entry.text });

  function ignore() {}
</script>

{#snippet action(entry)}
  <IconButton
    size={24}
    class={dismissClass}
    ariaLabel={dismissLabel(entry)}
    title={dismissLabel(entry)}
    onclick={ignore}>{@render children?.()}</IconButton
  >
{/snippet}

<Specimen {...props} onOpen={ignore} {action} />
