<!--
  An essence requirement's open slot: the chooser's tile row, and beneath it the stage's essence
  pool as its `panel`, wired as crafting's `EssencePoolPanel` wires its pool. Each carrier's reading
  is the row's.
-->
<script>
  import EssencePool from '../../../../src/ui/svelte/components/EssencePool.svelte';
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    thresholds = [],
    allocation = {},
    readings = {},
    yields = {},
    held = {},
    labelKey,
    hintKey,
    meterKey,
    allocateKey,
    decreaseKey,
    increaseKey,
    overshootKey,
  } = $props();

  const contribution = (sourceId, essence) => yields[sourceId]?.[essence] ?? 0;
  const holding = (sourceId) => held[sourceId] ?? 0;
  const spare = (sourceId) => Math.max(0, holding(sourceId) - (allocation[sourceId] ?? 0));
  const sourceReading = (source) => readings[source.id];
  const overshootLabel = (essence, amount) => format(overshootKey, { essence, amount });
  const meterValueLabel = (delivered, need) => format(meterKey, { delivered, need });
  const allocationLabel = (source) => format(allocateKey, { name: source.label });
  const decrementLabel = (source) => format(decreaseKey, { name: source.label });
  const incrementLabel = (source) => format(increaseKey, { name: source.label });

  function step() {}

  function ignore() {}
</script>

{#snippet panel()}
  <EssencePool
    {thresholds}
    {allocation}
    capAtHeld
    yield={contribution}
    {spare}
    held={holding}
    {sourceReading}
    {overshootLabel}
    {meterValueLabel}
    {allocationLabel}
    {decrementLabel}
    {incrementLabel}
    label={localize(labelKey)}
    hint={localize(hintKey)}
    onStep={step}
  />
{/snippet}

<Specimen {...props} {panel} onToggle={ignore} onChoose={ignore} />
