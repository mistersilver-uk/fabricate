<!-- Svelte 5 runes mode -->
<!--
  Progressive crafting check editor. A progressive check rolls a FORMULA for a numeric value and
  spends it against each result's difficulty in order, the award mode deciding how the spend
  stops. There is no DC, comparison or recipe tier — just the formula, the award mode and the
  unified `CheckTriggers` editor, whose outcome select is relabelled for this numeric context.
  Controlled: renders `value` (`{ awardMode, rollFormula, checkBreakage }`) and emits the next.
  The runtime refuses a summed roll-under progressive check, so that state carries a warning.
-->
<script>
  import { progressiveTargetRefusal } from '../../../../../systems/checkTarget.js';
  import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
  import Notice from '../../../components/Notice.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { targetRefusalSentence } from './checkTargetStatus.js';
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

  const refusal = $derived(progressiveTargetRefusal(normalizeCheckEvaluation(value?.evaluation)));

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
              'Resolves to a numeric value, not a pass or fail. Modifiers from the Modifiers tab are applied by the check; they never appear in the formula.'
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
          evaluation={value?.evaluation ?? null}
          underNote={!refusal}
          offerSituationalBonus={value?.offerSituationalBonus !== false}
          onChange={emit}
        />
      </div>
    </InspectorCard>
    {#if refusal}
      <Notice
        tone="warning"
        title={targetRefusalSentence(refusal, text)}
        dataAttr="data-check-progressive-refusal"
      />
    {/if}
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
