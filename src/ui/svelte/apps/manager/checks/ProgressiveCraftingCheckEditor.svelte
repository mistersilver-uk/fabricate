<!-- Svelte 5 runes mode -->
<!--
  Progressive crafting check editor (progressive resolution mode).

  A progressive check rolls a FORMULA whose total is a numeric value: the
  progressive result-awarding spends it against each result's difficulty, awarding
  every result the total can afford. There is no DC, comparison, or recipe tier —
  just the formula and the per-die critical-rolls table. A matched crit forces the
  award: a SUCCESS crit awards everything, a FAILURE crit awards nothing, and
  either may break tools. The formula field and crit table are shared with the
  simple/routed editors (the formula field hides the DC via `showDc={false}`).

  Controlled component: renders `value` and emits the next value via `onChange`.
  `value` also carries the `awardMode`/`allowPlayerReorder` award settings, which
  are preserved across edits.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckDiceCrits from './CheckDiceCrits.svelte';

  let { value = null, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

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
        'Roll a formula; every result whose difficulty the total can afford is awarded. Per-die crits force award-all or award-none.'
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
      onChange={(diceCrits) => emit({ diceCrits })}
    />
  </section>
</div>
