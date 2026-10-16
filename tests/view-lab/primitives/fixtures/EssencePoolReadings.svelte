<!--
  An open stage's essence allocation, as `StepDetails` wires its pool. Each carrier's reading is the
  row's own string, because the caller assembles it with punctuation a fixture may not author.
-->
<script>
  import { format } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    names = {},
    readings = {},
    yields = {},
    held = {},
    meterKey,
    allocateKey,
    decreaseKey,
    increaseKey,
    overshootKey,
  } = $props();

  const contribution = (sourceId, essence) => yields[sourceId]?.[essence] ?? 0;
  const holding = (sourceId) => held[sourceId] ?? 0;
  const spare = (sourceId) => Math.max(0, holding(sourceId) - (props.allocation?.[sourceId] ?? 0));
  const essenceLabel = (essence) => names[essence] ?? essence;
  const sourceReading = (source) => readings[source.id];
  const overshootLabel = (essence, amount) => format(overshootKey, { essence, amount });
  const meterValueLabel = (delivered, need) => format(meterKey, { delivered, need });
  const allocationLabel = (source) => format(allocateKey, { name: source.label });
  const decrementLabel = (source) => format(decreaseKey, { name: source.label });
  const incrementLabel = (source) => format(increaseKey, { name: source.label });

  function step() {}
</script>

<Specimen
  {...props}
  yield={contribution}
  {spare}
  held={holding}
  {essenceLabel}
  {sourceReading}
  {overshootLabel}
  {meterValueLabel}
  {allocationLabel}
  {decrementLabel}
  {incrementLabel}
  onStep={step}
/>
