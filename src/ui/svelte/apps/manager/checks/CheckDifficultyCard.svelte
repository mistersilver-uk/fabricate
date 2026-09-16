<!-- Svelte 5 runes mode -->
<!--
  DIFFICULTY — the number the roll is measured against, and where it comes from. ITS OWN CARD
  because the formula card answers "what is rolled" and this answers "what is it measured
  against"; the second question inside the first card reads as part of the formula.

  `showDcSource` IS A MODEL FACT, NOT A PREFERENCE: the static/dynamic chooser writes `dcMode`
  and `macroUuid`, and only the SIMPLE check slot carries those fields, so a routed check gets
  the same card with `BASE DC` and `COMPARISON` alone rather than a chooser that cannot choose.
  The record noun is a PROP, hard-coding one activity's word being how a gathering screen comes
  to talk about recipes.

  Props: dc / thresholdMode, the authored values; dcMode / showDcSource, the chooser;
  recordNoun; onChange(patch), merged by the parent into the whole check.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { interpolate } from './checksCopy.js';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    dc = 15,
    thresholdMode = 'meet',
    dcMode = 'static',
    showDcSource = false,
    recordNoun = 'recipe',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * A sentence with `{record}` filled in, resolved BEFORE it reaches `RadioCardGroup`: that
   * primitive takes no interpolation data, so a placeholder handed to it as a KEY renders the
   * literal braces in every world that HAS the key — the fallback path looking right and the
   * localized path not.
   */
  function sentence(key, fallback) {
    return interpolate(text(key, fallback), { record: recordNoun });
  }

  const comparison = $derived(thresholdMode === 'exceed' ? 'exceed' : 'meet');
  const resolvedDcMode = $derived(dcMode === 'dynamic' ? 'dynamic' : 'static');

  // The two icons are literally what the DC is: an authored number, or a script FILE that
  // returns one — the thing dropped on the card below being a Macro document.
  const DC_MODE_OPTIONS = $derived([
    {
      value: 'static',
      icon: 'fas fa-hashtag',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcStatic',
      fallback: 'Static',
      description: sentence(
        'FABRICATE.Admin.Manager.Checks.Crafting.DcStaticDesc',
        'A fixed DC for every {record}, with optional named difficulty tiers.'
      ),
    },
    {
      value: 'dynamic',
      icon: 'fas fa-file-code',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamic',
      fallback: 'Dynamic',
      description: sentence(
        'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamicDesc',
        'A macro computes the DC from the ingredients, the {record} and the actor.'
      ),
    },
  ]);

  const dcLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.BaseDc', 'Base DC'));

  const COMPARISON_OPTIONS = [
    {
      value: 'meet',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ThresholdMeet',
      fallback: 'Meet or exceed',
    },
    {
      value: 'exceed',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ThresholdExceed',
      fallback: 'Strictly exceed',
    },
  ];
</script>

<InspectorCard class="manager-checks-card" data-check-difficulty-card="">
  <div class="manager-checks-card-head">
    <div>
      <h3 class="manager-checks-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.DifficultyTitle', 'Difficulty')}
      </h3>
      <p class="manager-checks-card-description">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.DifficultyLead',
          'The number the roll is measured against, and where that number comes from.'
        )}
      </p>
    </div>
  </div>
  <div class="manager-checks-card-body">
    {#if showDcSource}
      <RadioCardGroup
        legendKey="FABRICATE.Admin.Manager.Checks.Crafting.DcTitle"
        legend="DC source"
        options={DC_MODE_OPTIONS}
        selectedValue={resolvedDcMode}
        groupName="check-dc-mode"
        columns={2}
        optionDataAttr="data-dc-mode-option"
        onChange={(next) => {
          if (next !== resolvedDcMode) onChange({ dcMode: next });
        }}
      />
    {/if}

    <!-- The two number fields under the chooser. `<div>`s rather than `<label>`s: see the NAMING
         contract in `Stepper.svelte` — both controls carry their own accessible name, and a
         wrapping label would give the stepper two. -->
    <div class="manager-checks-difficulty-fields">
      <div class="manager-checks-difficulty-field is-dc">
        <span class="manager-checks-difficulty-label">{dcLabel}</span>
        <!-- `fill` so the stepper takes the field's track and the shared height rather than sitting
             in it as a narrower inline island. `min={0}`: a check DC below zero is not a DC, and the
             live `−` adjunct would otherwise reach -1. -->
        <Stepper
          fill
          min={0}
          value={dc ?? 15}
          {...stepperLabels(dcLabel)}
          inputProps={{ 'data-check-dc': '' }}
          onChange={(next) => onChange({ dc: next })}
        />
      </div>
      <div class="manager-checks-difficulty-field is-comparison">
        <span class="manager-checks-difficulty-label">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison', 'Comparison')}
        </span>
        <!-- A SEGMENTED CONTROL rather than a `<select>`: two options is not a list to open, both
             readings are on screen at once, and the one in force is lit. -->
        <SegmentedControl
          fill
          density="field"
          options={COMPARISON_OPTIONS}
          value={comparison}
          groupName="check-threshold-mode"
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison',
            'Comparison'
          )}
          dataAttr="data-threshold-mode"
          optionDataAttr="data-threshold-mode-option"
          onChange={(next) => onChange({ thresholdMode: next })}
        />
      </div>
    </div>
  </div>
</InspectorCard>
