<!-- Svelte 5 runes mode -->
<!--
  The Tool editor's VALIDATION tab.

  It renders the shared `ScopedValidationTab` (issue 1362), the generalisation of the shell
  this file and `essences/EssenceValidationTab` were both already written as. It keeps its
  `manager-tool-tab-stack` class, its `data-tool-validation-tab` hook and its
  `data-tool-validation-check` row hook, so no shipped rule and no test selector stops
  matching, and it keeps the save-failure alert below the surface as the primitive's trailing
  snippet.

  UNLIKE AN ESSENCE, A TOOL REFUSES TO SAVE while a blocking issue stands, which is why its
  block row reads `BLOCKS ENABLE` where the essence's reads `INCOMPLETE`. That word is the one
  thing the two sites genuinely disagree about, and it is the only status label either passes.

  == THERE IS NO `LINKED ITEM` GROUP, AND ITS ABSENCE IS THE CONTRACT (issue 1373) ============
  This surface opened with a `LINKED ITEM` heading over a single row reading `A game-world Item
  is linked` — a check on IDENTITY, which is world scope's and which no control on this screen
  can satisfy. It counted toward the blocking total and reddened the tab badge over a defect a
  GM could only fix somewhere else.

  It is not silently dropped. `toolEditorValidation` carries the failure out as `identityErrors`
  and the surface states it as a ROUTED NOTICE naming the world Tool — the place it is fixed —
  rather than as a check row. The notice renders only when the link is genuinely missing, so a
  healthy Tool's surface is exactly the four rules checks and nothing else.

  == AND NO IN-PANE PAGE HEADING (issue 1373) =================================================
  It opened with an `<h2>` reading `Validation` over a `A Tool saves only when every blocking
  issue is cleared.` intro — the only tab of the three to carry one, and the reference draws it
  on none of them. The tab strip immediately above already names the tab, the editor header
  above that names the Tool, and the summary card immediately below already says `Every Tool
  check passes. Ready to save.` in the state where it matters. Both props are simply not
  passed; `EditorValidationSurface` renders no head block at all when neither is given, so no
  other caller of that surface changes.

  ESCALATED, NOT SOLVED: the domain still refuses the SAVE. `Tool#validate` and
  `CraftingSystemManager#upsertTool` both reject a Tool with neither a `componentId` nor a source
  reference, because an unmatched Tool cannot be found in any inventory. So a rules record whose
  world half has lost its Item still cannot be saved from here; what changed is that the screen
  now says where to go instead of asking the GM to clear a check with no control behind it.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Callout from '../Callout.svelte';
  import ScopedValidationTab from '../scoped/ScopedValidationTab.svelte';
  import {
    toolEditorValidation,
    toolHasLinkedSource,
    toolValidationPresentation,
  } from './toolStudio.js';

  let {
    tool = null,
    authority = 'toolSpecific',
    validation = { valid: false, errors: [] },
    saveError = '',
    focusValidationNonce = 0,
    // Whether the world catalogue actually holds a record for this Tool, and the route to it.
    // Both come from the editor, which already answers the same question for its header button:
    // an unlifted pre-migration Tool has no world half, so the notice states the defect and
    // offers no route to a record that would open on nothing.
    worldRecordExists = false,
    onEditWorldTool = () => {},
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
    breakage: 'Breakage settings are complete',
    onBreak: 'On-break action is complete',
    prerequisites: 'Character prerequisites are complete',
    bonus: 'Check bonus is complete',
    repair: 'Repair requirements are complete',
  };
  const icons = {
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

  const identityBroken = $derived(
    !toolHasLinkedSource(tool) || editorValidation.identityErrors.length > 0
  );

  const groups = $derived.by(() => {
    const result = [
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
</script>

<ScopedValidationTab
  stackClass="manager-scoped-tab-stack manager-tool-tab-stack"
  hookAttribute="data-tool-validation-tab"
  focusNonce={focusValidationNonce}
  {summary}
  counts={{ passing, warnings: 0, blocking }}
  {groups}
  rowDataAttr="data-tool-validation-check"
  blockLabel={text('FABRICATE.Admin.Manager.Recipe.Validation.StatusBlock', 'BLOCKS ENABLE')}
>
  {#if identityBroken}
    <div class="manager-tool-identity-notice" data-tool-identity-notice>
      <Callout
        tone="warning"
        icon="fas fa-link-slash"
        text={text(
          'FABRICATE.Admin.Manager.Tools.Editor.IdentityMissing',
          'This Tool names no game-world Item. Its identity is set on the world Tool, not here, and it cannot be saved until that link is restored.'
        )}
      />
      {#if worldRecordExists}
        <ManagerButton
          data-tool-identity-route={String(tool?.id ?? '')}
          aria-label={text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}
          onclick={() => onEditWorldTool(String(tool?.id ?? ''))}
          ><i class="fas fa-globe" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Tools.WorldToolAction', 'World Tool')}</span
          ></ManagerButton
        >
      {/if}
    </div>
  {/if}
  {#if saveError && saveError !== 'invalid'}
    <p class="manager-validation-error" role="alert" data-tool-save-error>
      {text(
        'FABRICATE.Admin.Manager.Tools.Editor.SaveFailed',
        'The Tool could not be saved. Try again.'
      )}
    </p>
  {/if}
</ScopedValidationTab>
