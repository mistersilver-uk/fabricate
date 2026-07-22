<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolEditorChecks } from './toolStudio.js';

  let { tool = null, authority = 'toolSpecific', validation = { valid: false, errors: [] }, saveError = '', focusValidationNonce = 0 } = $props();
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const labels = {
    source: 'Linked Item or managed Component',
    breakage: 'Breakage range and formula',
    onBreak: 'On-break action and replacement',
    requirements: 'Prerequisites and bonus expression',
    repair: 'Repair group completeness',
  };
  const checks = $derived(toolEditorChecks(tool, authority));
  const invalidCount = $derived(checks.filter((check) => !check.valid).length + (validation.errors?.length || 0));
  function focusFirstFailure(node, enabled) {
    if (enabled) queueMicrotask(() => node.focus());
  }
</script>

<div class="manager-tool-tab-stack" data-tool-validation-tab>
  <section class="manager-tool-editor-card">
    <div class="manager-tool-validation-summary">
      <span class={`manager-chip ${invalidCount > 0 ? 'is-danger' : 'is-positive'}`}><i class={invalidCount > 0 ? 'fas fa-circle-exclamation' : 'fas fa-circle-check'} aria-hidden="true"></i>{invalidCount > 0 ? `${invalidCount} issues` : text('FABRICATE.Admin.Manager.Tools.ValidationValid', 'Ready to save')}</span>
    </div>
    <ul class="manager-tool-validation-checks" aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.ValidationChecks', 'Tool validation checks')}>
      {#each checks as check}
        <li class:is-invalid={!check.valid} data-tool-validation-check={check.id}>
          <i class={check.valid ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
          <span>{text(`FABRICATE.Admin.Manager.Tools.Editor.Check${check.id[0].toUpperCase()}${check.id.slice(1)}`, labels[check.id])}</span>
        </li>
      {/each}
    </ul>
  </section>
  {#if validation.errors?.length}
    <section class="manager-tool-editor-card manager-validation-error" role="alert" aria-live="assertive">
      <h3>{text('FABRICATE.Admin.Manager.Tools.Editor.DomainErrors', 'Save blockers')}</h3>
      <ul data-tool-validation-errors>{#each validation.errors as error, index}<li use:focusFirstFailure={index === 0 && focusValidationNonce > 0} data-first-validation-failure={index === 0 ? '' : undefined} tabindex={index === 0 ? -1 : undefined}>{error}</li>{/each}</ul>
    </section>
  {/if}
  {#if saveError && saveError !== 'invalid'}<p class="manager-validation-error" role="alert" data-tool-save-error tabindex="-1">{saveError}</p>{/if}
</div>
