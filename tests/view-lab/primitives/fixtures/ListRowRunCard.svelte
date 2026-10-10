<!-- The Journal's Active run, as `RunCard` wires its row: the status chip, and the stage bars beneath. -->
<script>
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import RunProgress from '../../../../src/ui/svelte/components/RunProgress.svelte';
  import { localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    meta,
    statusKey,
    tone,
    stages = null,
    current = 0,
    progress = 0,
    progressKey = '',
  } = $props();

  function open() {}
</script>

{#snippet heading()}
  <Chip density="list" {tone}>{localize(statusKey)}</Chip>
{/snippet}

{#snippet timing()}
  <RunProgress {stages} {current} {progress} ariaLabel={localize(progressKey)} />
{/snippet}

<Specimen {...props} onOpen={open} badges={heading} {meta} aside={stages ? timing : undefined} />
