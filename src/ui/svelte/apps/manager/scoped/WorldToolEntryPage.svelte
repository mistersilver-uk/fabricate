<!-- Svelte 5 runes mode -->
<!--
  The world Tool entry editor (issue 1373, epic 1357).

  == THE SCREEN IS FOUR TABS, AND IT USED TO BE SIX =======================================
  `Identity`, `Breakage`, `On break`, `Repair materials`, `Crafting systems`, `Validation`
  was the section list wearing a tab strip: one tab per persisted key rather than one tab per
  decision a GM makes. Three of them - breakage, what happens when it breaks, and what mends
  it afterwards - are one question asked three times, and each panel held a single segmented
  control over two thirds of empty pane.

  What is here now is `Overview`, `Breakage`, `Requirements` and `Validation`, which is the
  design's own strip:

   - OVERVIEW is the identity the record actually has - the game-world Item behind it, and
     the display label every system shows. It is where the LINK ITSELF is authored, and it is
     the only scope that may be: identity is world-scoped, so a crafting system must not be
     able to re-point which game-world Item a Tool IS;
   - BREAKAGE opens with the world break mode, READ-ONLY, because it decides whether the
     control beneath it is consulted at all. That statement used to be a full-width band
     ABOVE the tab strip, where it sat over tabs it says nothing about;
   - REQUIREMENTS authors the two world-default sections added at `1.31.0` - who may wield the
     Tool, and what it adds to the check. It renders `tools/ToolRequirementsTab`, the SAME
     component the system editor mounts, rather than a second one: the two scopes author the
     same two sections and a second implementation is how one meaning gets two shapes;
   - VALIDATION wears its own count in the strip, so a GM does not open a tab to learn
     whether anything is wrong.

  `Crafting systems` is gone rather than folded. The per-system membership cluster it held is
  the CATALOGUE inspector's, which renders it for every world entity through
  `EntityCatalogueShell`; a second copy behind a tab here was one meaning implemented twice.

  == THE EDIT IS BUFFERED, AND SAVE IS WHAT WRITES IT ====================================
  This screen persisted every keystroke and every segment on change, and its header therefore
  said there was nothing to save. The maintainer ruled the other way for the world entry
  editors: they adopt the reference's explicit-save model, so an edit accumulates locally and
  `Save tool` flushes it. The mechanism is `scopedEntryDraft.js`, built by the essence lane and
  TAKEN here rather than written twice - a draft is a SHAPE, and the same shape reached by two
  implementations is how a persisted record and its editors drift apart. The only per-screen
  argument is the FIELD LIST.

  WHAT IS BUFFERED IS WHAT THIS EDITOR AUTHORS: the display label, the description, and the
  two inherited world-default sections. Everything else on the screen stays immediate and
  each has the same reason - it acts on a DIFFERENT record, or it ends the record the draft
  is about. The world master switch is a world-wide enable a GM flips deliberately with the
  reach stated beside it; the repair seed is cleared by its own button; Delete removes the
  world record, its defaults and every membership naming it. Staging any of them behind Save
  would mean an armed action that did nothing until a later button.

  THE HEADER PAIR IS THE SHELL`S, and it cannot be anything else: `.manager-header` is a
  SIBLING of `.manager-main`, so this page structurally cannot render into the band the
  reference draws `Back to tools` and `Save tool` in. The three wires below are how the shell
  reaches this editor.

  == THE WORLD BREAK MODE IS READ-ONLY HERE, AND THAT IS ALSO A DECISION ==================
  It is authored on the Tools Catalogue and nowhere else. `## Scoped Entity Definitions`
  prohibits one field authored at two places, and the failure it prevents is concrete: two
  controls over one setting disagree the moment either is edited with the other on screen.

  == THE INHERITED SECTIONS ARE WHAT THIS SCREEN AUTHORS ==================================
  `breakage`, `onBreak`, `prerequisites` and `bonus` are world defaults a membership record
  INHERITS: each states how many systems inherit it before an edit lands, read from
  `entry.inheritCounts`, which `worldScopeProjection` populates from `descriptor.sections`
  alone.

  `repairRequirements` IS NOT AMONG THEM, AND IT IS DRAWN HERE ANYWAY. It is not in
  `descriptor.sections` - correctly, because it is copied ONCE when a tool joins a system and
  then diverges freely, so an inherit count would claim a live parent the resolver does not
  honour and `resolveTool` reads the list from the MEMBERSHIP RECORD ALONE. That is why it takes
  no inherit count and no inherit switch, and why it writes through its own action rather than
  through `updateWorldDefaultSection`, which would refuse the name and store nothing.

  IT IS AUTHORED ON THE BREAKAGE TAB, in `Mark as broken` and no other mode (issue 1373,
  maintainer round 2). An earlier round removed a card that stated a bare group COUNT and offered
  `Clear the seed` beside it, and the rule it recorded stands: a screen may not offer a write over
  data it has declared itself unable to show. What has changed is the premise underneath it. That
  card's own body said a repair group names components "in the owning crafting system, which world
  scope cannot address" - true before epic 1357 gave the world a component catalogue, and not true
  now: a world component id IS the id a membership record carries. So the answer is to SHOW the
  groups, over the world component, essence and tag rosters, rather than to keep a count nobody can
  check. `toolScope.js` and `## Scoped Entity Definitions` both carry the same correction.

  == THE TAB STRIP IS THE SHIPPED ONE ====================================================
  `EditorTabs` was promoted to `apps/manager/` for exactly this, and `tools/ToolEditorTabs`
  is hardcoded to four `tool-tab-*` ids for the SYSTEM editor. Reusing the promoted primitive
  is what stops a second near-identical `.svelte` tab block, which SonarCloud counts.
-->
<script>
  import { formulaRolls } from '../../../../../utils/rollFormulaRollability.js';
  import { localize, notifyError } from '../../../util/foundryBridge.js';
  import { toolBreakageChanceColor } from '../../../util/chanceColorScale.js';
  import ChanceSlider from '../../../components/ChanceSlider.svelte';
  import Field from '../../../components/Field.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import Chip from '../Chip.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import ToolBehaviorPreview from '../tools/ToolBehaviorPreview.svelte';
  import ToolRepairRequirements from '../tools/ToolRepairRequirements.svelte';
  import ToolReplacementTarget from '../tools/ToolReplacementTarget.svelte';
  import ToolRequirementsTab from '../tools/ToolRequirementsTab.svelte';
  import {
    toolBreakageChanceBand,
    toolBreakageChoice,
    toolBreakageSummary,
    toolSourceSnapshot,
  } from '../tools/toolStudio.js';
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
  import { isSeededToolSection, toolBreakModeLabel } from './worldToolStudio.js';

  // `systems` IS DELIBERATELY NOT DECLARED, though the call site passes it in the tool bundle.
  // It is `projectSystems`' narrowed `{id, name}` roster, which cannot answer `member`,
  // `inherited` or `enabled` - and this screen needs all three per row. `entry.systems` is the
  // projection's own JOIN and answers them, so declaring the roster would add an unread prop
  // beside the value that is actually correct.
  let {
    scope = null,
    actions = null,
    entityId = '',
    // THE GAME-WORLD ITEM ROSTER, for the linked-item card's LIVE name, art and description.
    // The projected world entity carries a SNAPSHOT of all three, taken when the link was made;
    // this is what lets the card show the Item as it is now, and what makes a link whose
    // document has since gone missing distinguishable from a working one.
    worldItems = [],
    // THE WORLD CHARACTER-PREREQUISITE LIBRARY, for the Requirements tab. It is world scope
    // itself (issue 1308), which is what makes a world-default `prerequisites.ids` addressable
    // from here at all: a system-local id would name nothing in the next system to inherit it.
    prerequisiteOptions = [],
    // THE WORLD MODIFIER LIBRARY, for the Requirements tab's bonus section (issue 1373,
    // maintainer round 3). World scope for the same reason the prerequisite library is: a
    // world-default `bonus.expression` picked from a system-local roster would name a modifier
    // the next system to inherit it has never heard of.
    modifierOptions = [],
    // ── THE THREE WORLD ROSTERS THE BREAKAGE TAB NAMES (issue 1373, maintainer round 2) ────
    //
    // `componentOptions` IS THE WORLD COMPONENT CATALOGUE, not a system's managed items, and
    // that is the whole answer to whether this screen may offer a replacement target or a
    // repair route at all. `toolScope.js` USED TO record that a repair group named quantities
    // over the owning system's components, which world scope could not address — true before
    // epic 1357 gave the world its own component catalogue, and corrected there since.
    // A world component id IS the id a membership record carries, so a world default naming one
    // resolves in every system that has adopted that component and in no other; the same
    // property `prerequisites.ids` already relies on one tab across.
    //
    // `essenceOptions` is the world ESSENCE catalogue on the identical argument, and `itemTags`
    // is the union of every world component's own `tags` — the list `setWorldTags` authors.
    //
    // AND `currencyUnits` IS THE WORLD LADDER, on exactly the same argument (issue 1373,
    // maintainer round 5). This screen used to mount the repair editor with
    // `currencyEnabled={false}`, reasoning that whether a cost is HONOURED is
    // `requirements.currency.enabled` on each crafting system and a world default cannot state
    // which of them has it on. That conflates two different things.
    //
    // The LADDER is world scope — `CraftingSystemManagerRoot` states the fact: one config for
    // the whole world, because a world runs exactly one ruleset and so has exactly one way
    // actors store coins (issue 1278). The per-system flag exists so the RECIPE editor can gate
    // a cost on the system it is authoring for. At world scope there is no system to gate on,
    // so the flag has no referent here — and reading `false` for "no referent" made the screen
    // refuse to author a cost over units it can address perfectly well, which is the same
    // mistake the component and essence rosters above were corrected for.
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    // ── THE `PREVIEW AS` SEAM (issue 1373) ────────────────────────────────────────────────
    // `{id, name, img}` per previewable actor, and a reader that answers ONE actor's prepared
    // roll data. Both are the shell's: resolving an Actor document and calling `getRollData()`
    // are Foundry reads, and this page is a leaf that holds none — the mounted suites compile it
    // with no `game` at all. A reader that answers `null` is the `No actor` case, and every `@`
    // key then resolves to nothing, which is why the readout says so rather than showing a
    // plausible wrong answer.
    previewActors = [],
    getPreviewRollData = () => null,
    onBackToCatalogue = () => {},
    // ── DELETE IS THE HEADER'S, AND THE PAGE STILL OWNS IT (issue 1373) ───────────────────
    // The design draws `Back to tools · Delete · Save tool` on the title line and puts the
    // danger-CARD idiom on the SYSTEM screen, where it says `Stop using this Tool here`. The
    // two scopes had swapped treatments; this screen carried the card and no header button.
    //
    // `.manager-header` is a SIBLING of `.manager-main`, so this page structurally cannot draw
    // into that band — the same reason `Back` and `Save` are the shell's. What crosses is an
    // ACTION DESCRIPTOR rather than the button: the reach sentence, the two labels and the two
    // consequence strings all name THIS record and are resolved from values only this page
    // holds, and the ordering `deleteTool` needs (clear the draft, then write, then leave) is a
    // rule about this editor rather than about a header.
    //
    // REPUBLISHED ON EVERY CHANGE and withdrawn on unmount, exactly as the identity report
    // beside it: a stale descriptor left behind would arm a Delete against a Tool the GM has
    // navigated away from.
    onDeleteChange = () => {},
    // ── THE LINK IS AUTHORED HERE, AND ONLY HERE (issue 1373) ─────────────────────────────
    // The three wires below moved OFF the system Tool editor, which had them and should not
    // have: a crafting system could re-point which game-world Item a Tool IS, while the world
    // scope that owns identity could not link one at all. Both halves were wrong at once.
    //
    // The RESOLUTION is the shell's rather than this page's, on exactly the argument
    // `WorldToolCataloguePage` already makes for its create-from-drop zone: turning a drag
    // payload into a name, an image and a description needs `services.resolveToolSource`,
    // which reads a Foundry global, and `worldScopeActions` deliberately reads none. So the
    // page raises the RAW drag data and the root resolves and writes.
    // `onCopySourceUuid` IS GONE with the Copy action beside Unlink (issue 1373). The design's
    // tile carries one button and two lines; the third line it displaced was a raw uuid, which
    // is not a fact this screen states anywhere else.
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
    // THE BUFFERED EDIT`S THREE WIRES TO THE SHELL. Same contract the world essence entry
    // declares, and deliberately the same names: the shell holds one pattern for both.
    //
    //  - onDraftChange(handle|null): a LIVE handle, `{isDirty, save, discard}`, reported once
    //    on mount and withdrawn on unmount. Live rather than a snapshot because the
    //    route-exit guard reads it at the moment of a click, and a snapshot published by an
    //    effect can be one turn behind - Delete changes the answer and navigates in the same
    //    turn, so a stale read would prompt to save a Tool that no longer exists.
    //  - onDirtyChange(dirty): the reactive half, for the header button`s disabled state. A
    //    disabled attribute has to re-render, and the handle deliberately never does.
    //  - onDraftIdentityChange(identity|null): the other reactive half, for the shell chrome
    //    that NAMES the Tool - the breadcrumb`s last crumb and the heading in the band above.
    //    Both resolve out of the published corpus by default, and the published corpus is not
    //    what the GM is editing, so mid-rename the trail read the record on disk under a
    //    heading that read the draft.
    //
    //    THE WHOLE BUFFERED IDENTITY MAP goes over, not the name alone, and that is the
    //    essence entry`s contract taken verbatim rather than a second design: the shell reads
    //    whichever of these fields the chrome it draws happens to render, and the three entry
    //    editors buffer DIFFERENT field sets (`IDENTITY_FIELDS` below is `name` and
    //    `description`; the essence editor`s is `name`, `icon` and `colorToken`). A fixed
    //    payload here would restate a shape `shape` already owns, and the shell would have to
    //    grow a per-entity reader to keep up with it.
    //
    //    This screen therefore contributes a NAME and nothing else the chrome renders, which
    //    is correct: its medallion carries the linked Item`s artwork, which is a property of
    //    the record`s link rather than an identity field this editor buffers.
    //
    //    WITHDRAWN BY THIS PAGE on unmount rather than by the shell`s `onDraftChange(null)`,
    //    because the shell`s reader is generic across all three entry routes and must not need
    //    a per-entity teardown to stay correct.
    onDraftChange = () => {},
    onDirtyChange = () => {},
    onDraftIdentityChange = () => {},
    // onSublineChange(text): what the record IS, under the name, in the same band.
    //
    // REPORTED RATHER THAN DERIVED IN THE SHELL, unlike the essence entry`s subtitle, and
    // the reason is that this sentence is one this page ALREADY renders on its linked-item
    // card. Deriving it up there would put the same two copy keys in two files and let the
    // header and the card disagree about one record. It follows the persisted link rather
    // than the draft, because relinking a Tool is not authored here.
    onSublineChange = () => {},
  } = $props();

  // Read by `manager-contract.test.js``s SWAP DETECTOR against the title `viewTitle` renders
  // for this route. A page that DELEGATES its body states these four as attributes on the
  // shared placeholder; a page with its own body states them as module constants, and this is
  // one of those.
  const PAGE_ID = 'world-tool-entry';
  // DISTINCT from the catalogue's, and that is a contract rather than a preference: the swap
  // detector asserts the seven world routes wear seven different glyphs, so a route sharing its
  // catalogue's icon is a route wearing another identity.
  const PAGE_ICON = 'fas fa-hammer';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ToolEntryTitle';
  const TITLE_FALLBACK = 'Tool entry';

  /**
   * The identity fields this editor BUFFERS, which is what it authors and no more.
   *
   * `WORLD_IDENTITY_FIELDS.tools` also lifts `img` and the three source-link uuids. None of
   * them is authored here - the art comes from the linked Item and the link is re-pointed from
   * the catalogue - so buffering them would put fields in a draft that no control on this
   * screen can move, and `scopedEntryWrites` would send them back unchanged on every Save.
   *
   * `description` LEFT THE LIST with the textarea that authored it (issue 1373). The design's
   * Overview has one editable identity field, and the description a Tool has is the linked
   * game-world Item's — stated read-only on the card above, which is where the design puts it.
   * A buffered field no control can move is a field `scopedEntryWrites` re-sends on every Save.
   *
   * @type {readonly string[]}
   */
  const IDENTITY_FIELDS = Object.freeze(['name']);

  /**
   * THE FOUR ANSWERS A GM AUTHORS, not the three `breakage.mode` values (issue 1373).
   *
   * `limitedUses` carries TWO of them: `maxUses: null` is the UNLIMITED state - the copy is
   * never used up, so it never breaks - and `src/models/Tool.js` has always said so.
   * `toolBreakageChoice` is the one place that splits them, and the system editor's Breakage
   * tab already offers exactly this set.
   *
   * WHAT THIS SCREEN DID BEFORE, stated so nobody restores it: it offered three modes, selected
   * them off `breakage.mode` alone, and drew a null `maxUses` as `1` against a `min={1}`
   * stepper. So the world's own fixture Tool read `Limited uses` on the card, `1` in the
   * stepper, `Unlimited uses` in the summary beside it and a Validation warning under all
   * three - and the stepper had no reachable value that put the `null` back, so a GM who
   * nudged it converted an unlimited Tool into a one-use Tool for every system inheriting it.
   *
   * `unlimited` LEADS, for the reason the system editor gives: it is the model's default, the
   * state a Tool made by dropping an Item opens in, and the only one of the four naming an
   * ABSENCE of a mechanic.
   *
   * @type {readonly string[]}
   */
  const BREAKAGE_CHOICES = Object.freeze([
    'unlimited',
    'limitedUses',
    'breakageChance',
    'diceExpression',
  ]);
  const DEFAULT_BREAK_MODE = 'toolSpecific';
  const ON_BREAK_MODES = ['destroy', 'flagBroken', 'replaceWith'];

  const TAB_ICONS = {
    identity: 'fas fa-circle-info',
    breakage: 'fas fa-heart-crack',
    requirements: 'fas fa-user-shield',
    validation: 'fas fa-clipboard-check',
  };

  let activeTab = $state('identity');

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
   * One section's tab and heading label, from the ONE shared table.
   *
   * `scopedSectionLabel` answers from `SECTION_COPY`, which carries the INHERITED section names
   * and deliberately not the seeded one. This screen used to special-case `repairRequirements`
   * here because it drew that section as a card; it no longer draws it, so the special case
   * went with it and every section this function is asked about is in the shared table.
   *
   * @param {string} section
   * @returns {string}
   */
  function sectionLabel(section) {
    return scopedSectionLabel(section, text);
  }

  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const entry = $derived(entries.find((candidate) => candidate.id === entityId) ?? null);
  const entity = $derived(entry?.entity ?? null);
  const sections = $derived(Array.isArray(scope?.sections) ? scope.sections : []);

  /**
   * THE BUFFERED EDIT. See the file header for what is in it and what deliberately is not.
   */
  const shape = $derived({ identityFields: IDENTITY_FIELDS, sections });
  const persisted = $derived(scopedEntryBaseline(entry, shape));

  /**
   * WHAT THIS EDITOR KNOWS IS ON DISK, which is the persisted projection EXCEPT immediately
   * after its own Save.
   *
   * A world-scope write reaches this screen back through Foundry: the store writes the
   * setting, the replicated `updateSetting` hook reloads it, and only then does the admin
   * store republish. Between a successful Save and the end of that round trip the projection
   * still holds the OLD record, so a dirty flag measured against it alone would leave `Save`
   * lit over an edit that had already landed and have the route-exit guard offer to write it
   * a second time. So a Save records what it wrote and the next publish drops that record.
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

  // Seed on IDENTITY change ONLY, never on every publish: the admin store republishes
  // `viewState` twice on a refresh and again on any unrelated world-corpus write, so a
  // reference-triggered re-seed would overwrite whatever the GM had typed since. Discard
  // re-seeds through `discardDraft` rather than through this effect, so a second discard on
  // the same Tool still lands.
  $effect(() => {
    const currentId = entry?.id ?? '';
    if (currentId === seededEntityId) return;
    seededEntityId = currentId;
    draft = currentId ? scopedEntryBaseline(entry, shape) : null;
    flushed = null;
  });

  const identity = $derived(draft?.identity ?? persisted.identity);

  // THE WHOLE SCREEN READS THE DRAFT. The buffered sections sit over the persisted record
  // rather than replacing it, because `repairRequirements` is NOT one of the buffered
  // sections - it is seeded rather than inherited - and a bare swap would drop it.
  const defaults = $derived({ ...(entry?.defaults ?? {}), ...(draft?.defaults ?? {}) });
  const dirty = $derived(scopedEntryDirty(draft, baseline));

  /** Stage one identity field into the draft. REASSIGNED, never mutated in place. */
  function setIdentity(field, value) {
    draft = withScopedEntryIdentity(draft ?? persisted, field, value);
  }

  /**
   * The sentence a REFUSED save puts in front of the GM (issue 1371 r20-entry3; Foundry review
   * round 6 finding 4).
   *
   * This screen stages a MULTI-SECTION sequence, so a rejection at write *k* leaves `1..k-1`
   * landed durably while the draft stays dirty — and the store publishes its cache before
   * awaiting the write, so every open manager surface shows them as saved until a reload. Until
   * r20 it passed no `onRefused` at all: the rejection was caught and the route-exit guard
   * declined the exit, but the GM's only signal was Foundry's own raw `error.message`, which
   * cannot say which step stopped or which had already landed. The sentence itself is composed by
   * `reportRefusedScopedEntrySave`, shared with the component and essence entries so the three cannot
   * drift on what a step of a Save is called.
   *
   * @param {{step: string, error: unknown, landed: string[]}} refusal
   * @returns {void}
   */
  function reportRefusedSave(refusal) {
    reportRefusedScopedEntrySave({
      refusal,
      entityType: 'tool',
      identityStep: SCOPED_ENTRY_IDENTITY_STEP,
      format,
      notify: notifyError,
    });
  }

  /**
   * Flush the buffered edit. Answers `false` when a write refused, which is what the
   * route-exit guard gates navigation on: a Save that did not land must leave the GM here
   * with the edit still in front of them.
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

  /**
   * THE SHELL HANDLE, and it is a LIVE ACCESSOR rather than a reported snapshot. See the
   * props block for why, and the essence entry`s twin for the same argument at length.
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
  $effect(() => {
    onDirtyChange(dirty);
  });
  // THE CHROME ABOVE THIS PAGE FOLLOWS THE DRAFT. The heading and the breadcrumb`s last crumb
  // both name the thing being edited, and the thing being edited is the draft; the enabled
  // `Save tool` beside them is what says the edit is unsaved. `identity` rather than
  // `draft?.identity` so an unseeded editor reports the persisted values instead of blanking
  // the header for a frame.
  //
  // A NEW OBJECT every time, never `identity` itself. The shell holds what it is given in its
  // own `$state`, and Svelte 5 does not proxy a value that crossed a prop boundary - so
  // handing over a reference and mutating it later would render nothing. `patchIdentity` above
  // already reassigns rather than mutates; this spread means the shell does not have to rely
  // on that staying true.
  $effect(() => {
    onDraftIdentityChange({ ...identity });
  });

  // WITHDRAWN ON UNMOUNT, from an effect with no dependencies so it runs once and tears down
  // once. It is separate from the report above because that one re-runs on every keystroke and
  // a teardown attached to it would publish `null` before each republish. The shell`s reader is
  // shared by all three entry routes, so a stale identity left behind here would name THIS Tool
  // in another route`s breadcrumb.
  $effect(() => () => onDraftIdentityChange(null));
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');
  const memberRows = $derived(Array.isArray(entry?.systems) ? entry.systems : []);

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
      id: 'requirements',
      icon: TAB_ICONS.requirements,
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Entry.TabRequirements',
      label: 'Requirements',
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
   * One section's reach sentence, resolved ONCE.
   *
   * It was written out inline at four call sites — the same eleven-line `format` block with one
   * section name changed — which is both the duplication SonarCloud counts in `.svelte` and the
   * reason two of the four ended up stacked outside the cards they describe. Stated here, the
   * call sites are one expression each and the sentence cannot drift between them.
   *
   * @param {string} section
   * @returns {string}
   */
  function inheritCountLine(section) {
    const count = inheritCount(section);
    return format(
      count === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCountOne'
        : 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
      count === 1
        ? '{count} crafting system inherits this world default today.'
        : '{count} crafting systems inherit this world default today.',
      { count }
    );
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
   * The four breakage choices as RADIO CARDS rather than a segmented track.
   *
   * A SEGMENTED TRACK WAS THE WRONG CONTROL, and the design's picture is what says so: it
   * offers each choice as a card carrying a glyph, a bold name and the sentence explaining
   * what it does. A bare-label track asks a GM to already know which of `Unlimited uses`,
   * `Limited uses`, `Breakage chance` and `Dice expression` they want.
   *
   * `RadioCardGroup` is the shipped primitive for exactly this, and `tools/ToolBreakageTab`
   * already renders these same two groups through it at SYSTEM scope. Reusing it - and the
   * hint and glyph vocabulary it reads - is what stops world scope describing the same four
   * choices differently from the system editor a GM reaches from the row beside it.
   */
  const breakageModeOptions = $derived(
    BREAKAGE_CHOICES.map((mode) => ({
      value: mode,
      label: breakageModeLabel(mode),
      description: breakageModeDescription(mode),
      icon: {
        unlimited: 'fas fa-infinity',
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
      unlimited: text(
        'FABRICATE.Admin.Manager.Tools.BreakageUnlimitedHint',
        'It is never used up, so it never breaks.'
      ),
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

  /**
   * One on-break card's description.
   *
   * SIZED FOR THE CARD, which is a measured constraint rather than a stylistic preference. These
   * three sit in a 3-column grid inside a ~690px pane, so each has roughly a 22-character
   * measure; `Replace it with a managed Component that can participate in repair routes.` wrapped
   * to eight lines and made this group twice the height of the identical group above it, in the
   * same tab. The group above sets the length these have to match.
   *
   * The FULL sentence is not lost: it is what the resolved on-break rule states in the preview
   * column, where there is room for it.
   *
   * @param {string} mode
   * @returns {string}
   */
  function onBreakModeDescription(mode) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroyHint', 'Consumed and removed.'),
      flagBroken: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakFlagHint',
        'Flagged broken and renamed.'
      ),
      replaceWith: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakReplaceHint',
        'Swapped for a Component.'
      ),
    }[mode];
  }

  function breakageModeLabel(mode) {
    return {
      // THE EXACT STRING THE RAIL, THE ROW BADGE AND THE SUMMARY ALREADY PRINT for this state,
      // so the four surfaces read as one answer rather than as four opinions.
      unlimited: text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses'),
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
   * Stage a patch to one world-default section, preserving every field it already carries.
   *
   * SECTION VALUES ARE OPAQUE to the write path, so the merge happens here where the shape is
   * known, and `Save` stores whatever it is handed verbatim. REASSIGNED rather than mutated:
   * `scopedEntryDraft.js` returns a new object for a reason its own doc gives.
   *
   * @param {string} section
   * @param {object} patch
   * @returns {void}
   */
  function patchSection(section, patch) {
    const current =
      defaults[section] && typeof defaults[section] === 'object' ? defaults[section] : {};
    draft = withScopedEntryDefault(draft ?? persisted, section, { ...current, ...patch });
  }

  /**
   * Stage WHOLE sections from `ToolRequirementsTab`, which hands back a complete section value.
   *
   * `patchSection` above merges a partial into what is already stored; this does not, and the
   * difference is the tab's own contract: it computes `{...prerequisites, ...patch}` itself, so
   * merging again here would be harmless for an object and WRONG for `ids`, whose whole point is
   * that unticking the last box must leave an empty array rather than the previous one.
   *
   * @param {object} patch one or both of `{prerequisites, bonus}`.
   * @returns {void}
   */
  function stageRequirementSections(patch) {
    for (const [section, value] of Object.entries(patch ?? {})) {
      draft = withScopedEntryDefault(draft ?? persisted, section, value);
    }
  }

  /**
   * The world defaults read as a tool-shaped record for `ToolRequirementsTab`.
   *
   * The tab reads `tool.prerequisites` and `tool.bonus` and nothing else, so the world defaults
   * ARE the record from its point of view - which is what lets one component author the same two
   * sections at both scopes.
   */
  const requirementsTool = $derived({
    prerequisites: defaults.prerequisites ?? null,
    bonus: defaults.bonus ?? null,
  });

  /**
   * Whether this identity record actually names a source Item, read from the projection.
   *
   * `buildEntry` answers it beside the ONE list of source-link field names, so this never
   * restates `originItemUuid` / `registeredItemUuid` / `aliasItemUuids` and cannot go on
   * testing the old names after a rename.
   */
  const sourceLinked = $derived(entry?.hasSourceLink === true);

  // ONE SENTENCE, ONE PLACE. The header band and the linked-item card say the same thing
  // about the same record, so the page resolves it once and reports it up.
  const sourceSubline = $derived(
    sourceLinked
      ? text('FABRICATE.Admin.Manager.Scoped.Entry.LinkedItemSub', 'Linked game-world Item')
      : text('FABRICATE.Admin.Manager.Scoped.Entry.UnlinkedItemSub', 'No Item linked')
  );
  $effect(() => {
    onSublineChange(sourceSubline);
  });

  // ── THE WORLD MASTER SWITCH ────────────────────────────────────────────────────────────
  // A world-disabled Tool is off in EVERY crafting system that has it, whatever each of them
  // says, because `resolveScopedDefinition` ANDs the world flag with the per-system one. An
  // ABSENT flag reads as enabled, which is every record in every world that has never touched
  // the switch, so `!== false` is the read rather than `=== true`.
  const worldEnabled = $derived(entry?.worldEnabled !== false);
  const memberSystemCount = $derived(memberRows.filter((row) => row.member === true).length);

  // ── THE BREAKAGE VALUE, PER MODE ───────────────────────────────────────────────────────
  // The mode cards say WHICH rule applies; these say what the rule is SET TO. Without them a
  // world default reading `Breakage chance` is stuck at whatever `breakageChance` the record
  // happened to be seeded with, and the one number the mode exists to carry is unauthorable at
  // world scope.
  const breakMode = $derived(defaults.breakage?.mode ?? 'limitedUses');
  const breakFormula = $derived(String(defaults.breakage?.formula ?? ''));

  /**
   * WHICH OF THE FOUR the world default authors, resolved by the shared helper.
   *
   * `toolSpecific` IS PASSED UNCONDITIONALLY, and it is not a guess about the world authority:
   * `toolBreakageChoice` answers `breakable` / `immune` under `checkDriven`, and this card
   * offers the four MODE cards whatever the authority is - so handing it the live authority
   * would leave the group with a selected value none of its four options carries. The authority
   * band above the card is where that fact is stated on this screen.
   */
  const breakageChoice = $derived(
    toolBreakageChoice({ breakage: defaults.breakage ?? null }, 'toolSpecific')
  );

  /**
   * Author one of the four choices, as a WHOLE mode-and-value answer.
   *
   * The mode cards used to write `{ mode }` alone, which was right while the mode WAS the
   * answer and is wrong now that two of the four share `limitedUses`: picking `Limited uses`
   * over an unlimited record would have merged onto the `maxUses: null` already stored and
   * landed the GM straight back on the option they just left.
   *
   * So `unlimited` writes the null explicitly - the one control on this screen that can reach
   * it - and `limitedUses` SEEDS AT 1 rather than at null. Both are the rule
   * `ToolBreakageTab`'s `createBreakageConfigs` states at system scope, so one meaning has one
   * behaviour across the two scopes. The other two still patch the mode alone, which is what
   * preserves the value each was carrying across a switch.
   *
   * @param {string} choice one of {@link BREAKAGE_CHOICES}.
   * @returns {void}
   */
  function changeBreakageChoice(choice) {
    if (choice === 'unlimited') {
      patchSection('breakage', { mode: 'limitedUses', maxUses: null });
      return;
    }
    if (choice === 'limitedUses') {
      const current = Number(defaults.breakage?.maxUses);
      patchSection('breakage', {
        mode: 'limitedUses',
        maxUses: Number.isInteger(current) && current > 0 ? current : 1,
      });
      return;
    }
    patchSection('breakage', { mode: choice });
  }

  /**
   * Whether the authored dice expression can actually be ROLLED.
   *
   * `Roll.validate` IS NOT THIS TEST and would pass formulas that throw the moment a craft
   * evaluates them - `formulaRolls` carries the whole argument, and it is the same predicate
   * the crafting check's modifier resolver uses. It FAILS OPEN with no dice engine, so a
   * headless render never paints an authoring error over a formula a GM wrote against a real
   * Foundry.
   *
   * An EMPTY formula is not "invalid", it is UNSET: the mode has simply not been finished, and
   * the Validation tab is where an incomplete record is reported.
   */
  const formulaRollable = $derived(breakFormula.trim() === '' || formulaRolls(breakFormula));

  // ── THE BREAK-CHANCE BAND ──────────────────────────────────────────────────────────────
  // What the number MEANS, beside the number. The design states it as a coloured word on the
  // slider's own label line and runs the track through the same ramp; the screen had neither, so
  // a 5% and a 90% Tool were the same picture with a different digit in it.
  const chanceBand = $derived(toolBreakageChanceBand(defaults.breakage?.breakageChance ?? 0, text));

  // ── WHAT `Replace with component` NAMES, AND WHAT `Mark as broken` MENDS ────────────────
  // Both are world-scope answers over the WORLD component catalogue; see the props block for
  // why that is addressable here and what it does and does not promise a system that inherits.
  const replacementComponentId = $derived(
    String(defaults.onBreak?.replacementTarget?.componentId || '')
  );

  /**
   * The world repair SEED, read from the persisted record rather than the draft.
   *
   * `repairRequirements` IS NOT A BUFFERED SECTION and cannot be: `TOOL_SECTIONS` does not name
   * it, so `scopedEntryWrites` would refuse the key and a Save would drop the edit silently. It
   * is a SEED with its own action (`setWorldRepairRequirements`), and it therefore writes
   * IMMEDIATELY — which is the same rule every other non-section control on this screen follows,
   * for the same reason the file header gives: it acts through a different write path.
   *
   * @type {Array<object>}
   */
  const repairGroups = $derived(
    Array.isArray(entry?.defaults?.repairRequirements) ? entry.defaults.repairRequirements : []
  );

  /**
   * The game-world Item this record names, for the linked-item tile.
   *
   * REGISTERED FIRST, then ORIGIN, which is `toolSourceUuid`'s own precedence: a Tool that was
   * re-linked carries both, and the registered uuid is the one the resolver reads.
   */
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));

  /**
   * The linked game-world Item as it is NOW, resolved against the Item roster.
   *
   * The world entity carries a SNAPSHOT of the Item's name, art and description, taken when the
   * link was made. `toolSourceSnapshot` prefers the live Item and falls back to that snapshot, so
   * the card shows a renamed Item under its current name and still says something useful when the
   * roster has not loaded. It is the SAME projection the system Tool editor's card used, taken
   * with it rather than rewritten.
   */
  const source = $derived(toolSourceSnapshot(entity, worldItems));

  /**
   * Whether the linked uuid still resolves to a game-world Item.
   *
   * A link whose document has been deleted renders identically to a working one without this, and
   * `ItemDropZone`'s `missing` state is the shipped treatment for exactly that. An EMPTY roster is
   * not evidence of a broken link - it is a roster that has not loaded - so the test requires one.
   */
  const sourceMissing = $derived(
    sourceLinked && worldItems.length > 0 && !worldItems.some((item) => item?.uuid === sourceUuid)
  );

  /**
   * THE NAME THIS SCREEN SHOWS, and the ONE place the optional display label is resolved.
   *
   * The buffered value first, so the linked-item tile, the header band and every aria label
   * name the Tool the GM is editing rather than the one still on disk. Then the LINKED ITEM's
   * live name, which is what `Leave blank to use the linked Item name.` promises and what makes
   * the field genuinely optional. The record id last, which is all an unlinked, unnamed record
   * has.
   *
   * It reads `source` rather than the entity's own snapshot on purpose: the snapshot is the
   * Item as it was when the link was made, and a Tool whose Item has since been renamed would
   * otherwise inherit a name the Item no longer has.
   */
  /**
   * THE LINKED ITEM'S NAME, which is what a blank display label falls back to.
   *
   * TWO RUNGS, and the second is not optional. The live Item first, out of the roster the shell
   * publishes. Then the world record's OWN persisted snapshot, taken when the link was made -
   * because the roster is a Foundry read that is empty until the Items directory has loaded, and
   * a placeholder that vanishes for the first second of every visit is worse than one naming the
   * Item as it was. `toolSourceSnapshot` makes exactly this substitution for the description one
   * card above.
   *
   * IT IS NOT `source.name`, deliberately: that helper substitutes the literal `Unlinked Tool`
   * for a missing name, which is right for a tile and wrong for a fallback - a record with a
   * blank label and no loaded roster would take that string as its name everywhere on the
   * screen. This answers the empty string instead, and `entryName` falls through to the id.
   */
  const linkedItemName = $derived(
    sourceLinked
      ? String(
          worldItems.find((item) => item?.uuid === sourceUuid)?.name ?? entity?.name ?? ''
        ).trim()
      : ''
  );

  const entryName = $derived(
    String(identity.name ?? '').trim() || linkedItemName || String(entityId || '')
  );

  /**
   * Whether the selected breakage MODE has a usable VALUE behind it.
   *
   * A mode with no value is not a neutral default: `limitedUses` with no `maxUses` is an
   * unlimited Tool wearing a limited label, and `diceExpression` with a formula that throws
   * fails the whole craft at evaluate time with only a console error. Both are states the mode
   * cards alone cannot show, which is why this is a check rather than a hint.
   */
  const breakageValueStatus = $derived.by(() => {
    // AN AUTHORED ANSWER, NOT A MISSING ONE (issue 1373). `limitedUses` with a null `maxUses`
    // IS `Unlimited uses`, which every reading surface already prints - so reporting it as a
    // mode with nothing behind it made the Validation tab contradict the summary two tabs away
    // over the state a brand-new Tool opens in.
    if (breakageChoice === 'unlimited') return 'pass';
    if (breakMode === 'diceExpression') {
      if (breakFormula.trim() === '') return 'warn';
      return formulaRollable ? 'pass' : 'block';
    }
    if (breakMode === 'limitedUses') {
      const maxUses = Number(defaults.breakage?.maxUses);
      return Number.isInteger(maxUses) && maxUses > 0 ? 'pass' : 'warn';
    }
    return Number(defaults.breakage?.breakageChance) > 0 ? 'pass' : 'warn';
  });

  const breakageValueCheckTitle = $derived(
    breakageValueStatus === 'pass'
      ? text(
          'FABRICATE.Admin.Manager.Scoped.Entry.CheckBreakageValue',
          'The breakage mode has a value'
        )
      : text(
          'FABRICATE.Admin.Manager.Scoped.Entry.CheckBreakageValueMissing',
          'The breakage mode has no usable value'
        )
  );

  const breakageValueCheckDetail = $derived.by(() => {
    if (breakageValueStatus === 'pass') return '';
    if (breakMode === 'diceExpression' && breakFormula.trim() !== '') {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Entry.CheckBreakageFormulaDetail',
        'This expression parses but cannot be rolled, so every attempt that consults it fails.'
      );
    }
    return text(
      'FABRICATE.Admin.Manager.Scoped.Entry.CheckBreakageValueDetail',
      'Every system inheriting this default reads the mode with nothing behind it.'
    );
  });

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
      id: 'breakage-value',
      status: breakageValueStatus,
      title: breakageValueCheckTitle,
      detail: breakageValueCheckDetail,
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
   * THE WORLD DEFAULTS AS A TOOL-SHAPED RECORD, for the shared rail.
   *
   * `ToolBehaviorPreview` reads `name`, `img` and the four world-default sections and nothing
   * else, so the world defaults ARE the record from its point of view - the same argument
   * `requirementsTool` above already makes for `ToolRequirementsTab`. `name` is the BUFFERED
   * one, so the rail's identity block renames as the GM types rather than lagging the header
   * above it by a Save.
   */
  const previewTool = $derived({
    ...worldDefaultTool(),
    name: entryName,
    img: entity?.img || '',
    prerequisites: defaults.prerequisites ?? null,
    bonus: defaults.bonus ?? null,
  });

  /**
   * The previewable actor roster in the rail's own shape.
   *
   * The shell publishes `{id, name, img}` per actor and the shared rail reads `{uuid, name}`,
   * because at system scope the roster arrives already keyed by uuid. Mapping here rather than
   * widening the rail keeps ONE key name inside the component.
   */
  const previewActorOptions = $derived(
    (Array.isArray(previewActors) ? previewActors : [])
      .filter((actor) => actor && typeof actor.id === 'string' && actor.id)
      .map((actor) => ({ uuid: actor.id, name: actor.name }))
  );

  /** Every recipe and gathering task that names this Tool, in projection order. */
  const requiredByRows = $derived(Array.isArray(entry?.requiredBy) ? entry.requiredBy : []);

  /**
   * How many `Required for` rows the rail shows at a time.
   *
   * A 300px column, and a Tool a world really uses is named by dozens of records: the lab's
   * smithing hammer is required by ten. It was capped at five with `and 5 more` printed under
   * it, which is a sentence that states there is more and offers no way to reach it; the rail's
   * overflow idiom is a PAGER, and the shared preview draws the shipped one.
   *
   * FOUR, NOT FIVE, AND THE NUMBER IS MEASURED. This region is the LAST of four in a column
   * that scrolls inside a 900px window, and it now carries a pager as well as its rows: at five
   * the section overran the rail's own scroll box, which the View Lab reported as
   * `[data-tool-required-for] is clipped or extends outside [data-world-tool-entry-preview]`.
   * The catalogue inspector's roster window one route away states five because it has a taller
   * column and no three regions above it.
   *
   * @type {number}
   */
  const REQUIRED_FOR_PAGE_SIZE = 4;

  const pageTitle = $derived(text(TITLE_KEY, TITLE_FALLBACK));

  const deleteToken = $derived(`world-tool-delete:${entityId}`);

  // THE REACH, IN THE SENTENCE. `deleteEntity` sweeps the world record, its world defaults and
  // every membership record naming it, so the number of systems that lose the Tool is the one
  // fact a GM needs before the second press rather than after it.
  const deleteNote = $derived(
    format(
      memberSystemCount === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Entry.DeleteReachOne'
        : 'FABRICATE.Admin.Manager.Scoped.Entry.DeleteReach',
      memberSystemCount === 1
        ? 'Removes it from the world catalogue and from the 1 crafting system that has it.'
        : 'Removes it from the world catalogue and from the {count} crafting systems that have it.',
      { count: memberSystemCount }
    )
  );

  /**
   * Delete the world record, then leave. IMMEDIATE rather than buffered, for the reason the
   * file header gives: it ends the record the draft is about.
   *
   * The draft is cleared FIRST so the shell`s route-exit guard, which reads the live handle at
   * click time, cannot prompt to save a Tool that no longer exists.
   *
   * @returns {Promise<void>}
   */
  async function deleteTool() {
    draft = null;
    flushed = null;
    await actions?.deleteEntity?.(entityId);
    onBackToCatalogue();
  }

  // THE DESCRIPTOR THE HEADER DRAWS. A NEW OBJECT on every republish, never a mutated one: the
  // shell holds it in its own `$state` and Svelte 5 does not proxy a value that crossed a prop
  // boundary, so handing over a reference and editing it later would render nothing. Withdrawn
  // on unmount from an effect of its own, for the reason the identity report gives.
  $effect(() => {
    onDeleteChange({
      token: deleteToken,
      label: text('FABRICATE.Admin.Manager.Scoped.Entry.Delete', 'Delete'),
      armedLabel: text('FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirm', 'Delete for good?'),
      // THE REACH IS THE ACCESSIBLE NAME, which is where it can still be stated once the card
      // that used to carry it as a visible sentence is gone. `ArmedDangerButton` also exposes
      // the same string as the hover `title`, so it is reachable by mouse as well.
      idleAriaLabel: `${format(
        'FABRICATE.Admin.Manager.Scoped.Entry.DeleteAria',
        'Delete {name} from the world catalogue',
        { name: entryName }
      )} — ${deleteNote}`,
      armedAriaLabel: format(
        'FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirmAria',
        'Confirm deleting {name} from every system that has it',
        { name: entryName }
      ),
      run: deleteTool,
    });
  });
  $effect(() => () => onDeleteChange(null));
</script>

<!--
  THE RAIL IS A SIBLING OF THE TAB COLUMN, NOT OF THE TAB PANEL (issue 1373, maintainer round 2).

  The screen nested the rail INSIDE the tabbed body, so it began under the tab strip and ended
  wherever the panel did — a 300px column floating in the middle of the right-hand third with the
  page background above and below it. The design's editor is `grid-template-columns: minmax(0,1fr)
  326px` over the WHOLE workspace (`proto:2073`), with the left track holding the tab strip and
  its panel and the right track running the full height of the pane, from the bottom edge of the
  app header band down to the bottom of the window. The system Tool Rules editor one route away
  already draws it that way; only this screen did not.
-->
<main class="manager-main" data-scoped-page="world-tool-entry" aria-label={pageTitle}>
  <div class="manager-world-tool-entry-columns">
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

      <div
        class="manager-world-tool-entry-panel"
        data-scoped-entry={PAGE_ID}
        id={`world-tool-entry-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`world-tool-entry-tab-${activeTab}`}
        tabindex="-1"
        data-keyboard-focus="true"
      >
        {#if !entry}
          <p class="manager-muted" data-world-tool-entry-missing>
            <i class={PAGE_ICON} aria-hidden="true"></i>
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
          <!--
            THE LINKED-ITEM CARD IS A DROP TARGET, AND THIS IS THE ONLY SCOPE THAT MAY OWN ONE.

            It used to be a static tile printing a raw uuid, with no way to link, re-link or
            unlink anything - while the SYSTEM Tool editor carried the full card, so a crafting
            system could re-point which game-world Item a Tool IS. Identity is world-scoped, so
            the capability moved here and was REMOVED there; the component is the shipped
            `ItemDropZone`, taken with it rather than rewritten.

            IT IS IMMEDIATE, NOT BUFFERED, like every other action on this screen that acts on a
            DIFFERENT record: a drop resolves a Foundry document through the shell and rewrites
            the world entity's own source-link fields, which `IDENTITY_FIELDS` deliberately does
            not buffer because no control here could move them.
          -->
          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="linked-item">
            <!--
              THE CHIP STATES THE EXCEPTION, NOT THE RULE (issue 1373). A `Linked` pill on the
              card of a record whose whole premise is that it IS a game-world Item says nothing:
              the design draws the kicker alone. `No source item` is a real answer and keeps its
              pill, which is the identical split the catalogue row already makes for the same
              badge one route away.
            -->
            <div class="manager-world-tool-entry-card-heading">
              <p class="manager-kicker">
                {text('FABRICATE.Admin.Manager.Scoped.Entry.LinkedItem', 'Linked item')}
              </p>
              {#if !sourceLinked}
                <Chip tone="warning" icon="fas fa-link-slash">
                  {text('FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked', 'No source item')}
                </Chip>
              {/if}
            </div>
            <!--
              TWO LINES AND ONE BUTTON, which is what the design's tile carries. It had a raw
              `Item.sm-tool-hammer` on a third line and a Copy action beside Unlink: an id is not
              a fact this screen states anywhere else, and it displaced the hint that says what
              dropping onto the tile DOES. The uuid is still resolved here — `sourceMissing`
              reads it — it is simply not printed at a GM.
            -->
            <ItemDropZone
              kind="tool-source"
              item={sourceLinked ? source : null}
              state={sourceMissing ? 'missing' : 'linked'}
              title={entryName}
              hint={sourceLinked
                ? text(
                    'FABRICATE.Admin.Manager.Tools.Editor.SourceDropHint',
                    'Drop another Item here to replace the linked source.'
                  )
                : text(
                    'FABRICATE.Admin.Manager.Scoped.Entry.SourceEmptyDropHint',
                    'Drop an Item from the Items directory or a compendium to link this Tool.'
                  )}
              onDrop={onSourceDrop}
              unlinkLabel={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')}
              unlinkAttr="data-world-tool-entry-source-unlink"
              onUnlink={sourceLinked ? onUnlinkSource : null}
            />
            <!-- READ-ONLY, and it is the linked Item's OWN description rather than this
                 record's: the design shows what the game-world Item says about itself beside
                 the tile that names it. The world record's own description is authored on the
                 card below, where the other buffered identity field is. -->
            {#if sourceLinked}
              <div
                class="manager-world-tool-entry-source-description"
                data-world-tool-entry-source-description
              >
                {source.description ||
                  text(
                    'FABRICATE.Admin.Manager.NoDescriptionAdded',
                    'No description has been added.'
                  )}
              </div>
            {:else}
              <p class="manager-muted manager-world-tool-entry-hint" data-world-tool-entry-unlinked>
                {text(
                  'FABRICATE.Admin.Manager.Scoped.Entry.UnlinkedItemHint',
                  'No Item linked — the name below is all this record has, and its art comes from the linked Item, so it has none until you link one.'
                )}
              </p>
            {/if}
          </section>

          <!--
            ONE FIELD, WHICH IS WHAT THE DESIGN'S SECOND CARD HOLDS: a kicker, an input and a
            helper (issue 1373).

            IT HELD TWO. A bold `Description` caption and a three-row textarea sat under a
            heading that names only the first of them, and what the textarea edited was ALREADY
            on the tab — the card above states the linked Item's description in its own
            read-only box, so the same paragraph rendered twice, 150px apart, once editable and
            once not. The description a Tool has is the game-world Item's, which is the premise
            of the whole screen; a second authored copy of it is a second answer to a question
            that has one.

            `description` therefore leaves `IDENTITY_FIELDS` as well as this card. A buffered
            field with no control is a field `scopedEntryWrites` sends back unchanged on every
            Save.
          -->
          <!--
            AND THE FIELD IS OPTIONAL, WHICH IS THE AFFORDANCE IT LOST. The design draws it
            EMPTY with the linked Item's name as the placeholder, under `Leave blank to use the
            linked Item name.` — so a GM can see both that the field may be left alone and what
            answers for it when they do. The shipped copy said the opposite kind of thing: it
            described the field's REACH across crafting systems, which is a fact about the
            system editor's override rather than about this control, and nothing on the card
            said the field was optional at all.

            `entryName` below resolves the blank, and it is the ONE resolution: the header band,
            the breadcrumb crumb, the rail's identity block and the drop tile's title all read
            it, and the catalogue row reads the same fallback through the frame's `nameEntry`.
          -->
          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="display-label">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel', 'Display label')}
            </p>
            <!-- NO SECOND VISIBLE LABEL. The card's kicker already reads `Display label`, so a
                 `Name` caption under it names the same field twice; the accessible name goes
                 on the input instead, which is what a screen reader announces anyway. -->
            <Field as="div" data-world-tool-entry-field="name">
              <input
                type="text"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel',
                  'Display label'
                )}
                data-world-tool-entry-name
                placeholder={linkedItemName}
                value={String(identity.name ?? '')}
                oninput={(event) => setIdentity('name', event.currentTarget.value)}
              />
            </Field>
            <p class="manager-muted manager-world-tool-entry-hint" data-world-tool-entry-name-hint>
              {linkedItemName
                ? text(
                    'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelInheritHint',
                    'Leave blank to use the linked Item name.'
                  )
                : text(
                    'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelUnlinkedHint',
                    'No Item is linked, so this record has no name to fall back on.'
                  )}
            </p>
          </section>

          <!--
            THE WORLD MASTER SWITCH, and it is the design's third Overview card.

            It is NOT the per-system toggle the catalogue inspector's membership rows carry.
            World off wins: `resolveScopedDefinition` ANDs this flag with each system's own, so
            a world-disabled Tool is off everywhere and no per-system write can bring it back.

            THE MEMBER COUNT IS STATED BESIDE IT, BEFORE THE CLICK. A GM turning this off is
            silently switching a Tool off in every system that has adopted it, and every recipe
            in those systems that requires it stops being craftable. The switch cannot state
            that consequence AFTER the fact - there is no confirmation step on a world-scope
            write, because every other field on this screen persists on change too - so the
            number a GM needs is on screen before they reach for it.
          -->
          {#if scope?.worldEnableable}
            <section
              class="manager-world-tool-entry-card manager-world-tool-entry-switch"
              data-world-tool-entry-card="enabled"
            >
              <div class="manager-world-tool-entry-switch-copy">
                <strong>{text('FABRICATE.Admin.Manager.Tools.WorldEnabled', 'Tool enabled')}</strong
                >
                <p class="manager-muted">
                  {text(
                    'FABRICATE.Admin.Manager.Tools.WorldEnabledHint',
                    'Recipes can require this Tool while it is enabled. Systems may still disable it for themselves.'
                  )}
                </p>
              </div>
              <!-- ONE SENTENCE, AND NO CAPTION BESIDE THE PILL (issue 1373).
                   The design's card is a title, one line and a bare switch. This carried a THIRD
                   sentence restating the reach as a count and an `On` word printed next to a
                   control whose whole job is to show its own position — a switch that says `On`
                   beside itself is the state stated twice, and the count restated a fact the
                   line above it already makes ("Systems may still disable it for themselves").

                   THE REACH IS NOT LOST: it is the switch's accessible name, which is where a
                   consequence belongs on a control that has one. `ariaLabel` is passed for that
                   reason — the visible label is gone, so the pill needs a name of its own. -->
              <StatusToggle
                on={worldEnabled}
                ariaLabel={format(
                  memberSystemCount === 1
                    ? 'FABRICATE.Admin.Manager.Tools.WorldEnabledReachOne'
                    : 'FABRICATE.Admin.Manager.Tools.WorldEnabledReach',
                  memberSystemCount === 1
                    ? '{count} crafting system has this Tool and loses it while this is off.'
                    : '{count} crafting systems have this Tool and lose it while this is off.',
                  { count: memberSystemCount }
                )}
                data-world-tool-entry-enabled={worldEnabled ? 'on' : 'off'}
                onclick={() => actions?.setWorldEnabled?.(entityId, !worldEnabled)}
              />
            </section>
          {/if}

          <!--
            DELETE IS NOT A CARD ON THIS TAB. It is `Back to tools · Delete · Save tool` in the
            header band, which is where the design draws it and which this page reports the
            action descriptor for; see `onDeleteChange` in the props block.

            THE TWO SCOPES HAD SWAPPED THEIR DESTRUCTIVE TREATMENTS. The danger-CARD idiom — a
            glyph, a reach sentence and an armed button in a bordered row — is the SYSTEM Tool
            rules editor's `Stop using this Tool here`, and that screen has it. This screen had
            the card and no header button, so a GM moving between the two met the same verb in
            two places and neither in the place the other put it.
          -->
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
          <!-- IT IS THE DESIGN'S TINTED INFO BAND (`proto:2114`), not a neutral card with an
               accent edge. A maintainer ruling in issue 1373's second round took the design over
               the earlier reduction; the scoped rule for `.manager-world-tool-entry-mode` carries
               the ruling and the values it restores. It still sits INSIDE the Breakage tab rather
               than above the tab strip, which is the part of that revision the ruling leaves
               standing: the band conditions the control under it and belongs beside it. -->
          <div
            class="manager-world-tool-entry-card manager-world-tool-entry-mode"
            data-world-tool-entry-break-mode
          >
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
            <!-- FOUR CARDS ON TWO ROWS, not three on one. `columns={2}` is the system editor's
                 own figure for the identical set, so the two scopes lay the same four choices out
                 the same way. -->
            <RadioCardGroup
              options={breakageModeOptions}
              selectedValue={breakageChoice}
              groupName="world-tool-breakage-mode"
              columns={2}
              legend={sectionLabel('breakage')}
              dataGroup="world-tool-breakage-mode"
              optionDataAttr="data-world-tool-entry-breakage-mode"
              onChange={changeBreakageChoice}
            />
            <!--
              THE VALUE EDITOR FOR THE SELECTED MODE, one per mode, which the screen had none of.

              The mode cards above used to author `breakage.mode` and nothing else, so a world
              default reading `Breakage chance` was stuck at whatever `breakageChance` it
              happened to be seeded with and a GM had no way to move it. Each control writes into
              the SAME section object as the mode - `patchSection` merges - so switching modes
              never erases the value the other mode was carrying.

              The controls are the SHIPPED ones the system Tool Rules editor already renders for
              the same modes, so one meaning has one control across the two scopes.
            -->
            <!-- `unlimited` CONFIGURES NOTHING, so the inset is absent rather than empty: an
                 empty one draws a bordered panel with a padding-height void in it. The system
                 editor drops its divider on the same branch for the same reason. -->
            {#if breakageChoice !== 'unlimited'}
              <div
                class="manager-world-tool-entry-break-value"
                data-world-tool-entry-breakage-value
              >
                {#if breakageChoice === 'limitedUses'}
                  <div class="manager-world-tool-entry-field-row">
                    <div class="manager-world-tool-entry-field-copy">
                      <!-- NOT AN EYEBROW, AND THE DESIGN IS EXPLICIT ABOUT IT (issue 1373).
                           `proto:2134` states this label as `600 11.5px var(--sans)` in
                           `--text` - a sentence-case title over its own note - where every
                           actual eyebrow on this screen is `700 8.5px` tracked `.11em` in
                           `--subtle` (`proto:2121`, `proto:2160`). Wearing `manager-kicker`
                           made it uppercase micro-copy, so the value editor's own heading read
                           quieter than the card heading three lines above it. The class is
                           REMOVED rather than resized: this is a different kind of label, not
                           an eyebrow at the wrong size. -->
                      <span class="manager-world-tool-entry-field-title"
                        >{text(
                          'FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopy',
                          'Uses per copy'
                        )}</span
                      >
                      <small class="manager-muted"
                        >{text(
                          'FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopyHint',
                          'A fresh copy starts with this many uses.'
                        )}</small
                      >
                    </div>
                    <!-- NO `?? 1` FALLBACK, and that is the whole of issue 1373's world-scope
                       data-loss defect. This block renders only while the CHOICE is
                       `limitedUses`, which is exactly the case a non-null `maxUses` defines,
                       so the fallback that used to sit here could only ever fire for the
                       UNLIMITED state - and drew it as `1` against a `min={1}` stepper with no
                       reachable value that put the null back. `Unlimited uses` is a CARD now,
                       so the control that restores the null is the one that authors it. -->
                    <Stepper
                      value={defaults.breakage?.maxUses}
                      min={1}
                      {...stepperLabels(
                        text('FABRICATE.Admin.Manager.Tools.BreakageMaxUses', 'Maximum uses')
                      )}
                      inputProps={{ 'data-world-tool-entry-max-uses': '' }}
                      onChange={(maxUses) => patchSection('breakage', { maxUses })}
                    />
                  </div>
                {:else if breakageChoice === 'breakageChance'}
                  <div class="manager-world-tool-entry-chance-head">
                    <div class="manager-world-tool-entry-field-copy">
                      <!-- NOT AN EYEBROW: `proto:2145` states the same `600 11.5px` /
                           `--text` title the uses label above takes, for the same reason. -->
                      <span class="manager-world-tool-entry-field-title"
                        >{text(
                          'FABRICATE.Admin.Manager.Tools.BreakageChancePerUse',
                          'Break chance per use'
                        )}</span
                      >
                      <small class="manager-muted"
                        >{text(
                          'FABRICATE.Admin.Manager.Tools.BreakageChanceControlHint',
                          'Each time the Tool is used, this percentage is its chance to break.'
                        )}</small
                      >
                    </div>
                    <!-- THE PLAIN-LANGUAGE BAND (issue 1373, maintainer round 2). `5%` is a
                       quantity; `Rarely breaks` is the decision a GM was actually making, and
                       the design states both. Its five cuts are `proto:4618`'s. -->
                    <Chip tone={chanceBand.tone} data-world-tool-entry-chance-band={chanceBand.tone}
                      >{chanceBand.label}</Chip
                    >
                  </div>
                  <!--
                  THE TRACK RUNS THE RAMP, AND AN EARLIER ROUND WAS WRONG TO REMOVE IT (issue
                  1373, maintainer round 2).

                  That round's note said "the design uses a gradient track nowhere, at either
                  scope", reasoning from the design's FRAMES. The design's own markup says
                  otherwise: `proto:491` styles this exact control with a four-stop horizontal
                  ramp, green through gold and amber to red, at 0%, 38%, 68% and 100%. Neither
                  its CSS function name nor its stop values are quoted here — the flat-style
                  contract greps for the first and the colour contract for the second, in
                  comments as well as code. It is the same
                  ramp the SYSTEM editor one route away already renders, through the shipped
                  `--fab-tool-breakage-chance-track-gradient` — so what shipped was one control
                  wearing two treatments at two scopes.

                  NO NEW TOKENS. The gradient token and `toolBreakageChanceColor` are both
                  already published and both resolve through `--fab-success` / `--fab-warning` /
                  `--fab-badge-gold` / `--fab-danger`, so all seven themes keep their own ramp.
                -->
                  <ChanceSlider
                    value={defaults.breakage?.breakageChance ?? 0}
                    numberLabel={text(
                      'FABRICATE.Admin.Manager.Tools.BreakageChancePercent',
                      'Break chance percent'
                    )}
                    rangeLabel={text(
                      'FABRICATE.Admin.Manager.Tools.BreakageChance',
                      'Breakage chance'
                    )}
                    resolveColor={toolBreakageChanceColor}
                    trackGradient="var(--fab-tool-breakage-chance-track-gradient)"
                    controlClass="manager-tool-breakage-chance-control"
                    numberInputProps={{ 'data-world-tool-entry-breakage-chance': '' }}
                    rangeInputProps={{ 'data-world-tool-entry-breakage-chance-range': '' }}
                    onChange={(breakageChance) => patchSection('breakage', { breakageChance })}
                  />
                {:else}
                  <div class="manager-world-tool-entry-field-row">
                    <Field as="label" class="manager-world-tool-entry-formula">
                      <span class="manager-kicker"
                        >{text('FABRICATE.Admin.Manager.Tools.BreakageFormula', 'Formula')}</span
                      >
                      <input
                        type="text"
                        data-world-tool-entry-formula
                        aria-invalid={formulaRollable ? undefined : 'true'}
                        value={breakFormula}
                        oninput={(event) =>
                          patchSection('breakage', { formula: event.currentTarget.value })}
                      />
                    </Field>
                    <div class="manager-world-tool-entry-field-copy">
                      <span class="manager-kicker"
                        >{text(
                          'FABRICATE.Admin.Manager.Tools.BreakageThreshold',
                          'Break below'
                        )}</span
                      >
                      <Stepper
                        value={defaults.breakage?.threshold ?? 0}
                        step={1}
                        {...stepperLabels(
                          text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below')
                        )}
                        inputProps={{ 'data-world-tool-entry-threshold': '' }}
                        onChange={(threshold) => patchSection('breakage', { threshold })}
                      />
                    </div>
                  </div>
                  <!-- ROLLED, NOT PARSED. `Roll.validate` returns true for expressions that throw
                     the moment a craft evaluates them, so the guard evaluates the formula with
                     every term maximized and requires a finite total. It FAILS OPEN with no
                     dice engine, so nothing red appears in a headless render. -->
                  {#if !formulaRollable}
                    <p class="manager-muted is-danger" data-world-tool-entry-formula-error>
                      <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                      {text(
                        'FABRICATE.Admin.Manager.Tools.BreakageFormulaUnrollable',
                        'This expression parses but cannot be rolled, so every attempt that consults it fails.'
                      )}
                    </p>
                  {/if}
                {/if}
              </div>
            {/if}
            <!-- THE VALUE, not the mode. The card above already names the mode; this states
                 what it currently resolves to, which no card can. The on-break section has no
                 counterpart line because its mode IS its whole answer, and a line repeating
                 the selected card's own label under it said nothing. -->
            <p class="manager-muted" data-world-tool-entry-breakage-summary>
              {breakageSummaryLabel}
            </p>
            <p class="manager-muted" data-world-tool-entry-inherit-count="breakage">
              {inheritCountLine('breakage')}
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
            <!--
              THE MODE'S OWN CONTROL, WHICH THE SCREEN HAD FOR NEITHER MODE (issue 1373,
              maintainer round 2).

              `Replace with component` and `Mark as broken` are the two on-break actions that
              take an argument, and world scope could author neither: a GM could select
              `Replace with component` and never say WITH WHAT, and a marked-broken Tool's
              repair route — the seed every system copies on adoption — had no authoring surface
              at all, so `setWorldRepairRequirements` existed and nothing on any screen called it.

              BOTH NAME WORLD RECORDS. See the props block for what `componentOptions` is and
              what a world default naming one does and does not promise a system that inherits.
            -->
            {#if (defaults.onBreak?.mode ?? 'destroy') === 'replaceWith'}
              <ToolReplacementTarget
                {componentOptions}
                componentId={replacementComponentId}
                sourceText={text(
                  'FABRICATE.Admin.Manager.Tools.Editor.ReplacementSourceWorld',
                  'A Component in the world catalogue'
                )}
                onChoose={(componentId) =>
                  patchSection('onBreak', {
                    replacementTarget: { type: 'component', componentId },
                  })}
                onClear={() => patchSection('onBreak', { replacementTarget: null })}
              />
            {:else if (defaults.onBreak?.mode ?? 'destroy') === 'flagBroken'}
              <!--
                THE REPAIR SEED, AUTHORED WHERE IT IS STORED.

                An earlier round removed a `REPAIR MATERIALS` card from this screen, and it was
                right to: that card stated a bare group COUNT and offered `Clear the seed`, which
                is a write over data it had just said it could not show. The rule it left behind
                stands. What changes is the second half of the premise — world scope CAN address
                Components now — so the answer is to SHOW the groups rather than to keep the
                count and drop the control.

                IT IS THE SAME COMPONENT THE SYSTEM EDITOR MOUNTS, on the Requirements tab's own
                argument: two scopes authoring one shape through two implementations is how a
                persisted record and its editors drift.

                AND THE WRITE IS IMMEDIATE, not buffered: `repairRequirements` is not in
                `TOOL_SECTIONS`, so `scopedEntryWrites` would refuse the key and a Save would
                drop the edit without saying so. `setWorldRepairRequirements` is its own action
                for exactly that reason.
              -->
              <ToolRepairRequirements
                groups={repairGroups}
                {componentOptions}
                {itemTags}
                {essenceOptions}
                {currencyUnits}
                currencyEnabled={true}
                onChange={(groups) => actions?.setWorldRepairRequirements?.(entityId, groups)}
              />
              <p
                class="manager-muted manager-world-tool-entry-hint"
                data-world-tool-entry-repair-note
              >
                {text(
                  'FABRICATE.Admin.Manager.Tools.Editor.RepairSeedNote',
                  'This is the seed. It is copied into a crafting system the moment that system adopts this Tool, and edited there afterwards — so a change here reaches the next system to adopt it, not the ones that already have it.'
                )}
              </p>
            {/if}
            <p class="manager-muted" data-world-tool-entry-inherit-count="onBreak">
              {inheritCountLine('onBreak')}
            </p>
          </section>

          <!--
            THERE IS STILL NO STANDALONE `REPAIR MATERIALS` CARD HERE, and there should not be:
            the repair route belongs INSIDE the on-break card, under the one mode it configures.
            See the file header for what changed and why the rule the removed card recorded is
            satisfied rather than reversed.
          -->
        {:else if activeTab === 'requirements'}
          <!--
            THE SAME COMPONENT THE SYSTEM EDITOR MOUNTS. `prerequisites` and `bonus` became world
            defaults at `1.31.0`, so the two scopes author the SAME two sections; a second
            near-identical panel here would be one meaning with two shapes, and SonarCloud counts
            the duplication besides.

            WHAT IT NEEDS IS A TOOL-SHAPED RECORD, which the world defaults already are from its
            point of view: it reads `tool.prerequisites` and `tool.bonus` and nothing else.
          -->
          <!--
            NO WRAPPER CARD (issue 1373, maintainer round 2). `ToolRequirementsTab` draws a
            `ToolInheritCard` PER SECTION, so enclosing it put a bordered, filled card inside
            another bordered, filled card with a third border on each section inside that — three
            nested edges where the design draws one (`proto:2321`), and every inner card's
            padding compounded with the wrapper's.

            THE TWO REACH SENTENCES MOVED INSIDE THE SECTIONS THEY COUNT. They were stacked at
            the foot of the wrapper, identical to the character, under two cards — which reads as
            the same sentence printed twice rather than as one fact about prerequisites and one
            about the bonus. `sectionNotes` puts each in its own card.

            `headingStyle` IS THE ONE SCOPE DIFFERENCE, and it is a treatment rather than a
            behaviour: every other card on this screen heads itself with an uppercase kicker, and
            the system editor's design frame heads its sections in sentence-case display type.
          -->
          <div
            class="manager-world-tool-entry-requirements"
            data-world-tool-entry-card="requirements"
          >
            <ToolRequirementsTab
              tool={requirementsTool}
              headingStyle="kicker"
              {prerequisiteOptions}
              {modifierOptions}
              sectionNotes={{
                prerequisites: inheritCountLine('prerequisites'),
                bonus: inheritCountLine('bonus'),
              }}
              onPatch={stageRequirementSections}
            />
          </div>
        {:else}
          <!-- NO HEADING AND NO INTRO, WHICH IS THE OPT-OUT THIS PR ADDED AND WORLD SCOPE DID
               NOT TAKE (issue 1373). `proto:2372` opens the Validation tab on the summary head
               and its counts; there is no title above it and no explanatory line. Passing both
               drew a heading the design does not have AND restated the tab label a GM had just
               clicked, directly under it. `tools/ToolValidationTab` passes neither for the same
               reason, so the two scopes now open this tab the same way.

               OMITTED RATHER THAN PASSED EMPTY: `ScopedValidationTab` defaults both to `''` and
               forwards them, which is what overrides `EditorValidationSurface`'s own
               `title = 'Validation'` default. -->
          <ScopedValidationTab
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
    </div>

    <!--
      THE RAIL IS THE SHARED `ToolBehaviorPreview`, NOT A SECOND ONE (issue 1373).

        This screen carried a FORK of it: the same five regions, re-implemented, and each
        re-implementation lost the treatment the shared component already had. The player tile
        was a 64px thumbnail with an unbacked badge and no name caption instead of a 110px
        bordered tile on a card; `Show as broken` was a bare `<input type="checkbox">` with its
        label on the wrong side instead of the shipped `StatusToggle` pill; the prerequisite-gate
        line was a plain paragraph instead of the dashed `EmptyState` ghost panel; the
        `Required for` rows had no glyph tile and no emphasis; and the usability card was
        recoloured to success-green over a sentence that is a statement of fact, not a pass
        state.

        Adopting it closes all five at once, and the three places world scope genuinely differs
        are OPT-IN props on the shared component rather than a scope test inside it.

        `contextText` IS THE RECORD`S OWN SUBLINE, resolved once on this page and reported to the
        header band as well: the rail used to print `In 1 crafting systems`, an unpluralised
        count of a fact the catalogue answers, where the design restates what the record IS.

        THE RULES KICKER IS THE SHARED ONE, `EFFECTIVE RULES`. It read `THE WORLD DEFAULTS,
        RESOLVED` here, which is the same four facts under a second name one route away.

        `managedItems` IS THE WORLD COMPONENT ROSTER, passed for exactly one reason: the player
        tile draws the REPLACEMENT Component's art when `Show as broken` is flipped on a
        replace-mode Tool (issue 1373, maintainer round 2). It does not re-point the record's own
        identity — `linkedComponentFor` short-circuits on an absent `tool.componentId`, and
        `previewTool` carries none, because a world Tool's art is the linked game-world Item's
        and arrives as `img`.
      -->
    <ToolBehaviorPreview
      classPrefix="manager-scoped-preview"
      hookAttribute="data-world-tool-entry-preview"
      tool={previewTool}
      managedItems={componentOptions}
      authority={worldAuthority || DEFAULT_BREAK_MODE}
      contextText={sourceSubline}
      actorOptions={previewActorOptions}
      {prerequisiteOptions}
      getActorRollData={(uuid) => getPreviewRollData(uuid)}
      requiredFor={requiredByRows}
      requiredForPageSize={REQUIRED_FOR_PAGE_SIZE}
      requiredForEmptyText={text(
        'FABRICATE.Admin.Manager.Tools.PreviewPanel.RequiredForNone',
        'Nothing requires this Tool yet.'
      )}
    />
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

     ONE TRACK NOW. It was three, then two; the read-only break-mode band moved INSIDE the
     Breakage tab and the entity header moved into the shell's own band beside `Save tool`, so
     the tabbed body is the whole of this screen`s vertical structure. The rule stays rather
     than being deleted back to the shipped one, because the shipped one is what an earlier
     revision of this page was already fighting and the element selector is what settles it. */
  main.manager-main[data-scoped-page='world-tool-entry'] {
    grid-template-rows: minmax(0, 1fr);
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
  /* ── AND ITS BOX IS MEASURED, NOT ESTIMATED (issue 1373, maintainer round 2) ────────────
     `proto:2086`: `padding: 15px; border: 1px solid var(--border); border-radius: 12px`. 15
     rounds up to `--fab-space-4`; the radius is a token-free geometry value and is the design's
     12 exactly. The card shipped at `--fab-space-3` — 12px, a quarter tighter than the design
     on every one of the eight cards this screen stacks.

     THE GAP IS `--fab-space-3` AND IT IS A COMPROMISE THAT IS WORTH NAMING. The design spaces a
     card's kicker from its body by 9px and its body blocks from each other by 11px; one flex
     `gap` cannot be both, and neither 9 nor 11 is on the 4px scale. 12 is the nearer of the two
     and the one that governs the taller relationship. */
  .manager-world-tool-entry-card {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding: var(--fab-space-4);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    background: var(--fab-bg-1);
    min-width: 0;
  }

  /* The break-chance card's label line and the band that reads it, on one row — `proto:2144`
     (`display: flex; align-items: center; gap: 12px`), where 12 is `--fab-space-3` exactly. */
  .manager-world-tool-entry-chance-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-world-tool-entry-chance-head > .manager-world-tool-entry-field-copy {
    flex: 1 1 auto;
  }

  /* THE REQUIREMENTS TAB IS NOT A CARD, and this is what it is instead: a plain stack whose
     children are `ToolInheritCard`s. The gap is the panel's own between-card rhythm, restated
     because the tab's two sections are siblings of each other rather than of the panel. */
  .manager-world-tool-entry-requirements {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-width: 0;
  }

  .manager-world-tool-entry-hint {
    margin: 0;
    font-size: 0.62rem;
  }

  /* The card kicker and its state chip on one line, which is what puts the `Linked` pill beside
     the heading rather than above a drop zone that already carries a tile. */
  .manager-world-tool-entry-card-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* ── THE LINKED TILE IS SOLID AND FILLED; DASHED MEANS UNLINKED ────────────────────
     (issue 1373, maintainer round 2, E1.) The shipped `ItemDropZone` paints ONE box for both of
     its faces — a dashed edge on a faint overlay — so a healthy link wore the design's broken
     state. `proto:2089` draws the LINKED tile `display: flex; align-items: center; gap: 12px;
     padding: 12px 13px; border: 1px solid var(--border); border-radius: 11px; background:
     var(--surface-soft)`, and reserves the dashed edge for the UNLINKED prompt at `proto:2098`,
     where it is `1.5px dashed var(--danger-border)` with a danger-tinted glyph and sentence.

     `:global()` BECAUSE THE PRIMITIVE WRITES THIS MARKUP. `ItemDropZone` never carries this
     file's scoping hash, so the scoped form would compile to a selector matching nothing — the
     trap this epic has hit repeatedly. It is anchored on the card THIS file writes, so the reach
     is the world Tool entry's own source tile and no other consumer of the primitive: the
     recipe item, essence, check-macro and tool-create zones are untouched, which is why the
     primitive itself is not edited.

     Specificity is (0,6,0) at its deepest against the sheet's (0,2,0), so nothing here depends
     on injection order.

     12 and 13 both round to `--fab-space-3` on the 4px scale; the 11px radius is a geometry
     value with no token and is the design's exactly. `min-height` drops to 0 because the
     primitive's 70px floor is taller than the design's 12 + 44 + 12 tile and left the name
     floating above centre. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    > :global(.manager-item-drop-zone.is-linked) {
    gap: var(--fab-space-3);
    min-height: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-surface-soft);
  }

  /* THE LINKED ITEM'S NAME IS SET IN THE DISPLAY SERIF. `proto:2091` states
     `font: 600 13.5px var(--serif)` for it and the screen drew it in the app sans at the UA's
     bare-`<strong>` 700, because nothing declared a face, a size or a weight on that element -
     not the primitive's scoped block, not the global sheet.

     ROUTE-SCOPED FROM HERE RATHER THAN ADDED TO `ItemDropZone`. The primitive is shared with the
     recipe-item, essence and check-macro drop zones and none of those screens asked for a serif
     name, so the face belongs to THIS card rather than to the tile everywhere it is used.

     AND SCOPED HERE RATHER THAN IN `styles/fabricate.css`. `module.json` gives that sheet no
     explicit `layer`, so Foundry imports it at layer `modules` while Svelte injects scoped CSS
     UNLAYERED - and an unlayered declaration beats a layered one at any specificity
     (`tests/view-lab/cascade.css`). Nothing currently declares either property on this element,
     so this is an addition rather than an override; written in the scoped block anyway so it
     stays correct when that stops being true.

     0.84rem, NOT `13.5px`: this sheet's rem basis is 16px, and the design's px values are
     translated to the rem scale here exactly as the unlink control below translates its 11px.
     Measured before the change at 14px/700/Signika. Keyed on `.is-linked` because the UNLINKED
     prompt is `proto:2098`, which states `font: 500 11px var(--sans)` - a face of its own, and a
     sans one. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone.is-linked .manager-item-drop-zone-copy strong) {
    font-family: var(--fab-font-serif);
    font-size: 0.84rem;
    font-weight: 600;
  }

  /* THE UNLINKED FACE KEEPS THE DASH AND GAINS THE DANGER INK. `2px` rather than the design's
     1.5: a fractional border rounds per device pixel ratio and reads as a hairline at 1x, which
     is the same call `ToolReplacementTarget`'s empty drop zone already made, so the two dashed
     prompts on this screen are one weight. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    > :global(.manager-item-drop-zone:not(.is-linked)) {
    border: 2px dashed var(--fab-danger-border);
    background: transparent;
  }

  /* A BARE DANGER GLYPH, NOT A FILLED TILE (`proto:2099`). The primitive's 44px `--fab-bg-3`
     square is the mount for a linked Item's ART; with no Item there is no art, and the square
     reads as a picture that failed to load. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone:not(.is-linked) .manager-item-drop-zone-icon) {
    color: var(--fab-danger-text);
    background: transparent;
  }

  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone:not(.is-linked) .manager-item-drop-zone-copy strong),
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone:not(.is-linked) .manager-item-drop-zone-copy small) {
    color: var(--fab-danger-text);
  }

  /* THE UNLINK IS A DESTRUCTIVE CONTROL AND IS DRAWN AS ONE. `proto:2093` states
     `border: 1px solid var(--danger-border); background: var(--danger-soft); color:
     var(--danger-text); border-radius: 8px; font-size: 11px`, over a 32px box. The shipped
     `IconButton.is-danger` carries the danger EDGE and INK but leaves the resting fill neutral,
     so the one destructive action on the Overview tab read as an ordinary icon button.

     30px, NOT the design's 32: `openspec/specs/design-system/spec.md` retires 32 from the
     control-height ladder, and `control-height-ladder.test.js` fails on it. 30 is the adjacent
     rung and is also what the replacement tile's unlink takes, so the screen's two unlink
     controls are one size. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone-actions .manager-icon-button) {
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--fab-danger-soft);
    font-size: 0.68rem;
  }

  /* THE LINKED ITEM'S OWN DESCRIPTION, in a bordered read-only box - the design's own treatment,
     and the same one `ToolOverviewTab` used at system scope before this capability moved here.
     It is a surface rather than a paragraph because it states another document's text, and the
     edge is what says a GM cannot type in it.

     MEASURED AGAINST `proto:2094` (issue 1373, round 2): `padding: 12px 13px; background:
     var(--bg1); border: 1px solid var(--border); border-radius: 10px; font: 400 11px/1.55
     var(--sans); color: var(--muted)`. The padding was `--fab-space-2` — 8px against the
     design's 12 — and the leading was 1.4 against 1.55. The rung is `--fab-bg-0`: this theme's
     ramp is shifted one step against the design's, whose `--bg1` is our `--fab-bg-0`, so the box
     sits one rung BELOW the card rather than on the same `--fab-surface-soft` as the tile above
     it, which is what makes the two boxes read as two different kinds of thing. */
  .manager-world-tool-entry-source-description {
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-bg-0);
    color: var(--fab-text-muted);
    font-size: 0.68rem;
    line-height: 1.55;
    min-width: 0;
    overflow-wrap: break-word;
  }

  /* THE MASTER-SWITCH CARD IS A ROW, not the column its siblings are: its copy and its one
     control sit side by side, which is what the design draws and what stops a two-line
     explanation pushing a 20px toggle onto a line of its own. It reuses the card box above
     and overrides only the axis. */
  .manager-world-tool-entry-switch {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-world-tool-entry-switch-copy {
    display: flex;
    flex: 1 1 14rem;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-world-tool-entry-switch-copy strong {
    color: var(--fab-text);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .manager-world-tool-entry-switch-copy p {
    margin: 0;
    font-size: 0.62rem;
  }

  /* THE BREAKAGE VALUE EDITORS. One column, because only ONE of the three ever renders and a
     grid sized for the widest of them would leave the other two floating in a track they do
     not fill.

     AND IT IS AN INSET PANEL, WHICH IT WAS NOT (issue 1373, maintainer round 2). The design
     draws each of the three value editors on its own surface inside the mode card —
     `proto:2133`, `proto:2143` and `proto:2159` all state `padding: 11px 13px; border: 1px
     solid var(--border); border-radius: 10px` on a rung below the card. Ours floated the label,
     the number field and the slider straight on the card, so the control that CONFIGURES the
     selected mode read as more copy under the cards that choose it.

     `11` and `13` both round to `--fab-space-3`. The rung is `--fab-bg-0`: this theme's ramp is
     shifted one step against the design's, whose `--bg1` inset is `--fab-bg-0` here and whose
     `--bg2` card is the `--fab-bg-1` the card above already uses. */
  .manager-world-tool-entry-break-value {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-bg-0);
    min-width: 0;
  }

  /* A label cell and its control on one line, wrapping to two under a narrow pane rather than
     letting a stepper shrink below its own digits. */
  .manager-world-tool-entry-field-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* NO `flex` SHORTHAND HERE, and that is the whole bug this rule used to carry. The copy cell
     appears in TWO contexts: beside a control in `.manager-world-tool-entry-field-row`, which
     is a ROW, and directly above one in the break-value column. `flex: 1 1 10rem` in a COLUMN
     container makes the basis a HEIGHT, so the two-line caption above the break-chance slider
     grew to 160px and opened a 150px void between the label and the control it labels.
     The basis therefore belongs to the ROW context alone. */
  .manager-world-tool-entry-field-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-world-tool-entry-field-row > .manager-world-tool-entry-field-copy {
    flex: 1 1 10rem;
  }

  .manager-world-tool-entry-field-copy small {
    font-size: 0.6rem;
  }

  /* THE VALUE EDITOR'S OWN TITLE, WHICH IS NOT AN EYEBROW (issue 1373). `proto:2134` and
     `proto:2145` both state `font: 600 11.5px var(--sans); color: var(--text)` for these two
     labels - a sentence-case title, the same type the mode cards beside them use for their own
     names - against the tracked uppercase `--subtle` micro-label every real eyebrow on this
     screen wears. 11.5px is `0.72rem` at the manager's 16px root.

     It is a class rather than a bare element rule because `.manager-world-tool-entry-field-copy`
     also holds the `Formula` and `Break below` cells, and `proto:2160` and `proto:2164` say
     those two ARE eyebrows - so the cell cannot decide the treatment for its children. */
  .manager-world-tool-entry-field-title {
    color: var(--fab-text);
    font-size: 0.72rem;
    font-weight: 600;
    min-width: 0;
  }

  /* `:global()` because `Field` (issue 1428) writes this element, not this template: the class
     reaches it through the primitive's `class` prop and never carries this block's scoping
     attribute, so the scoped form compiles to a selector that matches nothing.

     THE COMPILED SPECIFICITY DOES DROP, from (0,2,0) to (0,1,0), because the scoper's own hash
     class is what the rule loses — the same drop `EditorTabs.svelte` takes for the same repair.
     It is inert HERE, and that is checked rather than assumed: every `.manager-field` rule in
     `styles/fabricate.css` is written under `.fabricate-manager` and is therefore (0,2,x)
     already, so it beat both forms; and none of them declares `flex` or `min-width` on a plain
     `.manager-field`, which is all these two rules set. The descendant rule below keeps its
     hash on the `input`, which this template still writes, so its specificity is unchanged. */
  :global(.manager-world-tool-entry-formula) {
    flex: 1 1 12rem;
    min-width: 0;
  }

  /* AN INVALID FORMULA IS EDGE-MARKED as well as explained, so the field a GM must fix is
     identifiable without reading the sentence under it. Two selectors deep so it beats the
     shipped `.manager-field input` border. */
  :global(.manager-world-tool-entry-formula) input[aria-invalid='true'] {
    border-color: var(--fab-danger-border);
  }

  /* ── THE WORLD BREAKAGE DEFAULT BAND, FULLY TINTED ───────────────────────────────
     MAINTAINER RULING (issue 1373, round 2): the design wins over the earlier reduction.

     An earlier revision kept the INFO colour as a 3px leading EDGE and let the band wear the
     neutral card fill, on the argument that a tinted surface in a stack of neutral cards marks
     the band as a different KIND of thing. That argument has been overruled and the ruling is
     recorded here rather than the reasoning it replaced, so the next reader meets the current
     decision instead of the superseded one.

     `proto:2114` states the band whole: `display: flex; align-items: center; gap: 11px;
     padding: 12px 14px; background: var(--info-soft); border: 1px solid var(--info-border);
     border-radius: 11px`. `--info-soft`, `--info-border` and `--info` are NOT ramp tokens, so
     they map 1:1 onto ours; only the background ramp is shifted a rung and nothing here reads
     it. 11 and 14 have no token and round to `--fab-space-3` on the 4px scale, which is also
     the 12 the design states for the vertical padding, so the box takes one value.

     THE SYSTEM SCOPE ALREADY DRAWS IT THIS WAY — `.manager-tool-authority-readonly` in
     `styles/fabricate.css` has carried `--fab-info-soft` over `--fab-info-border` since the
     band shipped — so this restores the two scopes to one treatment as well as to the design. */
  .manager-world-tool-entry-mode {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border-color: var(--fab-info-border);
    border-radius: 11px;
    background: var(--fab-info-soft);
  }

  /* `font-size: 12px` at `proto:2115`, which is 0.75rem against the 16px root. */
  .manager-world-tool-entry-mode i {
    color: var(--fab-info);
    font-size: 0.75rem;
  }

  .manager-world-tool-entry-mode-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* The mode label: `600 12.5px var(--sans); color: var(--text)` (`proto:2116`), which is
     0.78rem — the same size the master switch's own title takes two cards down. */
  .manager-world-tool-entry-mode-copy strong {
    color: var(--fab-text);
    font-size: 0.78rem;
    font-weight: 600;
  }

  /* `margin-left: auto; max-width: 180px; text-align: right` at `proto:2117`. 180px is
     11.25rem, and the cap was 18rem — half again as wide as the design's, which let the note
     take the room the mode label is meant to have. */
  .manager-world-tool-entry-mode-note {
    margin: 0 0 0 auto;
    max-width: 11.25rem;
    font-size: 0.62rem;
    text-align: right;
  }

  /* ── THE TWO-TRACK WORKSPACE (issue 1373, maintainer round 2) ───────────────────────────
     `minmax(0, 1fr) 326px` is `proto:2073` verbatim, and the 326 is the design's number rather
     than a rounding of the 300 that shipped. NO GAP between the tracks: the rail draws its own
     `border-left` and fill, and a gap would open a strip of page background between the divider
     and the panel it divides.

     IT IS THE TOP-LEVEL CHILD NOW. It used to be nested inside the tabbed body, one row below
     the tab strip, which is what left the rail short at both ends. */
  .manager-world-tool-entry-columns {
    display: grid;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr) 326px;
    min-width: 0;
    min-height: 0;
  }

  /* THE TAB STRIP AND THE PANEL SHARE THE LEFT TRACK. The strip is `auto` and the panel takes
     the slack, so a long section scrolls inside the panel rather than pushing the tabs off
     screen. NO PADDING and NO GAP here: the design gutters the strip and the panel
     independently (`proto:2075` `padding: 0 22px`, `proto:2079` `padding: 16px 22px 40px`), and
     a shared inset would pull the strip's own bottom divider off the pane edges. */
  .manager-world-tool-entry-body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* THE STRIP'S GUTTER IS THE DESIGN'S 22px, ROUNDED TO THE 4px SCALE. `EditorTabs` writes this
     element, not this template, so the rule has to be `:global()` — the scoped form compiles to
     a selector matching nothing, which is the trap this epic has hit four times. It is scoped
     under a class THIS file writes, so the reach is this screen's strip and not every editor's.
     */
  .manager-world-tool-entry-body > :global(.manager-editor-tabs) {
    padding: 0 var(--fab-space-6);
  }

  /* `proto:2079`: `padding: 16px 22px 40px; gap: 14px`. 16 is `--fab-space-4` exactly; 22
     rounds to `--fab-space-6` and 14 to `--fab-space-4`. The 40px bottom clearance is written
     as a literal deliberately — it is a one-off scroll clearance inside the spec's documented
     34-42px exempt band, not a spacing-scale step, and rounding it to 40 from anything else
     would be inventing a number the design did not state. */
  .manager-world-tool-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    padding: var(--fab-space-4) var(--fab-space-6) 40px;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  /* ── THE RAIL'S OWN SURFACE ─────────────────────────────────────────────────────────────
     `proto:2395`: `background: var(--bg2); border-left: 1px solid var(--border); padding: 17px;
     gap: 13px`. 17 rounds to `--fab-space-4` and 13 to `--fab-space-3`, which are the exact two
     values the SYSTEM Tool Studio's rail already uses — so the two editors' rails are now the
     same object rather than the same component in two boxes.

     `:global()` because `ScopedEntityPreview` writes `.manager-scoped-preview`, not this
     template. Scoped under the columns grid this file DOES write, so no other caller of that
     class prefix is reached. */
  .manager-world-tool-entry-columns > :global(.manager-scoped-preview) {
    padding: var(--fab-space-4);
    border-left: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }
</style>
