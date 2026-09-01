<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import ToolBehaviorPreview from './tools/ToolBehaviorPreview.svelte';
  import ToolBreakageTab from './tools/ToolBreakageTab.svelte';
  import ToolEditorTabs from './tools/ToolEditorTabs.svelte';
  import ToolRequirementsTab from './tools/ToolRequirementsTab.svelte';
  import ToolValidationTab from './tools/ToolValidationTab.svelte';
  import { toolDisplayImage, toolDisplayName, toolEditorValidation } from './tools/toolStudio.js';

  let {
    tool = null,
    // THE WORLD TOOL CORPUS, read for ONE question: does a world record exist for this Tool?
    // `toolScopeProps` was already being spread in by the call site and silently dropped, so
    // declaring it costs no new wiring. The button below must not offer a route to an entry
    // editor that would open on nothing, which is the state a pre-migration in-system Tool with
    // no world half is in.
    scope = null,
    // WHICH SYSTEM THIS EDITOR IS SCOPED TO. It arrives in the `toolScopeProps` bundle the call
    // site already spreads, so declaring it costs no new wiring — and `scope` was already
    // declared and already read in a reactive scope here, so the bundle-subscription hazard
    // that declaration note warns about was taken long ago and is not deepened by this one.
    //
    // `actions` is deliberately NOT declared. The two membership writes this screen performs go
    // out as `onToggleInherited` and `onRemoveFromSystem` callbacks, because both have to be
    // composed with a DRAFT write the shell owns and a route the shell owns; reaching the world
    // family directly from here would do half of each.
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
    // The rail's `PREVIEW AS` roster and its roll-data resolver, and its `REQUIRED FOR` list.
    // All three are projections the store owns: this view counts nothing and reads no document.
    actorOptions = [],
    getActorRollData = async () => null,
    requiredFor = [],
    authority = 'toolSpecific',
    // WHERE THAT AUTHORITY CAME FROM, for the Breakage tab's mode card. `authority` is the
    // RESOLVED token and cannot tell "this system chose it" from "this system follows the
    // world"; the card states which, exactly as the rules list's own pill does (issue 1373).
    breakageSource = 'default',
    onOpenSystems = () => {},
    onOpenSystem = () => {},
    onOpenTools = () => {},
    onBack = () => {},
    onSave = () => {},
    onTabChange = () => {},
    onPatch = () => {},
    onToggleEnabled = () => {},
    // ── THE ROUTE OUT TO THE WORLD TOOL (issue 1373) ────────────────────────────────────────
    // The rules LIST already claims this Tool inherits world defaults, offers `What it would
    // inherit here`, and pins an `Edit the world Tool` button to its inspector. The editor
    // behind `Edit rules` offered no route to that record at all, so the list advertised a
    // destination the next screen could not reach. This is the same navigation the inspector's
    // button takes, wired to the same shell handler; the design puts it in the header band, as
    // `World Tool`, beside `Back to Tool Rules`.
    //
    // The LINK ITSELF is not authored here any more, and the three wires that used to do it —
    // `onSourceDrop`, `onCopySourceUuid`, `onUnlinkSource` — are gone with the card that used
    // them. See `tools/ToolOverviewTab` for why.
    onEditWorldTool = () => {},
    // ── THE TWO WORLD-MEMBERSHIP WRITES THIS SCREEN OWNS (issue 1373) ───────────────────────
    // `onToggleInherited(section, nextInherit)` moves ONE section between following the world
    // Tool and setting this system's own, and `onRemoveFromSystem()` takes the whole rules
    // record away. Both are membership writes rather than draft patches, so both are the
    // shell's to perform: they persist immediately, exactly as the enable switch already does.
    //
    // `onDelete` is GONE with the header button that called it. The design puts `Delete` on the
    // world entry, which is the record it destroys; system scope gets the explained
    // `Stop using this Tool here` callout on `Breakage` instead, because a bare `Delete` on a
    // screen whose subject is one world Tool adopted by many systems names no scope at all.
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
  /**
   * THE HEADER'S SUBTITLE, AND IT IS A STATEMENT OF SCOPE (issue 1373).
   *
   * It read `Linked game-world Item` — the WORLD editor's subtitle, describing the one thing
   * this screen cannot change. What a GM needs to know on arriving here is which half of a Tool
   * this screen owns, and the design says it in one sentence: the rules are this system's, the
   * identity is the world Tool's.
   */
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
  const editorErrorCount = $derived(
    toolEditorValidation(tool, authority, validation.errors).issueCount
  );
  const requirementCount = $derived(
    (tool?.prerequisites?.enabled ? tool.prerequisites.ids?.length || 0 : 0) +
      (tool?.bonus?.enabled ? 1 : 0)
  );

  /**
   * Whether the world catalogue actually holds a record for this Tool.
   *
   * `false` is a real answer rather than a fallback: a pre-migration in-system Tool that no
   * `1.30.0` pass has lifted has no world half, and routing to its entry editor would land the
   * GM on the `no longer in the corpus` state. The button is simply absent there.
   */
  const worldEntry = $derived(
    (Array.isArray(scope?.entries) ? scope.entries : []).find(
      (entry) => String(entry?.id ?? '') === String(tool?.id ?? '')
    ) ?? null
  );
  const worldRecordExists = $derived(worldEntry !== null);

  /**
   * THIS `(tool, system)` PAIR'S ROW IN THE WORLD PROJECTION — the only thing that can say
   * whether a section is inherited or overridden.
   *
   * The system's own Tool record carries the RESOLVED values and cannot tell the two apart,
   * which is exactly why this editor had no inheritance model: it was reading the only source
   * that does not hold the answer. `ToolsBrowserView` already reads the same join for its
   * per-row `Inherits world defaults` pill.
   */
  const systemRow = $derived(
    (Array.isArray(worldEntry?.systems) ? worldEntry.systems : []).find(
      (row) => String(row?.systemId ?? '') === String(systemId ?? '')
    ) ?? null
  );
  /**
   * Whether this crafting system holds a MEMBERSHIP record for the Tool, and therefore whether
   * the editor can offer an inherit affordance at all.
   *
   * `false` is a real answer: a pre-migration in-system Tool that no `1.30.0` pass lifted has no
   * world half, so there is nothing to inherit FROM and nothing to be removed from. Every card
   * then renders its controls with no switch and no pill — which is exactly what this screen did
   * before, so nothing about that state changed.
   */
  // THE WORLD'S OWN BREAKAGE AUTHORITY, read off the world-scope projection this view already
  // takes, exactly as `ToolsBrowserView` reads it for the same sentence. It is read HERE rather
  // than threaded from the shell on purpose: `world-scope-tool-breakage-authority.test.js` pins
  // every `toolBreakage` access in `CraftingSystemManagerRoot` to a closed set, and a fifth
  // rooted read there would be a fifth screen re-deriving a fact the projection already
  // publishes. `''` means the world corpus authored nothing, which is a different answer from
  // an authored `toolSpecific` and is why it is read rather than inferred.
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');

  const member = $derived(systemRow?.member === true);
  const inherited = $derived(systemRow?.inherited ?? {});
  const worldDefaults = $derived(worldEntry?.defaults ?? null);
</script>

<main class="manager-main manager-tool-edit-main" data-tool-edit-view>
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
        <!-- These three are the AUTHORITY for `ManagerButton` (issue 1096): the maintainer's
             reference for what a manager button should look like. They go through the
             primitive so the two screens cannot drift apart again — a role or a treatment
             that lands here now lands everywhere the primitive is used. Their rendering is
             unchanged: `fab-manager-button` re-declares the same `.manager-header-actions`
             values these already inherit from their ancestor. -->
        {#if worldRecordExists}
          <ManagerButton
            data-tool-editor-world-tool={String(tool?.id ?? '')}
            aria-label={text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}
            onclick={() => onEditWorldTool(String(tool?.id ?? ''))}
            disabled={saving}
            ><i class="fas fa-globe" aria-hidden="true"></i><span
              >{text('FABRICATE.Admin.Manager.Tools.WorldToolAction', 'World Tool')}</span
            ></ManagerButton
          >
        {/if}
        <!-- `Back to Tool Rules` and `Save rules`, not `Back to tools` and `Save tool`. Both
             old labels named the WORLD editor's job: they came from a time when this was the
             only Tool editor there was. What this screen saves is one crafting system's RULES
             for a Tool, and where it goes back to is the Tool Rules list its breadcrumb already
             names — a `Save tool` on a screen that cannot change the Tool is the same category
             error as the `Delete` that used to sit between them. -->
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
    <div
      class="manager-tool-editor-panel"
      role="tabpanel"
      id={`tool-panel-${activeTab}`}
      aria-labelledby={`tool-tab-${activeTab}`}
      data-tool-editor-panel={activeTab}
      tabindex="0"
    >
      {#if activeTab === 'requirements'}
        <ToolRequirementsTab
          {tool}
          {authority}
          {prerequisiteOptions}
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
