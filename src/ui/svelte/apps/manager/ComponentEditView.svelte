<script>
  import Field from '../../components/Field.svelte';
  import Chip from '../../components/Chip.svelte';
  import Callout from '../../components/Callout.svelte';
  import EditorTabs from '../../components/EditorTabs.svelte';
  import EditorValidationSurface from '../../components/EditorValidationSurface.svelte';
  import WorldComponentEntryPreviewRail from './scoped/WorldComponentEntryPreviewRail.svelte';
  import InheritRow from './scoped/InheritRow.svelte';
  import { componentRulesValidationPresentation } from './component/componentRulesValidation.js';
  import { localize } from '../../util/foundryBridge.js';
  import ToggleCard from '../../components/ToggleCard.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import SubjectModifierPicker from './SubjectModifierPicker.svelte';
  import { stepperLabels } from '../../components/stepperLabels.js';
  import SearchablePopover from '../../components/SearchablePopover.svelte';
  import ComponentIdentityStrip from './component/ComponentIdentityStrip.svelte';
  // The progressive-complications section (issue 1286). It owns its own visibility gate, so it is
  // placed unconditionally rather than behind a second predicate that could drift out of step.
  import ComponentComplicationsSection from './component/ComponentComplicationsSection.svelte';
  // The one complication summary row, in its `readonly-gm` variant: six call sites share that
  // shape, and SonarCloud's copy-paste detector reads `.svelte`.
  import ComplicationSummaryRow from './ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../model/complicationSummary.js';
  import SortableList from '../../components/SortableList.svelte';
  // The shared essence quantity card (issue 772). It lives under `components/` because the
  // browser's bulk-edit panel renders it too, and the screenshot evidence map names it there.
  import EssenceQuantityCard from './components/EssenceQuantityCard.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
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
  // The add-new offer projection (issue 1036): only what this grid RENDERS is narrowed. The draft
  // stays unfiltered — it is the sole source `buildComponentEditorUpdates` rebuilds essences from.
  import { visibleEssenceOptions } from '../../../model/essenceValidation.js';
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
    salvageCheckDcMode = 'static',
    salvageCheckDc = 0,
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
  // The rendered subset (issue 1036): every ENABLED essence plus any disabled one already carried
  // at a positive quantity. `essenceDraft` stays whole; narrowing it would delete those quantities.
  const offeredEssences = $derived(
    visibleEssenceOptions(
      essenceDraft,
      (option) => clampComponentEssenceQuantity(option?.quantity) > 0
    )
  );
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
    // Transient UI state, not draft data. Reset with the drafts, or a second component would
    // inherit the first's open custom input.
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

  /**
   * The Validation tab's badge, in the shape `EditorTabs` takes. An early-return chain rather than a
   * nested ternary, which SonarCloud reports as S3358.
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

  /** The overall status the validation hero paints, from the counts the rows are grouped by. */
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
  const ownTagLabel = $derived(
    format('FABRICATE.Admin.Manager.Component.TagsEdit.OwnGroup', '{system}’s tags', {
      system: systemLabel,
    })
  );
  // THE WORLD BRANCH STATES WHAT IS TRUE, WHICH IS NOT WHAT THE REFERENCE STATES: the runtime does
  // not merge world tags — `resolveComponentTags` computes the additive set and the read union's
  // trailing in-system re-spread discards it. `### GM World Component Screens` forbids asserting the
  // false half, so this is a licensed departure. The card still SHOWS the world run.
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

  // Blank when unset, else the staged number. Read off the prop: the draft lives in the root.
  const difficultyInputValue = $derived(
    difficulty === null || difficulty === undefined ? '' : difficulty
  );

  // Stage on input so the editor's dirty state and Save button track edits live. Blank, sub-1,
  // non-integer or invalid stages null; a valid value stages the truncated integer.
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
  // resultGroups/outcomeRouting/dcOverride; the rest are kept verbatim for `buildUpdates`.
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

  // `difficulty` is projected onto the component options; a component that has never been given
  // one reads null and the badge says so rather than showing a spurious 0.
  function salvageResultDifficulty(componentId) {
    const option = componentOptions.find((opt) => opt.id === componentId);
    const numeric = Number(option?.difficulty);
    return Number.isFinite(numeric) ? numeric : null;
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
      // Preserved salvage fields first, then the three authored ones, so the rest survive a save.
      updates.salvage = {
        ...salvageDraft,
        resultGroups: salvageDraft.resultGroups,
        outcomeRouting: salvageDraft.outcomeRouting,
        dcOverride: salvageDraft.dcOverride,
        allowPlayerResultReorder: salvageDraft.allowPlayerResultReorder,
      };
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
          'There is nothing to enable yet. Add a result below to describe what this component yields, then enable salvage.'
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
  // The PERSISTED value derives the selection — never an `$effect` that writes back. An off-tier
  // `dcOverride: 14` selects Custom… and displays 14 verbatim, never snapping to a tier, and
  // rendering never marks the editor dirty (AC8a). But `Custom…` and `System default` both persist
  // `null`, so the GM's CHOICE is staged separately and deliberately NOT in the draft.
  let salvageDcCustomSelected = $state(false);
  const salvageDcSelection = $derived(
    salvageDcCustomSelected
      ? SALVAGE_DC_CUSTOM
      : resolveSalvageDcSelection(salvageDraft.dcOverride, salvageCheckTiers)
  );
  const salvageDcShowCustomInput = $derived(salvageDcSelection === SALVAGE_DC_CUSTOM);

  function setSalvageDcSelection(selection) {
    // Sticky only while Custom… is live; picking a tier hands control back to the persisted value.
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

  function setSalvageRoute(outcomeName, groupId) {
    const next = { ...salvageDraft.outcomeRouting };
    if (groupId) next[outcomeName] = groupId;
    else delete next[outcomeName];
    setSalvage({ outcomeRouting: next });
  }

  // `Stepper` reports a clamped NUMBER, or `null` when an `allowUnset` field is cleared. The `null`
  // fold stays: `null` is the persisted "inherit the system salvage DC" value.
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
   * The complication band's eyebrow. Two FULL key literals rather than one composed key, because
   * `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down.
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

  // The read-only complication strip under a progressive salvage row (issue 1286): the complications
  // authored on the YIELD component the row REFERENCES, never this component's own. It reads the
  // UNREDACTED authored list, because `forecastComplications` filters to the PLAYER's projection and
  // the authored default is `gmOnly`. Filtered to the SALVAGE activity.
  function salvageComplicationsFor(componentId) {
    const authored = salvageComponentOption(componentId)?.complications;
    return (Array.isArray(authored) ? authored : []).filter(
      (complication) => complication?.activities?.salvage === true
    );
  }

  // The macro and trigger vocabularies are SYSTEM-scoped, so this view's own lists resolve the
  // referenced component's names too; without them the sentence names nothing a GM recognises.
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

  // The yield picker's option list (issue 676). `icon` is the fallback for a component whose linked
  // item has no art: `SearchablePopover` renders a raw `<img>` only when `img` is truthy.
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
>
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
    <!--
      THE TWO-TAB STRIP lives INSIDE the form: the header's Save submits this element by id, so a
      form mounted only on the rules tab would stop being submittable on the Validation tab.
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
      THE SCROLLING PANEL (M26): the strip stays put and the tab body scrolls under it, carrying the
      inset. It is also the tab panel the strip's `aria-controls` names.
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
        ONE IDENTITY CALLOUT; the source Item is authored on the world entry rather than here. See
        `ComponentIdentityStrip`'s own header for why both smoke hooks survive.
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
        CATEGORY AND TAGS, SIDE BY SIDE in one `minmax(0,1fr) minmax(0,1.3fr)` grid, which is what
        fits the tag card's two labelled groups beside a control one line high.
      -->
        <div class="manager-component-rules-duo">
          <!-- ONE CONTROL, IN THE BODY, FULL WIDTH. The `InheritRow` it replaces is untouched for
          its other callers. -->
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
            THE NOTE IS DIRECTLY UNDER THE SELECT, with the model's own glyph and tone: `info` while
            inheriting, `warning` while overriding, subtle where the world authored nothing. The
            inheriting branch's raw literal maps to the info token (E-4) and is not quoted here,
            because the theme-colour contract scans prose as well as declarations.
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
          TWO LABELLED TAG GROUPS AND A MERGE NOTE, the world run first and the system's own beneath.
          THE WORLD GROUP IS READ-ONLY HERE, per D-r5: muting is authored on the world entry, where
          the list and its exceptions are visible together. Both PAINTS still apply, because a
          read-only chip must show which tags are muted. The route to the world record is the
          attribution banner at the top of this editor.
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
                    <!-- `struck` is the MUTED paint. NOT `disabled` — `Chip` joins `is-disabled`
                       to the WARNING family, which would paint a muted tag amber and read as a
                       hazard. `density="tag-run"` is the scale of a chip that is a control rather
                       than a badge, and composes with both paints so every tag renders at one size.
                       `info` rather than `tag` inks the WORLD run blue; the run below is purple. -->
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
                <!-- The pill IS the shared `Chip` (issue 772), with `aria-pressed` as the state
                   rather than a class, and written without internal whitespace because call sites
                   assert on exact `textContent`. THE LABEL ALONE, with no leading glyph and no
                   trailing state circle (UX F-F): the pair roughly doubled each chip's width, and
                   `aria-pressed` is what a screen reader reads. -->
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
        THE PROGRESSIVE DC CARD, DECLARED ONCE AND RENDERED IN ONE OF TWO PLACES. `component.difficulty`
        is ONE component-level scalar THREE engines read — progressive recipes, salvage and gathering
        — so the root gates the card on `componentDifficultyAxisProgressive`, true on any of them.
        Nesting it under salvage would hide it for every progressive-crafting or -gathering system
        whose salvage is simple or off, which is what the smoke harness drives. A `{#snippet}` rather
        than two copies, so `data-component-edit-section="difficulty"` resolves to exactly one element.
      -->
        {#snippet progressiveDcCard()}
          {#if showDifficulty}
            <!-- "This component's Progressive DC" (issue 676).
             `data-component-edit-section="difficulty"` is PRESERVED VERBATIM:
             `scripts/foundry-test-run.mjs` fills `[data-component-edit-section="difficulty"] input`
             and that step is not waivable. STAGED, not written on change, so it contributes to the
             dirty state and the exit guard; a SIBLING of `salvage`, never part of `updates.salvage`. -->
            <section
              class="manager-component-panel manager-component-inline-panel"
              data-component-edit-section="difficulty"
            >
              <div class="manager-task-card-heading">
                <div>
                  <!-- Its OWN key: `Component.ProgressiveDifficulty` is a SHORT label shared with
                   the browser badge and the evidence row, so it must not carry this sentence. -->
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
                 `> div { flex: 1 1 200px }` rule, which would otherwise grow it to half the row. -->
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
        `Essence contribution`, whose subtitle states what a GM must know before authoring one: these
        values are keyed to the essences THIS system uses, and dropping an essence drops them with it.
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
                    { count: offeredEssences.length, system: systemLabel }
                  )}
                </p>
              </div>
            </div>
            <!--
              THE INHERIT-OR-OVERRIDE CHOICE (M31): the shared `InheritRow`, filtered to the one
              section this card governs and drawn INSIDE the card beside the values it locks. ON is
              overridden. Withheld, with its note, while the world authored no map.
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
            <!-- THE COUNT AND THE GUARD READ THE ARRAY THE GRID DRAWS — `offeredEssences`, issue
               1036's enabled-plus-carried subset, not the whole roster. Reading the other array made
               the card miscount and the `No essences are defined …` empty state unreachable. -->
            {#if offeredEssences.length > 0}
              <div class="manager-component-essence-grid">
                {#each offeredEssences as option (option.id)}
                  <!-- The shared `EssenceQuantityCard` (issue 772), also rendered by the bulk-edit
                     panel. Its `Stepper` emits the already-clamped ABSOLUTE value for both adjuncts
                     and typed input, so one `setEssenceQuantity` covers every path. -->
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
            {:else if essenceDraft.length === 0}
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Component.EssencesEdit.NoEssences',
                  'No essences are defined for this system yet.'
                )}
              </p>
            {:else}
              <!-- TWO EMPTY STATES, BECAUSE THE GRID IS EMPTY FOR TWO REASONS: the guard reads
                 `offeredEssences`, so an all-DISABLED roster reaches it on a system that DOES define
                 essences. The fork is the only fact a GM can act on differently. -->
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Component.EssencesEdit.NoEnabledEssences',
                  'No essences are enabled for this system yet, and this component carries none.'
                )}
              </p>
            {/if}
          </section>
        {/if}

        <!-- The yield picker, shared by BOTH salvage result rows (issue 676). A `{#snippet}` rather
         than a new `.svelte` file: the call sites differ only in which group they write to, and a new
         component would need registering in every mount harness, where a missing entry HANGS the
         suite. NOT a `<select>`: the native control can show the NAME but never the IMAGE, and the
         popover is portaled to `.fabricate-manager` so it escapes the panel's `overflow: hidden`.
         No "clear" entry, matching `RecipeResultItemRow`: the row's × removes it properly. -->
        <!-- `data-add-salvage-group` rides this button ONLY while there is no backing group,
             because in that state this IS the add-group control: it takes a progressive component
             from zero groups to one, which the normalizer's clamp requires before `enabled` can
             ever be true. ONE definition, rendered as the list's footer while there are stages and
             under the empty message otherwise (issue 1512). -->
        {#snippet salvageStageAdder()}
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
        {/snippet}

        {#snippet salvageComponentPicker(groupId, result)}
          {@const selected = salvageComponentOption(result.componentId)}
          <span class="manager-salvage-component-field" data-salvage-result-component>
            <SearchablePopover
              options={salvageComponentPickerOptions}
              value={result.componentId}
              disabled={saving}
              pickerClass="manager-salvage-component-picker"
              triggerClass="fabricate-button manager-button manager-salvage-component-trigger"
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
            <!-- THE HEADING IS THE CONTROL ROW (issue 676): mode pill, divider, ENABLED, toggle,
             all on the heading line. -->
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
              <!-- `data-recipe-section` / `data-recipe-field` are `ToggleCard`'s hooks, kept
               verbatim now the toggle is hand-rolled into the heading: the AC4/AC9/AC10 suites drive
               them, and renaming them would silently unpin the salvage enablement rulings. -->
              <!-- `manager-task-card-heading-control`: see the DC card's note. -->
              <div
                class="manager-component-heading-controls manager-task-card-heading-control"
                data-recipe-section="salvage-enabled"
              >
                {#if salvageModeLabel}
                  <!-- Read-only: the mode is a SYSTEM setting, authored on Crafting Settings, and
                   it names the mode that decides this panel's shape. EXEMPT FROM RULING A: the pill
                   is not chrome that only means something once salvage runs, and the result editor
                   below stays authorable while salvage is off. `tone="secondary"` is a step louder
                   than `neutral` and quieter than every semantic family. -->
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
                <!-- The per-component salvage gate (issue 676): persisted, normalized and a live
                 runtime gate long before any control wrote it, so a component auto-disabled by
                 `_disableInvalidSalvageConfigs` was permanently unsalvageable from the UI. The
                 zero-groups explanation is VISIBLE body copy (`[data-salvage-disabled-notice]`),
                 never a `title` here: a disabled `<button>` receives no mouse events. -->
                <!-- The shared switch, so this card and `ToggleCard` draw one control rather than
                 two spellings of it (issue 1040). -->
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

            <!-- The banner and the reorder policy sit ABOVE the list (issue 676): both describe
             what the ORDER MEANS, and the order is what is authored below. -->
            {#if salvageShowChrome && salvageProgressive}
              <!-- The shared `Callout`. NEUTRAL, not info (issue 1505): the specimen reserves the
               info tint for a note about LIVE state, and roll budget is an invariant. It also sits
               directly above an info-tinted `ToggleCard`. -->
              <Callout
                tone="neutral"
                icon="fas fa-circle-info"
                dataAttr="data-salvage-roll-budget"
                text={text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.RollBudget',
                  'Roll budget flows down the list: each result is claimed in order while the check total still covers its DC.'
                )}
              />

              <!-- Progressive-only: the flag has no meaning in the simple or routed salvage modes,
               which award a whole group rather than spending down a list. -->
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
                <!-- PROGRESSIVE: an ordered list of SINGLE results, with no group chrome. See
               `salvageStageGroup` for why the groups are still the storage. -->
                <span class="manager-component-readonly-label">
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.Results',
                      'Results'
                    )}</span
                  >
                </span>
                <!-- The ordered salvage stage list is the shared one (issue 1512): the grip, the
                     ordinal badge, the rocker, the drag source and the announcement are all the
                     list's. Every control it draws is an `IconButton`, so each carries
                     `type="button"` — this is the one converted site inside a `<form>`, where a
                     control without it submits the draft on a keyboard move. The complication band
                     is the list's body because it is full-bleed, and `alwaysOpen` renders it on
                     every stage with no disclosure. The row keeps its own remove, because
                     `data-remove-salvage-result` is the hook the mounted suite addresses a stage
                     by. -->
                {#if salvageStages.length > 0}
                  <SortableList
                    items={salvageStages}
                    itemLabel={(result) => salvageComponentName(result.componentId)}
                    numbered
                    alwaysOpen
                    reorderable={!saving}
                    onReorder={(from, to) => moveSalvageStage(from, to)}
                    rowClass={() => 'manager-salvage-stage-row'}
                    rowData={(result) => ({
                      'data-salvage-result': result.id,
                      'data-salvage-stage': String(salvageStages.indexOf(result) + 1),
                    })}
                  >
                    {#snippet row(result)}
                      {@render salvageComponentPicker(salvageStageGroup.id, result)}

                      <!-- NO QUANTITY HERE (issue 676): progressive awards one entry at a time, so
                           "two of X" is authored by listing X twice.
                           `CraftingEngine._resolveSalvageResultGroups` forces `quantity: 1` on
                           every awarded progressive entry, so this hides nothing awardable. -->

                      <!-- READ-ONLY: `difficulty` belongs to the RESULT component, whose own editor
                           owns its save lifecycle. The "Edit" link is the way to change it. -->
                      <span
                        class="manager-salvage-result-difficulty"
                        data-salvage-result-difficulty={salvageResultDifficulty(
                          result.componentId
                        ) === null
                          ? ''
                          : String(salvageResultDifficulty(result.componentId))}
                        ><!-- The fallback must MATCH the lang value, or the two disagree and the
                           fallback describes a string nobody sees: `DifficultyUnset` resolves to
                           "No difficulty". The recipe stage row reads the same. -->
                        {salvageResultDifficulty(result.componentId) === null
                          ? text(
                              'FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyUnset',
                              'No difficulty'
                            )
                          : `${text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyShort', 'DC')} ${salvageResultDifficulty(result.componentId)}`}</span
                      >

                      {#if result.componentId}
                        <!-- Opens the referenced yield component's editor. The navigation is
                             guarded (the `component-edit` row of `ROUTE_EXIT_GUARDS` waives no
                             navigation), so a dirty draft prompts rather than being discarded. -->
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

                      <IconButton
                        class="is-danger"
                        size={24}
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
                    {/snippet}
                    {#snippet body(result)}
                      {@const stageComplications = salvageComplicationsFor(result.componentId)}
                      <!-- THE READ-ONLY COMPLICATION STRIP (issue 1286), the list's body and
                           therefore full-bleed, as the Recipe Studio draws the same band: row and
                           band are ONE card, with the band's `border-top` as the divider. This
                           OVERRIDES the Component Studio prototype on a maintainer ruling. The
                           `:has()` rules that bought the shape by hand are gone with the
                           hand-rolled row (issue 1512). `role="presentation"` stays: the band
                           annotates the stage above it and must never be announced as one. -->
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
                            <!-- The ONLY route to changing any of this: a complication belongs to
                                 the referenced component, whose own editor owns its save lifecycle.
                                 Its label names complications, so it differs from the row's Edit
                                 link. -->
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
                          <!-- No `severityLabel`: this prototype draws severity as the coloured dot
                               alone. The Recipe Studio's strip draws the word too, and passes it. -->
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
                    {/snippet}
                    {#snippet footer()}
                      <li class="manager-salvage-stage-add">{@render salvageStageAdder()}</li>
                    {/snippet}
                  </SortableList>
                {:else}
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.NoResultsYet',
                      'No results yet.'
                    )}
                  </p>
                  <!-- The adder follows the empty message (issue 1512): with no stages there is no
                       list to be a footer of, and an empty state that says "add one" with nothing
                       to press is a dead end. -->
                  {@render salvageStageAdder()}
                {/if}
                <!-- The reference closes the progressive body with this component's own DC row.
                 See the snippet's declaration for why it is rendered here. -->
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
                  <!-- REQUIRED visible hint (issue 764), never a `title`: a tooltip on an absent
                 control never fires. It explains why Add group is gone at the one-group cap. -->
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
                      <!-- One `--fab-bg-1` card per result group behind a hairline, headed by the
                       group's name and its count in the mono face. THE HEAD KEEPS ITS NAME INPUT AND
                       THE BODY KEEPS ITS ROWS: the reference's read-only pill run cannot author a
                       quantity, choose a component or rename a group. -->
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
                          <!-- The group's own count, in the mono face at weight 500 — the face
                           ships 400 and 500 only, so the reference's 700 lands on 500. -->
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
                                <!-- The quantity STAYS in simple and routed: these modes award the
                               whole group as authored. Only progressive drops it. -->
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
               multi-group list; Simple with no success group yet still shows it. -->
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

            <!-- RULING A: everything below is CHROME and collapses when salvage is off. The
             result-group editor above does NOT, because it owns the only add-group control. -->
            {#if salvageShowChrome && salvageRouted}
              <!-- A `--fab-bg-1` well behind a hairline, headed by an `OUTCOME ROUTING` micro-label
               and holding one row per outcome. -->
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

            <!-- The component's own check-modifier pick (issue 1095), rendered only under the
             salvage check's `bySubject` rule and only over a non-empty system catalogue. ITS GATE IS
             ITS OWN, NOT THE DC OVERRIDE'S: `salvageShowDcOverride` is `simple || routed` and
             excludes progressive, but `CraftingEngine._runSalvageCraftingCheck` builds the modifier
             context before dispatch, so a progressive roll honoured a pick no editor could author. -->
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
              <!-- A `--fab-bg-1` well titled `Salvage check DC`, whose note names where the presets
               come from. -->
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
                <!-- Presets are the SYSTEM'S authored salvage check tiers (decision 7), never a
                 hard-coded DC list. Storage is unchanged: null = system default, else an integer. -->
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
                  <!-- `allowUnset`: a cleared field is "inherit the system salvage check DC", the
                   same `dcOverride: null` the preset select writes. `min={0}` because an unset field
                   steps from `min ?? 0`, so without it one `−` click commits -1. `fill` needs a slot,
                   supplied by the `[data-salvage-dc-override] .fab-stepper` cap in the global sheet. -->
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
                <!-- Kept by decision 7. The zero-authored-tiers case is the COMMON one and is
                 exactly why it exists: with no presets to choose, this is the way forward. -->
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
      THE PROGRESSIVE DC CARD'S OTHER PLACEMENT, for the configuration the reference has none of and
      the smoke harness drives: a progressive-crafting or -gathering system whose salvage is simple
      or off.
    -->
        {#if showDifficulty && !(showSalvage && salvageProgressive)}
          {@render progressiveDcCard()}
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
        THE VALIDATION TAB: the same `EditorValidationSurface` shape the world entry's draws. Its
        checks are the SYSTEM rules', which is why they come from `componentRulesValidation.js` and
        not `componentScopeValidation.js`, whose subject is the world record.
      -->
        <EditorValidationSurface
          title=""
          summary={validationSummary}
          counts={validation.counts}
          groups={validation.groups}
          statusLabels={{
            pass: text('FABRICATE.Admin.Manager.Validation.StatusPass', 'Pass'),
            warn: text('FABRICATE.Admin.Manager.Validation.StatusWarn', 'Warning'),
            block: text('FABRICATE.Admin.Manager.Component.Validation.Blocks', 'Blocks'),
          }}
          hookAttrs={{ root: { 'data-component-edit-validation': '' } }}
          rowDataAttr="data-component-validation-check"
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

<style>
  /* The read-only complication strip (issue 1286). Component-SCOPED and theme-ROOT tokens only, so
     the band renders the same wherever this row shape is reused. THE BAND IS ATTACHED, overriding the
     prototype on a maintainer ruling: what goes is the margin, the surrounding border and the
     right-hand radii; every value the parity spec measures stands. */

  /* The three `:has()` rules that bought this shape by hand are gone (issue 1512): the list's row
     is already a column whose line carries the padding and which clips itself, so a band rendered
     as the row's body meets the row's own border by construction. */

  /* NO margin and NO radius: the `border-top` IS the divider, and a divider only reads as one when
     the two surfaces meet. The 2px `--fab-warning` left rule marks the stage's warning annotation. */
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

  /* The band's eyebrow. It names the OWNING component, because a GM scanning a list of stages needs
     the band's subject stated rather than inferred from adjacency. */
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

  /* `margin-left: auto` is stated rather than inherited: the shared `.manager-salvage-stage-edit`
     rule places the link in the ROW's trailing cluster, and the title above takes the free space. */
  .manager-salvage-stage-complications-head .manager-salvage-stage-edit {
    flex: 0 0 auto;
  }
  /* THE CATEGORY NOTE IS STATED ONCE, IN THE SHEET. Svelte's scoping appends a hash class, so a
     scoped copy here out-specified `.fabricate-manager .manager-component-cat-note` and quietly won
     five declarations the sheet writes to the reference. */
</style>
