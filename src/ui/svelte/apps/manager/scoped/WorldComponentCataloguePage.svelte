<!-- Svelte 5 runes mode -->
<!--
  The world Component Catalogue (issue 1371, epic 1357). IT COMPOSES `EntityCatalogueShell` AND
  BUILDS NO SECOND LIST; what this file owns is the component-shaped configuration around it.
  THE ROW CARRIES TWO REACH STATS AND, SINCE M30, ITS ESSENCE CHIPS — the stats are reach facts
  rather than behaviour facts, so neither is a chip, and the chips, the toolbar's essence select
  and the bulk panel's `n/N` all read one map through `componentWorldEssenceMap`. THE STANDING
  NOTE IS NARROWER THAN "NOTHING HERE IS READ": the world `category` IS consumed, while the name,
  art, description and tag list are not. THE DROP ZONE RESOLVES BEFORE IT MINTS, in the ROOT.
-->
<script>
  import { localize, notifyError } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import Chip from '../../../components/Chip.svelte';
  import EssenceChip from '../components/EssenceChip.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import ComponentCatalogueBulkPanel from './ComponentCatalogueBulkPanel.svelte';
  import {
    componentAliasNote,
    componentBulkDeletePlan,
    componentBulkEssencePlan,
    componentEssenceFilter,
    componentGlobalTagNote,
    componentMembershipScopeFilter,
    componentRowEssenceChips,
    componentRowStats,
    componentSearchText,
    componentSorts,
    componentSourceBroken,
    componentSourceFilters,
    componentSourceLine,
    componentSourceType,
    componentWorldCategoryNote,
    worldVocabularyComponentCategories,
    worldVocabularyComponentTags,
  } from './componentScoped.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    // THE SYSTEM THE RAIL HAS SELECTED, which the membership filter's options interpolate; `''`
    // withholds the two system-relative options rather than printing a half sentence.
    systemId = '',
    // THE GAME-WORLD ITEM ROSTER, for the create zone and for a row with no description of its own.
    worldItems = [],
    // THE WORLD ESSENCE CATALOGUE'S ROSTER (M25, M30), whose order the chips and filter follow.
    worldEssences = [],
    onOpenEntry = () => {},
    onOpenSystemRules = null,
    // THE VOCABULARY EXIT, handed back to the owner, which runs the unsaved-changes guard first.
    onOpenVocabulary = null,
    onCreateFromItemDrop = () => {},
    // THE LIST'S LIFTED VIEW-STATE, owned by the manager root: opening an entry unmounts this
    // page, so a slot held locally would be destroyed by the trip it exists to survive.
    browserState = $bindable(null),
  } = $props();

  // INITIALISED, and not optionally: a bindable prop with a setter THROWS on `undefined`.
  let selectedId = $state('');

  // AN IN-FLIGHT BULK WRITE: each action rewrites the WHOLE payload, so two runs cannot overlap.
  let bulkApplying = $state(false);

  // AN IN-FLIGHT BULK DELETE, held apart because the two put DIFFERENT controls into a busy state.
  let bulkDeleting = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function phrase(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders.
  const PAGE_ID = 'world-components';
  const PAGE_ICON = 'fas fa-cubes-stacked';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle';
  const TITLE_FALLBACK = 'Component catalogue';

  /**
   * THE ROW'S LEADING TILE (`proto:600`): a borderless slate square. A MODULE CONSTANT rather
   * than an inline literal, because a fresh object every render re-runs the frame's merge and
   * re-diffs every medallion on every keystroke. No `tint`: a world category is a bare string.
   */
  const COMPONENT_ROW_MEDALLION = Object.freeze({
    variant: 'glyph-chip',
    size: 38,
    glyph: 15,
  });

  const catalogueTitle = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const selectedEntry = $derived(entries.find((entry) => entry.id === selectedId) ?? null);
  const systemCount = $derived(Array.isArray(systems) ? systems.length : 0);
  const addressedSystemName = $derived(
    String(
      (Array.isArray(systems) ? systems : []).find(
        (system) => String(system?.id ?? '') === String(systemId ?? '')
      )?.name ?? ''
    )
  );
  // THE SOURCE FILTER TAKES THE ITEM ROSTER, because `Broken link` is a RESOLUTION question.
  const filters = $derived([
    ...componentSourceFilters({ worldItems }, phrase),
    // THE ESSENCE FILTER FOLLOWS THE SOURCE SELECT ON THE LEAD ROW (M30), as the rules list does.
    ...componentEssenceFilter({ essences: worldEssences, systems }, phrase),
    ...componentMembershipScopeFilter({ systemId, systemName: addressedSystemName }, phrase),
  ]);
  const sorts = $derived(componentSorts(phrase));

  // THE BULK INSETS OFFER THE WORLD VOCABULARY AND NOTHING ELSE (M18): the union of what the
  // records carry offered the SYSTEMS' categories as the world's, and missed unapplied tags.
  const categoryOptions = $derived(worldVocabularyComponentCategories(scope));
  const tagOptions = $derived(worldVocabularyComponentTags(scope));

  // THE ONE WORLD-DEFAULT CARD, THROUGH THE SHELL; its TITLE names the VALUE, its NOTE the reach.
  const sectionIcons = { category: 'fas fa-layer-group' };

  const sectionTitles = $derived(
    selectedEntry
      ? {
          category:
            String(selectedEntry.defaults?.category ?? '').trim() ||
            text('FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory', 'No world category'),
        }
      : {}
  );

  const sectionNotes = $derived(
    selectedEntry ? { category: componentWorldCategoryNote(selectedEntry, phrase) } : {}
  );

  /**
   * The LINKED ITEM's own description, for the frame's second rung: a world component's own
   * `description` is a SNAPSHOT, so without this every such row reads `No description`.
   */
  function describeFromLinkedItem(entry) {
    const entity = entry?.entity ?? null;
    if (!entity) return '';
    const uuid = String(entity.registeredItemUuid || entity.originItemUuid || '');
    if (!uuid) return '';
    return String(worldItems.find((item) => item?.uuid === uuid)?.description ?? '').trim();
  }

  /** One row's NAME when the world label is blank; only this page holds the Item roster. */
  function nameFromLinkedItem(entry) {
    const uuid = String(entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || '');
    if (!uuid) return '';
    return String(worldItems.find((item) => item?.uuid === uuid)?.name ?? '').trim();
  }

  /**
   * Run ONE write of a bulk run, and treat a throw exactly as the store's own refusal is treated.
   * `### GM World Component Screens` requirement 6 makes a refusal REPORTED rather than thrown;
   * an uncaught throw broke that promise from the other side, stopping the loop with a page of
   * rows ticked and no statement of which were written. `updateWorldDefaultSection` and
   * `setWorldTags` are RAW verbs with no wrapper. THE UNIT IS THE COMPONENT, not the write.
   */
  async function attemptWrite(failed, entityId, write) {
    try {
      await write();
    } catch {
      failed.add(entityId);
    }
  }

  /** How much of a bulk run did not land, counted not named; silent when it all did. */
  function reportBulkFailures(failed) {
    if (failed.size === 0) return;
    notifyError(
      failed.size === 1
        ? text(
            'FABRICATE.Admin.Manager.Scoped.Component.BulkWriteFailedOne',
            'One component could not be updated. The rest of the run finished.'
          )
        : phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.BulkWriteFailed',
            '{count} components could not be updated. The rest of the run finished.',
            { count: failed.size }
          )
    );
  }

  /**
   * Apply one staged bulk instruction, then drop the selection. SEQUENTIAL: twelve components
   * across three systems is thirty-six writers racing one setting. The selection clears even
   * when a write threw, because a half-written run under a re-armed Apply invites a second one.
   */
  async function applyBulk(entityIds, staged, clearSelection) {
    // BELT AND BRACES, AND NOT REACHABLE FROM THIS SURFACE; it defends the other callers.
    if (bulkApplying) return;
    bulkApplying = true;
    // A per-run tally, never state: it is read once, in `reportBulkFailures`, after the loop.
    const failed = new Set();
    try {
      for (const entityId of entityIds) {
        for (const systemId of staged.systemIds ?? []) {
          if (staged.mode === 'add') {
            await attemptWrite(failed, entityId, () => actions?.addToSystem?.(entityId, systemId));
          } else if (staged.mode === 'remove') {
            await attemptWrite(failed, entityId, () =>
              actions?.removeFromSystem?.(entityId, systemId)
            );
          }
        }
        if (staged.category !== null && staged.category !== undefined) {
          await attemptWrite(failed, entityId, () =>
            actions?.updateWorldDefaultSection?.(entityId, 'category', staged.category)
          );
        }
        const addTags = staged.addTags ?? [];
        const removeTags = staged.removeTags ?? [];
        if (addTags.length > 0 || removeTags.length > 0) {
          // `setWorldTags` REPLACES the whole list, so the next list is computed per component
          // from the one it holds; writing the staged tags alone would delete every unticked tag.
          const current = entries.find((entry) => entry.id === entityId)?.defaults?.tags ?? [];
          const next = [...new Set([...current, ...addTags])].filter(
            (tag) => !removeTags.includes(tag)
          );
          await attemptWrite(failed, entityId, () => actions?.setWorldTags?.(entityId, next));
        }
      }
      // THE ESSENCE AXIS WRITES THE WORLD SECTION, ONE RECORD AT A TIME (M31): the section is
      // REPLACED, so the plan merges over each record's current map and skips an unchanged one.
      for (const { entityId, essences } of componentBulkEssencePlan(
        entityIds,
        staged.essences ?? {},
        { entries, systems }
      )) {
        await attemptWrite(failed, entityId, () =>
          actions?.updateWorldDefaultSection?.(entityId, 'essences', essences)
        );
      }
    } finally {
      bulkApplying = false;
      // IN THE `finally` AS BELT AND BRACES, against a throw from something that is NOT a write.
      clearSelection();
      reportBulkFailures(failed);
    }
  }

  /**
   * Delete every ticked component, then drop the selection. SEQUENTIAL and more sharply so:
   * `deleteEntity` also sweeps every membership record, so one entity would come back.
   */
  async function deleteBulk(entityIds, clearSelection) {
    if (bulkDeleting || bulkApplying) return;
    // ONLY WHAT THE PLAN SAYS MAY GO (epic decision 7). The control stays ENABLED per requirement
    // 16, so the refusal is enforced HERE too: a rule a GM can walk into may not live in a label.
    const { deletable } = componentBulkDeletePlan(entries, entityIds);
    if (deletable.length === 0) {
      clearSelection();
      return;
    }
    bulkDeleting = true;
    const failed = new Set();
    try {
      for (const entityId of deletable) {
        await attemptWrite(failed, entityId, () => actions?.deleteEntity?.(entityId));
      }
    } finally {
      bulkDeleting = false;
      clearSelection();
      reportBulkFailures(failed);
    }
  }
</script>

<!--
  THE FOUR PRIMITIVE SEAMS THIS SCREEN CONSUMES, each wired below rather than restyled in place
  so the essence and tool catalogues do not move: `toolbarLeadSize="38"` (the LEAD ROW's own
  published rung, which the three controls below deliberately do not take), `rowMedallion`
  (`proto:600`'s borderless tile), `rosterRecessed` / `rosterSearchWell`, and `autoSelectFirst`.
-->
<main class="manager-main" data-scoped-page="world-components" aria-label={catalogueTitle}>
  <EntityCatalogueShell
    {scope}
    {actions}
    {systems}
    hookValue={PAGE_ID}
    title={catalogueTitle}
    subtitle={text(
      'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueSubtitle',
      "One component per source item — identity only. Crafting behaviour lives in each system's own component rules."
    )}
    icon={PAGE_ICON}
    emptyTitle={text('FABRICATE.Admin.Manager.Scoped.Component.EmptyTitle', 'No components yet')}
    emptyHint={text(
      'FABRICATE.Admin.Manager.Scoped.Component.EmptyHint',
      'Drop an Item here to make it a component, and every crafting system can then adopt the same one.'
    )}
    {filters}
    {sorts}
    searchOf={componentSearchText}
    {sectionIcons}
    {sectionTitles}
    {sectionNotes}
    inspectorKicker={text(
      'FABRICATE.Admin.Manager.Scoped.Component.InspectorKicker',
      'Catalogue entry'
    )}
    showWorldDefaults={false}
    inspectorBodyPlacement="lead"
    countUnit={text('FABRICATE.Admin.Manager.Scoped.Component.CountUnit', 'components')}
    selectAllLabel={text('FABRICATE.Admin.Manager.Scoped.Component.SelectAllShort', 'All')}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Scoped.Component.SearchPlaceholder',
      'Search catalogue by name or source item…'
    )}
    inspectorBody={componentInspectorBody}
    inspectorFoot={componentInspectorFoot}
    inspectorCaption={componentInspectorCaption}
    describeEntry={describeFromLinkedItem}
    nameEntry={nameFromLinkedItem}
    listLead={componentCreateZone}
    bulk={componentBulkEdit}
    restingTitle={text(
      'FABRICATE.Admin.Manager.Scoped.Component.SelectTitle',
      'Select a component'
    )}
    restingHint={text(
      'FABRICATE.Admin.Manager.Scoped.Component.SelectHint',
      'Choose a component to inspect where it is used.'
    )}
    openEntryLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.RowOpenEntry',
      'Open catalogue entry'
    )}
    openEntryLabelled={false}
    rowSecondLine="description"
    rowSourceBadge={false}
    splitToolbar
    toolbarLeadSize="38"
    selectAllScope="shown"
    rowMedallion={COMPONENT_ROW_MEDALLION}
    rosterRecessed
    rosterSearchWell
    systemRowAction="navigate"
    rosterEmptyNote={text(
      'FABRICATE.Admin.Manager.Scoped.Component.RosterEmpty',
      'No system has rules for this component yet. It is registered in the world but unused — recipes cannot reference it anywhere.'
    )}
    membershipFilter={false}
    autoSelectFirst
    flushColumn
    flushBulkDock
    bind:browserState
    bind:selectedId
    onSelect={(entityId) => (selectedId = entityId)}
    {onOpenEntry}
    {onOpenSystemRules}
    rowNameTrailing={componentRowNameTrailing}
    rowMeta={componentRowEssences}
    rowTrailing={componentRowStatColumns}
  />
</main>

<!--
  THE LIST'S FIRST ELEMENT: the surface that makes a component, and NOTHING beside it, on THIS
  screen because a world component is a world record. THE ZONE TAKES THE WHOLE ROW (M13).
-->
{#snippet componentCreateZone()}
  <ItemDropZone
    kind="component-create"
    title={text(
      'FABRICATE.Admin.Manager.Scoped.Component.CreateDropTitle',
      'Drag an Item here to make it a component'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Scoped.Component.CreateDropHint',
      'Drop an Item from the Items directory or a compendium.'
    )}
    onDrop={onCreateFromItemDrop}
  />
{/snippet}

{#snippet componentBulkEdit(selectedIds, ctx)}
  <ComponentCatalogueBulkPanel
    count={selectedIds.length}
    {systems}
    {categoryOptions}
    {tagOptions}
    essences={worldEssences}
    {entries}
    {selectedIds}
    applying={bulkApplying}
    deleting={bulkDeleting}
    deletePlan={componentBulkDeletePlan(entries, selectedIds)}
    onClearSelection={() => ctx?.clearSelection?.()}
    onApply={(staged) => applyBulk(selectedIds, staged, () => ctx?.clearSelection?.())}
    onDelete={actions?.deleteEntity
      ? () => deleteBulk(selectedIds, () => ctx?.clearSelection?.())
      : null}
  />
{/snippet}

<!--
  THE LINE UNDER THE NAME IS THE SOURCE, not a category chip: a category is a value some system
  may resolve, and the SOURCE is what the entry is. The category is drawn in the card below.
-->
{#snippet componentInspectorCaption(entry)}
  <span
    class="manager-world-component-source-line"
    data-world-component-inspector-source={entry?.id ?? ''}>{componentSourceLine(entry, text)}</span
  >
{/snippet}

{#snippet componentInspectorBody(entry)}
  <div class="manager-world-component-inspector">
    <!-- TWO INSET CARDS AND NOTHING ELSE: `Used by` belongs on the ENTRY's rail, the zero-member
         sentence is the roster's own empty state, and the disclosure was clipped by the foot. -->
    <section class="manager-scoped-inspector-inset" data-world-component-source-card={entry.id}>
      <p class="manager-micro-label">
        {text('FABRICATE.Admin.Manager.Scoped.Component.SourceIdentity', 'Source identity')}
      </p>
      <p class="manager-world-component-inspector-uuid" data-world-component-inspector-uuid>
        {String(entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || '').trim() ||
          text('FABRICATE.Admin.Manager.Scoped.Component.SourceNone', 'No source item')}
      </p>
      <p class="manager-world-component-inspector-note" data-world-component-alias-note>
        {componentAliasNote(entry, phrase)}
      </p>
    </section>

    <section class="manager-scoped-inspector-inset" data-world-component-tag-card={entry.id}>
      <div class="manager-world-component-inspector-head">
        <p class="manager-micro-label">
          {text('FABRICATE.Admin.Manager.Scoped.Component.GlobalTags', 'Global tags')}
        </p>
        <!-- A BARE ACCENT-INK TEXT ACTION: `role="ghost"` carries a hover fill and a control height,
             and this is a 9px link inside a 10px head row. -->
        {#if onOpenVocabulary}
          <button
            type="button"
            class="manager-inline-link"
            data-keyboard-focus="true"
            data-world-component-vocabulary-exit
            onclick={() => onOpenVocabulary()}
          >
            {text('FABRICATE.Admin.Manager.Scoped.Component.EditShort', 'Edit')}
            <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </button>
        {/if}
      </div>
      <p
        class="manager-world-component-inspector-category"
        data-world-component-inspector-category={entry.id}
      >
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        {#if String(entry?.defaults?.category ?? '').trim()}
          <span>{String(entry.defaults.category).trim()}</span>
        {:else}
          <span class="is-unset"
            >{text(
              'FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory',
              'No world category'
            )}</span
          >
        {/if}
      </p>
      <div
        class="manager-world-component-inspector-tags"
        data-world-component-global-tags={entry.id}
      >
        <!--
          THE WORLD TAG IS A LIT MICRO PILL, AND IT TAKES BOTH OF `Chip`'S AXES (`proto:757`):
          `emphasis="lit"` is the PAINT and `density="list"` the SCALE, the shipped one rather
          than a new value a pixel from it. NOT `tag-run`, which is a CONTROL; this is a badge.
        -->
        {#each entry?.defaults?.tags ?? [] as tag (tag)}
          <Chip tone="tag" emphasis="lit" density="list" data-world-component-global-tag={tag}
            >{tag}</Chip
          >
        {:else}
          <span class="manager-world-component-inspector-empty"
            >{text('FABRICATE.Admin.Manager.Scoped.Component.NoGlobalTags', 'No global tags')}</span
          >
        {/each}
      </div>
      <p class="manager-world-component-inspector-note" data-world-component-tag-note={entry.id}>
        {componentGlobalTagNote(entry, phrase)}
      </p>
    </section>
  </div>
{/snippet}

<!--
  THE INSPECTOR'S ONE PRIMARY ACTION, PINNED TO ITS FOOT: the frame owns the pinning and this
  owns the verb. NO GLYPH — the external-link mark belongs to the ROW buttons, which leave.
-->
{#snippet componentInspectorFoot(entry)}
  <InspectorActionButton
    tone="primary"
    label={text('FABRICATE.Admin.Manager.Scoped.Component.OpenEntry', 'Open catalogue entry')}
    data-scoped-component-open-entry
    onClick={() => onOpenEntry(entry.id)}
  />
{/snippet}

<!--
  THE NAME LINE'S TWO PILLS (`proto:601`). It renders INSIDE the identity `<button>`, so neither
  may be interactive; the frame's own badge answered a different question.
-->
{#snippet componentRowNameTrailing(entry)}
  {@const linked = entry?.hasSourceLink === true}
  {@const broken = componentSourceBroken(entry, worldItems)}
  <span class="manager-world-component-row-source" data-world-component-row-source-pill={entry.id}>
    <!--
      THE BARE FACE (`proto:601`): an UNBORDERED stadium, against a shipped pill that measured six
      lines against it — all declared inside the primitive's UNLAYERED scoped block, which no
      page rule could beat. IT KEEPS THE TONE, and takes `density="list"` for its height floor.
    -->
    <Chip
      tone={statusChipTone(linked ? 'subtle' : 'warning')}
      emphasis="bare"
      density="list"
      icon={linked ? 'fas fa-link' : 'fas fa-link-slash'}>{componentSourceType(entry, text)}</Chip
    >
  </span>
  {#if broken}
    <!--
      THE ONE EXCEPTION FLAG THE REFERENCE PUTS IN THIS SLOT. It does NOT take `emphasis="bare"`:
      `proto:3893` draws the flag with a REAL edge, and one that lost it would read as the badge
      beside it. `density="list"` FOR THE PAIR.
    -->
    <span class="manager-world-component-row-flag" data-world-component-row-flag={entry.id}>
      <Chip tone="warning" density="list" icon="fas fa-link-slash"
        >{text('FABRICATE.Admin.Manager.Scoped.Component.FlagBrokenLink', 'Broken link')}</Chip
      >
    </span>
  {/if}
{/snippet}

<!--
  THE ROW'S ESSENCE CHIPS (M30): the prototype's catalogue row draws none, so this is a ruled
  extra, and it wears the rules row's chip exactly so a GM reads one chip on both screens. It
  renders through the frame's opt-in `rowMeta`, which lands before `rowTrailing`'s stat columns
  and outside the identity button. IT IS `EssenceChip`, NOT A HAND-ROLLED `Chip` (M29): the
  hand-rolled run dropped the one part nobody restates, the COLOUR.
-->
{#snippet componentRowEssences(entry)}
  {@const chips = componentRowEssenceChips(entry, { systems, essences: worldEssences })}
  {#if chips.length > 0}
    <span class="manager-world-component-row-essences" data-world-component-row-essences={entry.id}>
      {#each chips as chip (chip.id)}
        <EssenceChip
          essence={chip}
          class="manager-essence-compact-chip"
          data-world-component-row-essence={chip.id}
        />
      {/each}
    </span>
  {/if}
{/snippet}

<!--
  THE TRAILING STAT CLUSTER (`proto:606`-`608`): two right-aligned columns, each a mono numeral
  over a micro-label, where a sentence inside the identity button was unscannable down a list. It
  renders through `rowTrailing` because the row's second line is now the DESCRIPTION.
-->
{#snippet componentRowStatColumns(entry)}
  {@const row = componentRowStats(entry, systemCount, phrase)}
  <span class="manager-world-component-row-stats" data-world-component-row-meta={entry.id}>
    {#each row.stats as stat (stat.id)}
      <span class="manager-world-component-row-stat" data-world-component-row-stat={stat.id}>
        <span
          class="manager-world-component-row-stat-value"
          data-world-component-row-stat-value={stat.id}>{stat.value}</span
        >
        <span
          class="manager-world-component-row-stat-label"
          data-world-component-row-stat-label={stat.id}>{stat.label}</span
        >
      </span>
    {/each}
  </span>
{/snippet}

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. The flattened ROW state is NOT
     here and cannot be: those rows are the frame's, so a page-scoped rule never matches them. */

  /* THE ROW'S TWO STAT COLUMNS (`proto:606`-`608`): right-aligned and 60px at minimum, with
     `tabular-nums` to stop them jittering as the list re-sorts. */
  .manager-world-component-row-stats {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-world-component-row-stat {
    display: flex;
    flex-direction: column;
    min-width: 60px;
    text-align: right;
  }

  .manager-world-component-row-stat-value {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    /* 500, WHICH IS THE ONLY WEIGHT THE FACE SHIPS, so the reference's 700 snaps here exactly as
       the control-height ladder snaps 32 and 36 to 34. */
    font-weight: 500;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
  }

  .manager-world-component-row-stat-label {
    color: var(--fab-text-subtle);
    font-size: 0.5rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* THE ROW'S ESSENCE CHIP RUN (M30), restated because the frame's meta column is a WRAPPING
     flex: the run itself never wraps, so many essences widen the column rather than the row. */
  .manager-world-component-row-essences {
    display: inline-flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--fab-space-1);
  }

  /* The name line's two pills keep their intrinsic width; the NAME is what ellipsises. */
  .manager-world-component-row-source,
  .manager-world-component-row-flag {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
  }

  .manager-world-component-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* THE INSPECTOR'S TWO INSETS, each a well lifted out of the pane. ITS PADDING SNAPS: the
     reference's 10/11px is on no published step, and the scale is mandatory for padding. */
  .manager-scoped-inspector-inset {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .manager-world-component-inspector-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin-bottom: var(--fab-space-1);
  }

  .manager-world-component-inspector-head .manager-micro-label {
    margin: 0;
  }

  /* THE ADDRESS, in the mono face at the weight the face ships; it breaks inside a word. */
  .manager-world-component-inspector-uuid {
    margin: 0;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-weight: 500;
    font-size: 0.63rem;
    line-height: 1.6;
    word-break: break-all;
  }

  .manager-world-component-inspector-note {
    margin: var(--fab-space-1) 0 0;
    color: var(--fab-text-subtle);
    font-size: 0.59rem;
    line-height: 1.45;
  }

  .manager-world-component-inspector-category {
    display: flex;
    align-items: center;
    gap: var(--fab-space-1);
    margin: 0 0 var(--fab-space-2);
    color: var(--fab-text);
    font-size: 0.68rem;
  }

  .manager-world-component-inspector-category i {
    color: var(--fab-text-subtle);
    font-size: 0.56rem;
  }

  .manager-world-component-inspector-category .is-unset {
    color: var(--fab-text-disabled);
  }

  .manager-world-component-inspector-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .manager-world-component-inspector-empty {
    color: var(--fab-text-disabled);
    font-size: 0.63rem;
  }

  /* The line under the name: the SOURCE, at the reference's 10px/500 in subtle ink. */
  .manager-world-component-source-line {
    color: var(--fab-text-subtle);
    font-weight: 500;
    font-size: 0.63rem;
  }
</style>
