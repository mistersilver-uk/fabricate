<!--
  An amount slot under `formula`, as a counter's start wires it: the shipped resolver over no roll
  data, the caller's statement read from the row's `unresolvedKey`, and the example and hint the row
  carries. It stands alone, because the slot draws its own wrapping root.
-->
<script>
  import { resolveCharacterValue } from '../../../../src/ui/svelte/apps/manager/checks/checkTargetStatus.js';
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, unresolvedKey, hint } = $props();

  const resolve = (expression) => resolveCharacterValue(expression, {});

  function change() {}
</script>

<Specimen
  {...props}
  formula={{ resolve, unresolvedLabel: localize(unresolvedKey), hint }}
  onChange={change}
/>
