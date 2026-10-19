<!--
  A gathering task, as `GatheringTaskRow` wires its row: the 56px thumb leading, its callouts as
  badges, and the success chance beneath it, `ChanceBar`'s composition inlined because `ChanceBar`
  is app-scoped. The thumb arrives as the row's `content`.
-->
<script>
  import BandedBar from '../../../../src/ui/svelte/components/BandedBar.svelte';
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import Kicker from '../../../../src/ui/svelte/components/Kicker.svelte';
  import { statusChipTone } from '../../../../src/ui/svelte/util/statusChipTone.js';
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    meta,
    children,
    chips = [],
    chanceLabelKey,
    chanceKey,
    percent,
    fill,
  } = $props();

  const label = $derived(format(chanceKey, { x: percent }));

  function open() {}
</script>

{#snippet thumb()}
  {@render children?.()}
{/snippet}

{#snippet badges()}
  {#each chips as chip, index (index)}
    <Chip density="list" tone={statusChipTone(chip.tone)} icon={chip.icon}>{chip.label}</Chip>
  {/each}
{/snippet}

{#snippet chance()}
  <Kicker as="span">{localize(chanceLabelKey)}</Kicker>
  <BandedBar rows={[{ name: '', percent, fill }]} aria-label={label} title={label} />
{/snippet}

<Specimen {...props} onOpen={open} leading={thumb} {badges} {meta} aside={chance} />
