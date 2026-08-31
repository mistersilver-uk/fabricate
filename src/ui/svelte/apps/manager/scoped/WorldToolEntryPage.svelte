<!-- Svelte 5 runes mode -->
<!--
  The world Tool entry editor (issue 1373, epic 1357).

  == THE WORLD BREAK MODE IS READ-ONLY HERE, AND THAT IS THE DECISION ======================
  It is authored on the Tools Catalogue and nowhere else. `## Scoped Entity Definitions`
  prohibits one field authored at two places, and the failure it prevents is concrete: two
  controls over one setting disagree the moment either is edited with the other on screen.
  `FABRICATE.Admin.Manager.Scoped.ToolEntrySubtitle` names the break mode among this screen's
  contents, and a read-only statement satisfies that without putting a second writer here.

  == THREE SECTIONS, AND THE THIRD IS A SEED RATHER THAN A PARENT =========================
  `breakage` and `onBreak` are world defaults a membership record INHERITS: each states how
  many systems inherit it before an edit lands, read from `entry.inheritCounts`, which
  `worldScopeProjection` populates from `descriptor.sections` alone.

  `repairRequirements` is the third, is NOT in `descriptor.sections`, and therefore carries no
  inherit count at all - correctly, because it is copied ONCE when a tool joins a system and
  then diverges freely. A count here would claim a live parent the resolver does not honour,
  and `resolveTool` reads the list from the MEMBERSHIP RECORD ALONE. So the tab states the
  seed rule instead of a count, and the tab set comes from `worldToolSectionTabs()` rather
  than a hand-written list.

  Its full ingredient-group editor is deliberately NOT here. A repair recipe names ingredient
  groups over the OWNING SYSTEM's components, which world scope cannot address - `toolScope.js`
  says so in those terms - so what world scope can honestly own is the seed's PRESENCE, and
  what it cannot is the group contents. The system Tool rules editor owns those.

  == THE TAB STRIP IS THE SHIPPED ONE ====================================================
  `EditorTabs` was promoted to `apps/manager/` for exactly this, and `tools/ToolEditorTabs`
  is hardcoded to four `tool-tab-*` ids for the SYSTEM editor. Reusing the promoted primitive
  is what stops a second near-identical `.svelte` tab block, which SonarCloud counts.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Chip from '../Chip.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import { toolBreakageSummary, toolOnBreakSummary } from '../tools/toolStudio.js';
  import MembershipActions from './MembershipActions.svelte';
  import ScopedEntityPreview from './ScopedEntityPreview.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import { scopedSectionLabel } from './scopedStudio.js';
  import {
    isSeededToolSection,
    toolBreakModeLabel,
    worldToolSectionTabs,
  } from './worldToolStudio.js';

  // `systems` IS DELIBERATELY NOT DECLARED, though the call site passes it in the tool bundle.
  // It is `projectSystems`' narrowed `{id, name}` roster, which cannot answer `member`,
  // `inherited` or `enabled` - and this screen needs all three per row. `entry.systems` is the
  // projection's own JOIN and answers them, so declaring the roster would add an unread prop
  // beside the value that is actually correct.
  let { scope = null, actions = null, entityId = '', onBackToCatalogue = () => {} } = $props();

  const BREAKAGE_MODES = ['limitedUses', 'breakageChance', 'diceExpression'];
  const ON_BREAK_MODES = ['destroy', 'flagBroken', 'replaceWith'];

  const SECTION_TABS = worldToolSectionTabs();

  const TAB_ICONS = {
    identity: 'fas fa-hammer',
    breakage: 'fas fa-heart-crack',
    onBreak: 'fas fa-explosion',
    repairRequirements: 'fas fa-screwdriver-wrench',
    systems: 'fas fa-diagram-project',
    validation: 'fas fa-clipboard-check',
  };

  let activeTab = $state('identity');
  let armedToken = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  /**
   * One section's tab and heading label.
   *
   * `scopedSectionLabel` answers from `SECTION_COPY`, which carries the five INHERITED section
   * names and deliberately not the seeded one - a seeded section renders no inherit row, so
   * that table never had a reason to name it, and an unknown section falls back to its own key.
   * `repairRequirements` is exactly that case, and this screen is the one place it is a
   * heading, so its copy lives here rather than widening a shared table for one caller.
   *
   * @param {string} section
   * @returns {string}
   */
  function sectionLabel(section) {
    if (isSeededToolSection(section)) {
      return text('FABRICATE.Admin.Manager.Scoped.Sections.RepairRequirements', 'Repair materials');
    }
    return scopedSectionLabel(section, text);
  }

  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const entry = $derived(entries.find((candidate) => candidate.id === entityId) ?? null);
  const entity = $derived(entry?.entity ?? null);
  const defaults = $derived(entry?.defaults ?? {});
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');
  const memberRows = $derived(Array.isArray(entry?.systems) ? entry.systems : []);
  const repairGroups = $derived(
    Array.isArray(defaults.repairRequirements) ? defaults.repairRequirements : []
  );

  const entryName = $derived(
    typeof entity?.name === 'string' && entity.name.trim() ? entity.name : String(entityId || '')
  );

  const tabs = $derived([
    {
      id: 'identity',
      icon: TAB_ICONS.identity,
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Entry.TabIdentity',
      label: 'Identity',
    },
    ...SECTION_TABS.map((section) => ({
      id: section,
      icon: TAB_ICONS[section],
      labelKey: '',
      label: sectionLabel(section),
    })),
    {
      id: 'systems',
      icon: TAB_ICONS.systems,
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Entry.TabSystems',
      label: 'Crafting systems',
    },
    {
      id: 'validation',
      icon: TAB_ICONS.validation,
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Entry.TabValidation',
      label: 'Validation',
    },
  ]);

  /**
   * The inherit count one section states before an edit lands, or `null` for a SEEDED section
   * that has none.
   *
   * @param {string} section
   * @returns {number|null}
   */
  function inheritCount(section) {
    if (isSeededToolSection(section)) return null;
    return Number(entry?.inheritCounts?.[section]) || 0;
  }

  /**
   * The world default read as a tool-shaped record, for the shipped summary helpers.
   *
   * @returns {{breakage: object|null, onBreak: object|null, checkBreakable: boolean}}
   */
  function worldDefaultTool() {
    return {
      breakage: defaults.breakage ?? null,
      onBreak: defaults.onBreak ?? null,
      checkBreakable: defaults.checkBreakable !== false,
    };
  }

  const breakageSummary = $derived(
    toolBreakageSummary(worldDefaultTool(), worldAuthority || 'toolSpecific')
  );
  const onBreakSummary = $derived(toolOnBreakSummary(worldDefaultTool()));

  function breakageModeLabel(mode) {
    return {
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUses', 'Limited uses'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChance', 'Breakage chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDice', 'Dice expression'),
    }[mode];
  }

  function onBreakModeLabel(mode) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with component'),
    }[mode];
  }

  /**
   * Patch one world-default section, preserving every field it already carries.
   *
   * SECTION VALUES ARE OPAQUE to the write path, so the merge happens here where the shape is
   * known, and the action stores whatever it is handed verbatim.
   *
   * @param {string} section
   * @param {object} patch
   * @returns {void}
   */
  function patchSection(section, patch) {
    const current =
      defaults[section] && typeof defaults[section] === 'object' ? defaults[section] : {};
    actions?.updateWorldDefaultSection?.(entityId, section, { ...current, ...patch });
  }

  /**
   * Whether this identity record actually names a source Item, read from the projection.
   *
   * `buildEntry` answers it beside the ONE list of source-link field names, so this never
   * restates `originItemUuid` / `registeredItemUuid` / `aliasItemUuids` and cannot go on
   * testing the old names after a rename.
   */
  const sourceLinked = $derived(entry?.hasSourceLink === true);

  const validationRows = $derived([
    {
      id: 'name',
      status: entryName.trim() ? 'pass' : 'block',
      title: text('FABRICATE.Admin.Manager.Scoped.Entry.CheckName', 'The Tool has a name'),
      detail: entryName.trim()
        ? ''
        : text(
            'FABRICATE.Admin.Manager.Scoped.Entry.CheckNameDetail',
            'An unnamed world record is unfindable in every system that has it.'
          ),
    },
    {
      id: 'source',
      status: sourceLinked ? 'pass' : 'warn',
      title: sourceLinked
        ? text('FABRICATE.Admin.Manager.Scoped.Entry.CheckSource', 'Linked to a source Item')
        : text('FABRICATE.Admin.Manager.Scoped.Entry.CheckUnlinked', 'No source Item'),
      detail: sourceLinked
        ? ''
        : text(
            'FABRICATE.Admin.Manager.Scoped.Entry.CheckUnlinkedDetail',
            'This record names no game-world Item, so nothing in an inventory resolves to it.'
          ),
    },
    {
      id: 'membership',
      status: memberRows.some((row) => row.member) ? 'pass' : 'warn',
      title: text('FABRICATE.Admin.Manager.Scoped.Entry.CheckMembership', 'In at least one system'),
      detail: memberRows.some((row) => row.member)
        ? ''
        : text(
            'FABRICATE.Admin.Manager.Scoped.Entry.CheckMembershipDetail',
            'No crafting system has this Tool, so its world defaults reach nothing.'
          ),
    },
  ]);

  const validationCounts = $derived({
    passing: validationRows.filter((row) => row.status === 'pass').length,
    warnings: validationRows.filter((row) => row.status === 'warn').length,
    blocking: validationRows.filter((row) => row.status === 'block').length,
  });

  const validationSummary = $derived({
    status:
      validationCounts.blocking > 0 ? 'block' : validationCounts.warnings > 0 ? 'warn' : 'pass',
    title:
      validationCounts.blocking > 0
        ? text('FABRICATE.Admin.Manager.Scoped.Entry.ValidationBlocked', 'Needs attention')
        : text('FABRICATE.Admin.Manager.Scoped.Entry.ValidationReady', 'Ready'),
    sub: format(
      'FABRICATE.Admin.Manager.Scoped.Entry.ValidationSub',
      '{count} checks over this world record',
      { count: validationRows.length }
    ),
  });

  const previewRules = $derived([
    {
      id: 'break-mode',
      icon: 'fas fa-sliders',
      title: toolBreakModeLabel(worldAuthority, text),
      subtitle: text(
        'FABRICATE.Admin.Manager.Tools.WorldAuthorityPreview',
        'The world break mode, unless a system overrides it.'
      ),
    },
    {
      id: 'breakage',
      icon: 'fas fa-heart-crack',
      title: breakageModeLabel(defaults.breakage?.mode) || breakageModeLabel('limitedUses'),
      subtitle: format(
        'FABRICATE.Admin.Manager.Scoped.Entry.PreviewInheriting',
        '{count} systems inherit it',
        { count: inheritCount('breakage') ?? 0 }
      ),
    },
    {
      id: 'on-break',
      icon: 'fas fa-explosion',
      title: onBreakModeLabel(defaults.onBreak?.mode) || onBreakModeLabel('destroy'),
      subtitle: format(
        'FABRICATE.Admin.Manager.Scoped.Entry.PreviewInheriting',
        '{count} systems inherit it',
        { count: inheritCount('onBreak') ?? 0 }
      ),
    },
  ]);

  const pageTitle = $derived(text('FABRICATE.Admin.Manager.Scoped.ToolEntryTitle', 'Tool entry'));

  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }
</script>

<main class="manager-main" data-scoped-page="world-tool-entry" aria-label={pageTitle}>
  <header class="manager-world-tool-entry-head">
    <ManagerButton role="ghost" data-world-tool-entry-back onclick={() => onBackToCatalogue()}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle', 'Tools Catalogue')}</span>
    </ManagerButton>
    <h2 class="manager-world-tool-entry-name" data-world-tool-entry-name>{entryName}</h2>
    <Chip
      tone={sourceLinked ? 'neutral' : 'warning'}
      icon={sourceLinked ? 'fas fa-link' : 'fas fa-link-slash'}
      data-world-tool-entry-source={sourceLinked ? 'linked' : 'unlinked'}
    >
      {sourceLinked
        ? text('FABRICATE.Admin.Manager.Scoped.List.SourceLinked', 'Linked')
        : text('FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked', 'No source item')}
    </Chip>
  </header>

  <!--
    THE WORLD BREAK MODE, READ-ONLY. It is stated here because a GM authoring this Tool's
    breakage section has to know which authority decides whether the section is even read;
    it is not authored here because the catalogue owns it.
  -->
  <section class="manager-world-tool-entry-mode" data-world-tool-entry-break-mode>
    <i class="fas fa-sliders" aria-hidden="true"></i>
    <div class="manager-world-tool-entry-mode-copy">
      <span class="manager-kicker"
        >{text('FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle', 'World breakage default')}</span
      >
      <strong data-world-tool-entry-break-label>{toolBreakModeLabel(worldAuthority, text)}</strong>
    </div>
    <p class="manager-muted manager-world-tool-entry-mode-note">
      {text(
        'FABRICATE.Admin.Manager.Tools.WorldAuthorityReadOnly',
        'World default, set once for every Tool on the Tools Catalogue. Systems may override it.'
      )}
    </p>
  </section>

  <div class="manager-world-tool-entry-body">
    <EditorTabs
      {tabs}
      {activeTab}
      onSelect={(tab) => (activeTab = tab)}
      ariaLabelKey="FABRICATE.Admin.Manager.Scoped.Entry.Tabs"
      ariaLabel="Tool entry sections"
      idStem="world-tool-entry"
      hookAttribute="data-world-tool-entry-tab"
    />

    <div class="manager-world-tool-entry-columns">
      <div
        class="manager-world-tool-entry-panel"
        id={`world-tool-entry-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`world-tool-entry-tab-${activeTab}`}
        tabindex="-1"
      >
        {#if !entry}
          <p class="manager-muted" data-world-tool-entry-missing>
            {text(
              'FABRICATE.Admin.Manager.Scoped.Entry.Missing',
              'This world record is no longer in the corpus. Return to the catalogue to pick another.'
            )}
          </p>
        {:else if activeTab === 'identity'}
          <label class="manager-field" data-world-tool-entry-field="name">
            <span>{text('FABRICATE.Admin.Manager.Scoped.Entry.Name', 'Name')}</span>
            <input
              type="text"
              value={entity?.name ?? ''}
              onchange={(event) =>
                actions?.updateEntity?.(entityId, { name: event.currentTarget.value })}
            />
          </label>
          <label class="manager-field" data-world-tool-entry-field="description">
            <span>{text('FABRICATE.Admin.Manager.Scoped.Entry.Description', 'Description')}</span>
            <textarea
              rows="3"
              value={entity?.description ?? ''}
              onchange={(event) =>
                actions?.updateEntity?.(entityId, { description: event.currentTarget.value })}
            ></textarea>
          </label>
        {:else if activeTab === 'breakage'}
          <p class="manager-muted" data-world-tool-entry-inherit-count="breakage">
            {format(
              'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
              '{count} crafting systems inherit this world default today.',
              { count: inheritCount('breakage') }
            )}
          </p>
          <div
            class="manager-world-tool-entry-modes"
            role="radiogroup"
            aria-label={sectionLabel('breakage')}
          >
            {#each BREAKAGE_MODES as mode (mode)}
              <label
                class:is-selected={(defaults.breakage?.mode ?? 'limitedUses') === mode}
                data-world-tool-entry-breakage-mode={mode}
              >
                <input
                  type="radio"
                  name="world-tool-breakage-mode"
                  value={mode}
                  checked={(defaults.breakage?.mode ?? 'limitedUses') === mode}
                  onchange={() => patchSection('breakage', { mode })}
                />
                <span>{breakageModeLabel(mode)}</span>
              </label>
            {/each}
          </div>
          <p class="manager-muted" data-world-tool-entry-breakage-summary>{breakageSummary}</p>
        {:else if activeTab === 'onBreak'}
          <p class="manager-muted" data-world-tool-entry-inherit-count="onBreak">
            {format(
              'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
              '{count} crafting systems inherit this world default today.',
              { count: inheritCount('onBreak') }
            )}
          </p>
          <div
            class="manager-world-tool-entry-modes"
            role="radiogroup"
            aria-label={sectionLabel('onBreak')}
          >
            {#each ON_BREAK_MODES as mode (mode)}
              <label
                class:is-selected={(defaults.onBreak?.mode ?? 'destroy') === mode}
                data-world-tool-entry-onbreak-mode={mode}
              >
                <input
                  type="radio"
                  name="world-tool-onbreak-mode"
                  value={mode}
                  checked={(defaults.onBreak?.mode ?? 'destroy') === mode}
                  onchange={() => patchSection('onBreak', { mode })}
                />
                <span>{onBreakModeLabel(mode)}</span>
              </label>
            {/each}
          </div>
          <p class="manager-muted" data-world-tool-entry-onbreak-summary>{onBreakSummary}</p>
        {:else if activeTab === 'repairRequirements'}
          <!-- NO INHERIT COUNT, and the copy says why. See the header: a seed has no live
             parent, so a count would claim an inheritance the resolver does not honour. -->
          <p class="manager-muted" data-world-tool-entry-seed-note>
            {text(
              'FABRICATE.Admin.Manager.Tools.RepairSeedNote',
              'Copied once when a system adopts this Tool, then edited there. Changing it here never reaches a system that already has it.'
            )}
          </p>
          <p data-world-tool-entry-repair-count>
            {format(
              repairGroups.length === 1
                ? 'FABRICATE.Admin.Manager.Tools.RepairGroupOne'
                : 'FABRICATE.Admin.Manager.Tools.RepairGroupCount',
              repairGroups.length === 1 ? '{count} group' : '{count} groups',
              { count: repairGroups.length }
            )}
          </p>
          <p class="manager-muted" data-world-tool-entry-repair-scope-note>
            {text(
              'FABRICATE.Admin.Manager.Tools.RepairScopeNote',
              'A repair group names components in the owning crafting system, which world scope cannot address, so the groups themselves are edited in that system Tool Rules editor.'
            )}
          </p>
          {#if repairGroups.length > 0}
            <ManagerButton
              data-world-tool-entry-repair-clear
              onclick={() => actions?.setWorldRepairRequirements?.(entityId, [])}
            >
              {text('FABRICATE.Admin.Manager.Tools.RepairClearSeed', 'Clear the seed')}
            </ManagerButton>
          {/if}
        {:else if activeTab === 'systems'}
          <ul class="manager-world-tool-entry-systems" role="list">
            {#each memberRows as row (row.systemId)}
              <li
                class="manager-world-tool-entry-system"
                data-world-tool-entry-system={row.systemId}
              >
                <span class="manager-world-tool-entry-system-name">{systemLabel(row)}</span>
                <span class="manager-world-tool-entry-system-inherit">
                  {#each SECTION_TABS.filter((section) => !isSeededToolSection(section)) as section (section)}
                    <Chip
                      tone={row.inherited?.[section] === false ? 'accent' : 'neutral'}
                      data-world-tool-entry-system-section={section}
                    >
                      {`${sectionLabel(section)} - ${
                        row.inherited?.[section] === false
                          ? text(
                              'FABRICATE.Admin.Manager.Scoped.Inherit.StateOverridden',
                              'Overridden'
                            )
                          : text(
                              'FABRICATE.Admin.Manager.Scoped.Inherit.StateInherited',
                              'Inherited'
                            )
                      }`}
                    </Chip>
                  {/each}
                </span>
                <MembershipActions
                  entityType="tool"
                  {entityId}
                  systemId={row.systemId}
                  entityName={entryName}
                  systemName={systemLabel(row)}
                  member={row.member === true}
                  enabled={row.enabled === true}
                  {armedToken}
                  onArm={(token) => (armedToken = token)}
                  onDisarm={() => (armedToken = '')}
                  onAdd={() => actions?.addToSystem?.(entityId, row.systemId)}
                  onRemove={() => actions?.removeFromSystem?.(entityId, row.systemId)}
                  onToggleEnabled={(next) => actions?.setEnabled?.(entityId, row.systemId, next)}
                />
              </li>
            {/each}
          </ul>
        {:else}
          <ScopedValidationTab
            title={text('FABRICATE.Admin.Manager.Scoped.Entry.TabValidation', 'Validation')}
            intro={text(
              'FABRICATE.Admin.Manager.Scoped.Entry.ValidationIntro',
              'What this world record still needs before every system that has it reads a complete answer.'
            )}
            summary={validationSummary}
            counts={validationCounts}
            groups={[
              {
                id: 'world-tool',
                icon: 'fas fa-hammer',
                label: text('FABRICATE.Admin.Manager.Scoped.ToolEntryTitle', 'Tool entry'),
                rows: validationRows,
              },
            ]}
            blockLabel={text(
              'FABRICATE.Admin.Manager.Recipe.Validation.StatusBlock',
              'BLOCKS ENABLE'
            )}
            rowDataAttr="data-world-tool-entry-check"
            hookAttribute="data-world-tool-entry-validation"
          />
        {/if}
      </div>

      <ScopedEntityPreview
        hookAttribute="data-world-tool-entry-preview"
        ariaLabel={text('FABRICATE.Admin.Manager.Scoped.Entry.Preview', 'Player preview')}
        kicker={text('FABRICATE.Admin.Manager.Scoped.Entry.PreviewKicker', 'What a player sees')}
        identity={{
          name: entryName,
          image: entity?.img || '',
          context: format(
            'FABRICATE.Admin.Manager.Scoped.Entry.PreviewContext',
            'In {count} crafting systems',
            { count: memberRows.filter((row) => row.member).length }
          ),
          hookAttribute: 'data-world-tool-entry-preview-identity',
        }}
        rulesKicker={text(
          'FABRICATE.Admin.Manager.Scoped.Entry.PreviewRules',
          'The world defaults, resolved'
        )}
        rules={previewRules}
        ruleHookAttribute="data-world-tool-entry-preview-rule"
      />
    </div>
  </div>
</main>

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. `styles/fabricate.css` is
     closed to this lane, so every rule for markup THIS file owns is authored here. The
     shipped `.manager-main`, `.manager-kicker`, `.manager-muted`, `.manager-field` and
     `.manager-editor-tabs` treatments are reused rather than restated.

     The rows are SPANNED rather than the template redeclared, for the reason the catalogue
     page records: the shipped `.manager-main` template is `auto auto 1fr` and a scoped
     redeclaration is a specificity tie resolved on injection order. */
  .manager-world-tool-entry-head {
    display: flex;
    grid-row: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3) 0;
    min-width: 0;
  }

  .manager-world-tool-entry-name {
    margin: 0;
    color: var(--fab-mv2-text);
    font-size: 0.95rem;
    overflow-wrap: break-word;
  }

  .manager-world-tool-entry-mode {
    display: flex;
    grid-row: 2;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    margin: var(--fab-space-2) var(--fab-space-3) 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 11px;
    background: var(--fab-overlay-dark-08);
    min-width: 0;
  }

  .manager-world-tool-entry-mode i {
    color: var(--fab-mv2-accent);
  }

  .manager-world-tool-entry-mode-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-mode-note {
    margin: 0 0 0 auto;
    max-width: 18rem;
    font-size: 0.62rem;
    text-align: right;
  }

  /* THE TAB STRIP AND THE BODY SHARE THE LAST TRACK. The strip is `auto` inside it and the
     body takes the slack, so a long section scrolls inside the panel rather than pushing the
     tabs off screen. */
  .manager-world-tool-entry-body {
    display: grid;
    grid-row: 3 / -1;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--fab-space-2);
    padding: 0 var(--fab-space-3) var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  .manager-world-tool-entry-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  .manager-world-tool-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  .manager-world-tool-entry-modes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2xs);
    padding: 3px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 9px;
    background: var(--fab-overlay-dark-08);
    min-width: 0;
  }

  .manager-world-tool-entry-modes label {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 6px var(--fab-space-2);
    border-radius: 7px;
    color: var(--fab-mv2-text-muted);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .manager-world-tool-entry-modes label.is-selected {
    background: var(--fab-mv2-accent);
    color: var(--fab-on-accent);
  }

  .manager-world-tool-entry-modes input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .manager-world-tool-entry-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  .manager-world-tool-entry-system {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 9px;
    min-width: 0;
  }

  .manager-world-tool-entry-system-name {
    color: var(--fab-mv2-text);
    font-size: 0.74rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-world-tool-entry-system-inherit {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
