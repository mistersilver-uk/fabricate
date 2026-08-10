<!-- Svelte 5 runes mode -->
<!--
  The essence editor's VALIDATION tab (issue 1036).

  It renders the shared `EditorValidationSurface`, exactly as the Tool Studio and the Recipe
  Studio do; the check SET, its order and its severities come from the pure
  `essenceValidation.js`, and the mapping onto copy from `essenceStudio.js`. Nothing about
  which checks exist is decided here.

  ── AN ESSENCE ALWAYS SAVES ───────────────────────────────────────────────────────
  Unlike a Tool, a blocking issue here does not stop the save and does NOT disable the
  essence's own Enabled toggle: the prototype's subtitle asserts a gate this change does not
  implement, and that copy is dropped. The tab is a readout of what is unfinished, which is
  why `Blocking` is worded as an issue count rather than as a refusal.

  ── UNSET COLOUR IS A PASS ────────────────────────────────────────────────────────
  An essence with no colour renders in the theme accent BY DESIGN, so the colour row is
  informational and always passes; its detail line says which of the two states it is.
-->
<script>
  import EditorValidationSurface from '../EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { essenceValidationPresentation } from './essenceStudio.js';

  let { essence = null, context = {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const presentation = $derived(essenceValidationPresentation(essence, context, text));
  const counts = $derived(presentation.counts);
  const summary = $derived(summaryFor(counts));

  function summaryFor(current) {
    if (current.blocking > 0) {
      return {
        status: 'block',
        icon: 'fas fa-circle-exclamation',
        title: text('FABRICATE.Admin.Manager.Essence.Validation.NeedsAttention', 'Needs attention'),
        sub: text(
          'FABRICATE.Admin.Manager.Essence.Validation.BlockingSub',
          'This essence is missing something every surface that renders it needs.'
        ),
      };
    }
    if (current.warnings > 0) {
      return {
        status: 'warn',
        icon: 'fas fa-triangle-exclamation',
        title: text('FABRICATE.Admin.Manager.Essence.Validation.Warnings', 'Worth a look'),
        sub: text(
          'FABRICATE.Admin.Manager.Essence.Validation.WarningsSub',
          'Nothing here stops this essence working, but each one degrades it somewhere.'
        ),
      };
    }
    return {
      status: 'pass',
      icon: 'fas fa-circle-check',
      title: text('FABRICATE.Admin.Manager.Recipe.Validation.SummaryAllClear', 'All clear'),
      sub: text(
        'FABRICATE.Admin.Manager.Essence.Validation.AllClearSub',
        'Every structural check passes.'
      ),
    };
  }
</script>

<div class="manager-essence-tab-stack" data-essence-tab-panel="validation">
  <EditorValidationSurface
    title={text('FABRICATE.Admin.Manager.Essence.Tabs.Validation', 'Validation')}
    intro={text(
      'FABRICATE.Admin.Manager.Essence.Validation.Intro',
      'An essence always saves. These checks report what is unfinished.'
    )}
    {summary}
    {counts}
    countLabels={{
      passing: text('FABRICATE.Admin.Manager.Recipe.Validation.CountPassing', 'Passing'),
      warnings: text('FABRICATE.Admin.Manager.Recipe.Validation.CountWarnings', 'Warnings'),
      blocking: text('FABRICATE.Admin.Manager.Recipe.Validation.CountBlocking', 'Blocking'),
    }}
    groups={presentation.groups}
    rowDataAttr="data-essence-validation-check"
    statusLabels={{
      pass: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusPass', 'PASS'),
      warn: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusWarn', 'WARNING'),
      block: text('FABRICATE.Admin.Manager.Essence.Validation.StatusBlock', 'INCOMPLETE'),
    }}
  />
</div>

<style>
  .manager-essence-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }
</style>
