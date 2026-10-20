<!-- The Journal's Finished list, as `HistoryList` wires it: each entry's dismiss beside its open control. -->
<script>
  import IconButton from '../../../../src/ui/svelte/components/IconButton.svelte';
  import { format } from '../fixtureActs.js';

  let { component: Specimen, props = {}, dismissKey, size, role, icon } = $props();

  const dismissLabel = (entry) => format(dismissKey, { name: entry.text });

  function ignore() {}
</script>

{#snippet action(entry)}
  <IconButton {size} {role} ariaLabel={dismissLabel(entry)} onclick={ignore} {icon} />
{/snippet}

<Specimen {...props} onOpen={ignore} {action} />
