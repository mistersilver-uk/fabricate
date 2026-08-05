<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EditorValidationSurface from '../EditorValidationSurface.svelte';
  import { toolEditorValidation, toolValidationPresentation } from './toolStudio.js';

  let {
    tool = null,
    authority = 'toolSpecific',
    validation = { valid: false, errors: [] },
    saveError = '',
    focusValidationNonce = 0,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function validationErrorText(error) {
    const presentation = toolValidationPresentation(error);
    const key = `FABRICATE.Admin.Manager.Tools.Editor.${presentation.key}`;
    const translated = localize(key);
    if (translated && translated !== key) return localize(key, presentation.data);
    if (presentation.key === 'ValidationErrorRepair') {
      return `Repair group ${presentation.data.group} is incomplete.`;
    }
    return (
      {
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
      }[presentation.key] || 'Some Tool settings are incomplete.'
    );
  }

  const labels = {
    source: 'A game-world Item is linked',
    breakage: 'Breakage settings are complete',
    onBreak: 'On-break action is complete',
    prerequisites: 'Character prerequisites are complete',
    bonus: 'Check bonus is complete',
    repair: 'Repair requirements are complete',
  };
  const icons = {
    source: 'fas fa-link',
    breakage: 'fas fa-heart-crack',
    requirements: 'fas fa-user-shield',
  };
  const editorValidation = $derived(toolEditorValidation(tool, authority, validation.errors));
  const checks = $derived(editorValidation.checks);
  const blocking = $derived(editorValidation.issueCount);
  const passing = $derived(checks.filter((check) => check.valid).length);
  const summary = $derived(
    blocking > 0
      ? {
          status: 'block',
          icon: 'fas fa-circle-exclamation',
          title: text('FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention', 'Needs attention'),
          sub: text(
            'FABRICATE.Admin.Manager.Tools.Editor.ValidationBlockingSub',
            'Clear every blocking issue before saving this Tool.'
          ),
        }
      : {
          status: 'pass',
          icon: 'fas fa-circle-check',
          title: text('FABRICATE.Admin.Manager.Recipe.Validation.SummaryAllClear', 'All clear'),
          sub: text(
            'FABRICATE.Admin.Manager.Tools.Editor.ValidationAllClearSub',
            'Every Tool check passes. Ready to save.'
          ),
        }
  );

  function rows(ids) {
    return checks
      .filter((check) => ids.includes(check.id))
      .map((check) => ({
        id: check.id,
        status: check.valid ? 'pass' : 'block',
        title: text(
          `FABRICATE.Admin.Manager.Tools.Editor.Check${check.id[0].toUpperCase()}${check.id.slice(1)}`,
          labels[check.id]
        ),
        detail: check.errors?.length ? validationErrorText(check.errors[0]) : '',
      }));
  }

  const groups = $derived.by(() => {
    const result = [
      {
        id: 'source',
        label: text('FABRICATE.Admin.Manager.Tools.Editor.Source', 'Source'),
        icon: icons.source,
        rows: rows(['source']),
      },
      {
        id: 'breakage',
        label: text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage'),
        icon: icons.breakage,
        rows: rows(['breakage', 'onBreak', 'repair']),
      },
      {
        id: 'requirements',
        label: text('FABRICATE.Admin.Manager.Tools.Editor.TabRequirements', 'Requirements'),
        icon: icons.requirements,
        rows: rows(['prerequisites', 'bonus']),
      },
    ];
    if (editorValidation.unknownErrors.length > 0) {
      result.push({
        id: 'general',
        label: text('FABRICATE.Common.General', 'General'),
        icon: 'fas fa-circle-exclamation',
        rows: editorValidation.unknownErrors.map((_, index) => ({
          id: `unknown-${index}`,
          status: 'block',
          title: text(
            'FABRICATE.Admin.Manager.Tools.Editor.ValidationErrorGeneric',
            'Some Tool settings are incomplete.'
          ),
        })),
      });
    }
    return result;
  });

  function focusFirstFailure(node, nonce) {
    if (nonce > 0) {
      queueMicrotask(() =>
        node.querySelector('.manager-recipe-val-row.is-block')?.scrollIntoView?.({
          block: 'nearest',
        })
      );
    }
  }
</script>

<div
  class="manager-tool-tab-stack"
  data-tool-validation-tab
  use:focusFirstFailure={focusValidationNonce}
>
  <EditorValidationSurface
    title={text('FABRICATE.Admin.Manager.Tools.Editor.Validation', 'Validation')}
    intro={text(
      'FABRICATE.Admin.Manager.Tools.Editor.ValidationIntro',
      'A Tool saves only when every blocking issue is cleared.'
    )}
    {summary}
    counts={{ passing, warnings: 0, blocking }}
    countLabels={{
      passing: text('FABRICATE.Admin.Manager.Recipe.Validation.CountPassing', 'Passing'),
      warnings: text('FABRICATE.Admin.Manager.Recipe.Validation.CountWarnings', 'Warnings'),
      blocking: text('FABRICATE.Admin.Manager.Recipe.Validation.CountBlocking', 'Blocking'),
    }}
    {groups}
    rowDataAttr="data-tool-validation-check"
    statusLabels={{
      pass: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusPass', 'PASS'),
      warn: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusWarn', 'WARNING'),
      block: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusBlock', 'BLOCKS ENABLE'),
    }}
  />
  {#if saveError && saveError !== 'invalid'}
    <p class="manager-validation-error" role="alert" data-tool-save-error>
      {text(
        'FABRICATE.Admin.Manager.Tools.Editor.SaveFailed',
        'The Tool could not be saved. Try again.'
      )}
    </p>
  {/if}
</div>
