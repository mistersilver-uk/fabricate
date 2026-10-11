<!--
  An open slot's candidates, as `SlotRow` hands its list the stock `StepDetails` wires: held and
  claimed by candidate, and the heading and each reading in the Journal's own copy.
-->
<script>
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    held = {},
    claimed = {},
    readingKey,
    labelKey,
    summaryKey,
  } = $props();

  const heldCount = (id) => held[id] ?? 0;
  const claimedCount = (id) => claimed[id] ?? 0;
  const candidateReading = ({ held: count, needed, spare }) =>
    format(readingKey, { held: count, needed, spare });

  function choose() {}
</script>

<Specimen
  {...props}
  label={localize(labelKey)}
  summary={format(summaryKey, { count: props.options?.length ?? 0 })}
  held={heldCount}
  claimed={claimedCount}
  {candidateReading}
  onChoose={choose}
/>
