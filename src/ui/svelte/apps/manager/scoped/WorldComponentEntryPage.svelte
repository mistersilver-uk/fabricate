<!-- Svelte 5 runes mode -->
<!--
  The world Component entry editor (issue 1371, epic 1357), the first surface here that writes
  world-scope component identity — and what it writes is consumed UNEVENLY: the world `category`
  IS read by every inheriting system, while the NAME, ART, DESCRIPTION and TAG LIST are not.
  THE PAGE FRAME IS TWO GRID COLUMNS and the RAIL is the second (`proto:822`), each with its own
  scroller. IDENTITY IS READ-ONLY FOR A LINKED RECORD (`proto:834-841`). THE EDIT IS BUFFERED
  through `scopedEntryDraft.js` and the header pair that flushes it is the SHELL'S, while
  MEMBERSHIP, the TAG WRITES and the DELETE are not. DELETING IS A CARD AT THE FOOT and it
  REFUSES — `deleteEntity` does not, so epic decision 7's refusal is AUTHORED here.
-->
<script>
  import { localize, notifyError, notifyWarn } from '../../../util/foundryBridge.js';
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import Chip from '../../../components/Chip.svelte';
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import EmptyState from '../EmptyState.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import EssenceQuantityCard from '../components/EssenceQuantityCard.svelte';
  import WorldComponentEntryPreviewRail from './WorldComponentEntryPreviewRail.svelte';
  import WorldComponentEntrySourceCard from './WorldComponentEntrySourceCard.svelte';
  import WorldComponentEntrySystemsCard from './WorldComponentEntrySystemsCard.svelte';
  import {
    componentDeleteNote,
    componentDuplicateSourceCount,
    componentEntryHeaderSubtitle,
    componentEntryPreviewGroups,
    componentEssenceChips,
    componentSourceLine,
    componentSystemRowSummary,
    componentWorldCategoryNote,
    componentWorldEssenceNote,
    componentWorldEssencesAuthored,
    componentWorldTagNote,
    offeredWorldComponentCategories,
    worldVocabularyComponentCategories,
    worldVocabularyComponentTags,
  } from './componentScoped.js';
  import { componentScopeValidationPresentation } from '../../../../model/componentScopeValidation.js';
  import { visibleEssenceOptions } from '../../../../model/essenceValidation.js';
  // issue 1371 r20-entry3: the refused-save sentence is composed in the shared studio module, so
  // the three world entry editors cannot drift on what a step of a Save is called.
  import { reportRefusedScopedEntrySave } from './scopedStudio.js';
  import {
    SCOPED_ENTRY_IDENTITY_STEP,
    flushScopedEntryDraft,
    scopedEntryBaseline,
    scopedEntryDirty,
    scopedEntryWrites,
    withScopedEntryDefault,
    withScopedEntryIdentity,
  } from './scopedEntryDraft.js';

  let {
    scope = null,
    actions = null,
    systemId = '',
    // THE CRAFTING-SYSTEM ROSTER, for the resolution mode each row states; a roster that cannot
    // answer draws no sub-line rather than an empty one.
    systems = [],
    entityId = '',
    worldItems = [],
    // THE WORLD ESSENCE CATALOGUE, for the `Essence contribution` card's rows (M31): one row per
    // entry in the catalogue's order, nothing for a key it does not list, and a sentence at none.
    worldEssences = [],
    onBackToCatalogue = () => {},
    // THE WORLD VOCABULARY EXIT, NULL BY DEFAULT: a call site with no route renders no affordance.
    onOpenWorldVocabulary = null,
    onOpenSystemRules = null,
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
    // COPY THE SOURCE UUID, through the shell's own clipboard seam. It is the only way a GM gets
    // the uuid out of this screen: printed text in a Foundry app is not selectable in every theme.
    onCopySourceUuid = () => {},
    // THE BUFFERED EDIT'S WIRES TO THE SHELL: a LIVE handle read at click time, a reactive dirty
    // flag, the buffered identity for the chrome that NAMES the component, and the sub-line.
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
   * THE IDENTITY FIELDS THIS EDITOR BUFFERS — the three a component lifts to world scope. Stated
   * here rather than imported, because this file's graph is copied module by module into
   * hand-rolled mounted trees. It is a MIRROR, and a source test guards it.
   */
  const IDENTITY_FIELDS = Object.freeze(['name', 'img', 'description']);

  /**
   * The `data-popover-option` token for the category picker's UNSET choice, prefixed so it
   * cannot collide with an authored category: the option's own id is the empty string, which
   * the primitive stamps as no attribute at all.
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
  /**
   * EVERY SECTION THIS EDITOR BUFFERS, IN THE ORDER A SAVE WRITES THEM (M31, M34): category,
   * tags, essences, aliases. Before M34 three of them wrote through on touch while the identity
   * fields were buffered, so a `Save entry` a LINKED record could never light. `tags` and
   * `aliases` are not world-default sections and say so through `readers`/`writers`.
   */
  const DRAFT_SECTIONS = Object.freeze(['category', 'tags', 'essences', 'aliases']);

  const shape = $derived({
    identityFields: IDENTITY_FIELDS,
    sections: DRAFT_SECTIONS,
    readers: {
      aliases: (record) => record?.entity?.aliasItemUuids ?? null,
    },
  });

  /** How the two non-section fields land (M34). `null` — a cleared list — writes as empty. */
  const DRAFT_WRITERS = Object.freeze({
    tags: (family, id, value) => family?.setWorldTags?.(id, Array.isArray(value) ? value : []),
    aliases: (family, id, value) =>
      family?.updateEntity?.(id, { aliasItemUuids: Array.isArray(value) ? value : [] }),
  });
  const persisted = $derived(scopedEntryBaseline(entry, shape));

  /**
   * WHAT THIS EDITOR KNOWS IS ON DISK — the persisted projection EXCEPT immediately after its own
   * Save: the write reaches this screen back through Foundry, so between a successful Save and
   * the end of that round trip a flag measured against the projection alone would leave Save lit.
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

  // Seed on IDENTITY change ONLY: the store republishes on any unrelated world write, and a
  // reference-triggered re-seed would overwrite whatever the GM had typed since.
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
   * The sentence a REFUSED save puts in front of the GM, composed by the shared
   * `reportRefusedScopedEntrySave`. This screen carried its own step-name map until r20 — a
   * second spelling of four section names the shared table already owns.
   */
  function reportRefusedSave(refusal) {
    reportRefusedScopedEntrySave({
      refusal,
      entityType: 'component',
      identityStep: SCOPED_ENTRY_IDENTITY_STEP,
      format: phrase,
      notify: notifyError,
    });
  }

  /** Flush the buffered edit; `false` for a refusal OR a rejection, which the exit guard reads. */
  async function saveDraft() {
    const pending = draft;
    if (!pending) return true;
    const landed = await flushScopedEntryDraft({
      entityId: entry?.id ?? '',
      writes: scopedEntryWrites(pending, baseline),
      actions,
      writers: DRAFT_WRITERS,
      onRefused: reportRefusedSave,
    });
    if (landed) flushed = pending;
    return landed;
  }

  /** Throw the buffered edit away and re-seed from the record on disk. */
  function discardDraft() {
    draft = scopedEntryBaseline(entry, shape);
    flushed = null;
  }

  // THE SHELL HANDLE, a LIVE ACCESSOR rather than a reported snapshot: the exit cascade asks at
  // click time, and a snapshot published by an effect can be one turn behind that click.
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
  // A NEW OBJECT every time, never `identity` itself: Svelte 5 does not proxy a value that crossed
  // a prop boundary, so handing a reference over and mutating it later would render nothing.
  $effect(() => {
    onDraftIdentityChange({ ...identity });
  });
  // Withdrawn on unmount from an effect with NO dependencies: attached to the report above, whose
  // dependencies re-run on every keystroke, it would publish `null` before each republish.
  $effect(() => () => onDraftIdentityChange(null));

  // THE HEADER BAND'S SUB-LINE, reported UP rather than derived in the shell: this page already
  // answers the same question for its lock pill, and resolving it twice is how the two disagree.
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
  // THE STAGED VALUES, WHICH THE WHOLE SCREEN READS (M34): every control previews the draft, and
  // `null` — the baseline's spelling of an absent value — reads as empty here.
  const stagedDefault = (section) => draft?.defaults?.[section] ?? persisted.defaults[section];
  const worldCategory = $derived(String(stagedDefault('category') ?? '').trim());
  const worldTags = $derived.by(() => {
    const value = stagedDefault('tags');
    return Array.isArray(value) ? value : [];
  });
  const sourceLinked = $derived(entry?.hasSourceLink === true);
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));
  const aliasUuids = $derived.by(() => {
    const value = stagedDefault('aliases');
    return Array.isArray(value) ? value : [];
  });

  /**
   * Stage one section's next value, normalising "nothing" against what is on disk: a control
   * used and put back must read CLEAN rather than as a write of `''`/`[]` over an absent `null`.
   */
  function stageSection(section, next) {
    const empty = Array.isArray(next) ? next.length === 0 : String(next ?? '') === '';
    const absent = baseline.defaults[section] === null || baseline.defaults[section] === undefined;
    draft = withScopedEntryDefault(draft ?? persisted, section, empty && absent ? null : next);
  }
  const sourceLabel = $derived(entry ? componentSourceLine(entry, text) : '');
  const duplicateCount = $derived(componentDuplicateSourceCount(entry, scope));

  /** The linked Item as it is NOW, resolved against the roster, falling back to the snapshot. */
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

  // WHAT THE IDENTITY CARD AND THE RAIL BOTH DRAW: for a LINKED record the Item is the authority,
  // and for an unlinked one the draft is, because nothing else can name it.
  const shownName = $derived(
    sourceLinked ? source.name : String(identity.name ?? entity?.name ?? '')
  );
  const shownImage = $derived(
    sourceLinked ? source.img : String(identity.img ?? entity?.img ?? '')
  );
  const shownDescription = $derived(
    sourceLinked ? source.description : String(identity.description ?? '')
  );

  // THE OFFERED CATEGORIES ARE THE WORLD VOCABULARY'S, AND NOTHING ELSE (M18): the corpus union
  // this replaced IS the systems' list on a migrated world. THE RECORD'S OWN VALUE IS NOT
  // RE-OFFERED, and THE RESERVED BUCKET IS REFUSED ON THE WAY THROUGH by the shipped
  // case-insensitive predicate, since no layer below can refuse it.
  const categoryOptions = $derived(worldVocabularyComponentCategories(scope));

  const noCategoryLabel = $derived(
    text('FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory', 'No world category')
  );

  /**
   * THE PICKER'S OPTION LIST, unset option FIRST (`proto:891`), because a picker of authored
   * values cannot express "this record has none". Its `dataId` is a reserved token, since
   * `data-popover-option` is stamped only for a TRUTHY value.
   */
  const categoryPickerOptions = $derived([
    { id: '', label: noCategoryLabel, dataId: UNSET_CATEGORY_OPTION },
    ...categoryOptions.map((option) => ({ id: option, label: option, dataId: option })),
  ]);

  // THE WORLD TAG VOCABULARY THE CARD TOGGLES OVER; the reference draws no add field here
  // (`proto:899-901`), because authoring is behind `Edit world vocabulary ↗`. IT IS THE
  // VOCABULARY THE WORLD AUTHORS, NOT THE UNION OF WHAT THE CORPUS APPLIES (M18): that union
  // offered a migrated default's tags as the world's and denied a fresh vocabulary existed.
  const tagVocabulary = $derived(worldVocabularyComponentTags(scope));
  // THE APPLIED-BUT-UNAUTHORED TAGS (M33): the STAGED list minus the vocabulary, drawn after the
  // vocabulary's chips as lit, clearable chips whose ACCESSIBLE NAME says they are not in it.
  const unauthoredTags = $derived(worldTags.filter((tag) => !tagVocabulary.includes(tag)));

  const categoryNote = $derived(entry ? componentWorldCategoryNote(entry, phrase) : '');
  // The tag note counts the STAGED list (M34) over the record's own mutes, so it follows the run.
  const tagNote = $derived(
    entry
      ? componentWorldTagNote(
          { ...entry, defaults: { ...entry.defaults, tags: worldTags } },
          phrase
        )
      : ''
  );

  // THE `Essence contribution` CARD (M31): the map it and the rail show is the DRAFT's section,
  // read positive-only, because the normalizer keeps only positive quantities.
  const draftEssenceMap = $derived.by(() => {
    const raw = draft?.defaults?.essences ?? persisted.defaults.essences;
    const map = {};
    if (!componentWorldEssencesAuthored(raw)) return map;
    for (const [id, value] of Object.entries(raw)) {
      const quantity = Number(value);
      if (Number.isFinite(quantity) && quantity > 0) map[String(id)] = quantity;
    }
    return map;
  });
  // ONE ROW PER WORLD ESSENCE, IN THE CATALOGUE'S ORDER. A key the catalogue does not list draws
  // no row and is CARRIED FORWARD untouched, because a card that never showed it must not delete
  // it. THE OFFER IS THE ISSUE-1036 PROJECTION: a world-disabled essence is withheld from the add
  // offer, and one this record already contributes stays rendered and clearable.
  const essenceRows = $derived(
    visibleEssenceOptions(
      (Array.isArray(worldEssences) ? worldEssences : [])
        .filter((essence) => essence?.id)
        .map((essence) => ({
          id: String(essence.id),
          name: String(essence.name ?? '').trim() || String(essence.id),
          icon: String(essence.icon ?? ''),
          colorToken: String(essence.colorToken ?? ''),
          enabled: essence.enabled !== false,
          quantity: draftEssenceMap[String(essence.id)] ?? 0,
        })),
      (row) => row.quantity > 0
    )
  );
  const essenceNote = $derived(entry ? componentWorldEssenceNote(entry, phrase) : '');
  const railEssences = $derived(componentEssenceChips(draftEssenceMap, worldEssences));

  /**
   * Stage one essence quantity. ZERO STRIPS THE KEY, because the normalizer drops non-positive
   * quantities. AN EMPTY MAP OVER AN UNAUTHORED WORLD IS NO EDIT: `{}` is an authored "no
   * essences" that shadows every inheriting system.
   */
  function setWorldEssence(essenceId, rawValue) {
    const quantity = Math.max(0, Math.trunc(Number(rawValue) || 0));
    const next = { ...draftEssenceMap };
    if (quantity > 0) next[essenceId] = quantity;
    else delete next[essenceId];
    const authored = componentWorldEssencesAuthored(baseline.defaults.essences);
    const value = Object.keys(next).length === 0 && !authored ? null : next;
    draft = withScopedEntryDefault(draft ?? persisted, 'essences', value);
  }
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
  // NO `validationStatus` HERE ANY MORE: "the worst thing the rows say" was derived twice, and
  // the hero's copy is `ScopedValidationTab`'s `verdictSummary` now.

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
   * The Validation tab's badge. THE CLEAR STATE IS A TICK, NOT AN ABSENCE (`proto:824`): a tab
   * that badges only its failures cannot tell "checked and clear" from "not checked". An
   * early-return chain rather than a nested ternary (S3358).
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
    // THE REFUSAL. `deleteEntity` does not refuse, so the guard is here and on the CALL rather
    // than on a disabled attribute, which would satisfy any assertion while explaining nothing.
    if (memberNames.length > 0) return;
    const deleted = await actions?.deleteEntity?.(entry?.id ?? '');
    if (deleted !== false) onBackToCatalogue();
  }

  /**
   * Write the world category, or REFUSE the reserved bucket and say so. A REFUSAL THAT WRITES
   * ABSENCE IS A DELETION, so only a NON-BLANK refused value is turned away. The trigger is
   * painted from the persisted value, so a refused choice needs no restore. It is the SECOND
   * line — the OFFER is the enforcement point — kept because the layer below cannot refuse.
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
    // STAGED, NOT WRITTEN (M34): `Save entry` lands it through `updateWorldDefaultSection`.
    stageSection('category', offered[0] ?? '');
  }

  /**
   * Apply or clear one world tag: a TOGGLE over the vocabulary rather than removable chips beside
   * an add field (`proto:899-901`). STAGED (M34), so `Save entry` writes the list.
   */
  function toggleWorldTag(tag) {
    const applied = worldTags.includes(tag);
    stageSection(
      'tags',
      applied ? worldTags.filter((candidate) => candidate !== tag) : [...worldTags, tag]
    );
  }

  // The alias list is STAGED too (M34); `Save entry` writes it whole through `updateEntity`.
  function addAlias(uuid) {
    if (aliasUuids.includes(uuid)) return;
    stageSection('aliases', [...aliasUuids, uuid]);
  }

  function removeAlias(uuid) {
    stageSection(
      'aliases',
      aliasUuids.filter((candidate) => candidate !== uuid)
    );
  }

  /** One system row's middle column, through the shared model so a unit test reaches every branch. */
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
      ONE CHILD OF `<main>`, WITH ITS OWN TWO-COLUMN GRID: the route gives a full-width world
      page a single row, so two children would paint over each other. The RAIL is a column of this
      grid rather than a child of the tab panel, which is what keeps it on screen and on both tabs.
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
              THE IDENTITY CARD: for a LINKED record the three values are the Item's, drawn under a
              lock pill. IT CARRIES NO DROP ZONE (M17) — the source card below draws one that does
              the same thing, and two affordances on one tab for one write is what the ruling cut.
            -->
            <InspectorCard
              class="manager-component-entry-card manager-component-entry-identity"
              data-scoped-entry-identity={entry.id}
              data-scoped-entry-identity-card=""
            >
              <div class="manager-component-entry-identity-body">
                <Medallion art={shownImage} alt="" icon={PAGE_ICON} size={56} glyph={26} />
                <div class="manager-component-entry-identity-copy">
                  <div class="manager-component-entry-identity-name-row">
                    {#if sourceLinked}
                      <span class="manager-component-entry-identity-name" data-scoped-entry-name
                        >{shownName}</span
                      >
                      <span data-scoped-entry-linked-pill>
                        <!--
                          THE REFERENCE'S LOCK PILL (`proto:834`) IS A SHIPPED PAIR, NOT AN
                          EMPHASIS (issue 1506). It passes no `emphasis`, because the word means
                          the opposite thing on this chip and would draw the wrong face silently.
                        -->
                        <Chip tone="secondary" density="list" icon="fas fa-lock">{sourceLabel}</Chip
                        >
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
                        <Chip tone="warning" icon="fas fa-link-slash"
                          >{text(
                            'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                            'No source item'
                          )}</Chip
                        >
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
                    THE SENTENCE IS THE REFERENCE'S OWN LITERAL (`proto:847`), AND THE MECHANISM
                    IS HONEST FOR ONE OF THE TWO LINKED BRANCHES: a COMPENDIUM address is never
                    in `worldItems`, so its values fall back to the stored snapshot permanently.
                    The fix is a `fromUuid` read, carried as a named follow-up.
                  -->
                  <p class="manager-component-entry-identity-note" data-scoped-entry-attribution>
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.IdentityNote',
                      'Name, image and description refresh from the linked item. Every system shows the same three.'
                    )}
                  </p>
                </div>
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

            <!-- ONE `World classification` CARD, NOT TWO: `proto:881-910` draws category and tags
                 in one grid under one head. -->
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
                    THE SUBTITLE STATES THE HALF THAT IS CONSUMED AND STOPS: an inheriting section
                    really resolves from the world default, while no system resolves a world TAG,
                    and no surface may assert the false half of the merge while it is unconsumed.
                  -->
                  <p class="manager-subtitle">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.ClassificationSubtitle',
                      'Set once here. The category resolves in every system that inherits it; the tags stay on this record.'
                    )}
                  </p>
                </div>
                <!-- THE VOCABULARY EXIT, a bare accent-ink text action (`proto:886`) routed through
                     the OWNER, whose `setView` runs the unsaved-changes guard before it moves. -->
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
                    THE CATEGORY PICKER IS THE SHARED POPOVER, NOT A NATIVE `<select>`, which
                    cannot be themed. `showSearch={false}` keeps `triggerHasPopup="listbox"` true.
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
                    THE TAG RUN IS A CONTROL RUN, NOT A BADGE RUN (`proto:5401`), and
                    `density="tag-run"` is the only way to say it: the chip's own scoped style is
                    unlayered and beats this module's layered sheet. THE LIT CHIP IS `tone="tag"
                    emphasis="lit"`, and the two ride the SAME branch, since `lit` is selected on
                    classes that declare a colour of their own.
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
                    <!--
                      THE APPLIED-BUT-UNAUTHORED TAGS (M33), lit because the record applies them,
                      with the ACCESSIBLE NAME saying they are not in the vocabulary. NOT `struck`,
                      which the rules editor owns for the OPPOSITE claim: muted in this system.
                    -->
                    {#each unauthoredTags as tag (tag)}
                      <Chip
                        tag="button"
                        type="button"
                        density="tag-run"
                        tone="tag"
                        emphasis="lit"
                        data-scoped-entry-tag={tag}
                        data-scoped-entry-tag-unauthored=""
                        aria-pressed="true"
                        title={phrase(
                          'FABRICATE.Admin.Manager.Scoped.Component.Entry.TagClearUnauthored',
                          'Remove the world tag {tag} (not in the world vocabulary)',
                          { tag }
                        )}
                        aria-label={phrase(
                          'FABRICATE.Admin.Manager.Scoped.Component.Entry.TagClearUnauthored',
                          'Remove the world tag {tag} (not in the world vocabulary)',
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

            <!--
              THE `Essence contribution` CARD (M31), on the rules editor's card shape
              (`proto:1343-1356`), one row per WORLD essence. THE STEPPERS ARE DRAFT-BUFFERED.
            -->
            <InspectorCard
              class="manager-component-entry-card manager-component-entry-essences"
              data-scoped-entry-essences={entry.id}
            >
              <div class="manager-component-entry-card-head">
                <i class="fas fa-flask-vial manager-card-glyph is-info" aria-hidden="true"></i>
                <div class="manager-component-entry-card-head-copy">
                  <h3 class="manager-card-heading">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.EssencesTitle',
                      'Essence contribution'
                    )}
                  </h3>
                  <p class="manager-subtitle">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Entry.EssencesSubtitle',
                      'World values, keyed to the world essence catalogue. Every system that has rules for this component follows them unless it overrides.'
                    )}
                  </p>
                </div>
              </div>
              {#if essenceRows.length > 0}
                <div class="manager-component-essence-grid" data-scoped-entry-essence-grid>
                  {#each essenceRows as row (row.id)}
                    <EssenceQuantityCard
                      id={row.id}
                      name={row.name}
                      icon={row.icon}
                      colorToken={row.colorToken}
                      quantity={row.quantity}
                      ariaLabel={phrase(
                        'FABRICATE.Admin.Items.Editor.QuantityLabel',
                        'Quantity for {name}',
                        { name: row.name }
                      )}
                      decrementLabel={phrase(
                        'FABRICATE.Admin.Items.Editor.DecrementEssence',
                        'Decrement {name}',
                        { name: row.name }
                      )}
                      incrementLabel={phrase(
                        'FABRICATE.Admin.Items.Editor.IncrementEssence',
                        'Increment {name}',
                        { name: row.name }
                      )}
                      onChange={(quantity) => setWorldEssence(row.id, quantity)}
                    />
                  {/each}
                </div>
              {:else}
                <p class="manager-component-entry-note" data-scoped-entry-essences-empty>
                  {text(
                    'FABRICATE.Admin.Manager.Scoped.Component.Entry.EssencesEmpty',
                    'No world essences are defined yet. Create them in the Essence catalogue first.'
                  )}
                </p>
              {/if}
              <p class="manager-component-entry-note" data-scoped-entry-essence-note>
                {essenceNote}
              </p>
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

            <!-- DELETION IS A CARD AT THE FOOT, NOT A HEADER BUTTON (`proto:928-936`), which is
                 what lets the reach — or the REFUSAL — be stated as visible body copy. -->
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
              NO `title` AND NO `intro`, AND THE HERO STATES THE VERDICT (`proto:957-960`),
              SUPPRESSED BY OMISSION: both default to `''` and the surface then draws no head
              block. THE BLOCK LABEL IS STILL THIS FAMILY'S OWN, `Blocking` (`proto:4573`).
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
        essences={railEssences}
        linked={sourceLinked}
        factGroups={previewGroups}
        {text}
      />
    </div>
  {/if}
</main>
