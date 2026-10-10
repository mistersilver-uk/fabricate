<!--
  A gathering run's rarity scale: before the roll as `RunDetail` words each threshold, after it as
  `HistoricalRunDetail` records it. Each recorded reading and chance is the row's own string,
  because those callers assemble them with punctuation a fixture may not author.
-->
<script>
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    chances = {},
    readings = null,
    quantityKey,
    thresholdKey = '',
    rolledKey = '',
    cutKey = '',
  } = $props();

  const labels = $derived({
    ...(thresholdKey && {
      threshold: (entry) =>
        format(thresholdKey, { chance: entry.chance, threshold: 101 - entry.chance }),
    }),
    ...(readings && { evidence: (entry) => readings[entry.id] }),
    quantity: (entry) => format(quantityKey, { n: entry.qty }),
    chance: (entry) => chances[entry.id],
    ...(rolledKey && { cut: (roll) => format(rolledKey, { roll }) }),
    ...(cutKey && { cutNote: () => localize(cutKey) }),
  });
</script>

<Specimen {...props} {labels} />
