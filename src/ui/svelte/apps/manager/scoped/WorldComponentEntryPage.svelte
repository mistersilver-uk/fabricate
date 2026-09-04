<!-- Svelte 5 runes mode -->
<!--
  The world Component entry editor (issue 1371, epic 1357).

  == IT IS THE FIRST SURFACE IN THIS REPOSITORY THAT WRITES WORLD-SCOPE COMPONENT IDENTITY ====
  And what it writes is consumed UNEVENLY, which is why this screen carries a standing note
  rather than a reassurance. The world `category` IS read: the read union applies an inheriting
  section from the world default AFTER the in-system re-spread, so every system whose switch is
  on resolves from the value authored here. The world NAME, ART and DESCRIPTION are not, because
  that same union re-derives identity from the in-system record unconditionally — so a GM can
  meet two names for one component one deep link apart. The world TAG LIST and its per-system
  MUTING are not either, because `tags` is not a section and the union's trailing re-spread
  discards the resolver's additive merge.

  A note that said "nothing here is read" would be false about `category`; one that said
  "everything here is read" would be false about the other four. The note says which is which.

  == THE EDIT IS BUFFERED AND SAVE IS WHAT WRITES IT ==========================================
  Through `scopedEntryDraft.js`, shared with the essence and tool entry editors rather than
  written a third time: a draft is a SHAPE, and the same shape reached by three implementations
  is how a persisted record and its editors drift apart. The header pair that flushes it is the
  SHELL'S — `.manager-header` is a sibling of `.manager-main`, so this page structurally cannot
  render into it — which is what the three draft wires exist for.

  MEMBERSHIP, THE TAG WRITES, THE MUTES AND THE DELETE ARE NOT BUFFERED. Each acts on a DIFFERENT
  record with its own confirmation, and an armed `Remove` that removed nothing until a later
  button says the opposite of what arming an action says.

  == DELETING A COMPONENT ANY SYSTEM HAS RULES FOR IS REFUSED ================================
  The write path does not refuse: it deletes the entity, its world defaults and every membership
  record naming it, unconditionally. Epic 1357's decision 7 says the opposite, so the refusal is
  AUTHORED here — and because the `1.30.0` migration creates a membership record for every
  definition in every contributing system, on a migrated world the refusal is the NORMAL state
  rather than an edge case. That is why the copy names what to do instead.

  == MUTING IS AUTHORED HERE AND NOWHERE ELSE ================================================
  The per-system rows are where the world tag list and its exceptions are visible together, and
  where the projection reads the mute state back into the tag note. The system Component Rules
  editor shows the same state READ-ONLY with a deep link back here. Every mute chip is a REAL
  BUTTON with `aria-pressed`, and its accessible name states the tag AND the system: an N-by-M
  grid of bare tag names is ambiguous the moment it leaves visual context.
-->
<script>
  import { localize, notifyWarn } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import EmptyState from '../EmptyState.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import Callout from '../Callout.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import MembershipActions from './MembershipActions.svelte';
  import ScopedEntityPreview from './ScopedEntityPreview.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import {
    componentAttributionNote,
    componentDeleteNote,
    componentInheritState,
    componentWorldCategoryNote,
    componentWorldScopeDisclosure,
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
    entityId = '',
    worldItems = [],
    onBackToCatalogue = () => {},
    // THE WORLD VOCABULARY EXIT (issue 1371, round 2). NULL BY DEFAULT and the control is
    // withheld without it, so a call site that has no route to offer renders no dead affordance —
    // the same rule `onUnlink` follows on the drop zone above.
    onOpenWorldVocabulary = null,
    onOpenSystemRules = null,
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
    // COPY THE SOURCE UUID, through the shell's own clipboard seam. D-9's source-identity row
    // draws it beside the address, and it is the only way a GM gets the uuid out of this screen:
    // the tile prints it, and printed text in a Foundry app is not selectable in every theme.
    onCopySourceUuid = () => {},
    // THE BUFFERED EDIT'S THREE WIRES TO THE SHELL, in the shape the two sibling entry editors
    // already report: a LIVE handle read at click time, a reactive dirty flag for the header
    // button's disabled state, and the buffered identity for the chrome that NAMES the component.
    onDraftChange = () => {},
    onDirtyChange = () => {},
    onDraftIdentityChange = () => {},
    // THE HEADER BAND'S `danger` SLOT. The page reports an ACTION DESCRIPTOR rather than the
    // shell resolving one: the labels, the consequence sentences and the REFUSAL all name this
    // record and are derived from values only this editor holds. The arm token is the shell's,
    // because exactly one armed control at a time is a window-wide invariant.
    onDeleteChange = () => {},
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

  let activeTab = $state('definition');
  // THE COPY ACKNOWLEDGEMENT (`Copy` -> `Copied`), which is the whole feedback this control has:
  // the clipboard write is silent, so without the label change a GM cannot tell a successful copy
  // from a dead button. It resets on a timer rather than on a second click, because the state it
  // reports is "this just happened" rather than a mode.
  let sourceCopied = $state(false);
  // THE PER-SYSTEM CARD'S OWN FILTER AND SEARCH (issue 1371, round 2).
  //
  // D-9 specifies filters, a search field and a count for this card, and round 1 shipped an
  // unfiltered, unsearchable, unbounded list carrying only a name and the membership cluster. On
  // the six-system lab world that survives; on a twenty-system world the card is a wall, and it is
  // the one surface on this screen whose length is a property of the WORLD rather than of the
  // component.
  //
  // Held locally rather than lifted: this is a filter over rows already in hand, inside one
  // editing session, and the entry unmounts when the GM leaves the component anyway.
  let systemFilter = $state('all');
  let systemSearch = $state('');
  let tagDraft = $state('');
  let aliasDraft = $state('');

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
    tagDraft = '';
    aliasDraft = '';
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

  const systemRows = $derived(Array.isArray(entry?.systems) ? entry.systems : []);

  /**
   * The rows the card draws: the membership filter, then the search term.
   *
   * `with` and `without` are the two halves of `member`, and `all` is their union — so every
   * previously reachable row is still reachable, and the counts below are computed over the SAME
   * arrays rather than restated.
   */
  const visibleSystemRows = $derived(
    systemRows
      .filter((row) => {
        if (systemFilter === 'with') return row.member === true;
        if (systemFilter === 'without') return row.member !== true;
        return true;
      })
      .filter((row) => {
        const needle = systemSearch.trim().toLowerCase();
        return (
          !needle ||
          String(row.systemName || row.systemId || '')
            .toLowerCase()
            .includes(needle)
        );
      })
  );

  const systemFilters = $derived([
    {
      id: 'all',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.SystemFilterAll', 'All ({count})', {
        count: systemRows.length,
      }),
    },
    {
      id: 'with',
      label: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemFilterWith',
        'With rules ({count})',
        { count: memberRows.length }
      ),
    },
    {
      id: 'without',
      label: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemFilterWithout',
        'Without ({count})',
        { count: systemRows.length - memberRows.length }
      ),
    },
  ]);

  /**
   * One row's MODE — what decides its category — read off the same projection join the system
   * rules list reads, so the entry and that screen cannot word one state two ways.
   *
   * @param {object} row
   * @returns {{state: string, label: string}|null}
   */
  function systemMode(row) {
    return componentInheritState(row, phrase);
  }

  /**
   * One row's summary line: what this system actually resolves, and how far its own edits reach.
   *
   * @param {object} row
   * @returns {string}
   */
  function systemSummary(row) {
    if (row?.member !== true) {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemSummaryNone',
        'No rules here, so nothing in this system resolves to this component.'
      );
    }
    const muteCount = Array.isArray(row.mutedTags) ? row.mutedTags.length : 0;
    return `${categoryClauseFor(row)}${muteClauseFor(muteCount)}`;
  }

  /**
   * The category half of a member row's summary.
   *
   * ONLY THE INHERITING BRANCH NAMES A VALUE, and that is a limit of what this screen can see
   * rather than a stylistic choice. The published system row carries `member`, `inherited`,
   * `recipeCount` and `mutedTags` — it does NOT carry the resolved category, because an
   * overriding system's value lives in its own in-system record and the world projection is not
   * handed those. Reading `row.category` anyway produced `Resolves No world category` on a system
   * whose chip beside it said `Overrides world category`: a sentence that is not merely vague but
   * false, and the worst of the three possible answers. So the override branch says what it knows
   * — that the value is the system's own — and the `Open rules` link under it is where the value
   * itself is.
   *
   * @param {object} row
   * @returns {string}
   */
  function categoryClauseFor(row) {
    if (row.inherited?.category === false) {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemSummaryOwn',
        'Supplies its own category in its rules'
      );
    }
    if (!worldCategory) {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemSummaryUnset',
        'No world category to inherit, so its rules supply one'
      );
    }
    return phrase('FABRICATE.Admin.Manager.Scoped.Component.SystemSummary', 'Resolves {category}', {
      category: worldCategory,
    });
  }

  /**
   * The muting half, appended to whichever category clause the row took. Pluralised on its own,
   * because a composed sentence a translator cannot reorder is the trap the tag merge note hit.
   *
   * @param {number} count
   * @returns {string}
   */
  function muteClauseFor(count) {
    if (count < 1) return '';
    return phrase(
      count === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.SystemSummaryMutedOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.SystemSummaryMuted',
      count === 1 ? ' · mutes {count} world tag' : ' · mutes {count} world tags',
      { count }
    );
  }
  const memberRows = $derived(systemRows.filter((row) => row?.member === true));
  const memberNames = $derived(
    memberRows.map((row) => String(row?.systemName || row?.systemId || ''))
  );
  const worldCategory = $derived(String(entry?.defaults?.category ?? '').trim());
  const worldTags = $derived(Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : []);
  const sourceLinked = $derived(entry?.hasSourceLink === true);
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));
  const aliasUuids = $derived(Array.isArray(entity?.aliasItemUuids) ? entity.aliasItemUuids : []);

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
      String(entity?.img ?? ''),
    description: String(
      worldItems.find((item) => item?.uuid === sourceUuid)?.description ?? entity?.description ?? ''
    ),
  });

  // THE OFFERED CATEGORIES, WITH THE RESERVED BUCKET REFUSED. The store writes a section value
  // opaquely and the normalizer coerces SHAPE rather than reserved-token membership, so no layer
  // below this picker can refuse `general` — and since an inheriting section now really resolves
  // from the world default, a world `general` would reset every inheriting system on the first
  // read. The refusal is the shipped case-insensitive predicate, never string equality: `General`
  // and ` GENERAL ` are the same bucket downstream and a `!==` test lets both through.
  const categoryOptions = $derived(
    offeredWorldComponentCategories([
      ...(scope?.entries ?? []).map((candidate) => candidate?.defaults?.category),
      worldCategory,
    ])
  );

  const categoryNote = $derived(entry ? componentWorldCategoryNote(entry, phrase) : '');
  const tagNote = $derived(entry ? componentWorldTagNote(entry, phrase) : '');
  const disclosure = $derived(componentWorldScopeDisclosure(phrase));
  // THE ENTRY'S OWN SENTENCE, not the system screens' (issue 1371, round 2). The `list` surface
  // computes "shared with N OTHER systems" — where "other" means "other than the system you are
  // editing", which is a referent this screen does not have. On the world entry a component held
  // by three systems read "shared with 2 other systems", and the zero-member and one-member states
  // rendered identical copy.
  const attribution = $derived(
    componentAttributionNote({ surface: 'entry', memberCount: memberRows.length }, phrase)
  );

  const validation = $derived(
    componentScopeValidationPresentation(
      {
        name: identity.name,
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
  // THE WORST THING THE ROWS SAY, which is what the hero exists to state. Written as an
  // early-return chain rather than a nested ternary, which SonarCloud reports as S3358.
  const validationStatus = $derived(worstValidationStatus(counts));

  const TABS = [
    { id: 'definition', icon: 'fas fa-fingerprint' },
    { id: 'validation', icon: 'fas fa-clipboard-check' },
  ];
  const tabs = $derived(
    TABS.map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      labelKey:
        tab.id === 'definition'
          ? 'FABRICATE.Admin.Manager.Scoped.Component.TabDefinition'
          : 'FABRICATE.Admin.Manager.Scoped.Component.TabValidation',
      label: tab.id === 'definition' ? 'Definition' : 'Validation',
    }))
  );

  /**
   * The overall status the validation hero paints, from the same counts the rows are grouped by.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {'block'|'warn'|'pass'}
   */
  function worstValidationStatus(current) {
    if (current.blocking > 0) return 'block';
    if (current.warnings > 0) return 'warn';
    return 'pass';
  }

  /**
   * The Validation tab's badge, in the shape `EditorTabs` takes. Written as an early-return chain
   * rather than a nested ternary, which SonarCloud reports as S3358.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {{count: number, tone: string}|null}
   */
  function validationBadge(current) {
    if (current.blocking > 0) return { count: current.blocking, tone: 'danger' };
    if (current.warnings > 0) return { count: current.warnings, tone: 'warning' };
    return null;
  }
  const badges = $derived({ validation: validationBadge(counts) });

  let armedToken = $state('');

  // ── THE DELETE DESCRIPTOR, INCLUDING ITS REFUSAL ────────────────────────────────────────
  // The reach is the armed control's own accessible name and hover title, which is where a
  // consequence belongs on a control that has one — the ruling the world Tool entry's header
  // Delete already lands. What differs here is that the armed confirm REFUSES while any system
  // holds a membership record, and states what to do instead.
  const deleteNote = $derived(componentDeleteNote(memberNames, phrase));
  const armedDeleteLabel = $derived(
    deleteNote.refused
      ? text('FABRICATE.Admin.Manager.Scoped.Component.DeleteBlocked', 'Cannot delete')
      : text('FABRICATE.Admin.Manager.Scoped.Component.DeleteConfirm', 'Confirm delete')
  );

  async function runDelete() {
    // THE REFUSAL. `deleteEntity` does not refuse: it removes the entity, its world defaults and
    // every membership record naming it, unconditionally. So the guard is here, and it is on the
    // CALL rather than on a disabled attribute — a disabled button would satisfy any call
    // assertion while leaving the GM with no explanation at all.
    if (memberNames.length > 0) return;
    const deleted = await actions?.deleteEntity?.(entry?.id ?? '');
    if (deleted !== false) onBackToCatalogue();
  }

  $effect(() => {
    if (!entry) {
      onDeleteChange(null);
      return;
    }
    const name = String(identity.name ?? entry.entity?.name ?? entry.id);
    onDeleteChange({
      token: `world-component-delete:${entry.id}`,
      label: text('FABRICATE.Admin.Manager.Scoped.Component.Delete', 'Delete'),
      armedLabel: armedDeleteLabel,
      idleAriaLabel: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.DeleteAria',
        'Delete {name} from the world catalogue',
        { name }
      ),
      // THE REACH — or the REFUSAL — IN THE ARMED NAME, PREFIXED BY THE VISIBLE LABEL.
      //
      // `ArmedDangerButton` requires each aria label to CONTAIN its state's visible label, because
      // WCAG 2.5.3 makes a control whose name omits the visible string unactivatable by speech
      // input. Round 1 passed the bare consequence sentence, so the armed face read "Cannot
      // delete" and announced a sentence that never contained those words.
      armedAriaLabel: `${armedDeleteLabel} — ${deleteNote.text}`,
      run: runDelete,
    });
  });
  $effect(() => () => onDeleteChange(null));

  /**
   * Write the world category, or REFUSE the reserved bucket and say so.
   *
   * ── A REFUSAL THAT WRITES ABSENCE IS A DELETION (issue 1371, round 2) ────────────────────
   * The refusal shipped as `offered[0] ?? ''`, so typing `General` into a component that already
   * had `Refined` forwarded `''` — clearing the authored value, with no message. The GM sees the
   * field blank and no reason for it.
   *
   * BLANK IS STILL A REAL EDIT. An empty input is a GM clearing the category deliberately, and it
   * must keep working; only a NON-BLANK value the offer list refuses is turned away.
   *
   * @param {HTMLInputElement} input
   * @returns {void}
   */
  function commitWorldCategory(input) {
    const raw = String(input?.value ?? '');
    const offered = offeredWorldComponentCategories([raw]);
    if (offered.length === 0 && raw.trim() !== '') {
      // Put the authored value back, so the control shows what is actually stored.
      input.value = worldCategory;
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
   * Copy the linked Item's uuid, and say so on the control for a moment.
   *
   * @returns {void}
   */
  function copySourceUuid() {
    if (!sourceUuid) return;
    onCopySourceUuid(sourceUuid);
    sourceCopied = true;
    setTimeout(() => {
      sourceCopied = false;
    }, 1600);
  }

  function addWorldTag() {
    const tag = tagDraft.trim();
    if (!tag || worldTags.includes(tag)) return;
    tagDraft = '';
    actions?.setWorldTags?.(entry?.id ?? '', [...worldTags, tag]);
  }

  function removeWorldTag(tag) {
    actions?.setWorldTags?.(
      entry?.id ?? '',
      worldTags.filter((candidate) => candidate !== tag)
    );
  }

  function addAlias() {
    const uuid = aliasDraft.trim();
    if (!uuid || aliasUuids.includes(uuid)) return;
    aliasDraft = '';
    actions?.updateEntity?.(entry?.id ?? '', { aliasItemUuids: [...aliasUuids, uuid] });
  }

  function removeAlias(uuid) {
    actions?.updateEntity?.(entry?.id ?? '', {
      aliasItemUuids: aliasUuids.filter((candidate) => candidate !== uuid),
    });
  }

  /**
   * Whether one system mutes one world tag.
   *
   * @param {object} row
   * @param {string} tag
   * @returns {boolean}
   */
  function muted(row, tag) {
    return Array.isArray(row?.mutedTags) && row.mutedTags.includes(tag);
  }

  /**
   * Toggle one world tag's mute for one system.
   *
   * GATED ON `member` at the call site, because `setMutedTags` finds no membership record and
   * returns `false` without reporting anything — so an ungated control is a silent no-op.
   *
   * @param {object} row
   * @param {string} tag
   * @returns {void}
   */
  function toggleMute(row, tag) {
    if (row?.member !== true) return;
    const current = Array.isArray(row?.mutedTags) ? row.mutedTags : [];
    const next = current.includes(tag)
      ? current.filter((candidate) => candidate !== tag)
      : [...current, tag];
    actions?.setMutedTags?.(entry?.id ?? '', row.systemId, next);
  }

  const previewRules = $derived(
    entry
      ? [
          {
            id: 'category',
            icon: 'fas fa-layer-group',
            title:
              worldCategory ||
              text('FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory', 'No world category'),
            subtitle: categoryNote,
          },
          {
            id: 'tags',
            icon: 'fas fa-tags',
            title: worldTags.length > 0 ? worldTags.join(', ') : tagNote,
            subtitle: worldTags.length > 0 ? tagNote : '',
          },
        ]
      : []
  );
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
      ONE CHILD OF `<main>`, WITH ITS OWN TWO-ROW GRID. `.manager-main` gives a full-width world
      route a single `minmax(0, 1fr)` row, so two children would land in the same grid area and
      paint over each other. The row split is this page's composition rather than the route's.
    -->
    <div class="manager-component-entry-page">
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
          <div class="manager-component-entry-body">
            <div class="manager-component-entry-main">
              <div class="manager-component-entry-kicker" data-scoped-entry-world-banner>
                <span class="manager-component-entry-kicker-glyph" aria-hidden="true">
                  <i class="fas fa-globe"></i>
                </span>
                <h3 class="manager-component-entry-kicker-label">
                  {text(
                    'FABRICATE.Admin.Manager.Scoped.Component.WorldBanner',
                    'World definition · shared by every system'
                  )}
                </h3>
              </div>

              <!-- THE STANDING DISCLOSURE, stated where the fields it is about are authored. -->
              <p class="manager-muted manager-component-entry-note" data-scoped-entry-disclosure>
                {disclosure}
              </p>

              <section
                class="manager-edit-card manager-component-entry-card"
                data-scoped-entry-identity={entry.id}
              >
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.Scoped.Component.Identity', 'Identity')}
                </p>
                <label class="manager-component-entry-field">
                  <span class="manager-component-entry-label"
                    >{text('FABRICATE.Admin.Manager.Scoped.Component.FieldName', 'Name')}</span
                  >
                  <input
                    class="manager-component-entry-name"
                    type="text"
                    value={identity.name ?? ''}
                    data-scoped-entry-name
                    oninput={(event) => patchIdentity('name', event.currentTarget.value)}
                  />
                </label>
                <label class="manager-component-entry-field">
                  <span class="manager-component-entry-label"
                    >{text(
                      'FABRICATE.Admin.Manager.Scoped.Component.FieldDescription',
                      'Description'
                    )}</span
                  >
                  <textarea
                    class="manager-component-entry-description"
                    rows="3"
                    value={identity.description ?? ''}
                    data-scoped-entry-description
                    oninput={(event) => patchIdentity('description', event.currentTarget.value)}
                  ></textarea>
                </label>
                <p class="manager-muted manager-component-entry-note" data-scoped-entry-attribution>
                  {attribution}
                </p>
              </section>

              <!--
                THE SOURCE IDENTITY CARD. It is IMMEDIATE rather than buffered, like every other
                action on this screen that acts on a different field set: a drop resolves a Foundry
                document through the shell and rewrites the world entity's own source-link fields,
                which `IDENTITY_FIELDS` deliberately does not buffer.
              -->
              <section
                class="manager-edit-card manager-component-entry-card"
                data-scoped-entry-source={entry.id}
              >
                <div class="manager-component-entry-card-heading">
                  <p class="manager-kicker">
                    {text('FABRICATE.Admin.Manager.Scoped.Entry.LinkedItem', 'Linked item')}
                  </p>
                  {#if !sourceLinked}
                    <Chip tone="warning" icon="fas fa-link-slash">
                      {text('FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked', 'No source item')}
                    </Chip>
                  {/if}
                </div>
                <ItemDropZone
                  kind="component-source"
                  item={sourceLinked ? source : null}
                  uuid={sourceUuid}
                  title={source.name}
                  hint={sourceLinked
                    ? text(
                        'FABRICATE.Admin.Manager.Scoped.Component.SourceDropHint',
                        'Drop another Item here to replace the linked source.'
                      )
                    : text(
                        'FABRICATE.Admin.Manager.Scoped.Component.SourceEmptyDropHint',
                        'Drop an Item from the Items directory or a compendium to link this component.'
                      )}
                  onDrop={onSourceDrop}
                  unlinkLabel={text(
                    'FABRICATE.Admin.Manager.Scoped.Component.UnlinkItem',
                    'Unlink Item'
                  )}
                  unlinkAttr="data-scoped-entry-source-unlink"
                  onUnlink={sourceLinked ? onUnlinkSource : null}
                />
                {#if sourceUuid}
                  <div class="manager-component-entry-inline">
                    <span class="manager-component-entry-uuid" data-scoped-entry-source-uuid
                      >{sourceUuid}</span
                    >
                    <ManagerButton data-scoped-entry-source-copy onclick={copySourceUuid}>
                      <i class={sourceCopied ? 'fas fa-check' : 'far fa-copy'} aria-hidden="true"
                      ></i>
                      <span
                        >{sourceCopied
                          ? text('FABRICATE.Admin.Manager.Scoped.Component.Copied', 'Copied')
                          : text('FABRICATE.Admin.Manager.Scoped.Component.Copy', 'Copy')}</span
                      >
                    </ManagerButton>
                  </div>
                {/if}

                <!--
                  THE ALIAS LIST IS AUTHORED, NOT DISPLAYED. `aliasItemUuids` is a real
                  source-link field that a merge UNIONS across its group, and it is what keeps a
                  re-pointed link matching the Item a player already owns.
                -->
                <div class="manager-component-entry-aliases">
                  <span class="manager-component-entry-label"
                    >{text(
                      'FABRICATE.Admin.Manager.Scoped.Component.Aliases',
                      'Also matches'
                    )}</span
                  >
                  {#if aliasUuids.length === 0}
                    <span
                      class="manager-muted manager-component-entry-note"
                      data-scoped-entry-aliases-empty
                      >{text(
                        'FABRICATE.Admin.Manager.Scoped.Component.AliasesEmpty',
                        'No aliases yet.'
                      )}</span
                    >
                  {/if}
                  {#if aliasUuids.length > 0}
                    <div class="manager-component-entry-chips" data-scoped-entry-aliases={entry.id}>
                      {#each aliasUuids as alias (alias)}
                        <Chip
                          tag="button"
                          type="button"
                          tone="neutral"
                          icon="fas fa-xmark"
                          mono
                          data-scoped-entry-alias={alias}
                          aria-label={phrase(
                            'FABRICATE.Admin.Manager.Scoped.Component.AliasRemove',
                            'Stop matching {uuid}',
                            { uuid: alias }
                          )}
                          onclick={() => removeAlias(alias)}>{alias}</Chip
                        >
                      {/each}
                    </div>
                  {/if}
                  <div class="manager-component-entry-inline">
                    <input
                      class="manager-component-entry-alias-input"
                      type="text"
                      value={aliasDraft}
                      placeholder={text(
                        'FABRICATE.Admin.Manager.Scoped.Component.AliasPlaceholder',
                        'Item uuid'
                      )}
                      aria-label={text(
                        'FABRICATE.Admin.Manager.Scoped.Component.AliasPlaceholder',
                        'Item uuid'
                      )}
                      data-scoped-entry-alias-input
                      oninput={(event) => (aliasDraft = event.currentTarget.value)}
                    />
                    <ManagerButton
                      disabled={aliasDraft.trim() === ''}
                      data-scoped-entry-alias-add
                      onclick={addAlias}
                    >
                      {text('FABRICATE.Admin.Manager.Scoped.Component.AliasAdd', 'Add alias')}
                    </ManagerButton>
                  </div>
                </div>
              </section>

              <!--
                THE WORLD CATEGORY, WHICH IS THE ONE SECTION AND THE ONE VALUE ON THIS SCREEN A
                CRAFTING SYSTEM ACTUALLY READS. The picker refuses the reserved bucket; see
                `categoryOptions` for why the refusal cannot live any lower.
              -->
              <section
                class="manager-edit-card manager-component-entry-card"
                data-scoped-entry-category={entry.id}
              >
                <div class="manager-component-entry-system-head">
                  <p class="manager-kicker">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Component.WorldCategory',
                      'World category'
                    )}
                  </p>
                  <!--
                    THE VOCABULARY EXIT, RESTORED (issue 1371, round 2). The reference draws one
                    `World classification` card carrying `Edit world vocabulary`; this screen
                    splits that card in two — `World category` and `World tags` — and the split
                    dropped the exit. It belongs on THIS half: the category is the value a system
                    resolves, and the vocabulary screen is where the list it is chosen from is
                    authored.

                    It routes through the OWNER, which is what makes it safe on a buffered editor:
                    the gateway's `setView` runs the unsaved-changes guard before it moves, so a
                    GM with an unsaved name is asked rather than losing it. A link that navigated
                    itself would be the one exit on this screen that skipped that.
                  -->
                  {#if onOpenWorldVocabulary}
                    <ManagerButton
                      data-scoped-entry-vocabulary-exit
                      onclick={() => onOpenWorldVocabulary()}
                    >
                      <i class="fas fa-tags" aria-hidden="true"></i>
                      <span
                        >{text(
                          'FABRICATE.Admin.Manager.Scoped.Component.EditVocabulary',
                          'Edit world vocabulary'
                        )}</span
                      >
                      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    </ManagerButton>
                  {/if}
                </div>
                <div class="manager-component-entry-inline">
                  <input
                    class="manager-component-entry-category-input"
                    type="text"
                    list="scoped-component-entry-categories"
                    value={worldCategory}
                    placeholder={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.CategoryPlaceholder',
                      'No world category'
                    )}
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.WorldCategory',
                      'World category'
                    )}
                    data-scoped-entry-category-input
                    onchange={(event) => commitWorldCategory(event.currentTarget)}
                  />
                  <datalist id="scoped-component-entry-categories">
                    {#each categoryOptions as option (option)}
                      <option value={option}></option>
                    {/each}
                  </datalist>
                </div>
                <p
                  class="manager-muted manager-component-entry-note"
                  data-scoped-entry-category-note
                >
                  {categoryNote}
                </p>
              </section>

              <section
                class="manager-edit-card manager-component-entry-card"
                data-scoped-entry-tags={entry.id}
              >
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.Scoped.Component.WorldTags', 'World tags')}
                </p>
                {#if worldTags.length > 0}
                  <div class="manager-component-entry-chips">
                    {#each worldTags as tag (tag)}
                      <Chip
                        tag="button"
                        type="button"
                        tone="tag"
                        icon="fas fa-xmark"
                        data-scoped-entry-tag={tag}
                        aria-label={phrase(
                          'FABRICATE.Admin.Manager.Scoped.Component.TagRemove',
                          'Remove the world tag {tag}',
                          { tag }
                        )}
                        onclick={() => removeWorldTag(tag)}>{tag}</Chip
                      >
                    {/each}
                  </div>
                {/if}
                <div class="manager-component-entry-inline">
                  <input
                    class="manager-component-entry-tag-input"
                    type="text"
                    value={tagDraft}
                    placeholder={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.TagPlaceholder',
                      'Add a world tag'
                    )}
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.TagPlaceholder',
                      'Add a world tag'
                    )}
                    data-scoped-entry-tag-input
                    oninput={(event) => (tagDraft = event.currentTarget.value)}
                  />
                  <ManagerButton
                    disabled={tagDraft.trim() === ''}
                    data-scoped-entry-tag-add
                    onclick={addWorldTag}
                  >
                    {text('FABRICATE.Admin.Manager.Scoped.Component.TagAdd', 'Add tag')}
                  </ManagerButton>
                </div>
                <p class="manager-muted manager-component-entry-note" data-scoped-entry-tag-note>
                  {tagNote}
                </p>
              </section>

              <!--
              THE REFUSAL, SAID OUT LOUD (issue 1371, round 2).

              It lived only in the armed control's accessible name, so the SIGHTED flow was: click
              Delete, watch the label become "Cannot delete", click again — and nothing at all
              happens. No toast, no sentence, no state change. On a migrated world that is every
              component a GM can reach, because the migration writes a membership record for every
              definition in every contributing system.

              D-6 requires the refusal to state what to do instead, and the prototype states it as
              visible body copy. Moving the control to the header band dropped that statement with
              nothing replacing it; this is the replacement, beside the rows it names.
            -->
              {#if deleteNote.refused}
                <Callout
                  tone="warning"
                  text={deleteNote.text}
                  dataAttr="data-scoped-entry-delete-refusal"
                />
              {/if}

              <!--
                THE PER-SYSTEM ROWS: membership, and the ONE place per-system tag muting is
                authored. The mute grid is N tags by M systems, so each chip's accessible name
                carries BOTH — a grid of bare tag names says nothing out of visual context.
              -->
              <section
                class="manager-edit-card manager-component-entry-card"
                data-scoped-entry-systems={entry.id}
              >
                <div class="manager-component-entry-system-head">
                  <p class="manager-kicker">
                    {phrase(
                      'FABRICATE.Admin.Manager.Scoped.Component.SystemsCount',
                      '{count} of {total} systems have rules',
                      { count: memberRows.length, total: systemRows.length }
                    )}
                  </p>
                  <span
                    class="manager-muted manager-component-entry-system-count"
                    data-scoped-entry-system-count
                    >{phrase(
                      'FABRICATE.Admin.Manager.Scoped.Component.SystemShown',
                      '{shown} of {total} systems',
                      { shown: visibleSystemRows.length, total: systemRows.length }
                    )}</span
                  >
                </div>

                <!--
                  THE CARD'S OWN FILTER AND SEARCH (issue 1371, round 2). Each filter carries its
                  COUNT, so the widened and narrowed sets are legible before either is chosen —
                  the same rule the rules list's membership segment follows one route away.
                -->
                <div class="manager-component-entry-inline">
                  <select
                    class="manager-component-entry-system-filter"
                    data-scoped-entry-system-filter
                    value={systemFilter}
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.SystemFilterLabel',
                      'Filter systems by whether they have rules'
                    )}
                    onchange={(event) => (systemFilter = event.currentTarget.value)}
                  >
                    {#each systemFilters as option (option.id)}
                      <option value={option.id} data-scoped-entry-system-filter-option={option.id}
                        >{option.label}</option
                      >
                    {/each}
                  </select>
                  <input
                    class="manager-component-entry-system-search"
                    type="text"
                    value={systemSearch}
                    placeholder={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.SystemSearch',
                      'Search systems…'
                    )}
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Scoped.Component.SystemSearch',
                      'Search systems…'
                    )}
                    data-scoped-entry-system-search
                    oninput={(event) => (systemSearch = event.currentTarget.value)}
                  />
                </div>

                <ul class="manager-component-entry-systems" role="list">
                  {#each visibleSystemRows as row (row.systemId)}
                    <li
                      class="manager-component-entry-system"
                      data-scoped-entry-system={row.systemId}
                    >
                      <div class="manager-component-entry-system-head">
                        <span class="manager-component-entry-system-name">{row.systemName}</span>
                        <!--
                          THE MODE, from the same projection join the system rules list reads. A
                          row that states its membership and not what decides its category leaves
                          the GM to open each system to find out.
                        -->
                        {#if systemMode(row)}
                          <Chip
                            tone={systemMode(row).state === 'overridden' ? 'warning' : 'info'}
                            data-scoped-entry-system-mode={row.systemId}
                            >{systemMode(row).label}</Chip
                          >
                        {/if}
                        <!--
                          `OPEN RULES` SITS IN THE ROW HEAD, BESIDE REMOVE (issue 1371, round 3),
                          not on a full-width line of its own below the chips. `proto:5455-5468`
                          draws it as an auto-width control on the NAME line next to the remove
                          glyph, and a full-width button reads as the row's primary action when it
                          is the row's least consequential one — the destructive verb beside it is
                          the one that needs the weight. It also cost a whole row of height per
                          system on a card whose length is a property of the world.
                        -->
                        {#if row.member === true && onOpenSystemRules}
                          <ManagerButton
                            class="manager-component-entry-system-rules"
                            data-scoped-entry-system-rules={row.systemId}
                            title={phrase(
                              'FABRICATE.Admin.Manager.Scoped.Component.OpenSystemRulesAria',
                              'Open this component in {system}',
                              { system: row.systemName }
                            )}
                            aria-label={phrase(
                              'FABRICATE.Admin.Manager.Scoped.Component.OpenSystemRulesAria',
                              'Open this component in {system}',
                              { system: row.systemName }
                            )}
                            onclick={() => onOpenSystemRules(entry.id, row.systemId)}
                          >
                            <span
                              >{text(
                                'FABRICATE.Admin.Manager.Scoped.Component.OpenSystemRules',
                                'Open rules'
                              )}</span
                            >
                            <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                          </ManagerButton>
                        {/if}
                        <MembershipActions
                          entityType="component"
                          entityId={entry.id}
                          systemId={row.systemId}
                          entityName={String(identity.name ?? entry.entity?.name ?? entry.id)}
                          systemName={row.systemName}
                          member={row.member === true}
                          {armedToken}
                          onArm={(token) => (armedToken = token)}
                          onDisarm={() => (armedToken = '')}
                          onAdd={() => actions?.addToSystem?.(entry.id, row.systemId)}
                          onRemove={() => actions?.removeFromSystem?.(entry.id, row.systemId)}
                        />
                      </div>
                      <p
                        class="manager-muted manager-component-entry-system-summary"
                        data-scoped-entry-system-summary={row.systemId}
                      >
                        {systemSummary(row)}
                      </p>
                      {#if row.member === true && worldTags.length > 0}
                        <div
                          class="manager-component-entry-chips"
                          data-scoped-entry-mutes={row.systemId}
                        >
                          {#each worldTags as tag (tag)}
                            <Chip
                              tag="button"
                              type="button"
                              tone={muted(row, tag) ? 'muted' : 'info'}
                              icon={muted(row, tag) ? 'fas fa-eye-slash' : 'fas fa-earth-americas'}
                              data-scoped-entry-mute={`${row.systemId}|${tag}`}
                              aria-pressed={muted(row, tag)}
                              aria-label={phrase(
                                'FABRICATE.Admin.Manager.Scoped.Component.MuteAria',
                                'Mute the world tag {tag} in {system}',
                                { tag, system: row.systemName }
                              )}
                              onclick={() => toggleMute(row, tag)}>{tag}</Chip
                            >
                          {/each}
                        </div>
                      {/if}
                    </li>
                  {:else}
                    <li
                      class="manager-muted manager-component-entry-system-empty"
                      data-scoped-entry-systems-empty
                    >
                      {text(
                        'FABRICATE.Admin.Manager.Scoped.Component.SystemsNoMatch',
                        'No crafting system matches that filter.'
                      )}
                    </li>
                  {/each}
                </ul>
              </section>
            </div>

            <ScopedEntityPreview
              hookAttribute="data-scoped-entry-preview"
              ariaLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Component.PreviewLabel',
                'How this component reaches the world'
              )}
              kicker={text(
                'FABRICATE.Admin.Manager.Scoped.Component.PreviewKicker',
                'World record'
              )}
              identity={{
                name: String(identity.name ?? ''),
                image: String(identity.img ?? entity?.img ?? ''),
                context: sourceUuid,
                hookAttribute: 'data-scoped-entry-preview-identity',
              }}
              rulesKicker={text(
                'FABRICATE.Admin.Manager.Scoped.Component.PreviewRules',
                'World defaults'
              )}
              rules={previewRules}
              ruleHookAttribute="data-scoped-entry-preview-rule"
            >
              {#if entry.requiredBy.length > 0}
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.Scoped.Component.UsedBy', 'Used by')}
                </p>
                <ul class="manager-component-entry-refs" data-scoped-entry-required-by>
                  {#each entry.requiredBy.slice(0, 8) as reference (`${reference.kind}-${reference.systemId}-${reference.id}`)}
                    <li>
                      {reference.name}
                      <span class="manager-muted">· {reference.systemName}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </ScopedEntityPreview>
          </div>
        {:else}
          <!--
            THE HERO IS DERIVED, NOT DEFAULTED (issue 1371, round 2). `EditorValidationSurface`
            falls through to `'pass'` and renders two empty strings when no `summary` is passed,
            so this tab drew a blank hero with a GREEN TICK over `Blocking 2` — the one place on
            the screen that states the record's overall health, saying the opposite of the rows
            beneath it. Both siblings derive it; this one did not.

            THE BLOCK LABEL IS THIS FAMILY'S OWN. It reached the recipe key, which localises to
            "Blocks enable" — on an entity that HAS no enable switch, because epic decision 10
            says component membership is binary. The essence sibling reaches its own key for the
            same reason; the fallback string was already right and the key was wrong.
          -->
          <ScopedValidationTab
            title={text(
              'FABRICATE.Admin.Manager.Scoped.Component.ValidationTitle',
              'Entry validation'
            )}
            intro={text(
              'FABRICATE.Admin.Manager.Scoped.Component.ValidationIntro',
              'What this world record states, and what every system inheriting it will resolve.'
            )}
            summary={{
              status: validationStatus,
              icon: 'fas fa-clipboard-check',
              title: text(
                'FABRICATE.Admin.Manager.Scoped.Component.ValidationSummaryTitle',
                'World record'
              ),
              sub: text(
                'FABRICATE.Admin.Manager.Scoped.Component.ValidationSummarySub',
                'What every system inheriting this component resolves from it.'
              ),
            }}
            {counts}
            groups={validation.groups}
            blockLabel={text(
              'FABRICATE.Admin.Manager.Scoped.Component.ValidationStatusBlock',
              'INCOMPLETE'
            )}
            rowDataAttr="data-scoped-entry-check"
            hookAttribute="data-scoped-entry-validation"
          />
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `.manager-main`, `.manager-edit-card`, `.manager-kicker`, `.manager-muted` and
     `.manager-scoped-membership-row` are shipped and reused rather than restated. */
  .manager-component-entry-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
  }

  .manager-component-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  /* EVERY REGION THE PANEL STACKS IS `flex: 0 0 auto`, and that is load-bearing rather than
     tidy: the panel is a column flex container inside a `minmax(0, 1fr)` grid row, so on a short
     window a flex item's default `flex-shrink: 1` compresses each child toward zero and a card
     carrying `overflow: hidden` collapses to nothing while every selector naming it still
     matches. The sibling essence entry records the same measurement. */
  .manager-component-entry-body,
  .manager-component-entry-kicker,
  .manager-component-entry-card {
    flex: 0 0 auto;
  }

  /* THE TWO-COLUMN BODY. 310px matches the rail width every inspector on this app already uses,
     so a GM learns one panel width rather than two. */
  .manager-component-entry-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 310px;
    gap: var(--fab-space-3);
    align-items: start;
    min-width: 0;
  }

  .manager-component-entry-main {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* Below the threshold the rail stacks under the form rather than compressing to a column too
     narrow to read, which is the ruling the shared list frame already makes about its own
     inspector. */
  @container fabricate-manager (max-width: 1000px) {
    .manager-component-entry-body {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .manager-component-entry-kicker {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-entry-kicker-glyph {
    color: var(--fab-info-text);
  }

  .manager-component-entry-kicker-label {
    margin: 0;
    color: var(--fab-text);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .manager-component-entry-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-entry-card-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-entry-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-component-entry-label {
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .manager-component-entry-note {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  .manager-component-entry-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-component-entry-inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-entry-inline input {
    flex: 1 1 12rem;
    min-width: 0;
  }

  .manager-component-entry-aliases {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* IT SCROLLS. The row count is a property of the WORLD's crafting-system roster rather than of
     the component, so on a twenty-system world an unbounded list makes this card the whole tab.
     The cap is generous enough that the six-system lab world never reaches it. */
  .manager-component-entry-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
    max-height: 22rem;
    overflow-y: auto;
  }

  .manager-component-entry-system-count,
  .manager-component-entry-system-summary,
  .manager-component-entry-system-empty {
    font-size: 0.62rem;
    line-height: 1.5;
  }

  .manager-component-entry-system-summary {
    margin: 0;
  }

  .manager-component-entry-system-filter {
    flex: 0 0 auto;
    max-width: 180px;
  }

  .manager-component-entry-system-search {
    flex: 1 1 10rem;
    min-width: 0;
  }

  .manager-component-entry-systems > li {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-component-entry-system-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-entry-system-name {
    color: var(--fab-text);
    font-size: 0.75rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  /* The linked Item's own address, in the mono face because it is an identifier a GM copies
     rather than reads. `tabular-nums` is not wanted here: this is not a column of numerals. */
  .manager-component-entry-uuid {
    flex: 1 1 12rem;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 0.62rem;
  }

  .manager-component-entry-refs {
    margin: 0;
    padding-left: var(--fab-space-3);
    color: var(--fab-text-muted);
    font-size: 0.68rem;
    line-height: 1.5;
  }
</style>
