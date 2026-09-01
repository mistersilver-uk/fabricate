<!-- Svelte 5 runes mode -->
<!--
  The world Tool entry editor (issue 1373, epic 1357).

  == THE SCREEN IS THREE TABS, AND IT USED TO BE SIX ======================================
  `Identity`, `Breakage`, `On break`, `Repair materials`, `Crafting systems`, `Validation`
  was the section list wearing a tab strip: one tab per persisted key rather than one tab per
  decision a GM makes. Three of them - breakage, what happens when it breaks, and what mends
  it afterwards - are one question asked three times, and each panel held a single segmented
  control over two thirds of empty pane.

  What is here now is `Overview`, `Breakage` and `Validation`:

   - OVERVIEW is the identity the record actually has - the game-world Item behind it, and
     the display label every system shows. The linked Item was stated NOWHERE before, which
     is the one fact every other field on the screen derives from;
   - BREAKAGE opens with the world break mode, READ-ONLY, because it decides whether the
     control beneath it is consulted at all. That statement used to be a full-width band
     ABOVE the tab strip, where it sat over tabs it says nothing about;
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

  == THE THIRD SECTION IS A SEED RATHER THAN A PARENT =====================================
  `breakage` and `onBreak` are world defaults a membership record INHERITS: each states how
  many systems inherit it before an edit lands, read from `entry.inheritCounts`, which
  `worldScopeProjection` populates from `descriptor.sections` alone.

  `repairRequirements` is the third, is NOT in `descriptor.sections`, and therefore carries no
  inherit count at all - correctly, because it is copied ONCE when a tool joins a system and
  then diverges freely. A count here would claim a live parent the resolver does not honour,
  and `resolveTool` reads the list from the MEMBERSHIP RECORD ALONE. So the card states the
  seed rule instead of a count.

  Its full ingredient-group editor is deliberately NOT here. A repair recipe names ingredient
  groups over the OWNING SYSTEM's components, which world scope cannot address - `toolScope.js`
  says so in those terms - so what world scope can honestly own is the seed's PRESENCE, and
  what it cannot is the group contents. The system Tool rules editor owns those.

  == THE TAB STRIP IS THE SHIPPED ONE ====================================================
  `EditorTabs` was promoted to `apps/manager/` for exactly this, and `tools/ToolEditorTabs`
  is hardcoded to four `tool-tab-*` ids for the SYSTEM editor. Reusing the promoted primitive
  is what stops a second near-identical `.svelte` tab block, which SonarCloud counts.
-->
<script>
  import { formulaRolls } from '../../../../../utils/rollFormulaRollability.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { toolBreakageChanceColor } from '../../../util/chanceColorScale.js';
  import ChanceSlider from '../../../components/ChanceSlider.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import Chip from '../Chip.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import { toolBreakageSummary } from '../tools/toolStudio.js';
  import ScopedEntityPreview from './ScopedEntityPreview.svelte';
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
    onBackToCatalogue = () => {},
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
   * @type {readonly string[]}
   */
  const IDENTITY_FIELDS = Object.freeze(['name', 'description']);

  const BREAKAGE_MODES = ['limitedUses', 'breakageChance', 'diceExpression'];
  const DEFAULT_BREAK_MODE = 'toolSpecific';
  const ON_BREAK_MODES = ['destroy', 'flagBroken', 'replaceWith'];

  const TAB_ICONS = {
    identity: 'fas fa-circle-info',
    breakage: 'fas fa-heart-crack',
    validation: 'fas fa-clipboard-check',
  };

  let activeTab = $state('identity');
  let armedToken = $state('');

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
   * One section's tab and heading label.
   *
   * `scopedSectionLabel` answers from `SECTION_COPY`, which carries the five INHERITED section
   * names and deliberately not the seeded one - a seeded section renders no inherit row, so
   * that table never had a reason to name it, and an unknown section falls back to its own key.
   * `repairRequirements` is exactly that case, and this screen is the one place it is a
   * heading, so its copy lives here rather than widening a shared table for one caller.
   *
   * @param {string} section
   * @returns {string}
   */
  function sectionLabel(section) {
    if (isSeededToolSection(section)) {
      return text('FABRICATE.Admin.Manager.Scoped.Sections.RepairRequirements', 'Repair materials');
    }
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
  const repairGroups = $derived(
    Array.isArray(defaults.repairRequirements) ? defaults.repairRequirements : []
  );

  // THE BUFFERED NAME, so the linked-item tile and every aria label on this screen name the
  // Tool the GM is editing rather than the one still on disk.
  const entryName = $derived.by(() => {
    const buffered = String(identity.name ?? '').trim();
    return buffered || String(entityId || '');
  });

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
   * The two mode choices as RADIO CARDS rather than a segmented track.
   *
   * A SEGMENTED TRACK WAS THE WRONG CONTROL, and the design's picture is what says so: it
   * offers each mode as a card carrying a glyph, a bold name and the sentence explaining what
   * it does. A three-segment track states three bare labels and asks a GM to already know
   * which of `Limited uses`, `Breakage chance` and `Dice expression` they want.
   *
   * `RadioCardGroup` is the shipped primitive for exactly this, and `tools/ToolBreakageTab`
   * already renders these same two groups through it at SYSTEM scope. Reusing it - and the
   * hint and glyph vocabulary it reads - is what stops world scope describing the same three
   * modes differently from the system editor a GM reaches from the row beside it.
   */
  const breakageModeOptions = $derived(
    BREAKAGE_MODES.map((mode) => ({
      value: mode,
      label: breakageModeLabel(mode),
      description: breakageModeDescription(mode),
      icon: {
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

  function onBreakModeDescription(mode) {
    return {
      destroy: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakDestroyHint',
        'The tool is consumed and removed.'
      ),
      flagBroken: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakFlagHint',
        'Sets a broken flag; appends " (Broken)".'
      ),
      replaceWith: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakReplaceHint',
        'Replace it with a managed Component that can participate in repair routes.'
      ),
    }[mode];
  }

  function breakageModeLabel(mode) {
    return {
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

  /**
   * The game-world Item this record names, for the linked-item tile.
   *
   * REGISTERED FIRST, then ORIGIN, which is `toolSourceUuid`'s own precedence: a Tool that was
   * re-linked carries both, and the registered uuid is the one the resolver reads.
   */
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));

  /**
   * Whether the selected breakage MODE has a usable VALUE behind it.
   *
   * A mode with no value is not a neutral default: `limitedUses` with no `maxUses` is an
   * unlimited Tool wearing a limited label, and `diceExpression` with a formula that throws
   * fails the whole craft at evaluate time with only a console error. Both are states the mode
   * cards alone cannot show, which is why this is a check rather than a hint.
   */
  const breakageValueStatus = $derived.by(() => {
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
   * The world defaults, resolved, as the preview's fact rows.
   *
   * THE SUBLINE SAYS WHAT THE RULE DOES, never how many systems inherit it. `1 systems
   * inherit it` was an unpluralised count of a fact the tab bodies already state, in the one
   * place a GM is asking what the Tool will DO - and it read as debug output beside the
   * prototype's `Tool-specific · tracked per copy`. The inherit counts stay where they answer
   * a question: on the section itself, before an edit lands.
   */
  const previewRules = $derived([
    {
      id: 'break-mode',
      icon: 'fas fa-sliders',
      title: toolBreakModeLabel(worldAuthority, text),
      subtitle: text(
        'FABRICATE.Admin.Manager.Tools.WorldAuthorityPreview',
        'The world break mode, unless a system overrides it.'
      ),
    },
    {
      id: 'breakage',
      icon: 'fas fa-hourglass-half',
      title: breakageSummaryLabel,
      subtitle:
        (worldAuthority || DEFAULT_BREAK_MODE) === 'checkDriven'
          ? text(
              'FABRICATE.Admin.Manager.Tools.Editor.PreviewCheckDriven',
              'Check-driven · follows the crafting roll'
            )
          : text(
              'FABRICATE.Admin.Manager.Tools.Editor.PreviewToolSpecific',
              'Tool-specific · tracked per copy'
            ),
    },
    {
      id: 'on-break',
      icon: 'fas fa-heart-crack',
      title: format(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreakValue',
        'On break: {action}',
        {
          action: (
            onBreakModeLabel(defaults.onBreak?.mode) || onBreakModeLabel('destroy')
          ).toLocaleLowerCase(),
        }
      ),
      subtitle: text(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreak',
        'Runs immediately after breakage'
      ),
    },
    {
      id: 'repair',
      icon: 'fas fa-screwdriver-wrench',
      title: format(
        repairGroups.length === 1
          ? 'FABRICATE.Admin.Manager.Tools.RepairGroupOne'
          : 'FABRICATE.Admin.Manager.Tools.RepairGroupCount',
        repairGroups.length === 1 ? '{count} group' : '{count} groups',
        { count: repairGroups.length }
      ),
      subtitle: text(
        'FABRICATE.Admin.Manager.Tools.RepairSeedPreview',
        'Copied once when a system adopts this Tool'
      ),
    },
  ]);

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
    armedToken = '';
    draft = null;
    flushed = null;
    await actions?.deleteEntity?.(entityId);
    onBackToCatalogue();
  }
</script>

<main class="manager-main" data-scoped-page="world-tool-entry" aria-label={pageTitle}>
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

    <div class="manager-world-tool-entry-columns">
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
          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="linked-item">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Scoped.Entry.LinkedItem', 'Linked item')}
            </p>
            <div class="manager-world-tool-entry-tile">
              <img src={entity?.img || ''} alt="" />
              <div class="manager-world-tool-entry-tile-copy">
                <strong>{entryName}</strong>
                <small class="manager-muted" data-world-tool-entry-source-uuid>
                  {sourceLinked
                    ? sourceUuid
                    : text(
                        'FABRICATE.Admin.Manager.Scoped.Entry.UnlinkedItemHint',
                        'No Item linked — name, art and description are authored here.'
                      )}
                </small>
              </div>
              <Chip
                tone={sourceLinked ? 'neutral' : 'warning'}
                icon={sourceLinked ? 'fas fa-link' : 'fas fa-link-slash'}
              >
                {sourceLinked
                  ? text('FABRICATE.Admin.Manager.Scoped.List.SourceLinked', 'Linked')
                  : text('FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked', 'No source item')}
              </Chip>
            </div>
            <label class="manager-field" data-world-tool-entry-field="description">
              <span>{text('FABRICATE.Admin.Manager.Scoped.Entry.Description', 'Description')}</span>
              <textarea
                rows="3"
                value={String(identity.description ?? '')}
                oninput={(event) => setIdentity('description', event.currentTarget.value)}
              ></textarea>
            </label>
          </section>

          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="display-label">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel', 'Display label')}
            </p>
            <!-- NO SECOND VISIBLE LABEL. The card's kicker already reads `Display label`, so a
                 `Name` caption under it names the same field twice; the accessible name goes
                 on the input instead, which is what a screen reader announces anyway. -->
            <div class="manager-field" data-world-tool-entry-field="name">
              <input
                type="text"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel',
                  'Display label'
                )}
                data-world-tool-entry-name
                value={String(identity.name ?? '')}
                oninput={(event) => setIdentity('name', event.currentTarget.value)}
              />
            </div>
            <p class="manager-muted manager-world-tool-entry-hint">
              {text(
                'FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelHint',
                'The name every crafting system shows for this Tool.'
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
                <p class="manager-muted" data-world-tool-entry-enabled-reach>
                  {format(
                    memberSystemCount === 1
                      ? 'FABRICATE.Admin.Manager.Tools.WorldEnabledReachOne'
                      : 'FABRICATE.Admin.Manager.Tools.WorldEnabledReach',
                    memberSystemCount === 1
                      ? '{count} crafting system has this Tool and loses it while this is off.'
                      : '{count} crafting systems have this Tool and lose it while this is off.',
                    { count: memberSystemCount }
                  )}
                </p>
              </div>
              <button
                type="button"
                class={`manager-status-toggle ${worldEnabled ? 'is-on' : 'is-off'}`}
                data-world-tool-entry-enabled={worldEnabled ? 'on' : 'off'}
                aria-pressed={worldEnabled}
                onclick={() => actions?.setWorldEnabled?.(entityId, !worldEnabled)}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"
                  ><span class="manager-status-toggle-knob"></span></span
                >
                <span class="manager-status-toggle-label"
                  >{worldEnabled
                    ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
                    : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span
                >
              </button>
            </section>
          {/if}

          <!--
            DELETE IS A CARD ON THIS TAB, not an action in the header band beside Save.

            It is the same placement the world essence entry makes, and for the same two
            reasons. The reach has to be STATED beside the control - deleting a world Tool
            removes its world defaults and every membership record naming it, in every system,
            with no undo - and a header button has nowhere to say so. And it is the one
            immediate action on a screen whose other controls are buffered, so it belongs where
            a sentence can mark it as different rather than next to the verb it isn't.

            ARMED, through the shipped two-step control every other destructive manager action
            uses; a bare button here would be the only unguarded one.
          -->
          <section
            class="manager-world-tool-entry-card manager-world-tool-entry-danger"
            data-world-tool-entry-card="delete"
          >
            <span class="manager-world-tool-entry-danger-glyph" aria-hidden="true">
              <i class="fas fa-triangle-exclamation"></i>
            </span>
            <div class="manager-world-tool-entry-danger-copy">
              <strong>
                {text('FABRICATE.Admin.Manager.Scoped.Entry.DeleteTitle', 'Delete this Tool')}
              </strong>
              <p class="manager-muted" data-world-tool-entry-delete-note>{deleteNote}</p>
            </div>
            <ArmedDangerButton
              token={deleteToken}
              armed={armedToken === deleteToken}
              idleLabel={text('FABRICATE.Admin.Manager.Scoped.Entry.Delete', 'Delete')}
              armedLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirm',
                'Delete for good?'
              )}
              idleAriaLabel={format(
                'FABRICATE.Admin.Manager.Scoped.Entry.DeleteAria',
                'Delete {name} from the world catalogue',
                { name: entryName }
              )}
              armedAriaLabel={format(
                'FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirmAria',
                'Confirm deleting {name} from every system that has it',
                { name: entryName }
              )}
              onArm={(token) => (armedToken = token)}
              onDisarm={() => (armedToken = '')}
              onConfirm={deleteTool}
            />
          </section>
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
          <div class="manager-world-tool-entry-mode" data-world-tool-entry-break-mode>
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
            <RadioCardGroup
              options={breakageModeOptions}
              selectedValue={defaults.breakage?.mode ?? 'limitedUses'}
              groupName="world-tool-breakage-mode"
              columns={3}
              legend={sectionLabel('breakage')}
              dataGroup="world-tool-breakage-mode"
              optionDataAttr="data-world-tool-entry-breakage-mode"
              onChange={(mode) => patchSection('breakage', { mode })}
            />
            <!--
              THE VALUE EDITOR FOR THE SELECTED MODE, one per mode, which the screen had none of.

              The mode cards above author `breakage.mode` and nothing else, so a world default
              reading `Breakage chance` was stuck at whatever `breakageChance` it happened to be
              seeded with and a GM had no way to move it. Each control writes into the SAME
              section object as the mode - `patchSection` merges - so switching modes never
              erases the value the other mode was carrying.

              The controls are the SHIPPED ones the system Tool Rules editor already renders for
              the same three modes, so one meaning has one control across the two scopes.
            -->
            <div class="manager-world-tool-entry-break-value" data-world-tool-entry-breakage-value>
              {#if breakMode === 'limitedUses'}
                <div class="manager-world-tool-entry-field-row">
                  <div class="manager-world-tool-entry-field-copy">
                    <span class="manager-kicker"
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
                  <Stepper
                    value={defaults.breakage?.maxUses ?? 1}
                    min={1}
                    {...stepperLabels(
                      text('FABRICATE.Admin.Manager.Tools.BreakageMaxUses', 'Maximum uses')
                    )}
                    inputProps={{ 'data-world-tool-entry-max-uses': '' }}
                    onChange={(maxUses) => patchSection('breakage', { maxUses })}
                  />
                </div>
              {:else if breakMode === 'breakageChance'}
                <div class="manager-world-tool-entry-field-copy">
                  <span class="manager-kicker"
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
                  <label class="manager-field manager-world-tool-entry-formula">
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
                  </label>
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
            <!-- THE VALUE, not the mode. The card above already names the mode; this states
                 what it currently resolves to, which no card can. The on-break section has no
                 counterpart line because its mode IS its whole answer, and a line repeating
                 the selected card's own label under it said nothing. -->
            <p class="manager-muted" data-world-tool-entry-breakage-summary>
              {breakageSummaryLabel}
            </p>
            <p class="manager-muted" data-world-tool-entry-inherit-count="breakage">
              {format(
                inheritCount('breakage') === 1
                  ? 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCountOne'
                  : 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
                inheritCount('breakage') === 1
                  ? '{count} crafting system inherits this world default today.'
                  : '{count} crafting systems inherit this world default today.',
                { count: inheritCount('breakage') }
              )}
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
            <p class="manager-muted" data-world-tool-entry-inherit-count="onBreak">
              {format(
                inheritCount('onBreak') === 1
                  ? 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCountOne'
                  : 'FABRICATE.Admin.Manager.Scoped.Entry.InheritCount',
                inheritCount('onBreak') === 1
                  ? '{count} crafting system inherits this world default today.'
                  : '{count} crafting systems inherit this world default today.',
                { count: inheritCount('onBreak') }
              )}
            </p>
          </section>

          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="repair">
            <!-- NO INHERIT COUNT, and the copy says why. See the header: a seed has no live
                 parent, so a count would claim an inheritance the resolver does not honour. -->
            <p class="manager-kicker">
              {text(
                'FABRICATE.Admin.Manager.Scoped.Sections.RepairRequirements',
                'Repair materials'
              )}
            </p>
            <p data-world-tool-entry-repair-count>
              {format(
                repairGroups.length === 1
                  ? 'FABRICATE.Admin.Manager.Tools.RepairGroupOne'
                  : 'FABRICATE.Admin.Manager.Tools.RepairGroupCount',
                repairGroups.length === 1 ? '{count} group' : '{count} groups',
                { count: repairGroups.length }
              )}
            </p>
            <p class="manager-muted" data-world-tool-entry-seed-note>
              {text(
                'FABRICATE.Admin.Manager.Tools.RepairSeedNote',
                'Copied once when a system adopts this Tool, then edited there. Changing it here never reaches a system that already has it.'
              )}
            </p>
            <p class="manager-muted" data-world-tool-entry-repair-scope-note>
              {text(
                'FABRICATE.Admin.Manager.Tools.RepairScopeNote',
                'A repair group names components in the owning crafting system, which world scope cannot address, so the groups themselves are edited in that system Tool Rules editor.'
              )}
            </p>
            {#if repairGroups.length > 0}
              <ManagerButton
                class="manager-world-tool-entry-inline-action"
                data-world-tool-entry-repair-clear
                onclick={() => actions?.setWorldRepairRequirements?.(entityId, [])}
              >
                {text('FABRICATE.Admin.Manager.Tools.RepairClearSeed', 'Clear the seed')}
              </ManagerButton>
            {/if}
          </section>
        {:else}
          <ScopedValidationTab
            title={text('FABRICATE.Admin.Manager.Scoped.Entry.TabValidation', 'Validation')}
            intro={text(
              'FABRICATE.Admin.Manager.Scoped.Entry.ValidationIntro',
              'What this world record still needs before every system that has it reads a complete answer.'
            )}
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

      <ScopedEntityPreview
        hookAttribute="data-world-tool-entry-preview"
        ariaLabel={text('FABRICATE.Admin.Manager.Scoped.Entry.Preview', 'Player preview')}
        kicker={text('FABRICATE.Admin.Manager.Scoped.Entry.PreviewKicker', 'What a player sees')}
        identity={{
          name: entryName,
          image: entity?.img || '',
          context: format(
            'FABRICATE.Admin.Manager.Scoped.Entry.PreviewContext',
            'In {count} crafting systems',
            { count: memberRows.filter((row) => row.member).length }
          ),
          hookAttribute: 'data-world-tool-entry-preview-identity',
        }}
        rulesKicker={text(
          'FABRICATE.Admin.Manager.Scoped.Entry.PreviewRules',
          'The world defaults, resolved'
        )}
        rules={previewRules}
        ruleHookAttribute="data-world-tool-entry-preview-rule"
      />
    </div>
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
  .manager-world-tool-entry-card {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    background: var(--fab-bg-1);
    min-width: 0;
  }

  .manager-world-tool-entry-tile {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
    min-width: 0;
  }

  .manager-world-tool-entry-tile img {
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    object-fit: cover;
  }

  .manager-world-tool-entry-tile-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-tile-copy strong {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: break-word;
  }

  /* The uuid is a machine string, so it takes the mono face and truncates rather than
     wrapping a 40-character identifier over three lines. */
  .manager-world-tool-entry-tile-copy small {
    min-width: 0;
    font-family: var(--fab-font-mono);
    font-size: 0.6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* INLINE, not stretched. The button fills its flex column here because the card is a column
     of full-width blocks, and a full-width `Clear the seed` reads as the card's primary action
     rather than the small destructive escape hatch it is. The selector is `:global` because
     the class is passed into a child component and never receives this block's scoping
     attribute, so a scoped selector would be pruned as unused. */
  :global(.manager-world-tool-entry-inline-action) {
    align-self: flex-start;
  }

  .manager-world-tool-entry-hint {
    margin: 0;
    font-size: 0.62rem;
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
    gap: 2px;
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
     not fill. */
  .manager-world-tool-entry-break-value {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
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
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-field-row > .manager-world-tool-entry-field-copy {
    flex: 1 1 10rem;
  }

  .manager-world-tool-entry-field-copy small {
    font-size: 0.6rem;
  }

  .manager-world-tool-entry-formula {
    flex: 1 1 12rem;
    min-width: 0;
  }

  /* AN INVALID FORMULA IS EDGE-MARKED as well as explained, so the field a GM must fix is
     identifiable without reading the sentence under it. Two selectors deep so it beats the
     shipped `.manager-field input` border. */
  .manager-world-tool-entry-formula input[aria-invalid='true'] {
    border-color: var(--fab-danger-border);
  }

  /* INFORMATION, NOT A WELL. This band states a value authored on another screen, and the
     design tints it as information rather than recessing it — `--info-soft` over
     `--info-border` in its own markup. It used to be `--fab-overlay-dark-08`, which read as
     a fourth grey surface saying nothing about why the band is there. */
  .manager-world-tool-entry-mode {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-info-border);
    border-radius: 11px;
    background: var(--fab-info-soft);
    min-width: 0;
  }

  .manager-world-tool-entry-mode i {
    color: var(--fab-info);
  }

  .manager-world-tool-entry-mode-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-mode-note {
    margin: 0 0 0 auto;
    max-width: 18rem;
    font-size: 0.62rem;
    text-align: right;
  }

  /* THE TAB STRIP AND THE BODY SHARE THE LAST TRACK. The strip is `auto` inside it and the
     body takes the slack, so a long section scrolls inside the panel rather than pushing the
     tabs off screen. */
  .manager-world-tool-entry-body {
    display: grid;
    grid-row: 1;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--fab-space-2);
    padding: 0 var(--fab-space-3) var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  .manager-world-tool-entry-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  .manager-world-tool-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }
  /* THE DANGER CARD: glyph, the copy that states the reach, and the armed control at the
     trailing edge. It wears `.manager-world-tool-entry-card` for its surface and adds only the
     row layout, so it cannot drift from the cards above it. */
  .manager-world-tool-entry-danger {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-world-tool-entry-danger-glyph {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--fab-danger);
    background: var(--fab-danger-soft);
    font-size: 0.8rem;
  }

  .manager-world-tool-entry-danger-copy {
    display: flex;
    flex: 1 1 14rem;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-world-tool-entry-danger-copy p {
    margin: 0;
    font-size: 0.66rem;
  }
</style>
