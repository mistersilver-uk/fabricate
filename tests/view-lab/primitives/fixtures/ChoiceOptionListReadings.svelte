<!--
  An open slot's candidates, as `SlotRow` hands its list the stock `StepDetails` wires: held and
  claimed by candidate, and each reading in the Journal's own copy.
-->
<script>
  import { format } from '../fixtureActs.js';

  let { component: Specimen, props = {}, held = {}, claimed = {}, readingKey } = $props();

  const heldCount = (id) => held[id] ?? 0;
  const claimedCount = (id) => claimed[id] ?? 0;
  const candidateReading = ({ held: count, needed, spare }) =>
    format(readingKey, { held: count, needed, spare });

  function choose() {}
</script>

<Specimen {...props} held={heldCount} claimed={claimedCount} {candidateReading} onChoose={choose} />
