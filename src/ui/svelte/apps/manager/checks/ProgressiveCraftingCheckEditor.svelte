<!-- Svelte 5 runes mode -->
<!--
  Progressive crafting check editor. A progressive check rolls a FORMULA for a numeric value and
  spends it against each result's difficulty in order, the award mode deciding how the spend
  stops. There is no DC, comparison or recipe tier — just the formula, the award mode and the
  unified `CheckTriggers` editor, whose outcome select is relabelled for this numeric context.
  Controlled: renders `value` (`{ awardMode, rollFormula, checkBreakage }`) and emits the next.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckAwardMode from './CheckAwardMode.svelte';
  import CheckTriggers from './CheckTriggers.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';

  // `section` selects which cards render, so the studio's five-section strip hosts the SAME
  // editor rather than a per-section fork; empty renders every card.
  let {
    value = null,
    breakageAuthority = 'toolSpecific',
    section = '',
    foundrySystemId = '',
    // The resolved applied-modifier set and its rule, for the formula card's inset.
    appliedModifiers = [],
    modifierPolicy = 'addAll',
    recordNoun = 'recipe',
    onChange = () => {},
  } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');
  const shows = (id) => !section || section === id;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function emit(patch) {
    onChange({ ...value, ...patch });
  }
</script>

<div class="manager-checks-editor" data-progressive-check-editor>
  {#if shows('roll')}
    <InspectorCard class="manager-checks-card" data-roll-formula-card="">
      <div class="manager-checks-card-head">
        <div>
          <h3 class="manager-checks-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Formula')}
          </h3>
          <p class="manager-checks-card-description">
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ProgressiveLead',
              'Roll a formula for a numeric value. Results are awarded in order, each spending its difficulty from the value, until the value can no longer cover the next. Per-die crits force award-all or award-none.'
            )}
          </p>
        </div>
      </div>
      <div class="manager-checks-card-body">
        <CheckFormulaFields
          rollFormula={value?.rollFormula || ''}
          {appliedModifiers}
          {modifierPolicy}
          {recordNoun}
          {foundrySystemId}
          onChange={emit}
        />
      </div>
    </InspectorCard>
  {/if}

  {#if shows('triggers')}
    <CheckTriggers
      value={value?.checkBreakage || null}
      rollFormula={value?.rollFormula || ''}
      kind="progressive"
      showBreakTools={checkDriven}
      onChange={(checkBreakage) => emit({ checkBreakage })}
    />
  {/if}

  <!-- Award mode is a progressive check's OUTCOME model and the only authoring control it has
       beyond the formula, which is why the studio renders Outcomes in every mode: hiding it
       here would remove this control from the UI entirely. -->
  {#if shows('outcomes')}
    <InspectorCard class="manager-checks-card" data-award-mode="">
      <div class="manager-checks-card-head">
        <h3 class="manager-checks-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.AwardModeTitle', 'Award mode')}
        </h3>
      </div>
      <div class="manager-checks-card-body">
        <CheckAwardMode
          value={value?.awardMode || 'equal'}
          name="crafting-progressive-award-mode"
          onChange={(awardMode) => emit({ awardMode })}
        />
      </div>
    </InspectorCard>
  {/if}
</div>
