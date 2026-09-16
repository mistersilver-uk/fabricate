<!-- Svelte 5 runes mode -->
<!--
  Shared progressive award-mode selector. Progressive resolution spends the check value against
  each result's difficulty in order, and the award mode decides how the spend stops: `equal`
  awards each result the value covers in full, `partial` also awards the first it cannot, and
  `exceed` requires the value to strictly clear each difficulty. Used by all three progressive
  check editors, so the vocabulary stays one.

  Controlled, through the shared `RadioCardGroup` primitive: renders `value` and emits the next.
-->
<script>
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';

  let { value = 'equal', name = 'progressive-award-mode', onChange = () => {} } = $props();

  // The icons are the comparison each mode makes against a result's difficulty.
  const OPTIONS = [
    {
      value: 'equal',
      icon: 'fas fa-equals',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardEqual',
      fallback: 'Equal',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardEqualDesc',
      descFallback: 'Award each result in order while the value covers its full difficulty.',
    },
    {
      value: 'partial',
      icon: 'fas fa-circle-half-stroke',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardPartial',
      fallback: 'Partial',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardPartialDesc',
      descFallback:
        "Like equal, but the first result the value can't fully cover is still awarded, then awarding stops.",
    },
    {
      value: 'exceed',
      icon: 'fas fa-greater-than',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardExceed',
      fallback: 'Exceed',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardExceedDesc',
      descFallback:
        'Award each result in order only while the value strictly exceeds its difficulty.',
    },
  ];

  const selected = $derived(['equal', 'partial', 'exceed'].includes(value) ? value : 'equal');

  function select(next) {
    if (next === selected) return;
    onChange(next);
  }
</script>

<RadioCardGroup
  legendKey="FABRICATE.Admin.Manager.Checks.Crafting.AwardModeTitle"
  legend="Award mode"
  options={OPTIONS}
  selectedValue={selected}
  groupName={name}
  columns={2}
  optionDataAttr="data-award-mode-option"
  onChange={select}
/>
