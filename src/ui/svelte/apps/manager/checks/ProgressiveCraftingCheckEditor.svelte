<!-- Svelte 5 runes mode -->
<!--
  Progressive crafting check editor (progressive resolution mode).

  A progressive check rolls a FORMULA for a numeric value. Progressive awarding
  spends that value against each result's difficulty, in order, until the value can
  no longer cover the next result; the award mode (equal / partial / exceed) decides
  exactly how the spend stops. There is no DC, comparison, or recipe tier — just the
  formula, the award mode, and the unified CheckTriggers editor. A matching trigger
  can force the award (its outcome select is relabelled Award all / Award none for
  this numeric context) and, under `checkDriven` authority, break tools.

  Controlled component: renders `value` and emits the next value via `onChange`.
  `value` carries `{ awardMode, rollFormula, checkBreakage }`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckAwardMode from './CheckAwardMode.svelte';
  import CheckTriggers from './CheckTriggers.svelte';

  // `section` (issue 1096) selects which of this editor's cards render, so the Checks
  // Studio's five-section strip can host the SAME editor rather than a per-section fork.
  // Empty renders every card, which is what the characterization suites and any caller
  // outside the studio still get.
  let {
    value = null,
    breakageAuthority = 'toolSpecific',
    section = '',
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
    <section class="manager-inspector-card manager-checks-card" data-roll-formula-card>
      <div class="manager-checks-card-head">
        <div>
          <h3 class="manager-checks-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}
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
        <CheckFormulaFields rollFormula={value?.rollFormula || ''} showDc={false} onChange={emit} />
      </div>
    </section>
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

  <!-- Award mode is a progressive check's OUTCOME model, and it is the only authoring
       control a progressive check has beyond the formula. That is why the studio renders
       Outcomes in every mode: hiding it here would remove this control from the UI
       entirely, which no test would have seen. -->
  {#if shows('outcomes')}
    <section class="manager-inspector-card manager-checks-card" data-award-mode>
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
    </section>
  {/if}
</div>
