<script>
  import Chip from '../../components/Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import ToolBehaviorPreview from './tools/ToolBehaviorPreview.svelte';
  import ToolBreakageTab from './tools/ToolBreakageTab.svelte';
  import ToolEditorTabs from './tools/ToolEditorTabs.svelte';
  import ToolRequirementsTab from './tools/ToolRequirementsTab.svelte';
  import ToolValidationTab from './tools/ToolValidationTab.svelte';
  import { toolDisplayImage, toolDisplayName, toolEditorValidation } from './tools/toolStudio.js';
  import { focusValidationTarget } from './validationFocus.js';
  import { announceValidationOutcome } from './validationAnnouncement.js';

  let {
    tool = null,
    // THE WORLD TOOL CORPUS, read for ONE question: does a world record exist for this Tool? The
    // button below must not route to an entry editor that would open on nothing.
    scope = null,
    // Which system this editor is scoped to. `actions` is deliberately NOT declared: the two
    // membership writes go out as callbacks, because each has to be composed with a DRAFT write and
    // a route the shell owns, and reaching the world family directly would do half of each.
    systemId = '',
    systemName = '',
    validation = { valid: false, errors: [] },
    persisted = true,
    dirty = false,
    saving = false,
    saveError = null,
    activeTab = 'breakage',
    focusValidationNonce = 0,
    managedItems = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    prerequisiteOptions = [],
    // THE WORLD MODIFIER LIBRARY (issue 1373): the bonus is a PICK from
    // `characterLibraries.modifiers[]` rather than a typed expression, at both scopes.
    modifierOptions = [],
    // The rail's `PREVIEW AS` roster, its roll-data resolver and its `REQUIRED FOR` list. All
    // three are projections the store owns: this view counts nothing and reads no document.
    actorOptions = [],
    getActorRollData = async () => null,
    requiredFor = [],
    authority = 'toolSpecific',
    // WHERE THAT AUTHORITY CAME FROM, for the Breakage tab's mode card. `authority` is the
    // RESOLVED token and cannot tell "this system chose it" from "this system follows the world";
    // the card states which, exactly as the rules list's own pill does (issue 1373).
    breakageSource = 'default',
    onOpenSystems = () => {},
    onOpenSystem = () => {},
    onOpenTools = () => {},
    onBack = () => {},
    onSave = () => {},
    onTabChange = () => {},
    onPatch = () => {},
    onToggleEnabled = () => {},
    // THE ROUTE OUT TO THE WORLD TOOL (issue 1373), the same navigation the rules list's inspector
    // already pins, wired to the same shell handler. The LINK ITSELF is no longer authored here;
    // see `tools/ToolOverviewTab`.
    onEditWorldTool = () => {},
    // THE TWO WORLD-MEMBERSHIP WRITES THIS SCREEN OWNS (issue 1373): one section between following
    // the world Tool and setting this system's own, and the removal of the whole rules record. Both
    // are membership writes rather than draft patches, so both persist immediately. `onDelete` is
    // GONE with its header button: the design puts `Delete` on the world entry, and system scope
    // gets the `Stop using this Tool here` callout on `Breakage` instead.
    onToggleInherited = () => {},
    onRemoveFromSystem = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }
  const displayName = $derived(
    toolDisplayName(
      tool,
      managedItems,
      text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')
    )
  );
  const displayImage = $derived(toolDisplayImage(tool, managedItems));
  /** THE HEADER'S SUBTITLE IS A STATEMENT OF SCOPE (issue 1373): which half of a Tool this screen
      owns — the rules are this system's, the identity is the world Tool's. */
  const sourceContext = $derived(
    systemName
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScope',
          { system: systemName },
          'Rules in {system} · identity comes from the world Tool'
        )
      : text(
          'FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScopeUnnamed',
          'System rules · identity comes from the world Tool'
        )
  );
  /** THE REQUIREMENTS CARD'S OPENING STRIP (issue 1373). `ToolRequirementsTab` serves both scopes,
      so the SENTENCE is resolved here, where the crafting system is known. The design's own
      "seeds them when you add it" wording is NOT reproduced: ours inherits for real. */
  const requirementsIntro = $derived(
    formattedText(
      'FABRICATE.Admin.Manager.Tools.Editor.RequirementsIntro',
      { system: systemName },
      `Prerequisites and the check bonus are ${systemName}’s own: each section follows ` +
        'the world Tool until you override it here, and no other crafting system changes.'
    )
  );
  const editorErrorCount = $derived(
    toolEditorValidation(tool, authority, validation.errors).issueCount
  );
  const requirementCount = $derived(
    (tool?.prerequisites?.enabled ? tool.prerequisites.ids?.length || 0 : 0) +
      (tool?.bonus?.enabled ? 1 : 0)
  );

  /** Whether the world catalogue holds a record for this Tool. `false` is a real answer, not a
      fallback: a pre-migration in-system Tool has no world half, so the button is absent. */
  const worldEntry = $derived(
    (Array.isArray(scope?.entries) ? scope.entries : []).find(
      (entry) => String(entry?.id ?? '') === String(tool?.id ?? '')
    ) ?? null
  );
  const worldRecordExists = $derived(worldEntry !== null);

  /** This `(tool, system)` pair's row in the world projection — the only thing that can say whether
      a section is inherited or overridden, since the system's own record carries the RESOLVED
      values. `ToolsBrowserView` reads the same join for its per-row pill. */
  const systemRow = $derived(
    (Array.isArray(worldEntry?.systems) ? worldEntry.systems : []).find(
      (row) => String(row?.systemId ?? '') === String(systemId ?? '')
    ) ?? null
  );
  /** Whether this system holds a MEMBERSHIP record, and so whether an inherit affordance can be
      offered at all; `false` renders every card's controls with no switch and no pill. */
  // THE WORLD'S OWN BREAKAGE AUTHORITY, read HERE rather than threaded from the shell on purpose:
  // `world-scope-tool-breakage-authority.test.js` pins every `toolBreakage` access in
  // `CraftingSystemManagerRoot` to a closed set. `''` means the world authored nothing.
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');

  const member = $derived(systemRow?.member === true);
  const inherited = $derived(systemRow?.inherited ?? {});
  const worldDefaults = $derived(worldEntry?.defaults ?? null);

  // The two tabs a validation row may address, written once so the route guard below and the
  // announcement's own label lookup cannot disagree about which tabs are reachable.
  const ISSUE_TABS = {
    breakage: { key: 'FABRICATE.Admin.Manager.Tools.Editor.TabBreakage', fallback: 'Breakage' },
    requirements: {
      key: 'FABRICATE.Admin.Manager.Tools.Editor.TabRequirements',
      fallback: 'Requirements',
    },
  };

  // This editor's own root, so `focusValidationTarget` resolves a `data-validation-target` inside
  // THIS editor rather than anywhere in the manager window.
  let editorRoot = $state(null);

  // WHAT THE LIVE REGION SAYS: the ACTION'S OUTCOME, not a count a row action does not move.
  let issueAnnouncement = $state('');

  // The destination TAB PANEL, and the focus fallback for a route-only row (issue 1517). Every
  // `general` row this editor draws is route-only, so this is the majority path here.
  let tabPanel = $state(null);

  /**
   * Deep-link from a validation issue: switch tab, THEN move focus. THE ORDER IS THE MECHANISM —
   * the route is requested synchronously and FIRST, so the destination panel exists by the time the
   * focus helper's `queueMicrotask` runs, and everything after that is `validationAnnouncement.js`'s.
   */
  function selectIssue(targetTab, focusTarget) {
    const route = Object.hasOwn(ISSUE_TABS, targetTab) ? targetTab : null;
    if (route) onTabChange(route);
    announceValidationOutcome({
      root: editorRoot,
      routeLabel: route ? text(ISSUE_TABS[route].key, ISSUE_TABS[route].fallback) : '',
      focus: () => focusValidationTarget(editorRoot, focusTarget),
      fallbackPanel: tabPanel,
      announce: (sentence) => {
        issueAnnouncement = sentence;
      },
    });
  }
</script>

<main class="manager-main manager-tool-edit-main" data-tool-edit-view bind:this={editorRoot}>
  <!--
    THE ROW ACTION'S LIVE REGION, hosted here rather than in the validation surface (issue 1517):
    activating a row action unmounts that whole panel in the same update that was supposed to
    announce, so the element carrying `aria-live` is ALWAYS in the DOM, outside the `{#if activeTab}`
    chain. A third child of this `<main>` is safe, because `.visually-hidden` is `position:
    absolute` and takes no track.
  -->
  <div class="visually-hidden" role="status" aria-live="polite" data-tool-issue-announcement>
    {#if issueAnnouncement}{issueAnnouncement}{/if}
  </div>
  <header class="manager-tool-edit-header" data-tool-editor-header>
    <nav
      class="manager-breadcrumbs"
      aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
    >
      <button type="button" data-tool-editor-open-systems onclick={onOpenSystems}
        >{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button
      >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <button type="button" data-tool-editor-open-system onclick={onOpenSystem}>{systemName}</button
      >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <button type="button" data-tool-editor-open-tools onclick={onOpenTools}
        >{text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules')}</button
      >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span title={displayName}>{displayName}</span>
    </nav>
    <div class="manager-tool-edit-header-main">
      <div class="manager-tool-edit-identity">
        <img src={displayImage} alt="" data-tool-editor-image />
        <div class="manager-tool-edit-identity-copy">
          <h2 title={displayName}>{displayName}</h2>
          <p data-tool-editor-source-context>{sourceContext}</p>
        </div>
      </div>
      <div class="manager-header-actions manager-tool-edit-actions">
        {#if dirty}<Chip tone="warning" data-tool-editor-status
            >{text('FABRICATE.Admin.Manager.Tools.Dirty', 'Unsaved')}</Chip
          >{/if}
        {#if dirty}<span data-tool-editor-dirty hidden>dirty</span>{/if}
        <!-- These three are the AUTHORITY for `ManagerButton` (issue 1096) and go through the
             primitive so the two screens cannot drift apart again. -->
        <!-- BOTH NAVIGATIONS TAKE ONE TREATMENT, because the design gives them one (issue 1373):
             the GHOST role, or two adjacent buttons that both leave this screen read as two
             different weights of verb. `Save rules` stays `primary` and green, a standing ruling. -->
        {#if worldRecordExists}
          <ManagerButton
            role="ghost"
            data-tool-editor-world-tool={String(tool?.id ?? '')}
            aria-label={text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}
            onclick={() => onEditWorldTool(String(tool?.id ?? ''))}
            disabled={saving}
            ><i class="fas fa-globe" aria-hidden="true"></i><span
              >{text('FABRICATE.Admin.Manager.Tools.WorldToolAction', 'World Tool')}</span
            ></ManagerButton
          >
        {/if}
        <!-- `Back to Tool Rules` and `Save rules`, not `Back to tools` and `Save tool`: what this
             screen saves is one crafting system's RULES for a Tool. -->
        <ManagerButton
          role="ghost"
          data-tool-editor-back
          aria-label={text(
            'FABRICATE.Admin.Manager.Tools.Editor.BackLabel',
            'Back to the Tool Rules list'
          )}
          title={text(
            'FABRICATE.Admin.Manager.Tools.Editor.BackLabel',
            'Back to the Tool Rules list'
          )}
          onclick={onBack}
          disabled={saving}
          ><i class="fas fa-arrow-left" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Tools.BackToToolRules', 'Back to Tool Rules')}</span
          ></ManagerButton
        >
        <ManagerButton
          role="primary"
          data-tool-editor-save
          aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.SaveLabel', 'Save Tool rules')}
          onclick={onSave}
          disabled={!dirty || !validation.valid || saving}
          title={validation.valid
            ? ''
            : text(
                'FABRICATE.Admin.Manager.Tools.Editor.ResolveValidation',
                'Resolve validation issues before saving.'
              )}
          ><i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Tools.SaveRules', 'Save rules')}</span
          ></ManagerButton
        >
      </div>
    </div>
  </header>

  <ToolEditorTabs
    {activeTab}
    errorCount={editorErrorCount}
    {requirementCount}
    onChange={onTabChange}
  />

  <div class="manager-tool-edit-composition">
    <!-- `tabindex="-1"`, WAS `0` (issue 1517): the panel is the ROUTE-ONLY row's focus destination
         and must be focusable programmatically, but `0` put an empty scroll container in the Tab
         order between the strip and the first field. -->
    <div
      class="manager-tool-editor-panel"
      role="tabpanel"
      id={`tool-panel-${activeTab}`}
      aria-labelledby={`tool-tab-${activeTab}`}
      data-tool-editor-panel={activeTab}
      tabindex="-1"
      data-keyboard-focus="true"
      bind:this={tabPanel}
    >
      {#if activeTab === 'requirements'}
        <ToolRequirementsTab
          {tool}
          {authority}
          intro={requirementsIntro}
          {prerequisiteOptions}
          {modifierOptions}
          {saving}
          {member}
          {inherited}
          {worldDefaults}
          {onPatch}
          {onToggleInherited}
        />
      {:else if activeTab === 'validation'}
        <ToolValidationTab
          {tool}
          {authority}
          {validation}
          {saveError}
          {focusValidationNonce}
          {worldRecordExists}
          {onEditWorldTool}
          onSelectIssue={selectIssue}
        />
      {:else}
        <ToolBreakageTab
          {tool}
          {authority}
          {breakageSource}
          {worldAuthority}
          componentOptions={managedItems}
          {itemTags}
          {essenceOptions}
          {currencyUnits}
          {currencyEnabled}
          {managedItems}
          {systemName}
          {persisted}
          {saving}
          {member}
          {inherited}
          {worldDefaults}
          {onPatch}
          {onToggleEnabled}
          {onToggleInherited}
          {onRemoveFromSystem}
        />
      {/if}
    </div>
    <ToolBehaviorPreview
      {tool}
      {authority}
      {managedItems}
      {systemName}
      {actorOptions}
      {prerequisiteOptions}
      {getActorRollData}
      {requiredFor}
    />
  </div>
</main>
