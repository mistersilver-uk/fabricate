<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolEditorChecks, toolValidationPresentation } from './toolStudio.js';

  let { tool = null, authority = 'toolSpecific', validation = { valid: false, errors: [] }, saveError = '', focusValidationNonce = 0 } = $props();
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function validationErrorText(error) {
    const presentation = toolValidationPresentation(error);
    const key = `FABRICATE.Admin.Manager.Tools.Editor.${presentation.key}`;
    const template = localize(key);
    if (template && template !== key) return localize(key, presentation.data);
    if (presentation.key === 'ValidationErrorRepair') {
      return `Repair group ${presentation.data.group} is incomplete.`;
    }
    return validationFallbacks[presentation.key] || validationFallbacks.ValidationErrorGeneric;
  }
  const labels = {
    source: 'A game-world Item is linked',
    breakage: 'Breakage roll has an expression',
    onBreak: 'Replacement item is set',
    requirements: 'At least one prerequisite is selected',
    repair: 'Bonus expression is set',
  };
  const validationFallbacks = {
    ValidationErrorSource: 'Link an Item or managed Component.',
    ValidationErrorRequirement: 'Enter a Tool requirement formula.',
    ValidationErrorMaxUses: 'Maximum uses must be blank or a positive whole number.',
    ValidationErrorChance: 'Break chance must be between 0% and 100%.',
    ValidationErrorFormula: 'Enter a breakage dice formula.',
    ValidationErrorThreshold: 'Enter a valid breakage threshold.',
    ValidationErrorBreakageMode: 'Choose a valid breakage mode.',
    ValidationErrorOnBreakMode: 'Choose a valid on-break action.',
    ValidationErrorReplacement: 'Choose a replacement target.',
    ValidationErrorReplacementSame: 'Choose a replacement that differs from this Tool.',
    ValidationErrorPrerequisites: 'Choose at least one prerequisite or turn prerequisites off.',
    ValidationErrorBonus: 'Enter a bonus expression or turn the bonus off.',
    ValidationErrorGeneric: 'Some Tool settings are incomplete.',
  };
  const checks = $derived(toolEditorChecks(tool, authority));
  const invalidCount = $derived(checks.filter((check) => !check.valid).length + (validation.errors?.length || 0));
  const issueCountLabel = $derived(
    text('FABRICATE.Admin.Manager.Tools.ValidationIssues', '{count} issues').replace(
      '{count}',
      String(invalidCount)
    )
  );
  function focusFirstFailure(node, enabled) {
    if (enabled) queueMicrotask(() => node.focus());
  }
</script>

<div class="manager-tool-tab-stack" data-tool-validation-tab>
  <section class="manager-tool-validation">
    <div class="manager-tool-validation-heading manager-tool-validation-summary" data-tool-validation-heading>
      <h3><i class="fas fa-clipboard-check" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.Validation', 'Validation')}</h3>
    </div>
    <span class={`manager-chip manager-tool-validation-chip ${invalidCount > 0 ? 'is-danger' : 'is-positive'}`} aria-label={invalidCount > 0 ? issueCountLabel : undefined}><i class={invalidCount > 0 ? 'fas fa-circle-exclamation' : 'fas fa-circle-check'} aria-hidden="true"></i>{invalidCount > 0 ? issueCountLabel : text('FABRICATE.Admin.Manager.Tools.Editor.AllValid', 'All checks pass')}</span>
    <ul class="manager-tool-validation-checks" aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.ValidationChecks', 'Tool validation checks')}>
      {#each checks as check (check.id)}
        <li class:is-invalid={!check.valid} data-tool-validation-check={check.id}>
          <i class={check.valid ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
          <span>{text(`FABRICATE.Admin.Manager.Tools.Editor.Check${check.id[0].toUpperCase()}${check.id.slice(1)}`, labels[check.id])}</span>
        </li>
      {/each}
    </ul>
  </section>
  {#if validation.errors?.length}
    <section class="manager-validation-error manager-tool-validation-errors" role="alert" aria-live="assertive">
      <h3>{text('FABRICATE.Admin.Manager.Tools.Editor.DomainErrors', 'Save blockers')}</h3>
      <ul data-tool-validation-errors>
        {#each validation.errors as error, index (index)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (The first error receives tabindex=-1 solely for programmatic focus after invalid Save.) -->
          <li use:focusFirstFailure={index === 0 && focusValidationNonce > 0} data-first-validation-failure={index === 0 ? '' : undefined} tabindex={index === 0 ? -1 : undefined}>{validationErrorText(error)}</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if saveError && saveError !== 'invalid'}<p class="manager-validation-error" role="alert" data-tool-save-error tabindex="-1">{text('FABRICATE.Admin.Manager.Tools.Editor.SaveFailed', 'The Tool could not be saved. Try again.')}</p>{/if}
</div>
