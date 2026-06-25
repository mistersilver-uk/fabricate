<!-- Svelte 5 runes mode -->
<!--
  Progressive crafting check editor (progressive resolution mode).

  A progressive check rolls a FORMULA for a numeric value. Progressive awarding
  spends that value against each result's difficulty, in order, until the value can
  no longer cover the next result; the award mode (equal / partial / exceed) decides
  exactly how the spend stops. There is no DC, comparison, or recipe tier — just the
  formula, the award mode, and the per-die critical-rolls table. A matched crit
  forces the award: a SUCCESS crit awards everything, a FAILURE crit awards nothing,
  and either may break tools. The formula field and crit table are shared with the
  simple/routed editors (the formula field hides the DC via `showDc={false}`, and the
  crit pills are relabelled award-all/award-none for this numeric context).

  Controlled component: renders `value` and emits the next value via `onChange`.
  `value` carries `{ awardMode, allowPlayerReorder, rollFormula, diceCrits }`;
  `allowPlayerReorder` is preserved across edits.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckDiceCrits from './CheckDiceCrits.svelte';
  import CheckAwardMode from './CheckAwardMode.svelte';
  import CheckBreakage from './CheckBreakage.svelte';

  let { value = null, breakageAuthority = 'toolSpecific', onChange = () => {} } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const awardAllLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.AwardAll', 'Award all'));
  const awardNoneLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.AwardNone', 'Award none')
  );

  function emit(patch) {
    onChange({ ...value, ...patch });
  }
</script>

<div class="manager-checks-editor" data-progressive-check-editor>
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}</h3>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ProgressiveLead',
        'Roll a formula for a numeric value. Results are awarded in order, each spending its difficulty from the value, until the value can no longer cover the next. Per-die crits force award-all or award-none.'
      )}
    </p>
    <CheckFormulaFields
      rollFormula={value?.rollFormula || ''}
      showDc={false}
      onChange={emit}
    />
    <CheckDiceCrits
      rollFormula={value?.rollFormula || ''}
      diceCrits={value?.diceCrits || []}
      forceOnLabel={awardAllLabel}
      forceOffLabel={awardNoneLabel}
      showBreakTools={!checkDriven}
      onChange={(diceCrits) => emit({ diceCrits })}
    />
  </section>

  {#if checkDriven}
    <CheckBreakage
      value={value?.checkBreakage || null}
      rollFormula={value?.rollFormula || ''}
      kind="progressive"
      onChange={(checkBreakage) => emit({ checkBreakage })}
    />
  {/if}

  <section class="manager-inspector-card" data-award-mode>
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.AwardModeTitle', 'Award mode')}</h3>
    <CheckAwardMode
      value={value?.awardMode || 'equal'}
      name="crafting-progressive-award-mode"
      onChange={(awardMode) => emit({ awardMode })}
    />
  </section>
</div>
