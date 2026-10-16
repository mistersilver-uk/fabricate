<!--
  A stage's requirement row, as `StepDetails` wires its `SlotRow`: held and claimed stock by
  component, each tile named by its slot, and the heading and open list in the Journal's own copy.
-->
<script>
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    held = {},
    claimed = {},
    readingKey,
    chooseKey,
    choicesKey,
    labelKey,
    hintKey,
  } = $props();

  const heldCount = (componentId) => held[componentId] ?? 0;
  const claimedCount = (componentId) => claimed[componentId] ?? 0;
  const slotLabel = (slot) => slot.label;
  const candidateSummary = (count) => format(choicesKey, { count });
  const candidateReading = ({ held: count, needed, spare }) =>
    format(readingKey, { held: count, needed, spare });

  function choose() {}
</script>

<Specimen
  {...props}
  label={localize(labelKey)}
  hint={localize(hintKey)}
  held={heldCount}
  claimed={claimedCount}
  onChoose={choose}
  {slotLabel}
  choiceLabel={localize(chooseKey)}
  {candidateSummary}
  {candidateReading}
/>
