<!-- Svelte 5 runes mode -->
<!--
  The world Tool entry editor (issue 1373, epic 1357).

  == THE SCREEN IS THREE TABS, AND IT USED TO BE SIX ======================================
  `Identity`, `Breakage`, `On break`, `Repair materials`, `Crafting systems`, `Validation`
  was the section list wearing a tab strip: one tab per persisted key rather than one tab per
  decision a GM makes. Three of them - breakage, what happens when it breaks, and what mends
  it afterwards - are one question asked three times, and each panel held a single segmented
  control over two thirds of empty pane.

  What is here now is `Overview`, `Breakage` and `Validation`:

   - OVERVIEW is the identity the record actually has - the game-world Item behind it, and
     the display label every system shows. The linked Item was stated NOWHERE before, which
     is the one fact every other field on the screen derives from;
   - BREAKAGE opens with the world break mode, READ-ONLY, because it decides whether the
     control beneath it is consulted at all. That statement used to be a full-width band
     ABOVE the tab strip, where it sat over tabs it says nothing about;
   - VALIDATION wears its own count in the strip, so a GM does not open a tab to learn
     whether anything is wrong.

  `Crafting systems` is gone rather than folded. The per-system membership cluster it held is
  the CATALOGUE inspector's, which renders it for every world entity through
  `EntityCatalogueShell`; a second copy behind a tab here was one meaning implemented twice.

  == THERE IS NO SAVE BUTTON, AND THAT IS THE DECISION ====================================
  World-scope writes land on change - `updateEntity` and `updateWorldDefaultSection` persist
  the moment a field or a segment is touched - so there is no draft for a Save to flush. The
  prototype's header carries one because its own fixture is draft-based. A button that saved
  nothing because everything was already saved would teach a GM that their edits are pending
  when they are not, so the header carries Back and Delete and stops there.

  == THE WORLD BREAK MODE IS READ-ONLY HERE, AND THAT IS ALSO A DECISION ==================
  It is authored on the Tools Catalogue and nowhere else. `## Scoped Entity Definitions`
  prohibits one field authored at two places, and the failure it prevents is concrete: two
  controls over one setting disagree the moment either is edited with the other on screen.

  == THE THIRD SECTION IS A SEED RATHER THAN A PARENT =====================================
  `breakage` and `onBreak` are world defaults a membership record INHERITS: each states how
  many systems inherit it before an edit lands, read from `entry.inheritCounts`, which
  `worldScopeProjection` populates from `descriptor.sections` alone.

  `repairRequirements` is the third, is NOT in `descriptor.sections`, and therefore carries no
  inherit count at all - correctly, because it is copied ONCE when a tool joins a system and
  then diverges freely. A count here would claim a live parent the resolver does not honour,
  and `resolveTool` reads the list from the MEMBERSHIP RECORD ALONE. So the card states the
  seed rule instead of a count.

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
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import Chip from '../Chip.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import { toolBreakageSummary } from '../tools/toolStudio.js';
  import ScopedEntityPreview from './ScopedEntityPreview.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import { scopedSectionLabel } from './scopedStudio.js';
  import { isSeededToolSection, toolBreakModeLabel } from './worldToolStudio.js';

  // `systems` IS DELIBERATELY NOT DECLARED, though the call site passes it in the tool bundle.
  // It is `projectSystems`' narrowed `{id, name}` roster, which cannot answer `member`,
  // `inherited` or `enabled` - and this screen needs all three per row. `entry.systems` is the
  // projection's own JOIN and answers them, so declaring the roster would add an unread prop
  // beside the value that is actually correct.
  let { scope = null, actions = null, entityId = '', onBackToCatalogue = () => {} } = $props();

  const BREAKAGE_MODES = ['limitedUses', 'breakageChance', 'diceExpression'];
  const DEFAULT_BREAK_MODE = 'toolSpecific';
  const ON_BREAK_MODES = ['destroy', 'flagBroken', 'replaceWith'];

  const TAB_ICONS = {
    identity: 'fas fa-circle-info',
    breakage: 'fas fa-heart-crack',
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
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Entry.TabOverview',
      label: 'Overview',
    },
    {
      id: 'breakage',
      icon: TAB_ICONS.breakage,
      labelKey: '',
      label: sectionLabel('breakage'),
    },
    {
      id: 'validation',
      icon: TAB_ICONS.validation,
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Entry.TabValidation',
      label: 'Validation',
    },
  ]);

  // THE VALIDATION TAB WEARS ITS OWN COUNT, which is what makes the strip readable at a
  // glance: a GM should not have to open the tab to learn whether anything is wrong. A clean
  // record shows a tick rather than `0`, because a zero reads as a quantity of something.
  const tabBadges = $derived({
    validation:
      validationCounts.blocking > 0
        ? { label: String(validationCounts.blocking), tone: 'danger' }
        : validationCounts.warnings > 0
          ? { label: String(validationCounts.warnings), tone: 'warning' }
          : { label: '✓', tone: 'success' },
  });

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
    toolBreakageSummary(worldDefaultTool(), worldAuthority || DEFAULT_BREAK_MODE)
  );

  /**
   * What the breakage section RESOLVES TO, in words.
   *
   * `toolBreakageSummary` answers a KIND - `breakageChance`, `diceExpression`, `limitedUses` -
   * which is a persisted field name and not copy. It was being rendered straight to the panel,
   * so the Breakage tab read `breakageChance` under its own control. This turns the kind into
   * the value it stands for, exactly as the row badge and the inspector card already do.
   */
  const breakageSummaryLabel = $derived.by(() => {
    const tool = worldDefaultTool();
    if (breakageSummary === 'immune') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    }
    if (breakageSummary === 'breakable') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    }
    if (breakageSummary === 'breakageChance') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break', {
        count: tool.breakage?.breakageChance ?? 0,
      });
    }
    if (breakageSummary === 'diceExpression') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll', {
        formula: tool.breakage?.formula || '-',
      });
    }
    const maxUses = Number(tool.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return format('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses', {
        count: maxUses,
      });
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  });

  /**
   * The two mode choices as RADIO CARDS rather than a segmented track.
   *
   * A SEGMENTED TRACK WAS THE WRONG CONTROL, and the design's picture is what says so: it
   * offers each mode as a card carrying a glyph, a bold name and the sentence explaining what
   * it does. A three-segment track states three bare labels and asks a GM to already know
   * which of `Limited uses`, `Breakage chance` and `Dice expression` they want.
   *
   * `RadioCardGroup` is the shipped primitive for exactly this, and `tools/ToolBreakageTab`
   * already renders these same two groups through it at SYSTEM scope. Reusing it - and the
   * hint and glyph vocabulary it reads - is what stops world scope describing the same three
   * modes differently from the system editor a GM reaches from the row beside it.
   */
  const breakageModeOptions = $derived(
    BREAKAGE_MODES.map((mode) => ({
      value: mode,
      label: breakageModeLabel(mode),
      description: breakageModeDescription(mode),
      icon: {
        limitedUses: 'fas fa-hourglass-half',
        breakageChance: 'fas fa-percent',
        diceExpression: 'fas fa-dice-d20',
      }[mode],
    }))
  );

  const onBreakOptions = $derived(
    ON_BREAK_MODES.map((mode) => ({
      value: mode,
      label: onBreakModeLabel(mode),
      description: onBreakModeDescription(mode),
      icon: {
        destroy: 'fas fa-trash',
        flagBroken: 'fas fa-triangle-exclamation',
        replaceWith: 'fas fa-right-left',
      }[mode],
    }))
  );

  function breakageModeDescription(mode) {
    return {
      limitedUses: text(
        'FABRICATE.Admin.Manager.Tools.BreakageLimitedUsesHint',
        'A fixed number of uses, then it breaks.'
      ),
      breakageChance: text(
        'FABRICATE.Admin.Manager.Tools.BreakageChanceHint',
        'A % chance to break each use.'
      ),
      diceExpression: text(
        'FABRICATE.Admin.Manager.Tools.BreakageDiceHint',
        'Roll a separate breakage check.'
      ),
    }[mode];
  }

  function onBreakModeDescription(mode) {
    return {
      destroy: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakDestroyHint',
        'The tool is consumed and removed.'
      ),
      flagBroken: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakFlagHint',
        'Sets a broken flag; appends " (Broken)".'
      ),
      replaceWith: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakReplaceHint',
        'Replace it with a managed Component that can participate in repair routes.'
      ),
    }[mode];
  }

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

  /**
   * The game-world Item this record names, for the linked-item tile.
   *
   * REGISTERED FIRST, then ORIGIN, which is `toolSourceUuid`'s own precedence: a Tool that was
   * re-linked carries both, and the registered uuid is the one the resolver reads.
   */
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));

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

  /**
   * The world defaults, resolved, as the preview's fact rows.
   *
   * THE SUBLINE SAYS WHAT THE RULE DOES, never how many systems inherit it. `1 systems
   * inherit it` was an unpluralised count of a fact the tab bodies already state, in the one
   * place a GM is asking what the Tool will DO - and it read as debug output beside the
   * prototype's `Tool-specific · tracked per copy`. The inherit counts stay where they answer
   * a question: on the section itself, before an edit lands.
   */
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
      icon: 'fas fa-hourglass-half',
      title: breakageSummaryLabel,
      subtitle:
        (worldAuthority || DEFAULT_BREAK_MODE) === 'checkDriven'
          ? text(
              'FABRICATE.Admin.Manager.Tools.Editor.PreviewCheckDriven',
              'Check-driven · follows the crafting roll'
            )
          : text(
              'FABRICATE.Admin.Manager.Tools.Editor.PreviewToolSpecific',
              'Tool-specific · tracked per copy'
            ),
    },
    {
      id: 'on-break',
      icon: 'fas fa-heart-crack',
      title: format(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreakValue',
        'On break: {action}',
        {
          action: (
            onBreakModeLabel(defaults.onBreak?.mode) || onBreakModeLabel('destroy')
          ).toLocaleLowerCase(),
        }
      ),
      subtitle: text(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreak',
        'Runs immediately after breakage'
      ),
    },
    {
      id: 'repair',
      icon: 'fas fa-screwdriver-wrench',
      title: format(
        repairGroups.length === 1
          ? 'FABRICATE.Admin.Manager.Tools.RepairGroupOne'
          : 'FABRICATE.Admin.Manager.Tools.RepairGroupCount',
        repairGroups.length === 1 ? '{count} group' : '{count} groups',
        { count: repairGroups.length }
      ),
      subtitle: text(
        'FABRICATE.Admin.Manager.Tools.RepairSeedPreview',
        'Copied once when a system adopts this Tool'
      ),
    },
  ]);

  const pageTitle = $derived(text('FABRICATE.Admin.Manager.Scoped.ToolEntryTitle', 'Tool entry'));
</script>

<main class="manager-main" data-scoped-page="world-tool-entry" aria-label={pageTitle}>
  <!--
    THE ENTITY HEADER, not a second breadcrumb strip.

    It carried a Back button, a bare `<h2>` and a source pill and nothing else, so the screen
    opened with a generic page title over a name over a tab strip, and the two actions a GM
    comes here to reach - leave, and delete - were one of them and hidden respectively. The
    prototype's is a medallion, the name, what the record IS, and the actions right-aligned on
    the same line, and that is what this is.

    THERE IS NO SAVE BUTTON, and its absence is the decision. World-scope writes land on
    change: `updateEntity` and `updateWorldDefaultSection` persist the moment a field or a
    segment is touched, so there is no draft for a Save to flush. A button that saved nothing
    because everything was already saved is worse than no button, because it teaches a GM that
    their edits are pending when they are not.
  -->
  <header class="manager-world-tool-entry-head">
    <img
      class="manager-world-tool-entry-medallion"
      src={entity?.img || ''}
      alt=""
      data-world-tool-entry-medallion
    />
    <div class="manager-world-tool-entry-identity">
      <h2 class="manager-world-tool-entry-name" data-world-tool-entry-name>{entryName}</h2>
      <p
        class="manager-muted manager-world-tool-entry-kind"
        data-world-tool-entry-source={sourceLinked ? 'linked' : 'unlinked'}
      >
        {sourceLinked
          ? text('FABRICATE.Admin.Manager.Scoped.Entry.LinkedItemSub', 'Linked game-world Item')
          : text('FABRICATE.Admin.Manager.Scoped.Entry.UnlinkedItemSub', 'No Item linked')}
      </p>
    </div>
    <div class="manager-world-tool-entry-actions">
      <ManagerButton role="ghost" data-world-tool-entry-back onclick={() => onBackToCatalogue()}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Scoped.Entry.BackToTools', 'Back to tools')}</span>
      </ManagerButton>
      <!-- ARMED, because this deletes the world record, its world defaults AND every
           membership record naming it - `deleteEntity` sweeps all three - and there is no
           undo. The shipped two-step control is what every other destructive manager action
           uses; a bare button here would be the only unguarded one. -->
      <ArmedDangerButton
        token={`world-tool-delete:${entityId}`}
        armed={armedToken === `world-tool-delete:${entityId}`}
        idleLabel={text('FABRICATE.Admin.Manager.Scoped.Entry.Delete', 'Delete')}
        armedLabel={text('FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirm', 'Delete for good?')}
        idleAriaLabel={format(
          'FABRICATE.Admin.Manager.Scoped.Entry.DeleteAria',
          'Delete {name} from the world catalogue',
          { name: entryName }
        )}
        armedAriaLabel={format(
          'FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirmAria',
          'Confirm deleting {name} from every system that has it',
          { name: entryName }
        )}
        onArm={(token) => (armedToken = token)}
        onDisarm={() => (armedToken = '')}
        onConfirm={async () => {
          armedToken = '';
          await actions?.deleteEntity?.(entityId);
          onBackToCatalogue();
        }}
      />
    </div>
  </header>

  <div class="manager-world-tool-entry-body">
    <EditorTabs
      {tabs}
      {activeTab}
      onSelect={(tab) => (activeTab = tab)}
      ariaLabelKey="FABRICATE.Admin.Manager.Scoped.Entry.Tabs"
      ariaLabel="Tool entry sections"
      idStem="world-tool-entry"
      hookAttribute="data-world-tool-entry-tab"
      badges={tabBadges}
      badgeAttribute="data-world-tool-entry-tab-badge"
      danger
    />

    <div class="manager-world-tool-entry-columns">
      <div
        class="manager-world-tool-entry-panel"
        id={`world-tool-entry-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`world-tool-entry-tab-${activeTab}`}
        tabindex="-1"
        data-keyboard-focus="true"
      >
        {#if !entry}
          <p class="manager-muted" data-world-tool-entry-missing>
            {text(
              'FABRICATE.Admin.Manager.Scoped.Entry.Missing',
              'This world record is no longer in the corpus. Return to the catalogue to pick another.'
            )}
          </p>
        {:else if activeTab === 'identity'}
          <!--
            THREE CARDS, and the first is the one the screen was missing entirely: WHAT this
            world record is a record OF. A GM opening a Tool entry saw a name and a description
            with no statement of the game-world Item behind them, which is the one fact every
            other field on this screen is derived from.
          -->
          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="linked-item">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Scoped.Entry.LinkedItem', 'Linked item')}
            </p>
            <div class="manager-world-tool-entry-tile">
              <img src={entity?.img || ''} alt="" />
              <div class="manager-world-tool-entry-tile-copy">
                <strong>{entryName}</strong>
                <small class="manager-muted" data-world-tool-entry-source-uuid>
                  {sourceLinked
                    ? sourceUuid
                    : text(
                        'FABRICATE.Admin.Manager.Scoped.Entry.UnlinkedItemHint',
                        'No Item linked — name, art and description are authored here.'
                      )}
                </small>
              </div>
              <Chip
                tone={sourceLinked ? 'neutral' : 'warning'}
                icon={sourceLinked ? 'fas fa-link' : 'fas fa-link-slash'}
              >
                {sourceLinked
                  ? text('FABRICATE.Admin.Manager.Scoped.List.SourceLinked', 'Linked')
                  : text('FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked', 'No source item')}
              </Chip>
            </div>
            <label class="manager-field" data-world-tool-entry-field="description">
              <span>{text('FABRICATE.Admin.Manager.Scoped.Entry.Description', 'Description')}</span>
              <textarea
                rows="3"
                value={entity?.description ?? ''}
                onchange={(event) =>
                  actions?.updateEntity?.(entityId, { description: event.currentTarget.value })}
              ></textarea>
            </label>
          </section>

          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="display-label">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel', 'Display label')}
            </p>
            <!-- NO SECOND VISIBLE LABEL. The card's kicker already reads `Display label`, so a
                 `Name` caption under it names the same field twice; the accessible name goes
                 on the input instead, which is what a screen reader announces anyway. -->
            <div class="manager-field" data-world-tool-entry-field="name">
              <input
                type="text"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel',
                  'Display label'
                )}
                value={entity?.name ?? ''}
                onchange={(event) =>
                  actions?.updateEntity?.(entityId, { name: event.currentTarget.value })}
              />
            </div>
            <p class="manager-muted manager-world-tool-entry-hint">
              {text(
                'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelHint',
                'The name every crafting system shows for this Tool.'
              )}
            </p>
          </section>
        {:else if activeTab === 'breakage'}
          <!--
            ONE TAB FOR THE WHOLE BREAKAGE STORY. It used to be three — `Breakage`, `On break`
            and `Repair materials` — which split one decision across three panels a GM had to
            hold in their head: what makes it break, what happens when it does, and what mends
            it afterwards are the same question asked three times.

            THE WORLD BREAK MODE LEADS, READ-ONLY. It decides whether the control under it is
            even consulted, so stating it anywhere else — and it used to be a full-width band
            ABOVE the tab strip, on every tab including the ones it says nothing about — puts
            the condition away from the thing it conditions.
          -->
          <div class="manager-world-tool-entry-mode" data-world-tool-entry-break-mode>
            <i class="fas fa-sliders" aria-hidden="true"></i>
            <div class="manager-world-tool-entry-mode-copy">
              <span class="manager-kicker"
                >{text(
                  'FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle',
                  'World breakage default'
                )}</span
              >
              <strong data-world-tool-entry-break-label
                >{toolBreakModeLabel(worldAuthority, text)}</strong
              >
            </div>
            <p class="manager-muted manager-world-tool-entry-mode-note">
              {text(
                'FABRICATE.Admin.Manager.Tools.WorldAuthorityReadOnly',
                'World default, set once for every Tool on the Tools Catalogue. Systems may override it.'
              )}
            </p>
          </div>

          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="breakage">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Tools.Editor.HowItBreaks', 'How this Tool breaks')}
            </p>
            <RadioCardGroup
              options={breakageModeOptions}
              selectedValue={defaults.breakage?.mode ?? 'limitedUses'}
              groupName="world-tool-breakage-mode"
              columns={3}
              legend={sectionLabel('breakage')}
              dataGroup="world-tool-breakage-mode"
              optionDataAttr="data-world-tool-entry-breakage-mode"
              onChange={(mode) => patchSection('breakage', { mode })}
            />
            <!-- THE VALUE, not the mode. The card above already names the mode; this states
                 what it currently resolves to, which no card can. The on-break section has no
                 counterpart line because its mode IS its whole answer, and a line repeating
                 the selected card's own label under it said nothing. -->
            <p class="manager-muted" data-world-tool-entry-breakage-summary>
              {breakageSummaryLabel}
            </p>
            <p class="manager-muted" data-world-tool-entry-inherit-count="breakage">
              {format(
                inheritCount('breakage') === 1
                  ? 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCountOne'
                  : 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
                inheritCount('breakage') === 1
                  ? '{count} crafting system inherits this world default today.'
                  : '{count} crafting systems inherit this world default today.',
                { count: inheritCount('breakage') }
              )}
            </p>
          </section>

          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="on-break">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaks', 'When it breaks')}
            </p>
            <RadioCardGroup
              options={onBreakOptions}
              selectedValue={defaults.onBreak?.mode ?? 'destroy'}
              groupName="world-tool-onbreak-mode"
              columns={3}
              legend={sectionLabel('onBreak')}
              dataGroup="world-tool-onbreak-mode"
              optionDataAttr="data-world-tool-entry-onbreak-mode"
              onChange={(mode) => patchSection('onBreak', { mode })}
            />
            <p class="manager-muted" data-world-tool-entry-inherit-count="onBreak">
              {format(
                inheritCount('onBreak') === 1
                  ? 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCountOne'
                  : 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
                inheritCount('onBreak') === 1
                  ? '{count} crafting system inherits this world default today.'
                  : '{count} crafting systems inherit this world default today.',
                { count: inheritCount('onBreak') }
              )}
            </p>
          </section>

          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="repair">
            <!-- NO INHERIT COUNT, and the copy says why. See the header: a seed has no live
                 parent, so a count would claim an inheritance the resolver does not honour. -->
            <p class="manager-kicker">
              {text(
                'FABRICATE.Admin.Manager.Scoped.Sections.RepairRequirements',
                'Repair materials'
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
            <p class="manager-muted" data-world-tool-entry-seed-note>
              {text(
                'FABRICATE.Admin.Manager.Tools.RepairSeedNote',
                'Copied once when a system adopts this Tool, then edited there. Changing it here never reaches a system that already has it.'
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
                class="manager-world-tool-entry-inline-action"
                data-world-tool-entry-repair-clear
                onclick={() => actions?.setWorldRepairRequirements?.(entityId, [])}
              >
                {text('FABRICATE.Admin.Manager.Tools.RepairClearSeed', 'Clear the seed')}
              </ManagerButton>
            {/if}
          </section>
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

     == THE THREE-TRACK TEMPLATE IS REDECLARED, BECAUSE THE SPANS HAD NOTHING TO SPAN =======
     An earlier revision spanned rows only, on the premise that the shipped `.manager-main`
     template is `auto auto 1fr` and that a scoped redeclaration is a specificity tie resolved
     on injection order. Both halves were wrong here.

     `styles/fabricate.css:9589-9601` names `world-tool-entry` among the world-scope views and
     overrides every one of them to `grid-template-rows: minmax(0, 1fr)` — ONE track. Against
     one track the head took the whole `1fr`, the mode card and the body opened implicit rows
     below it, and the screen rendered as a 700px void with the tab panel pushed under it.

     And the tie is settled by adding the element selector: `main.manager-main[data-scoped-page]`
     is (0,3,1) against the shipped rule's (0,3,0), so it wins wherever it is injected. The
     catalogue page carries the identical rule for the identical reason.

     TWO TRACKS NOW, not three: the read-only break-mode band moved INSIDE the Breakage tab,
     so the header and the tabbed body are the whole of this screen's vertical structure. */
  main.manager-main[data-scoped-page='world-tool-entry'] {
    grid-template-rows: auto minmax(0, 1fr);
  }

  /* THE MEDALLION, THE NAME AND WHAT IT IS on the left; the actions pushed to the trailing
     edge. `flex-wrap` so a long name and three controls stack rather than crushing each
     other at a narrow window, and `margin-left: auto` on the cluster rather than a spacer. */
  .manager-world-tool-entry-head {
    display: flex;
    grid-row: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3) 0;
    min-width: 0;
  }

  .manager-world-tool-entry-medallion {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 10px;
    object-fit: cover;
  }

  .manager-world-tool-entry-identity {
    display: flex;
    flex: 1 1 12rem;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    margin-left: auto;
    min-width: 0;
  }

  /* An ELEMENT rule, not an inherited colour: Foundry's core sheet styles bare `h1`-`h6`, and
     an element rule beats whatever this heading would otherwise inherit. */
  h2.manager-world-tool-entry-name {
    margin: 0;
    color: var(--fab-mv2-text);
    font-family: var(--fab-font-serif);
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: break-word;
  }

  .manager-world-tool-entry-kind {
    margin: 0;
    font-size: 0.66rem;
  }

  /* ── THE TAB BODY'S CARDS ──────────────────────────────────────────────────────────────
     One bordered panel per decision, which is what fills a pane the segmented control alone
     left two thirds empty. */
  /* ── THIS ONE KEEPS A FILL, AND THAT IS ALSO MEASURED ───────────────────────────────────
     The flattening pass that removed the fills from the segmented tracks does NOT apply
     here. Sampled out of the design's own tool-editor frame, its three editor cards sit one
     full ramp rung above the pane — a real surface, not a border on the page colour — while
     the catalogue's list rows and inspector cards in the same design are flat ON the pane.
     The two answers differ because the surfaces differ, so each was checked against its own
     frame rather than against a rule of thumb.

     `--fab-bg-1` lands on the sampled value to the byte, so this is an index-aligned token
     rather than a new raw colour, and the seven themes keep their own ramps. */
  .manager-world-tool-entry-card {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 12px;
    background: var(--fab-bg-1);
    min-width: 0;
  }

  .manager-world-tool-entry-tile {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
    min-width: 0;
  }

  .manager-world-tool-entry-tile img {
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    object-fit: cover;
  }

  .manager-world-tool-entry-tile-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-tile-copy strong {
    color: var(--fab-mv2-text);
    font-family: var(--fab-font-serif);
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: break-word;
  }

  /* The uuid is a machine string, so it takes the mono face and truncates rather than
     wrapping a 40-character identifier over three lines. */
  .manager-world-tool-entry-tile-copy small {
    min-width: 0;
    font-family: var(--fab-font-mono);
    font-size: 0.6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* INLINE, not stretched. The button fills its flex column here because the card is a column
     of full-width blocks, and a full-width `Clear the seed` reads as the card's primary action
     rather than the small destructive escape hatch it is. The selector is `:global` because
     the class is passed into a child component and never receives this block's scoping
     attribute, so a scoped selector would be pruned as unused. */
  :global(.manager-world-tool-entry-inline-action) {
    align-self: flex-start;
  }

  .manager-world-tool-entry-hint {
    margin: 0;
    font-size: 0.62rem;
  }

  /* INFORMATION, NOT A WELL. This band states a value authored on another screen, and the
     design tints it as information rather than recessing it — `--info-soft` over
     `--info-border` in its own markup. It used to be `--fab-overlay-dark-08`, which read as
     a fourth grey surface saying nothing about why the band is there. */
  .manager-world-tool-entry-mode {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-info-border);
    border-radius: 11px;
    background: var(--fab-info-soft);
    min-width: 0;
  }

  .manager-world-tool-entry-mode i {
    color: var(--fab-info);
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
    grid-row: 2 / -1;
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
</style>
