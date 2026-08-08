<!-- Svelte 5 runes mode -->
<!--
  The count that appears under a gathering rule row when its selection mode is `limitedDrops`:
  how many successful drops are granted, or how many triggered events are applied.

  Extracted in issue 1050 because those two are ONE control written twice in
  `CraftingSystemManagerRoot` — same `.manager-rule-stepper` wrapper, same `fill` Stepper, same
  `min={1}`, same one-key patch — differing only in which rules field they read and write and in
  which four authored strings name them. Migrating them onto `Stepper` turned two copies of a
  hand-rolled −/+ pair into two near-identical 19-line call sites, which is the shape the repo's
  one-implementation-per-meaning rule forbids and SonarCloud's new-code duplication gate measures.

  `rule` is the rules field itself (`rewardLimit` / `eventLimit`), so it is both the value's key
  and the `data-*` marker the manager contract and the mounted suite resolve against. A third
  limited rule is one entry in the table below plus one call site.

  Authored per-limit strings rather than the parametrized `FABRICATE.Common.Stepper.*` pair the
  rest of the migration uses: these two already ship four keys of their own, and re-pointing them
  at the shared pair would orphan those keys. They stay literals so the lang-key scans still see
  them in source.

  The wrapper's placement — `padding-left` under the description column and the 160px cap that
  keeps a filled stepper from resolving `width: 100%` against the whole rules stack — lives in the
  global sheet on `.manager-rule-stepper`, so moving the markup here leaves the layout untouched.
-->
<script>
  import Stepper from '../../../components/Stepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    /** The gathering-rules field this limit reads and writes: `rewardLimit` or `eventLimit`. */
    rule,
    /** Its current value. */
    value = null,
    /** Called with the next count for the owning view to persist. */
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const STRINGS = {
    rewardLimit: {
      label: ['FABRICATE.Admin.Manager.Environment.Rules.RewardLimit', 'Reward limit'],
      decrement: [
        'FABRICATE.Admin.Manager.Environment.Rules.DecreaseRewardLimit',
        'Decrease reward limit',
      ],
      increment: [
        'FABRICATE.Admin.Manager.Environment.Rules.IncreaseRewardLimit',
        'Increase reward limit',
      ],
    },
    eventLimit: {
      label: ['FABRICATE.Admin.Manager.Environment.Rules.EventLimit', 'Event limit'],
      decrement: [
        'FABRICATE.Admin.Manager.Environment.Rules.DecreaseEventLimit',
        'Decrease event limit',
      ],
      increment: [
        'FABRICATE.Admin.Manager.Environment.Rules.IncreaseEventLimit',
        'Increase event limit',
      ],
    },
  };

  const strings = $derived(STRINGS[rule]);
</script>

<div class="manager-rule-stepper" data-gathering-rule-stepper={rule}>
  <Stepper
    fill
    {value}
    min={1}
    ariaLabel={text(...strings.label)}
    decrementLabel={text(...strings.decrement)}
    incrementLabel={text(...strings.increment)}
    {onChange}
  />
</div>
