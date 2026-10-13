<!--
  An expression field's reading, as a check's character value wires it: the shipped resolver over
  the row's roll data, and the caller's own statement read from the row's `unresolvedKey`. It stands
  in `Field`'s column, which draws the box and states the gap the field leaves to its host.
-->
<script>
  import { resolveCharacterValue } from '../../../../src/ui/svelte/apps/manager/checks/checkTargetStatus.js';
  import Field from '../../../../src/ui/svelte/components/Field.svelte';
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, rollData, unresolvedKey } = $props();

  const resolve = (expression) => resolveCharacterValue(expression, rollData);

  function change() {}
</script>

<Field as="div">
  <Specimen {...props} {resolve} unresolvedLabel={localize(unresolvedKey)} onChange={change} />
</Field>
