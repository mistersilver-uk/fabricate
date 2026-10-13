<!--
  An expression field's reading, as a check's character value wires it: the shipped resolver over
  the row's roll data, and the caller's own statement read from the row's `unresolvedKey`.
-->
<script>
  import { resolveCharacterValue } from '../../../../src/ui/svelte/apps/manager/checks/checkTargetStatus.js';
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, rollData, unresolvedKey } = $props();

  const resolve = (expression) => resolveCharacterValue(expression, rollData);

  function change() {}
</script>

<Specimen {...props} {resolve} unresolvedLabel={localize(unresolvedKey)} onChange={change} />
