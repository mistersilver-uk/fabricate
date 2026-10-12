<!--
  A check trigger, collapsed, as `CheckTriggers` wires its rule: the effect's glyph, tone and chip
  head it, the condition titles it, and its sentence leads it.
-->
<script>
  import { localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    icon,
    tone,
    title,
    chip,
    sentence,
    removeLabel,
    expandKey,
  } = $props();

  const schema = $derived({
    head: () => ({ glyph: icon, tone, title, chip }),
    sentence: () => sentence,
    labels: { remove: removeLabel, expand: localize(expandKey) },
  });

  const collapsible = { open: false, onToggle: toggle };

  function toggle() {}

  function change() {}
</script>

<Specimen {...props} {schema} {collapsible} onChange={change} />
