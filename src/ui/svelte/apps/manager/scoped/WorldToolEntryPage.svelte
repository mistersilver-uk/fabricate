<!-- Svelte 5 runes mode -->
<!--
  The world Tool entry editor (issue 1373, epic 1357). THE SCREEN IS FOUR TABS — `Overview`,
  `Breakage`, `Requirements`, `Validation` — where it was six: one tab per persisted key rather
  than one per decision a GM makes. OVERVIEW is where the LINK ITSELF is authored, and the only
  scope that may be, since identity is world-scoped.
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
  import Chip from '../../../components/Chip.svelte';
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
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

  // `systems` IS DELIBERATELY NOT DECLARED: the narrowed `{id, name}` roster cannot answer
  // `member`, `inherited` or `enabled`, and `entry.systems` — the projection's JOIN — does.
  let {
    scope = null,
    actions = null,
    entityId = '',
    // THE GAME-WORLD ITEM ROSTER, for the linked-item card's LIVE name, art and description; the
    // projected entity carries only a SNAPSHOT taken when the link was made.
    worldItems = [],
    // THE WORLD CHARACTER-PREREQUISITE LIBRARY: world scope itself (issue 1308), which is what
    // makes a world-default `prerequisites.ids` addressable from here at all.
    prerequisiteOptions = [],
    // THE WORLD MODIFIER LIBRARY, world scope for the same reason: a system-local expression
    // would name a modifier the next system to inherit it has never heard of.
    modifierOptions = [],
    // THE THREE WORLD ROSTERS THE BREAKAGE TAB NAMES (issue 1373).
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    // THE `PREVIEW AS` SEAM: `{id, name, img}` per actor and a reader for one actor's prepared
    // roll data, both the SHELL'S, because resolving an Actor is a Foundry read and this is a leaf.
    previewActors = [],
    getPreviewRollData = () => null,
    onBackToCatalogue = () => {},
    // DELETE IS THE HEADER'S, AND THE PAGE STILL OWNS IT: `.manager-header` is a SIBLING of
    // `.manager-main`, so what crosses is an ACTION DESCRIPTOR rather than the button — the reach.
    onDeleteChange = () => {},
    // THE LINK IS AUTHORED HERE, AND ONLY HERE: these wires moved OFF the system Tool editor,
    // which could re-point which Item a Tool IS while world scope could not link one at all.
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
    // THE BUFFERED EDIT'S THREE WIRES TO THE SHELL. Same contract the world essence entry
    // declares, and deliberately the same names: the shell holds one pattern for both.
    //
    //  - onDraftChange(handle|null): a LIVE handle, `{isDirty, save, discard}`, reported on
    //    mount and WITHDRAWN BY THIS PAGE on unmount. Live rather than a snapshot, because the
    //    exit guard reads it at the moment of a click and Delete changes the answer and
    //    navigates in the same turn, so a stale read would prompt to save a Tool that is gone.
    //  - onDirtyChange(dirty): the reactive half, for the header button's disabled state, which
    //    has to re-render where the handle deliberately never does.
    //  - onDraftIdentityChange(identity|null): the other reactive half, for the shell chrome
    //    that NAMES the Tool. THE WHOLE BUFFERED IDENTITY MAP goes over, not the name alone,
    //    because the three entry editors buffer DIFFERENT field sets.
    onDraftChange = () => {},
    onDirtyChange = () => {},
    onDraftIdentityChange = () => {},
    // onSublineChange(text): what the record IS, under the name.
    onSublineChange = () => {},
  } = $props();

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders.
  const PAGE_ID = 'world-tool-entry';
  // DISTINCT from the catalogue's: the swap detector asserts the seven world routes wear seven
  // different glyphs, so a route sharing its catalogue's icon wears another identity.
  const PAGE_ICON = 'fas fa-hammer';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ToolEntryTitle';
  const TITLE_FALLBACK = 'Tool entry';

  /**
   */
  const IDENTITY_FIELDS = Object.freeze(['name']);

  /**
   * THE FOUR ANSWERS A GM AUTHORS, not the three `breakage.mode` values.
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
   */
  function sectionLabel(section) {
    return scopedSectionLabel(section, text);
  }

  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const entry = $derived(entries.find((candidate) => candidate.id === entityId) ?? null);
  const entity = $derived(entry?.entity ?? null);
  const sections = $derived(Array.isArray(scope?.sections) ? scope.sections : []);

  /** THE BUFFERED EDIT. See the file header for what is in it and what deliberately is not. */
  const shape = $derived({ identityFields: IDENTITY_FIELDS, sections });
  const persisted = $derived(scopedEntryBaseline(entry, shape));

  /**
   * WHAT THIS EDITOR KNOWS IS ON DISK — the projection EXCEPT immediately after its own Save, so
   * a Save records what it wrote and the next publish drops that record.
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
  // reference-triggered re-seed would overwrite what the GM had typed.
  $effect(() => {
    const currentId = entry?.id ?? '';
    if (currentId === seededEntityId) return;
    seededEntityId = currentId;
    draft = currentId ? scopedEntryBaseline(entry, shape) : null;
    flushed = null;
  });

  const identity = $derived(draft?.identity ?? persisted.identity);

  // THE WHOLE SCREEN READS THE DRAFT. The buffered sections sit OVER the persisted record rather
  // than replacing it, because `repairRequirements` is seeded rather than buffered.
  const defaults = $derived({ ...(entry?.defaults ?? {}), ...(draft?.defaults ?? {}) });
  const dirty = $derived(scopedEntryDirty(draft, baseline));

  /** Stage one identity field into the draft. REASSIGNED, never mutated in place. */
  function setIdentity(field, value) {
    draft = withScopedEntryIdentity(draft ?? persisted, field, value);
  }

  /**
   * The sentence a REFUSED save puts in front of the GM.
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

  /** Flush the buffered edit; `false` for a refusal, which the route-exit guard gates on. */
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

  /** THE SHELL HANDLE, a LIVE ACCESSOR rather than a snapshot; see the props block for why. */
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
  // THE CHROME ABOVE THIS PAGE FOLLOWS THE DRAFT, which is the thing being edited; the enabled
  // `Save tool` beside it is what says the edit is unsaved.
  $effect(() => {
    onDraftIdentityChange({ ...identity });
  });

  // WITHDRAWN ON UNMOUNT, from an effect with no dependencies: attached to the report above it
  // would publish `null` before each republish, and the shell's reader is shared by all three.
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

  // THE VALIDATION TAB WEARS ITS OWN COUNT, so a GM need not open it to learn whether anything
  // is wrong. A clean record shows a tick, because a zero reads as a quantity of something.
  const tabBadges = $derived({
    validation:
      validationCounts.blocking > 0
        ? { label: String(validationCounts.blocking), tone: 'danger' }
        : validationCounts.warnings > 0
          ? { label: String(validationCounts.warnings), tone: 'warning' }
          : { label: '✓', tone: 'success' },
  });

  /** The inherit count a section states before an edit lands; `null` for a SEEDED section. */
  function inheritCount(section) {
    if (isSeededToolSection(section)) return null;
    return Number(entry?.inheritCounts?.[section]) || 0;
  }

  /**
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

  /** The world default read as a tool-shaped record, for the shipped summary helpers. */
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
   * The four breakage choices as RADIO CARDS rather than a segmented track: a bare-label track.
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
   * One on-break card's description, SIZED FOR THE CARD: three sit in a 3-column grid, so each
   * has roughly a 22-character measure. The FULL sentence is the preview column's.
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
   * Stage a patch to one world-default section, preserving every field it carries.
   */
  function patchSection(section, patch) {
    const current =
      defaults[section] && typeof defaults[section] === 'object' ? defaults[section] : {};
    draft = withScopedEntryDefault(draft ?? persisted, section, { ...current, ...patch });
  }

  /**
   */
  function stageRequirementSections(patch) {
    for (const [section, value] of Object.entries(patch ?? {})) {
      draft = withScopedEntryDefault(draft ?? persisted, section, value);
    }
  }

  /**
   */
  const requirementsTool = $derived({
    prerequisites: defaults.prerequisites ?? null,
    bonus: defaults.bonus ?? null,
  });

  /**
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

  // THE WORLD MASTER SWITCH. A world-disabled Tool is off in EVERY system, because
  // `resolveScopedDefinition` ANDs the two flags; an ABSENT flag reads as enabled, so the read is
  // `!==.
  const worldEnabled = $derived(entry?.worldEnabled !== false);
  const memberSystemCount = $derived(memberRows.filter((row) => row.member === true).length);

  // THE BREAKAGE VALUE, PER MODE. The mode cards say WHICH rule applies; these say what it is SET
  // TO, without which the one number the mode exists to carry is unauthorable at world scope.
  const breakMode = $derived(defaults.breakage?.mode ?? 'limitedUses');
  const breakFormula = $derived(String(defaults.breakage?.formula ?? ''));

  /**
   */
  const breakageChoice = $derived(
    toolBreakageChoice({ breakage: defaults.breakage ?? null }, 'toolSpecific')
  );

  /**
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
   */
  const formulaRollable = $derived(breakFormula.trim() === '' || formulaRolls(breakFormula));

  // THE BREAK-CHANCE BAND: what the number MEANS, beside the number. Without it a 5% and a 90%
  // Tool were the same picture with a different digit in it.
  const chanceBand = $derived(toolBreakageChanceBand(defaults.breakage?.breakageChance ?? 0, text));

  // Both are world-scope answers over the WORLD component catalogue; see the props block for why
  // that is addressable here.
  const replacementComponentId = $derived(
    String(defaults.onBreak?.replacementTarget?.componentId || '')
  );

  /**
   */
  const repairGroups = $derived(
    Array.isArray(entry?.defaults?.repairRequirements) ? entry.defaults.repairRequirements : []
  );

  /** The Item this record names. REGISTERED FIRST, then ORIGIN, which is `toolSourceUuid`'s order. */
  const sourceUuid = $derived(String(entity?.registeredItemUuid || entity?.originItemUuid || ''));

  /**
   */
  const source = $derived(toolSourceSnapshot(entity, worldItems));

  /**
   */
  const sourceMissing = $derived(
    sourceLinked && worldItems.length > 0 && !worldItems.some((item) => item?.uuid === sourceUuid)
  );

  /**
   * THE NAME THIS SCREEN SHOWS, and the ONE place the optional display label is resolved: the
   * buffered value, then the LINKED ITEM's live name, then the record id.
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
   */
  const breakageValueStatus = $derived.by(() => {
    // AN AUTHORED ANSWER, NOT A MISSING ONE: `limitedUses` with a null `maxUses` IS `Unlimited
    // uses`, so reporting it as a mode with nothing behind it contradicted every reading surface.
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
   */
  const previewTool = $derived({
    ...worldDefaultTool(),
    name: entryName,
    img: entity?.img || '',
    prerequisites: defaults.prerequisites ?? null,
    bonus: defaults.bonus ?? null,
  });

  /**
   */
  const previewActorOptions = $derived(
    (Array.isArray(previewActors) ? previewActors : [])
      .filter((actor) => actor && typeof actor.id === 'string' && actor.id)
      .map((actor) => ({ uuid: actor.id, name: actor.name }))
  );

  /** Every recipe and gathering task that names this Tool, in projection order. */
  const requiredByRows = $derived(Array.isArray(entry?.requiredBy) ? entry.requiredBy : []);

  /**
   */
  const REQUIRED_FOR_PAGE_SIZE = 4;

  const pageTitle = $derived(text(TITLE_KEY, TITLE_FALLBACK));

  const deleteToken = $derived(`world-tool-delete:${entityId}`);

  // THE REACH, IN THE SENTENCE: `deleteEntity` sweeps the record, its defaults and every
  // membership naming it, so the count is needed before the second press rather than after.
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
   */
  async function deleteTool() {
    draft = null;
    flushed = null;
    await actions?.deleteEntity?.(entityId);
    onBackToCatalogue();
  }

  // THE DESCRIPTOR THE HEADER DRAWS. A NEW OBJECT on every republish, because Svelte 5 does not
  // proxy a value that crossed a prop boundary; withdrawn on unmount from an effect of its own.
  $effect(() => {
    onDeleteChange({
      token: deleteToken,
      label: text('FABRICATE.Admin.Manager.Scoped.Entry.Delete', 'Delete'),
      armedLabel: text('FABRICATE.Admin.Manager.Scoped.Entry.DeleteConfirm', 'Delete for good?'),
      // THE REACH IS THE ACCESSIBLE NAME, and `ArmedDangerButton` exposes the same string as the
      // hover `title`, so it is reachable by mouse as well.
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
  THE RAIL IS A SIBLING OF THE TAB COLUMN, NOT OF THE TAB PANEL (issue 1373).
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
          <!-- THREE CARDS, and the first is what the screen was missing: WHAT this world record
               is a record OF, which every other field here is derived from. -->
          <!-- THE LINKED-ITEM CARD IS A DROP TARGET, AND THIS IS THE ONLY SCOPE THAT MAY OWN
               ONE, since identity is world-scoped. It is IMMEDIATE, NOT BUFFERED: a drop
               rewrites the source-link fields `IDENTITY_FIELDS` deliberately does not buffer. -->
          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="linked-item">
            <!--
              THE CHIP STATES THE EXCEPTION, NOT THE RULE: a `Linked` pill on a record whose.
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
            <!-- TWO LINES AND ONE BUTTON, which is what the design's tile carries: a raw uuid on
                 a third line displaced the hint that says what dropping DOES. -->
            <!-- THE ONE SITE NAMING ALL FOUR HOOK REGIONS (issue 1509).
                 `data-tool-source-layout` carries the STRING `'compact'` rather than `true`,
                 because it is a layout id and not a presence flag, and
                 `data-tool-source-copy-uuid` is stated although this site renders no copy
                 action: three suites assert that action's ABSENCE by the selector. -->
            <ItemDropZone
              kind="tool-source"
              hookAttrs={{
                root: { 'data-tool-source-card': true, 'data-tool-source-layout': 'compact' },
                hint: { 'data-tool-source-drop-hint': true },
                copy: { 'data-tool-source-copy-uuid': true },
                unlink: { 'data-tool-source-unlink': true },
              }}
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
            <!-- READ-ONLY, and it is the linked Item's OWN description rather than this record's.
                 The world record's own description is authored on the card below. -->
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

          <!-- ONE FIELD, WHICH IS WHAT THE DESIGN'S SECOND CARD HOLDS. It held two: a textarea
               whose content was ALREADY on the tab, so `description` leaves `IDENTITY_FIELDS`
               as well as this card. -->
          <!-- AND THE FIELD IS OPTIONAL, WHICH IS THE AFFORDANCE IT LOST: the design draws it
               EMPTY with the linked Item's name as the placeholder, and `entryName` below is
               the ONE resolution of the blank that every surface on this screen reads. -->
          <section class="manager-world-tool-entry-card" data-world-tool-entry-card="display-label">
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabel', 'Display label')}
            </p>
            <!-- NO SECOND VISIBLE LABEL: the card's kicker already reads `Display label`, so the
                 accessible name goes on the input instead. -->
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
            THE WORLD MASTER SWITCH, the design's third Overview card, and NOT the per-system.
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
              <!--
                ONE SENTENCE, AND NO CAPTION BESIDE THE PILL: a switch that says `On` beside.
              -->
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
            DELETE IS NOT A CARD ON THIS TAB: it is in the header band, where the design draws.
          -->
        {:else if activeTab === 'breakage'}
          <!-- ONE TAB FOR THE WHOLE BREAKAGE STORY, where three split one decision across three
               panels. THE WORLD BREAK MODE LEADS, READ-ONLY, because it decides whether the
               control under it is consulted at all. -->
          <!-- IT IS THE DESIGN'S TINTED INFO BAND (`proto:2114`), by a maintainer ruling that
               took the design over the earlier reduction. -->
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
            <!-- FOUR CARDS ON TWO ROWS, not three on one: `columns={2}` is the system editor's
                 own figure for the identical set. -->
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
            <!-- THE VALUE EDITOR FOR THE SELECTED MODE, which the screen had none of: the mode
                 cards authored `breakage.mode` alone. Each writes into the SAME section object,
                 so switching modes never erases the other's value. -->
            <!-- `unlimited` CONFIGURES NOTHING, so the inset is absent rather than empty. -->
            {#if breakageChoice !== 'unlimited'}
              <div
                class="manager-world-tool-entry-break-value"
                data-world-tool-entry-breakage-value
              >
                {#if breakageChoice === 'limitedUses'}
                  <div class="manager-world-tool-entry-field-row">
                    <div class="manager-world-tool-entry-field-copy">
                      <!--
                        NOT AN EYEBROW: `proto:2134` states this label as a sentence-case title
                        where every actual eyebrow on this screen is tracked micro-copy.
                      -->
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
                    <!--
                      NO `??
                    -->
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
                    <!-- THE PLAIN-LANGUAGE BAND: `5%` is a quantity, `Rarely breaks` is the
                       decision. Its five cuts are `proto:4618`'s. -->
                    <Chip tone={chanceBand.tone} data-world-tool-entry-chance-band={chanceBand.tone}
                      >{chanceBand.label}</Chip
                    >
                  </div>
                  <!--
                    THE TRACK RUNS THE RAMP, AND AN EARLIER ROUND WAS WRONG TO REMOVE IT: the
                    design's own markup styles this control with a four-stop ramp (`proto:491`).
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
                  <!--
                    ROLLED, NOT PARSED: `Roll.validate` returns true for expressions that throw.
                  -->
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
            <!-- THE VALUE, not the mode: the card above already names the mode. The on-break
                 section has no counterpart line, because its mode IS its whole answer. -->
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
              THE MODE'S OWN CONTROL, WHICH THE SCREEN HAD FOR NEITHER MODE: a GM could select.
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

          <!-- THERE IS STILL NO STANDALONE `REPAIR MATERIALS` CARD HERE: the repair route belongs
               INSIDE the on-break card, under the one mode it configures. -->
        {:else if activeTab === 'requirements'}
          <!-- THE SAME COMPONENT THE SYSTEM EDITOR MOUNTS: `prerequisites` and `bonus` became
               world defaults at `1.31.0`, so the two scopes author the SAME two sections. -->
          <!-- NO WRAPPER CARD: `ToolRequirementsTab` draws a `ToolInheritCard` PER SECTION, so
               enclosing it nested three bordered edges where the design draws one. THE TWO
               REACH SENTENCES MOVED INSIDE THE SECTIONS THEY COUNT, through `sectionNotes`. -->
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
          <!--
            NO HEADING AND NO INTRO (`proto:2372`): passing both drew a heading the design does.
          -->
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
            blockLabel={text('FABRICATE.Admin.Manager.Validation.StatusBlock', 'Blocks enable')}
            rowDataAttr="data-world-tool-entry-check"
            hookAttribute="data-world-tool-entry-validation"
          />
        {/if}
      </div>
    </div>

    <!--
      THE RAIL IS THE SHARED `ToolBehaviorPreview`, NOT A SECOND ONE.
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
  /* STATIC class names, so `lint:svelte:warnings` stays at zero; the host sheet is closed to this
     lane, so every rule for markup THIS file owns is authored here. */
  main.manager-main[data-scoped-page='world-tool-entry'] {
    grid-template-rows: minmax(0, 1fr);
  }

  /* THE TAB BODY'S CARDS: one bordered panel per decision, where the segmented control alone left
     two thirds of the pane empty. */
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

  /* THE REQUIREMENTS TAB IS NOT A CARD but a plain stack of `ToolInheritCard`s; the gap is
     restated because the tab's two sections are siblings of each other rather than of the panel. */
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

  /* THE LINKED TILE IS SOLID AND FILLED; DASHED MEANS UNLINKED. The shipped `ItemDropZone` paints
     ONE box for both faces, so a healthy link wore the design's broken state; `proto:2089` draws
     the LINKED tile filled and reserves the dashed edge for the UNLINKED prompt. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    > :global(.manager-item-drop-zone.is-linked) {
    gap: var(--fab-space-3);
    min-height: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-surface-soft);
  }

  /* THE LINKED ITEM'S NAME IS SET IN THE DISPLAY SERIF (`proto:2091`), where nothing declared a
     face, a size or a weight on that element at all. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone.is-linked .manager-item-drop-zone-copy strong) {
    font-family: var(--fab-font-serif);
    font-size: 0.84rem;
    font-weight: 600;
  }

  /* THE UNLINKED FACE KEEPS THE DASH AND GAINS THE DANGER INK. `2px` rather than the design's
     1.5: a fractional border rounds per device pixel ratio and reads as a hairline at 1x. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    > :global(.manager-item-drop-zone:not(.is-linked)) {
    border: 2px dashed var(--fab-danger-border);
    background: transparent;
  }

  /* A BARE DANGER GLYPH, NOT A FILLED TILE (`proto:2099`): the 44px square is the mount for a
     linked Item's ART, and with no Item it reads as a picture that failed to load. */
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

  /* THE UNLINK IS A DESTRUCTIVE CONTROL AND IS DRAWN AS ONE (`proto:2093`): `IconButton.is-danger`
     carries the danger edge and ink but leaves the resting fill neutral. */
  .manager-world-tool-entry-card[data-world-tool-entry-card='linked-item']
    :global(.manager-item-drop-zone-actions .manager-icon-button) {
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--fab-danger-soft);
    font-size: 0.68rem;
  }

  /* THE LINKED ITEM'S OWN DESCRIPTION, in a bordered read-only box: a surface rather than a
     paragraph, because it states another document's text, and the edge says it is read-only. */
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

  /* THE MASTER-SWITCH CARD IS A ROW, not the column its siblings are, which is what stops a
     two-line explanation pushing a 20px toggle onto a line of its own. */
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

  /* THE BREAKAGE VALUE EDITORS. One column, because only ONE of the three ever renders. */
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

  /* NO `flex` SHORTHAND HERE, and that is the whole bug this rule used to carry: the copy cell
     appears beside a control in a ROW and above one in a COLUMN, and in a column the basis is a
     HEIGHT — a two-line caption grew to 160px and opened a void above the control it labels. */
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

  /* THE VALUE EDITOR'S OWN TITLE, WHICH IS NOT AN EYEBROW: `proto:2134` and `proto:2145` state a
     sentence-case title against the tracked uppercase micro-label every real eyebrow wears. */
  .manager-world-tool-entry-field-title {
    color: var(--fab-text);
    font-size: 0.72rem;
    font-weight: 600;
    min-width: 0;
  }

  /* `:global()` because `Field` writes this element, not this template, so the scoped form
     compiles to a selector matching nothing. */
  :global(.manager-world-tool-entry-formula) {
    flex: 1 1 12rem;
    min-width: 0;
  }

  /* AN INVALID FORMULA IS EDGE-MARKED as well as explained; two selectors deep so it beats the
     shipped `.manager-field input` border. */
  :global(.manager-world-tool-entry-formula) input[aria-invalid='true'] {
    border-color: var(--fab-danger-border);
  }

  /* THE WORLD BREAKAGE DEFAULT BAND, FULLY TINTED. MAINTAINER RULING (issue 1373, round 2): the
     design wins over the earlier reduction, which kept the INFO colour as a leading EDGE, and the
     ruling is recorded here rather than the reasoning it replaced. */
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

  /* The mode label at `proto:2116`, the same size the master switch's title takes two cards down. */
  .manager-world-tool-entry-mode-copy strong {
    color: var(--fab-text);
    font-size: 0.78rem;
    font-weight: 600;
  }

  /* `proto:2117`'s cap, where 18rem was half again as wide and let the note take the room the
     mode label is meant to have. */
  .manager-world-tool-entry-mode-note {
    margin: 0 0 0 auto;
    max-width: 11.25rem;
    font-size: 0.62rem;
    text-align: right;
  }

  /* THE TWO-TRACK WORKSPACE: `minmax(0, 1fr) 326px` is `proto:2073` verbatim, and NO GAP between
     the tracks, because the rail draws its own `border-left` and a gap would open a strip of page
     background between the divider and the panel it divides. */
  .manager-world-tool-entry-columns {
    display: grid;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr) 326px;
    min-width: 0;
    min-height: 0;
  }

  /* THE TAB STRIP AND THE PANEL SHARE THE LEFT TRACK, the strip `auto` and the panel taking the
     slack. */
  .manager-world-tool-entry-body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* THE STRIP'S GUTTER IS THE DESIGN'S 22px, ROUNDED TO THE 4px SCALE. `EditorTabs` writes this
     element, so the rule has to be `:global()`, scoped under a class THIS file writes. */
  .manager-world-tool-entry-body > :global(.manager-editor-tabs) {
    padding: 0 var(--fab-space-6);
  }

  /* `proto:2079`'s box. The 40px bottom clearance is a literal deliberately: a one-off scroll
     clearance inside the spec's documented exempt band, not a spacing-scale step. */
  .manager-world-tool-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    padding: var(--fab-space-4) var(--fab-space-6) 40px;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  /* THE RAIL'S OWN SURFACE (`proto:2395`), on the exact two values the SYSTEM Tool Studio's rail
     already uses, so the two editors' rails are the same object. */
  .manager-world-tool-entry-columns > :global(.manager-scoped-preview) {
    padding: var(--fab-space-4);
    border-left: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }
</style>
