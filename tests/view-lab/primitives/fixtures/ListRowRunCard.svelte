<!--
  The Journal's Active run, as `RunCard` wires its row: the bolt and the status chip, and the stage
  bars and world-time countdown of its `timing` snippet beneath, the countdown the row's `aside`.
-->
<script>
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import RunProgress from '../../../../src/ui/svelte/components/RunProgress.svelte';
  import { localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    meta,
    children,
    aside,
    statusKey,
    statusIcon = '',
    tone,
    stages = null,
    current = 0,
    progress = 0,
    progressKey = '',
  } = $props();

  function open() {}
</script>

{#snippet heading()}
  {@render children?.()}
  <Chip density="list" {tone} icon={statusIcon}>{localize(statusKey)}</Chip>
{/snippet}

{#snippet timing()}
  <RunProgress {stages} {current} {progress} ariaLabel={localize(progressKey)} />
  {@render aside?.()}
{/snippet}

<Specimen {...props} onOpen={open} badges={heading} {meta} aside={stages ? timing : undefined} />
