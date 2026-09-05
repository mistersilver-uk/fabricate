<!-- Svelte 5 runes mode -->
<script>
  import Field from '../../components/Field.svelte';
  import Chip from './Chip.svelte';
  import Callout from './Callout.svelte';
  import EditorTabs from './EditorTabs.svelte';
  import EditorValidationSurface from './EditorValidationSurface.svelte';
  import WorldComponentEntryPreviewRail from './scoped/WorldComponentEntryPreviewRail.svelte';
  import InheritRow from './scoped/InheritRow.svelte';
  import { componentRulesValidationPresentation } from './component/componentRulesValidation.js';
  import { localize } from '../../util/foundryBridge.js';
  import ToggleCard from './ToggleCard.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import SubjectModifierPicker from './SubjectModifierPicker.svelte';
  import { stepperLabels } from '../../components/stepperLabels.js';
  import SearchablePopover from '../../components/SearchablePopover.svelte';
  import ComponentIdentityStrip from './component/ComponentIdentityStrip.svelte';
  // The progressive-complications authoring section (issue 1286). It owns its OWN
  // visibility gate — it renders nothing unless the system resolves some activity
  // progressively — so it is imported and placed unconditionally rather than wrapped in a
  // second predicate here that could drift out of step with it.
  import ComponentComplicationsSection from './component/ComponentComplicationsSection.svelte';
  // The ONE complication summary row, in its `readonly-gm` variant (issue 1286). The
  // read-only strip under each progressive salvage row consumes it rather than hand-rolling
  // a second row: there are six call sites for that shape across this feature's two PRs, and
  // SonarCloud's copy-paste detector reads `.svelte`.
  import ComplicationSummaryRow from './ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../utils/complicationSummary.js';
  // The shared essence quantity card (issue 772). It lives under `components/` — the
  // BROWSER's directory — because the browser's bulk-edit panel renders it too; the
  // screenshot evidence map names it explicitly in the editor's recipe so a change to it
  // still routes evidence to the `manager-component-edit` frames.
  import EssenceQuantityCard from './components/EssenceQuantityCard.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel,
    getEffectiveComponentCategories,
    normalizeComponentCategory,
  } from '../../../../utils/componentCategories.js';
  import { clampComponentEssenceQuantity } from '../../util/componentEditor.js';
  // The add-new offer projection (issue 1036). The DRAFT stays unfiltered — it is the sole
  // source `buildComponentEditorUpdates` rebuilds `updates.essences` from — and only what
  // this grid RENDERS is narrowed, so a disabled essence disappears from the offer while
  // one that already carries a quantity stays visible and clearable.
  import { visibleEssenceOptions } from '../../../../utils/essenceValidation.js';
  import {
    SALVAGE_DC_CUSTOM,
    buildSalvageDcOptions,
    resolveSalvageDcSelection,
    salvageDcOverrideForSelection,
  } from './component/salvageDcPresets.js';
  import { salvageResolutionModeOptions } from './resolutionModeOptions.js';
  import IconButton from '../../components/IconButton.svelte';
  import {
    componentCategoryInheritOffered,
    componentCategoryNote,
    componentEssenceChips,
    componentEssenceInheritOffered,
    componentEssenceNote,
    componentTagMergeNote,
    componentWorldEssenceMap,
  } from './scoped/componentScoped.js';

  /**
   * The world entry route this screen deep-links to, through the attribution banner's own exit.
   *
   * A MODULE CONSTANT for the reason the browser view states beside its twin: it is the one
   * string that decides whether the navigation resolves at all, and a token that does not
   * resolve lands on nothing without erroring.
   */
  const WORLD_ENTRY_ROUTE = 'world-component-entry';

  let {
    component = null,
    tagOptions = [],
    essenceOptions = [],
    showTags = false,
    showEssences = false,
    showSalvage = false,
    categoryOptions = [],
    salvageResolutionMode = 'simple',
    salvageOutcomeNames = [],
    // Whether the SYSTEM's salvage check is enabled. With salvageResolutionMode this
    // is the second axis the four brief presentations are derived from — they are a
    // projection of these two, not a model (decision 2). No new persisted token.
    salvageCheckEnabled = false,
    // `salvageCraftingCheck.simple.tiers` — the DC preset source in EVERY resolution
    // mode, routed included (decision 7, case 5). There is no `.routed.tiers` sibling.
    salvageCheckTiers = [],
    salvageCheckDcMode = 'static',
    salvageCheckDc = 0,
    // The SYSTEM's one check-modifier catalogue and the SALVAGE check's selection over it
    // (issue 1095). The picker below renders only under `bySubject` — the rule that hands
    // the selection to the component — and only when the catalogue is non-empty, for the
    // reason the recipe picker states: a control the system will ignore is worse than no
    // control. `salvageModifierMaxPicks` is `null` and NOT coerced at any call site on the
    // way here: `resolveMaxModifierPicks` owns what absence means.
    checkModifierOptions = [],
    salvageModifierPolicy = 'addAll',
    salvageModifierMaxPicks = null,
    // The salvage check's DEFAULT eligible set, so the picker can NAME what this component
    // inherits when it has authored no pick of its own. "Inheriting" with no names told the
    // GM nothing about what this component actually rolls — the recipe picker's own note.
    salvageModifierDefaultIds = [],
    componentOptions = [],
    // ── COMPLICATIONS (issue 1286) ──────────────────────────────────────────────
    // Which activities THIS system resolves progressively, as
    // `{ crafting, salvage, gathering }`. It is the complications section's own gate and
    // its "· not progressive" annotation.
    //
    // `null` means "derive what this view already knows": `salvageResolutionMode` is
    // already a prop here, so a progressive-salvage system lights the section up with no
    // host wiring at all, while crafting and gathering — whose modes live on the system
    // record and never reach this component — stay false until the manager root passes the
    // whole bag. That is a narrower default than guessing, and it is honest about which of
    // the three axes this component can actually see.
    complicationActivities = null,
    // `{ id, label, activity }` per named trigger on the three progressive check blocks.
    // Each activity's check block owns its own id space, so the option is labelled by the
    // activity that owns it.
    complicationTriggerOptions = [],
    // `viewState.selectedSystem.availableScriptMacros` — already `type === 'script'`-filtered
    // and name-sorted by the store, and deliberately not a second projection.
    macroOptions = [],
    // The client-side id mint, injected so the section never reaches for `Math.random()`.
    random = undefined,
    saving = false,
    // Progressive difficulty, rehomed out of the deleted right-rail inspector into the
    // body (decision 4). It is STAGED, not written on change: the value lives in the
    // manager root's `componentDifficultyDraft` and persists with the rest of the
    // editor on Save. It is a SIBLING of `salvage`, not part of `updates.salvage`.
    showDifficulty = false,
    difficulty = null,
    onDifficultyChange = () => {},
    // ── THE FOUR SOURCE ACTIONS ARE GONE FROM THIS EDITOR (issue 1371, parity round 4) ──────
    // `onReplaceSource`, `onUnlinkSource`, `onOpenSource` and `onCopySourceUuid` were this
    // screen's drop-to-replace target and its source kebab. The reference draws neither on a
    // system's rules (`rebuild-spec.md` D3): under epic 1357 the record that names the source
    // Item is world-scope data, so it is authored on the world Component entry, which the
    // identity callout's one exit routes to.
    //
    // They are DECLARED NOWHERE rather than declared and ignored: an unread prop in this list is
    // an eslint failure, and the manager root still passing them is harmless — Svelte 5 drops a
    // prop no destructuring names. The store services themselves are untouched.
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onManageCheckPresets = () => {},
    // "Edit ↗" on a progressive salvage result row: opens the referenced YIELD
    // component's editor. The root wires this to `editComponent(otherId)`, which routes
    // through confirmRouteExit — NOT `setView('component-edit')`, which no-ops without
    // a selectedSystem and would prompt the discard dialog then change nothing.
    onOpenComponent = () => {},
    // ── THE WORLD SCOPE'S OWN PROJECTION, ITS WRITE FAMILY, AND THIS SYSTEM ──────────────────
    // Three of the four keys the call site's component bundle spreads; `systems` stays
    // undeclared for the reason the browser view's twin block states.
    //
    // `actions` IS the component write family, and it carries `setMutedTags`. This view holds a
    // live write path to it after issue 1371 and DELIBERATELY DOES NOT USE IT: muting is
    // authored on the world entry, and the world-tag card below is read-only. The read-only-ness
    // is therefore a decision this file makes rather than a structural impossibility, which is
    // why it is asserted rather than assumed.
    scope = null,
    actions = null,
    systemId = '',
    // THE DEEP LINK, through the banner's OWN exit rather than a second navigation control beside
    // the read-only tag card. Called with the ROUTE TOKEN and the entity id.
    onOpenWorldEntry = () => {},
  } = $props();

  // ── THE WORLD LAYER THIS SYSTEM'S RULES SIT OVER ─────────────────────────────────────────
  // Read off the world projection's own JOIN, which is the only place the INHERIT state lives:
  // the in-system record carries the RESOLVED value and cannot tell an inherited category from
  // an identical overriding one.
  const worldEntry = $derived(
    (Array.isArray(scope?.entries) ? scope.entries : []).find(
      (entry) => String(entry?.id ?? '') === String(component?.id ?? '')
    ) ?? null
  );
  const worldSystemRow = $derived(
    (Array.isArray(worldEntry?.systems) ? worldEntry.systems : []).find(
      (row) => row?.systemId === systemId
    ) ?? null
  );
  const worldCategory = $derived(String(worldEntry?.defaults?.category ?? '').trim());
  const worldTags = $derived(
    Array.isArray(worldEntry?.defaults?.tags) ? worldEntry.defaults.tags : []
  );
  const worldMutedTags = $derived(
    Array.isArray(worldSystemRow?.mutedTags) ? worldSystemRow.mutedTags : []
  );
  const worldMember = $derived(worldSystemRow?.member === true);
  // AN ABSENT `inherit` KEY READS AS INHERITING, matching the resolver: that is the state a
  // record created by "add to this system" is in.
  const categoryInheriting = $derived(worldSystemRow?.inherited?.category !== false);
  // THE OPTION IS WITHHELD WHEN NO WORLD VALUE IS AUTHORED. Offering it would label the control
  // with an empty world value, and flipping it resolves back to the in-system value anyway — a
  // control that changes nothing while looking as though it did.
  const categoryInheritOffered = $derived(
    worldMember && componentCategoryInheritOffered(worldCategory)
  );
  // THE STAGED INHERIT FLAG, WHICH IS THE OTHER HALF OF A DRAFT (revision 8).
  //
  // `null` means the GM has not touched the control this session, so the persisted flag stands.
  // Anything else is a PENDING choice that has not been written yet, and it is read everywhere
  // `categoryInheriting` used to be read directly — the lock, the note, the select's value and
  // the rail — so the whole screen previews the choice while it is still a draft.
  //
  // Until revision 8 the switch was a write that landed the instant it was chosen, while the
  // category VALUE beside it was buffered until Save. A GM who picked a concrete category and
  // then backed out left the system silently switched from inheriting to overriding, with no
  // save, nothing on screen saying so, and no way back except finding the control again. Both
  // halves of one choice now land together, on Save; see `handleSave` for the ORDER and for what
  // a half-failed save leaves behind.
  let categoryInheritDraft = $state(null);
  const categoryInheritStaged = $derived(
    categoryInheritDraft === null ? categoryInheriting : categoryInheritDraft
  );
  const categoryInheritDirty = $derived(
    categoryInheritDraft !== null && categoryInheritDraft !== categoryInheriting
  );
  const categoryLocked = $derived(categoryInheritOffered && categoryInheritStaged);
  const categoryNote = $derived(
    componentCategoryNote(
      {
        worldCategory,
        inheriting: categoryInheritStaged,
        systemName: String(worldSystemRow?.systemName ?? systemId),
      },
      format
    )
  );

  // ── THE ESSENCE SECTION'S INHERIT CHOICE (issue 1371 r18-entry, maintainer ruling M31) ──────
  // The world record carries an `essences` SECTION beside `category`, on the category model
  // exactly, so this is the category machinery above over the other section: the persisted switch
  // off the world join, the OFFER withheld while the world authored nothing, a three-valued staged
  // flag (`null` untouched), and a LOCK that draws the steppers read-only over the WORLD map while
  // the staged choice is inherit. `worldEssenceMap` is the world section normalized positive-only
  // — the same read the world catalogue's rows make — and it is what a locked card shows and what
  // an override is SEEDED from, so flipping the switch moves no tile.
  const worldEssences = $derived(worldEntry?.defaults?.essences);
  const worldEssenceMap = $derived(componentWorldEssenceMap(worldEntry, []));
  const essenceInheriting = $derived(worldSystemRow?.inherited?.essences !== false);
  const essenceInheritOffered = $derived(
    worldMember && componentEssenceInheritOffered(worldEssences)
  );
  let essenceInheritDraft = $state(null);
  const essenceInheritStaged = $derived(
    essenceInheritDraft === null ? essenceInheriting : essenceInheritDraft
  );
  const essenceInheritDirty = $derived(
    essenceInheritDraft !== null && essenceInheritDraft !== essenceInheriting
  );
  const essenceLocked = $derived(essenceInheritOffered && essenceInheritStaged);
  const essenceNote = $derived(
    componentEssenceNote(
      {
        worldEssences,
        inheriting: essenceInheritStaged,
        systemName: String(worldSystemRow?.systemName ?? systemId),
      },
      format
    )
  );

  let tagDraft = $state([]);
  let categoryDraft = $state(GENERAL_COMPONENT_CATEGORY);
  let essenceDraft = $state([]);
  // The rendered subset (issue 1036): every ENABLED essence, plus any disabled one this
  // component already carries a positive quantity of. `essenceDraft` itself stays whole —
  // it is what `buildComponentEditorUpdates` rebuilds `updates.essences` from, so
  // narrowing it would delete a disabled essence's authored quantity on the next save.
  const offeredEssences = $derived(
    visibleEssenceOptions(
      essenceDraft,
      (option) => clampComponentEssenceQuantity(option?.quantity) > 0
    )
  );
  // Deep clone of component.salvage so edits never mutate the upstream card. Only
  // the authoring fields (resultGroups, outcomeRouting, dcOverride) are edited
  // here; the remaining salvage fields (enabled, ingredientQuantity, toolIds, …)
  // are preserved and spread back through buildUpdates so a save never drops them.
  let salvageDraft = $state(cloneSalvage(null));
  // The COMPLICATIONS draft (issue 1286). A top-level sibling of `salvage`, not part of it:
  // a complication is scoped to this component's participation in ANY progressive activity —
  // as a recipe result, a salvage yield or a gathering drop — so parking it inside the
  // salvage sub-record would be the aggregate-boundary violation `componentComplications.js`
  // states at length, and `updates.salvage` would carry it onto a system whose salvage
  // feature is off, where the shape is spec-invalid.
  let complicationsDraft = $state([]);
  let saveFailed = $state(false);
  let lastComponentKey = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');

  // See the `complicationActivities` prop note: absent means "derive what this view knows",
  // which is the salvage axis alone.
  const complicationActivityProgressive = $derived(
    complicationActivities || { salvage: salvageResolutionMode === 'progressive' }
  );

  const componentKey = $derived(
    `${component?.id || ''}|${tagOptions.length}|${essenceOptions.length}`
  );
  const dirty = $derived(isDirty());
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived(
    [
      component?.id || '',
      tagDraft
        .filter((opt) => opt.checked)
        .map((opt) => opt.tag)
        .sort()
        .join(','),
      // `category` is NOT a salvage field, so it gets its own term here rather than
      // riding in salvageSignature(). Same one-list principle as that allowlist: an
      // authored field missing from the signature means the editor never re-emits its
      // draft, so the root's dirty state and Save never see it (issue 676).
      categoryDraft,
      // The staged INHERIT half gets its own term for the same reason, and it is a THREE-valued
      // one rather than a boolean: `null` (untouched) and a staged value equal to the persisted
      // one are different states, and only one of them is dirty.
      String(categoryInheritDraft),
      // And the essence switch's staged half, three-valued for the same reason (M31).
      String(essenceInheritDraft),
      essenceDraft
        .map((opt) => `${opt.id}:${opt.quantity}`)
        .sort()
        .join(','),
      showSalvage ? salvageSignature() : '',
      // Its OWN term, like `category` and for the same reason: a complication is not a
      // salvage field, so it does not ride `salvageSignature()`. Omit it and the issue-651 /
      // issue-676 bug returns verbatim — the GM authors a complication, nothing is ever
      // dirty, Save never enables, and the edit is silently discarded on exit.
      complicationsSignature(),
      dirty ? 'dirty' : 'clean',
    ].join('')
  );

  $effect(() => {
    if (componentKey === lastComponentKey) return;
    tagDraft = cloneTagOptions(tagOptions);
    categoryDraft = normalizeComponentCategory(component?.category);
    // Reset with the drafts it belongs to. Left standing, a staged inherit choice would be
    // re-applied to the NEXT component opened in this editor.
    categoryInheritDraft = null;
    essenceInheritDraft = null;
    essenceDraft = cloneEssenceOptions(essenceOptions);
    salvageDraft = cloneSalvage(component?.salvage);
    complicationsDraft = cloneComplications(component?.complications);
    saveFailed = false;
    // The DC control's Custom… choice is transient UI state, not draft data. Reset it
    // with the drafts, or opening a second component would inherit the first's open
    // custom input and misreport a system-default DC as custom.
    salvageDcCustomSelected = false;
    lastComponentKey = componentKey;
  });

  $effect(() => {
    if (dirty === lastDirty) return;
    lastDirty = dirty;
    onDirtyChange(dirty);
  });

  $effect(() => {
    if (draftSignature === lastDraftSignature) return;
    lastDraftSignature = draftSignature;
    onDraftChange(draftSummary);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * The interpolating localizer the shared component-scope model takes.
   *
   * @param {string} key
   * @param {string} fallback
   * @param {object} [data]
   * @returns {string}
   */
  function format(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  // `general` first, then the system's authored vocabulary. The reserved bucket is
  // never persisted in `categoryOptions`, so it is prepended here rather than being
  // expected in the incoming list.
  const effectiveCategoryOptions = $derived(getEffectiveComponentCategories(categoryOptions));

  // ── THE TWO TABS (issue 1371, parity round 4; gap-list row 127) ─────────────────────────
  // The reference draws `Component rules` and `Validation ⓵`, and this editor had no strip at
  // all. D-9's "this lane does not rebuild `ComponentEditView`'s tab model" was a statement of
  // scope rather than a licence, so the strip and its second tab are built here.
  //
  // The tab is LOCAL STATE and is deliberately not lifted: it is a reading position rather than
  // a draft, and the editor is re-seeded per component anyway.
  let activeTab = $state('rules');

  const systemLabel = $derived(String(worldSystemRow?.systemName ?? systemId));

  /**
   * The name of every salvage result this system has NO rules for.
   *
   * `componentOptions` is the system's own component roster, so a result naming an id absent
   * from it is a result this system cannot award. That is the reference's own per-row warning
   * pill (`proto:1381`), and it is the one validation fact the draft alone cannot answer.
   *
   * @returns {string[]}
   */
  function salvageResultsWithoutRules() {
    const known = new Set((componentOptions || []).map((option) => String(option?.id ?? '')));
    const names = [];
    for (const group of salvageDraft.resultGroups || []) {
      for (const result of group?.results || []) {
        const id = String(result?.componentId ?? '');
        if (!id || known.has(id)) continue;
        names.push(salvageComponentName(id));
      }
    }
    return names;
  }

  const salvageResultCount = $derived(
    (salvageDraft.resultGroups || []).reduce(
      (total, group) => total + (group?.results || []).length,
      0
    )
  );

  const unroutedOutcomes = $derived(
    salvageRouted
      ? (salvageOutcomeNames || []).filter((name) => !salvageDraft.outcomeRouting?.[name])
      : []
  );

  // THE EFFECTIVE CONTRIBUTION: the world map's total while the section is (staged) inheriting,
  // the draft's otherwise — what the validation check and the rail both answer for (M31).
  const essenceTotal = $derived(
    essenceLocked
      ? Object.values(worldEssenceMap).reduce((total, quantity) => total + quantity, 0)
      : essenceDraft.reduce(
          (total, option) => total + (clampComponentEssenceQuantity(option?.quantity) || 0),
          0
        )
  );

  const validation = $derived(
    componentRulesValidationPresentation(
      {
        category: categoryLocked ? worldCategory : categoryDraft,
        essencesOffered: showEssences && essenceDraft.length > 0,
        essenceTotal,
        salvageFeatureEnabled: showSalvage,
        salvageEnabled,
        routed: salvageRouted,
        progressive: salvageProgressive,
        resultCount: salvageResultCount,
        resultsWithoutRules: salvageResultsWithoutRules(),
        unroutedOutcomes,
        progressiveDc: difficulty,
      },
      format
    )
  );

  /**
   * The Validation tab's badge, in the shape `EditorTabs` takes. An early-return chain rather
   * than a nested ternary, which SonarCloud reports as S3358.
   *
   * @param {{blocking: number, warnings: number}} counts
   * @returns {{count: number, tone: string}|null}
   */
  function validationBadge(counts) {
    if (counts.blocking > 0) return { count: counts.blocking, tone: 'danger' };
    if (counts.warnings > 0) return { count: counts.warnings, tone: 'warning' };
    return null;
  }

  const tabs = $derived([
    {
      id: 'rules',
      icon: 'fas fa-cube',
      labelKey: 'FABRICATE.Admin.Manager.Component.TabRules',
      label: 'Component rules',
    },
    {
      id: 'validation',
      icon: 'fas fa-clipboard-check',
      labelKey: 'FABRICATE.Admin.Manager.Component.TabValidation',
      label: 'Validation',
    },
  ]);
  const badges = $derived({ validation: validationBadge(validation.counts) });

  /**
   * The overall status the validation hero paints, from the counts the rows are grouped by.
   *
   * @param {{blocking: number, warnings: number}} counts
   * @returns {'block'|'warn'|'pass'}
   */
  function worstValidationStatus(counts) {
    if (counts.blocking > 0) return 'block';
    if (counts.warnings > 0) return 'warn';
    return 'pass';
  }

  const validationSummary = $derived({
    status: worstValidationStatus(validation.counts),
    icon:
      worstValidationStatus(validation.counts) === 'pass'
        ? 'fas fa-circle-check'
        : worstValidationStatus(validation.counts) === 'warn'
          ? 'fas fa-triangle-exclamation'
          : 'fas fa-circle-xmark',
    title:
      worstValidationStatus(validation.counts) === 'pass'
        ? text('FABRICATE.Admin.Manager.Component.Validation.HeadPass', 'These rules are complete')
        : text('FABRICATE.Admin.Manager.Component.Validation.HeadIssues', 'These rules have gaps'),
    sub: format(
      'FABRICATE.Admin.Manager.Component.Validation.HeadSub',
      'What {system} needs from this component before it can be crafted with, or broken down.',
      { system: systemLabel }
    ),
  });

  // ── D4.1 THE CATEGORY CONTROL IS ONE SELECT ────────────────────────────────────────────
  // The reference folds `Inherit from world · {value}` into the select's FIRST option
  // (`proto:1325`), where this editor drew a floated head select, a second `Category` label, a
  // note and a toggle in the body (gap-list row 133). One control, in the body, full width.
  const INHERIT_OPTION = '__inherit';
  const categorySelectValue = $derived(categoryLocked ? INHERIT_OPTION : categoryDraft);
  const categoryInheritLabel = $derived(
    format(
      'FABRICATE.Admin.Manager.Component.Category.InheritOption',
      'Inherit from world · {category}',
      { category: categoryLabel(worldCategory) }
    )
  );

  /**
   * Stage the one control's choice, which is TWO writes on the two transitions that need them.
   *
   * The inherit flag is a MEMBERSHIP write and the category is an IN-SYSTEM one, so choosing a
   * concrete category while inheriting has to clear the flag as well — otherwise the read union
   * re-applies the world value after the in-system re-spread and the typed value is discarded on
   * the very next read, which is what `categoryLocked` used to prevent by disabling the control.
   *
   * NEITHER HALF IS WRITTEN HERE. Both are staged and both land in `handleSave`. The flag used to
   * be written immediately while the value was buffered, which made one control half-committing:
   * a discarded draft still left the system switched from inheriting to overriding.
   *
   * @param {string} value
   */
  function setCategorySelection(value) {
    if (value === INHERIT_OPTION) {
      categoryInheritDraft = true;
      return;
    }
    if (categoryInheritOffered) categoryInheritDraft = false;
    setCategory(value);
  }

  /**
   * Stage the essence switch (issue 1371 r18-entry, maintainer ruling M31). NOTHING IS WRITTEN
   * HERE, for the reason `setCategorySelection` gives: both halves land in `handleSave`.
   *
   * Going to OVERRIDE seeds the value draft from the WORLD map the locked card was showing, so no
   * tile moves and the first Save writes the values the GM was already looking at — the same seed
   * `setSectionInheritance` makes on the membership record. Going back to INHERIT leaves the value
   * draft standing as the dormant override, exactly as the category draft stands behind the
   * `Inherit from world` option; the locked card shows the world map over it.
   *
   * @param {boolean} nextInherit `InheritRow` reports the NEXT inherit value, never a toggle.
   */
  function setEssenceInheritance(nextInherit) {
    essenceInheritDraft = nextInherit === true;
    if (nextInherit === false) {
      essenceDraft = essenceDraft.map((entry) => ({
        ...entry,
        quantity: worldEssenceMap[entry.id] ?? 0,
      }));
    }
  }

  // ── D4.2 THE TAG CARD'S TWO GROUPS ─────────────────────────────────────────────────────
  const worldTagsApplied = $derived(worldTags.filter((tag) => !worldMutedTags.includes(tag)));
  const ownTagLabel = $derived(
    format('FABRICATE.Admin.Manager.Component.TagsEdit.OwnGroup', '{system}’s tags', {
      system: systemLabel,
    })
  );
  // THE WORLD BRANCH STATES WHAT IS TRUE, WHICH IS NOT WHAT THE REFERENCE STATES (revision 8).
  // `proto:5690` writes `World tags merge with {system}'s own.` and the runtime does not do that:
  // `resolveComponentTags` computes the additive set and the read union's trailing in-system
  // re-spread DISCARDS it, so no system resolves a world tag today. `### GM World Component
  // Screens` makes that a rule rather than a preference — no surface may assert the false half of
  // the merge while it is unconsumed — so this is a licensed departure from the reference's copy
  // and the only one on this card. The card still SHOWS the world run, because showing a list is
  // not claiming it reaches anything; the sentence just stops promising the merge.
  const tagCardSubtitle = $derived(
    worldTags.length > 0
      ? format(
          'FABRICATE.Admin.Manager.Component.TagsEdit.SubtitleWorld',
          'The world record’s tags are listed here; {system}’s own are the ones in effect.',
          { system: systemLabel }
        )
      : format(
          'FABRICATE.Admin.Manager.Component.TagsEdit.SubtitleOwn',
          '{system}’s item tags. Another system’s tags are its own business.',
          { system: systemLabel }
        )
  );

  // ── D9 THE `How players see it` RAIL ───────────────────────────────────────────────────
  // THE WORLD ENTRY'S OWN RAIL, at the system scope (issue 1371 r18-list, maintainer ruling
  // M27): `WorldComponentEntryPreviewRail` draws the tile, the facts and the two kickered groups
  // on both screens, and this editor supplies only what differs — the scope, and the data.
  //
  // BOTH FACT GROUPS ARE NARROWED TO THIS SYSTEM. The world projection's `requiredBy` and
  // `producedBy` are world-wide and carry the owning system on every reference; a rail on a
  // system's rules that listed another system's recipes would be a wrong list rather than a long
  // one. The rows take the entry rail's own shape — icon by kind, the system as the subtitle, the
  // badge in the kind's tone — so the two screens draw one row.
  function railRows(references, badgeFor) {
    return (Array.isArray(references) ? references : [])
      .filter((reference) => reference?.systemId === systemId)
      .map((reference) => {
        const gathering = reference.kind === 'gathering';
        return {
          id: `${reference.kind ?? 'recipe'}-${reference.id}`,
          icon: gathering ? 'fas fa-leaf' : 'fas fa-scroll',
          title: reference.name,
          subtitle: reference.systemName,
          badge: badgeFor(gathering),
          badgeTone: gathering ? 'info' : 'neutral',
        };
      });
  }
  const railFactGroups = $derived([
    {
      kicker: text('FABRICATE.Admin.Manager.Component.Rail.UsedBy', 'Used by'),
      hookAttribute: 'data-component-rail-used-by',
      rows: railRows(worldEntry?.requiredBy, (gathering) =>
        gathering
          ? text('FABRICATE.Admin.Manager.Component.Rail.BadgeGathering', 'Gathering')
          : text('FABRICATE.Admin.Manager.Component.Rail.BadgeIngredient', 'Ingredient')
      ),
      emptyNote: text(
        'FABRICATE.Admin.Manager.Component.Rail.NoUsedBy',
        'No recipe requires it yet.'
      ),
    },
    {
      kicker: text('FABRICATE.Admin.Manager.Component.Rail.ProducedBy', 'Produced by'),
      hookAttribute: 'data-component-rail-produced-by',
      rows: railRows(worldEntry?.producedBy, (gathering) =>
        gathering
          ? text('FABRICATE.Admin.Manager.Component.Rail.BadgeGathering', 'Gathering')
          : text('FABRICATE.Admin.Manager.Component.Rail.BadgeRecipe', 'Recipe')
      ),
      emptyNote: text(
        'FABRICATE.Admin.Manager.Component.Rail.NoProducedBy',
        'Nothing produces it yet.'
      ),
    },
  ]);
  const railTagChips = $derived([
    ...worldTagsApplied,
    ...tagDraft
      .filter((option) => option.checked && !worldTagsApplied.includes(option.tag))
      .map((option) => option.tag),
  ]);
  // THE ESSENCES THIS SYSTEM RESOLVES, as the rail draws them (M31): the world map while the
  // staged choice is inherit, the draft otherwise, named and coloured off the editor's own roster.
  const railEssences = $derived(
    componentEssenceChips(
      essenceLocked
        ? worldEssenceMap
        : Object.fromEntries(
            essenceDraft.map((option) => [
              option.id,
              clampComponentEssenceQuantity(option.quantity),
            ])
          ),
      essenceOptions
    )
  );

  function categoryLabel(category) {
    return getComponentCategoryLabel(category, localize);
  }

  function setCategory(value) {
    categoryDraft = normalizeComponentCategory(value);
  }

  // Blank when unset; otherwise the staged number. Read straight off the prop — the
  // draft itself lives in the manager root, so there is nothing to seed here.
  const difficultyInputValue = $derived(
    difficulty === null || difficulty === undefined ? '' : difficulty
  );

  // Stage on input so the editor's dirty state and Save button track edits live. Blank
  // / sub-1 / non-integer / invalid stages null (cleared); a valid value stages the
  // truncated integer. Final coercion also happens on Save.
  function handleDifficultyInput(raw) {
    const trimmed = String(raw ?? '').trim();
    const parsed = Number(trimmed);
    onDifficultyChange(
      trimmed === '' || !Number.isFinite(parsed) || parsed < 1 ? null : Math.trunc(parsed)
    );
  }

  function cloneTagOptions(options = []) {
    return (options || []).map((option) => ({
      tag: option.tag,
      checked: option.checked === true,
    }));
  }

  function cloneEssenceOptions(options = []) {
    return (options || []).map((option) => ({
      id: option.id,
      name: option.name,
      icon: option.icon,
      // The essence's own colour as the bare `--fab-tag-*` key the Essence Catalogue stores
      // (issue 1371; r18-colour, M29). Carried for the same reason `enabled` is: a field
      // dropped by the clone can never reach the card.
      colorToken: option.colorToken,
      // Carried through the clone or the offer filter below could never see it, and every
      // disabled essence would be offered as if enabled (issue 1036).
      enabled: option.enabled !== false,
      quantity: clampComponentEssenceQuantity(option.quantity),
    }));
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // Deep clone the persisted salvage shape into an editable draft. Authoring only
  // touches resultGroups/outcomeRouting/dcOverride, but the remaining fields are
  // kept verbatim so buildUpdates can spread them back and never drop them.
  function cloneSalvage(salvage) {
    const source = salvage && typeof salvage === 'object' ? salvage : {};
    return {
      ...source,
      // The component's own check-modifier pick (issue 1095). Kept as `null` for ABSENT
      // rather than `[]`, because an authored empty array is a real pick of zero and a
      // DIFFERENT roll — `...source` above preserves an authored one, and this only
      // normalizes the absent case so the dirty-check baseline is comparable (the trap
      // `allowPlayerResultReorder` documents two fields below).
      checkModifierIds: Array.isArray(source.checkModifierIds)
        ? [...source.checkModifierIds]
        : null,
      dcOverride: source.dcOverride ?? null,
      // Default FALSE, matching `_normalizeSalvage` (issue 676, decision 6). Do NOT
      // copy the `!== false` shape of `allowPlayerResultReorder` below — that would
      // default this to TRUE, flipping every component in every world to salvageable
      // on first render and saving it back.
      //
      // Its other job is normalizing the DIRTY-CHECK BASELINE (see the note below):
      // leave the key absent and `enabled`, now in salvageSignatureOf's allowlist,
      // compares `false` against `undefined` forever, so toggling off→on never
      // returns to clean.
      enabled: source.enabled === true,
      // Default TRUE (issue 651), matching the model. `...source` above already
      // preserves a persisted value, so this is purely about the ABSENT key.
      //
      // Its load-bearing job is normalizing the DIRTY-CHECK BASELINE, not rendering:
      // `isDirty()` compares the draft's signature against `cloneSalvage(component.salvage)`.
      // Leave the key absent and a component that has never been toggled has an
      // `undefined` baseline, so toggling off then back ON leaves the editor stuck
      // DIRTY forever (`true` never re-equals `undefined`) — Save stays enabled with
      // nothing to save, and the exit guard nags on a no-op edit.
      allowPlayerResultReorder: source.allowPlayerResultReorder !== false,
      outcomeRouting:
        source.outcomeRouting && typeof source.outcomeRouting === 'object'
          ? { ...source.outcomeRouting }
          : {},
      resultGroups: (Array.isArray(source.resultGroups) ? source.resultGroups : []).map(
        (group) => ({
          ...group,
          id: group?.id || newId(),
          name: group?.name || '',
          results: (Array.isArray(group?.results) ? group.results : []).map((result) => ({
            ...result,
            id: result?.id || newId(),
            componentId: result?.componentId || '',
            quantity: clampSalvageQuantity(result?.quantity),
          })),
        })
      ),
    };
  }

  // `difficulty` is projected onto the component options; a component that has never
  // been given one reads null and the badge says so rather than showing a spurious 0.
  function salvageResultDifficulty(componentId) {
    const option = componentOptions.find((opt) => opt.id === componentId);
    const numeric = Number(option?.difficulty);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function clampSalvageQuantity(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  // The dirty-check allowlist: every AUTHORED salvage field must appear here or the
  // Save button never enables for it and the GM's edit is silently discarded on exit.
  // That is exactly what happened when `allowPlayerResultReorder` was added (issue 651):
  // persistence worked (buildUpdates spreads the draft), but nothing could be saved
  // because nothing was ever dirty.
  //
  // Taking a salvage OBJECT (rather than reading `salvageDraft` and having isDirty()
  // hand-build a matching literal) means there is ONE list, not two that must be kept
  // in sync. The two-list shape is what let this drift in the first place.
  function salvageSignatureOf(salvage) {
    return JSON.stringify({
      // The per-component salvage gate (issue 676). Omit it and the 651 bug returns
      // verbatim for this field: the GM flips the toggle, nothing is ever dirty, Save
      // never enables, and the edit is silently discarded on exit.
      enabled: salvage.enabled,
      resultGroups: salvage.resultGroups,
      outcomeRouting: salvage.outcomeRouting,
      dcOverride: salvage.dcOverride,
      allowPlayerResultReorder: salvage.allowPlayerResultReorder,
      // Omit this and the issue-651 bug returns verbatim for the modifier pick: the GM
      // picks, nothing is ever dirty, Save never enables, and the edit is discarded on exit.
      checkModifierIds: salvage.checkModifierIds,
    });
  }

  function salvageSignature() {
    return salvageSignatureOf(salvageDraft);
  }

  /**
   * Deep-clone the persisted complications into an editable draft (issue 1286).
   *
   * A STRUCTURAL clone, not a shallow copy: the section replaces whole entries rather than
   * mutating them, but `when` / `rollCondition` / `effectRoll` are nested objects and a
   * shallow copy would share them with the upstream card — so a discarded edit would
   * already have landed on the component the browser renders.
   *
   * Absent normalizes to `[]` for the same reason `enabled` and `allowPlayerResultReorder`
   * are normalized above: the dirty-check baseline is `complicationsSignatureOf(clone(
   * component.complications))`, and comparing `[]` against `undefined` forever would leave
   * a component whose only edit was adding and removing one complication stuck dirty.
   * Emitting the key is a separate decision, taken in `buildUpdates()`.
   */
  function cloneComplications(complications) {
    return (Array.isArray(complications) ? complications : []).map((complication) => ({
      ...complication,
      when: { ...complication?.when },
      rollCondition: { ...complication?.rollCondition },
      effectRoll: { ...complication?.effectRoll },
      activities: { ...complication?.activities },
    }));
  }

  // ONE list again, on `salvageSignatureOf`'s reasoning: taking the ARRAY rather than
  // reading the draft means `isDirty()` compares the same projection of both sides.
  function complicationsSignatureOf(complications) {
    return JSON.stringify(complications);
  }

  function complicationsSignature() {
    return complicationsSignatureOf(complicationsDraft);
  }

  function tagsAreEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].tag !== right[i].tag) return false;
      if ((left[i].checked === true) !== (right[i].checked === true)) return false;
    }
    return true;
  }

  function essencesAreEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].id !== right[i].id) return false;
      if (
        clampComponentEssenceQuantity(left[i].quantity) !==
        clampComponentEssenceQuantity(right[i].quantity)
      )
        return false;
    }
    return true;
  }

  function isDirty() {
    if (!component) return false;
    // THE INHERIT FLAG IS A DRAFT FIELD LIKE ANY OTHER since revision 8. Omit it and the failure
    // is the issue-651 / issue-676 one verbatim: the GM flips the switch, nothing is ever dirty,
    // Save never enables, and the choice is silently discarded on exit.
    if (categoryInheritDirty) return true;
    if (essenceInheritDirty) return true;
    if (categoryDraft !== normalizeComponentCategory(component?.category)) return true;
    if (showTags && !tagsAreEqual(tagDraft, tagOptions)) return true;
    if (showEssences && !essencesAreEqual(essenceDraft, essenceOptions)) return true;
    if (showSalvage && salvageSignature() !== salvageSignatureOf(cloneSalvage(component?.salvage)))
      return true;
    // NOT gated on a `show*` flag. The complications section owns its own visibility gate,
    // and a draft that differs from the persisted list is a real edit whether or not the
    // section that produced it is on screen right now.
    if (
      complicationsSignature() !==
      complicationsSignatureOf(cloneComplications(component?.complications))
    )
      return true;
    return false;
  }

  function buildUpdates() {
    const updates = {};
    updates.category = categoryDraft;
    if (showTags) {
      updates.tags = tagDraft.filter((opt) => opt.checked).map((opt) => opt.tag);
    }
    if (showEssences) {
      const essences = {};
      for (const option of essenceDraft) {
        const quantity = clampComponentEssenceQuantity(option.quantity);
        if (quantity > 0 && option.id) essences[option.id] = quantity;
      }
      updates.essences = essences;
    }
    if (showSalvage) {
      // Spread the preserved (unedited) salvage fields first, then overwrite the
      // three authored fields so enabled/ingredientQuantity/toolIds survive a save.
      updates.salvage = {
        ...salvageDraft,
        resultGroups: salvageDraft.resultGroups,
        outcomeRouting: salvageDraft.outcomeRouting,
        dcOverride: salvageDraft.dcOverride,
        allowPlayerResultReorder: salvageDraft.allowPlayerResultReorder,
      };
      // ABSENCE IS A VALUE HERE, and the normalizer keys authoredness on `Array.isArray`
      // at entry — so the key must be DELETED, never written as `null`. Writing `null`
      // would read as "not an array" and inherit, which is the same roll by accident
      // rather than by construction; deleting it says so.
      if (!Array.isArray(salvageDraft.checkModifierIds)) delete updates.salvage.checkModifierIds;
    }
    // A TOP-LEVEL sibling of `salvage`, never a member of it (issue 1286). Always emitted,
    // and always as an array: `authoredComplications` keys the persisted key on a NON-EMPTY
    // normalized list, so an authored `[]` normalizes to ABSENT and deleting the last
    // complication is how a GM removes the key. Omitting the field here instead would make
    // that deletion unsaveable — the same shape of defect as issue 651.
    updates.complications = complicationsDraft;
    return updates;
  }

  function buildDraftSummary() {
    return {
      id: component?.id || '',
      name: component?.name || '',
      tagCount: tagDraft.filter((opt) => opt.checked).length,
      essenceCount: essenceDraft.filter((opt) => clampComponentEssenceQuantity(opt.quantity) > 0)
        .length,
      salvageGroupCount: showSalvage ? salvageDraft.resultGroups.length : 0,
      complicationCount: complicationsDraft.length,
      updates: buildUpdates(),
      dirty,
    };
  }

  // The ONE essence write path (issue 772). `Stepper` inside `EssenceQuantityCard` emits
  // the clamped ABSOLUTE value for its −/+ adjuncts and for a typed entry alike, so the
  // separate `adjustEssence(id, delta)` the hand-rolled −/+ buttons needed is gone. The
  // clamp stays here regardless: `Stepper`'s own `min` guards its adjuncts, but the draft
  // is what the save reads.
  function setEssenceQuantity(essenceId, rawValue) {
    const quantity = clampComponentEssenceQuantity(rawValue);
    const next = essenceDraft.map((entry) =>
      entry.id === essenceId ? { ...entry, quantity } : entry
    );
    essenceDraft = next;
  }

  // Salvage authoring mutators. Each writes a fresh salvageDraft (preserving the
  // untouched fields) so the draftSignature effect re-emits onDraftChange.
  // ---------------------------------------------------------------------------
  // The four presentations, DERIVED from the two-axis model (decision 2).
  //
  // Fabricate's real model is `salvageResolutionMode ∈ {simple, progressive, routed}`
  // plus the off/on axis on the salvage check. The brief's four presentations are a
  // read-only projection of those two — no persisted token changes, no migration.
  // The brief's own descriptors for them are deliberately absent from this code.
  // ---------------------------------------------------------------------------

  const salvageEnabled = $derived(salvageDraft.enabled === true);
  const salvageHasGroups = $derived(salvageDraft.resultGroups.length > 0);
  const salvageProgressive = $derived(salvageResolutionMode === 'progressive');
  const salvageRouted = $derived(salvageResolutionMode === 'routed');
  // Simple mode caps authoring at ONE success result group (issue 764), mirroring the
  // recipe editor's Simple treatment. The cap counts SUCCESS groups (`role !== 'failure'`)
  // so a legacy-loaded reserved failure group neither wedges the editor nor hides the Add
  // control while there is still no success group — and its stored data is never blanked.
  // The invariant itself lives at the `_normalizeSalvage` clamp; this is UX only.
  const salvageSimpleMode = $derived(salvageResolutionMode === 'simple');
  const salvageSuccessGroupCount = $derived(
    salvageDraft.resultGroups.filter((group) => group?.role !== 'failure').length
  );
  const salvageHideAddGroup = $derived(salvageSimpleMode && salvageSuccessGroupCount >= 1);
  // The DC control belongs to modes that compare a roll against a DC. `progressive`
  // spends a roll down a list instead, so it shows read-only per-result DC chips.
  const salvageShowDcOverride = $derived(
    salvageCheckEnabled && (salvageResolutionMode === 'simple' || salvageRouted)
  );

  // RULING A (issue 676). What collapses when salvage is OFF is the chrome that only
  // has meaning once salvage RUNS — mode/DC/routing/reorder. The result-group editor
  // stays usable.
  //
  // This is not cosmetic. `data-add-salvage-group` is the ONLY add-group control in
  // the entire codebase and it lives INSIDE the group editor. Collapse the whole body
  // and: off → body collapsed → add-group hidden → resultGroups can never reach 1 →
  // the toggle is disabled forever. Salvage would be unenablable for every new
  // component and every existing one with no groups. The prototype dodges this only
  // because its `salvageOn` defaults ON, which decision 6 correctly rejects.
  const salvageShowChrome = $derived(salvageEnabled);

  // Decision 8(c): UX only — NOT the invariant. The invariant is the normalizer clamp
  // (`_normalizeSalvage`) plus the removal-path auto-disable in removeSalvageGroup.
  const salvageToggleDisabled = $derived(saving || !salvageHasGroups);

  // The off-body copy MUST branch. "Enable it above to define what it yields" is only
  // true once groups exist; at zero groups it points at a toggle that is (correctly)
  // disabled, so it is actively misleading.
  //
  // This is ALSO the zero-group explanation for the disabled toggle, which is why it is
  // body copy and not a `title` on the toggle: a DISABLED <button> receives no mouse
  // events, so a tooltip there never appears in any browser — and a mounted test could
  // not tell, because the attribute would be in the DOM. It used to be said twice (here
  // AND on the enable card's sub-line); the card is gone and this is the one copy.
  const salvageDisabledNotice = $derived(
    salvageHasGroups
      ? text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledHasGroups',
          'Salvage is disabled for this component. Enable it above to define what it yields when broken down.'
        )
      : text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledNoGroups',
          'There is nothing to enable yet. Add a result below to describe what this component yields, then enable salvage.'
        )
  );

  // The salvage mode, displayed READ-ONLY (it is a SYSTEM-level setting, authored on
  // the Crafting Settings screen — this route only reports it).
  //
  // Without it the panel silently changes shape — routing rows, ordinals, and the DC
  // control appearing and vanishing — driven by a setting the GM cannot see from here,
  // with nothing saying which mode they are in. Reuses `salvageResolutionModeOptions`,
  // which already carries "Routed by check" as `routed`'s label: the persisted token is
  // never displayed, and this is the list whose comment records that.
  const salvageModeOption = $derived(
    salvageResolutionModeOptions.find((option) => option.value === salvageResolutionMode) || null
  );
  const salvageModeLabel = $derived(
    salvageModeOption ? text(salvageModeOption.labelKey, salvageModeOption.fallback) : ''
  );

  // --- DC control (decision 7 + its five cases) ---
  const salvageDcOptions = $derived(
    buildSalvageDcOptions({
      tiers: salvageCheckTiers,
      dcMode: salvageCheckDcMode,
      systemDc: salvageCheckDc,
      systemDefaultLabel: (dc) =>
        text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefault',
          'System default — DC {dc}'
        ).replace('{dc}', String(dc)),
      systemDefaultDynamicLabel: () =>
        text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefaultDynamic',
          'System default — set by macro'
        ),
      tierLabel: (name, dc) =>
        text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcTier', '{name} — DC {dc}')
          .replace('{name}', name)
          .replace('{dc}', String(dc)),
      customLabel: () =>
        text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustom', 'Custom…'),
    })
  );
  // The PERSISTED value derives the selection — never an $effect that writes back. An
  // off-tier `dcOverride: 14` against a tier list with no DC 14 selects Custom… and
  // displays 14 verbatim; it must never snap to the nearest tier, and rendering must
  // never mark the editor dirty (AC8a).
  //
  // But the persisted value ALONE cannot drive the control, because `Custom…` and
  // `System default` both persist a `dcOverride` of `null`. Deriving visibility purely
  // from storage made Custom… DEAD from the state every component starts in: pick it →
  // stages null → selection derives back to `system` → the input never renders → the
  // GM can never author a custom DC. That is a regression of a capability `main` ships
  // today (a plain number input accepting any DC) and it contradicts decision 7 and
  // this change's own canonical requirement ("a Custom… option exposing an arbitrary
  // integer"). The zero-authored-tiers case — the COMMON one — is where it bites
  // hardest: two options, one of them inert.
  //
  // So the GM's CHOICE is staged separately from the value. It is intentionally NOT in
  // the draft: choosing Custom… without typing a number changes nothing persisted, so
  // it must not make the editor dirty.
  let salvageDcCustomSelected = $state(false);
  const salvageDcSelection = $derived(
    salvageDcCustomSelected
      ? SALVAGE_DC_CUSTOM
      : resolveSalvageDcSelection(salvageDraft.dcOverride, salvageCheckTiers)
  );
  const salvageDcShowCustomInput = $derived(salvageDcSelection === SALVAGE_DC_CUSTOM);

  function setSalvageDcSelection(selection) {
    // Sticky only while Custom… is the live choice; picking a tier or the system
    // default hands control back to the persisted value.
    salvageDcCustomSelected = selection === SALVAGE_DC_CUSTOM;
    setSalvage({ dcOverride: salvageDcOverrideForSelection(selection, salvageDraft.dcOverride) });
  }

  function setSalvage(next) {
    salvageDraft = { ...salvageDraft, ...next };
  }

  function addSalvageGroup() {
    setSalvage({
      resultGroups: [...salvageDraft.resultGroups, { id: newId(), name: '', results: [] }],
    });
  }

  // Decision 8(b), issue 676 — defence in depth behind the normalizer clamp.
  //
  // This path used to be UNFLOORED: it never touched `enabled`, and buildUpdates()
  // full-spreads, so enable-at-one-group → delete-that-group → Save persisted
  // `{enabled: true, resultGroups: []}` — violating Component Requirement 5 through
  // the sanctioned flow's exact reverse, and then DISABLING the toggle that would
  // undo it (stuck ON). Forcing `enabled: false` in the SAME staged setSalvage keeps
  // the correction inside isDirty()/draftSignature so Save sees it.
  //
  // House precedent: `_disableInvalidSalvageConfigs` does exactly this.
  function removeSalvageGroup(groupId) {
    const resultGroups = salvageDraft.resultGroups.filter((group) => group.id !== groupId);
    setSalvage({
      resultGroups,
      ...(resultGroups.length === 0 ? { enabled: false } : {}),
    });
  }

  function updateSalvageGroup(groupId, patch) {
    setSalvage({
      resultGroups: salvageDraft.resultGroups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group
      ),
    });
  }

  function addSalvageResult(groupId) {
    updateSalvageGroupResults(groupId, (results) => [
      ...results,
      { id: newId(), componentId: componentOptions[0]?.id || '', quantity: 1 },
    ]);
  }

  function removeSalvageResult(groupId, resultId) {
    updateSalvageGroupResults(groupId, (results) =>
      results.filter((result) => result.id !== resultId)
    );
  }

  function updateSalvageResult(groupId, resultId, patch) {
    updateSalvageGroupResults(groupId, (results) =>
      results.map((result) => (result.id === resultId ? { ...result, ...patch } : result))
    );
  }

  function updateSalvageGroupResults(groupId, mutate) {
    setSalvage({
      resultGroups: salvageDraft.resultGroups.map((group) =>
        group.id === groupId ? { ...group, results: mutate(group.results || []) } : group
      ),
    });
  }

  // ── PROGRESSIVE SALVAGE IS ONE GROUP, WHOSE `results` ARE THE STAGES ─────────────
  // Read `CraftingEngine.js` `_resolveSalvageGroups` before touching any of this:
  //
  //     if (mode === 'progressive') {
  //       const group = allGroups[0];          // ONLY the first group
  //       const authored = group.results || []; // its RESULTS are the ordered stages
  //
  // So progressive's model is a SINGLE group whose result list is the ordered stage
  // list; `resultGroups[1..]` are dead data the engine never reads, and the order that
  // decides what a player is awarded is the order WITHIN `resultGroups[0].results`.
  //
  // That is why this surface renders progressive as a flat ordered list with no group
  // chrome: the groups are a storage detail here, not a thing to author. The redesign
  // prototype models the same screen as one-group-per-stage and maps `groups.map(g =>
  // g.results[0])` — porting THAT mapping literally would have authored stage 2+ into
  // groups the engine never reads, silently awarding only the first stage forever.
  // The presentation is the prototype's; the mapping is the engine's.
  const salvageStageGroup = $derived(salvageDraft.resultGroups[0] || null);
  const salvageStages = $derived(salvageStageGroup?.results || []);

  // Append a stage, creating the backing group on first use. This is ALSO the control
  // that takes a zero-group component to one group, so it is what keeps Ruling A's
  // invariant true in progressive mode: without it, `enabled` could never be set
  // (the normalizer clamps `enabled` to false at zero groups) and salvage would be
  // permanently unenablable for every progressive component.
  function addSalvageStage() {
    const stage = { id: newId(), componentId: componentOptions[0]?.id || '', quantity: 1 };
    if (!salvageStageGroup) {
      setSalvage({ resultGroups: [{ id: newId(), name: '', results: [stage] }] });
      return;
    }
    updateSalvageGroupResults(salvageStageGroup.id, (results) => [...results, stage]);
  }

  // Removing the LAST stage removes the empty group with it, so the normalizer's
  // groups-based clamp (`enabled && resultGroups.length > 0`) can still see the
  // component as empty and force `enabled: false`. Leave the empty group behind and the
  // draft persists `{enabled: true, resultGroups: [{results: []}]}` — one group, so the
  // clamp holds enabled ON, while the engine awards nothing. Same defence in depth as
  // `removeSalvageGroup` (decision 8b), reached by the progressive path.
  function removeSalvageStage(resultId) {
    if (!salvageStageGroup) return;
    const results = salvageStages.filter((result) => result.id !== resultId);
    if (results.length === 0) {
      removeSalvageGroup(salvageStageGroup.id);
      return;
    }
    updateSalvageGroupResults(salvageStageGroup.id, () => results);
  }

  // Reorder is the AUTHORING act in progressive mode — the list order is the spend
  // order. Clamped at the ends rather than wrapping.
  function moveSalvageStage(index, delta) {
    const target = index + delta;
    if (!salvageStageGroup) return;
    if (target < 0 || target >= salvageStages.length) return;
    const results = [...salvageStages];
    const [moved] = results.splice(index, 1);
    results.splice(target, 0, moved);
    updateSalvageGroupResults(salvageStageGroup.id, () => results);
  }

  // Drag-reorder. `draggingStageIndex` is transient UI state and deliberately outside
  // the draft: picking a row up and dropping it where it started must not mark the
  // editor dirty.
  let draggingStageIndex = $state(null);

  function onStageDragStart(index) {
    draggingStageIndex = index;
  }

  function onStageDrop(index) {
    const from = draggingStageIndex;
    draggingStageIndex = null;
    if (from === null || from === index) return;
    moveSalvageStage(from, index - from);
  }

  function setSalvageRoute(outcomeName, groupId) {
    const next = { ...salvageDraft.outcomeRouting };
    if (groupId) next[outcomeName] = groupId;
    else delete next[outcomeName];
    setSalvage({ outcomeRouting: next });
  }

  // `Stepper` reports a clamped NUMBER, or `null` when an `allowUnset` field is
  // cleared, so the string-parsing half of this adapter is gone. The `null` fold
  // stays: `null` is the persisted "inherit the system salvage DC" value, which is
  // exactly what clearing the field now sends.
  function setSalvageDcOverride(next) {
    setSalvage({ dcOverride: Number.isFinite(next) ? next : null });
  }

  function salvageComponentName(componentId) {
    return componentOptions.find((option) => option.id === componentId)?.name || '';
  }

  function salvageComponentOption(componentId) {
    return componentId
      ? componentOptions.find((option) => option.id === componentId) || null
      : null;
  }

  /**
   * The complication band's eyebrow: "2 complications on Coiled Mainspring".
   *
   * The COUNT is the half of that sentence worth reading on a collapsed band — the band
   * already names the component in its Edit control, and the prototype leads with the
   * number for exactly that reason. Two FULL key literals rather than one composed key,
   * because `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written
   * down, and the manager's plural idiom is a sibling `…One` key chosen by `count === 1`.
   */
  function stripTitle(count, componentId) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.Component.Complications.StripTitleOne'
        : 'FABRICATE.Admin.Manager.Component.Complications.StripTitle';
    const fallback = count === 1 ? '1 complication on {name}' : '{count} complications on {name}';
    return text(key, fallback)
      .replace('{count}', String(count))
      .replace('{name}', salvageComponentName(componentId));
  }

  // ── The read-only complication strip under a progressive salvage row (issue 1286) ─────
  //
  // It draws the complications authored on the YIELD component the row REFERENCES, never
  // this component's own: a stage of a progressive salvage produces that component, and the
  // complication is a consequence of producing it. `componentOptions` is the feed because it
  // is the only projection this view holds for another component — the same route the row's
  // read-only DC badge already takes.
  //
  // It reads the UNREDACTED authored list. `forecastComplications` filters to
  // `visibility: 'visible'`, which is the PLAYER's projection, and the authored default is
  // `gmOnly` — so a GM strip fed from it would be empty for exactly the complications a GM
  // authors by default.
  //
  // Filtered to the SALVAGE activity, as the prototype's `compsFor(component, mode)` is: a
  // complication enabled only for crafting says nothing about a salvage stage, and listing it
  // here would tell the GM this yield carries a consequence it does not.
  function salvageComplicationsFor(componentId) {
    const authored = salvageComponentOption(componentId)?.complications;
    return (Array.isArray(authored) ? authored : []).filter(
      (complication) => complication?.activities?.salvage === true
    );
  }

  // The macro and trigger vocabularies are SYSTEM-scoped, so the two lists this view already
  // holds for the authoring section resolve the referenced component's names too. Without
  // them the sentence degrades to "runs a macro" / "a check trigger fires", which is correct
  // but names nothing a GM recognises.
  const complicationMacroNames = $derived(
    new Map(
      (macroOptions || [])
        .filter((macro) => macro?.uuid)
        .map((macro) => [macro.uuid, macro.name || macro.uuid])
    )
  );

  const complicationTriggerLabels = $derived(
    new Map(
      (complicationTriggerOptions || [])
        .filter((option) => option?.id)
        .map((option) => [option.id, option.label || option.id])
    )
  );

  function complicationStripSummary(complication) {
    return complicationSummary(complication, {
      translate: text,
      macroName: complicationMacroNames.get(complication?.macroUuid) || '',
      triggerName: complicationTriggerLabels.get(complication?.when?.checkTrigger) || '',
    });
  }

  // The yield picker's option list (issue 676). `img` is projected onto every component
  // option by the manager root, and `icon` is the fallback for a component whose linked
  // item has no art: SearchablePopover renders a raw <img> ONLY when `img` is truthy, so
  // an art-less component reads as a cube glyph rather than a broken-image box.
  const salvageComponentPickerOptions = $derived(
    (componentOptions || []).map((option) => ({
      id: option.id,
      label: option.name,
      img: option.img || '',
      icon: option.img ? '' : 'fas fa-cube',
    }))
  );

  function toggleTag(tag, checked) {
    const next = tagDraft.map((entry) =>
      entry.tag === tag ? { ...entry, checked: checked === true } : entry
    );
    tagDraft = next;
  }

  // No caller left. Deleting it would strip the only reader of the two TagsEdit ApplyTag /
  // RemoveTag lang keys, orphaning both and failing the lang-keys-no-orphans ratchet, which
  // may not be grown. lang/en.json is outside this change's owned paths, so the helper is
  // suppressed rather than deleted; issue 926 removes the code and the keys together.
  // (Do not spell those keys with their leading namespace here: the orphan scanner treats a
  // dotted key literal in a COMMENT as a reference, and a partial one covers a whole subtree.)
  // eslint-disable-next-line no-unused-vars
  function toggleTagLabel(tag, checked) {
    return checked
      ? text('FABRICATE.Admin.Manager.Component.TagsEdit.RemoveTag', 'Remove {name}').replace(
          '{name}',
          tag
        )
      : text('FABRICATE.Admin.Manager.Component.TagsEdit.ApplyTag', 'Apply {name}').replace(
          '{name}',
          tag
        );
  }

  // A throw is a failure exactly as a `false` return is, so both mark the draft failed in
  // their own branch. There is no `result` temporary to leave unassigned, and the save is
  // still awaited exactly once — an extra async hop here would move the failure notice a
  // microtask later than the mounted route tests observe it.
  //
  // ── ONE SAVE, TWO SETTINGS KEYS, AND THE ORDER IS THE ANSWER (revision 8) ─────────────────
  // The category is TWO facts in two world settings keys: the VALUE lives on the in-system
  // component record (`craftingSystems`, written by `onSave`) and the INHERIT flag lives on the
  // membership record (`componentScope`, written by `setSectionInherited`). There is no
  // transaction across them, so one of the two can land alone and the ordering decides what a
  // half-failed save leaves on screen.
  //
  // THE FLAG GOES FIRST, DELIBERATELY. `setSectionInheritance` SEEDS the local block with the
  // world value when a switch goes off, so a flag-only landing leaves the system overriding with
  // the value it was already resolving — the EFFECTIVE category does not move, and the GM sees
  // `Save failed` over a screen that still reads the way it did. The other order fails worse: the
  // value would be written into a record the read union still masks with the world default, so
  // the GM's typed category would be persisted and invisible, which is the discarded-edit defect
  // this whole change is about.
  //
  // Neither half runs if the flag write refuses, and `saveFailed` covers both, so a refusal is
  // never reported as a success.
  async function handleSave(event) {
    event?.preventDefault();
    if (!component?.id || saving) return;
    saveFailed = false;
    const updates = buildUpdates();
    try {
      if (categoryInheritDirty) {
        const inherited = await actions?.setSectionInherited?.(
          component.id,
          systemId,
          'category',
          categoryInheritDraft
        );
        if (inherited === false) {
          saveFailed = true;
          return;
        }
        // THE STAGED VALUE IS NOT CLEARED HERE, and that is not an omission. Clearing it would
        // hand the display back to `categoryInheriting` in the same tick, before the store has
        // republished the membership record — so the select would snap to the OLD state and then
        // snap back one publish later. Left staged, it stops being dirty the moment the persisted
        // flag catches up with it, which is the same condition and no flicker.
      }
      // THE ESSENCE SWITCH, SAME ORDER, SAME REASONS (issue 1371 r18-entry, M31): the flag before
      // the values, so a flag-only landing leaves the system overriding with the map it was already
      // resolving, and a refusal stops the value write. Not cleared here either.
      if (essenceInheritDirty) {
        const inherited = await actions?.setSectionInherited?.(
          component.id,
          systemId,
          'essences',
          essenceInheritDraft
        );
        if (inherited === false) {
          saveFailed = true;
          return;
        }
      }
      const result = await onSave(component.id, updates);
      if (result === false) saveFailed = true;
    } catch {
      saveFailed = true;
    }
  }
</script>

<!--
  THE WORLD ENTRY'S PAGE FRAME (issue 1371 r18-list, maintainer ruling M27). The reference draws
  the rules editor and the catalogue entry on ONE frame — a content column beside a 326px rail
  with its own scroller and left hairline (`proto:1301`, `proto:986`) — and the entry's frame is
  the one already written to it, so this route's `<main>` IS that frame rather than a second grid
  of its own: the form and the rail are its two columns, and every rule that paints the shared
  rail is keyed on the frame's class, which is what makes "the same rail" a fact about the pixels
  rather than about the import. The class is named for the screen that introduced it; a neutral
  name would be a rename across the entry, its suites and the sheet for no rendered change, and
  is left for a follow-up.
-->
<main
  class="manager-main manager-component-edit-main manager-component-entry-page"
  aria-label={text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component')}
>
  <!--
    THE FORM IS THE FRAME'S CONTENT COLUMN (issue 1371 r18-list, maintainer ruling M26). It wears
    the world entry column's class beside its own: the entry's column runs edge to edge with the
    tab strip as a flush band and the inset given to the scrolling panel under it — which is also
    the reference's own arrangement (`proto:1301-1307`) — and this form used to carry the inset
    itself, so the strip and every card started 24px inside the pane and the maintainer's frame
    showed dead inset on every side. Two classes rather than one: `manager-component-edit-view` is
    the form the header's Save submits BY ID and the smoke walk and the layout guards pin it, while
    the column class is what the frame's rules are keyed on.
  -->
  <form
    id="manager-component-edit-form"
    class="manager-component-edit-view manager-component-entry-column"
    onsubmit={handleSave}
  >
    <!--
      THE TWO-TAB STRIP (gap-list row 127, `proto:1302-1306`). It lives INSIDE the form, not
      beside it: the header's Save is `<button type="submit" form="manager-component-edit-form">`
      and submits this element by id, so a form mounted only on the rules tab would silently stop
      being submittable the moment a GM opened Validation.
    -->
    <EditorTabs
      {tabs}
      {activeTab}
      {badges}
      onSelect={(tab) => (activeTab = tab)}
      ariaLabelKey="FABRICATE.Admin.Manager.Component.TabsLabel"
      ariaLabel="Component rules sections"
      idStem="component-rules"
      hookAttribute="data-component-edit-tab"
      badgeAttribute="data-component-edit-tab-badge"
    />

    <!--
      THE SCROLLING PANEL (M26), the entry column's own: the strip stays put and the tab body
      scrolls under it, carrying the reference's `16px 22px 40px` inset (`proto:1307`, snapped) so
      the cards are inset and the column is not. It is also the tab panel the strip's
      `aria-controls` has named since the strip arrived — `component-rules-panel-<tab>` pointed at
      no element until now — with the same focus wiring the entry's panel carries.
    -->
    <div
      class="manager-component-entry-panel"
      data-component-edit-panel={activeTab}
      id={`component-rules-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`component-rules-tab-${activeTab}`}
      tabindex="-1"
      data-keyboard-focus="true"
    >
      {#if activeTab === 'rules'}
        <!--
        ONE IDENTITY CALLOUT (gap-list rows 129-131, `proto:1309-1317`). It used to be two stacked
        cards — an identity strip carrying the art, name, lock chip, source kebab, premise note and
        a drop target, and then a `SharedDefinitionCallout` under it. The reference draws one
        info-soft callout, and the source Item is authored on the world entry rather than here.
        See `ComponentIdentityStrip`'s own header for why both smoke hooks survive the change.
      -->
        <ComponentIdentityStrip
          {component}
          {saving}
          hasWorldEntry={Boolean(worldEntry)}
          memberCount={Number(worldEntry?.membershipCount) || 0}
          systemName={systemLabel}
          onOpenWorldEntry={() => onOpenWorldEntry(WORLD_ENTRY_ROUTE, worldEntry?.id)}
        />

        <!--
        D4. CATEGORY AND TAGS, SIDE BY SIDE (gap-list row 132, `proto:1319`). They were two
        full-width stacked cards; the reference draws them in one
        `minmax(0,1fr) minmax(0,1.3fr)` grid, which is what makes the tag card's two labelled
        groups fit beside a control that is one line high.
      -->
        <div class="manager-component-rules-duo">
          <!--
          D4.1. ONE CONTROL, IN THE BODY, FULL WIDTH (gap-list rows 133, 134, 135, 136, 143).
          The card used to float a select into its head, then repeat `Category [Inherited]` as a
          second labelled row with a toggle and the note beside it. The reference draws the head,
          then one full-width select whose FIRST option is `Inherit from world · {value}`, then the
          note directly under it. The `InheritRow` this replaces is untouched for its other callers.
        -->
          <section class="manager-component-rules-card" data-component-edit-section="category">
            <div class="manager-component-rules-card-head">
              <i
                class="fas fa-folder-open manager-component-rules-card-glyph is-accent"
                aria-hidden="true"
              ></i>
              <div>
                <h3>{text('FABRICATE.Admin.Manager.Component.Category.Title', 'Category')}</h3>
                <p class="manager-component-rules-card-sub">
                  {format(
                    'FABRICATE.Admin.Manager.Component.Category.Sub',
                    'World default, or a category from {system}.',
                    { system: systemLabel }
                  )}
                </p>
              </div>
            </div>
            <select
              class="manager-input manager-component-category-select"
              value={categorySelectValue}
              data-component-edit-category
              data-component-edit-category-locked={categoryLocked}
              aria-label={text(
                'FABRICATE.Admin.Manager.Component.Category.Label',
                'Component category'
              )}
              onchange={(event) => setCategorySelection(event.currentTarget.value)}
              disabled={saving}
            >
              {#if categoryInheritOffered}
                <option value={INHERIT_OPTION}>{categoryInheritLabel}</option>
              {/if}
              {#each effectiveCategoryOptions as option (option)}
                <option value={option}>{categoryLabel(option)}</option>
              {/each}
            </select>
            <!--
            THE NOTE IS DIRECTLY UNDER THE SELECT (gap-list row 143) and carries the model's own
            glyph and tone: `info` while inheriting, `warning` while overriding, subtle where the
            world authored nothing. The reference inks the inheriting branch with a raw pale-blue
            literal, which maps to the info token (LIBRARY-FORCED, recorded as E-4). The literal
            itself is not quoted here: the theme-colour contract scans prose as well as
            declarations, so writing the hex down would red that gate for a comment.
          -->
            <p
              class={`manager-component-cat-note is-${categoryNote.tone}`}
              data-component-edit-category-note={categoryNote.state}
            >
              <i class={categoryNote.icon} aria-hidden="true"></i>
              <span>{categoryNote.text}</span>
            </p>
          </section>

          <!--
          D4.2. TWO LABELLED TAG GROUPS AND A MERGE NOTE (gap-list row 137). The world tags were a
          card of their own, one panel away from the system's own flat chip grid; the reference
          draws them as the FIRST group inside this card, with the system's own beneath.

          THE WORLD GROUP IS READ-ONLY HERE, per D-r5: muting is authored on the world entry,
          where the list and its exceptions are visible together and where the projection reads
          the state back. The two PAINTS both apply either way, because a read-only chip must
          still show which tags are muted.

          == THE CAPTION IS `FROM THE WORLD`, AND THERE IS NO HEAD ACTION (M11) ================
          The reference captions the run `FROM THE WORLD · CLICK TO MUTE HERE` (`proto:1332`) and
          draws NO action in the card head (`proto:1329-1339`). Revision 5 kept the reference's
          caption and added an `Edit world tags` exit beside the title to make the instruction
          reachable. The maintainer ruled on both: the caption drops the clause the product cannot
          honour — an instruction a GM cannot follow is worse than a plain label — and the
          subject-only head action is DROPPED rather than kept, so the head is glyph + title +
          subtitle exactly as the reference draws it. The route to the world record has not gone:
          the attribution banner at the top of this editor is the same seam and still carries it.
        -->
          <section class="manager-component-rules-card" data-component-edit-section="tags">
            <div class="manager-component-rules-card-head">
              <i class="fas fa-tags manager-component-rules-card-glyph is-tag" aria-hidden="true"
              ></i>
              <div>
                <h3>{text('FABRICATE.Admin.Manager.Component.TagsEdit.Title', 'Tags')}</h3>
                <p class="manager-component-rules-card-sub">{tagCardSubtitle}</p>
              </div>
            </div>

            {#if worldEntry && worldTags.length > 0}
              <div class="manager-component-tag-group" data-component-edit-section="world-tags">
                <p class="manager-micro-label">
                  {text('FABRICATE.Admin.Manager.Component.WorldTags.GroupLabel', 'From the world')}
                </p>
                <div class="manager-component-tag-run" data-component-edit-world-tags>
                  {#each worldTags as tag (tag)}
                    <!-- `struck` is the reference's MUTED paint (`proto:5692`): a dashed hairline,
                       the `surface-soft` fill and a struck-through label. NOT `disabled` — the
                       `Chip` primitive joins `is-disabled` to the WARNING family, which would
                       paint a muted tag amber and read as a hazard the GM must act on.

                       `density="tag-run"` is the SCALE the same reference line states —
                       `padding: 5px 12px`, a stadium corner, `600 11px` — and it is the scale of
                       a chip that is a control rather than a badge. It composes with the two
                       paints above and shares no property with either, so a lit tag, a muted tag
                       and a struck one all render at one size. `info` rather than `tag` because
                       the reference inks the WORLD run blue and the system's OWN run purple
                       (`proto:5692` against `proto:5711`); the run below is the purple one. -->
                    <Chip
                      density="tag-run"
                      tone={worldMutedTags.includes(tag) ? 'muted' : 'info'}
                      struck={worldMutedTags.includes(tag)}
                      icon={worldMutedTags.includes(tag)
                        ? 'fas fa-eye-slash'
                        : 'fas fa-earth-americas'}
                      data-component-edit-world-tag={tag}
                      data-component-world-tag-muted={worldMutedTags.includes(tag)}>{tag}</Chip
                    >
                  {/each}
                </div>
              </div>
            {/if}

            <div class="manager-component-tag-group">
              <p class="manager-micro-label" data-component-own-tags-label>{ownTagLabel}</p>
              {#if tagDraft.length > 0}
                <!-- The pill IS the shared `Chip` (issue 772). `aria-pressed` is the state, not a
                   class. Written without internal whitespace: `Chip` records that call sites
                   assert on exact `textContent`.

                   THE LABEL ALONE, WITH NO LEADING GLYPH AND NO TRAILING STATE CIRCLE (UX F-F).
                   `proto:1337` draws this run as bare `<span>{{ t.name }}</span>` and carries the
                   selection in the chip's own fill; the world run one label above (`proto:1333`)
                   is the one that leads with an icon, and it still does. The pair this dropped
                   roughly doubled each chip's width, which is why eleven tags wrapped to four
                   rows here against the reference's one. Nothing accessible goes with them:
                   `aria-pressed` below is the state a screen reader reads, and the `tone` swap is
                   the reference's own visual mechanism for the same fact. -->
                <div class="manager-component-tag-run" data-component-edit-tags>
                  {#each tagDraft as option (option.tag)}
                    <Chip
                      tag="button"
                      type="button"
                      density="tag-run"
                      tone={option.checked ? 'tag' : 'neutral'}
                      aria-pressed={option.checked === true}
                      data-component-edit-tag-toggle={option.tag}
                      data-component-tag-checked={option.checked === true}
                      onclick={() => toggleTag(option.tag, option.checked !== true)}
                      disabled={saving}>{option.tag}</Chip
                    >
                  {/each}
                </div>
              {:else}
                <p class="manager-muted">
                  {text(
                    'FABRICATE.Admin.Manager.Component.TagsEdit.NoTags',
                    'This system defines no item tags.'
                  )}
                </p>
              {/if}
            </div>

            <!-- `proto:1338`: the merge note under BOTH groups, at 9.5px in the subtle ink. -->
            <p class="manager-component-tag-merge-note" data-component-edit-world-tags-note>
              {componentTagMergeNote(
                {
                  effective: tagDraft.filter((option) => option.checked).length,
                  muted: worldMutedTags.length,
                },
                format
              )}
            </p>
          </section>
        </div>

        <!--
        THE PROGRESSIVE DC CARD, DECLARED ONCE AND RENDERED IN ONE OF TWO PLACES.

        The reference draws it INSIDE the salvage card's progressive body (`proto:1396`,
        `rebuild-spec.md` D6.4), and that is where it renders whenever this system resolves
        SALVAGE progressively. It cannot live there unconditionally: the value is
        `component.difficulty`, ONE component-level scalar that THREE engines read — progressive
        recipes, progressive salvage and progressive gathering — so the root gates the card on
        `componentDifficultyAxisProgressive`, which is true on ANY of the three. Nesting it under
        salvage outright would hide it for every progressive-CRAFTING or progressive-GATHERING
        system whose salvage is simple or off, which is the exact configuration the smoke harness
        drives when it fills this input.

        A `{#snippet}` rather than two copies, so `data-component-edit-section="difficulty"` — the
        selector `scripts/foundry-test-run.mjs:11192` fills, and a step that is not waivable —
        resolves to exactly one element in every configuration.
      -->
        {#snippet progressiveDcCard()}
          {#if showDifficulty}
            <!-- "This component's Progressive DC" (issue 676). Rehomed out of the deleted
             right-rail inspector (decision 4, "nothing may be lost").
             `data-component-edit-section="difficulty"` is PRESERVED VERBATIM:
             `scripts/foundry-test-run.mjs` locates `[data-component-edit-section="difficulty"] input`
             and fills it, and that step is not waivable. `Stepper` renders a real
             `<input type="number">`, so that selector still resolves.

             ── WHY THIS IS A SIBLING SECTION AND NOT INSIDE SALVAGE ──────────────────
             The redesign prototype renders this card INSIDE the salvage panel, gated on
             the SALVAGE mode being progressive. Fabricate cannot: this value is
             `component.difficulty`, ONE component-level scalar that THREE engines read —
             progressive recipes, progressive salvage and progressive gathering — so the
             manager root gates the section on `componentDifficultyAxisProgressive`, which
             is true when the system is progressive on ANY of those three axes
             (`componentDifficultyShown` is that predicate plus the editor's own view and
             selection terms). Nesting the card under salvage would hide it for every
             progressive-CRAFTING or progressive-GATHERING system whose salvage is simple or
             disabled — the exact configuration the smoke harness drives when it fills this
             input. The browser row's read-only DC badge and the browser's bulk-edit
             progressive-DC section read the same axis predicate, so all three appear
             together (issue 772).

             STAGED, not written on change — the value rides the editor's draft and
             persists on Save, so it contributes to the dirty state and the exit guard.
             It is a SIBLING of `salvage`, never part of `updates.salvage`. -->
            <section
              class="manager-component-panel manager-component-inline-panel"
              data-component-edit-section="difficulty"
            >
              <div class="manager-task-card-heading">
                <div>
                  <!-- The card title uses its OWN key. `Component.ProgressiveDifficulty` is a SHORT
                   label shared with the browser badge (`${label} ${difficulty}` -> "Progressive
                   difficulty 2") and the evidence row, so it must not carry this sentence. -->
                  <h3>
                    {text(
                      'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyCardTitle',
                      'This component’s Progressive DC'
                    )}
                  </h3>
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyHint',
                      'Set once here — shown read-only wherever this component appears as a progressive result. Each salvage yield below carries its own DC, edited in its component.'
                    )}
                  </p>
                </div>
                <!-- `manager-task-card-heading-control` opts this wrapper OUT of the heading's
                 `> div { flex: 1 1 200px }` copy-block rule, which out-specifies the
                 wrapper's own `flex: 0 0 auto` and otherwise grows it to half the row —
                 stranding the stepper mid-card with dead space to its right. -->
                <div class="manager-component-inline-stepper manager-task-card-heading-control">
                  <span class="manager-component-micro-label"
                    >{text(
                      'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyMicro',
                      'DC'
                    )}</span
                  >
                  <Stepper
                    value={difficultyInputValue === '' ? 0 : difficultyInputValue}
                    min={0}
                    max={35}
                    ariaLabel={text(
                      'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel',
                      'Difficulty value'
                    )}
                    decrementLabel={text(
                      'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyDecrement',
                      'Decrease difficulty'
                    )}
                    incrementLabel={text(
                      'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyIncrement',
                      'Increase difficulty'
                    )}
                    disabled={saving}
                    onChange={(next) => handleDifficultyInput(next)}
                  />
                </div>
              </div>
            </section>
          {/if}
        {/snippet}

        {#if showEssences}
          <!--
        D5 (gap-list rows 138, 139). The card was titled `Essences` over "Set how much of each
        essence this component contributes" — a sentence about the CONTROL. The reference titles
        it `Essence contribution` and its subtitle states the thing a GM has to know before
        authoring one: these values are keyed to the essences THIS system uses, and a system that
        drops an essence drops them with it.
      -->
          <section class="manager-component-rules-card" data-component-edit-section="essences">
            <div class="manager-component-rules-card-head">
              <i
                class="fas fa-flask-vial manager-component-rules-card-glyph is-info"
                aria-hidden="true"
              ></i>
              <div>
                <h3>
                  {text(
                    'FABRICATE.Admin.Manager.Component.EssencesEdit.Title',
                    'Essence contribution'
                  )}
                </h3>
                <p class="manager-component-rules-card-sub">
                  {format(
                    'FABRICATE.Admin.Manager.Component.EssencesEdit.Hint',
                    'Keyed to the {count} essences {system} uses. A system that drops an essence drops these values with it.',
                    { count: essenceDraft.length, system: systemLabel }
                  )}
                </p>
              </div>
            </div>
            <!--
              THE INHERIT-OR-OVERRIDE CHOICE (issue 1371 r18-entry, maintainer ruling M31), which
              the reference does not draw: its essence card (`proto:1343-1356`) predates the world
              section, so this row is M31's extra on the card, measured against that reference. The
              control is the shared `InheritRow` — the primitive that owns "this system sets its
              own" — filtered to the one section this card governs, drawn INSIDE the card beside
              the values it locks, as the essence rules editor draws its own. ON is overridden. The
              note under it is the category note's own three-branch shape over the other section.
              Both are withheld while the world authored no map, when the switch would change
              nothing while looking as though it did.
            -->
            {#if essenceInheritOffered}
              <InheritRow
                entityType="component"
                section="essences"
                inherited={{ essences: essenceInheritStaged }}
                disabled={saving}
                onToggle={(_section, nextInherit) => setEssenceInheritance(nextInherit)}
              />
            {/if}
            <p
              class={`manager-component-cat-note is-${essenceNote.tone}`}
              data-component-edit-essence-note={essenceNote.state}
            >
              <i class={essenceNote.icon} aria-hidden="true"></i>
              <span>{essenceNote.text}</span>
            </p>
            {#if essenceDraft.length > 0}
              <div class="manager-component-essence-grid">
                {#each offeredEssences as option (option.id)}
                  <!-- The card is the shared `EssenceQuantityCard` (issue 772). It was
                     hand-rolled here — a `manager-icon-button` −, a raw
                     `<input type="number">` and a + — and the bulk-edit panel renders the
                     same card, so it was extracted rather than copied. Its number control
                     is now the shared `Stepper`, which is why the keyboard, clamp and
                     commit behaviour matches the progressive DC above.

                     `adjustEssence` is no longer called from here: `Stepper` emits the
                     already-clamped ABSOLUTE value for both its adjuncts and its typed
                     input, so one `setEssenceQuantity` covers every path. -->
                  <!-- LOCKED WHILE INHERITING (M31): the tile shows the WORLD value and its stepper
                     is inert, exactly as the category select is pinned to the inherit option. -->
                  <EssenceQuantityCard
                    id={option.id}
                    name={option.name}
                    icon={option.icon}
                    quantity={essenceLocked ? (worldEssenceMap[option.id] ?? 0) : option.quantity}
                    disabled={saving || essenceLocked}
                    ariaLabel={text(
                      'FABRICATE.Admin.Items.Editor.QuantityLabel',
                      'Quantity for {name}'
                    ).replace('{name}', option.name)}
                    decrementLabel={text(
                      'FABRICATE.Admin.Items.Editor.DecrementEssence',
                      'Decrement {name}'
                    ).replace('{name}', option.name)}
                    incrementLabel={text(
                      'FABRICATE.Admin.Items.Editor.IncrementEssence',
                      'Increment {name}'
                    ).replace('{name}', option.name)}
                    colorToken={option.colorToken || ''}
                    onChange={(quantity) => setEssenceQuantity(option.id, quantity)}
                  />
                {/each}
              </div>
            {:else}
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Component.EssencesEdit.NoEssences',
                  'No essences are defined for this system yet.'
                )}
              </p>
            {/if}
          </section>
        {/if}

        <!-- The yield picker, shared by BOTH salvage result rows (issue 676). A `{#snippet}`
         rather than a new `.svelte` file for two reasons: the two call sites differ only
         in which group they write to, and a new component would have to be registered in
         every mount harness that renders this tree (a missing entry HANGS the suite
         rather than failing it). SearchablePopover is already in all of them.

         WHY NOT A `<select>`: the native control could show the component's NAME but never
         its IMAGE, so the GM picked yields from a text list while every other component
         surface in the studio shows the art. The trigger wraps the image AND the name —
         one target, both facts — and the popover is portaled to `.fabricate-manager`, so
         it escapes the panel's `overflow: hidden` (a naive absolute popover clips).

         There is deliberately no "clear" entry, matching RecipeResultItemRow: the select's
         old blank `<option>` only ever produced a result that names no component, and the
         row's × removes it properly. -->
        {#snippet salvageComponentPicker(groupId, result)}
          {@const selected = salvageComponentOption(result.componentId)}
          <span class="manager-salvage-component-field" data-salvage-result-component>
            <SearchablePopover
              options={salvageComponentPickerOptions}
              value={result.componentId}
              disabled={saving}
              pickerClass="manager-salvage-component-picker"
              triggerClass="manager-button manager-salvage-component-trigger"
              triggerImg={selected?.img || ''}
              triggerIcon={selected?.img ? '' : 'fas fa-cube'}
              triggerLabel={selected?.name ||
                text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.SelectComponent',
                  'Select a component'
                )}
              valueClass="manager-salvage-component-name"
              triggerTitle={selected?.name || ''}
              triggerAriaLabel={text(
                'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultComponent',
                'Result component'
              )}
              dialogAriaLabel={text(
                'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultComponent',
                'Result component'
              )}
              searchPlaceholder={text(
                'FABRICATE.Admin.Manager.Component.SalvageEditor.ComponentSearchPlaceholder',
                'Search components...'
              )}
              searchAriaLabel={text(
                'FABRICATE.Admin.Manager.Component.SalvageEditor.ComponentSearchPlaceholder',
                'Search components...'
              )}
              emptyHint={text(
                'FABRICATE.Admin.Manager.Component.SalvageEditor.NoComponentsDefined',
                'No components defined'
              )}
              onChoose={(id) => updateSalvageResult(groupId, result.id, { componentId: id })}
            />
          </span>
        {/snippet}

        {#if showSalvage}
          <section
            class="manager-component-rules-card"
            data-component-edit-section="salvage"
            data-salvage-section
          >
            <!-- THE HEADING IS THE CONTROL ROW (issue 676): mode pill · divider · ENABLED ·
             toggle, all on the heading line. It used to be a heading with the pill, and
             then a whole separate "Salvage this component" ToggleCard below it — two
             stacked rows of chrome restating one fact before any content, on a panel
             whose actual subject is the yield list. -->
            <div class="manager-component-rules-card-head">
              <i
                class="fas fa-recycle manager-component-rules-card-glyph is-accent"
                aria-hidden="true"
              ></i>
              <div>
                <h3>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Title', 'Salvage')}</h3>
                <p class="manager-component-rules-card-sub">
                  {format(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.Hint',
                    'What this component yields when it is broken down in {system}.',
                    { system: systemLabel }
                  )}
                </p>
              </div>
              <!-- `data-recipe-section` / `data-recipe-field` are ToggleCard's hooks, kept
               verbatim now the toggle is hand-rolled into the heading: they are what the
               AC4/AC9/AC10 suites drive, and those pin the salvage ENABLEMENT rulings
               (the dirty-baseline, the zero-group deadlock, the removal clamp) rather
               than the vehicle. Renaming them would have silently unpinned all of it. -->
              <!-- `manager-task-card-heading-control`: see the DC card's note. Without it the
               heading's `> div` copy-block rule grows this cluster to half the row and the
               pill/ENABLED/toggle left-align inside the grown box. -->
              <div
                class="manager-component-heading-controls manager-task-card-heading-control"
                data-recipe-section="salvage-enabled"
              >
                {#if salvageModeLabel}
                  <!-- Read-only: the mode is a SYSTEM setting, authored on Crafting Settings.
                   It names the mode that decides this panel's shape, which the GM
                   otherwise cannot see from this route. `routed` is displayed as "Routed
                   by check"; the persisted token is never shown.

                   EXEMPT FROM RULING A, deliberately (it is NOT gated on
                   `salvageShowChrome`). Ruling A collapses the chrome that only has
                   meaning once salvage RUNS — mode/DC/routing/reorder. The mode PILL is
                   not that: it names the shape of the editor the GM is looking at right
                   now, and the result editor below stays authorable while salvage is
                   off. Hiding it meant authoring an ordered progressive list, or a
                   routed set of groups, with nothing on screen saying which — precisely
                   when the panel is at its most confusing. -->
                  <!-- `proto:5721`: the reference's MICRO pill helper (`pill()`, `proto:3893`) — a
                   `surface-soft` fill, the `--fab-border` hairline, the secondary ink and
                   `padding: 2px 8px` at `600 9.5px` on a stadium corner. Not the info family: the
                   mode is a fact about the system, not a state the GM must act on.

                   `density="list"` is that micro scale on the primitive, as it is for the
                   identity pill above; the remaining half-pixel of type is the primitive's, not
                   this call site's.

                   `tone="secondary"` is the helper's three colours, and it is genuinely a
                   different statement from the `neutral` this shipped with for a round. Neutral
                   inks `--fab-text-muted`, declares no fill at all, and has two dozen callers
                   meaning "a fact that is merely present", so the pill sat on whatever surface
                   was behind it. The mode is a step louder — it names the rule that decides this
                   panel's shape, on a surface of its own — and a step quieter than every
                   semantic family. -->
                  <Chip
                    density="list"
                    tone="secondary"
                    icon={salvageModeOption?.icon || ''}
                    class="manager-salvage-mode-pill"
                    data-salvage-mode={salvageResolutionMode}
                  >
                    <span>{salvageModeLabel}</span>
                  </Chip>
                  <span class="manager-component-heading-divider" aria-hidden="true"></span>
                {/if}
                <span class="manager-component-micro-label"
                  >{text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.EnabledMicro',
                    'Enabled'
                  )}</span
                >
                <!-- The per-component salvage gate (issue 676). It was persisted, normalized
                 and a live runtime gate long before any control wrote it, so a component
                 auto-disabled by `_disableInvalidSalvageConfigs` was permanently
                 unsalvageable from the UI. This toggle is the fix.

                 The zero-groups explanation is VISIBLE body copy
                 (`[data-salvage-disabled-notice]`), never a `title` on this button: a
                 DISABLED <button> receives no mouse events, so a tooltip would never
                 appear in any browser — and no mounted test would notice, because the
                 attribute IS in the DOM. -->
                <!-- The shared switch, so this card and `ToggleCard` draw one control rather
                 than two spellings of it (issue 1040). The hand-rolled version this replaced
                 omitted `aria-hidden` on its track, which the primitive always emits: the
                 track and knob are decoration and the button's own `aria-label` is the name. -->
                <StatusToggle
                  on={salvageEnabled}
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.Enable',
                    'Salvage this component'
                  )}
                  disabled={salvageToggleDisabled}
                  data-recipe-field="salvageEnabled"
                  onclick={() => setSalvage({ enabled: !salvageEnabled })}
                />
              </div>
            </div>

            {#if !salvageEnabled}
              <p class="manager-muted" data-salvage-disabled-notice>{salvageDisabledNotice}</p>
            {/if}

            <!-- The banner and the reorder policy sit ABOVE the list, not after it (issue
             676): both describe what the ORDER MEANS, and the order is the thing being
             authored below. The reorder card used to render at the very bottom, after
             "Add group" — the GM read the policy governing the list only after they had
             finished writing it. -->
            {#if salvageShowChrome && salvageProgressive}
              <!-- `proto:1374`: the shared info `Callout`, in the reference's own words. The
               hand-rolled `manager-component-info-banner` said the same thing in a second
               vehicle. -->
              <Callout
                tone="info"
                icon="fas fa-circle-info"
                dataAttr="data-salvage-roll-budget"
                text={text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.RollBudget',
                  'Roll budget flows down the list: each result is claimed in order while the check total still covers its DC.'
                )}
              />

              <!-- Progressive-only: the flag has no meaning in the simple/routed salvage
               modes, which award a whole group rather than spending down a list. -->
              <ToggleCard
                variant="is-info"
                icon="fas fa-arrow-down-a-z"
                section="salvage-allow-player-result-reorder"
                field="salvageAllowPlayerResultReorder"
                title={text(
                  'FABRICATE.Admin.Manager.Component.SalvageReorder.Title',
                  'Allow player result re-ordering'
                )}
                sub={text(
                  'FABRICATE.Admin.Manager.Component.SalvageReorder.Sub',
                  'Let players drag the salvage order at the table; off keeps this GM order fixed.'
                )}
                toggleLabel={text(
                  'FABRICATE.Admin.Manager.Component.SalvageReorder.Toggle',
                  'Allow player result re-ordering'
                )}
                on={salvageDraft.allowPlayerResultReorder !== false}
                disabled={saving}
                onToggle={(next) => setSalvage({ allowPlayerResultReorder: next === true })}
              />
            {/if}

            <Field as="div" data-salvage-result-groups="">
              {#if salvageProgressive}
                <!-- PROGRESSIVE: an ordered list of SINGLE results, with no group chrome.
               See `salvageStageGroup` for why the groups are still the storage and why
               this list is `resultGroups[0].results`. -->
                <span class="manager-component-readonly-label">
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.Results',
                      'Results'
                    )}</span
                  >
                </span>
                {#if salvageStages.length > 0}
                  <ul class="manager-salvage-stage-list">
                    {#each salvageStages as result, stageIndex (result.id)}
                      {@const stageComplications = salvageComplicationsFor(result.componentId)}
                      <li
                        class={`manager-salvage-stage-row ${draggingStageIndex === stageIndex ? 'is-dragging' : ''}`}
                        data-salvage-result={result.id}
                        data-salvage-stage={String(stageIndex + 1)}
                        draggable={saving ? 'false' : 'true'}
                        ondragstart={() => onStageDragStart(stageIndex)}
                        ondragover={(event) => event.preventDefault()}
                        ondrop={(event) => {
                          event.preventDefault();
                          onStageDrop(stageIndex);
                        }}
                        ondragend={() => {
                          draggingStageIndex = null;
                        }}
                      >
                        <!-- The stage's own LINE (issue 1286). `display: contents` unless this row
                       draws a complication band, so on every other stage the grip, the ordinal,
                       the picker and the trailing cluster are the ROW's flex items exactly as
                       they were before this element existed, and every rule keyed on
                       `.manager-salvage-stage-row` still matches them. With a band the line
                       becomes the real row and takes the padding the row gives up, which is what
                       lets the band below it run edge to edge. -->
                        <div class="manager-salvage-stage-line">
                          <span class="manager-salvage-stage-grip" aria-hidden="true"
                            ><i class="fas fa-grip-vertical"></i></span
                          >
                          <span
                            class="manager-salvage-result-ordinal"
                            data-salvage-result-ordinal={String(stageIndex + 1)}
                            aria-hidden="true">{stageIndex + 1}</span
                          >
                          {@render salvageComponentPicker(salvageStageGroup.id, result)}

                          <!-- NO QUANTITY HERE (issue 676). Progressive is an ordered list of
                       INDIVIDUAL results: the award loop charges this entry's difficulty
                       once and awards it once, so "two of X" is authored by listing X
                       twice, never by a count. The ENGINE enforces it —
                       `CraftingEngine._resolveSalvageResultGroups` forces `quantity: 1` on
                       every awarded progressive entry, exactly as
                       `ResolutionModeService._resolveProgressive` always has for recipes.
                       The control was removed only AFTER that, so this hides nothing a
                       world can still be awarded. -->

                          <!-- READ-ONLY: `difficulty` belongs to the RESULT component, whose own
                       editor owns its save lifecycle; this surface is editing a
                       different component. The "Edit" link is the way to change it. -->
                          <span
                            class="manager-salvage-result-difficulty"
                            data-salvage-result-difficulty={salvageResultDifficulty(
                              result.componentId
                            ) === null
                              ? ''
                              : String(salvageResultDifficulty(result.componentId))}
                            ><!-- The fallback must MATCH the lang value, or the two disagree and the
                       fallback silently describes a string nobody ever sees: `lang/en.json`
                       resolves `DifficultyUnset` to "No difficulty", so the literal "DC —"
                       here only ever rendered in a test with no i18n loaded. The recipe
                       stage row (issue 676) reads the same, which is the point. -->
                            {salvageResultDifficulty(result.componentId) === null
                              ? text(
                                  'FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyUnset',
                                  'No difficulty'
                                )
                              : `${text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyShort', 'DC')} ${salvageResultDifficulty(result.componentId)}`}</span
                          >

                          {#if result.componentId}
                            <!-- Opens the referenced YIELD component's editor — the IN-MANAGER
                         component-edit view, not the standalone SvelteComponentEditorApp
                         window. Component -> component navigation is guarded
                         (confirmComponentRouteExit deliberately has no component-edit
                         bypass), so a dirty draft prompts rather than being discarded. -->
                            <button
                              type="button"
                              class="manager-salvage-stage-edit"
                              data-salvage-result-edit={result.componentId}
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Component.SalvageEditor.EditResult',
                                'Edit {name}'
                              ).replace('{name}', salvageComponentName(result.componentId))}
                              title={text(
                                'FABRICATE.Admin.Manager.Component.SalvageEditor.EditDcHint',
                                'Set on this component in its editor'
                              )}
                              onclick={() => onOpenComponent(result.componentId)}
                              disabled={saving}
                            >
                              <span
                                >{text(
                                  'FABRICATE.Admin.Manager.Component.SalvageEditor.Edit',
                                  'Edit'
                                )}</span
                              >
                              <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                            </button>
                          {/if}

                          <!-- Drag is an ENHANCEMENT; the chevrons are the accessible reorder
                       path and are what a keyboard user gets. Disabled at the ends. -->
                          <span class="manager-salvage-stage-reorder">
                            <button
                              type="button"
                              class="manager-salvage-stage-move"
                              data-salvage-stage-up
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Component.SalvageEditor.MoveUp',
                                'Move up'
                              )}
                              disabled={saving || stageIndex === 0}
                              onclick={() => moveSalvageStage(stageIndex, -1)}
                              ><i class="fas fa-chevron-up" aria-hidden="true"></i></button
                            >
                            <button
                              type="button"
                              class="manager-salvage-stage-move"
                              data-salvage-stage-down
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Component.SalvageEditor.MoveDown',
                                'Move down'
                              )}
                              disabled={saving || stageIndex === salvageStages.length - 1}
                              onclick={() => moveSalvageStage(stageIndex, 1)}
                              ><i class="fas fa-chevron-down" aria-hidden="true"></i></button
                            >
                          </span>

                          <IconButton
                            class="is-danger"
                            ariaLabel={text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveResult',
                              'Remove result'
                            )}
                            data-remove-salvage-result=""
                            onclick={() => removeSalvageStage(result.id)}
                            disabled={saving}
                          >
                            <i class="fas fa-xmark" aria-hidden="true"></i>
                          </IconButton>
                        </div>

                        <!-- ── THE READ-ONLY COMPLICATION STRIP (issue 1286) ────────────────────
                     INSIDE the stage row and FULL-BLEED, which is how the Recipe Studio draws
                     the same band (see `recipe/RecipeResultItemRow.svelte`). The row and the
                     band are ONE card: one border, one radius, and the band's `border-top` as
                     the divider between them rather than a second box below the first.

                     THIS OVERRIDES THE COMPONENT STUDIO PROTOTYPE, deliberately. That document
                     tucks the band 5px under the row, indents it past the grip and gives it its
                     own `0 9px 9px 0` border, so the two studios drew one fact two ways — which
                     is the drift the joined stage-row rule was written to end (issue 676). The
                     maintainer ruled for the attached treatment, so the prototype's detached
                     band is a SUPERSEDED design rather than a fidelity target; the ruling is
                     recorded in tmp/progressive-component-complications/component-studio.parity.mjs.

                     Attaching it costs the shared rule nothing. `.manager-salvage-stage-row` is
                     JOINED with `.manager-recipe-result-row.is-reorderable` (the join is
                     deliberate, and recorded as such in styles/fabricate.css), so relaxing it to
                     fit a band inside would re-shape every progressive stage row in BOTH
                     studios. Instead the row hands its padding to
                     `.manager-salvage-stage-line` and becomes a column ONLY under
                     `:has(.manager-salvage-stage-complications)` — see the scoped rules at the
                     foot of this file. A stage with no band matches neither selector, its line
                     stays `display: contents`, and it renders exactly as it did before.

                     `role="presentation"` stays. It is no longer load-bearing against the list
                     — the band lives inside the stage's own `<li>` now, rather than being a
                     second one — but the band annotates the stage above it and must never be
                     announced as a stage of its own, so the annotation stays to stop the next
                     move of this markup from re-creating that bug. -->
                        {#if stageComplications.length > 0}
                          <div
                            class="manager-salvage-stage-complications"
                            role="presentation"
                            data-salvage-stage-complications={result.componentId}
                          >
                            <div class="manager-salvage-stage-complications-head">
                              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                              <span class="manager-salvage-stage-complications-title"
                                >{stripTitle(stageComplications.length, result.componentId)}</span
                              >
                              <!-- The ONLY route to changing any of this, exactly as the row's DC
                             badge above is: a complication belongs to the referenced
                             component, whose own editor owns its save lifecycle. Its label
                             names complications so it is distinguishable from the row's own
                             Edit link, which targets the same component for its DC. -->
                              <button
                                type="button"
                                class="manager-salvage-stage-edit"
                                data-salvage-stage-complications-edit={result.componentId}
                                aria-label={text(
                                  'FABRICATE.Admin.Manager.Component.Complications.StripEdit',
                                  'Edit complications on {name}'
                                ).replace('{name}', salvageComponentName(result.componentId))}
                                title={text(
                                  'FABRICATE.Admin.Manager.Component.Complications.StripEdit',
                                  'Edit complications on {name}'
                                ).replace('{name}', salvageComponentName(result.componentId))}
                                onclick={() => onOpenComponent(result.componentId)}
                                disabled={saving}
                              >
                                <span
                                  >{text(
                                    'FABRICATE.Admin.Manager.Component.SalvageEditor.Edit',
                                    'Edit'
                                  )}</span
                                >
                                <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                              </button>
                            </div>
                            <!-- No `severityLabel`: this prototype draws severity as the coloured
                           dot alone, which is the row's severity TILE. The Recipe Studio's
                           strip draws the word too, and passes it. -->
                            {#each stageComplications as complication (complication.id)}
                              <ComplicationSummaryRow
                                variant="readonly-gm"
                                nameEmphasis="inline"
                                name={complication.name}
                                severity={complication.severity}
                                visibility={complication.visibility}
                                playerLabel={text(
                                  'FABRICATE.Admin.Manager.Component.Complications.PlayerPill',
                                  'Player'
                                )}
                                playerTitle={text(
                                  'FABRICATE.Admin.Manager.Component.Complications.PlayerPillTitle',
                                  'Shown to the player when it fires.'
                                )}
                                triggerSentence={complicationStripSummary(complication)}
                                dataAttr="data-salvage-stage-complication"
                                dataValue={complication.id}
                              />
                            {/each}
                          </div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.NoResultsYet',
                      'No results yet.'
                    )}
                  </p>
                {/if}
                <!-- `data-add-salvage-group` rides this button ONLY while there is no backing
               group, because in that state this IS the add-group control: it is what
               takes a progressive component from zero groups to one, which the
               normalizer's clamp requires before `enabled` can ever be true. That is
               Ruling A's invariant in progressive mode, and it stays literally testable. -->
                <ManagerButton
                  role="dashed"
                  fullWidth
                  data-add-salvage-result
                  data-add-salvage-group={salvageStageGroup ? undefined : ''}
                  onclick={() => addSalvageStage()}
                  disabled={saving}
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult',
                      'Add result'
                    )}</span
                  >
                </ManagerButton>
                <!-- `proto:1396`: the reference closes the progressive body with this component's own
                 DC row. See the snippet's declaration for why it is rendered here rather than
                 nested unconditionally. -->
                {#if showDifficulty}
                  {@render progressiveDcCard()}
                {/if}
              {:else}
                <span class="manager-component-readonly-label">
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultGroups',
                      'Result groups'
                    )}</span
                  >
                </span>
                {#if salvageSimpleMode}
                  <!-- REQUIRED visible hint (issue 764), never a `title`: this editor's own
                 doctrine (the `salvageDisabledNotice` precedent) is that a tooltip on a
                 hidden/absent control never fires and no mounted test would notice. It
                 explains why the Add group control is gone at the one-group cap. -->
                  <p class="manager-muted" data-salvage-simple-hint>
                    {text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.SimpleSingleGroupHint',
                      'Simple mode uses a single result group.'
                    )}
                  </p>
                {/if}
                {#if salvageDraft.resultGroups.length > 0}
                  <ul class="manager-recipe-ingredient-sets">
                    {#each salvageDraft.resultGroups as group, groupIndex (group.id)}
                      <!-- `proto:1404`: one `--fab-bg-1` card per result group behind a hairline,
                       headed by the group's name and its count in the mono face.

                       THE HEAD KEEPS ITS NAME INPUT AND THE BODY KEEPS ITS ROWS. The reference
                       draws this group as a read-only run of `{name} ×{qty}` pills with a dashed
                       `+ Add result` beside them — which is the reference's own STATIC markup and
                       cannot author a quantity, choose a component or rename a group. Replacing
                       the shipped editor with it would delete three capabilities to gain a paint,
                       so the card, its head and its count take the reference's anatomy and the
                       controls inside stay controls. Reported to the driver as the one place in
                       Part D where the reference's markup is not an editor. -->
                      <li class="manager-salvage-group-card" data-salvage-group={group.id}>
                        <div class="manager-salvage-group-header">
                          <input
                            type="text"
                            class="manager-input"
                            value={group.name}
                            placeholder={text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder',
                              'Group {n}'
                            ).replace('{n}', String(groupIndex + 1))}
                            aria-label={text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupName',
                              'Result group name'
                            )}
                            data-salvage-group-name
                            oninput={(event) =>
                              updateSalvageGroup(group.id, { name: event.currentTarget.value })}
                            disabled={saving}
                          />
                          <!-- `proto:1405`: the group's own count, in the mono face at weight 500 —
                           the face ships 400 and 500 only, so the reference's 700 lands on 500. -->
                          <span class="manager-salvage-group-count" data-salvage-group-count
                            >{(group.results || []).length}</span
                          >
                          <IconButton
                            class="is-danger"
                            ariaLabel={text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveGroup',
                              'Remove result group'
                            )}
                            data-remove-salvage-group=""
                            onclick={() => removeSalvageGroup(group.id)}
                            disabled={saving}
                          >
                            <i class="fas fa-xmark" aria-hidden="true"></i>
                          </IconButton>
                        </div>

                        {#if (group.results || []).length > 0}
                          <ul class="manager-salvage-result-list">
                            {#each group.results as result (result.id)}
                              <li
                                class="manager-salvage-result-row"
                                data-salvage-result={result.id}
                              >
                                {@render salvageComponentPicker(group.id, result)}
                                <!-- The quantity STAYS in simple/routed: these modes award the
                               whole group as authored, so a count is a real, honoured
                               field here. Only progressive drops it. -->
                                <Stepper
                                  value={result.quantity}
                                  min={1}
                                  ariaLabel={text(
                                    'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultQuantity',
                                    'Quantity for {name}'
                                  ).replace('{name}', salvageComponentName(result.componentId))}
                                  decrementLabel={text(
                                    'FABRICATE.Admin.Manager.Component.SalvageEditor.DecrementResult',
                                    'Decrease quantity'
                                  )}
                                  incrementLabel={text(
                                    'FABRICATE.Admin.Manager.Component.SalvageEditor.IncrementResult',
                                    'Increase quantity'
                                  )}
                                  max={9999}
                                  disabled={saving}
                                  inputProps={{
                                    'data-salvage-result-quantity': '',
                                    class: 'fab-stepper-input manager-component-stepper-quantity',
                                  }}
                                  onChange={(next) =>
                                    updateSalvageResult(group.id, result.id, {
                                      quantity: clampSalvageQuantity(next),
                                    })}
                                />
                                <IconButton
                                  class="is-danger"
                                  ariaLabel={text(
                                    'FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveResult',
                                    'Remove result'
                                  )}
                                  data-remove-salvage-result=""
                                  onclick={() => removeSalvageResult(group.id, result.id)}
                                  disabled={saving}
                                >
                                  <i class="fas fa-xmark" aria-hidden="true"></i>
                                </IconButton>
                              </li>
                            {/each}
                          </ul>
                        {:else}
                          <p class="manager-muted">
                            {text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.NoResults',
                              'No results in this group yet.'
                            )}
                          </p>
                        {/if}

                        <ManagerButton
                          role="dashed"
                          fullWidth
                          data-add-salvage-result
                          onclick={() => addSalvageResult(group.id)}
                          disabled={saving}
                        >
                          <i class="fas fa-plus" aria-hidden="true"></i>
                          <span
                            >{text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult',
                              'Add result'
                            )}</span
                          >
                        </ManagerButton>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.NoGroups',
                      'No result groups yet.'
                    )}
                  </p>
                {/if}
                <!-- HIDDEN at the Simple one-success-group cap (issue 764). Routed keeps the
               multi-group list and this Add control; Simple with no success group yet
               still shows it so the GM can author the one group. -->
                {#if !salvageHideAddGroup}
                  <ManagerButton
                    role="dashed"
                    fullWidth
                    data-add-salvage-group
                    onclick={() => addSalvageGroup()}
                    disabled={saving}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Component.SalvageEditor.AddGroup',
                        'Add group'
                      )}</span
                    >
                  </ManagerButton>
                {/if}
              {/if}
            </Field>

            <!-- RULING A: everything below is CHROME — it only has meaning once salvage
             runs, so it collapses when salvage is off. The result-group editor above
             deliberately does NOT, because it owns the only add-group control. -->
            {#if salvageShowChrome && salvageRouted}
              <!-- `proto:1417`: a `--fab-bg-1` well behind a hairline, headed by an `OUTCOME
               ROUTING` micro-label and holding one row per outcome — a fixed 120px label against
               a full-width select. The shipped block wrote the head as a readonly label with a
               sentence under it; the reference draws neither, because the rows say it. -->
              <Field as="div" class="manager-salvage-routing-card" data-salvage-routing="">
                <p class="manager-micro-label">
                  {text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.Routing',
                    'Outcome routing'
                  )}
                </p>
                {#if salvageOutcomeNames.length > 0}
                  <div class="manager-salvage-routing-list">
                    {#each salvageOutcomeNames as outcomeName (outcomeName)}
                      <label class="manager-salvage-routing-row">
                        <span>{outcomeName}</span>
                        <select
                          class="manager-input"
                          value={salvageDraft.outcomeRouting[outcomeName] || ''}
                          data-salvage-route={outcomeName}
                          onchange={(event) =>
                            setSalvageRoute(outcomeName, event.currentTarget.value)}
                          disabled={saving}
                        >
                          <option value=""
                            >{text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.Unrouted',
                              'Unrouted'
                            )}</option
                          >
                          {#each salvageDraft.resultGroups as group, groupIndex (group.id)}
                            <option value={group.id}
                              >{group.name ||
                                text(
                                  'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder',
                                  'Group {n}'
                                ).replace('{n}', String(groupIndex + 1))}</option
                            >
                          {/each}
                        </select>
                      </label>
                    {/each}
                  </div>
                {:else}
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.NoOutcomes',
                      'The routed salvage check has no outcome tiers to route yet.'
                    )}
                  </p>
                {/if}
              </Field>
            {/if}

            <!-- The component's own check-modifier pick (issue 1095). Rendered only under the
             salvage check's `bySubject` rule — the one rule that hands the selection to
             this component — and only when the system catalogue is non-empty.

             ITS GATE IS ITS OWN, NOT THE DC OVERRIDE'S. It used to be nested inside
             `salvageShowDcOverride`, which is `simple || routed` and therefore EXCLUDES
             progressive — but `ChecksView` renders the salvage catalogue card in the
             progressive branch too, and `CraftingEngine._runSalvageCraftingCheck` builds the
             modifier context before dispatch, so a progressive salvage roll honours a pick
             no editor could author. Two different questions: "does this mode compare a roll
             against a DC" and "does this component select its own modifiers". The gathering
             host gates on the rule alone, and one shared component with two disagreeing
             hosts is the drift this comment exists to stop. -->
            {#if salvageShowChrome && salvageCheckEnabled && salvageModifierPolicy === 'bySubject'}
              <SubjectModifierPicker
                options={checkModifierOptions}
                selectedIds={salvageDraft.checkModifierIds}
                maxPicks={salvageModifierMaxPicks}
                inheritedIds={salvageModifierDefaultIds}
                disabled={saving}
                subject="component"
                testId="salvage-check-modifier"
                onChange={(next) => setSalvage({ checkModifierIds: next })}
              />
            {/if}

            {#if salvageShowChrome && salvageShowDcOverride}
              <!-- `proto:1429`: a `--fab-bg-1` well titled `Salvage check DC`, whose note names
               where the presets come from. The shipped block was titled `DC override` over
               "Leave blank to use the system salvage check default" — a sentence about the
               STORAGE rather than about the choice. -->
              <Field as="div" class="manager-salvage-dc-card" data-salvage-dc-override="">
                <div class="manager-salvage-dc-copy">
                  <span class="manager-salvage-dc-title"
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverride',
                      'Salvage check DC'
                    )}</span
                  >
                  <span class="manager-salvage-dc-note"
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverrideHint',
                      'Preset tiers come from this system’s Checks screen.'
                    )}</span
                  >
                </div>
                <!-- Presets are the SYSTEM'S authored salvage check tiers (decision 7),
                 never a hard-coded DC list — that would misreport the world's real
                 DCs. Storage is unchanged: null = system default, else an integer. -->
                <select
                  class="manager-input"
                  value={salvageDcSelection}
                  data-salvage-dc-preset
                  aria-label={text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverride',
                    'DC override'
                  )}
                  onchange={(event) => setSalvageDcSelection(event.currentTarget.value)}
                  disabled={saving}
                >
                  {#each salvageDcOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
                {#if salvageDcShowCustomInput}
                  <!-- `allowUnset`: a cleared field is not zero here, it is "inherit the
                   system salvage check DC" — the same `dcOverride: null` the preset
                   select writes for its default option.

                   `min={0}`: a salvage DC below zero is not a DC, and an unset field
                   steps from `min ?? 0`, so without it one click of `−` on the blank
                   field commits -1. The bare input this replaced had no `min` either,
                   but it also had no live decrement button.

                   `fill` needs a slot, and this one is supplied by the
                   `[data-salvage-dc-override] .fab-stepper` cap in the global sheet. The
                   field is a `.manager-field` (a `flex-direction: column` box) whose
                   other child is a full-width preset `<select>`, so the cap sits on the
                   stepper rather than on the field. -->
                  <Stepper
                    value={salvageDraft.dcOverride}
                    allowUnset
                    step={1}
                    min={0}
                    fill
                    disabled={saving}
                    {...stepperLabels(
                      text(
                        'FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustomLabel',
                        'Custom salvage DC'
                      )
                    )}
                    inputProps={{ 'data-salvage-dc-custom': '' }}
                    onChange={setSalvageDcOverride}
                  />
                {/if}
                <!-- Kept by decision 7 (it replaced the hard-coded tier list, not this
                 link). The zero-authored-tiers case is the COMMON one and is exactly
                 why it exists: with no presets to choose, this is the way forward. -->
                <ManagerButton
                  class="manager-salvage-manage-presets"
                  data-salvage-manage-presets
                  onclick={() => onManageCheckPresets()}
                  disabled={saving}
                >
                  <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.ManagePresets',
                      'Manage presets'
                    )}</span
                  >
                </ManagerButton>
              </Field>
            {/if}
          </section>
        {/if}

        <!--
      THE PROGRESSIVE DC CARD'S OTHER PLACEMENT. The reference draws it inside the progressive
      salvage body and nowhere else, because the reference has no configuration where this
      component carries a DC and salvage is not progressive. Fabricate does — a
      progressive-CRAFTING or progressive-GATHERING system whose salvage is simple or off — and
      it is the configuration the smoke harness drives. So the card renders here in exactly the
      states the reference never draws, immediately after the card it belongs to.
    -->
        {#if showDifficulty && !(showSalvage && salvageProgressive)}
          {@render progressiveDcCard()}
        {/if}

        <!-- COMPLICATIONS (issue 1286), last in the body and after Salvage, as the prototype
         orders it: it is a consequence of how this component's stages resolve, so it reads
         after the yields it can attach to rather than before them.

         IT HAS NO REFERENCE COUNTERPART AT ALL (gap-list row 148): the word "complication"
         occurs once in the whole reference bundle, in an unrelated gathering `Events` stub. It
         is left exactly where it is and NOT restyled, per `rebuild-spec.md` D10: it needs a
         maintainer ruling — either an M-number licensing it as a Fabricate capability the
         reference never covered, or its removal — and restyling something whose existence is
         unsettled would make the ruling harder to take.

         Placed UNCONDITIONALLY. The section renders nothing at all unless the system
         resolves some activity progressively, and stating that predicate a second time here
         is how the two drift apart. -->
        <ComponentComplicationsSection
          complications={complicationsDraft}
          activityProgressive={complicationActivityProgressive}
          triggerOptions={complicationTriggerOptions}
          {macroOptions}
          {random}
          {saving}
          onChange={(next) => {
            complicationsDraft = next;
          }}
        />

        {#if saveFailed}
          <p class="manager-muted manager-form-warning">
            {text(
              'FABRICATE.Admin.Manager.Component.SaveFailed',
              'Save failed. Try again or refresh the manager.'
            )}
          </p>
        {/if}
      {:else}
        <!--
        THE VALIDATION TAB (gap-list row 127, `proto:1448-1466`). The same
        `EditorValidationSurface` shape the world entry's own Validation tab draws: a head grid,
        then kickered groups of icon rows with trailing status pills. Its checks are the SYSTEM
        rules' — the essence contribution, the salvage results, the outcome routing and the
        progressive DC — which is why they come from `componentRulesValidation.js` rather than
        from `componentScopeValidation.js`, whose subject is the world record.
      -->
        <EditorValidationSurface
          title=""
          summary={validationSummary}
          counts={validation.counts}
          groups={validation.groups}
          countLabels={{
            passing: text('FABRICATE.Admin.Manager.Component.Validation.Passing', 'Passing'),
            warnings: text('FABRICATE.Admin.Manager.Component.Validation.Warnings', 'Warnings'),
            blocking: text('FABRICATE.Admin.Manager.Component.Validation.Blocking', 'Blocking'),
          }}
          statusLabels={{
            pass: text('FABRICATE.Admin.Manager.Component.Validation.Pass', 'Pass'),
            warn: text('FABRICATE.Admin.Manager.Component.Validation.Warning', 'Warning'),
            block: text('FABRICATE.Admin.Manager.Component.Validation.Blocks', 'Blocks'),
          }}
          hookAttrs={{ root: { 'data-component-edit-validation': '' } }}
          rowDataAttr="data-component-validation-check"
        />
      {/if}
    </div>
  </form>

  <!--
    D9. THE `How players see it` RAIL (gap-list row 128, `proto:1467-1500`) — THE WORLD ENTRY'S
    OWN RAIL, at the system scope (issue 1371 r18-list, maintainer ruling M27). The reference draws
    the SAME rail here as on the world Component entry, down to the tile, the two kickered fact
    groups and the live footer; the only difference is its scope sentence, which names this
    system rather than every system. The markup this editor used to draw for it is gone: two
    drawings of one template drift, and the maintainer's live test found them drifted.

    It is the SECOND GRID COLUMN and a sibling of the form, never a child of it: the rail scrolls
    independently of the content column, and a preview nested inside a `<form>` would be
    submitted with it.

    `linked` reads the WORLD record's source link, because that is what decides whether a player
    sees art at all; the in-system record only mirrors the picture it inherits.
  -->
  <WorldComponentEntryPreviewRail
    scope="system"
    {systemLabel}
    name={component?.name || ''}
    image={component?.img || ''}
    icon="fas fa-cube"
    categoryLabel={categoryLabel(categoryLocked ? worldCategory : categoryDraft)}
    tags={railTagChips}
    essences={railEssences}
    linked={worldEntry?.hasSourceLink === true}
    factGroups={railFactGroups}
    {text}
  />
</main>

<style>
  /* ── The read-only complication strip (issue 1286) ──────────────────────────────────
     Component-SCOPED rather than added to `styles/fabricate.css`, matching every other
     surface this feature ships: `ComplicationSummaryRow` and the authoring section both
     carry their own `<style>`, and the strip's whole point is that it changes no shared
     rule. Theme-ROOT tokens only (`--fab-warning*`, never a `--fab-manager-*` property), on
     `Chip.svelte`'s note, so the band renders the same wherever this row shape is reused.

     THE BAND IS ATTACHED, and that overrides the prototype. The Component Studio document
     draws it detached — tucked 5px below the row, indented 30px past the grip, behind its
     own `0 9px 9px 0` border — so the two studios drew one fact two ways. The maintainer
     ruled for the Recipe Studio's treatment, row and band as ONE card, so the prototype's
     detached geometry is a superseded design rather than a fidelity target. Nothing the
     parity spec MEASURES on this band moves: its fill, its `border-top`, its 0 top-left
     radius, its 8px/11px padding and its 6px gap are the prototype's values still. What
     goes is the margin, the surrounding border and the right-hand radii — the three
     declarations that made it a second box. */

  /* Scoped by `:has()` to rows that actually draw a band, so it joins nothing and moves no
     stage row in either studio. `.manager-salvage-stage-row` is JOINED with
     `.manager-recipe-result-row.is-reorderable` in styles/fabricate.css (deliberate, and
     recorded there), and avoiding a change to that rule is the whole reason this is a
     `:has()` and not a relaxation.

     The row sheds its padding onto its own line and clips itself, so the band runs edge to
     edge and its `border-top` reads as a card DIVIDER — inset by the card's padding
     instead, that rule drew as a short line floating inside the card. `overflow: hidden`
     is also what keeps the band's warning fill inside the card's 8px radius. It cannot
     clip the row's component picker: `SearchablePopover` portals its popover to the
     manager host rather than rendering it in flow. */
  .manager-salvage-stage-row:has(.manager-salvage-stage-complications) {
    flex-direction: column;
    align-items: stretch;
    /* `gap: 0` is load-bearing, not tidying. The joined rule declares `gap: var(--fab-space-3)`
       for the 12px BETWEEN a stage's controls, and turning the row into a column re-aims that
       12px at the seam between the line and the band — which left the band's `border-top`
       floating under 12px of card fill and reading as a stray rule rather than as this card's
       divider. The line restates the 12px on its own axis, where it belongs. */
    gap: 0;
    overflow: hidden;
    padding: 0;
  }

  /* `display: contents` in the common case, which is every stage whose yield authors no
     salvage complication: collapsed, the grip, the ordinal, the picker and the trailing
     cluster are the ROW's flex items exactly as they were before this wrapper existed. */
  .manager-salvage-stage-line {
    display: contents;
  }

  /* With a band the line becomes the real row, and takes the padding and the 12px gap the
     joined rule gave up above — restated here because it is now the LINE that must draw
     them. Its own `align-items: center` is what keeps the grip and the ordinal centred
     against the line they label rather than against the whole card. */
  .manager-salvage-stage-row:has(.manager-salvage-stage-complications) .manager-salvage-stage-line {
    display: flex;
    gap: var(--fab-space-3);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
  }

  /* NO margin and NO radius: the `border-top` IS the divider between the band and the line
     above it, and a divider only reads as one when the two surfaces meet. The 2px
     `--fab-warning` left rule stays — it is what marks this band as the stage's warning
     annotation rather than as more of the stage — and now runs the band's full height
     against the card's own border instead of floating in the list's gutter. */
  .manager-salvage-stage-complications {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 11px;
    border-top: 1px solid var(--fab-warning-border);
    border-left: 2px solid var(--fab-warning);
    background: var(--fab-warning-soft);
  }

  .manager-salvage-stage-complications-head {
    display: flex;
    gap: 7px;
    align-items: center;
    color: var(--fab-warning);
    font-size: 9px;
  }

  /* The band's eyebrow. It names the OWNING component because the row above it addresses
     that component through a picker button, and a GM scanning a list of stages needs the
     band's subject stated rather than inferred from adjacency. */
  .manager-salvage-stage-complications-title {
    flex: 1 1 auto;
    overflow: hidden;
    color: var(--fab-warning-text);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* `margin-left: auto` is stated here rather than inherited: the shared
     `.manager-salvage-stage-edit` rule places the link in the ROW's trailing cluster, and
     the title above already takes the free space in this band. */
  .manager-salvage-stage-complications-head .manager-salvage-stage-edit {
    flex: 0 0 auto;
  }
  /* THE CATEGORY NOTE IS STATED ONCE, IN THE SHEET (`proto:1327`, gap-list row 143), and the
     scoped copy that used to live here is gone.

     It was not an override anybody chose: Svelte's scoping appends a hash class, so this block
     out-specified `.fabricate-manager .manager-component-cat-note` in `styles/fabricate.css` and
     quietly won FIVE declarations the sheet writes to the reference — the 10px type (this said
     0.68rem, which resolves to 10.88), the 8px top margin (this said `margin: 0`), the baseline
     alignment, the 1.45 line height, and the per-state glyph ink (this inked every glyph subtle,
     so the inheriting note's info glyph and the overriding note's warning glyph painted the same
     grey). Measured: `rules-category-note.fontSize 10.88px` against the reference's 10.

     Two rules for one element, with the loser being the one written to the reference, is exactly
     the shape the cascade inventory exists to surface — so the duplicate is deleted rather than
     out-specified again. */
</style>
