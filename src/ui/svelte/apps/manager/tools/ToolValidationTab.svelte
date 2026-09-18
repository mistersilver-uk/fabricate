<!--
  The Tool editor's VALIDATION tab, rendering the shared `ScopedValidationTab`. It keeps its
  `manager-tool-tab-stack` class, its `data-tool-validation-tab` hook and its
  `data-tool-validation-check` row hook, and keeps the save-failure alert below the surface as the
  primitive's trailing snippet. UNLIKE AN ESSENCE, A TOOL REFUSES TO SAVE while a blocking issue
  stands, which is why its block row reads `BLOCKS ENABLE` — the one thing the two sites disagree
  about, and the only status label either passes.

  THERE IS NO `LINKED ITEM` GROUP, AND ITS ABSENCE IS THE CONTRACT. That check was on IDENTITY,
  which is world scope's and which no control on this screen can satisfy, yet it counted toward the
  blocking total and reddened the tab badge. It is not silently dropped: `toolEditorValidation`
  carries the failure out as `identityErrors` and the surface states it as a ROUTED NOTICE naming
  the world Tool, rendered only when the link is genuinely missing. ESCALATED, NOT SOLVED — the
  domain still refuses the SAVE, because an unmatched Tool cannot be found in any inventory; what
  changed is that the screen says where to go instead of asking a GM to clear an unreachable check.

  AND NO IN-PANE PAGE HEADING: the tab strip above names the tab, the editor header names the Tool,
  and the summary card below already says every check passes in the state where it matters. Both
  props are simply not passed, and the shared surface renders no head block when neither is given.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Callout from '../../../components/Callout.svelte';
  import ScopedValidationTab from '../scoped/ScopedValidationTab.svelte';
  import {
    toolEditorValidation,
    toolHasLinkedSource,
    toolIssueAddress,
    toolValidationPresentation,
  } from './toolStudio.js';

  let {
    tool = null,
    authority = 'toolSpecific',
    validation = { valid: false, errors: [] },
    saveError = '',
    focusValidationNonce = 0,
    // Whether the world catalogue holds a record for this Tool, and the route to it: an unlifted
    // pre-migration Tool has no world half, so the notice states the defect and offers no route.
    worldRecordExists = false,
    onEditWorldTool = () => {},
    // THE ROW ACTION: the tab the editor switches to and the `data-validation-target` of the
    // offending control. The editor owns both moves; this tab carries the producer's address.
    onSelectIssue = () => {},
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
          title: text('FABRICATE.Admin.Manager.Validation.SummaryAllClear', 'All clear'),
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
        // Spread so a check with no route adds no key at all, and threaded rather than derived:
        // `toolStudio.js` is the only thing that knows which control a failure names.
        ...toolIssueAddress(check),
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
        // NO ADDRESS ON A GENERAL ROW, and the omission is the decision: these are the messages
        // the projection could not place, so there is no tab and no control to point at.
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

<!-- Declared here rather than inline so the prop can be UNSET: an empty snippet is still truthy,
     and a `Callout` taking one draws an empty flex item and its gap. -->
{#snippet worldToolAction()}
  <ManagerButton
    data-tool-identity-route={String(tool?.id ?? '')}
    aria-label={text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}
    onclick={() => onEditWorldTool(String(tool?.id ?? ''))}
    ><i class="fas fa-globe" aria-hidden="true"></i><span
      >{text('FABRICATE.Admin.Manager.Tools.WorldToolAction', 'World Tool')}</span
    ></ManagerButton
  >
{/snippet}

<!-- TWO COUNT TILES, NOT THREE: every Tool check is two-state, so a `warnings: 0` drew a tile
     this set can never fill. The surface renders the tiles it is REPORTED, so omitting the key is
     how a site says it cannot answer that question. -->
<ScopedValidationTab
  stackClass="manager-scoped-tab-stack manager-tool-tab-stack"
  hookAttribute="data-tool-validation-tab"
  focusNonce={focusValidationNonce}
  {summary}
  counts={{ passing, blocking }}
  {groups}
  rowDataAttr="data-tool-validation-check"
  viewDataAttr="data-tool-validation-view"
  {onSelectIssue}
  blockLabel={text('FABRICATE.Admin.Manager.Validation.StatusBlock', 'Blocks enable')}
>
  {#if identityBroken}
    <!-- The note and the ONE control that answers it are one object, with the button riding the
         shared strip's `actions` snippet. No title is added: inventing a headline would put
         `lang/en.json` in scope for a site carrying one sentence. -->
    <Callout
      tone="warning"
      icon="fas fa-link-slash"
      text={text(
        'FABRICATE.Admin.Manager.Tools.Editor.IdentityMissing',
        'This Tool names no game-world Item. Its identity is set on the world Tool, not here, and it cannot be saved until that link is restored.'
      )}
      dataAttr="data-tool-identity-notice"
      actions={worldRecordExists ? worldToolAction : undefined}
    />
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
