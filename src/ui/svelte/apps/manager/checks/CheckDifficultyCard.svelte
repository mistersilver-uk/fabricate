<!-- Svelte 5 runes mode -->
<!--
  DIFFICULTY — the number the roll is measured against, and where it comes from (issue 1096).

  ## Why it is its own card

  The DC and the meet/exceed comparison used to sit INSIDE the roll-formula card, beside the
  formula input, and the DC SOURCE chooser was a third card below it. The prototype puts all
  three in one card called `Difficulty`, and the reason is not tidiness: the formula card
  answers "what is rolled" and this one answers "what is it measured against". A control that
  answers the second question inside the card that answers the first reads as part of the
  formula, which is exactly how a GM comes to think the DC is a term in it.

  ## `showDcSource` is a MODEL fact, not a preference

  The static/dynamic chooser writes `dcMode` (and, dynamically, `macroUuid`), and only the
  SIMPLE check slot carries those fields — `CraftingSystemManager` normalizes them on
  `simple`, `CraftingEngine` runs the macro for `simple.dcMode === 'dynamic'`, and the routed
  slot has neither (see the note on `migrateMoveRoutedByIngredientsCheck`: "routed has none").

  So the chooser renders where the model can honour it, and a routed check gets the same card
  with `BASE DC` and `COMPARISON` alone. Rendering the pair on a routed check would put a
  control on screen that writes a field nothing reads — a chooser that does not choose.

  ## The record noun is parameterised

  "A fixed DC for every {record}" is `recipe` on the crafting route and something else on
  salvage and gathering, so the noun is a prop. Hard-coding one activity's word is how a
  gathering screen comes to talk about recipes.

  Props:
   - dc / thresholdMode: the authored values.
   - dcMode / showDcSource: the DC-source chooser, when the slot carries one.
   - recordNoun: the activity's word for the thing a check is rolled for.
   - onChange(patch): partial patch, merged by the parent into the whole check.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { interpolate } from './checksCopy.js';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
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
   * A sentence with `{record}` filled in, resolved BEFORE it reaches `RadioCardGroup`.
   *
   * That primitive resolves a key against `localize` and takes no interpolation data, so a
   * `{record}` placeholder handed to it as a KEY would render the literal braces to a GM in
   * every world that has the key — the fallback path would look right and the localized path
   * would not. Resolving here and passing the finished sentence as `description` keeps one
   * string, localized, with the noun in it.
   */
  function sentence(key, fallback) {
    return interpolate(text(key, fallback), { record: recordNoun });
  }

  const comparison = $derived(thresholdMode === 'exceed' ? 'exceed' : 'meet');
  const resolvedDcMode = $derived(dcMode === 'dynamic' ? 'dynamic' : 'static');

  // The two icons are literally what the DC is: an authored number, or a script file that
  // returns one. `fa-file-code` rather than the bare `fa-code` this replaces, because the
  // thing dropped on the card below is a Macro DOCUMENT and the prototype draws a file.
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

<section class="manager-inspector-card manager-checks-card" data-check-difficulty-card>
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

    <!-- The two number fields the prototype draws under the chooser. `<div>`s rather than
         `<label>`s: see the NAMING contract in `Stepper.svelte` — both controls carry their
         own accessible name, and a wrapping label would give the stepper two. -->
    <div class="manager-checks-difficulty-fields">
      <div class="manager-checks-difficulty-field is-dc">
        <span class="manager-checks-difficulty-label">{dcLabel}</span>
        <!-- `fill` so the stepper takes the field's 118px track and the shared 36px height
             rather than sitting in it as a narrower inline island. `min={0}`: a check DC
             below zero is not a DC, and the live `−` adjunct would otherwise reach -1. -->
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
        <!-- A SEGMENTED CONTROL, not the `<select>` this replaces. Two options is not a
             list to open: both readings are on screen at once, and the one in force is lit.
             `density="field"` is the primitive's own field-scale track. -->
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
</section>
