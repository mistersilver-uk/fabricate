<script>
  import Notice from '../../components/Notice.svelte';
  import EditorTabs from '../../components/EditorTabs.svelte';
  import WorldComponentEntryPreviewRail from './scoped/WorldComponentEntryPreviewRail.svelte';
  import { componentRulesValidationPresentation } from './component/componentRulesValidation.js';
  import { focusValidationTarget } from './validationFocus.js';
  import { announceValidationOutcome } from './validationAnnouncement.js';
  import { localize } from '../../util/foundryBridge.js';
  import ComponentIdentityStrip from './component/ComponentIdentityStrip.svelte';
  import ComponentCategoryTagsCards from './component/ComponentCategoryTagsCards.svelte';
  import ComponentEssencesCard from './component/ComponentEssencesCard.svelte';
  import ComponentSalvageCard from './component/ComponentSalvageCard.svelte';
  import ComponentDifficultyCard from './component/ComponentDifficultyCard.svelte';
  import ComponentRulesValidationTab from './component/ComponentRulesValidationTab.svelte';
  // The progressive-complications section (issue 1286). It owns its own visibility gate, so it is
  // placed unconditionally rather than behind a second predicate that could drift out of step.
  import ComponentComplicationsSection from './component/ComponentComplicationsSection.svelte';
  import { fromValue } from './recipe/pickerRowKinds.js';
  import { withAddedResult } from './recipe/resultRows.js';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel,
    getEffectiveComponentCategories,
    normalizeComponentCategory,
  } from '../../../../utils/componentCategories.js';
  import {
    carriedComponentEssences,
    clampComponentEssenceQuantity,
  } from '../../util/componentEditor.js';
  import {
    buildComponentCategoryOptions,
    buildSalvageRouteOptions,
  } from './component/componentEditSelectOptions.js';
  import { salvageResolutionModeOptions } from './resolutionModeOptions.js';
  import {
    componentCategoryInheritOffered,
    componentCategoryNote,
    componentEssenceChips,
    componentEssenceInheritOffered,
    componentEssenceNote,
    componentWorldEssenceMap,
  } from './scoped/componentScoped.js';

  /** The world entry route this screen deep-links to; the one string deciding whether it resolves. */
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
    // Whether the SYSTEM's salvage check is enabled — with `salvageResolutionMode`, the second axis
    // the four brief presentations project from. No new persisted token.
    salvageCheckEnabled = false,
    // `salvageCraftingCheck.simple.tiers` — the DC preset source in EVERY resolution mode, routed
    // included (decision 7, case 5). There is no `.routed.tiers` sibling.
    salvageCheckTiers = [],
    salvageCheckDc = 0,
    // The active salvage check sub-object, whose `evaluation` decides which override is edited,
    // and the Preview-as roster and lookup its Player sees line resolves with (issue 2005).
    salvageCheckConfig = null,
    previewActors = [],
    resolvePreviewCharacter = () => null,
    // The SYSTEM's check-modifier catalogue and the SALVAGE check's selection over it (issue 1095).
    // The picker renders only under `bySubject` and only over a non-empty catalogue.
    // `salvageModifierMaxPicks` is NOT coerced on the way here; `resolveMaxModifierPicks` owns
    // what absence means.
    checkModifierOptions = [],
    salvageModifierPolicy = 'addAll',
    salvageModifierMaxPicks = null,
    // The salvage check's DEFAULT eligible set, so the picker can NAME what is inherited when this
    // component has authored no pick.
    salvageModifierDefaultIds = [],
    componentOptions = [],
    // Which activities THIS system resolves progressively (issue 1286), as
    // `{ crafting, salvage, gathering }`. `null` means "derive what this view knows", which is the
    // salvage axis alone — crafting and gathering live on the system record, not on the component.
    complicationActivities = null,
    // `{ id, label, activity }` per named trigger. Each activity's check block owns its own id
    // space, so an option is labelled by its owner.
    complicationTriggerOptions = [],
    // `viewState.selectedSystem.availableScriptMacros`, already script-filtered and name-sorted by
    // the store; deliberately not a second projection.
    macroOptions = [],
    // The client-side id mint, injected so the section never reaches for `Math.random()`.
    random = undefined,
    saving = false,
    // Progressive difficulty. STAGED, not written on change — the value lives in the manager root's
    // `componentDifficultyDraft` — and a SIBLING of `salvage`, never part of `updates.salvage`.
    showDifficulty = false,
    difficulty = null,
    onDifficultyChange = () => {},
    // The four source actions are DECLARED NOWHERE (issue 1371): the source Item is world-scope
    // data, authored on the world Component entry. The root still passing them is harmless, since
    // Svelte 5 drops a prop no destructuring names.
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onManageCheckPresets = () => {},
    // "Edit" on a progressive salvage result row opens the referenced YIELD component's editor. The
    // root wires this to `editComponent(otherId)`, which routes through `confirmRouteExit` — not
    // `setView('component-edit')`, which no-ops without a selectedSystem.
    onOpenComponent = () => {},
    // Three of the four keys the call site's component bundle spreads; `systems` stays undeclared,
    // as the browser view's twin block states. `actions` carries `setMutedTags` and this view
    // DELIBERATELY DOES NOT USE IT: muting is authored on the world entry and the world-tag card
    // below is read-only.
    scope = null,
    actions = null,
    systemId = '',
    // The deep link, through the banner's own exit. Called with the ROUTE TOKEN and the entity id.
    onOpenWorldEntry = () => {},
  } = $props();

  // Minted per instance (issue 1510), because the salvage routing rows' captions name their own
  // triggers by id and two editors can be open at once — a fixed literal would name both.
  const instanceId = $props.id();

  // The world layer this system's rules sit over, read off the world projection's JOIN — the only
  // place the INHERIT state lives. The in-system record carries only the RESOLVED value.
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
  // AN ABSENT `inherit` KEY READS AS INHERITING, matching the resolver; that is the state "add to
  // this system" creates.
  const categoryInheriting = $derived(worldSystemRow?.inherited?.category !== false);
  // THE OPTION IS WITHHELD WHEN NO WORLD VALUE IS AUTHORED: flipping it would resolve back to the
  // in-system value anyway — a control that changes nothing while looking as though it did.
  const categoryInheritOffered = $derived(
    worldMember && componentCategoryInheritOffered(worldCategory)
  );
  // THE STAGED INHERIT FLAG, the other half of a draft. `null` means untouched this session, so the
  // persisted flag stands; anything else is a PENDING choice read everywhere `categoryInheriting`
  // is — lock, note, select value and rail — so the screen previews it while it is still a draft.
  // Both halves of one choice land together; see `handleSave` for the ORDER.
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

  // THE ESSENCE SECTION'S INHERIT CHOICE (M31): the category machinery above, over the world record's
  // `essences` section — persisted switch off the world join, offer withheld while the world authored
  // nothing, three-valued staged flag, and a LOCK drawing the steppers read-only over the WORLD map.
  // `worldEssenceMap` is what a locked card shows and what an override is seeded from.
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
  // Deep clone of `component.salvage` so edits never mutate the upstream card. Unedited fields are
  // preserved and spread back through `buildUpdates`, so a save never drops them.
  let salvageDraft = $state(cloneSalvage(null));
  // The COMPLICATIONS draft (issue 1286): a top-level sibling of `salvage`, never part of it.
  // Nesting it would be the aggregate-boundary violation `componentComplications.js` states, and
  // `updates.salvage` would carry it onto a system whose salvage feature is off.
  let complicationsDraft = $state([]);
  let saveFailed = $state(false);
  let lastComponentKey = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');

  // See the `complicationActivities` prop note: absent derives the salvage axis alone.
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
      // `category` is NOT a salvage field, so it takes its own term. An authored field missing from
      // the signature means the editor never re-emits its draft, so Save never sees it (issue 676).
      categoryDraft,
      // The staged INHERIT half, THREE-valued: `null` (untouched) and a staged value equal to the
      // persisted one are different states.
      String(categoryInheritDraft),
      // And the essence switch's staged half, three-valued for the same reason (M31).
      String(essenceInheritDraft),
      essenceDraft
        .map((opt) => `${opt.id}:${opt.quantity}`)
        .sort()
        .join(','),
      showSalvage ? salvageSignature() : '',
      // Its OWN term, like `category`. Omit it and the issue-651 failure returns verbatim: the GM
      // authors a complication, nothing is dirty, and the edit is discarded on exit.
      complicationsSignature(),
      dirty ? 'dirty' : 'clean',
    ].join('')
  );

  $effect(() => {
    if (componentKey === lastComponentKey) return;
    tagDraft = cloneTagOptions(tagOptions);
    categoryDraft = normalizeComponentCategory(component?.category);
    // Reset with the drafts; left standing it would re-apply to the NEXT component opened here.
    categoryInheritDraft = null;
    essenceInheritDraft = null;
    essenceDraft = cloneEssenceOptions(essenceOptions);
    salvageDraft = cloneSalvage(component?.salvage);
    complicationsDraft = cloneComplications(component?.complications);
    saveFailed = false;
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

  /** The interpolating localizer the shared component-scope model takes. */
  function format(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  // `general` first, then the authored vocabulary: the reserved bucket is never persisted in
  // `categoryOptions`.
  const effectiveCategoryOptions = $derived(getEffectiveComponentCategories(categoryOptions));

  // The two tabs the reference draws. The tab is LOCAL state and deliberately not lifted: it is a
  // reading position rather than a draft.
  let activeTab = $state('rules');

  const systemLabel = $derived(String(worldSystemRow?.systemName ?? systemId));

  /**
   * The name of every salvage result this system has no rules for — a result naming an id absent
   * from `componentOptions` cannot be awarded. The one validation fact the draft alone cannot answer.
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
  const badges = $derived({ validation: validation.badge });

  // The row action's three seats: this editor's root, the route-only fallback, and the live region.
  let editorRoot = $state(null);
  let tabPanel = $state(null);
  let issueAnnouncement = $state('');

  /** A validation row's action: the route is written FIRST, so the focus move finds its panel. */
  function selectIssue(targetTab, focusTarget) {
    const route = tabs.find((tab) => tab.id === targetTab && tab.id !== 'validation') ?? null;
    if (route) activeTab = route.id;
    announceValidationOutcome({
      root: editorRoot,
      routeLabel: route ? text(route.labelKey, route.label) : '',
      focus: () => focusValidationTarget(editorRoot, focusTarget),
      fallbackPanel: tabPanel,
      announce: (sentence) => {
        issueAnnouncement = sentence;
      },
    });
  }

  // THE CATEGORY CONTROL IS ONE SELECT: `Inherit from world · {value}` is the select's first
  // option, in the body, full width.
  const INHERIT_OPTION = '__inherit';
  const categorySelectValue = $derived(categoryLocked ? INHERIT_OPTION : categoryDraft);
  const categoryInheritLabel = $derived(
    format(
      'FABRICATE.Admin.Manager.Component.Category.InheritOption',
      'Inherit from world · {category}',
      { category: categoryLabel(worldCategory) }
    )
  );
  // The one control's option list (issue 1510), mapped beside this file.
  const categorySelectOptions = $derived(
    buildComponentCategoryOptions(
      categoryInheritOffered ? INHERIT_OPTION : '',
      categoryInheritLabel,
      effectiveCategoryOptions,
      categoryLabel
    )
  );

  /**
   * Stage the one control's choice, which is two staged writes: the inherit flag is a MEMBERSHIP
   * write and the category an IN-SYSTEM one, so choosing a concrete category while inheriting must
   * clear the flag too, or the read union re-applies the world value. Both land in `handleSave`.
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
   * Stage the essence switch (M31); nothing is written here. Going to OVERRIDE seeds the value draft
   * from the WORLD map the locked card showed, so no tile moves; going back to INHERIT leaves that
   * draft standing as the dormant override. `nextInherit` is the NEXT value, never a toggle.
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

  const worldTagsApplied = $derived(worldTags.filter((tag) => !worldMutedTags.includes(tag)));
  // THE `How players see it` RAIL (M27): `WorldComponentEntryPreviewRail` draws it on both screens
  // and this editor supplies only the scope and the data. BOTH FACT GROUPS ARE NARROWED TO THIS
  // SYSTEM — the world projection's `requiredBy` and `producedBy` are world-wide, and a rail on a
  // system's rules listing another system's recipes would be a wrong list, not a long one.
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
  // staged choice is inherit, the draft otherwise.
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
      // The essence's own `--fab-tag-*` colour key (M29), carried for the reason `enabled` is: a
      // field the clone drops can never reach the card.
      colorToken: option.colorToken,
      // Carried, or the offer filter below would treat every disabled essence as enabled (1036).
      enabled: option.enabled !== false,
      quantity: clampComponentEssenceQuantity(option.quantity),
    }));
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // Deep clone the persisted salvage shape into an editable draft. Authoring touches only
  // resultGroups/outcomeRouting and the overrides; the rest are kept verbatim for `buildUpdates`.
  function cloneSalvage(salvage) {
    const source = salvage && typeof salvage === 'object' ? salvage : {};
    return {
      ...source,
      // The component's own check-modifier pick (issue 1095). `null` for ABSENT rather than `[]`,
      // because an authored empty array is a real pick of zero and a DIFFERENT roll.
      checkModifierIds: Array.isArray(source.checkModifierIds)
        ? [...source.checkModifierIds]
        : null,
      dcOverride: source.dcOverride ?? null,
      adjustmentOverride: source.adjustmentOverride ?? null,
      // Normalizes the DIRTY-CHECK BASELINE, so System default after a count override cleans.
      successesOverride: source.successesOverride ?? null,
      // Default FALSE, matching `_normalizeSalvage` (issue 676). Do NOT copy the `!== false` shape
      // of `allowPlayerResultReorder` below: that would flip every component in every world to
      // salvageable. It also normalizes the DIRTY-CHECK BASELINE, so toggling off then on cleans.
      enabled: source.enabled === true,
      // Default TRUE (issue 651), matching the model; `...source` preserves a persisted value, so
      // this covers the ABSENT key only. Its load-bearing job is the DIRTY-CHECK BASELINE: absent,
      // it leaves a never-toggled component stuck dirty once toggled off and back on.
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

  function clampSalvageQuantity(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  // The dirty-check allowlist: every AUTHORED salvage field must appear here or Save never enables
  // for it and the edit is discarded on exit (issue 651). Taking a salvage OBJECT rather than having
  // `isDirty()` build a matching literal keeps ONE list rather than two kept in sync.
  function salvageSignatureOf(salvage) {
    return JSON.stringify({
      // The per-component salvage gate (issue 676); omit it and the 651 failure returns here.
      enabled: salvage.enabled,
      resultGroups: salvage.resultGroups,
      outcomeRouting: salvage.outcomeRouting,
      dcOverride: salvage.dcOverride,
      adjustmentOverride: salvage.adjustmentOverride,
      successesOverride: salvage.successesOverride,
      allowPlayerResultReorder: salvage.allowPlayerResultReorder,
      // Omit this and the issue-651 bug returns verbatim for the modifier pick.
      checkModifierIds: salvage.checkModifierIds,
    });
  }

  function salvageSignature() {
    return salvageSignatureOf(salvageDraft);
  }

  /**
   * Deep-clone the persisted complications into an editable draft (issue 1286). STRUCTURAL, not
   * shallow: `when` / `rollCondition` / `effectRoll` are nested objects a shallow copy would share
   * with the upstream card. Absent normalizes to `[]` so an add-then-remove does not stay dirty.
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

  // ONE list again, on `salvageSignatureOf`'s reasoning: taking the ARRAY makes `isDirty()` compare
  // the same projection of both sides.
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
    // THE INHERIT FLAG IS A DRAFT FIELD LIKE ANY OTHER; omit it and the issue-651 failure returns.
    if (categoryInheritDirty) return true;
    if (essenceInheritDirty) return true;
    if (categoryDraft !== normalizeComponentCategory(component?.category)) return true;
    if (showTags && !tagsAreEqual(tagDraft, tagOptions)) return true;
    if (showEssences && !essencesAreEqual(essenceDraft, essenceOptions)) return true;
    if (showSalvage && salvageSignature() !== salvageSignatureOf(cloneSalvage(component?.salvage)))
      return true;
    // NOT gated on a `show*` flag: the complications section owns its own gate, and a draft that
    // differs from the persisted list is a real edit whether or not that section is on screen.
    if (
      complicationsSignature() !==
      complicationsSignatureOf(cloneComplications(component?.complications))
    )
      return true;
    return false;
  }

  /**
   * The essence map a set of rows produces, carrying forward the ids this system's roster cannot
   * render: `essenceOptions` is built over the SYSTEM's `essenceDefinitions`, so an id outside it has
   * no row and was silently DROPPED from the write. ONE FUNCTION FOR TWO ROW SETS — the write passes
   * the draft, the baseline the rows as DRAWN — or an untouched save differs from its own baseline.
   */
  function essenceMapFrom(rows) {
    const essences = carriedComponentEssences(component?.essences, essenceOptions);
    for (const option of Array.isArray(rows) ? rows : []) {
      const quantity = clampComponentEssenceQuantity(option.quantity);
      if (quantity > 0 && option.id) essences[option.id] = quantity;
    }
    return essences;
  }

  /**
   * The map an UNTOUCHED save of the rows THIS EDITOR DREW would produce — the baseline the override
   * rule answers "did the GM author anything" against. `data-models` §Component scope 2a: it is a
   * fact about the RENDER, so it is captured where the rows were drawn, rather than re-derived from
   * the read union `updateComponent` assumes. `undefined` where the section is not rendered.
   */
  function renderedEssenceBaseline() {
    return showEssences ? essenceMapFrom(essenceOptions) : undefined;
  }

  function buildUpdates() {
    const updates = {};
    updates.category = categoryDraft;
    if (showTags) {
      updates.tags = tagDraft.filter((opt) => opt.checked).map((opt) => opt.tag);
    }
    if (showEssences) updates.essences = essenceMapFrom(essenceDraft);
    if (showSalvage) {
      // The whole draft, authored and preserved fields alike, so the rest survive a save.
      updates.salvage = { ...salvageDraft };
      // ABSENCE IS A VALUE HERE: the normalizer keys authoredness on `Array.isArray`, so the key
      // must be DELETED, never written as `null` — `null` would read as "not an array" and inherit.
      if (!Array.isArray(salvageDraft.checkModifierIds)) delete updates.salvage.checkModifierIds;
    }
    // A TOP-LEVEL sibling of `salvage` (issue 1286), always emitted and always an array:
    // `authoredComplications` normalizes an authored `[]` to ABSENT, which is how a GM removes the
    // key. Omitting the field here would make that deletion unsaveable.
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

  // The ONE essence write path (issue 772). `Stepper` emits the clamped ABSOLUTE value for both its
  // adjuncts and a typed entry; the clamp stays here regardless, because the save reads the draft.
  function setEssenceQuantity(essenceId, rawValue) {
    const quantity = clampComponentEssenceQuantity(rawValue);
    const next = essenceDraft.map((entry) =>
      entry.id === essenceId ? { ...entry, quantity } : entry
    );
    essenceDraft = next;
  }

  // Salvage authoring mutators. Each writes a fresh `salvageDraft` preserving the untouched fields,
  // so the `draftSignature` effect re-emits `onDraftChange`. The four presentations are DERIVED from
  // `salvageResolutionMode` plus the salvage check's off/on axis; no persisted token changes.

  const salvageEnabled = $derived(salvageDraft.enabled === true);
  const salvageHasGroups = $derived(salvageDraft.resultGroups.length > 0);
  const salvageProgressive = $derived(salvageResolutionMode === 'progressive');
  const salvageRouted = $derived(salvageResolutionMode === 'routed');
  // Simple mode caps authoring at ONE success result group (issue 764), mirroring the recipe editor.
  // The cap counts SUCCESS groups so a legacy failure group neither wedges the editor nor hides the
  // Add control. The invariant itself is the `_normalizeSalvage` clamp; this is UX only.
  const salvageSimpleMode = $derived(salvageResolutionMode === 'simple');
  const salvageSuccessGroupCount = $derived(
    salvageDraft.resultGroups.filter((group) => group?.role !== 'failure').length
  );
  const salvageHideAddGroup = $derived(salvageSimpleMode && salvageSuccessGroupCount >= 1);
  // The DC control belongs to modes that compare a roll against a DC. `progressive` spends a roll
  // down a list instead, so it shows read-only per-result DC chips.
  const salvageShowDcOverride = $derived(
    salvageCheckEnabled && (salvageResolutionMode === 'simple' || salvageRouted)
  );

  // RULING A (issue 676): what collapses when salvage is OFF is the chrome that only means something
  // once salvage RUNS — mode, DC, routing, reorder. The result-group editor stays usable, because
  // `data-add-salvage-group` lives inside it and collapsing it would leave `resultGroups` unable to
  // reach 1 and the toggle disabled forever.
  const salvageShowChrome = $derived(salvageEnabled);

  // UX only. The invariant is the `_normalizeSalvage` clamp plus `removeSalvageGroup`'s auto-disable.
  const salvageToggleDisabled = $derived(saving || !salvageHasGroups);

  // The off-body copy MUST branch: "Enable it above to define what it yields" is only true once
  // groups exist. It is ALSO the zero-group explanation for the disabled toggle, which is why it is
  // body copy and not a `title`: a disabled `<button>` receives no mouse events, so a tooltip there
  // never appears — and a mounted test could not tell, because the attribute would be in the DOM.
  const salvageDisabledNotice = $derived(
    salvageHasGroups
      ? text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledHasGroups',
          'Salvage is disabled for this component. Enable it above to define what it yields when broken down.'
        )
      : text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledNoGroups',
          'There is nothing to enable yet. Add a result set below to describe what this component yields, then enable salvage.'
        )
  );

  // The salvage mode, READ-ONLY: a SYSTEM-level setting authored on Crafting Settings. Without it
  // the panel silently changes shape from a setting the GM cannot see from here. Reuses
  // `salvageResolutionModeOptions`, which records that the persisted token is never displayed.
  const salvageModeOption = $derived(
    salvageResolutionModeOptions.find((option) => option.value === salvageResolutionMode) || null
  );
  const salvageModeLabel = $derived(
    salvageModeOption ? text(salvageModeOption.labelKey, salvageModeOption.fallback) : ''
  );

  function setSalvage(next) {
    salvageDraft = { ...salvageDraft, ...next };
  }

  function addSalvageGroup() {
    setSalvage({
      resultGroups: [...salvageDraft.resultGroups, { id: newId(), name: '', results: [] }],
    });
  }

  // Defence in depth behind the normalizer clamp (issue 676). Unfloored, enable-at-one-group then
  // delete-that-group persisted `{enabled: true, resultGroups: []}`, violating Component Requirement
  // 5 and disabling the toggle that would undo it. Forcing `enabled: false` in the SAME staged
  // `setSalvage` keeps the correction inside `isDirty()` / `draftSignature` so Save sees it.
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

  function addSalvageResult(groupId, componentId) {
    updateSalvageGroupResults(groupId, (results) => withAddedResult(results, componentId, newId()));
  }

  function removeSalvageResult(groupId, resultId) {
    updateSalvageGroupResults(groupId, (results) =>
      results.filter((result) => result.id !== resultId)
    );
  }

  // `next` replaces the result whole, because `fromValue` removes a formula by deleting its key. The
  // normalizer falls back to `systemItemId`, so that alias leaves with the component.
  function updateSalvageResult(groupId, result, value) {
    const next = fromValue(result, value);
    if (next.componentId !== result.componentId) delete next.systemItemId;
    updateSalvageGroupResults(groupId, (results) =>
      results.map((entry) => (entry.id === result.id ? next : entry))
    );
  }

  function updateSalvageGroupResults(groupId, mutate) {
    setSalvage({
      resultGroups: salvageDraft.resultGroups.map((group) =>
        group.id === groupId ? { ...group, results: mutate(group.results || []) } : group
      ),
    });
  }

  // PROGRESSIVE SALVAGE IS ONE GROUP, WHOSE `results` ARE THE STAGES. Read
  // `CraftingEngine._resolveSalvageGroups` before touching this: progressive mode takes `allGroups[0]`
  // alone and treats its `results` as the ordered stage list, so `resultGroups[1..]` are dead data.
  // The presentation is the redesign prototype's; the mapping is the engine's.
  const salvageStageGroup = $derived(salvageDraft.resultGroups[0] || null);
  const salvageStages = $derived(salvageStageGroup?.results || []);

  // Append a stage, creating the backing group on first use. This is ALSO what takes a zero-group
  // component to one group, which is what keeps Ruling A's invariant true in progressive mode.
  function addSalvageStage() {
    const stage = { id: newId(), componentId: componentOptions[0]?.id || '', quantity: 1 };
    if (!salvageStageGroup) {
      setSalvage({ resultGroups: [{ id: newId(), name: '', results: [stage] }] });
      return;
    }
    updateSalvageGroupResults(salvageStageGroup.id, (results) => [...results, stage]);
  }

  // Removing the LAST stage removes the empty group with it, so the normalizer's groups-based clamp
  // still sees the component as empty. Leave it behind and the clamp holds `enabled` ON while the
  // engine awards nothing.
  function removeSalvageStage(resultId) {
    if (!salvageStageGroup) return;
    const results = salvageStages.filter((result) => result.id !== resultId);
    if (results.length === 0) {
      removeSalvageGroup(salvageStageGroup.id);
      return;
    }
    updateSalvageGroupResults(salvageStageGroup.id, () => results);
  }

  // Reorder is the AUTHORING act in progressive mode — the list order is the spend order. Clamped
  // at the ends rather than wrapping. The list owns both inputs, the announcement and the transient
  // drag state (issue 1512), and that state stays outside the draft, so picking a row up and
  // dropping it where it started still cannot mark the editor dirty.
  function moveSalvageStage(from, to) {
    if (!salvageStageGroup) return;
    if (from < 0 || from >= salvageStages.length) return;
    if (to < 0 || to >= salvageStages.length) return;
    const results = [...salvageStages];
    const [moved] = results.splice(from, 1);
    results.splice(to, 0, moved);
    updateSalvageGroupResults(salvageStageGroup.id, () => results);
  }

  // The routing rows' shared option list (issue 1510), under the same numbered group fallback the
  // group headers use.
  const salvageRouteOptions = $derived(
    buildSalvageRouteOptions(
      salvageDraft.resultGroups,
      text('FABRICATE.Admin.Manager.Component.SalvageEditor.Unrouted', 'Unrouted'),
      (n) =>
        text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder',
          'Set {n}'
        ).replace('{n}', String(n))
    )
  );

  function setSalvageRoute(outcomeName, groupId) {
    const next = { ...salvageDraft.outcomeRouting };
    if (groupId) next[outcomeName] = groupId;
    else delete next[outcomeName];
    setSalvage({ outcomeRouting: next });
  }

  function salvageComponentName(componentId) {
    return componentOptions.find((option) => option.id === componentId)?.name || '';
  }

  // The adder's option list (issue 676). `icon` is the fallback for a component whose linked item
  // has no art: `SearchablePopover` renders a raw `<img>` only when `img` is truthy.
  const salvageAdderOptions = $derived(
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

  // A throw is a failure exactly as a `false` return is, so both mark the draft failed in their own
  // branch. The save is still awaited exactly once — an extra async hop would move the failure notice
  // later than the mounted route tests observe it.
  //
  // ONE SAVE, TWO SETTINGS KEYS, AND THE ORDER IS THE ANSWER: the category VALUE lives on the
  // in-system record (`craftingSystems`, written by `onSave`) and the INHERIT flag on the membership
  // record (`componentScope`, written by `setSectionInherited`), with no transaction across them.
  // THE FLAG GOES FIRST: `setSectionInheritance` seeds the local block with the world value, so a
  // flag-only landing leaves the effective category unmoved, where the other order would persist the
  // typed category behind a read union that still masks it. Neither half runs if the flag refuses.
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
        // THE STAGED VALUE IS NOT CLEARED HERE. Clearing it would hand the display back to
        // `categoryInheriting` before the store republishes the membership record, so the select
        // would snap to the OLD state and back one publish later.
      }
      // THE ESSENCE SWITCH, SAME ORDER, SAME REASONS (M31); not cleared here either.
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
      const result = await onSave(component.id, updates, {
        baseline: renderedEssenceBaseline(),
      });
      if (result === false) saveFailed = true;
    } catch {
      saveFailed = true;
    }
  }
</script>

<!--
  THE WORLD ENTRY'S PAGE FRAME (M27): a content column beside a 326px rail with its own scroller and
  left hairline. This route's `<main>` IS that frame rather than a second grid, and every rule that
  paints the shared rail is keyed on the frame's class.
-->
<main
  class="manager-main manager-component-edit-main manager-component-entry-page"
  aria-label={text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component')}
  bind:this={editorRoot}
>
  <!-- The row action's live region, outside the tab chain its own route change unmounts. -->
  <div class="visually-hidden" role="status" aria-live="polite" data-component-issue-announcement>
    {#if issueAnnouncement}{issueAnnouncement}{/if}
  </div>
  <!--
    THE FORM IS THE FRAME'S CONTENT COLUMN (M26), wearing the column class beside its own.
    `manager-component-edit-view` is the form the header's Save submits BY ID, pinned by the smoke
    walk and the layout guards; the column class is what the frame's rules are keyed on.
  -->
  <form
    id="manager-component-edit-form"
    class="manager-component-edit-view manager-component-entry-column"
    onsubmit={handleSave}
  >
    <!-- The tab strip lives inside the form: the header's Save submits it by id, so a form mounted
         only on the rules tab would stop being submittable on the Validation tab. -->
    <EditorTabs
      {tabs}
      {activeTab}
      {badges}
      onSelect={(tab) => (activeTab = tab)}
      ariaLabelKey="FABRICATE.Admin.Manager.Component.TabsLabel"
      ariaLabel="Component rules sections"
      idStem="component-rules"
      tabDataAttr="data-component-edit-tab"
      badgeDataAttr="data-component-edit-tab-badge"
      activePanelOnly
    />
    <!-- The page notice position: a row of the column above the scroller, so it stays in view. -->
    {#if saveFailed}
      <div class="manager-component-entry-notices" data-notice-position="page">
        <Notice
          blocking
          tone="danger"
          title={text('FABRICATE.Admin.Manager.Component.SaveFailed', 'Save failed')}
          detail={text(
            'FABRICATE.Admin.Manager.Component.SaveFailedDetail',
            'Nothing was saved. Try again, or refresh the manager if it keeps failing.'
          )}
        />
      </div>
    {/if}

    <!-- The scrolling panel (M26): the tab body scrolls under the strip, carrying the inset, and is
         the tab panel the strip's `aria-controls` names. -->
    <div
      class="manager-component-entry-panel"
      data-component-edit-panel={activeTab}
      id={`component-rules-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`component-rules-tab-${activeTab}`}
      tabindex="-1"
      data-keyboard-focus="true"
      bind:this={tabPanel}
    >
      {#if activeTab === 'rules'}
        <!-- The rules tab's heading block; see `ComponentIdentityStrip` for its two smoke hooks. -->
        <ComponentIdentityStrip
          {component}
          {saving}
          hasWorldEntry={Boolean(worldEntry)}
          memberCount={Number(worldEntry?.membershipCount) || 0}
          systemName={systemLabel}
          onOpenWorldEntry={() => onOpenWorldEntry(WORLD_ENTRY_ROUTE, worldEntry?.id)}
        />

        <ComponentCategoryTagsCards
          {text}
          {format}
          {systemLabel}
          {saving}
          {categorySelectValue}
          {categorySelectOptions}
          {categoryLocked}
          {categoryNote}
          hasWorldEntry={Boolean(worldEntry)}
          {worldTags}
          {worldMutedTags}
          {tagDraft}
          onCategorySelect={setCategorySelection}
          onToggleTag={toggleTag}
        />

        <!--
        THE PROGRESSIVE DC CARD, DECLARED ONCE AND RENDERED IN ONE OF TWO PLACES. `component.difficulty`
        is ONE component-level scalar THREE engines read — progressive recipes, salvage and gathering
        — so the root gates the card on `componentDifficultyAxisProgressive`, true on any of them. A
        progressive-salvage system draws it closing the stage list; every other system, which the
        smoke harness drives, draws it after the salvage card. A `{#snippet}`, so
        `data-component-edit-section="difficulty"` resolves to exactly one element.
      -->
        {#snippet difficultyCard()}
          <ComponentDifficultyCard {text} {difficulty} {saving} {onDifficultyChange} />
        {/snippet}

        {#if showEssences}
          <ComponentEssencesCard
            {text}
            {format}
            {systemLabel}
            {saving}
            {essenceDraft}
            {essenceInheritOffered}
            {essenceInheritStaged}
            {essenceLocked}
            {essenceNote}
            {worldEssenceMap}
            onInheritChange={setEssenceInheritance}
            onQuantityChange={setEssenceQuantity}
          />
        {/if}

        {#if showSalvage}
          <ComponentSalvageCard
            {text}
            {format}
            {systemLabel}
            {saving}
            {instanceId}
            {componentKey}
            {salvageDraft}
            {salvageResolutionMode}
            {salvageEnabled}
            {salvageProgressive}
            {salvageRouted}
            {salvageSimpleMode}
            {salvageHideAddGroup}
            {salvageShowChrome}
            {salvageShowDcOverride}
            {salvageToggleDisabled}
            {salvageDisabledNotice}
            {salvageModeOption}
            {salvageModeLabel}
            {salvageRouteOptions}
            {salvageAdderOptions}
            {salvageOutcomeNames}
            {salvageCheckEnabled}
            {salvageCheckTiers}
            {salvageCheckDc}
            {salvageCheckConfig}
            {previewActors}
            {resolvePreviewCharacter}
            {checkModifierOptions}
            {salvageModifierPolicy}
            {salvageModifierMaxPicks}
            {salvageModifierDefaultIds}
            {componentOptions}
            {macroOptions}
            {complicationTriggerOptions}
            componentName={salvageComponentName}
            {salvageStageGroup}
            {salvageStages}
            difficultyCard={showDifficulty ? difficultyCard : undefined}
            onSalvageChange={setSalvage}
            onAddGroup={addSalvageGroup}
            onRemoveGroup={removeSalvageGroup}
            onUpdateGroup={updateSalvageGroup}
            onAddResult={addSalvageResult}
            onRemoveResult={removeSalvageResult}
            onUpdateResult={updateSalvageResult}
            onSetRoute={setSalvageRoute}
            onAddStage={addSalvageStage}
            onRemoveStage={removeSalvageStage}
            onMoveStage={moveSalvageStage}
            {onOpenComponent}
            {onManageCheckPresets}
          />
        {/if}

        <!-- The DC card's own placement; see the snippet's declaration. -->
        {#if showDifficulty && !(showSalvage && salvageProgressive)}
          {@render difficultyCard()}
        {/if}

        <!-- COMPLICATIONS (issue 1286), last in the body and after Salvage, since it is a
         consequence of how this component's stages resolve. It has no reference counterpart and is
         left unrestyled per `rebuild-spec.md` D10, pending a maintainer ruling. Placed
         UNCONDITIONALLY: the section owns its own gate, and restating that predicate here is how the
         two drift apart. -->
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
      {:else}
        <ComponentRulesValidationTab
          {text}
          {format}
          {systemLabel}
          {validation}
          onSelectIssue={selectIssue}
        />
      {/if}
    </div>
  </form>

  <!--
    THE `How players see it` RAIL — THE WORLD ENTRY'S OWN RAIL, at the system scope (M27); only the
    scope sentence differs. It is the SECOND GRID COLUMN and a sibling of the form, never a child:
    the rail scrolls independently, and a preview nested inside a `<form>` would be submitted with it.
    `linked` reads the WORLD record's source link, because that decides whether a player sees art.
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
