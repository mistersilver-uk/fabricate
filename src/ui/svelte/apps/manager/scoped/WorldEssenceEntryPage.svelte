<!-- Svelte 5 runes mode -->
<!--
  The world ESSENCE ENTRY editor (issue 1372, epic 1357): one essence's shared identity, its two
  world defaults, and the crafting systems that hold it. ONLY TWO FIELDS TAKE A WORLD DEFAULT —
  `effectSource` and `macro`, exactly `ESSENCE_SECTIONS`. THE PICKER IS THE ENFORCEMENT POINT
  for `### Essence scope` requirement 5, because the store writes the section opaquely and the
  normalizer coerces shape rather than addressability; it is the shared `ItemDropZone`, so a
  value can only arrive from a real document drag. A KNOWN LIMIT: this screen cannot ENUMERATE
  the world component catalogue, so it cannot offer its ids as options.
  Declared props are EXACTLY the bundle keys this page reads — one it does not pass falls
  through to the spread and subscribes its readers to the whole bundle — and the `systems`
  roster is deliberately absent, because the rows come from `entry.systems`, the JOIN.
-->
<script>
  import { localize, notifyError } from '../../../util/foundryBridge.js';
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import EssenceBehaviorPreview from '../essences/EssenceBehaviorPreview.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Chip from '../../../components/Chip.svelte';
  import { essenceValidationPresentation } from '../essences/essenceStudio.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { resolveDropUuid } from '../../../util/dropUtils.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import ScopedEntrySystemsCard from './ScopedEntrySystemsCard.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import { reportRefusedScopedEntrySave, scopedSectionLabel } from './scopedStudio.js';
  import {
    SCOPED_ENTRY_IDENTITY_STEP,
    flushScopedEntryDraft,
    scopedEntryBaseline,
    scopedEntryDirty,
    scopedEntryWrites,
    withScopedEntryDefault,
    withScopedEntryIdentity,
  } from './scopedEntryDraft.js';
  import {
    essenceColourCaption,
    essenceEffectSourceReferent,
    essenceInheritLine,
    essenceSectionValueName,
    essenceShortValueName,
    essenceSystemState,
    isWorldAddressableEffectSource,
    isDocumentUuid,
  } from './essenceScoped.js';

  let {
    scope = null,
    actions = null,
    entityId = '',
    onBackToCatalogue = () => {},
    onOpenSystemRules = null,
    // THE BUFFERED EDIT'S THREE WIRES TO THE SHELL (issue 1372), which owns the header pair and
    // the route-exit cascade because `.manager-header` is a SIBLING of `.manager-main`.
    // `onDraftChange` reports a LIVE handle, read at click time where a snapshot can be a turn
    // behind; `onDirtyChange` and `onDraftIdentityChange` are the reactive halves, the second
    // carrying the WHOLE buffered identity map. There is deliberately no `reseedNonce`.
    onDraftChange = () => {},
    onDirtyChange = () => {},
    onDraftIdentityChange = () => {},
  } = $props();

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders for
  // this route. See the twin block in `WorldEssenceCataloguePage.svelte`.
  const PAGE_ID = 'world-essence-entry';
  const PAGE_ICON = 'fas fa-vial';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle';
  const TITLE_FALLBACK = 'Essence entry';

  /**
   * PER-SECTION PRESENTATION, in ONE table rather than a chain of `section === 'macro'` tests.
   * The SECTION LABEL is deliberately not here — it comes from `scopedSectionLabel`.
   */
  const SECTION_UI = Object.freeze({
    effectSource: Object.freeze({
      glyph: 'fas fa-wand-sparkles',
      documentType: 'Item',
      blurbKey: 'FABRICATE.Admin.Manager.Scoped.Essence.EffectSourceBlurb',
      blurb:
        'The world default. Systems inherit it unless their own essence rules override it, and its active effects are copied onto anything crafted with this essence.',
      promptKey: 'FABRICATE.Admin.Manager.Scoped.Essence.EffectSourcePrompt',
      prompt: 'Drop the item whose active effects transfer by default',
      setKey: 'FABRICATE.Admin.Manager.Scoped.Essence.EffectSourceSet',
      set: 'Default transfer',
    }),
    macro: Object.freeze({
      glyph: 'fas fa-code',
      documentType: 'Macro',
      blurbKey: 'FABRICATE.Admin.Manager.Scoped.Essence.MacroBlurb',
      blurb:
        'The world default macro. It runs against the crafted item data in every system that inherits it, before the item reaches the character.',
      promptKey: 'FABRICATE.Admin.Manager.Scoped.Essence.MacroPrompt',
      prompt: 'Drop the macro that runs by default',
      setKey: 'FABRICATE.Admin.Manager.Scoped.Essence.MacroSet',
      set: 'Default macro',
    }),
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  /**
   * THE IDENTITY FIELDS THIS EDITOR BUFFERS, stated rather than imported because this file's
   * graph is copied into three mounted trees. A MIRROR, pinned by a source test.
   */
  const IDENTITY_FIELDS = Object.freeze(['name', 'icon', 'colorToken', 'description']);

  let activeTab = $state('definition');
  let armedToken = $state('');
  /** @type {{[section: string]: string}} */
  let sectionRefusal = $state({});

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const entry = $derived(
    (scope?.entries ?? []).find((candidate) => candidate.id === entityId) ?? null
  );
  const entity = $derived(entry?.entity ?? null);
  const sections = $derived(Array.isArray(scope?.sections) ? scope.sections : []);

  /**
   * THE EDIT IS BUFFERED, AND SAVE IS WHAT WRITES IT, through `scopedEntryDraft.js`. MEMBERSHIP
   * AND DELETE ARE NOT: each acts on a different record with its own armed confirmation.
   */
  const shape = $derived({ identityFields: IDENTITY_FIELDS, sections });
  const persisted = $derived(scopedEntryBaseline(entry, shape));

  /**
   * WHAT THIS EDITOR KNOWS IS ON DISK — the projection EXCEPT immediately after its own Save, so
   * a Save records what it wrote and the next publish drops that record. Nothing re-seeds the
   * DRAFT from a publish, which is the race that eats a keystroke.
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

  // Seed on IDENTITY change ONLY: the store republishes on any unrelated world write, so a
  // reference-triggered re-seed would overwrite what the GM had typed. Discard re-seeds through
  // `discardDraft` rather than this effect, so a second discard on the same essence still lands.
  $effect(() => {
    const currentId = entry?.id ?? '';
    if (currentId === seededEntityId) return;
    seededEntityId = currentId;
    draft = currentId ? scopedEntryBaseline(entry, shape) : null;
    flushed = null;
    sectionRefusal = {};
  });

  const identity = $derived(draft?.identity ?? persisted.identity);
  const defaults = $derived(draft?.defaults ?? persisted.defaults);
  // The entity as the GM has it on screen: the persisted record with the buffered identity over
  // it, so the validation tab and the player preview report the state Save would produce rather
  // than the one on disk.
  const draftEntity = $derived(entity ? { ...entity, ...identity } : null);
  const dirty = $derived(scopedEntryDirty(draft, baseline));

  /**
   * The sentence a REFUSED save puts in front of the GM. This screen stages a MULTI-SECTION
   * sequence, so a rejection at write *k* leaves `1..k-1` landed durably while the store's cache
   * already shows them saved. Composed by the shared `reportRefusedScopedEntrySave`.
   */
  function reportRefusedSave(refusal) {
    reportRefusedScopedEntrySave({
      refusal,
      entityType: 'essence',
      identityStep: SCOPED_ENTRY_IDENTITY_STEP,
      format,
      notify: notifyError,
    });
  }

  /** Flush the buffered edit; `false` for a refusal, which is what the route-exit guard reads. */
  async function saveDraft() {
    const pending = draft;
    if (!pending) return true;
    const landed = await flushScopedEntryDraft({
      entityId: entry?.id ?? '',
      writes: scopedEntryWrites(pending, baseline),
      actions,
      onRefused: reportRefusedSave,
    });
    if (landed) flushed = pending;
    return landed;
  }

  /** Throw the buffered edit away and re-seed from the record on disk. */
  function discardDraft() {
    draft = scopedEntryBaseline(entry, shape);
    flushed = null;
    sectionRefusal = {};
  }

  /**
   * THE SHELL HANDLE, a LIVE ACCESSOR rather than a reported snapshot: Delete clears the draft
   * and navigates in one turn, and a snapshot would prompt to save an essence that is gone.
   */
  const draftHandle = {
    isDirty: () => dirty,
    save: saveDraft,
    discard: discardDraft,
  };
  $effect(() => {
    onDraftChange(draftHandle);
    return () => onDraftChange(null);
  });
  // The REACTIVE half, for the header button's disabled state. Separate from the handle above
  // because a disabled attribute has to re-render when the answer changes, and the handle
  // deliberately never does.
  $effect(() => {
    onDirtyChange(dirty);
  });

  // THE CHROME ABOVE THIS PAGE FOLLOWS THE DRAFT (issue 1372): the heading, the last crumb and the
  // medallion resolve out of the published corpus, which is not what the GM is editing. REPORTED
  // rather than read off the handle, which never re-renders, and a NEW OBJECT every time, since
  // Svelte 5 does not proxy a value that crossed a prop boundary.
  $effect(() => {
    onDraftIdentityChange({ ...identity });
  });

  // WITHDRAWN ON UNMOUNT, from an effect with no dependencies: attached to the report above it
  // would publish `null` before each republish, and the shell's reader is shared by all three
  // entry routes, so a stale identity would name THIS essence in another route's breadcrumb.
  $effect(() => () => onDraftIdentityChange(null));

  const normalizedIcon = $derived(normalizeEssenceIcon(identity.icon || DEFAULT_ESSENCE_ICON));

  /**
   * The colour token's display name and the value this theme resolves it to. An UNSET colour
   * renders NOTHING rather than "None", which would contradict the tinted tile beside it.
   */
  const colourCaption = $derived(essenceColourCaption(identity.colorToken));

  /**
   * The world-default card HEADINGS, in the prototype's words: `scopedSectionLabel`'s SHORT name
   * is right for an inherit row, and a card that AUTHORS the default is named for what it does.
   */
  function sectionHeading(section) {
    if (section === 'effectSource') {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Essence.HeadEffectSource',
        'Active effect source'
      );
    }
    if (section === 'macro') {
      return text('FABRICATE.Admin.Manager.Scoped.Essence.HeadMacro', 'Macro on craft');
    }
    return scopedSectionLabel(section, text);
  }
  const systemRows = $derived(Array.isArray(entry?.systems) ? entry.systems : []);
  const memberCount = $derived(Number(entry?.membershipCount) || 0);

  // VALIDATION AND THE PREVIEW READ THE DRAFT: on a buffered-edit screen the answer a GM needs is
  // about the state Save would produce. The inherit LINES below still read `entry`, for the same
  // reason inverted: how many systems inherit a section is a fact about persisted records.
  const validationContext = $derived({
    scope: 'world',
    memberSystemCount: memberCount,
    worldEffectSource: defaults?.effectSource ?? null,
    worldMacro: defaults?.macro ?? null,
    // The REFERENT, for the same reason `sectionValueName` reads one: the block is not a scalar,
    // so the validation surface was naming an authored effect source `''`.
    worldEffectSourceName: essenceEffectSourceReferent(defaults?.effectSource),
    worldMacroName: essenceSectionValueName(defaults?.macro),
  });
  const presentation = $derived(
    essenceValidationPresentation(draftEntity, validationContext, text, format)
  );
  const counts = $derived(presentation.counts);

  const previewEssence = $derived({
    id: entity?.id ?? '',
    name: identity.name ?? '',
    icon: identity.icon || PAGE_ICON,
    colorToken: identity.colorToken || '',
    description: identity.description ?? '',
    enabled: true,
    // THE REFERENT, not the block. An authored `effectSource: {}` is a real overriding
    // value meaning "no source" and it is TRUTHY, so a presence test on the block reported
    // effect transfer for a default that names nothing.
    hasEffectTransfer: Boolean(essenceEffectSourceReferent(defaults?.effectSource)),
    hasPropertyMacro: Boolean(defaults?.macro),
  });

  const TABS = [
    { id: 'definition', icon: 'fas fa-fingerprint', label: 'Definition' },
    { id: 'validation', icon: 'fas fa-clipboard-check', label: 'Validation' },
  ];

  const tabs = $derived(
    TABS.map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      labelKey:
        tab.id === 'definition'
          ? 'FABRICATE.Admin.Manager.Scoped.Essence.TabDefinition'
          : 'FABRICATE.Admin.Manager.Scoped.Essence.TabValidation',
      label: tab.label,
    }))
  );

  const badges = $derived({ validation: validationBadge(counts) });
  const summaryStatus = $derived(worstStatus(counts));

  // THE CONSEQUENCE OF A DELETE, STATED BEFORE IT IS ARMED. The prototype's danger card says how
  // many systems lose their rules, because that is the whole reach of the action and a GM cannot
  // recover it afterwards. `membershipCount` is the projection's own member total, so this
  // sentence and the inherit lines above it cannot disagree.
  const deleteNote = $derived(
    memberCount === 0
      ? text(
          'FABRICATE.Admin.Manager.Scoped.Essence.DeleteNoteUnused',
          'No system has rules for it, so nothing else is affected.'
        )
      : format(
          'FABRICATE.Admin.Manager.Scoped.Essence.DeleteNote',
          'Removes the definition and its rules in {count} systems. Component rules that carry a value for it lose that value.',
          { count: memberCount }
        )
  );
  const deleteToken = $derived(`world-essence-delete:${entityId}`);

  /**
   * The Validation tab's badge; early returns rather than a nested ternary (S3358). THE CLEAN
   * STATE IS A TICK, NOT AN ABSENCE: returning `''` left the state a finished essence is normally
   * in as the one the strip said nothing about. A LABEL rather than a glyph, as the reference
   * draws it, and NEUTRAL, because a green tick claims a result where it states an absence.
   */
  function validationBadge(current) {
    if (current.blocking > 0) return { label: String(current.blocking), tone: 'danger' };
    if (current.warnings > 0) return { label: String(current.warnings), tone: 'warning' };
    return {
      label: '✓',
      tone: 'neutral',
      name: text('FABRICATE.Admin.Manager.Scoped.Essence.ValidationPassBadge', 'Everything passes'),
    };
  }

  /** The summary row's status word, by the WORST outcome present. */
  function worstStatus(current) {
    if (current.blocking > 0) return 'block';
    return current.warnings > 0 ? 'warn' : 'pass';
  }

  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  /**
   * One section's stored world default as a display name, `''` when unset. `effectSource` GOES
   * THROUGH ITS OWN READER, being the one section stored as a BLOCK: the generic reader answered
   * `''`, and the card then wore `No default` over a default every system was resolving. It
   * answers the REFERENT, because this page holds no catalogue to resolve a name against.
   */
  function sectionValueName(section) {
    if (section === 'effectSource') return essenceEffectSourceReferent(defaults?.effectSource);
    return essenceSectionValueName(defaults?.[section]);
  }

  /**
   * The raw stored referent for one section, for the card's uuid sub-line: a section value is
   * opaque, so the display NAME and the ADDRESS are two different reads.
   */
  function sectionValueAddress(section) {
    if (section === 'effectSource') return essenceEffectSourceReferent(defaults?.effectSource);
    const value = defaults?.[section];
    if (value && typeof value === 'object') return typeof value.id === 'string' ? value.id : '';
    return typeof value === 'string' ? value : '';
  }

  /**
   * The card's uuid SUB-LINE, or `''` where it would only restate the name above it: a bare uuid
   * resolves to itself as its name, and the card printed it twice.
   */
  function sectionAddressLine(section, name) {
    if (!name) return '';
    const address = sectionValueAddress(section);
    return address === name ? '' : address;
  }

  function sectionUi(section) {
    return SECTION_UI[section] ?? null;
  }

  /**
   * ONE SYSTEM ROW'S SUMMARY: what this essence resolves to in that system. `row.inherited` is
   * the resolver's own per-section map, so the sentence is read rather than recomputed beside it.
   */
  function systemSummary(row) {
    if (row?.member !== true) {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Essence.SystemNoRules',
        'No rules here — it is not in this system.'
      );
    }
    const overridden = sections.filter((section) => row?.inherited?.[section] === false);
    if (overridden.length === 0) {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Essence.SystemInheritsAll',
        'Inherits every world default.'
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.SystemOverrides',
      'Overrides {sections} locally.',
      { sections: overridden.map((section) => scopedSectionLabel(section, text)).join(', ') }
    );
  }

  /** The row's meta word: the authored state, not a second copy of the switch. */
  function systemMeta(row) {
    const state = essenceSystemState(row);
    if (state === 'enabled')
      return text('FABRICATE.Admin.Manager.Scoped.Essence.StateEnabled', 'Enabled here');
    if (state === 'disabled')
      return text('FABRICATE.Admin.Manager.Scoped.Essence.StateDisabled', 'Disabled here');
    return text('FABRICATE.Admin.Manager.Scoped.Essence.StateAbsent', 'Not in this system');
  }

  function essenceSummary(row) {
    return { member: row?.member === true, text: systemSummary(row) };
  }

  function essenceRemoveConsequence(row) {
    return format(
      'FABRICATE.Admin.Manager.Scoped.Membership.RemoveConsequence',
      'Remove {entity} from {system}. Its overrides go with it; the world record and every other system are untouched.',
      { entity: entity?.name || entry?.id, system: systemLabel(row) }
    );
  }

  /**
   * Whether a candidate may be written as this section's world default. `macro` requires a UUID
   * for the same reason `effectSource` does: a bare token names nothing outside its own system.
   */
  function acceptable(section, value) {
    if (section === 'effectSource') return isWorldAddressableEffectSource(value, []);
    return isDocumentUuid(value);
  }

  /**
   * A dropped document becomes this section's world default. It still runs the addressability
   * predicate, because that predicate — not the drop — is what requirement 5 binds.
   */
  function dropSection(section, data) {
    const value = resolveDropUuid(data);
    if (!acceptable(section, value)) {
      sectionRefusal = {
        ...sectionRefusal,
        [section]: text(
          'FABRICATE.Admin.Manager.Scoped.Essence.NotAddressable',
          'A world default must name something every system can address — a document UUID. A component id belongs to one system alone.'
        ),
      };
      return;
    }
    sectionRefusal = { ...sectionRefusal, [section]: '' };
    setSection(section, value);
  }

  function clearSection(section) {
    sectionRefusal = { ...sectionRefusal, [section]: '' };
    setSection(section, null);
  }

  /**
   * Stage one world-default section into the draft. REASSIGNED, never mutated: Svelte 5's
   * `writable` does not proxy, so an in-place write renders nothing and a test passes over it.
   */
  function setSection(section, value) {
    draft = withScopedEntryDefault(draft ?? persisted, section, value);
  }

  /** Stage one identity field into the draft. See {@link setSection} for the reassignment rule. */
  function patchIdentity(field, value) {
    draft = withScopedEntryIdentity(draft ?? persisted, field, value);
  }

  /**
   * Delete the world essence, then leave. THE DRAFT IS DROPPED FIRST, or the exit guard would
   * offer to save into a record `updateEntity` refuses.
   */
  async function deleteEssence() {
    const deleted = await actions?.deleteEntity?.(entityId);
    if (deleted !== false) {
      draft = null;
      flushed = null;
      seededEntityId = '';
    }
    onBackToCatalogue();
  }
</script>

<main class="manager-main" data-scoped-page="world-essence-entry" aria-label={title}>
  {#if !entry}
    <EmptyState
      icon={PAGE_ICON}
      title={text('FABRICATE.Admin.Manager.Scoped.Essence.EntryMissingTitle', 'No essence chosen')}
      hint={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.EntryMissingHint',
        'This entry is open on an essence the world corpus no longer holds. Return to the catalogue and choose one.'
      )}
      dataAttr="data-scoped-entry-state"
      dataValue="missing"
    >
      <ManagerButton data-scoped-entry-back onclick={() => onBackToCatalogue()}>
        {text('FABRICATE.Admin.Manager.Scoped.Essence.BackToCatalogue', 'Back to the catalogue')}
      </ManagerButton>
    </EmptyState>
  {:else}
    <!--
      ONE CHILD OF `<main>`, WITH ITS OWN TWO-ROW GRID: the route gives a full-width world page a
      single row, so TWO children land in the same area and paint over each other.
    -->
    <div class="manager-scoped-entry-page">
      <EditorTabs
        {tabs}
        {activeTab}
        {badges}
        onSelect={(tab) => (activeTab = tab)}
        ariaLabelKey="FABRICATE.Admin.Manager.Scoped.Essence.EntryTabsLabel"
        ariaLabel="Essence definition sections"
        idStem="scoped-essence-entry"
        hookAttribute="data-scoped-entry-tab"
        badgeAttribute="data-scoped-entry-tab-badge"
      />

      <div
        class="manager-scoped-entry-panel"
        data-scoped-entry={PAGE_ID}
        id={`scoped-essence-entry-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`scoped-essence-entry-tab-${activeTab}`}
        tabindex="-1"
        data-keyboard-focus="true"
      >
        {#if activeTab === 'definition'}
          <!--
            TWO COLUMNS, AND THE RIGHT ONE IS THE PLAYER PREVIEW (`essEntry.png`): the panel used
            to stack the aside below the danger card, where the GM could not see it change.
          -->
          <div class="manager-scoped-entry-body">
            <div class="manager-scoped-entry-main">
              <!-- THE SCOPE BANNER: everything under it is one record shared by every crafting
            system, reached from a system-scoped rail. A heading rather than a `Callout`, because
            it introduces a region rather than warning about one. -->
              <div class="manager-scoped-entry-kicker is-world" data-scoped-entry-world-banner>
                <span class="manager-scoped-entry-kicker-glyph" aria-hidden="true">
                  <i class="fas fa-globe"></i>
                </span>
                <h3 class="manager-scoped-entry-kicker-label">
                  {text(
                    'FABRICATE.Admin.Manager.Scoped.Essence.WorldBanner',
                    'World definition · shared by every system'
                  )}
                </h3>
                <span class="manager-scoped-entry-kicker-rule" aria-hidden="true"></span>
              </div>

              <!--
            THE IDENTITY CARD, at the prototype's proportions: a FIXED narrow icon column and one
            fluid field column, the only shape that keeps Name, Description and palette on ONE measure.
          -->
              <section class="manager-scoped-entry-identity" data-scoped-entry-identity={entry.id}>
                <!--
              THE SAME THREE CONTROLS THE SYSTEM-SCOPE IDENTITY TAB USES: one essence's identity
              must not be a picker in one scope and a text box in the other. The tile is SQUARE.
            -->
                <div class="manager-scoped-entry-identity-tile">
                  <span class="manager-scoped-entry-label"
                    >{text('FABRICATE.Admin.Manager.Scoped.Essence.FieldIcon', 'Icon')}</span
                  >
                  <Medallion
                    icon={normalizedIcon}
                    tint={identity.colorToken || ''}
                    size={150}
                    glyph={48}
                  />
                  <IconPicker
                    value={normalizedIcon}
                    buttonTitle={text('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
                    onChange={(iconClass) => patchIdentity('icon', iconClass)}
                  />
                  <!--
                THE COLOUR CAPTION, where the prototype puts it: the swatch row is a CHOOSER and
                says which colour is selected only by a ring. THE HEX IS READ FROM THE CASCADE.
              -->
                  {#if colourCaption}
                    <span class="manager-scoped-entry-colour-caption" data-scoped-entry-colour-name>
                      {colourCaption}
                    </span>
                  {/if}
                </div>

                <div class="manager-scoped-entry-identity-fields">
                  <label class="manager-scoped-entry-field">
                    <span class="manager-scoped-entry-label"
                      >{text('FABRICATE.Admin.Manager.Scoped.Essence.FieldName', 'Name')}</span
                    >
                    <input
                      class="manager-scoped-entry-name"
                      type="text"
                      value={identity.name ?? ''}
                      data-scoped-entry-name
                      oninput={(event) => patchIdentity('name', event.currentTarget.value)}
                    />
                  </label>

                  <label class="manager-scoped-entry-field">
                    <span class="manager-scoped-entry-label">
                      {text(
                        'FABRICATE.Admin.Manager.Scoped.Essence.FieldDescription',
                        'Description'
                      )}
                      <span class="manager-scoped-entry-label-aside"
                        >{text(
                          'FABRICATE.Admin.Manager.Scoped.Essence.FieldOptional',
                          '· optional'
                        )}</span
                      >
                    </span>
                    <textarea
                      rows="3"
                      value={identity.description ?? ''}
                      data-scoped-entry-description
                      placeholder={text(
                        'FABRICATE.Admin.Manager.Scoped.Essence.DescriptionPlaceholder',
                        'What this quality means in your world, and where it comes from.'
                      )}
                      oninput={(event) => patchIdentity('description', event.currentTarget.value)}
                    ></textarea>
                  </label>

                  <div class="manager-scoped-entry-field" data-scoped-entry-colour>
                    <span class="manager-scoped-entry-label"
                      >{text('FABRICATE.Admin.Manager.Scoped.Essence.FieldColour', 'Colour')}</span
                    >
                    <!-- `ManagerColorPopover` takes `layout="inline"` here exactly as
                  `EssenceIdentityTab` does: the popover chrome is applied by the global sheet,
                  which this lane may not open, and inline strips it and nothing else. -->
                    <ManagerColorPopover
                      layout="inline"
                      allowNone
                      allowCustom={false}
                      manageDismiss={false}
                      colorToken={identity.colorToken || ''}
                      unset={!identity.colorToken}
                      customColor=""
                      presetGridLabel={text(
                        'FABRICATE.Admin.Manager.Essence.Colour.Presets',
                        'Essence colour presets'
                      )}
                      noneLabel={text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')}
                      onClear={() => patchIdentity('colorToken', '')}
                      onChange={(next) => patchIdentity('colorToken', next?.colorToken || '')}
                    />
                  </div>
                </div>
              </section>

              <div class="manager-scoped-entry-kicker" data-scoped-entry-defaults-banner>
                <span class="manager-scoped-entry-kicker-glyph" aria-hidden="true">
                  <i class="fas fa-globe"></i>
                </span>
                <h3 class="manager-scoped-entry-kicker-label">
                  {text(
                    'FABRICATE.Admin.Manager.Scoped.Essence.DefaultsBanner',
                    'Default on craft'
                  )}
                </h3>
                <span class="manager-scoped-entry-kicker-rule" aria-hidden="true"></span>
              </div>

              <!-- THE TWO WORLD DEFAULTS. Each states how many member systems inherit it and how many
               override it locally BEFORE the change lands, because that count is the whole reach of
               the edit and a GM cannot recover it after the fact. -->
              <section class="manager-scoped-entry-defaults" data-scoped-entry-defaults-section>
                {#each sections as section (section)}
                  {@const ui = sectionUi(section)}
                  {@const value = sectionValueName(section)}
                  {@const label = scopedSectionLabel(section, text)}
                  {@const heading = sectionHeading(section)}
                  <article
                    class="manager-scoped-entry-default"
                    data-scoped-world-default={section}
                    data-scoped-world-default-state={value ? 'set' : 'unset'}
                  >
                    <header class="manager-scoped-entry-default-head">
                      <span class="manager-scoped-entry-default-glyph" aria-hidden="true">
                        <i class={ui?.glyph ?? PAGE_ICON}></i>
                      </span>
                      <h4 class="manager-scoped-entry-default-title">{heading}</h4>
                      <Chip
                        tone={statusChipTone(value ? 'success' : 'subtle')}
                        icon={value ? 'fas fa-circle-check' : 'fas fa-circle-minus'}
                        >{value
                          ? text(ui?.setKey ?? '', ui?.set ?? label)
                          : text(
                              'FABRICATE.Admin.Manager.Scoped.Essence.DefaultNone',
                              'No default'
                            )}</Chip
                      >
                    </header>

                    <p class="manager-scoped-entry-default-blurb">
                      {text(ui?.blurbKey ?? '', ui?.blurb ?? '')}
                    </p>

                    <!-- THE CONTROL IS THE SHARED DROP ZONE, not a uuid text box. `documentType`
                  comes from the section table, so each section refuses the other's drag before it
                  reaches `dropSection`. -->
                    <div
                      class="manager-scoped-entry-default-slot"
                      data-scoped-world-default-value={section}
                    >
                      <ItemDropZone
                        item={value ? { name: value } : null}
                        title={text(ui?.promptKey ?? '', ui?.prompt ?? label)}
                        hint={sectionAddressLine(section, value)}
                        documentType={ui?.documentType ?? 'Item'}
                        unlinkAttr="data-scoped-world-default-clear"
                        unlinkLabel={format(
                          'FABRICATE.Admin.Manager.Scoped.Essence.DefaultClearNamed',
                          'Clear the world default for {section}',
                          { section: label }
                        )}
                        onDrop={(data) => dropSection(section, data)}
                        onUnlink={value ? () => clearSection(section) : null}
                      />
                    </div>

                    <p
                      class="manager-scoped-entry-default-inherit"
                      data-scoped-world-default-inherit={section}
                    >
                      {essenceInheritLine(entry, section, format)}
                    </p>

                    {#if sectionRefusal[section]}
                      <p
                        class="manager-muted manager-form-warning"
                        role="alert"
                        data-scoped-world-default-refused={section}
                      >
                        {sectionRefusal[section]}
                      </p>
                    {/if}
                  </article>
                {/each}
              </section>

              <div class="manager-scoped-entry-kicker" data-scoped-entry-systems-banner>
                <span class="manager-scoped-entry-kicker-glyph" aria-hidden="true">
                  <i class="fas fa-layer-group"></i>
                </span>
                <h3 class="manager-scoped-entry-kicker-label">
                  {text('FABRICATE.Admin.Manager.Scoped.Essence.SystemsBanner', 'Per-system rules')}
                </h3>
                <span class="manager-scoped-entry-kicker-rule" aria-hidden="true"></span>
              </div>

              <ScopedEntrySystemsCard
                entryId={entry.id}
                entityName={entity?.name ?? entry.id}
                rows={systemRows}
                {armedToken}
                {text}
                phrase={format}
                heading={text(
                  'FABRICATE.Admin.Manager.Scoped.Essence.SystemsHead',
                  'Systems using this essence'
                )}
                subtitle={text(
                  'FABRICATE.Admin.Manager.Scoped.Essence.SystemsSub',
                  'The rules hold what the essence does on craft in that system: its active effect source item and its macro.'
                )}
                summaryFor={essenceSummary}
                rowMetaFor={systemMeta}
                openRulesAria={(row) =>
                  format(
                    'FABRICATE.Admin.Manager.Scoped.Essence.OpenSystemRulesAria',
                    'Open this essence in {system}',
                    { system: systemLabel(row) }
                  )}
                removeLabel={text(
                  'FABRICATE.Admin.Manager.Scoped.Membership.Remove',
                  'Remove'
                )}
                removeConsequenceFor={essenceRemoveConsequence}
                addAria={(row) =>
                  format(
                    'FABRICATE.Admin.Manager.Scoped.Essence.AddToSystemAria',
                    'Add {entity} to {system}',
                    { entity: entity?.name ?? entry.id, system: systemLabel(row) }
                  )}
                onArm={(token) => (armedToken = token)}
                onDisarm={() => (armedToken = '')}
                onAdd={(rowSystemId) => actions?.addToSystem?.(entry.id, rowSystemId)}
                onRemove={(rowSystemId) => actions?.removeFromSystem?.(entry.id, rowSystemId)}
                {onOpenSystemRules}
              />

              <!-- THE DANGER CARD. Deleting a world essence reaches every system that has rules for
               it, so the reach is stated beside the control rather than only in a dialog — and the
               control is the shipped `ArmedDangerButton`, which is this repository's one
               destructive-confirm affordance. -->
              <section class="manager-scoped-entry-danger" data-scoped-entry-delete>
                <span class="manager-scoped-entry-danger-glyph" aria-hidden="true">
                  <i class="fas fa-triangle-exclamation"></i>
                </span>
                <div class="manager-scoped-entry-danger-copy">
                  <h4 class="manager-scoped-entry-danger-title">
                    {text(
                      'FABRICATE.Admin.Manager.Scoped.Essence.DeleteTitle',
                      'Delete this essence'
                    )}
                  </h4>
                  <p class="manager-scoped-entry-danger-note">{deleteNote}</p>
                </div>
                <ArmedDangerButton
                  token={deleteToken}
                  armed={armedToken === deleteToken}
                  idleLabel={text(
                    'FABRICATE.Admin.Manager.Scoped.Essence.DeleteAction',
                    'Delete essence'
                  )}
                  armedLabel={text(
                    'FABRICATE.Admin.Manager.Scoped.Essence.DeleteConfirm',
                    'Confirm?'
                  )}
                  idleAriaLabel={`${text('FABRICATE.Admin.Manager.Scoped.Essence.DeleteAction', 'Delete essence')} — ${deleteNote}`}
                  armedAriaLabel={`${text('FABRICATE.Admin.Manager.Scoped.Essence.DeleteConfirm', 'Confirm?')} — ${deleteNote}`}
                  onArm={(token) => (armedToken = token)}
                  onDisarm={() => (armedToken = '')}
                  onConfirm={deleteEssence}
                />
              </section>
            </div>

            <!-- THE LIVE NOTE IS ON (`proto:3537`), as it is at the foot of every one of the
               reference's six editors. Suppressed here, the one panel that DOES recompute on
               every keystroke said nothing about it; the browser inspector, which legitimately
               suppresses it, is read-only. -->
            <section class="manager-scoped-entry-preview" data-scoped-entry-preview>
              <!-- The two NAMES are shortened for display: a value stored as a document uuid would
                 otherwise render as `Runs Macro.lab-aether-binding` in the behaviour list, where
                 the row's own verb already states the document type. The card's uuid sub-line in
                 the form beside it still prints the address in full. -->
              <EssenceBehaviorPreview
                essence={previewEssence}
                scope="world"
                effectTransferEnabled={Boolean(essenceEffectSourceReferent(defaults?.effectSource))}
                propertyMacrosEnabled={Boolean(defaults?.macro)}
                sourceName={essenceShortValueName(sectionValueName('effectSource'))}
                macroName={essenceShortValueName(sectionValueName('macro'))}
                previewCarrier={entry?.previewCarrier ?? null}
              />
            </section>
          </div>
        {:else}
          <ScopedValidationTab
            stackClass="manager-scoped-tab-stack"
            hookAttribute="data-scoped-entry-tab-panel"
            hookValue="validation"
            title={text('FABRICATE.Admin.Manager.Scoped.Essence.TabValidation', 'Validation')}
            intro={text(
              'FABRICATE.Admin.Manager.Scoped.Essence.ValidationIntro',
              'A world essence always saves. These checks report what is unfinished for the systems that share it.'
            )}
            summary={{
              status: summaryStatus,
              icon: 'fas fa-clipboard-check',
              title: text(
                'FABRICATE.Admin.Manager.Scoped.Essence.ValidationTitle',
                'World defaults'
              ),
              sub: text(
                'FABRICATE.Admin.Manager.Scoped.Essence.ValidationSub',
                'Every system that inherits reads what is set here.'
              ),
            }}
            {counts}
            groups={presentation.groups}
            rowDataAttr="data-scoped-entry-validation-check"
            blockLabel={text(
              'FABRICATE.Admin.Manager.Essence.Validation.StatusBlock',
              'INCOMPLETE'
            )}
          />
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero and the host sheet — closed to
     this lane by requirement 7 — is not reopened. Every colour is a `--fab-*` token declared at
     `:root` or in the theme blocks: an undeclared custom property is invalid at computed-value
     time and falls back to inheritance silently, so an invented name costs a colour and no error. */
  .manager-scoped-entry-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
  }

  /* The colour-token name under the icon picker. Quieter than a field label and not one: it
     states a value rather than naming a control. */
  .manager-scoped-entry-colour-caption {
    color: var(--fab-text-subtle);
    font-size: 0.68rem;
  }

  .manager-scoped-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  /* EVERY REGION THE PANEL STACKS IS `flex: 0 0 auto`, and this is load-bearing: content
     overflows a 900px window and a default `flex-shrink: 1` compresses each child toward zero —
     measured, the per-system card collapsed to NOTHING while every selector still matched. */
  .manager-scoped-entry-body,
  .manager-scoped-entry-kicker,
  .manager-scoped-entry-identity,
  .manager-scoped-entry-defaults,
  .manager-scoped-entry-preview,
  .manager-scoped-entry-danger {
    flex: 0 0 auto;
  }

  /* THE TWO-COLUMN BODY. 310px matches the prototype's rail and is close enough to the 300px
     every inspector on this app already uses that a GM learns one panel width, not two.
     `align-items: start` keeps the rail at the top of the form rather than stretching it to the
     height of a scroll the GM has not reached yet. */
  .manager-scoped-entry-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 310px;
    gap: var(--fab-space-3);
    align-items: start;
    min-width: 0;
  }

  .manager-scoped-entry-main {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* Below the threshold the rail stacks under the form rather than compressing to a column too
     narrow for an inventory tile — the same ruling `EntityListInspectorFrame` makes about its own
     inspector, at the width this page's own layout already breaks at. */
  @container fabricate-manager (max-width: 1000px) {
    .manager-scoped-entry-body {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE SECTION KICKER: a 20px glyph tile, a tracked uppercase label, and a rule that runs to
     the edge. Three of them divide this tab into the world identity, the two world defaults and
     the per-system rules, which is the only thing that keeps a long scroll navigable. */
  .manager-scoped-entry-kicker {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-entry-kicker-glyph {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--fab-border-strong);
    /* The chip rung: this glyph is 20px, at or below the 24px bound the radius ladder sets. */
    border-radius: 6px;
    background: var(--fab-surface-raised);
    color: var(--fab-text-secondary);
    font-size: 0.56rem;
  }

  .manager-scoped-entry-kicker-label {
    margin: 0;
    color: var(--fab-text-secondary);
    font-size: 0.59rem;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .manager-scoped-entry-kicker-rule {
    flex: 1 1 auto;
    height: 1px;
    background: var(--fab-border);
  }

  /* The WORLD-SCOPE variant, in the info ramp. It is a different colour from its two siblings on
     purpose: those two introduce regions, and this one states the scope everything below it is
     authored at. */
  .manager-scoped-entry-kicker.is-world .manager-scoped-entry-kicker-glyph {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }

  .manager-scoped-entry-kicker.is-world .manager-scoped-entry-kicker-label {
    color: var(--fab-info-text);
  }

  .manager-scoped-entry-kicker.is-world .manager-scoped-entry-kicker-rule {
    background: var(--fab-info-border);
    opacity: 0.5;
  }

  /* A FIXED icon column and one fluid field column. `minmax(0, 1fr)` on the second, so a long
     name shrinks the column rather than widening the grid past the panel. */
  .manager-scoped-entry-identity {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: var(--fab-space-4);
    padding: var(--fab-space-4);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    /* NO FILL (issue 1372). See the essence surface-ladder block in `styles/fabricate.css`: the
       prototype draws every card in the content area on the pane's own surface and separates
       them with the border alone. */
    background: transparent;
    min-width: 0;
  }

  /* The medallion and its picker travel together as one control, so the picker sits under the
     swatch it changes rather than beside an unrelated field. `align-items: stretch` makes the
     picker fill the 150px column and share the tile's edges. */
  .manager-scoped-entry-identity-tile {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-entry-identity-fields {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-scoped-entry-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-scoped-entry-label {
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* "· optional" rides the same label without inheriting its tracking or its caps, exactly as
     the prototype writes it: the field name is the label and this is an aside about it. */
  .manager-scoped-entry-label-aside {
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  /* The essence NAME is an entity name, so it takes the serif at the card-name weight. */
  .manager-scoped-entry-name {
    font-family: var(--fab-font-serif);
    font-size: 0.88rem;
    font-weight: 600;
  }

  /* ONE CARD PER ROW, FULL WIDTH (`essEntry.png`). An `auto-fit, minmax(22rem, 1fr)` grid put the
     two side by side over about 45rem and halved the measure each card's drop target, uuid line
     and inherit sentence had. `minmax(0, 1fr)` rather than removing the grid, because the gap and
     the overflow floor are still this container's. */
  .manager-scoped-entry-defaults {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-scoped-entry-default {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-4);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    /* NO FILL (issue 1372). See the essence surface-ladder block in `styles/fabricate.css`: the
       prototype draws every card in the content area on the pane's own surface and separates
       them with the border alone. */
    background: transparent;
    min-width: 0;
  }

  .manager-scoped-entry-default-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-entry-default-glyph {
    flex: 0 0 auto;
    color: var(--fab-accent);
    font-size: 0.75rem;
  }

  .manager-scoped-entry-default-title {
    margin: 0;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.88rem;
    font-weight: 600;
  }

  .manager-scoped-entry-default-blurb {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.69rem;
    line-height: 1.5;
  }

  .manager-scoped-entry-default-slot {
    min-width: 0;
  }

  .manager-scoped-entry-default-inherit {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.63rem;
    line-height: 1.45;
  }

  .manager-scoped-entry-preview {
    min-width: 0;
  }

  .manager-scoped-entry-danger {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3) var(--fab-space-4);
    border: 1px solid var(--fab-danger-border);
    border-radius: 12px;
    background: var(--fab-danger-soft);
    min-width: 0;
  }

  .manager-scoped-entry-danger-glyph {
    flex: 0 0 auto;
    color: var(--fab-danger-text);
    font-size: 0.82rem;
  }

  .manager-scoped-entry-danger-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 1 1 18rem;
    min-width: 0;
  }

  .manager-scoped-entry-danger-title {
    margin: 0;
    color: var(--fab-danger-text);
    font-family: var(--fab-font-serif);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .manager-scoped-entry-danger-note {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    line-height: 1.5;
  }
</style>
