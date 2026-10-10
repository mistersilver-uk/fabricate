<!-- A gathering task, as `GatheringTaskRow` wires its row: the success chance beneath it. -->
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

  function open() {}
</script>

{#snippet chance()}
  <Kicker as="span">{localize(chanceLabelKey)}</Kicker>
  <BandedBar rows={[{ name: '', percent, fill }]} aria-label={format(chanceKey, { x: percent })} />
{/snippet}

<Specimen {...props} onOpen={open} {meta} aside={chance} />
