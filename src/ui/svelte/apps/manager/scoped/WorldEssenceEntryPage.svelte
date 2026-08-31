<!-- Svelte 5 runes mode -->
<!--
  The world ESSENCE ENTRY editor (issue 1372, epic 1357): one essence's shared identity, its two
  world defaults, and the crafting systems that hold it.

  ── ONLY TWO FIELDS TAKE A WORLD DEFAULT ──────────────────────────────────────────────────────
  `effectSource` and `macro`, which are exactly `ESSENCE_SECTIONS`. Everything else Fabricate
  carries for an essence — its per-system `enabled` flag above all — stays on the in-system record
  and takes none, so this screen draws no control for it. A switch over a field the resolver does
  not read through writes a key `normalizeMembership` discards on the next `load()`.

  ── THE PICKER IS THE ENFORCEMENT POINT, AND IT IS A DROP TARGET ──────────────────────────────
  `updateWorldDefaultSection` writes the section value OPAQUELY by design and the normalizer
  coerces SHAPE rather than addressability, so neither can refuse a system-local component id.
  `### Essence scope` requirement 5 binds a world default's `effectSource` to a WORLD-ADDRESSABLE
  referent, and the only place that can be met is where the value is CHOSEN.

  This shipped as a free-text `Item.abc123` box, which cannot meet that obligation: a GM types
  whatever they like and the screen's only defence is a predicate run after the fact. The control
  is the shared `ItemDropZone` now, so a value can only ever arrive from a real Foundry document
  drag — which carries a `uuid` (world sidebar) or a `{pack, id}` pair (compendium), both of which
  ARE world-addressable by construction. `acceptable()` still runs on the resolved uuid and still
  refuses in words, because a refusal a GM can read is what turns the rule into a control rather
  than a value that silently vanished.

  A KNOWN LIMIT, RECORDED RATHER THAN WORKED AROUND: `essenceScopeProps` carries the ESSENCE
  corpus alone, so this screen cannot ENUMERATE the world component catalogue and therefore cannot
  offer its ids as options. What it accepts is what it can address without that corpus — a dragged
  document — and it validates through the same predicate the offer filter uses. The rule is one
  function (`worldAddressableEffectSources`), unit-tested against a world component roster.

  ── TWO TABS, THROUGH THE SHARED `EditorTabs` ────────────────────────────────────────────────
  Definition and Validation. `EssenceEditorTabs` is the pre-promotion hand-rolled strip and is NOT
  converted here: converting a shipped site changes its rendered ids, which
  `ui-integration/spec.md` calls a defect. A NEW editor uses the promoted primitive directly.

  ── NO PAGE TITLE ────────────────────────────────────────────────────────────────────────────
  The shell's header renders the `<h1>` and the three-crumb trail; a second title here is the
  duplication `ScopedPlaceholderPage` records against the first frame of a world page.

  Declared props are EXACTLY the bundle keys this page reads plus the static attributes the call
  site passes. See `CraftingSystemManagerRoot.svelte`: a name declared here that the site does not
  pass falls through to the spread and subscribes its readers to the whole bundle.

  Props:
   - scope / actions: from `essenceScopeProps`. The `systems` roster is deliberately NOT declared:
     the membership rows come from `entry.systems`, which is the projection's JOIN and the only
     source that can answer `member`, `inherited` and `enabled`, so declaring the narrowed
     `{id, name}` roster beside it would offer a second answer to one question.
   - entityId: which essence this entry is open on.
   - onBackToCatalogue(): the middle breadcrumb's target, also offered as a control here.
   - onDraftChange() / onDirtyChange(): the buffered edit's two wires to the shell; see the
     BUFFERED EDIT block below and the props' own note.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import EmptyState from '../EmptyState.svelte';
  import EssenceBehaviorPreview from '../essences/EssenceBehaviorPreview.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { essenceValidationPresentation } from '../essences/essenceStudio.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { resolveDropUuid } from '../../../util/dropUtils.js';
  import MembershipActions from './MembershipActions.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import { scopedSectionLabel } from './scopedStudio.js';
  import {
    flushScopedEntryDraft,
    scopedEntryBaseline,
    scopedEntryDirty,
    scopedEntryWrites,
    withScopedEntryDefault,
    withScopedEntryIdentity,
  } from './scopedEntryDraft.js';
  import {
    essenceColourCaption,
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
    // THE BUFFERED EDIT'S THREE WIRES TO THE SHELL (issue 1372).
    //
    // The header pair and the route-exit cascade are both the shell's — `.manager-header` is a
    // SIBLING of `.manager-main`, so this page structurally cannot render into it — so the shell
    // needs a way to flush this editor and a way to ask whether there is anything to flush.
    //
    //  - onDraftChange(handle|null): a LIVE handle, `{isDirty, save, discard}`, reported once on
    //    mount and withdrawn on unmount. Live rather than a snapshot for the reason the handle's
    //    own comment gives: the guard reads it at click time and a snapshot published by an
    //    effect can be one turn behind.
    //  - onDirtyChange(dirty): the reactive half, for the header button's disabled state.
    //  - onDraftNameChange(name): the other reactive half, for the header's TITLE. The shell's
    //    heading names the essence being edited, and what is being edited is the draft — the
    //    same value the player preview beside it already renders. Withdrawn the way the dirty
    //    flag is: the shell drops it when `onDraftChange(null)` says there is no editor.
    //
    // There is deliberately NO `reseedNonce` prop, which is how `SystemEditView` spells discard:
    // the handle carries `discard()` directly, and a nonce the call site did not pass would fall
    // through to the bundle spread and subscribe every one of its readers to the whole world
    // corpus — the hazard this file's header records.
    onDraftChange = () => {},
    onDirtyChange = () => {},
    onDraftNameChange = () => {},
  } = $props();

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders for
  // this route. See the twin block in `WorldEssenceCataloguePage.svelte`.
  const PAGE_ID = 'world-essence-entry';
  const PAGE_ICON = 'fas fa-vial';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle';
  const TITLE_FALLBACK = 'Essence entry';

  /**
   * PER-SECTION PRESENTATION, in ONE table rather than a chain of `section === 'macro'` tests.
   *
   * The prototype draws the two world defaults as two cards that differ in five ways at once —
   * glyph, accepted document type, explanatory sentence, empty prompt and the "set" pill word —
   * and a screen that answered those five with five separate ternaries would have five places to
   * keep in step when a third section appears.
   *
   * The SECTION LABEL is deliberately NOT in here: it comes from `scopedSectionLabel`, the one
   * list every scoped screen reads, so this screen structurally cannot name a section differently
   * from the five sites that already render it.
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
   * THE IDENTITY FIELDS THIS EDITOR BUFFERS, which are exactly the four an essence lifts to
   * world scope.
   *
   * Stated here rather than imported because this file's dependency graph is copied module by
   * module into three hand-rolled mounted trees, and `worldScopeEntityGrouping.js` is not in all
   * of them — an omission there HANGS a suite rather than failing it. It is a MIRROR, so it is
   * guarded: `essence-world-scope-screens.test.js` asserts this list equals
   * `WORLD_IDENTITY_FIELDS.essences`, and reds if either side gains or loses a field.
   *
   * @type {readonly string[]}
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
   * THE EDIT IS BUFFERED, AND SAVE IS WHAT WRITES IT (issue 1372, maintainer parity round 4).
   *
   * This screen persisted every keystroke and every drop on change, so it had no Save action at
   * all — while the prototype heads it with one (`essEntry.png`) and `design-system/spec.md`'s
   * EDITOR recipe orders "the action pair with back before save". The mechanism is
   * `scopedEntryDraft.js`, shared with the tool entry editor rather than written twice: a draft
   * is a SHAPE, and the same shape reached by two implementations is how a persisted record and
   * its editors drift apart.
   *
   * MEMBERSHIP AND DELETE ARE NOT BUFFERED, and `scopedEntryDraft.js` records why: each is an
   * action on a different record with its own armed confirmation, and an armed `Remove` that
   * removed nothing until a later button says the opposite of what arming an action says.
   */
  const shape = $derived({ identityFields: IDENTITY_FIELDS, sections });
  const persisted = $derived(scopedEntryBaseline(entry, shape));

  /**
   * WHAT THIS EDITOR KNOWS IS ON DISK, which is the persisted projection EXCEPT immediately
   * after its own Save.
   *
   * A world-scope write reaches this screen back through Foundry: the store writes the setting,
   * the replicated `updateSetting` hook reloads it, and only then does the admin store
   * republish. So between a successful Save and the end of that round trip the projection still
   * holds the OLD record — and a dirty flag measured against it alone would leave `Save` lit
   * over an edit that had already landed, and have the route-exit guard offer to write it a
   * second time.
   *
   * So a Save records what it wrote, and the next publish drops that record: whichever arrives
   * first, the answer below is the state on disk. Nothing re-seeds the DRAFT from a publish,
   * which is the race that would eat the keystroke a GM is in the middle of.
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

  // Seed on IDENTITY change ONLY, never on every publish: the admin store republishes `viewState`
  // twice on a refresh, and again on any unrelated world-corpus write, so a reference-triggered
  // re-seed would overwrite whatever the GM had typed since. This is the same id gate
  // `SystemEditView` states for the identity sub-form. Discard re-seeds through `discardDraft`
  // rather than through this effect, so a second discard on the same essence still lands.
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
   * Flush the buffered edit. Answers `false` when a write refused, which is what the route-exit
   * guard gates navigation on: a Save that did not land must leave the GM here with the edit
   * still in front of them.
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
    sectionRefusal = {};
  }

  /**
   * THE SHELL HANDLE, and it is a LIVE ACCESSOR rather than a reported snapshot.
   *
   * The shell renders the header pair and owns the route-exit cascade, so it has to be able to
   * ask "is there anything unsaved" at the moment a GM clicks something. A snapshot cannot
   * answer that: it is published by an effect, effects flush asynchronously, and the one path
   * that changes the answer and navigates in the same turn — Delete, which clears the draft and
   * then returns to the catalogue — would be read at its previous value and prompt to save an
   * essence that no longer exists.
   *
   * `isDirty()` reads the same `$derived` the header button is disabled from, so the guard and
   * the button cannot disagree about one click.
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

  // THE HEADING ABOVE THIS PAGE FOLLOWS THE DRAFT (issue 1372, maintainer parity round 5).
  //
  // It named the PERSISTED essence while the name field and the player preview both showed the
  // buffered one, so a GM mid-rename read `Aetherlight` in two places and `Aether` in a third on
  // one screen. A heading names the thing being edited, and the thing being edited is the draft;
  // the unsaved state is signalled by the enabled `Save essence` beside it, which is that
  // control's whole job.
  //
  // REPORTED, not read off the handle: the handle is deliberately a live accessor that never
  // re-renders, and a heading has to. It is `identity.name` rather than `draft?.identity?.name`
  // so an unseeded editor reports the persisted name instead of blanking the header for a frame.
  //
  // The SUBTITLE stays on the projection, and that is not an oversight: it counts the systems
  // using this essence, and a count of systems does not change until the write lands.
  $effect(() => {
    onDraftNameChange(String(identity.name ?? ''));
  });

  const normalizedIcon = $derived(normalizeEssenceIcon(identity.icon || DEFAULT_ESSENCE_ICON));

  /**
   * The colour token's display name and the value this theme resolves it to.
   *
   * An UNSET colour renders NOTHING rather than the word "None": the medallion beside it already
   * shows the theme-accent fallback, and a caption reading `None` under a tinted tile states the
   * opposite of what the tile shows. See `essenceColourCaption` for why the hex is read rather
   * than written.
   */
  const colourCaption = $derived(essenceColourCaption(identity.colorToken));

  /**
   * The world-default card HEADINGS, in the prototype's words.
   *
   * `scopedSectionLabel` answers the SHORT name a section is referred to by across five screens —
   * `Effect source`, `Property macro` — and that is right for an inherit row or a filter chip. A
   * card heading on the screen that AUTHORS the default is a different job, and the prototype
   * writes it as the whole phrase: `Active effect source` and `Macro on craft` (`essEntry.png`).
   * The short name would leave the two cards named after fields rather than after what they do.
   *
   * An early-return chain, not a nested ternary: SonarCloud reports S3358 in a file it indexes.
   *
   * @param {string} section
   * @returns {string}
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

  // VALIDATION AND THE PREVIEW READ THE DRAFT, not the record on disk. Both answer "what would
  // this essence be", and on a buffered-edit screen the answer a GM needs is about the state Save
  // would produce — a Validation tab reporting the persisted state would go on saying a default
  // is missing while the GM was looking at the one they had just dropped in.
  //
  // The inherit LINES below still read `entry`, and that is the opposite case for the same
  // reason: how many systems inherit a section is a fact about the persisted membership records,
  // which this editor does not touch at all.
  const validationContext = $derived({
    scope: 'world',
    memberSystemCount: memberCount,
    worldEffectSource: defaults?.effectSource ?? null,
    worldMacro: defaults?.macro ?? null,
    worldEffectSourceName: essenceSectionValueName(defaults?.effectSource),
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
    hasEffectTransfer: Boolean(defaults?.effectSource),
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

  const systemsCountText = $derived(
    format(
      'FABRICATE.Admin.Manager.Scoped.Essence.SystemsCount',
      '{count} of {total} systems have rules',
      { count: memberCount, total: systemRows.length }
    )
  );

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
   * The Validation tab's badge. An early-return chain rather than a nested ternary, which
   * SonarCloud reports as S3358.
   *
   * THE CLEAN STATE IS A TICK, NOT AN ABSENCE (issue 1372). The prototype's tab strip reads
   * `Validation ✓` (`essEntry.png`) and this returned `''` for it, so the one state a
   * finished essence is normally in was the one state the strip said nothing about — a GM
   * could not tell "everything passes" from "the checks have not been considered". The badge
   * is honest because `essenceValidationPresentation` already resolves all three outcomes:
   * `counts.blocking` and `counts.warnings` are the other two branches here, and their being
   * zero IS the pass, which is the same fact `worstStatus` returns as `pass` for the summary
   * row on the tab's own panel. Nothing is invented to render it.
   *
   * It is a GLYPH rather than the word, because the other two branches are counts and a chip
   * that reads `0` states the opposite of what it means.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {{label: string, tone: string, icon?: string, name?: string}}
   */
  function validationBadge(current) {
    if (current.blocking > 0) return { label: String(current.blocking), tone: 'danger' };
    if (current.warnings > 0) return { label: String(current.warnings), tone: 'warning' };
    return {
      label: '',
      tone: 'success',
      icon: 'fas fa-check',
      name: text(
        'FABRICATE.Admin.Manager.Scoped.Essence.ValidationPassBadge',
        'Everything passes'
      ),
    };
  }

  /**
   * The summary row's status word, by the WORST outcome present.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {string}
   */
  function worstStatus(current) {
    if (current.blocking > 0) return 'block';
    return current.warnings > 0 ? 'warn' : 'pass';
  }

  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  function sectionValueName(section) {
    return essenceSectionValueName(defaults?.[section]);
  }

  /**
   * The raw stored referent for one section, for the card's uuid sub-line.
   *
   * A section value is opaque by design and may be a bare string or `{id, name}`, so the display
   * NAME and the ADDRESS are two different reads. Printing only the name would hide which
   * document a default actually points at, which is the one fact a GM needs to check a link.
   *
   * @param {string} section
   * @returns {string}
   */
  function sectionValueAddress(section) {
    const value = defaults?.[section];
    if (value && typeof value === 'object') return typeof value.id === 'string' ? value.id : '';
    return typeof value === 'string' ? value : '';
  }

  /**
   * The card's uuid SUB-LINE, or `''` when it would only restate the name above it.
   *
   * A section value is stored opaquely, so a bare uuid resolves to itself as its display name -
   * and the card then printed `Macro.lab-aether-binding` twice, once in the serif title and once
   * in the mono sub-line. The sub-line exists to say WHICH document a named default points at,
   * so where there is no separate name there is nothing for it to add.
   *
   * @param {string} section
   * @param {string} name the resolved display name, `''` when unset.
   * @returns {string}
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
   * ONE SYSTEM ROW'S SUMMARY: what this essence resolves to in that system, in one line.
   *
   * The prototype's per-system row carries a summary beside the name, and without one the list
   * is a stack of names with a switch — which says a system HAS the essence and nothing about
   * what it does there. `row.inherited` is the resolver's own per-section map, so this sentence
   * is read from the answer the resolver gives rather than recomputed beside it.
   *
   * @param {{member?: boolean, inherited?: object}} row
   * @returns {string}
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

  /**
   * The row's meta word: the authored state, not a second copy of the switch.
   *
   * @param {object} row
   * @returns {string}
   */
  function systemMeta(row) {
    const state = essenceSystemState(row);
    if (state === 'enabled')
      return text('FABRICATE.Admin.Manager.Scoped.Essence.StateEnabled', 'Enabled here');
    if (state === 'disabled')
      return text('FABRICATE.Admin.Manager.Scoped.Essence.StateDisabled', 'Disabled here');
    return text('FABRICATE.Admin.Manager.Scoped.Essence.StateAbsent', 'Not in this system');
  }

  /**
   * Whether a candidate value may be written as this section's world default.
   *
   * `effectSource` goes through the addressability predicate; `macro` requires a document UUID
   * for the same reason and by the same test — a Macro is addressed by UUID everywhere else in
   * this product, and a bare token names nothing outside the system that minted it.
   *
   * @param {string} section
   * @param {string} value
   * @returns {boolean}
   */
  function acceptable(section, value) {
    if (section === 'effectSource') return isWorldAddressableEffectSource(value, []);
    return isDocumentUuid(value);
  }

  /**
   * A dropped document becomes this section's world default.
   *
   * `ItemDropZone` has already refused a payload of the wrong DOCUMENT TYPE and one that names no
   * document at all, so what reaches here is a real reference. It still passes the addressability
   * predicate, because that predicate — not the drop — is what `### Essence scope` requirement 5
   * binds, and a refusal a GM can read is what makes it a control rather than a value that
   * disappeared.
   *
   * @param {string} section
   * @param {object} data the raw drag payload.
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
   * `writable` does not proxy, so an in-place write renders nothing and a `$state`-only test
   * passes over it — which is why `scopedEntryDraft.js` returns a new object rather than
   * accepting one to edit.
   *
   * @param {string} section
   * @param {unknown} value
   */
  function setSection(section, value) {
    draft = withScopedEntryDefault(draft ?? persisted, section, value);
  }

  /** Stage one identity field into the draft. See {@link setSection} for the reassignment rule. */
  function patchIdentity(field, value) {
    draft = withScopedEntryIdentity(draft ?? persisted, field, value);
  }

  /**
   * Delete the world essence, then leave.
   *
   * THE DRAFT IS DROPPED FIRST, and that is not tidying. The record this editor buffers an edit
   * for no longer exists, so leaving with the draft still standing would have the route-exit
   * guard offer to save it into a record `updateEntity` refuses — a prompt about work the GM has
   * just deliberately destroyed. Clearing it synchronously is enough because the shell reads the
   * handle rather than a reported snapshot.
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
    ONE CHILD OF `<main>`, WITH ITS OWN TWO-ROW GRID.

    `.manager-main` is `display: grid` with a single `minmax(0, 1fr)` row for a full-width world
    route, so TWO children land in the same grid area and paint over each other: measured in the
    View Lab, the identity fields's label sat under the shell's search box and the tab strip sat under them. `styles/fabricate.css` is closed to this lane by
    `### GM World Scoped Entity Routes` requirement 7, so the row split belongs here — and it
    belongs here anyway, because it is this page's composition rather than the route's.
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
            TWO COLUMNS, AND THE RIGHT ONE IS THE PLAYER PREVIEW.

            The prototype's essence entry is a form beside a ~310px rail headed `HOW PLAYERS SEE
            IT`, carrying the two inventory tiles, then `EFFECTIVE BEHAVIOUR` and the live-update
            note (`essEntry.png`). Every one of those parts already existed here — they are what
            `EssenceBehaviorPreview` renders — but the panel stacked the aside BELOW the danger
            card at the foot of a single column, roughly 1,100px down. The GM typing a name could
            not see the thing the panel exists to show them changing.

            The main column keeps the flex stack it had, so nothing inside it moves.
          -->
          <div class="manager-scoped-entry-body">
            <div class="manager-scoped-entry-main">
              <!--
            THE SCOPE BANNER. Everything under it is one record shared by every crafting system,
            and this screen is reached from a system-scoped rail — so without it a GM has no
            standing signal that the name they are editing changes in six places at once. The
            prototype draws it at the top of the tab body for exactly that reason, and it is a
            heading rather than a `Callout` because it introduces a region rather than warning
            about one.
          -->
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
            fluid field column beside it.

            This shipped as a wrapping flex row of four equal-basis fields, which put Name on a
            ~12rem basis beside the tile and left the rest of the row empty — the dead space the
            maintainer rejected. A two-column grid is what the prototype specifies and is also the
            only shape that keeps Name, Description and the colour palette on ONE measure, so a
            long name and a long description align rather than stepping around the tile.
          -->
              <section class="manager-scoped-entry-identity" data-scoped-entry-identity={entry.id}>
                <!--
              THE SAME THREE CONTROLS THE SYSTEM-SCOPE IDENTITY TAB USES, and for the reason the
              shells were built on: a GM authors one essence's identity, and it must not be a
              searchable picker in one scope and a text box in the other.

              This shipped as `<input type="text">` for both, which asked a GM to type a
              FontAwesome class (`fas fa-atom`) and a palette token (`lavender`) from memory,
              with no validation and no way to discover either. `getEssenceIconOptions` and
              `ESSENCE_COLOR_TOKENS` were already shipped and already unused.

              The tile is SQUARE where the prototype's is 150x104, because a square essence tile
              is the maintainer's own round-3 ruling on `EssenceIdentityTab` (issue 1036) and one
              essence identity must not read as two different shapes across the two scopes.
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
                THE COLOUR CAPTION, under the icon picker exactly where the prototype puts it
                (`essEntry.png`). The swatch row further down is a CHOOSER — it says which colour
                is selected only by a ring — and this says which one in words, beside the tile the
                colour is actually tinting.

                THE HEX IS READ FROM THE CASCADE, NEVER WRITTEN. `src/ui/**` may carry no raw
                colour literal at all, and a literal would be wrong the moment a GM switched
                theme, since every `--fab-tag-*` token is re-declared in each of the seven theme
                blocks. So `essenceColourCaption` resolves it from the live cascade, which makes
                it the truthful answer for whichever theme is active.
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
                    <!--
                  `ManagerColorPopover` takes `layout="inline"` here exactly as
                  `EssenceIdentityTab` does: the popover chrome is applied by the global sheet,
                  which this lane may not open, and inline strips it and nothing else.
                -->
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
                      <StatusPill
                        tone={value ? 'success' : 'subtle'}
                        icon={value ? 'fas fa-circle-check' : 'fas fa-circle-minus'}
                        label={value
                          ? text(ui?.setKey ?? '', ui?.set ?? label)
                          : text(
                              'FABRICATE.Admin.Manager.Scoped.Essence.DefaultNone',
                              'No default'
                            )}
                      />
                    </header>

                    <p class="manager-scoped-entry-default-blurb">
                      {text(ui?.blurbKey ?? '', ui?.blurb ?? '')}
                    </p>

                    <!--
                  THE CONTROL IS THE SHARED DROP ZONE, not a uuid text box. `documentType` comes
                  from the section table, so the effect source refuses a Macro drag and the macro
                  refuses an Item drag before either reaches `dropSection`.
                -->
                    <div
                      class="manager-scoped-entry-default-slot"
                      data-scoped-world-default-value={section}
                    >
                      <ItemDropZone
                        item={value ? { name: value } : null}
                        title={text(ui?.promptKey ?? '', ui?.prompt ?? label)}
                        hint={sectionAddressLine(section, value)}
                        documentType={ui?.documentType ?? 'Item'}
                        emptyIcon="fas fa-arrow-down-to-bracket"
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

              <!-- THE MEMBERSHIP LIST. Rows come from `entry.systems` — the projection's JOIN — and
               never from the `systems` prop, which is a narrowed `{id, name}` roster and cannot
               answer `member`, `inherited` or `enabled`.

               Each row carries the prototype's three cells rather than a bare name: a fixed
               NAME column with the authored state under it, a fluid SUMMARY of what the essence
               resolves to in that system, and the shipped action cluster. A stack of names and
               switches says a system HAS the essence and nothing about what it does there, which
               is the whole subject of this screen. -->
              <section class="manager-scoped-entry-systems" data-scoped-entry-systems>
                <header class="manager-scoped-entry-systems-head">
                  <span class="manager-scoped-entry-default-glyph" aria-hidden="true">
                    <i class="fas fa-wand-sparkles"></i>
                  </span>
                  <div class="manager-scoped-entry-systems-copy">
                    <h4 class="manager-scoped-entry-default-title">
                      {text(
                        'FABRICATE.Admin.Manager.Scoped.Essence.SystemsHead',
                        'Systems using this essence'
                      )}
                    </h4>
                    <p class="manager-scoped-entry-systems-sub">
                      {text(
                        'FABRICATE.Admin.Manager.Scoped.Essence.SystemsSub',
                        'The rules hold what the essence does on craft in that system: its active effect source item and its macro.'
                      )}
                    </p>
                  </div>
                  <span class="manager-scoped-entry-systems-count" data-scoped-entry-systems-count>
                    {systemsCountText}
                  </span>
                </header>

                <ul class="manager-scoped-entry-system-list" role="list">
                  {#each systemRows as row (row.systemId)}
                    <li
                      class="manager-scoped-entry-system"
                      data-scoped-entry-system={row.systemId}
                      data-scoped-entry-system-state={essenceSystemState(row)}
                    >
                      <span class="manager-scoped-entry-system-copy">
                        <span class="manager-scoped-entry-system-name">{systemLabel(row)}</span>
                        <span class="manager-scoped-entry-system-meta">{systemMeta(row)}</span>
                      </span>
                      <span class="manager-scoped-entry-system-summary">{systemSummary(row)}</span>
                      <MembershipActions
                        entityType="essence"
                        entityId={entry.id}
                        systemId={row.systemId}
                        entityName={entity?.name ?? entry.id}
                        systemName={systemLabel(row)}
                        member={row.member === true}
                        enabled={row.enabled === true}
                        {armedToken}
                        onArm={(token) => (armedToken = token)}
                        onDisarm={() => (armedToken = '')}
                        onAdd={() => actions?.addToSystem?.(entry.id, row.systemId)}
                        onRemove={() => actions?.removeFromSystem?.(entry.id, row.systemId)}
                        onToggleEnabled={(next) =>
                          actions?.setEnabled?.(entry.id, row.systemId, next)}
                      />
                    </li>
                  {/each}
                </ul>
              </section>

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

            <!-- THE LIVE NOTE IS ON (`proto:3537`). `EssenceBehaviorPreview` already renders the
               footer strip — glyph plus "This preview updates live as you edit." — and the
               prototype's essence-definition editor draws it at the foot of exactly this
               panel, as every one of its six editors does (`proto:6138`, `6155`, `6209`).
               It shipped suppressed here, which left the one panel on the page that DOES
               recompute on every keystroke saying nothing about it; the browser inspector,
               which is the site that legitimately suppresses it, is a read-only rail with
               nothing to type into. -->
            <section class="manager-scoped-entry-preview" data-scoped-entry-preview>
              <!-- The two NAMES are shortened for display: a value stored as a document uuid would
                 otherwise render as `Runs Macro.lab-aether-binding` in the behaviour list, where
                 the row's own verb already states the document type. The card's uuid sub-line in
                 the form beside it still prints the address in full. -->
              <EssenceBehaviorPreview
                essence={previewEssence}
                effectTransferEnabled={Boolean(defaults?.effectSource)}
                propertyMacrosEnabled={Boolean(defaults?.macro)}
                sourceName={essenceShortValueName(sectionValueName('effectSource'))}
                macroName={essenceShortValueName(sectionValueName('macro'))}
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
  /* STATIC class names, so `lint:svelte:warnings` stays at zero and `styles/fabricate.css` —
     closed to this lane by `### GM World Scoped Entity Routes` requirement 7 — is not reopened.

     Every colour is a `--fab-*` token DECLARED at `:root` or in the seven theme blocks, and that
     is the whole check: a custom property that is not declared there is invalid at computed-value
     time and falls back to inheritance silently rather than failing, so an invented name costs a
     wrong colour and no error. `--fab-text-subtle` and `--fab-text-secondary`, both read below,
     are declared. */
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

  /* EVERY REGION THE PANEL STACKS IS `flex: 0 0 auto`, and this is load-bearing rather than tidy.

     The panel is a column flex container inside a `minmax(0, 1fr)` grid row, so its content
     overflows on a 900px window — and a flex item's default `flex-shrink: 1` then compresses
     each child toward zero. Measured in the View Lab: the per-system card, which carries
     `overflow: hidden`, collapsed to NOTHING between its own section kicker and the preview
     below it, so the whole membership list was simply not on the screen while every selector
     that names it still matched. The prototype writes `flex:0 0 auto` on each child of the tab
     body for exactly this reason.

     Enumerated by class rather than written as `> *`, because a universal child selector would
     have to be `:global` to survive scoping and this component owns every one of these six. */
  .manager-scoped-entry-body,
  .manager-scoped-entry-kicker,
  .manager-scoped-entry-identity,
  .manager-scoped-entry-defaults,
  .manager-scoped-entry-systems,
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

  /* ONE CARD PER ROW, FULL WIDTH.

     The prototype stacks `Active effect source` and `Macro on craft` as two full-width cards
     (`essEntry.png`); this shipped as `auto-fit, minmax(22rem, 1fr)`, which put them side by side
     at any width over about 45rem and halved the measure each card's drop target, uuid line and
     inherit sentence had. Beside a 310px preview rail that is a ~330px card holding a full item
     uuid.

     `minmax(0, 1fr)` rather than removing the grid, because the gap and the overflow floor are
     still this container's. */
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

  /* THE PER-SYSTEM CARD is one bordered panel with a header and hairline-divided rows, not a
     bare stack: the header carries the count, and the divider is what makes a six-system list
     scannable at row height. */
  .manager-scoped-entry-systems {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    /* NO FILL (issue 1372). See the essence surface-ladder block in `styles/fabricate.css`: the
       prototype draws every card in the content area on the pane's own surface and separates
       them with the border alone. */
    background: transparent;
    min-width: 0;
    overflow: hidden;
  }

  .manager-scoped-entry-systems-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3) var(--fab-space-4);
    border-bottom: 1px solid var(--fab-border);
    min-width: 0;
  }

  .manager-scoped-entry-systems-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 1 1 18rem;
    min-width: 0;
  }

  .manager-scoped-entry-systems-sub {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.63rem;
    line-height: 1.45;
  }

  .manager-scoped-entry-systems-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    font-weight: 500;
  }

  .manager-scoped-entry-system-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  /*
     THREE CELLS ON ONE LINE: a fixed name column, a fluid summary, and the action cluster.

     An earlier revision stacked name over actions, so each system cost roughly 68px and six of
     them pushed the preview and everything below it off the screen. Wrapping is still allowed so
     a long system name breaks rather than forcing the controls out of the panel.
  */
  .manager-scoped-entry-system {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-4);
    min-width: 0;
  }

  .manager-scoped-entry-system + .manager-scoped-entry-system {
    border-top: 1px solid var(--fab-border);
  }

  .manager-scoped-entry-system-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 0 0 12rem;
    min-width: 0;
  }

  .manager-scoped-entry-system-name {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.78rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-scoped-entry-system-meta {
    color: var(--fab-text-subtle);
    font-size: 0.59rem;
    font-weight: 500;
  }

  /* A NON-MEMBER's summary is the disabled ink, so the two states are told apart without
     reading the sentence — which is exactly what the prototype's `summaryColor` does. */
  .manager-scoped-entry-system-summary {
    flex: 1 1 12rem;
    color: var(--fab-text-muted);
    font-size: 0.69rem;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .manager-scoped-entry-system[data-scoped-entry-system-state='absent']
    .manager-scoped-entry-system-summary {
    color: var(--fab-text-disabled);
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
