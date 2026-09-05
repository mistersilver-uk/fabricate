<!-- Svelte 5 runes mode -->
<!--
  The world Component entry editor (issue 1371, epic 1357).

  == IT IS THE FIRST SURFACE IN THIS REPOSITORY THAT WRITES WORLD-SCOPE COMPONENT IDENTITY ====
  And what it writes is consumed UNEVENLY. The world `category` IS read: the read union applies
  an inheriting section from the world default AFTER the in-system re-spread, so every system
  whose switch is on resolves from the value authored here. The world NAME, ART and DESCRIPTION
  are not, because that same union re-derives identity from the in-system record unconditionally.
  The world TAG LIST is not either, because `tags` is not a section and the union's trailing
  re-spread discards the resolver's additive merge.

  Round 3 stated that unevenness as a standing disclosure paragraph at the top of the tab. The
  reference has no such paragraph (`proto:833`) — it says the same thing where each value is
  authored: the identity card's own note, and the classification card's subtitle.

  == THE PAGE FRAME IS TWO GRID COLUMNS, AND THE RAIL IS THE SECOND ==========================
  `proto:822` splits the body into `minmax(0,1fr) 326px`, each column with its OWN scroller, and
  draws the rail on BOTH tabs. Round 3 nested the rail inside the Definition tab's scrolling
  panel, so scrolling to the systems card left the rail blank and the Validation tab had none.

  == IDENTITY IS READ-ONLY FOR A LINKED RECORD ==============================================
  `proto:834-841` draws the name, the art and the description as VALUES under a `🔒 Linked
  Foundry item` pill, over the note that says they refresh from the linked item. Round 3 drew a
  `Name` input and a `Description` textarea, which is a second authority for three values the
  linked Item already owns. The editable pair survives for a record with NO source item, which
  is the one state where nothing else can name it — and that branch is reported to the driver
  rather than assumed, because it is a product ruling and not a lane decision.

  == THE EDIT IS BUFFERED AND SAVE IS WHAT WRITES IT =========================================
  Through `scopedEntryDraft.js`, shared with the essence and tool entry editors rather than
  written a third time: a draft is a SHAPE, and the same shape reached by three implementations
  is how a persisted record and its editors drift apart. The header pair that flushes it is the
  SHELL'S — `.manager-header` is a sibling of `.manager-main`, so this page structurally cannot
  render into it — which is what the three draft wires exist for.

  MEMBERSHIP, THE TAG WRITES AND THE DELETE ARE NOT BUFFERED. Each acts on a DIFFERENT record
  with its own confirmation, and an armed `Remove` that removed nothing until a later button
  says the opposite of what arming an action says.

  == DELETING IS A CARD AT THE FOOT, AND IT REFUSES ==========================================
  `proto:928-936` puts deletion in a `Delete from the world` danger card carrying the reach,
  not in the header band beside Back and Save. And the write path does not refuse: `deleteEntity`
  removes the entity, its world defaults and every membership record naming it, unconditionally.
  Epic 1357's decision 7 says the opposite, so the refusal is AUTHORED here — and because the
  `1.30.0` migration creates a membership record for every definition in every contributing
  system, on a migrated world the refusal is the NORMAL state rather than an edge case.
-->
<script>
  import { localize, notifyWarn } from '../../../util/foundryBridge.js';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import Chip from '../Chip.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import EmptyState from '../EmptyState.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import WorldComponentEntryPreviewRail from './WorldComponentEntryPreviewRail.svelte';
  import WorldComponentEntrySourceCard from './WorldComponentEntrySourceCard.svelte';
  import WorldComponentEntrySystemsCard from './WorldComponentEntrySystemsCard.svelte';
  import {
    authoredWorldComponentTags,
    componentDeleteNote,
    componentDuplicateSourceCount,
    componentEntryHeaderSubtitle,
    componentEntryPreviewGroups,
    componentSourceLine,
    componentSystemRowSummary,
    componentWorldCategoryNote,
    componentWorldTagNote,
    offeredWorldComponentCategories,
  } from './componentScoped.js';
  import { componentScopeValidationPresentation } from '../../../../../utils/componentScopeValidation.js';
  import {
    flushScopedEntryDraft,
    scopedEntryBaseline,
    scopedEntryDirty,
    scopedEntryWrites,
    withScopedEntryIdentity,
  } from './scopedEntryDraft.js';

  let {
    scope = null,
    actions = null,
    systemId = '',
    // THE CRAFTING-SYSTEM ROSTER, for the resolution mode each system row states under its name
    // (`proto:936`). Declared because the call site passes it in `componentScopeProps`; the row
    // draws no sub-line for a roster that cannot answer, rather than an empty one.
    systems = [],
    entityId = '',
    worldItems = [],
    onBackToCatalogue = () => {},
    // THE WORLD VOCABULARY EXIT. NULL BY DEFAULT and the control is withheld without it, so a
    // call site that has no route to offer renders no dead affordance — the same rule
    // `onUnlink` follows on the drop zone.
    onOpenWorldVocabulary = null,
    onOpenSystemRules = null,
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
    // COPY THE SOURCE UUID, through the shell's own clipboard seam. It is the only way a GM gets
    // the uuid out of this screen: printed text in a Foundry app is not selectable in every theme.
    onCopySourceUuid = () => {},
    // THE BUFFERED EDIT'S WIRES TO THE SHELL, in the shape the two sibling entry editors already
    // report: a LIVE handle read at click time, a reactive dirty flag for the header button's
    // disabled state, the buffered identity for the chrome that NAMES the component, and the
    // header band's own sub-line.
    onDraftChange = () => {},
    onDirtyChange = () => {},
    onDraftIdentityChange = () => {},
    onSublineChange = () => {},
  } = $props();

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title the shell renders for
  // this route. See the twin block in `WorldComponentCataloguePage.svelte`.
  const PAGE_ID = 'world-component-entry';
  const PAGE_ICON = 'fas fa-cube';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ComponentEntryTitle';
  const TITLE_FALLBACK = 'Component entry';

  /**
   * THE IDENTITY FIELDS THIS EDITOR BUFFERS, which are exactly the three a component lifts to
   * world scope. Stated here rather than imported, because this file's dependency graph is copied
   * module by module into hand-rolled mounted trees and an omission there is reported as a
   * cancelled suite rather than a failure. It is a MIRROR, and it is guarded by a source test.
   *
   * @type {readonly string[]}
   */
  const IDENTITY_FIELDS = Object.freeze(['name', 'img', 'description']);

  /**
   * The `data-popover-option` token for the category picker's UNSET choice.
   *
   * Prefixed and hyphenated so it cannot collide with an authored category: the option's id
   * is the empty string, which the primitive stamps as no attribute at all.
   *
   * @type {string}
   */
  const UNSET_CATEGORY_OPTION = '__no-world-category';

  let activeTab = $state('definition');
  // ONE ARMED CONTROL AT A TIME ACROSS THE WHOLE PAGE. The systems card's exit icons and the
  // delete card's confirm share this token, so arming either disarms the other.
  let armedToken = $state('');

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

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const entry = $derived(
    (scope?.entries ?? []).find((candidate) => candidate.id === entityId) ?? null
  );
  const entity = $derived(entry?.entity ?? null);
  const shape = $derived({ identityFields: IDENTITY_FIELDS, sections: [] });
  const persisted = $derived(scopedEntryBaseline(entry, shape));

  /**
   * WHAT THIS EDITOR KNOWS IS ON DISK, which is the persisted projection EXCEPT immediately after
   * its own Save.
   *
   * A world-scope write reaches this screen back through Foundry: the store writes the setting,
   * the replicated hook reloads it, and only then does the admin store republish. Between a
   * successful Save and the end of that round trip the projection still holds the OLD record, so
   * a dirty flag measured against it alone would leave Save lit over an edit that had landed.
   *
   * @type {{identity: Record<string, unknown>, defaults: Record<string, unknown>}|null}
   */
  let flushed = $state(null);
  const baseline = $derived(flushed ?? persisted);
  $effect(() => {
    // Read for the DEPENDENCY, not for the value: any publish of the world corpus makes the
    // projection the better answer again.
    void persisted;
    flushed = null;
  });

  /** @type {{identity: Record<string, unknown>, defaults: Record<string, unknown>}|null} */
  let draft = $state(null);
  let seededEntityId = $state(undefined);

  // Seed on IDENTITY change ONLY, never on every publish: the admin store republishes twice on a
  // refresh and again on any unrelated world-corpus write, so a reference-triggered re-seed would
  // overwrite whatever the GM had typed since.
  $effect(() => {
    const currentId = entry?.id ?? '';
    if (currentId === seededEntityId) return;
    seededEntityId = currentId;
    draft = currentId ? scopedEntryBaseline(entry, shape) : null;
    flushed = null;
    armedToken = '';
  });

  const identity = $derived(draft?.identity ?? persisted.identity);
  const dirty = $derived(scopedEntryDirty(draft, baseline));

  function patchIdentity(field, value) {
    draft = withScopedEntryIdentity(draft ?? persisted, field, value);
  }

  /**
   * Flush the buffered edit. Answers `false` when a write refused, which is what the route-exit
   * guard gates navigation on.
   *
   * @returns {Promise<boolean>}
   */
  async function saveDraft() {
    const pending = draft;
    if (!pending) return true;
    const landed = await flushScopedEntryDraft({
      entityId: entry?.id ?? '',
      writes: scopedEntryWrites(pending, baseline),
      actions,
    });
    if (landed) flushed = pending;
    return landed;
  }

  /** Throw the buffered edit away and re-seed from the record on disk. */
  function discardDraft() {
    draft = scopedEntryBaseline(entry, shape);
    flushed = null;
  }

  // THE SHELL HANDLE, a LIVE ACCESSOR rather than a reported snapshot: the route-exit cascade has
  // to ask "is there anything unsaved" at the moment a GM clicks something, and a snapshot
  // published by an effect can be one turn behind that click.
  const draftHandle = {
    isDirty: () => dirty,
    save: saveDraft,
    discard: discardDraft,
  };
  $effect(() => {
    onDraftChange(draftHandle);
    return () => onDraftChange(null);
  });
  $effect(() => {
    onDirtyChange(dirty);
  });
  // A NEW OBJECT every time, never `identity` itself: the shell holds what it is given in its own
  // state, and Svelte 5 does not proxy a value that crossed a prop boundary, so handing over a
  // reference and mutating it later would render nothing.
  $effect(() => {
    onDraftIdentityChange({ ...identity });
  });
  // Withdrawn on unmount from an effect with NO dependencies, so it runs once and tears down
  // once. Separate from the report above because that one re-runs on every keystroke and a
  // teardown attached to it would publish `null` before each republish.
  $effect(() => () => onDraftIdentityChange(null));

  // THE HEADER BAND'S SUB-LINE, reported UP rather than derived in the shell: it names the source
  // TYPE, which is a question about the entity record this page already answers for its own lock
  // pill, and resolving it twice is how a band and a card come to disagree about one record.
  const headerSubline = $derived(entry ? componentEntryHeaderSubtitle(entry, text, phrase) : '');
  $effect(() => {
    onSublineChange(headerSubline);
  });
  $effect(() => () => onSublineChange(''));

  const systemRows = $derived(Array.isArray(entry?.systems) ? entry.systems : []);
  const memberRows = $derived(systemRows.filter((row) => row?.member === true));
  const memberNames = $derived(
    memberRows.map((row) => String(row?.systemName || row?.systemId || ''))
  );
  const worldCategory = $derived(String(entry?.defaults?.category ?? '').trim());
  const worldTags = $derived(Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : []);
  const sourceLinked = $derived(entry?.hasSourceLink === true);
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));
  const aliasUuids = $derived(Array.isArray(entity?.aliasItemUuids) ? entity.aliasItemUuids : []);
  const sourceLabel = $derived(entry ? componentSourceLine(entry, text) : '');
  const duplicateCount = $derived(componentDuplicateSourceCount(entry, scope));

  /**
   * The linked game-world Item as it is NOW, resolved against the Item roster, falling back to
   * the world record's own snapshot.
   */
  const source = $derived({
    name:
      String(worldItems.find((item) => item?.uuid === sourceUuid)?.name ?? '').trim() ||
      String(identity.name ?? entity?.name ?? ''),
    img:
      String(worldItems.find((item) => item?.uuid === sourceUuid)?.img ?? '') ||
      String(identity.img ?? entity?.img ?? ''),
    description: String(
      worldItems.find((item) => item?.uuid === sourceUuid)?.description ?? entity?.description ?? ''
    ),
  });

  // WHAT THE IDENTITY CARD AND THE RAIL BOTH DRAW. For a LINKED record the linked Item is the
  // authority and the draft holds no edit of its own; for an unlinked one the draft IS the
  // authority, because nothing else can name it.
  const shownName = $derived(
    sourceLinked ? source.name : String(identity.name ?? entity?.name ?? '')
  );
  const shownImage = $derived(
    sourceLinked ? source.img : String(identity.img ?? entity?.img ?? '')
  );
  const shownDescription = $derived(
    sourceLinked ? source.description : String(identity.description ?? '')
  );

  // THE OFFERED CATEGORIES, WITH THE RESERVED BUCKET REFUSED. The store writes a section value
  // opaquely and the normalizer coerces SHAPE rather than reserved-token membership, so no layer
  // below this picker can refuse `general` — and since an inheriting section now really resolves
  // from the world default, a world `general` would reset every inheriting system on the first
  // read. The refusal is the shipped case-insensitive predicate, never string equality.
  const categoryOptions = $derived(
    offeredWorldComponentCategories([
      ...(scope?.entries ?? []).map((candidate) => candidate?.defaults?.category),
      worldCategory,
    ])
  );

  const noCategoryLabel = $derived(
    text('FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory', 'No world category')
  );

  /**
   * THE PICKER'S OPTION LIST, unset option FIRST (`proto:891`).
   *
   * A picker whose only choices are authored values cannot express "this record has none", which
   * is the state every freshly created component is in — and clearing a world category is a real
   * edit rather than a refusal, so the empty choice is a first-class option rather than an absence
   * of one. Its `dataId` is a reserved token rather than its own empty id: `data-popover-option`
   * is stamped only for a TRUTHY value, so an empty one would leave the single option a capture
   * walk and a mounted test most need to address with no handle at all.
   *
   * The list can never be empty, so this call site passes no `emptyHint`: the primitive's empty
   * panel is unreachable here.
   */
  const categoryPickerOptions = $derived([
    { id: '', label: noCategoryLabel, dataId: UNSET_CATEGORY_OPTION },
    ...categoryOptions.map((option) => ({ id: option, label: option, dataId: option })),
  ]);

  // THE WORLD TAG VOCABULARY THE CARD TOGGLES OVER. The reference draws no add field on this card
  // (`proto:899-901`): authoring the vocabulary is behind `Edit world vocabulary ↗`, and what this
  // card does is apply and clear the tags the world already has.
  const tagVocabulary = $derived(authoredWorldComponentTags(scope));

  const categoryNote = $derived(entry ? componentWorldCategoryNote(entry, phrase) : '');
  const tagNote = $derived(entry ? componentWorldTagNote(entry, phrase) : '');
  const deleteNote = $derived(componentDeleteNote(memberNames, phrase));
  const previewGroups = $derived(entry ? componentEntryPreviewGroups(entry, text) : []);

  const validation = $derived(
    componentScopeValidationPresentation(
      {
        name: shownName,
        hasSourceLink: sourceLinked,
        worldCategory,
        worldTags,
        systemKnown: Boolean(systemId),
        member: systemRows.some((row) => row?.systemId === systemId && row?.member === true),
        systemName: String(
          systemRows.find((row) => row?.systemId === systemId)?.systemName ?? systemId
        ),
        systemId,
        resolvedCategory:
          systemRows.find((row) => row?.systemId === systemId)?.category ?? worldCategory,
      },
      phrase
    )
  );
  const counts = $derived(validation.counts);
  // NO `validationStatus` HERE ANY MORE (r11-entry, UX F-D). "The worst thing the rows say" was
  // derived twice on this screen — once for the tab badge below and once for the hero — and the
  // hero's copy of it is now `ScopedValidationTab`'s `verdictSummary`, where the words that
  // state a verdict live with the surface that states them.

  const TABS = [
    { id: 'definition', icon: 'fas fa-cube' },
    { id: 'validation', icon: 'fas fa-clipboard-check' },
  ];
  const tabs = $derived(
    TABS.map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      labelKey:
        tab.id === 'definition'
          ? 'FABRICATE.Admin.Manager.Scoped.Component.Entry.TabCatalogue'
          : 'FABRICATE.Admin.Manager.Scoped.Component.TabValidation',
      label: tab.id === 'definition' ? 'Catalogue entry' : 'Validation',
    }))
  );

  /**
   * The Validation tab's badge, in the shape `EditorTabs` takes.
   *
   * THE CLEAR STATE IS A TICK, NOT AN ABSENCE (`proto:824`). A tab that badges only its failures
   * cannot tell "checked and clear" from "not checked", and this tab is the one place the record
   * says which it is. Written as an early-return chain rather than a nested ternary, which
   * SonarCloud reports as S3358.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {{label: string|number, tone: string, name: string}}
   */
  function validationBadge(current) {
    if (current.blocking > 0) {
      return {
        label: current.blocking,
        tone: 'danger',
        name: text('FABRICATE.Admin.Manager.Scoped.Component.ValidationStatusBlock', 'INCOMPLETE'),
      };
    }
    if (current.warnings > 0) {
      return {
        label: current.warnings,
        tone: 'warning',
        name: text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.ValidationWarned',
          'Validation warnings'
        ),
      };
    }
    return {
      label: '✓',
      tone: 'success',
      name: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.ValidationClear',
        'Validation: no problems'
      ),
    };
  }
  const badges = $derived({ validation: validationBadge(counts) });

  const deleteToken = $derived(`world-component-delete:${entry?.id ?? ''}`);

  async function runDelete() {
    armedToken = '';
    // THE REFUSAL. `deleteEntity` does not refuse: it removes the entity, its world defaults and
    // every membership record naming it, unconditionally. So the guard is here, and it is on the
    // CALL rather than on a disabled attribute — a disabled button would satisfy any call
    // assertion while leaving the GM with no explanation at all. The card's own note carries it.
    if (memberNames.length > 0) return;
    const deleted = await actions?.deleteEntity?.(entry?.id ?? '');
    if (deleted !== false) onBackToCatalogue();
  }

  /**
   * Write the world category, or REFUSE the reserved bucket and say so.
   *
   * ── A REFUSAL THAT WRITES ABSENCE IS A DELETION ─────────────────────────────────────────
   * The refusal once shipped as `offered[0] ?? ''`, so a refused value cleared the authored one
   * with no message. BLANK IS STILL A REAL EDIT: an empty option is a GM clearing the category
   * deliberately and must keep working; only a NON-BLANK value the offer list refuses is turned
   * away, and nothing is written for it.
   *
   * ── AND THE CONTROL PUTS ITSELF BACK, BECAUSE IT NEVER LEFT ─────────────────────────────
   * The picker's trigger is painted from `worldCategory`, the persisted value, rather than from an
   * internal selection, so a refused choice needs no restore step: nothing moved. The `<select>`
   * this replaced held its own selection and did need one — `control.value = worldCategory` — and
   * that difference is why this guard no longer takes a control at all.
   *
   * ── IT IS THE SECOND LINE, NOT THE FIRST ────────────────────────────────────────────────
   * The OFFER is the enforcement point and always was: `offeredWorldComponentCategories` builds
   * the option list, so the reserved bucket is not among the choices and a GM cannot pick it. This
   * guard is what keeps that true for a value arriving any other way — and it is deliberately not
   * deleted as unreachable, because the layer below it cannot refuse the token at all and a picker
   * is a rendering decision that a later revision may change again.
   *
   * @param {string} value the chosen option's id, which is the category or the empty string.
   * @returns {void}
   */
  function commitWorldCategory(value) {
    const raw = String(value ?? '');
    const offered = offeredWorldComponentCategories([raw]);
    if (offered.length === 0 && raw.trim() !== '') {
      notifyWarn(
        text(
          'FABRICATE.Admin.Manager.Scoped.Component.CategoryReserved',
          'General is the reserved bucket every component falls back to, so it cannot be a world category. Leave it blank instead.'
        )
      );
      return;
    }
    actions?.updateWorldDefaultSection?.(entry?.id ?? '', 'category', offered[0] ?? '');
  }

  /**
   * Apply or clear one world tag. The chip run is a TOGGLE over the vocabulary rather than a run
   * of removable chips beside an add field (`proto:899-901`).
   *
   * @param {string} tag
   * @returns {void}
   */
  function toggleWorldTag(tag) {
    const applied = worldTags.includes(tag);
    actions?.setWorldTags?.(
      entry?.id ?? '',
      applied ? worldTags.filter((candidate) => candidate !== tag) : [...worldTags, tag]
    );
  }

  function addAlias(uuid) {
    if (aliasUuids.includes(uuid)) return;
    actions?.updateEntity?.(entry?.id ?? '', { aliasItemUuids: [...aliasUuids, uuid] });
  }

  function removeAlias(uuid) {
    actions?.updateEntity?.(entry?.id ?? '', {
      aliasItemUuids: aliasUuids.filter((candidate) => candidate !== uuid),
    });
  }

  /**
   * One system row's middle column, resolved through the shared model so a unit test can reach
   * every branch without going through the DOM.
   *
   * @param {object} row
   * @param {{worldCategory: string}} context
   * @returns {{member: boolean, text: string}}
   */
  function summaryFor(row, context) {
    return componentSystemRowSummary(row, { ...context, text, phrase });
  }
</script>

<main class="manager-main" data-scoped-page="world-component-entry" aria-label={title}>
  {#if !entry}
    <EmptyState
      icon={PAGE_ICON}
      title={text(
        'FABRICATE.Admin.Manager.Scoped.Component.EntryMissingTitle',
        'No component chosen'
      )}
      hint={text(
        'FABRICATE.Admin.Manager.Scoped.Component.EntryMissingHint',
        'This entry is open on a component the world corpus no longer holds. Return to the catalogue and choose one.'
      )}
      dataAttr="data-scoped-entry-state"
      dataValue="missing"
    >
      <ManagerButton data-scoped-entry-back onclick={() => onBackToCatalogue()}>
        {text('FABRICATE.Admin.Manager.Scoped.Component.BackToCatalogue', 'Back to the catalogue')}
      </ManagerButton>
    </EmptyState>
  {:else}
    <!--
      ONE CHILD OF `<main>`, WITH ITS OWN TWO-COLUMN GRID. `.manager-main` gives a full-width
      world route a single `minmax(0, 1fr)` row, so two children would land in the same grid area
      and paint over each other. The split is this page's composition rather than the route's, and
      the RAIL is a column of it rather than a child of the tab panel — which is what keeps it on
      screen while the panel scrolls and present on both tabs.
    -->
    <div class="manager-component-entry-page">
      <div class="manager-component-entry-column">
        <EditorTabs
          {tabs}
          {activeTab}
          {badges}
          onSelect={(tab) => (activeTab = tab)}
          ariaLabelKey="FABRICATE.Admin.Manager.Scoped.Component.EntryTabsLabel"
          ariaLabel="Component definition sections"
          idStem="scoped-component-entry"
          hookAttribute="data-scoped-entry-tab"
          badgeAttribute="data-scoped-entry-tab-badge"
        />

        <div
          class="manager-component-entry-panel"
          data-scoped-entry={PAGE_ID}
          id={`scoped-component-entry-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`scoped-component-entry-tab-${activeTab}`}
          tabindex="-1"
          data-keyboard-focus="true"
        >
          {#if activeTab === 'definition'}
            <!--
              THE IDENTITY CARD. For a LINKED record the three values are the linked Item's and
              are drawn as values under a lock pill; the editable pair survives only where there
              is no Item to refresh from.
            -->
            <InspectorCard
              class="manager-component-entry-card manager-component-entry-identity"
              data-scoped-entry-identity={entry.id}
              data-scoped-entry-identity-card=""
            >
              <div class="manager-component-entry-identity-body">
                <Medallion src={shownImage} icon={PAGE_ICON} size={56} glyph={26} />
                <div class="manager-component-entry-identity-copy">
                  <div class="manager-component-entry-identity-name-row">
                    {#if sourceLinked}
                      <span class="manager-component-entry-identity-name" data-scoped-entry-name
                        >{shownName}</span
                      >
                      <span data-scoped-entry-linked-pill>
                        <!--
                          `emphasis="outlined"` IS THE REFERENCE'S LOCK PILL (`proto:834`): 9px
                          secondary ink on a hairline, on a 2px/8px band. The primitive's own
                          scoped `<style>` is unlayered and this module's sheet is imported at
                          `layer(modules)`, so no rule in `styles/fabricate.css` can reach it at
                          any specificity — the variant is the only way to say this, and it is
                          opt-in so every other `subtle` pill keeps its filled face.
                        -->
                        <StatusPill
                          tone="subtle"
                          emphasis="outlined"
                          icon="fas fa-lock"
                          label={sourceLabel}
                        />
                      </span>
                    {:else}
                      <input
                        class="manager-component-entry-identity-input"
                        type="text"
                        value={identity.name ?? ''}
                        aria-label={text(
                          'FABRICATE.Admin.Manager.Scoped.Component.FieldName',
                          'Name'
                        )}
                        data-scoped-entry-name
                        oninput={(event) => patchIdentity('name', event.currentTarget.value)}
                      />
                      <span data-scoped-entry-linked-pill>
                        <StatusPill
                          tone="warning"
                          icon="fas fa-link-slash"
                          label={text(
                            'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                            'No source item'
                          )}
                        />
                      </span>
                    {/if}
                  </div>
                  {#if sourceLinked}
                    <p
                      class="manager-component-entry-identity-description"
                      data-scoped-entry-description
                    >
                      {shownDescription}
                    </p>
                  {:else}
                    <textarea
                      class="manager-component-entry-identity-textarea"
                      rows="3"
                      value={identity.description ?? ''}
                      aria-label={text(
                        'FABRICATE.Admin.Manager.Scoped.Component.FieldDescription',
                        'Description'
                      )}
                      data-scoped-entry-description
                      oninput={(event) => patchIdentity('description', event.currentTarget.value)}
                    ></textarea>
                  {/if}
                  <!--
                    THE SENTENCE IS THE REFERENCE'S OWN LITERAL (`proto:847`) AND STAYS VERBATIM,
                    AND THE MECHANISM BEHIND IT IS HONEST FOR ONE OF THE TWO LINKED BRANCHES
                    (issue 1371 r11-entry, round-2 Foundry review finding 3).

                    A WORLD item refreshes: `source` below resolves the live document out of
                    `worldItems`, which the shell fills from `game.items.contents`, so a rename
                    in the sidebar reaches this card on the next publish. A COMPENDIUM item does
                    NOT: a pack address is never in that collection, so the three values fall
                    back to the stored snapshot permanently and are refreshed only by re-dropping
                    the same item — while `componentSourceLine` correctly prints `Linked
                    Compendium entry` beside them, so the state names itself.

                    NOT PAPERED OVER IN THE COPY, and not fixed here either. The copy is the
                    reference's and the brief makes the reference the authority for it; the fix
                    is a `fromUuid` read, which is asynchronous and already written for the
                    create and relink paths (`foundryBridge.resolveItemSourceSnapshot`), so
                    routing the compendium branch through it is a store-side change with its own
                    refusal and caching questions rather than a line in this card. It is carried
                    as a named follow-up in this lane's handoff.
                  -->
                  <p class="manager-component-entry-identity-note" data-scoped-entry-attribution>
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.IdentityNote',
                      'Name, image and description refresh from the linked item. Every system shows the same three.'
                    )}
                  </p>
                </div>
                <ItemDropZone
                  compact
                  kind="component-identity"
                  emptyIcon="fas fa-right-left"
                  title={text(
                    'FABRICATE.Admin.Manager.Scoped.Component.Entry.IdentityDropTitle',
                    'Drop a world or compendium item to replace'
                  )}
                  onDrop={onSourceDrop}
                />
              </div>
            </InspectorCard>

            <WorldComponentEntrySourceCard
              entryId={entry.id}
              {sourceUuid}
              {aliasUuids}
              {duplicateCount}
              {text}
              {phrase}
              {onSourceDrop}
              onUnlinkSource={sourceLinked ? onUnlinkSource : null}
              {onCopySourceUuid}
              onAddAlias={addAlias}
              onRemoveAlias={removeAlias}
            />

            <!--
              ONE `World classification` CARD, NOT TWO. `proto:881-910` draws category and tags in
              one `minmax(0,260px) minmax(0,1fr)` grid under one head; round 3 split it into a
              `World category` card and a `World tags` card, each headed by a bare kicker, and put
              the vocabulary exit on only one of them.
            -->
            <InspectorCard
              class="manager-component-entry-card manager-component-entry-classification"
              data-scoped-entry-category={entry.id}
              data-scoped-entry-classification-card=""
            >
              <div class="manager-component-entry-card-head">
                <i class="fas fa-tags manager-card-glyph is-tag" aria-hidden="true"></i>
                <div class="manager-component-entry-card-head-copy">
                  <h3 class="manager-card-heading">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.ClassificationTitle',
                      'World classification'
                    )}
                  </h3>
                  <!--
                    THE SUBTITLE STATES THE HALF THAT IS CONSUMED AND STOPS (issue 1371, revision
                    8). It read `Set once here, merged into every system that has rules for it`,
                    which is true of the CATEGORY and false of the TAGS: an inheriting section
                    really does resolve from the world default, while `tags` is not a section, so
                    the read union's trailing re-spread discards the resolver's additive merge and
                    no system resolves a world tag at all. One sentence made both claims, and the
                    shipped rule in `ui-integration/spec.md` is that no surface may assert the
                    false half while the merge is unconsumed.
                  -->
                  <p class="manager-subtitle">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.ClassificationSubtitle',
                      'Set once here. The category resolves in every system that inherits it; the tags stay on this record.'
                    )}
                  </p>
                </div>
                <!--
                  THE VOCABULARY EXIT, as a bare accent-ink text action rather than a filled
                  button (`proto:886`). It routes through the OWNER, which is what makes it safe
                  on a buffered editor: the gateway's `setView` runs the unsaved-changes guard
                  before it moves, so a GM with an unsaved name is asked rather than losing it.
                -->
                {#if onOpenWorldVocabulary}
                  <button
                    type="button"
                    class="manager-inline-link"
                    data-keyboard-focus="true"
                    data-scoped-entry-vocabulary-exit
                    onclick={() => onOpenWorldVocabulary()}
                  >
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.EditVocabulary',
                      'Edit world vocabulary'
                    )}
                    <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                  </button>
                {/if}
              </div>
              <div class="manager-component-entry-classification-body">
                <div class="manager-component-entry-classification-column">
                  <p class="manager-micro-label" data-scoped-entry-category-label>
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.CategoryLabel',
                      'Category'
                    )}
                  </p>
                  <!--
                    THE CATEGORY PICKER IS THE SHARED POPOVER, NOT A NATIVE `<select>` (issue
                    1371, revision 8). A native select draws the OPERATING SYSTEM's drop-down: it
                    carries none of this app's type, colour or spacing, and it cannot be themed at
                    all — which is why `design-system-debt-ratchets` counts one as new debt, and
                    why this control was the branch's single new entry against that gate.

                    `showSearch={false}` because the world's category vocabulary is a handful of
                    fixed names, and because it is what keeps `triggerHasPopup="listbox"`
                    truthful: with a query field the panel is a dialog CONTAINING a listbox, and
                    the trigger would announce a control the GM never gets.

                    AND THE FILL IS THE REFERENCE'S NOW. The rule under this class used to hold
                    `--fab-bg-1` with a note that a translucent `<select>` background opens a
                    LIGHT native popup in every browser. There is no native popup any more, so
                    `proto:890`'s own `surface-soft` fill is reachable and the deviation that
                    opaque fill was recorded as is retired with the element.
                  -->
                  <SearchablePopover
                    options={categoryPickerOptions}
                    value={worldCategory}
                    showSearch={false}
                    showChevron={true}
                    triggerHasPopup="listbox"
                    pickerClass="manager-component-entry-category-picker"
                    triggerClass="manager-component-entry-category-trigger"
                    valueClass="manager-component-entry-category-value"
                    triggerLabel={worldCategory || noCategoryLabel}
                    triggerAriaLabel={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.WorldCategory',
                      'World category'
                    )}
                    dialogAriaLabel={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.WorldCategory',
                      'World category'
                    )}
                    triggerData={{ 'data-scoped-entry-category-input': '' }}
                    onChoose={(option) => commitWorldCategory(option)}
                  />
                  <p class="manager-component-entry-note" data-scoped-entry-category-note>
                    {categoryNote}
                  </p>
                </div>
                <div
                  class="manager-component-entry-classification-column"
                  data-scoped-entry-tags={entry.id}
                >
                  <p class="manager-micro-label" data-scoped-entry-tags-label>
                    {text('FABRICATE.Admin.Manager.Scoped.Component.Entry.TagsLabel', 'Tags')}
                  </p>
                  <!--
                    THE TAG RUN IS A CONTROL RUN, NOT A BADGE RUN (`proto:5401`): 600/11px on a
                    5px/12px band at radius 999. `density="tag-run"` is the primitive's opt-in
                    scale for exactly that, and it is the only way to say it — the chip's own
                    scoped style is unlayered and beats this module's layered sheet at any
                    specificity.

                    The unlit chip KEEPS `tone="neutral"` rather than falling to the default
                    tone. Measured, not assumed: the compare run reports the reference's unlit
                    ink and `--fab-text-muted` as the SAME computed value, and `--fab-text-muted`
                    is what `is-neutral` paints. The default chip paints `--fab-text`, a
                    different value, so dropping the tone would move the unlit ink AWAY from the
                    reference to buy nothing. (No colour literal is written here: the theme
                    colour contract scans comments too, and the tokens say it exactly.)

                    THE LIT CHIP IS `tone="tag" emphasis="lit"`, and the emphasis states the half
                    the tone does not. The reference says ONE colour three ways: on the edge, on a
                    wash of itself, and ON THE LABEL (`proto:5401`, `proto:5665`). `tone="tag"`
                    alone says only the edge — it mixes its wash into the OPAQUE surface behind the
                    chip rather than into nothing, and inks the label in the default text token, so
                    a compare run measured the fill and the ink as this screen's last surviving
                    colour divergence while the edge was right all along. `emphasis="lit"` is the
                    shared primitive's opt-in second axis for exactly those two declarations, the
                    same shape lane E shipped for `struck` and `density="tag-run"` — NOT an in-place
                    restyle of `tone="tag"`, which has six other callers, and not a fourth chip
                    component.

                    The two props ride the SAME branch, and that is a constraint rather than a
                    tidiness: the emphasis is selected on the classes that declare a colour of
                    their own, so `emphasis="lit"` beside `tone="neutral"` would emit a class that
                    matches nothing. The unlit branch therefore takes neither.
                  -->
                  <div class="manager-component-entry-chips">
                    {#each tagVocabulary as tag (tag)}
                      <Chip
                        tag="button"
                        type="button"
                        density="tag-run"
                        tone={worldTags.includes(tag) ? 'tag' : 'neutral'}
                        emphasis={worldTags.includes(tag) ? 'lit' : ''}
                        data-scoped-entry-tag={tag}
                        aria-pressed={worldTags.includes(tag)}
                        aria-label={phrase(
                          worldTags.includes(tag)
                            ? 'FABRICATE.Admin.Manager.Scoped.Component.Entry.TagClear'
                            : 'FABRICATE.Admin.Manager.Scoped.Component.Entry.TagApply',
                          worldTags.includes(tag)
                            ? 'Remove the world tag {tag}'
                            : 'Apply the world tag {tag}',
                          { tag }
                        )}
                        onclick={() => toggleWorldTag(tag)}>{tag}</Chip
                      >
                    {/each}
                    {#if tagVocabulary.length === 0}
                      <span class="manager-component-entry-note" data-scoped-entry-tags-empty
                        >{text(
                          'FABRICATE.Admin.Manager.Scoped.Component.Entry.TagsEmpty',
                          'No world tags are authored yet. Add them in the world vocabulary.'
                        )}</span
                      >
                    {/if}
                  </div>
                  <p class="manager-component-entry-note" data-scoped-entry-tag-note>{tagNote}</p>
                </div>
              </div>
            </InspectorCard>

            <WorldComponentEntrySystemsCard
              entryId={entry.id}
              entityName={shownName}
              rows={systemRows}
              {systems}
              {worldCategory}
              {armedToken}
              {text}
              {phrase}
              {summaryFor}
              onArm={(token) => (armedToken = token)}
              onDisarm={() => (armedToken = '')}
              onAdd={(rowSystemId) => actions?.addToSystem?.(entry.id, rowSystemId)}
              onRemove={(rowSystemId) => actions?.removeFromSystem?.(entry.id, rowSystemId)}
              {onOpenSystemRules}
            />

            <!--
              DELETION IS A CARD AT THE FOOT, NOT A HEADER BUTTON (`proto:928-936`). The card is
              what lets the reach — or the REFUSAL — be stated as visible body copy rather than
              only in an armed control's accessible name, which is what round 2 discovered was
              leaving the sighted flow with a button that did nothing and said nothing.
            -->
            <InspectorCard
              class="manager-component-entry-card manager-scoped-entry-danger"
              data-scoped-entry-delete-card={entry.id}
            >
              <div class="manager-component-entry-danger-body">
                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <div class="manager-component-entry-danger-copy">
                  <p class="manager-component-entry-danger-title" data-scoped-entry-delete-title>
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.DeleteTitle',
                      'Delete from the world'
                    )}
                  </p>
                  <p class="manager-component-entry-danger-note" data-scoped-entry-delete-note>
                    {deleteNote.text}
                  </p>
                </div>
                <ArmedDangerButton
                  token={deleteToken}
                  armed={armedToken === deleteToken}
                  idleLabel={text(
                    'FABRICATE.Admin.Manager.Scoped.Component.Entry.DeleteAction',
                    'Delete entry'
                  )}
                  armedLabel={deleteNote.refused
                    ? text(
                        'FABRICATE.Admin.Manager.Scoped.Component.DeleteBlocked',
                        'Cannot delete'
                      )
                    : text(
                        'FABRICATE.Admin.Manager.Scoped.Component.DeleteConfirm',
                        'Confirm delete'
                      )}
                  idleAriaLabel={`${text(
                    'FABRICATE.Admin.Manager.Scoped.Component.Entry.DeleteAction',
                    'Delete entry'
                  )} — ${phrase(
                    'FABRICATE.Admin.Manager.Scoped.Component.DeleteAria',
                    'Delete {name} from the world catalogue',
                    { name: shownName || entry.id }
                  )}`}
                  armedAriaLabel={`${
                    deleteNote.refused
                      ? text(
                          'FABRICATE.Admin.Manager.Scoped.Component.DeleteBlocked',
                          'Cannot delete'
                        )
                      : text(
                          'FABRICATE.Admin.Manager.Scoped.Component.DeleteConfirm',
                          'Confirm delete'
                        )
                  } — ${deleteNote.text}`}
                  onArm={(token) => (armedToken = token)}
                  onDisarm={() => (armedToken = '')}
                  onConfirm={runDelete}
                />
              </div>
            </InspectorCard>
          {:else}
            <!--
              NO `title` AND NO `intro`, AND THE HERO STATES THE VERDICT (r11-entry, UX F-D).
              `proto:957-960`: the Validation body's first child is the two-column grid. There is
              no heading and no intro paragraph — the tab is reached through a labelled tab strip
              inside a titled editor, so an `Entry validation` heading names it a fourth time and
              pushes the grid down. The pair is SUPPRESSED BY OMISSION: `ScopedValidationTab`
              defaults both to `''` and `EditorValidationSurface` draws no head block at all when
              both are empty, so there is no prop to pass here and none to invent.

              `verdictSummary` replaces the static hero this screen shipped. It read `World
              record` over "What every system inheriting this component resolves from it." — a
              description of the SUBJECT, on a record whose own tab badge said `Blocking 2`, under
              a fixed clipboard glyph. `proto:4577-4579` derives all three from the counts, and
              the derivation is the shared tab's because the words are its vocabulary rather than
              this entity type's.

              THE BLOCK LABEL IS STILL THIS FAMILY'S OWN, and it is `Blocking` (`proto:4573`,
              the tone table, which gives the three badges as `Blocking` / `Warning` / `Pass`).
              It reached the recipe key first, which localises to "Blocks enable" — on an entity
              that HAS no enable switch, because epic decision 10 says component membership is
              binary — and then `INCOMPLETE`, which is on no vocabulary the reference draws. The
              other two badges already read `Warning` and `Pass` from the shared keys, so this
              one word is the whole difference between the shipped run and the reference's.
            -->
            <ScopedValidationTab
              verdictSummary
              {counts}
              groups={validation.groups}
              blockLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Component.ValidationStatusBlock',
                'Blocking'
              )}
              rowDataAttr="data-scoped-entry-check"
              hookAttribute="data-scoped-entry-validation"
            />
          {/if}
        </div>
      </div>

      <!-- THE RAIL IS A GRID COLUMN, so it is drawn on BOTH tabs and keeps its own scroller. -->
      <WorldComponentEntryPreviewRail
        name={shownName}
        image={shownImage}
        icon={PAGE_ICON}
        categoryLabel={worldCategory ||
          text('FABRICATE.Admin.Manager.Scoped.Component.Entry.NoWorldCategoryTile', 'No category')}
        tags={worldTags}
        linked={sourceLinked}
        factGroups={previewGroups}
        {text}
      />
    </div>
  {/if}
</main>
