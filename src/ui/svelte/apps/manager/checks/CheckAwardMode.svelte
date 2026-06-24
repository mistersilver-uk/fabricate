<!-- Svelte 5 runes mode -->
<!--
  Shared progressive award-mode selector. Progressive resolution spends the check
  value against each result's difficulty, in order; the award mode decides how the
  spend stops:
    - equal:   award each result while the value covers its full difficulty.
    - partial: like equal, but the first result the value can't fully cover is
               still awarded, then awarding stops.
    - exceed:  award each result only while the value strictly exceeds its difficulty.
  Consumed by ResolutionModeService's progressive branch. Used by the crafting,
  salvage, and gathering progressive check editors so the vocabulary stays one.

  Controlled: renders `value` (the award mode) and emits the next mode via onChange.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { value = 'equal', name = 'progressive-award-mode', onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const OPTIONS = [
    {
      value: 'equal',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardEqual',
      fallback: 'Equal',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardEqualDesc',
      descFallback: 'Award each result in order while the value covers its full difficulty.',
    },
    {
      value: 'partial',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardPartial',
      fallback: 'Partial',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardPartialDesc',
      descFallback:
        "Like equal, but the first result the value can't fully cover is still awarded, then awarding stops.",
    },
    {
      value: 'exceed',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardExceed',
      fallback: 'Exceed',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardExceedDesc',
      descFallback: 'Award each result in order only while the value strictly exceeds its difficulty.',
    },
  ];

  const selected = $derived(['equal', 'partial', 'exceed'].includes(value) ? value : 'equal');

  function select(next) {
    if (next === selected) return;
    onChange(next);
  }
</script>

<div
  class="manager-checks-type-options"
  role="radiogroup"
  aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.AwardModeTitle', 'Award mode')}
>
  {#each OPTIONS as option (option.value)}
    <label
      class={`manager-resolution-option ${selected === option.value ? 'is-active' : ''}`}
      data-award-mode-option={option.value}
    >
      <input
        type="radio"
        {name}
        value={option.value}
        checked={selected === option.value}
        onchange={() => select(option.value)}
      />
      <span class="manager-resolution-option-body">
        <span class="manager-resolution-option-name">{text(option.labelKey, option.fallback)}</span>
        <span class="manager-resolution-option-desc">{text(option.descKey, option.descFallback)}</span>
      </span>
    </label>
  {/each}
</div>
