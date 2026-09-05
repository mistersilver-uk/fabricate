<!-- Svelte 5 runes mode -->
<!--
  The world Component Catalogue (issue 1371, epic 1357).

  IT COMPOSES `EntityCatalogueShell` AND BUILDS NO SECOND LIST. The list, its filters, its sort,
  its pagination, its bulk selection and its inspector column are all the shell's; what this file
  owns is the component-shaped configuration around them — the search projection, the source-type
  filter and sort, the two reach stats, the world-default card copy, the bulk panel and the
  create-from-drop zone.

  == THE ROW CARRIES TWO REACH STATS AND, SINCE M30, ITS ESSENCE CHIPS =======================
  A world component's row says how many recipes name it and how many systems hold it, and both
  are REACH facts rather than behaviour facts. The tool row's own note states the rule this
  follows: a chip beside a name reads as something the entity DOES, so a reach count set as a
  chip reads as a third property. There is no category chip and no tag run: `category` is one
  system's resolved answer, not the world record's.

  ESSENCES ARE THE ONE BEHAVIOUR FACT THE ROW DRAWS (issue 1371 r18-cat, maintainer ruling M30):
  "there's no way to view the essences on a component in the world catalogue library rows (there
  are row chips in the system rules library)", and no way to filter by them either. Under M31 the
  world record gains an `essences` section beside `category`, so what the row states is a WORLD
  value every system inherits unless it overrides — a world fact after all, and the one this row
  used to withhold. The chips in the trailing column, the essence select on the toolbar and the
  bulk panel's `n/N` all read that one map through `componentScoped.js`
  (`componentWorldEssenceMap`), and the bulk `Essence values` group WRITES it: one
  `updateWorldDefaultSection(entityId, 'essences', map)` per selected record whose map changes
  (issue 1371 r18-entry, M31), which every system that inherits the section follows.

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
  import { localize, notifyError } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
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
    // ── THE SYSTEM THE RAIL HAS SELECTED (issue 1371 r8-cat) ────────────────────────────────
    // A world catalogue DOES have a system in scope: the rail shows one selected at all times,
    // and the root already threads it to this page inside `componentScopeProps`. It is what the
    // membership filter's four options interpolate — `Has rules in Karrun Forgecraft` is a
    // sentence about a system, and the option is meaningless without one. `''` withholds the two
    // system-relative options rather than printing a half sentence; see the descriptor's note.
    systemId = '',
    // THE GAME-WORLD ITEM ROSTER, for the create zone's resolution and for a row whose world
    // record carries no description of its own. Passed by the call site, which also extends the
    // roster's own gate to this route — a `worldItems` handed over without that extension is an
    // empty array, which is the defect the tool screens recorded before it was fixed.
    worldItems = [],
    // THE WORLD ESSENCE CATALOGUE'S ROSTER (issue 1371 r16-cat, maintainer ruling M25), for the
    // bulk panel's `Essence values` group — and, since r18-cat (M30), for the toolbar's essence
    // filter and the row's essence chips, both of which follow its order and draw its names and
    // glyphs: `{id, name, icon?, colorToken?}[]`, which is the root's `worldEssenceOptions`.
    // Passed by the call site for the reason `worldItems` is.
    worldEssences = [],
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

  // AN IN-FLIGHT BULK DELETE, held apart from `bulkApplying` because the two put DIFFERENT
  // controls into a busy state: an Apply in flight must not spin the danger button, and a delete
  // in flight must not read as a staged write landing.
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

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title the shell's `viewTitle`
  // renders for this route. A page that still DELEGATES states these four as attributes on the
  // shared placeholder; a page with its own body states them as module constants.
  const PAGE_ID = 'world-components';
  const PAGE_ICON = 'fas fa-cubes-stacked';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle';
  const TITLE_FALLBACK = 'Component catalogue';

  /**
   * THE ROW'S LEADING TILE, as the reference draws it (`proto:600`, UX finding F12).
   *
   * `width:38px;height:38px;border-radius:9px;font-size:15px` with a slate fill and no border at
   * all. `glyph-chip` is the two halves of that a caller cannot state — the absent edge, and the
   * fact that a tinted glyph on this chip does not bring a tinted SURFACE with it — and 38 and 15
   * are the primitive's own `size` and `glyph`, which is why they are written here beside it.
   *
   * A MODULE CONSTANT rather than an inline object literal, because a fresh object every render
   * is a fresh prop value every render: the frame merges it into a `$derived`, and an inline
   * literal would re-run that merge and re-diff every medallion in the list on every keystroke in
   * the search field. Nothing here depends on state, so it is built once.
   *
   * The reference tints the glyph per CATEGORY and this passes no `tint`. That is not an omission
   * being deferred: a world category is a bare string in this corpus — `entry.defaults.category`
   * is a name, and the world vocabulary publishes names alone (`scope.worldVocabulary`) with no
   * colour token for one — so there is no per-category colour to pass until it publishes one.
   * The frame's own `thumbnailOf` still supplies the entity's colour token where a scope HAS one.
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
  // THE SOURCE FILTER TAKES THE ITEM ROSTER, because one of its four options is a RESOLUTION
  // question (`Broken link`) and only this page holds the roster that answers one. The same
  // roster the row's flag is painted from, so a filtered set and the flags inside it agree.
  const filters = $derived([
    ...componentSourceFilters({ worldItems }, phrase),
    // THE ESSENCE FILTER FOLLOWS THE SOURCE SELECT ON THE LEAD ROW (issue 1371 r18-cat, M30),
    // which is where the rules list puts its own, at the lead row's 38px rung the frame already
    // gives every lead-row select. It takes the raw system roster because the map it reads is
    // the union of per-system values until STORE lands — see the descriptor's own note.
    ...componentEssenceFilter({ essences: worldEssences, systems }, phrase),
    ...componentMembershipScopeFilter({ systemId, systemName: addressedSystemName }, phrase),
  ]);
  const sorts = $derived(componentSorts(phrase));

  // THE BULK INSETS OFFER THE WORLD VOCABULARY AND NOTHING ELSE (issue 1371 r14-cat, maintainer
  // ruling M18 on its second surface). Both read the names `buildWorldScopeState` attaches to
  // this leg as `scope.worldVocabulary`, never the union of what the records carry: on a
  // migrated world every world default was elected from a system, so that union offered the
  // systems' categories as the world's; and a tag the world had authored but no record had
  // applied yet was missing from it, with the inset's empty sentence then denying it existed.
  const categoryOptions = $derived(worldVocabularyComponentCategories(scope));
  const tagOptions = $derived(worldVocabularyComponentTags(scope));

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
   * Run ONE write of a bulk run, and treat a throw exactly as the store's own refusal is treated.
   *
   * ── WHY A BULK LOOP MAY NOT BE ABANDONED BY A THROW (issue 1371 r11-cat) ─────────────────────
   * `ui-integration/spec.md`'s `### GM World Component Screens` requirement 6 states the rule for
   * the COMPOSED membership verbs: "the refusal is REPORTED rather than thrown: the verb answers
   * `false` and notifies, so a bulk apply continues through its remaining pairs instead of
   * abandoning the run at the first collision." An UNCAUGHT throw out of one pair broke exactly
   * that promise from the other side — the loop stopped where it stopped, `clearSelection()`
   * never ran, and the GM was left with a page of rows still ticked, some of them written and
   * some of them not, and no statement of which. Every remaining pair was skipped in silence.
   *
   * THE COMPOSED VERBS ARE NO LONGER THE REACHABLE HALF OF THAT, and the rest of the loop still
   * is. `joinComponentToSystem` and `partComponentFromSystem` both catch, notify and answer now,
   * so requirement 6 holds at the store for `add` and `remove`. `updateWorldDefaultSection` and
   * `setWorldTags` are RAW family verbs with no such wrapper, and `addToSystem` reaches this page
   * through an optional chain that answers `undefined` rather than `false` when a call site
   * supplies no leg — so a settings write refused on the category or the tag axis is exactly the
   * unreported throw this loop must survive, and it is the axis the mounted proof drives.
   *
   * So a throw is counted, not propagated: the run finishes, the selection clears, and
   * {@link reportBulkFailures} says how much of the instruction did not land. The store is still
   * the layer that explains WHY a single write was refused — it notifies on its own `false` — and
   * this only exists for the failure the store did not turn into an answer.
   *
   * THE UNIT IS THE COMPONENT, not the write, because that is the unit the GM ticked. One
   * component whose membership write and whose tag write both throw is one component that did not
   * take the instruction, and `2 components could not be updated` over a selection of one would
   * be a sentence about nothing on the screen.
   *
   * @param {Set<string>} failed collects the entity ids at least one of whose writes threw.
   * @param {string} entityId the component this write belongs to.
   * @param {() => unknown} write the write itself.
   * @returns {Promise<void>}
   */
  async function attemptWrite(failed, entityId, write) {
    try {
      await write();
    } catch {
      failed.add(entityId);
    }
  }

  /**
   * State how much of a bulk run did not land, or say nothing at all when it all did.
   *
   * SILENT ON THE HAPPY PATH. A run that wrote everything it was asked to needs no notification:
   * the rows untick and the panel closes, which is the outcome. This speaks only for the writes
   * that threw, and it counts them rather than naming them — a selection may be a whole page, and
   * a notification listing forty names is one a GM closes without reading.
   *
   * @param {Set<string>} failed the entity ids at least one of whose writes threw.
   * @returns {void}
   */
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
   * Apply one staged bulk instruction across the ticked rows, then drop the selection.
   *
   * SEQUENTIAL, and that is not caution. Every world-scope action loads the persisted payload,
   * edits it and writes it back, so a `Promise.all` over twelve components across three systems
   * would have thirty-six writers racing one setting and the last one home would carry only its
   * own edit. The in-flight flag refuses a second Apply for the same reason.
   *
   * The selection is cleared on the way out because the instruction has BEEN RUN: leaving rows
   * ticked under a panel whose staged axes have reset reads as an edit still pending. It clears
   * even when a write threw, because the alternative — a half-written run under a full selection
   * and a re-armed Apply — invites a second run over the pairs that already landed.
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
          // from the one it already holds. A staged instruction that wrote the staged tags alone
          // would silently delete every tag a GM had not ticked.
          const current = entries.find((entry) => entry.id === entityId)?.defaults?.tags ?? [];
          const next = [...new Set([...current, ...addTags])].filter(
            (tag) => !removeTags.includes(tag)
          );
          await attemptWrite(failed, entityId, () => actions?.setWorldTags?.(entityId, next));
        }
      }
      // THE ESSENCE AXIS WRITES THE WORLD SECTION, ONE RECORD AT A TIME (issue 1371 r18-entry,
      // maintainer ruling M31, superseding M25). The world record carries an `essences` section
      // beside `category` now, inherited by every system that has rules for the component unless
      // it overrides, and `updateWorldDefaultSection` REPLACES the section — so the plan merges the
      // staged map over each record's CURRENT world map (a positive value sets, a zero strips, an
      // unnamed key is carried forward) and skips a record whose map would not change. M25's route
      // wrote per-system rules through `bulkEditRules`, which no world screen reads; that verb is
      // still the SYSTEM panel's and is not called from here. Same `attemptWrite` unit as the
      // category and tag axes: a throw counts the record, and the run goes on.
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
      // IN THE `finally` AS BELT AND BRACES, and not falsifiable from this surface: every write
      // is awaited through `attemptWrite`, which catches, so the loop below cannot throw and
      // moving these two lines after the `try` keeps the mounted suite green. What the `finally`
      // defends is a throw from something that is NOT a write — a malformed `staged`, or the
      // frame's own reset — where clearing the rows and stating the shortfall still matter. It
      // is deliberately kept and deliberately untestable, exactly as the in-flight guard above.
      clearSelection();
      reportBulkFailures(failed);
    }
  }

  /**
   * Delete every ticked component, then drop the selection.
   *
   * SEQUENTIAL FOR THE REASON `applyBulk` RECORDS, and more sharply: `deleteEntity` is a
   * read-modify-write of the whole world component payload that also sweeps every membership
   * record naming the entity, so two overlapping deletes would each write a snapshot taken before
   * the other's sweep and one of the two entities would come back.
   *
   * The selection is cleared on the way out because the rows it names no longer exist; the frame
   * prunes ids that leave the filtered set, and this makes that pruning immediate rather than a
   * consequence the GM watches happen.
   *
   * @param {string[]} entityIds the ticked rows, in list order.
   * @param {() => void} clearSelection the frame's own selection reset.
   * @returns {Promise<void>}
   */
  async function deleteBulk(entityIds, clearSelection) {
    if (bulkDeleting || bulkApplying) return;
    // ONLY WHAT THE PLAN SAYS MAY GO (epic decision 7). The panel states the refusal in its own
    // note and in its ARMED LABEL, which reads `Cannot delete` where the plan frees nothing —
    // the control stays ENABLED throughout, because `ui-integration/spec.md` requirement 16 says
    // a disabled button satisfies any assertion that the delete did not happen while leaving the
    // GM no explanation at all. So the refusal is enforced HERE as well as stated there: the
    // press is reachable, this is the one call that writes, and a rule the GM can still walk into
    // is not allowed to live only in a label.
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
  THE THREE PRIMITIVE SEAMS THIS SCREEN CONSUMES, NOW THAT THEY EXIST (issue 1371 r9-cat).

  Each was a marker here for one revision while the primitive that owns it was built, and each is
  wired below rather than restyled in place — the whole point of putting them on the primitives is
  that the essence and tool catalogues, which share every one of these components, do not move.

   - `toolbarLeadSize="38"` (M12(b) / UX F5): `proto:577`-`578` draws the search field and the
     source select at 38px, which IS a rung of the published ladder. It is the LEAD ROW's size and
     not the toolbar's: `proto:582`-`585` draws the membership select, the sort select and the
     direction toggle one row below at 32, a RETIRED rung, so those three stay at the ladder's 34
     under D-C and this prop deliberately does not reach them.
   - `rowMedallion` (UX F12): `proto:600` draws the row's leading tile as a borderless slate
     square at 38px carrying a 15px tinted glyph, against the shipped 40px bordered artwork tile.
     The variant owns only the absent edge and the cancelled surface wash; the size and the glyph
     are the primitive's own arguments, which is why the descriptor states all three together.
   - `rosterRecessed` / `rosterSearchWell` (reviewer 7): the reference's system-roster card is a
     recess with its search field LIFTED out of it. Both were restyled in place for all three
     catalogues before lane PRIM turned them into props; this screen is the one that wants them.
   - `autoSelectFirst` (issue 1371 r13-cat, maintainer ruling M14): the catalogue opens with its
     first shown row inspected rather than on a resting inspector. The frame's opt-in, and this
     page's `selectedId` starts empty, which is the one state the opt-in fills; a GM's own choice
     and the lifted page index are never fought. See the frame's prop note.
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
  THE LIST'S FIRST ELEMENT: the surface that makes a component, and NOTHING beside it.

  It is on THIS screen because a world component is a world record — it exists once and every
  system adopts the same one — and the system Component Rules list can only ever author RULES for
  a record the world already holds. The shipped system-scope zone stays where it is; this is a
  second zone at the scope that creates the record, not a move.

  THE ZONE TAKES THE WHOLE ROW (issue 1371 r13-cat, maintainer ruling M13). M10 built a
  `+ Register item` picker beside it — a `SearchablePopover` over the world Items not yet
  registered — and the maintainer's own test of the branch removed it: "That search popover
  doesn't even seem to list unregistered Foundry items, and a search by name is not the intended
  flow." The zone is rendered bare here, with no flex wrapper holding a slot for a second control,
  so it spans the list lead edge to edge; the rendered suite measures that and the mounted suite
  pins the structure. The picker, its option list, its three lang keys and its sheet rules went
  with it. `SearchablePopover`'s `triggerButton` form STAYS — it is the primitive's, proven by its
  own mounted suite — and the cascade inventory records that this site left by deletion, not by
  slipping back to a hand-written `manager-button` token.
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
        <!--
          THE WORLD TAG IS A LIT MICRO PILL, AND IT TAKES BOTH OF `Chip`'S AXES TO SAY SO
          (issue 1371 r9-cat, UX finding F10).

          `proto:757` draws it as `padding: 2px 9px; border-radius: 999px; font: 600 9.5px` with a
          purple 12% fill, a purple 35% edge and PURPLE ink. `tone="tag"` alone measured a
          grey-blue fill, a 10px corner and cream ink — three of those four wrong.

          `emphasis="lit"` is the PAINT: it inks the label in the family's own colour over a wash
          of it, which is the half `tone="tag"` got wrong (that tone mixes its wash into the
          OPAQUE `--fab-bg-3`, so the fill measured a grey-blue, and it inked `--fab-text`). The
          edge was always right. `density="list"` is the SCALE, and it is the shipped one rather
          than a new value: the primitive's own note records that the reference's micro pill —
          `padding: 2px 8px; border-radius: 999px; font: 600 9px` — IS `list`, to within a pixel
          of vertical padding, and warns in as many words that adding a scale a pixel from a
          shipped one is how this component drifts back into two of everything.

          NOT `density="tag-run"`, which the world Component ENTRY uses for the same vocabulary:
          that run is a CONTROL a GM clicks and the reference draws it at `5px 12px / 11px`
          (`proto:5401`). This one is a badge that is read. One tag, two sites, two scales — and
          the paint axis is shared, which is exactly the split `emphasis` exists to make.
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
  THE NAME LINE'S TWO PILLS (issue 1371, gap-list rows 13 and 14).

  `proto:601` draws `[name] [🔗 {source}] [flag]` on ONE line. Both pills were elsewhere: the
  source was the frame's own presence badge in the trailing column, and the exception flag was on
  the row's second line inside the meta run. Neither placement is the reference's, and the source
  pill in particular said something different — the frame's badge answers "does this record name
  an Item at all", where the reference's pill names WHICH KIND of address it is.

  It renders INSIDE the identity `<button>`, so nothing here may be interactive: `StatusPill` is
  a `<span>`, which is why it is the primitive used rather than a chip button.
-->
{#snippet componentRowNameTrailing(entry)}
  {@const linked = entry?.hasSourceLink === true}
  {@const broken = componentSourceBroken(entry, worldItems)}
  <span class="manager-world-component-row-source" data-world-component-row-source-pill={entry.id}>
    <!--
      THE BARE FACE, WHICH IS THE ONLY THING THAT WAS LEFT OPEN HERE (UX F12's sibling finding).

      `proto:601` draws this badge as an UNBORDERED 999px stadium — `padding: 1px 7px; font: 600
      9px` on `var(--surface-raised)`, with no `border` declared at all. The shipped pill measured
      six lines against it: the edge's width, style and colour, 9.92px type, and both horizontal
      insets. Every one of them is declared inside the primitive's own scoped block, and a
      component's scoped block is UNLAYERED while `styles/fabricate.css` imports at
      `layer(modules)` — so no page- or sheet-authored rule could have won against it however
      specific. `emphasis="bare"` is that face, on the primitive that owns it.

      IT KEEPS THE TONE, which is why it is `bare` and not `outlined`: the fill and the ink are
      the tone's, and only the edge and the type move. So a linked badge stays `subtle` and an
      unlinked one stays `warning` and keeps its amber.
    -->
    <StatusPill
      tone={linked ? 'subtle' : 'warning'}
      emphasis="bare"
      icon={linked ? 'fas fa-link' : 'fas fa-link-slash'}
      label={componentSourceType(entry, text)}
    />
  </span>
  {#if broken}
    <!--
      THE ONE EXCEPTION FLAG THE REFERENCE PUTS IN THIS SLOT. It replaces the `Unused` flag that
      used to sit on the second line: `Unused` restated the `0/{n}` the systems column now prints
      a few centimetres to the right, and a dangling link is the fact NOTHING else on the row can
      state. `componentSourceBroken`'s own note records why only a world address is checkable.

      AND IT DELIBERATELY DOES NOT TAKE `emphasis="bare"`, unlike the source badge one block up.
      They are two faces, not one: `proto:3893`'s `pill()` helper draws the exception flag at
      `2px 8px` with a REAL `1px solid` edge at 9.5px, and only `proto:601`'s source badge is
      edgeless. A flag that lost its edge would read as the badge beside it.
    -->
    <span class="manager-world-component-row-flag" data-world-component-row-flag={entry.id}>
      <StatusPill
        tone="warning"
        icon="fas fa-link-slash"
        label={text('FABRICATE.Admin.Manager.Scoped.Component.FlagBrokenLink', 'Broken link')}
      />
    </span>
  {/if}
{/snippet}

<!--
  THE ROW'S ESSENCE CHIPS (issue 1371 r18-cat, maintainer ruling M30).

  The rules library's row draws its essences as compact count chips ahead of its `Recipes` stat
  (`components/ComponentRow.svelte`), and the maintainer wants the world row to show the same
  thing. The prototype's catalogue row draws none (`proto:602`-`613`), so this run is a ruled
  extra, and it copies the rules row's chip exactly — `Chip` in the `manager-essence-compact-chip`
  face, the glyph, the count, and `{name} {quantity}` as the title and the accessible name — so a
  GM reads one chip on both screens.

  IT RENDERS THROUGH THE FRAME'S OPT-IN `rowMeta` SNIPPET, which under `rowSecondLine:
  'description'` lands in the trailing meta column BEFORE `rowTrailing`'s stat columns — the rules
  row's own order, `[essence dots] [Recipes stat] [action]` — and outside the identity button.
  The snippet is absent by default, so the essence and tool catalogues are byte-identical.

  r18-colour: swap for the essence chip. Lane COLOUR's tinted essence-chip primitive (M29) is the
  face this run should wear; each chip already carries the roster's `colorToken` for it. Until
  the contract lands the run renders through `Chip` exactly as the rules row's does.
-->
{#snippet componentRowEssences(entry)}
  {@const chips = componentRowEssenceChips(entry, { systems, essences: worldEssences })}
  {#if chips.length > 0}
    <span class="manager-world-component-row-essences" data-world-component-row-essences={entry.id}>
      {#each chips as chip (chip.id)}
        <!-- r18-colour: swap for the essence chip -->
        <Chip
          class="manager-essence-compact-chip"
          icon={chip.icon}
          title={`${chip.name} ${chip.quantity}`}
          aria-label={`${chip.name} ${chip.quantity}`}
          data-world-component-row-essence={chip.id}>{chip.quantity}</Chip
        >
      {/each}
    </span>
  {/if}
{/snippet}

<!--
  THE TRAILING STAT CLUSTER (issue 1371, gap-list row 16).

  `proto:606`-`608`: two right-aligned 60px-minimum columns, each a mono numeral over an 8px
  uppercase micro-label. It shipped as `8 recipes 2/6 systems` in muted body text INSIDE the
  identity button, which is a sentence rather than a column — unscannable down a list, and it
  spent the identity cell's width on facts that belong at the row's trailing edge.

  It renders through `rowTrailing` rather than `rowMeta` because the row's second line is now the
  DESCRIPTION, which is what the reference draws there; `rowMeta` would put these back under the
  name. Nothing in it is interactive, so it sits happily in the trailing column beside the pen.
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
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `.manager-main`, `.manager-muted` and `.manager-kicker` are shipped and reused
     rather than restated. The catalogue's flattened ROW state is NOT here and cannot be: those
     rows are written by the frame, so a page-scoped rule carries this page's hash and never
     matches them. That block is appended to the host sheet, as both sibling lanes did. */

  /* ── THE ROW'S TWO STAT COLUMNS (`proto:606`-`608`) ──────────────────────────────────────
     Right-aligned and 60px at minimum, so the numerals line up down the list whatever their
     width — which is the whole reason the reference spends row width on a column rather than on
     a sentence. `tabular-nums` is what stops them jittering as the list re-sorts. */
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
    /* 500, WHICH IS THE ONLY WEIGHT THE FACE SHIPS. `design-system/spec.md:230-231` publishes
       the mono family at 400 and 500 only, so the reference's `font:700 12px var(--mono)` snaps
       here exactly as the control-height ladder snaps 32 and 36 to 34. */
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

  /* ── THE ROW'S ESSENCE CHIP RUN (issue 1371 r18-cat, M30) ──────────────────────────────────
     The rules row's `.manager-component-essence-dots` run, restated for this row because the
     frame's meta column is a WRAPPING flex: the run itself never wraps, so a component with many
     essences widens the column rather than breaking the chips onto a second line and growing the
     row the rendered suite pins at the chipless row's height. */
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
