<!--
  A gathering task, as `GatheringTaskRow` wires its row: the success chance beneath it, `ChanceBar`'s
  composition inlined because `ChanceBar` is app-scoped.
-->
<script>
  import BandedBar from '../../../../src/ui/svelte/components/BandedBar.svelte';
  import Kicker from '../../../../src/ui/svelte/components/Kicker.svelte';
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    meta,
    chanceLabelKey,
    chanceKey,
    percent,
    fill,
  } = $props();

  const label = $derived(format(chanceKey, { x: percent }));

  function open() {}
</script>

{#snippet chance()}
  <Kicker as="span">{localize(chanceLabelKey)}</Kicker>
  <BandedBar rows={[{ name: '', percent, fill }]} aria-label={label} title={label} />
{/snippet}

<Specimen {...props} onOpen={open} {meta} aside={chance} />
