<!-- Svelte 5 runes mode -->
<!--
  The world Tools Catalogue (issue 1373, epic 1357). IT COMPOSES `EntityCatalogueShell` AND
  BUILDS NO SECOND LIST; what this file owns is the tool-shaped configuration around it. THE
  WORLD BREAKAGE DEFAULT is neither a row nor an entity — one value for every Tool in the world —
  so it is the frame's `columnLead`, chrome above the toolbar inside the list's own column. THE
  OVERRIDE COUNT IS CONDITIONAL, a reported gap rather than a choice: the roster carries no
  per-system `toolBreakage`, and an absent field answers `0`, which is a WRONG number. THE
  INSPECTOR SAYS NOTHING ABOUT REPAIR MATERIALS, since `repairRequirements` is SEEDED and a bare
  group count is not a fact a GM can check anything against.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import {
    toolBreakageSummary,
    toolOnBreakSummary,
    toolSourceSnapshot,
  } from '../tools/toolStudio.js';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import ToolCatalogueBulkPanel from './ToolCatalogueBulkPanel.svelte';
  import {
    breakModeOverrideCount,
    breakModeOverridesKnown,
    worldBreakModeOptions,
    worldToolSearchText,
    worldToolSorts,
  } from './worldToolStudio.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    // THE GAME-WORLD ITEM ROSTER. A world Tool's `description` is a SNAPSHOT taken when the link
    // was made, so rows read `No description` under a `Linked` chip; this resolves the live Item.
    worldItems = [],
    onOpenEntry = () => {},
    onOpenSystemRules = null,
    // CREATE A WORLD TOOL FROM A DROPPED ITEM, on THIS screen because a Tool is a world record.
    // The resolution is the SHELL's: `services.resolveToolSource` reads a Foundry global, so the
    // page raises the raw drag data and the root resolves, creates and navigates.
    onCreateFromItemDrop = () => {},
  } = $props();

  // INITIALISED, and not optionally: Svelte 5 THROWS `props_invalid_value` when a bindable prop
  // has a setter and the incoming value is `undefined`.
  let selectedId = $state('');

  // AN IN-FLIGHT BULK WRITE, which inerts the panel for the duration: every `setWorldEnabled` is
  // a read-modify-write of the WHOLE payload, so two overlapping runs would each persist a
  // snapshot taken before the other's writes.
  let bulkApplying = $state(false);

  /**
   * Write the staged world master switch across every ticked Tool, then drop the selection.
   * SEQUENTIAL: each write loads, edits and writes back one payload, so a `Promise.all` would
   * have twelve writers racing it. Ticked rows under a reset axis read as an edit still pending.
   */
  async function applyBulkWorldStatus(entityIds, status, clearSelection) {
    if (bulkApplying) return;
    const enabled = status === 'on';
    bulkApplying = true;
    try {
      for (const entityId of entityIds) {
        await actions?.setWorldEnabled?.(entityId, enabled);
      }
    } finally {
      bulkApplying = false;
    }
    clearSelection();
  }

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
   * One world default read as a TOOL-SHAPED record: its sections carry the field names an
   * in-system record does, and `checkBreakable` is read from the default's own top level.
   */
  function worldDefaultTool(entry) {
    const defaults = entry?.defaults ?? {};
    return {
      breakage: defaults.breakage ?? null,
      onBreak: defaults.onBreak ?? null,
      checkBreakable: defaults.checkBreakable !== false,
    };
  }

  /**
   * The breakage badge one row wears, called with the WORLD's own resolved authority: a world
   * catalogue row has no system, so what it can truthfully state is the world's break mode.
   */
  function breakageLabel(entry) {
    const tool = worldDefaultTool(entry);
    const kind = toolBreakageSummary(tool, worldAuthority || 'toolSpecific');
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    }
    if (kind === 'breakageChance') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break', {
        count: tool.breakage?.breakageChance ?? 0,
      });
    }
    if (kind === 'diceExpression') {
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
  }

  /** The on-break badge one row wears. */
  function onBreakLabel(entry) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroys', 'Destroys'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakMarksBroken', 'Marks broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaces', 'Replaces'),
    }[toolOnBreakSummary(worldDefaultTool(entry))];
  }

  /**
   * How many crafting systems actually HAVE this Tool: the projection's JOIN filtered on
   * `member`, never `entry.systems.length`, which is the SYSTEM COUNT on every row.
   */
  function memberCount(entry) {
    const rows = Array.isArray(entry?.systems) ? entry.systems : [];
    return rows.filter((row) => row?.member === true).length;
  }

  /** What one tool's world default DOES when it breaks, in words rather than as a badge. */
  function onBreakActionLabel(entry) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with component'),
    }[toolOnBreakSummary(worldDefaultTool(entry))];
  }

  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');
  // The world break mode with the shipped fallback: an unauthored world is tool-specific.
  const worldCheckDriven = $derived((worldAuthority || 'toolSpecific') === 'checkDriven');
  const breakModeOptions = $derived(worldBreakModeOptions(worldAuthority, text));
  const overridesKnown = $derived(breakModeOverridesKnown(systems));
  const overrideCount = $derived(breakModeOverrideCount(systems, worldAuthority));

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders for
  // this route; a page with its own body states them as module constants.
  const PAGE_ID = 'world-tools';
  const PAGE_ICON = 'fas fa-screwdriver-wrench';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle';
  const TITLE_FALLBACK = 'Tools Catalogue';

  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const selectedEntry = $derived(entries.find((entry) => entry.id === selectedId) ?? null);

  const sorts = $derived(worldToolSorts(text, breakageLabel));

  // THE WORLD-DEFAULT CARDS, THROUGH THE SHELL RATHER THAN BESIDE IT: the TITLE names the value
  // and the NOTE qualifies it, and the inherit count keeps its `data-scoped-list-inherit-count`
  // hook. The BREAKAGE GLYPH follows the world break mode, because that mode decides whether
  // this section is consulted at all.
  const sectionIcons = $derived({
    breakage: worldCheckDriven ? 'fas fa-dice-d20' : 'fas fa-hourglass-half',
    onBreak: 'fas fa-heart-crack',
    prerequisites: 'fas fa-user-shield',
    bonus: 'fas fa-plus-minus',
  });

  /**
   * The `prerequisites` card's title. The wording is the SHIPPED preview copy for the same fact
   * at system scope, so the catalogue and the editor cannot describe one rule two ways.
   */
  function prerequisiteLabel(entry) {
    const prerequisites = entry?.defaults?.prerequisites;
    const ids = Array.isArray(prerequisites?.ids) ? prerequisites.ids : [];
    if (prerequisites?.enabled !== true) {
      return text(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewPrerequisitesDisabled',
        'No prerequisites to use'
      );
    }
    return format(
      ids.length === 1
        ? 'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteOne'
        : 'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteCount',
      ids.length === 1 ? '1 prerequisite' : '{count} prerequisites',
      { count: ids.length }
    );
  }

  /** The world-default `bonus` card's title: what the Tool adds to the check. */
  function bonusLabel(entry) {
    const bonus = entry?.defaults?.bonus;
    const expression = String(bonus?.expression ?? '').trim();
    if (bonus?.enabled !== true || expression === '') {
      return text('FABRICATE.Admin.Manager.Tools.Editor.PreviewBonusDisabled', 'No check bonus');
    }
    return format('FABRICATE.Admin.Manager.Tools.Editor.PreviewBonusValue', 'Adds {expression}', {
      expression,
    });
  }

  const sectionTitles = $derived(
    selectedEntry
      ? {
          breakage: breakageLabel(selectedEntry),
          onBreak: format(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreakValue',
            'On break: {action}',
            { action: onBreakActionLabel(selectedEntry).toLocaleLowerCase() }
          ),
          prerequisites: prerequisiteLabel(selectedEntry),
          bonus: bonusLabel(selectedEntry),
        }
      : {}
  );

  // The note says what the rule DOES rather than restating the arithmetic above it.
  const sectionNotes = $derived(
    selectedEntry
      ? {
          breakage: worldCheckDriven
            ? text(
                'FABRICATE.Admin.Manager.Tools.Editor.PreviewCheckDriven',
                'Check-driven \u00b7 follows the crafting roll'
              )
            : text(
                'FABRICATE.Admin.Manager.Tools.Editor.PreviewToolSpecific',
                'Tool-specific \u00b7 tracked per copy'
              ),
          onBreak: text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreak',
            'Runs immediately after breakage'
          ),
          prerequisites:
            selectedEntry.defaults?.prerequisites?.enabled === true
              ? text(
                  'FABRICATE.Admin.Manager.Tools.Editor.PreviewPrerequisites',
                  'A character must satisfy every selected prerequisite'
                )
              : text(
                  'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoPrerequisites',
                  'Any character may use it'
                ),
          bonus:
            selectedEntry.defaults?.bonus?.enabled === true
              ? text(
                  'FABRICATE.Admin.Manager.Tools.Editor.PreviewBonus',
                  'Added to the crafting check'
                )
              : text(
                  'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoBonus',
                  'Adds nothing to the crafting check'
                ),
        }
      : {}
  );

  // NO EXTRA CARD: `repairRequirements` went with the entry editor's section (issue 1373), for
  // the reason that removal gives — a repair group names quantities over the OWNING SYSTEM's
  // components, which world scope cannot address. `extraCards` stays the shell's slot.

  /**
   * The LINKED ITEM's own description, for the frame's second description rung; the frame owns
   * the PRECEDENCE — the authored description first, this second, the literal last.
   */
  function describeFromLinkedItem(entry) {
    const entity = entry?.entity ?? null;
    if (!entity) return '';
    return toolSourceSnapshot(entity, worldItems).description || '';
  }

  /**
   * One row's NAME when the display label is blank: the entry draws that label as OPTIONAL, so
   * `scopedEntryName` would print the record id, and only this page holds the Item roster.
   * `toolSourceSnapshot` is not used: its `Unlinked Tool` is right for a tile, wrong for a name.
   */
  function nameFromLinkedItem(entry) {
    const uuid = String(entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || '');
    if (!uuid) return '';
    return String(worldItems.find((item) => item?.uuid === uuid)?.name ?? '').trim();
  }

  const catalogueTitle = $derived(text(TITLE_KEY, TITLE_FALLBACK));
</script>

<main class="manager-main" data-scoped-page="world-tools" aria-label={catalogueTitle}>
  <EntityCatalogueShell
    {scope}
    {actions}
    {systems}
    hookValue={PAGE_ID}
    title={catalogueTitle}
    subtitle={text(
      'FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle',
      'One Tool per game-world Item, shared by every system.'
    )}
    icon={PAGE_ICON}
    emptyTitle={text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}
    emptyHint={text(
      'FABRICATE.Admin.Manager.Scoped.ToolCatalogueEmptyHint',
      'Tools lifted to world scope appear here, each shared by every crafting system that adopts it.'
    )}
    {sorts}
    searchOf={worldToolSearchText}
    {sectionIcons}
    {sectionTitles}
    {sectionNotes}
    inspectorKicker={text('FABRICATE.Admin.Manager.Scoped.Tool.InspectorKicker', 'Tool page')}
    countUnit={text('FABRICATE.Admin.Manager.Scoped.Tool.CountUnit', 'tools')}
    selectAllLabel={text('FABRICATE.Admin.Manager.Scoped.Tool.SelectAllShort', 'All')}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Scoped.Tool.SearchPlaceholder',
      'Search tools…'
    )}
    inspectorFoot={toolInspectorFoot}
    inspectorCaption={toolInspectorCaption}
    describeEntry={describeFromLinkedItem}
    nameEntry={nameFromLinkedItem}
    listLead={toolCreateZone}
    columnLead={toolScopeBand}
    bulk={toolBulkEdit}
    restingTitle={text('FABRICATE.Admin.Manager.Tools.SelectTitle', 'Select a Tool')}
    restingHint={text(
      'FABRICATE.Admin.Manager.Tools.SelectHint',
      'Choose a Tool to inspect its behaviour.'
    )}
    openEntryLabel={text('FABRICATE.Admin.Manager.Scoped.Tool.RowOpenEntry', 'Edit tool')}
    rowSecondLine="meta"
    systemRowAction="navigate"
    membershipFilter={false}
    autoSelectFirst
    bind:selectedId
    onSelect={(entityId) => (selectedId = entityId)}
    {onOpenEntry}
    {onOpenSystemRules}
    {rowMeta}
    {rowTrailing}
  />
</main>

<!--
  THE INSPECTOR'S BULK FACE (issue 1373): the frame swaps the identity panel for this the moment
  a row is ticked and had none to swap to. `ctx.clearSelection` is the FRAME's own.
-->
{#snippet toolBulkEdit(selectedIds, ctx)}
  <ToolCatalogueBulkPanel
    count={selectedIds.length}
    applying={bulkApplying}
    onClearSelection={() => ctx?.clearSelection?.()}
    onApply={(status) => applyBulkWorldStatus(selectedIds, status, () => ctx?.clearSelection?.())}
  />
{/snippet}

<!--
  THE SCOPE BAND: the world break mode, above the list and INSIDE THE LIST'S OWN COLUMN. As a
  sibling of the shell it stood over the inspector's track too, starting the panel a card's
  height below the header. It is the frame's `columnLead` now, so `<main>` holds ONE child.
-->
{#snippet toolScopeBand()}
  <InspectorCard class="manager-world-tool-break-card" data-world-tool-break-mode="">
    <div class="manager-world-tool-break-head">
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span class="manager-world-tool-break-title"
        >{text('FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle', 'World breakage default')}</span
      >
      {#if overridesKnown}
        <span class="manager-world-tool-break-count" data-world-tool-break-overrides>
          {format(
            overrideCount === 1
              ? 'FABRICATE.Admin.Manager.Tools.WorldAuthorityOverrideOne'
              : 'FABRICATE.Admin.Manager.Tools.WorldAuthorityOverrideCount',
            overrideCount === 1 ? '{count} system overrides it' : '{count} systems override it',
            { count: overrideCount }
          )}
        </span>
      {/if}
    </div>
    <div
      class="manager-world-tool-break-segments"
      role="radiogroup"
      aria-label={text(
        'FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle',
        'World breakage default'
      )}
    >
      {#each breakModeOptions as option (option.value)}
        <label class:is-selected={option.selected} data-world-tool-break-segment={option.value}>
          <input
            type="radio"
            name="world-tool-breakage-authority"
            value={option.value}
            checked={option.selected}
            onchange={() => actions?.setWorldToolBreakage?.(option.value)}
          />
          <span class="manager-world-tool-break-option">
            <i class={option.icon} aria-hidden="true"></i>
            <span>{option.label}</span>
          </span>
        </label>
      {/each}
    </div>
    <!-- WHAT THE SELECTED MODE MEANS, not a sentence naming the segment already highlighted two
       lines above it and the override count on either side of it. -->
    <p class="manager-muted manager-world-tool-break-note">
      {(worldAuthority || 'toolSpecific') === 'checkDriven'
        ? text(
            'FABRICATE.Admin.Manager.Tools.WorldAuthorityNoteCheckDriven',
            'The active check decides breakage \u00b7 world default for every system'
          )
        : text(
            'FABRICATE.Admin.Manager.Tools.WorldAuthorityNoteToolSpecific',
            'Each Tool tracks its own breakage \u00b7 world default for every system'
          )}
    </p>
  </InspectorCard>
{/snippet}

<!--
  THE LIST'S FIRST ELEMENT: the surface that makes a Tool, on THIS screen because a Tool is a
  world record. The resolution is the SHELL's, since `resolveToolSource` reads a Foundry global.
-->
{#snippet toolCreateZone()}
  <!-- `data-tool-create-card` IS A STYLING HOOK, not a test hook (issue 1509): the host sheet
       widens this prompt to the list's full width through it. That rule is application-rooted,
       which leaves `fabricate-link-field` host-dependent for THIS caller alone — issue 1507. -->
  <ItemDropZone
    kind="tool-create"
    hookAttrs={{
      root: { 'data-tool-create-card': true, 'data-tool-create-drop-prompt': true },
    }}
    title={text(
      'FABRICATE.Admin.Manager.Tools.CreateDropTitle',
      'Drag an Item here to make it a Tool'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Tools.CreateDropHint',
      'Drop an Item from the Items directory or a compendium.'
    )}
    onDrop={onCreateFromItemDrop}
  />
{/snippet}

<!--
  THE INSPECTOR'S ONE PRIMARY ACTION, PINNED TO ITS FOOT, which is what makes the panel a place a
  GM ACTS from. The frame owns the pinning and this snippet owns the verb.
-->
{#snippet toolInspectorFoot(entry)}
  <!-- NO GLYPH: the external-link mark belongs to the ROW buttons, which leave the catalogue;
       this opens the record the panel above it is already describing. -->
  <InspectorActionButton
    tone="primary"
    label={text('FABRICATE.Admin.Manager.Scoped.Tool.OpenEntry', 'Edit tool')}
    data-scoped-tool-open-entry
    onClick={() => onOpenEntry(entry.id)}
  />
{/snippet}

<!--
  THE INSPECTOR'S STATE PILL states the WORLD master switch, the only honest thing this panel can
  say about a Tool's state: world off wins over every system's own flag.
-->
{#snippet toolInspectorCaption(entry)}
  <!-- THE WORD ALONE: a leading dot on a two-letter label carries nothing the word does not.
       The TONE still separates the two states. -->
  <Chip
    tone={entry?.worldEnabled === false ? 'neutral' : 'positive'}
    data-world-tool-inspector-state={entry?.worldEnabled === false ? 'off' : 'on'}
  >
    {entry?.worldEnabled === false
      ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
      : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
  </Chip>
{/snippet}

{#snippet rowMeta(entry)}
  <span class="manager-world-tool-row-badges" data-world-tool-row-badges={entry.id}>
    <Chip tone="neutral" data-world-tool-row-breakage>{breakageLabel(entry)}</Chip>
    <Chip tone="neutral" data-world-tool-row-onbreak>{onBreakLabel(entry)}</Chip>
    <!-- HOW MANY SYSTEMS HAVE IT, as plain text rather than a third chip: the chips beside it
         are what the Tool DOES, and this is how far it reaches. -->
    <span class="manager-world-tool-row-reach" data-world-tool-row-systems={entry.id}>
      {format(
        memberCount(entry) === 1
          ? 'FABRICATE.Admin.Manager.Scoped.List.SystemCountOne'
          : 'FABRICATE.Admin.Manager.Scoped.List.SystemCount',
        memberCount(entry) === 1 ? '{count} system' : '{count} systems',
        { count: memberCount(entry) }
      )}
    </span>
  </span>
{/snippet}

<!--
  THE WORLD MASTER SWITCH, a DIFFERENT control from the per-system toggle: `resolveScopedDefinition`
  ANDs the two flags. It is `rowTrailing` rather than part of `rowMeta`, and the split is
  structural: `rowMeta` sits inside the identity `<button>`, and a nested `<button>` is invalid.
-->
{#snippet rowTrailing(entry)}
  {#if scope?.worldEnableable}
    <StatusToggle
      class="manager-tools-enabled-toggle"
      on={entry.worldEnabled !== false}
      data-world-tool-row-enabled={entry.id}
      ariaLabel={format(
        entry.worldEnabled === false
          ? 'FABRICATE.Admin.Manager.Tools.WorldEnableAria'
          : 'FABRICATE.Admin.Manager.Tools.WorldDisableAria',
        entry.worldEnabled === false
          ? 'Enable {name} for every crafting system'
          : 'Disable {name} for every crafting system',
        { name: entry.entity?.name || entry.id }
      )}
      onclick={() => actions?.setWorldEnabled?.(entry.id, entry.worldEnabled === false)}
    />
  {/if}
{/snippet}

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. `styles/fabricate.css` is closed
     to this lane, and nothing else renders this markup. */

  /* NO GRID OF ITS OWN ANY MORE: the band is the frame's `columnLead`, so `<main>` holds exactly
     one child and the host sheet's single `minmax(0, 1fr)` track is already right for it. */

  /* `:global()` AND CHAINED (issue 1427's rule): this class sits on an `<InspectorCard>` tag, so
     Svelte stamps no hash onto it and prunes the local selector, which `lint:svelte:warnings`
     fails on. `.manager-inspector-card` is chained for the specificity the hash carried. */
  :global(.manager-inspector-card.manager-world-tool-break-card) {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .manager-world-tool-break-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-world-tool-break-head i {
    color: var(--fab-accent);
    font-size: 0.7rem;
  }

  .manager-world-tool-break-title {
    color: var(--fab-text);
    font-size: 0.75rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  /* PUSHED to the trailing edge rather than absolutely positioned, so a long count wraps under. */
  .manager-world-tool-break-count {
    margin-left: auto;
    color: var(--fab-text-muted);
    font-size: 0.6rem;
    font-weight: 600;
    text-align: right;
  }

  /* The shipped segmented-control treatment, matched to `.manager-tools-authority-segments`, and
     WRAPPING rather than shrinking as a floor under a narrow card. THE TRACK'S FILL IS STATED
     RATHER THAN INHERITED: `proto:1965` paints it `--bg1` inside a `--bg2` card, and removing the
     declaration shows not the pane but the card's own lightening overlay — the one value the
     design says the track is not. */
  .manager-world-tool-break-segments {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: var(--fab-space-2xs);
    padding: var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-0);
    min-width: 0;
  }

  .manager-world-tool-break-segments label {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
    border-radius: 7px;
    cursor: pointer;
  }

  .manager-world-tool-break-segments label.is-selected {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .manager-world-tool-break-segments input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .manager-world-tool-break-option {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .manager-world-tool-break-note {
    margin: 0;
    font-size: 0.62rem;
  }

  .manager-world-tool-row-badges {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* A muted count rather than a chip: a third pill would read as a third property of the Tool. */
  .manager-world-tool-row-reach {
    color: var(--fab-text-muted);
    font-size: 0.6rem;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
