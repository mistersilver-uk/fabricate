<!-- Svelte 5 runes mode -->
<!--
  The world Component Catalogue (issue 1371, epic 1357).

  IT COMPOSES `EntityCatalogueShell` AND BUILDS NO SECOND LIST. The list, its filters, its sort,
  its pagination, its bulk selection and its inspector column are all the shell's; what this file
  owns is the component-shaped configuration around them — the search projection, the source-type
  filter and sort, the two reach stats, the world-default card copy, the bulk panel and the
  create-from-drop zone.

  == THE ROW CARRIES TWO REACH STATS AND NO CHIP ============================================
  A world component's row says how many recipes name it and how many systems hold it, and both
  are REACH facts rather than behaviour facts. The tool row's own note states the rule this
  follows: a chip beside a name reads as something the entity DOES, so a reach count set as a
  chip reads as a third property. A component's behaviour — its essences, its salvage, its
  difficulty — is a MEMBERSHIP fact and belongs to no world row at all, so this row has nothing
  in the chip category and draws none. There is no category chip and no tag run for the same
  reason: `category` is one system's resolved answer, not the world record's.

  == THE STANDING NOTE IS NARROWER THAN "NOTHING HERE IS READ" =============================
  The world `category` this screen's inspector states IS consumed: every system whose inherit
  switch is on resolves from it. The world NAME, ART, DESCRIPTION and TAG LIST are not, because
  the read union re-derives identity from the in-system record and `tags` is not a section. So a
  GM can meet two names for one component one deep link apart, and the note says so rather than
  claiming the whole screen is inert or that all of it is live.

  == THE DROP ZONE RESOLVES BEFORE IT MINTS, AND THE ROOT DOES THE RESOLVING ================
  `createEntity` dedupes on the entity id and the id is fresh every time, so an unresolved drop
  turns one Item into two world components with identical identity. Matching a dropped payload
  against the corpus needs a Foundry global to resolve the drop and the services bag to take the
  snapshot; `worldScopeActions` deliberately reads neither, and a page cannot reach the bag. So
  this page raises the RAW drag data and the root resolves, refuses, creates and navigates.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import ComponentCatalogueBulkPanel from './ComponentCatalogueBulkPanel.svelte';
  import {
    authoredWorldComponentCategories,
    componentAliasNote,
    componentGlobalTagNote,
    componentRowStats,
    componentSearchText,
    componentSorts,
    componentSourceFilters,
    componentSourceLine,
    componentWorldCategoryNote,
  } from './componentScoped.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    // THE GAME-WORLD ITEM ROSTER, for the create zone's resolution and for a row whose world
    // record carries no description of its own. Passed by the call site, which also extends the
    // roster's own gate to this route — a `worldItems` handed over without that extension is an
    // empty array, which is the defect the tool screens recorded before it was fixed.
    worldItems = [],
    onOpenEntry = () => {},
    onOpenSystemRules = null,
    // THE VOCABULARY EXIT the `Global tags` card's head action routes through (issue 1371,
    // round 4). Handed back to the owner rather than navigated here, on the same seam and for
    // the same reason the world entry's own exit is: the gateway runs the unsaved-changes guard
    // before it moves. `null` withholds the control, so a call site with no route offers no
    // dead affordance.
    onOpenVocabulary = null,
    onCreateFromItemDrop = () => {},
    // THE LIST'S LIFTED VIEW-STATE. Owned by the manager root and bound here: opening an entry
    // unmounts this page along with the shell and the frame, so a slot held locally would be
    // destroyed by the very trip it exists to survive.
    browserState = $bindable(null),
  } = $props();

  // INITIALISED, and that is not optional: the shell declares `selectedId` as a bindable prop and
  // Svelte 5 THROWS `props_invalid_value` when a bindable prop has a setter and the incoming value
  // is `undefined`.
  let selectedId = $state('');

  // AN IN-FLIGHT BULK WRITE. It inerts the panel and its Apply for the duration, which is what
  // stops a second instruction racing the first across one setting: every world-scope action is a
  // read-modify-write of the WHOLE component payload, so two overlapping runs would each persist
  // a snapshot taken before the other's writes.
  let bulkApplying = $state(false);

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

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title the shell's `viewTitle`
  // renders for this route. A page that still DELEGATES states these four as attributes on the
  // shared placeholder; a page with its own body states them as module constants.
  const PAGE_ID = 'world-components';
  const PAGE_ICON = 'fas fa-cubes-stacked';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle';
  const TITLE_FALLBACK = 'Component catalogue';

  const catalogueTitle = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const selectedEntry = $derived(entries.find((entry) => entry.id === selectedId) ?? null);
  const systemCount = $derived(Array.isArray(systems) ? systems.length : 0);
  const filters = $derived(componentSourceFilters(phrase));
  const sorts = $derived(componentSorts(phrase));
  const categoryOptions = $derived(authoredWorldComponentCategories(scope));
  // THE WORLD TAG VOCABULARY, DERIVED FROM THE RECORDS THAT CARRY IT. There is no world tag
  // roster to read: the World Vocabulary store that will publish one is PR 7's. The union of what
  // is actually authored is the honest list, sorted so the picker's order does not follow
  // catalogue order.
  const tagOptions = $derived(
    [
      ...new Set(
        entries.flatMap((entry) => (Array.isArray(entry.defaults?.tags) ? entry.defaults.tags : []))
      ),
    ].sort((left, right) => String(left).localeCompare(String(right)))
  );

  // ── THE ONE WORLD-DEFAULT CARD, THROUGH THE SHELL RATHER THAN BESIDE IT ─────────────────
  // A component draws exactly one section, so the shell renders its count inline with no group
  // chrome. The card TITLE names the VALUE and the NOTE states its reach, which is the shell's
  // own emphasis: a card titled `Category` says which row it is and nothing about what a GM would
  // be changing by opening it.
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
   * The LINKED ITEM's own description, for the frame's second description rung.
   *
   * A world component's `description` is a SNAPSHOT taken when the link was made, and a record
   * created any other way carries an empty one — so without this every such row would read
   * `No description` while wearing a `Linked` badge. The frame owns the PRECEDENCE; this answers
   * only the linked-document rung, and `''` when there is genuinely nothing to say.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function describeFromLinkedItem(entry) {
    const entity = entry?.entity ?? null;
    if (!entity) return '';
    const uuid = String(entity.registeredItemUuid || entity.originItemUuid || '');
    if (!uuid) return '';
    return String(worldItems.find((item) => item?.uuid === uuid)?.description ?? '').trim();
  }

  /**
   * One row's NAME, when the world record's own label is blank.
   *
   * Only this page holds the Item roster that answers it; the shipped scoped name helper would
   * print the record id on the row instead.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function nameFromLinkedItem(entry) {
    const uuid = String(entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || '');
    if (!uuid) return '';
    return String(worldItems.find((item) => item?.uuid === uuid)?.name ?? '').trim();
  }

  /**
   * Apply one staged bulk instruction across the ticked rows, then drop the selection.
   *
   * SEQUENTIAL, and that is not caution. Every world-scope action loads the persisted payload,
   * edits it and writes it back, so a `Promise.all` over twelve components across three systems
   * would have thirty-six writers racing one setting and the last one home would carry only its
   * own edit. The in-flight flag refuses a second Apply for the same reason.
   *
   * The selection is cleared on the way out because the instruction has LANDED: leaving rows
   * ticked under a panel whose staged axes have reset reads as an edit still pending.
   *
   * @param {string[]} entityIds the ticked rows, in list order.
   * @param {object} staged the panel's instruction.
   * @param {() => void} clearSelection the frame's own selection reset.
   * @returns {Promise<void>}
   */
  async function applyBulk(entityIds, staged, clearSelection) {
    // BELT AND BRACES, AND NOT REACHABLE FROM THIS SURFACE (issue 1371, round 2). The flag it
    // reads is also threaded to the panel as `applying`, which inerts every staging control and
    // the Apply itself, and the panel clears its staged instruction the moment it hands one over
    // — so no second application can be COMPOSED through the DOM while a write is in flight, and
    // the mounted suite proves that reachable guard instead. This line defends the other callers
    // of `applyBulk`: a keyboard repeat, a queued event replayed after a re-render, or any future
    // caller that is not the panel. It is deliberately kept and deliberately untestable from here.
    if (bulkApplying) return;
    bulkApplying = true;
    try {
      for (const entityId of entityIds) {
        for (const systemId of staged.systemIds ?? []) {
          if (staged.mode === 'add') await actions?.addToSystem?.(entityId, systemId);
          else if (staged.mode === 'remove') await actions?.removeFromSystem?.(entityId, systemId);
        }
        if (staged.category !== null && staged.category !== undefined) {
          await actions?.updateWorldDefaultSection?.(entityId, 'category', staged.category);
        }
        const addTags = staged.addTags ?? [];
        const removeTags = staged.removeTags ?? [];
        if (addTags.length > 0 || removeTags.length > 0) {
          // `setWorldTags` REPLACES the whole list, so the next list is computed per component
          // from the one it already holds. A staged instruction that wrote the staged tags alone
          // would silently delete every tag a GM had not ticked.
          const current = entries.find((entry) => entry.id === entityId)?.defaults?.tags ?? [];
          const next = [...new Set([...current, ...addTags])].filter(
            (tag) => !removeTags.includes(tag)
          );
          await actions?.setWorldTags?.(entityId, next);
        }
      }
    } finally {
      bulkApplying = false;
    }
    clearSelection();
  }
</script>

<main class="manager-main" data-scoped-page="world-components" aria-label={catalogueTitle}>
  <EntityCatalogueShell
    {scope}
    {actions}
    {systems}
    hookValue={PAGE_ID}
    title={catalogueTitle}
    subtitle={text(
      'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueSubtitle',
      'One record per component, shared by every system that has rules for it.'
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
      'Search components…'
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
    openEntryLabel={text('FABRICATE.Admin.Manager.Scoped.Component.RowOpenEntry', 'Edit component')}
    rowSecondLine="meta"
    systemRowAction="navigate"
    rosterEmptyNote={text(
      'FABRICATE.Admin.Manager.Scoped.Component.RosterEmpty',
      'No system has rules for this component yet. It is registered in the world but unused — recipes cannot reference it anywhere.'
    )}
    membershipFilter={false}
    bind:browserState
    bind:selectedId
    onSelect={(entityId) => (selectedId = entityId)}
    {onOpenEntry}
    {onOpenSystemRules}
    {rowMeta}
  />
</main>

<!--
  THE LIST'S FIRST ELEMENT: the surface that makes a component.

  It is on THIS screen because a world component is a world record — it exists once and every
  system adopts the same one — and the system Component Rules list can only ever author RULES for
  a record the world already holds. The shipped system-scope zone stays where it is; this is a
  second zone at the scope that creates the record, not a move.
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
    applying={bulkApplying}
    onClearSelection={() => ctx?.clearSelection?.()}
    onApply={(staged) => applyBulk(selectedIds, staged, () => ctx?.clearSelection?.())}
  />
{/snippet}

<!--
  THE LINE UNDER THE NAME IS THE SOURCE (issue 1371, maintainer parity round 4).

  It was a category chip, on the reasoning that the world category is the only classification a
  catalogue can state truthfully. That is true and it is not what this slot is for: the reference
  writes `Linked Foundry item` here, and the category is drawn in the `Global tags` card below
  with its own label. A category is a value some system may or may not resolve; the SOURCE is
  what the entry is, and it is the one fact this screen is a catalogue OF.
-->
{#snippet componentInspectorCaption(entry)}
  <span
    class="manager-world-component-source-line"
    data-world-component-inspector-source={entry?.id ?? ''}>{componentSourceLine(entry, text)}</span
  >
{/snippet}

{#snippet componentInspectorBody(entry)}
  <div class="manager-world-component-inspector">
    <!--
      TWO INSET CARDS AND NOTHING ELSE (issue 1371, maintainer parity round 4).

      What was here — a `Used by` list, a world-tag note paragraph, a zero-member sentence and the
      standing world-scope disclosure — is gone, and each for its own reason rather than for room:

      - `Used by` belongs on the ENTRY's preview rail, where the reference draws it beside
        `Produced by`. One of the two lists on the surface that has no room for the other is worse
        than both on the surface that does.
      - the zero-member sentence is what the roster's own empty state says, one block below.
      - the disclosure had no counterpart here at all, and in the shipped frame the pinned foot
        clipped it — a paragraph a GM cannot finish reading is not a disclosure.

      What replaces them is the reference's own two insets: the address the world recognises this
      item by, and the vocabulary every rule set inherits.
    -->
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
        <!--
          A BARE ACCENT-INK TEXT ACTION, which is what the reference draws: an `Edit ↗` at the
          head's trailing edge, not a filled control. `ManagerButton role="ghost"` still paints a
          hover fill and carries the primitive's own control height, and this is a 9px link inside
          a 10px-tall head row — so it is plain markup carrying the manager's shared link class,
          the same way the catalogue row's own `Rules ↗` exits are drawn.
        -->
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
        {#each entry?.defaults?.tags ?? [] as tag (tag)}
          <Chip tone="tag" data-world-component-global-tag={tag}>{tag}</Chip>
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
  THE INSPECTOR'S ONE PRIMARY ACTION, PINNED TO ITS FOOT. The frame owns the pinning; this snippet
  owns the verb, which is the split the two sibling catalogues already make with the same
  primitive. NO GLYPH: the external-link mark belongs to the ROW buttons, which leave for a
  different screen, and this one opens the record the panel above it is already describing.
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
  THE ROW'S SECOND LINE. Both stats are MUTED TEXT with the numeral in the mono face and
  `tabular-nums`, never chips: see the header for why a reach count is not a chip, and
  `ui-integration/spec.md` for why every manager numeral is tabular.

  It renders INSIDE the identity `<button>` (`rowSecondLine="meta"`), so nothing here may be
  interactive — a `<button>` inside a `<button>` is invalid DOM the browser silently reparents.
-->
{#snippet rowMeta(entry)}
  {@const row = componentRowStats(entry, systemCount, phrase)}
  <span class="manager-world-component-row-meta" data-world-component-row-meta={entry.id}>
    {#each row.stats as stat (stat.id)}
      <span class="manager-world-component-row-stat" data-world-component-row-stat={stat.id}
        >{stat.text}</span
      >
    {/each}
    {#if row.flag}
      <!-- A PILL, NOT BARE TEXT (issue 1371, round 2). The reference draws this as a chip on the
           recessive surface, and painted as unbordered uppercase in the disabled ink it was the
           least legible thing on the row — the one exception flag reading as noise. The DISABLED
           INK was right and is what `neutral` keeps; only the missing pill is added, through the
           manager's one chip rather than a second pill shape. -->
      <Chip tone="neutral" data-world-component-row-flag={entry.id}>{row.flag}</Chip>
    {/if}
  </span>
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `.manager-main`, `.manager-muted` and `.manager-kicker` are shipped and reused
     rather than restated. The catalogue's flattened ROW state is NOT here and cannot be: those
     rows are written by the frame, so a page-scoped rule carries this page's hash and never
     matches them. That block is appended to the host sheet, as both sibling lanes did. */

  .manager-world-component-row-meta {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* A muted count rather than a chip: nothing on this row says what the component DOES, so a pill
     here would read as a property of the component instead of its reach. The numerals are mono
     and tabular, which is what stops a column of counts jittering as the list re-sorts. */
  .manager-world-component-row-stat {
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 0.6rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .manager-world-component-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* THE INSPECTOR'S TWO INSETS (issue 1371, round 4). Each is a `--fab-bg-1` well lifted out of
     the `--fab-bg-2` pane, hairline, radius 9 — `design-system/spec.md:218` puts a well on 9,
     which is the reference's own value.

     ITS PADDING SNAPS. The reference draws 10px block / 11px inline and the published spacing
     scale has neither; `ui-integration/spec.md`'s "Spacing scale" clause makes the scale
     mandatory for padding, so both land on `--fab-space-3` (12px). That is the same class of
     recorded rung as the control-height ladder snapping 32 and 36 to 34, and it is the one kind
     of deviation the rebuild's standing rules allow. */
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

  /* THE ADDRESS, in the mono face at the weight the face ships (`spec.md:230-231`). It breaks
     inside a word because a uuid has no spaces and a 300px column has no room for one. */
  .manager-world-component-inspector-uuid {
    margin: 0;
    color: var(--fab-text-2);
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
