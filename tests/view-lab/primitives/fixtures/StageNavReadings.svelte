<!-- The run's stage pager, as `RunDetail` wires it: every name and reading is the Journal's own copy. -->
<script>
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    openKey,
    previousKey,
    nextKey,
    positionKey,
    returnKey,
  } = $props();

  const stageLabel = (stage, index) =>
    format(openKey, { index: index + 1, name: stage?.stepName ?? '' });
  const positionLabel = (index, count) => format(positionKey, { index: index + 1, count });
  const returnLabel = (index) => format(returnKey, { index: index + 1 });

  function view() {}
</script>

<Specimen
  {...props}
  {stageLabel}
  previousLabel={localize(previousKey)}
  nextLabel={localize(nextKey)}
  {positionLabel}
  {returnLabel}
  onView={view}
/>
