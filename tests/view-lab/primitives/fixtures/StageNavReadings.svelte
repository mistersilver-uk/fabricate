<!-- The run's stage pager, as `RunDetail` wires it: its computed labels are the Journal's own copy. -->
<script>
  import { format } from '../fixtureActs.js';

  let { component: Specimen, props = {}, stageKey, positionKey, returnKey } = $props();

  const stageLabel = (_stage, index) => format(stageKey, { index: index + 1 });
  const positionLabel = (index, count) => format(positionKey, { index: index + 1, count });
  const returnLabel = (index) => format(returnKey, { index: index + 1 });

  function view() {}
</script>

<Specimen {...props} {stageLabel} {positionLabel} {returnLabel} onView={view} />
