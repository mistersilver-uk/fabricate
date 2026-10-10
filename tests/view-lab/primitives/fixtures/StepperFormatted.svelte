<!--
  A formatted stepper's call site, as the check tiers wire it: the shipped multiplier helpers. It serves
  only the multiplier kind, because it always passes `MULTIPLIER_STOPS`.
-->
<script>
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from '../../../../src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js';

  let { component: Specimen, props = {}, kind } = $props();

  const formatValue = (value) => formatCheckAdjustment(kind, value);
  const parseValue = (value) => parseCheckAdjustment(kind, value);

  function change() {}
</script>

<Specimen {...props} {formatValue} {parseValue} stops={MULTIPLIER_STOPS} onChange={change} />
