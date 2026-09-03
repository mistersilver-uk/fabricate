<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import ComponentRow from './components/ComponentRow.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import {
    describeComponentSelection,
    pruneComponentSelection,
    setComponentSelection,
    toggleComponentSelection,
  } from '../../../../utils/componentBulkEditModel.js';
  import {
    COMPONENT_SORT_KEYS,
    buildComponentBrowserModel,
    componentCategoryOptions,
    createComponentBrowserState,
  } from '../../../../utils/componentBrowserModel.js';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel,
  } from '../../../../utils/componentCategories.js';
  import SharedDefinitionCallout from './scoped/SharedDefinitionCallout.svelte';
  import {
    componentAttributionNote,
    componentInheritState,
    componentMembershipFilters,
  } from './scoped/componentScoped.js';

  /**
   * The world entry route this screen deep-links to.
   *
   * A MODULE CONSTANT rather than an inline literal, because it is the one string that decides
   * whether the link resolves at all: the issue body named `world-component-edit`, which appears
   * nowhere in the route table, and a token that does not resolve loses the breadcrumb's middle
   * crumb and lands the navigation on nothing without erroring.
   */
  const WORLD_ENTRY_ROUTE = 'world-component-entry';

  let {
    itemCards = [],
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemId = '',
    // ── THE WORLD SCOPE'S OWN PROJECTION, ITS WRITE FAMILY, AND THE SYSTEM THIS SCREEN IS ON ──
    // Three of the four keys the call site's component bundle spreads. `systems` stays
    // undeclared, as the sibling Tool Rules list leaves it: declaring a name the site does not
    // pass makes the lookup fall THROUGH to the spread and turns every reader of that prop into
    // a live subscriber to the whole bundle, including `scope`, which is a new object on every
    // publish. All three of these ARE passed, so none of them does.
    //
    // `systemId` is read rather than inferred: `scope.entries[].systems[]` is the world
    // projection's own JOIN, and picking this system's row out of it is the only way a row can
    // state whether it INHERITS the world category or overrides it — the system's own component
    // record carries the resolved value and cannot tell the two apart.
    scope = null,
    actions = null,
    systemId = '',
    // eslint-disable-next-line no-unused-vars -- deliberately reader-less; see the note below
    selectedSystemResolutionMode = 'simple',
    // Whether the system is progressive on ANY axis that reads `component.difficulty` —
    // crafting resolution mode, salvage resolution mode, or the gathering economy's
    // (issue 772). The row's read-only DC badge used to gate on the CRAFTING mode alone,
    // which made it invisible on a salvage-only-progressive system while the editor
    // control and the bulk panel both showed it. All three read ONE predicate now, and it
    // arrives as its own prop rather than being re-derived from
    // `selectedSystemResolutionMode`. That prop now has no reader in this component at
    // all, and is kept ANYWAY as a NEGATIVE CONTROL: the re-gate test in
    // `components-browser-view-mounted.test.js` passes a non-progressive crafting mode
    // alongside a progressive salvage axis, and the badge must still render. Deleting it
    // would leave that test unable to state the thing it is checking.
    difficultyAxisProgressive = false,
    categoryVocabulary = [],
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157). The clear stays
    // this browser's — the selection is its state — but the FEEDBACK cannot be: emptying the
    // selection unmounts the bulk panel and the Clear button that was pressed, so the
    // announcement and the focus hop belong to something that outlives both. Optional, so a
    // standalone mount clears exactly as it did.
    onSelectionCleared = null,
    // THE DEEP LINK OUT OF THIS SCREEN, into the world entry that AUTHORS the identity the
    // attribution banner names. Called with the ROUTE TOKEN and the entity id, because the token
    // is the half that decides whether the navigation resolves and a page cannot route.
    onOpenWorldEntry = () => {},
    // The filter / sort / group / paginate view-state (issue 676). The manager root
    // LIFTS this up and binds it here so it survives the editor round-trip: opening a
    // component unmounts this browser, and remounting it with the controls reset to
    // defaults threw away the page, filters, sort and grouping the GM left — which is
    // exactly what this view did before, because it kept all of it locally. Mirrors
    // RecipesBrowserView. When unbound (the isolated mounted tests) the local fallback
    // below keeps every control reactive in-component.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createComponentBrowserState());
  // The active view-state: the root's lifted object when bound, else the local
  // fallback. Both are `$state` proxies, so nested writes (`ui.categoryFilter = …`)
  // are reactive AND, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the filters — they name a vocabulary the new system does
  // not share. The page/sort/group PREFERENCES are deliberately kept.
  //
  // The sentinel is `ui.systemId`, PERSISTED on the lifted browser state — NOT a
  // component-local `$state`. A local sentinel re-initialised to '' on every mount, so
  // returning from an editor (a remount with the system unchanged) was misread as a
  // system switch and wiped the page/filters/collapse this object otherwise preserves
  // (issue 806). The equality early-return means writing `ui.systemId` back inside the
  // same effect does not loop — it mirrors the `model.pageIndex` sync effect.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    ui.collapsedCategories = new Set();
    // The bulk selection is scoped to the selected system — its ids name components the
    // new system does not have — so a switch clears it, and the root discards the staged
    // draft when the count reaches zero (issue 772).
    ui.bulkSelectedComponentIds = new Set();
    ui.systemId = selectedSystemId;
  });

  const showComponentEssences = $derived(
    (itemCards || []).some(
      (item) => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)
    )
  );
  const componentEssenceOptions = $derived(
    uniqueSorted(
      (itemCards || []).flatMap((item) =>
        Array.isArray(item.essences)
          ? item.essences.map((essence) => essence.name || essence.id)
          : []
      )
    )
  );
  const categoryOptions = $derived(componentCategoryOptions(itemCards || [], categoryVocabulary));

  // Grouping ON ⇒ order category-major BEFORE pagination (issue 801), so each category is
  // a contiguous run across page boundaries rather than an interleaved slice on every
  // page. `groups` still groups the current page; the header's "N of M" stays truthful for
  // a category that spans a boundary. When grouping is OFF the order is unchanged.
  //
  // The four steps used to be composed here by hand. They moved into
  // `buildComponentBrowserModel` for issue 1081: the per-category totals the group headers
  // pair with their rendered count MUST be counted over the FILTERED COHORT, and once row
  // projection is page-scoped a pipeline assembled at the call site is exactly where
  // "count the array in scope" — the page — gets written.
  const model = $derived(
    buildComponentBrowserModel(cohortCards(), {
      category: ui.categoryFilter,
      essence: ui.essenceFilter,
      // Not applied as a filter here (the store searches before projecting); it feeds the
      // active-filter chip run only.
      search: itemSearchTerm,
      sortKey: ui.sortKey,
      sortDirection: ui.sortDirection,
      pageIndex: ui.pageIndex,
      pageSize: ui.pageSize,
      groupByCategory: ui.groupByCategory,
    })
  );
  const filteredComponents = $derived(model.filtered);
  // The expensive half of a component card — its linked source document, the "Missing"
  // badge and the live description fallback — is resolved for the PAGE and nothing else
  // (issue 1081). The store projects every card cheaply and only this view knows which of
  // them are on screen, so the request has to originate here.
  //
  // `hydrate()` is idempotent and memoized per card, so re-running this effect on every
  // re-render (including the store's own republish once the cards fill) costs nothing. The
  // returned promise is deliberately not awaited: the card fills itself in place and the
  // store republishes, which is what re-renders the rows.
  //
  // Called off the card rather than through the projection's `hydrateItemCards` helper on
  // purpose: importing `stores/adminComponentRowProjection.js` here would pull that module
  // (and its own imports) into the dependency closure of every mounted-component suite that
  // renders this tree, where a module missing from the harness allowlist HANGS the suite as
  // `# cancelled` rather than failing. A card with no `hydrate` — an isolated mount's plain
  // fixture — is simply left as it is.
  //
  // The rejection is swallowed deliberately rather than left to become an unhandled
  // rejection on every render: a card that could not resolve keeps its un-hydrated reading,
  // which renders correctly rather than blankly, and the projection drops its memo on
  // rejection so the next render retries.
  $effect(() => {
    for (const card of model.page) card?.hydrate?.()?.catch?.(() => {});
  });
  const page = $derived({
    components: model.page,
    pageIndex: model.pageIndex,
    pageCount: model.pageCount,
    totalCount: model.totalCount,
    // The 1-based inclusive window the pager renders as "1–25 of 30". Dropping these makes
    // the count read "undefined–undefined of 30" and nothing else fails.
    rangeStart: model.rangeStart,
    rangeEnd: model.rangeEnd,
  });
  const groups = $derived(model.groups);

  // ── Bulk selection (issue 772) ───────────────────────────────────────────────────
  // `pageIds` is the set of RENDERED row ids, NOT `page.components`: with grouping on
  // (the default) a COLLAPSED group renders no rows at all, so a naive page list would let
  // the toolbar's tri-state box select rows the GM cannot see and report a count exceeding
  // the visible ones. `filteredIds` is the whole filtered set, which the results link
  // reaches and the page box deliberately cannot.
  const bulkSelectedIds = $derived(ui.bulkSelectedComponentIds ?? new Set());
  const filteredIds = $derived(filteredComponents.map((item) => item.id));
  const pageIds = $derived(
    ui.groupByCategory
      ? groups
          .filter((group) => !isCategoryCollapsed(group.category))
          .flatMap((group) => group.components.map((item) => item.id))
      : page.components.map((item) => item.id)
  );
  const selectionSummary = $derived(
    describeComponentSelection({
      pageIds,
      filteredIds,
      selectedIds: bulkSelectedIds,
    })
  );

  // A delete, an unlink or a store refresh must never leave a phantom id in the count or
  // in an `Apply`. Only assigned when something actually dropped — the pruned set is a
  // subset, so equal sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedComponentIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneComponentSelection(
      current,
      (itemCards || []).map((item) => item.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedComponentIds = pruned;
  });

  // Every mutation assigns a NEW Set rather than mutating in place, so the bound lifted
  // state propagates back to the manager root — the rule `collapsedCategories` above
  // already documents.
  function toggleComponentBulkSelected(id) {
    ui.bulkSelectedComponentIds = toggleComponentSelection(bulkSelectedIds, id);
  }

  function setPageSelected(on) {
    ui.bulkSelectedComponentIds = setComponentSelection(bulkSelectedIds, pageIds, on);
  }

  function selectAllResults() {
    ui.bulkSelectedComponentIds = setComponentSelection(bulkSelectedIds, filteredIds, true);
  }

  // The write is FIRST, so the owner's callback runs with Svelte's flush already ahead of the
  // focus hop it schedules.
  function clearBulkSelection() {
    ui.bulkSelectedComponentIds = new Set();
    onSelectionCleared?.();
  }

  // The active-filter chips, derived by the pure model so the run and the "is anything
  // on?" question can never disagree.
  const chips = $derived(model.chips);

  const sortOptions = $derived(
    COMPONENT_SORT_KEYS.map((key) => ({
      key,
      label: sortLabel(key),
    }))
  );

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

  const CHIP_LABELS = {
    category: ['FABRICATE.Admin.Manager.Component.ChipCategory', 'Category: {value}'],
    essence: ['FABRICATE.Admin.Manager.Component.ChipEssence', 'Essence: {value}'],
    search: ['FABRICATE.Admin.Manager.Component.ChipSearch', 'Search: {value}'],
  };

  function chipLabel(chip) {
    const [labelKey, fallback] = CHIP_LABELS[chip.id];
    const value = chip.id === 'category' ? categoryLabel(chip.value) : chip.value;
    return format(labelKey, fallback, { value });
  }

  function clearChip(chipId) {
    if (chipId === 'category') setCategoryFilter('all');
    if (chipId === 'essence') setEssenceFilter('all');
    if (chipId === 'search') onSearchChange('');
  }

  function sortLabel(key) {
    const labels = {
      name: text('FABRICATE.Admin.Manager.Component.SortName', 'Name'),
      category: text('FABRICATE.Admin.Manager.Component.SortCategory', 'Category'),
      essences: text('FABRICATE.Admin.Manager.Component.SortEssences', 'Essences'),
      salvage: text('FABRICATE.Admin.Manager.Component.SortSalvage', 'Salvage'),
    };
    return labels[key] || key;
  }

  function categoryLabel(category) {
    return getComponentCategoryLabel(category, localize);
  }

  // Suppressed for `general`: no redundant "General" chip on every uncategorized row.
  // `general` remains a selectable FILTER option, pinned last as the catch-all — the
  // same badge-vs-filter asymmetry the Recipe Studio settled on.
  function categoryBadgeFor(item) {
    const category = item?.category || GENERAL_COMPONENT_CATEGORY;
    return category === GENERAL_COMPONENT_CATEGORY ? '' : categoryLabel(category);
  }

  function uniqueSorted(values) {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  // Where the component's linked item lives — a real state, so it reads as a StatusPill
  // (the shared vehicle the Recipe Studio's row states use) rather than a raw chip.
  // A resolved link (compendium / world) is ACCENT; an unresolved stored source is the
  // one WARNING, because a component whose source no longer exists is a thing the GM
  // must be able to scan a library for.
  function componentSourceOrigin(item) {
    if (item?.sourceMissing) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.Manager.Component.SourceOriginMissing', 'Missing'),
        tone: 'warning',
        icon: 'fas fa-link-slash',
      };
    }
    const origin = item?.sourceOrigin || '';
    if (origin === 'compendium') {
      return {
        id: 'compendium',
        label:
          item?.sourceOriginLabel ||
          text('FABRICATE.Admin.Manager.Component.SourceOriginCompendium', 'Compendium'),
        tone: 'accent',
        icon: 'fas fa-book-atlas',
      };
    }
    if (origin === 'world') {
      return {
        id: 'world',
        label:
          item?.sourceOriginLabel ||
          text('FABRICATE.Admin.Manager.Component.SourceOriginWorld', 'Items Directory'),
        tone: 'accent',
        icon: 'fas fa-box-archive',
      };
    }
    return {
      id: 'unknown',
      label:
        item?.sourceOriginLabel ||
        text('FABRICATE.Admin.Manager.Component.SourceOriginUnknown', 'Unknown'),
      tone: 'subtle',
      icon: 'fas fa-circle-question',
    };
  }

  // ── THE WORLD PROJECTION'S PER-SYSTEM JOIN, indexed by world entity id ──────────────────
  // Read as a Map rather than scanned per row: `scope` republishes a NEW object on every
  // world-scope edit, and a `find` per row would walk the whole corpus once per component on
  // every one of them.
  const worldRowsByComponentId = $derived(
    new Map(
      (Array.isArray(scope?.entries) ? scope.entries : []).map((entry) => [
        String(entry?.id ?? ''),
        (Array.isArray(entry?.systems) ? entry.systems : []).find(
          (row) => row?.systemId === systemId
        ) ?? null,
      ])
    )
  );

  const worldEntriesById = $derived(
    new Map(
      (Array.isArray(scope?.entries) ? scope.entries : []).map((entry) => [
        String(entry?.id ?? ''),
        entry,
      ])
    )
  );

  /**
   * What one row says about its relationship to the world default, or `null` when the world
   * corpus has no record of this component and there is therefore nothing to inherit FROM.
   *
   * @param {string} componentId
   * @returns {{state: string, label: string}|null}
   */
  function inheritState(componentId) {
    return componentInheritState(worldRowsByComponentId.get(String(componentId || '')), format);
  }

  // ── THE THREE MEMBERSHIP FILTERS ────────────────────────────────────────────────────────
  // `all` is the one that changes what a row IS. Search, category and essence narrow a list of
  // THIS system's components; `All world components` widens it past them, to world records this
  // system has no rules for at all — which is the only route on this screen to adopt a component
  // a GM has not added yet.
  //
  // HELD LOCALLY RATHER THAN LIFTED, and that is a scope decision rather than a preference: the
  // lifted browser state is minted by `createComponentBrowserState`, in a file this change does
  // not open, so a lifted axis would be a key that object does not declare. The consequence is
  // that this one filter resets on the editor round trip while the other five survive it; the
  // follow-up is one field on that factory.
  let membershipFilter = $state('in');

  const systemComponentIds = $derived(
    new Set((itemCards || []).map((item) => String(item?.id ?? '')))
  );

  /**
   * The world records this system has NO component for, projected into a row shape of their own.
   *
   * They are `member: false` and carry NO category, essence, difficulty or salvage answer,
   * because this system has authored none: everything a row states about behaviour is a
   * MEMBERSHIP fact, and inventing one from the world default would claim rules that do not
   * exist here.
   */
  const ghostRows = $derived(
    (Array.isArray(scope?.entries) ? scope.entries : [])
      .filter((entry) => !systemComponentIds.has(String(entry?.id ?? '')))
      .map((entry) => ({
        id: String(entry?.id ?? ''),
        member: false,
        name: entry?.entity?.name || String(entry?.id ?? ''),
        img: entry?.entity?.img || '',
        description: entry?.entity?.description || '',
        search: `${entry?.entity?.name ?? ''} ${entry?.entity?.description ?? ''}`.toLowerCase(),
      }))
  );

  const membershipFilters = $derived(
    componentMembershipFilters(
      {
        members: (itemCards || []).length,
        world: (itemCards || []).length + ghostRows.length,
      },
      format
    )
  );

  /**
   * THE GHOST HALF OF THE COHORT, after the membership segment and the search term.
   *
   * A superset of the member rows in every case, so every previously reachable state is reached
   * identically: `all` widens, `in` and `over` show none of these at all.
   *
   * THE ZERO STATE IS GATED ON THE COHORT AND NOT ON THE RAW PROP, which is the whole point of
   * naming this. The sibling Tool Rules list records what happens otherwise: for a system that
   * has adopted nothing, the toolbar reads `3 shown` over a body drawing the zero state, because
   * `itemCards.length === 0` is true and stays true whatever the segment says — and the ONE route
   * in the product to adopt a component into an empty system becomes unreachable.
   */
  const visibleGhostRows = $derived(
    membershipFilter === 'all'
      ? ghostRows.filter((row) => {
          const needle = String(itemSearchTerm || '')
            .trim()
            .toLowerCase();
          return !needle || row.search.includes(needle);
        })
      : []
  );

  /**
   * The MEMBER half of the cohort, before the model's own filter, sort and page.
   *
   * A FUNCTION DECLARATION rather than a `$derived`, because the browser model above is declared
   * earlier in this file and reads it: a `const` would be in its temporal dead zone at parse
   * order, while a hoisted function is called only when the model is first evaluated, which is
   * during render and therefore after every top-level statement has run.
   *
   * @returns {object[]}
   */
  function cohortCards() {
    const cards = itemCards || [];
    if (membershipFilter !== 'over') return cards;
    return cards.filter((item) => inheritState(item?.id)?.state === 'overridden');
  }

  const cohortRows = $derived([...cohortCards(), ...visibleGhostRows]);

  /**
   * How many of THIS system's components inherit the world category, and how many override it.
   *
   * `known` is the denominator and is what gates the line: a system whose components the world
   * corpus holds no record of has nothing to inherit FROM, and a `0 inherit · 0 override` line
   * over such a library states a relationship that does not exist rather than a missing one.
   */
  const inheritSummary = $derived(
    (itemCards || []).reduce(
      (totals, item) => {
        const state = inheritState(item?.id)?.state;
        if (!state) return totals;
        return {
          known: totals.known + 1,
          inheriting: totals.inheriting + (state === 'inherited' ? 1 : 0),
          overriding: totals.overriding + (state === 'overridden' ? 1 : 0),
        };
      },
      { known: 0, inheriting: 0, overriding: 0 }
    )
  );

  const bannerEntry = $derived(
    worldEntriesById.get(String(selectedComponentId || '')) ??
      worldEntriesById.get(String(cohortRows[0]?.id ?? '')) ??
      null
  );

  function isSelectedComponent(item) {
    return !!selectedComponentId && item.id === selectedComponentId;
  }

  function setCategoryFilter(value) {
    ui.categoryFilter = value;
    ui.pageIndex = 0;
  }

  function setEssenceFilter(value) {
    ui.essenceFilter = value;
    ui.pageIndex = 0;
  }

  function setSortKey(value) {
    ui.sortKey = value;
    ui.pageIndex = 0;
  }

  function toggleSortDirection() {
    ui.sortDirection = ui.sortDirection === 'asc' ? 'desc' : 'asc';
  }

  function toggleGroupByCategory() {
    ui.groupByCategory = !ui.groupByCategory;
  }

  // Collapse is opt-IN: a category absent from the set is expanded. A new Set is
  // assigned rather than mutated so the bound state propagates back to the root.
  function toggleCategoryCollapsed(category) {
    // Copy-then-reassign, per the contract above: in-place SvelteSet mutation would stop
    // the bound state propagating back to the manager root.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(ui.collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    ui.collapsedCategories = next;
  }

  function isCategoryCollapsed(category) {
    return ui.collapsedCategories.has(category);
  }

  // The header says BOTH numbers, because either one alone lies (issue 676). This view
  // groups the PAGE, so counting `filteredComponents` would put "282 components" above
  // the 25 rows page 1 renders — but counting only the page put "General · 25 components"
  // above page 1 of a 282-strong General bucket, which says the bucket holds 25. So a
  // partially-shown group reads "25 of 282 components"; `group.total` is the category's
  // size across the FILTERED rows.
  //
  // A group shown WHOLE says it once — "25 components", not "25 of 25". Grouping is on by
  // default and most libraries fit one page, so the "of" form would otherwise be pure
  // noise on the common case. The plural agrees with the TOTAL, which is >= 2 whenever
  // the "of" form is used; "1 components" (the shipped bug) is what the GroupCountOne key
  // exists to prevent.
  function groupCountText(group) {
    const count = group.components.length;
    const total = group.total ?? count;
    if (total > count) {
      return format(
        'FABRICATE.Admin.Manager.Component.GroupCountOfTotal',
        '{count} of {total} components',
        { count, total }
      );
    }
    return count === 1
      ? text('FABRICATE.Admin.Manager.Component.GroupCountOne', '1 component')
      : format('FABRICATE.Admin.Manager.Component.GroupCount', '{count} components', { count });
  }

  function clearFilters() {
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    onSearchChange('');
  }

  // Progressive-difficulty parity with the component editor (issue 651, re-gated for
  // issue 772): shown whenever the system is progressive on ANY axis that reads
  // `component.difficulty`, and only where a value is authored. It reads "None" when the
  // axis is on but the component has no difficulty, so a GM can see the gap.
  //
  // This used to read `selectedSystemResolutionMode === 'progressive'` — the CRAFTING axis
  // alone — which was already false against the editor control (three-axis since issue
  // 676) and would have let the bulk panel write a DC that NO row could display on a
  // salvage-only or gathering-only progressive system.
  const showProgressiveDifficulty = $derived(difficultyAxisProgressive === true);

  // The badge reads as the VALUE ALONE — `3`, or `None` — and names itself through its
  // tooltip rather than its text. In a row of badges the words "Progressive difficulty"
  // repeated on every component crowded out the description they sit beside, and the gauge
  // glyph plus a bare number is already unambiguous once the tooltip is there to confirm it.
  // The label is not dropped, only moved: `difficultyBadgeTitle` carries it.
  function difficultyBadgeFor(item) {
    if (!showProgressiveDifficulty) return '';
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) && difficulty >= 1
      ? String(difficulty)
      : text('FABRICATE.Admin.Manager.Component.DifficultyNone', 'None');
  }

  // The row carries ONE action — Edit. Copy-source-UUID and Delete moved into the
  // browser inspector (issue 676): three ghost icons on every row turned it into a
  // toolbar and truncated the description, exactly as the Recipe Studio found.
  function rowProps(item) {
    const origin = componentSourceOrigin(item);
    return {
      component: item,
      selected: isSelectedComponent(item),
      categoryBadge: categoryBadgeFor(item),
      difficultyBadge: difficultyBadgeFor(item),
      difficultyBadgeTitle: text(
        'FABRICATE.Admin.Manager.Component.ProgressiveDifficulty',
        'Progressive difficulty'
      ),
      originLabel: origin.label,
      originTone: origin.tone,
      originIcon: origin.icon,
      editLabel: format('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}', {
        name: item.name,
      }),
      editTitle: text('FABRICATE.Admin.Manager.Component.Edit', 'Edit component'),
      noDescriptionText: text('FABRICATE.Admin.Manager.NoDescription', 'No description'),
      bulkSelected: bulkSelectedIds.has(item.id),
      selectLabel: format(
        'FABRICATE.Admin.Manager.BulkEdit.SelectRow',
        'Select {name} for bulk edit',
        { name: item.name }
      ),
      onSelect: onSelectComponent,
      onEdit: onEditComponent,
      onToggleSelect: toggleComponentBulkSelected,
    };
  }
</script>

<!--
  There is ONE page header, and the shell owns it. This view used to render a SECOND
  one — kicker + "Component directory" + a second subtitle — directly under the shell's
  breadcrumb / "Components" / subtitle block: ~74px of duplicated chrome saying what the
  breadcrumb and the titlebar's gold system badge already said. The Recipe Studio
  deleted exactly this; ruling 1 says it wins.
-->
<main
  class="manager-main"
  data-component-library
  aria-label={text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}
>
  <!--
    THE CATALOGUE ATTRIBUTION BANNER. Everything a GM reads on this screen names a component
    whose identity is authored ONE ROUTE AWAY, in the world catalogue, and shared with every
    other system that has rules for it — so without this the screen offers no signal at all that
    a name here is not a name this system owns.

    It does NOT claim the displayed name comes from the catalogue, because under the read union
    it does not: identity is re-derived from the in-system record on every row. It states where
    identity is AUTHORED, and the count of other systems is CLAMPED at zero — a component with no
    membership record would otherwise read as shared with negative one.
  -->
  {#if bannerEntry}
    <SharedDefinitionCallout
      name={bannerEntry.entity?.name || bannerEntry.id}
      icon="fas fa-cube"
      pillLabel={text('FABRICATE.Admin.Manager.Scoped.Component.WorldPill', 'World definition')}
      note={componentAttributionNote(
        { surface: 'list', memberCount: Number(bannerEntry.membershipCount) || 0 },
        format
      )}
      actionLabel={text(
        'FABRICATE.Admin.Manager.Component.OpenSharedDefinition',
        'Edit shared definition'
      )}
      onOpen={() => onOpenWorldEntry(WORLD_ENTRY_ROUTE, bannerEntry.id)}
    />
  {/if}

  <section
    class="manager-component-drop-zone"
    use:dragDrop={{
      onDrop: onDropComponent,
      disabled: !dropEnabled,
      activeClass: 'is-drop-active',
    }}
    aria-label={text(
      'FABRICATE.Admin.Manager.Component.DropZoneLabel',
      'Drop Foundry items to add components'
    )}
  >
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>
      <strong
        >{text(
          'FABRICATE.Admin.Manager.Component.DropZoneTitle',
          'Drop items to add components'
        )}</strong
      >
      <small
        >{text(
          'FABRICATE.Admin.Manager.Component.DropZoneHint',
          'World, compendium, pack, or folder drops use the existing component import flow for the selected system.'
        )}</small
      >
    </span>
  </section>

  <!--
    The three-row filter bar, adopted from the Recipe Studio (ruling 1). Row one is
    every FILTER (search, essence); row two carries the category filter with the two
    VIEW controls — how the list is grouped, and how it is ordered — split by rules and
    each titled by an uppercase micro-label that precedes its control and never wraps;
    row three is the active-filter chips and the count.

    It replaces a flat run of eight sentence-case `.manager-filter` controls, in which
    the group toggle and the sort-direction button carried NO CSS at all: the toggle had
    no visual pressed state, and the direction button sat at the boxy base
    `.manager-button` scale the Recipe Studio already documented fixing.
  -->
  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop
       (issue 1157) — see the twin note in `EssenceBrowserView`. The manager root lands the
       keyboard here when an action empties the bulk selection and unmounts the panel that
       was acted on, addressing it through `data-component-toolbar`. -->
  <ManagerToolbar
    class="manager-component-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-component-toolbar=""
    ariaLabel={text('FABRICATE.Admin.Manager.Component.Filters', 'Component filters')}
  >
    <div class="manager-component-filter-row">
      <ManagerSearchField
        value={itemSearchTerm || ''}
        onInput={(next) => onSearchChange(next)}
        placeholder={text(
          'FABRICATE.Admin.Manager.Component.SearchPlaceholder',
          'Search components...'
        )}
        ariaLabel={text('FABRICATE.Admin.Manager.Component.SearchLabel', 'Search components')}
      />

      {#if showComponentEssences && componentEssenceOptions.length > 0}
        <!-- Bare: the `aria-label` is the select's accessible name. A filter bar whose
             controls each announce themselves in sentence case reads as a form. -->
        <select
          class="manager-component-essence-filter"
          data-component-essence-filter
          value={ui.essenceFilter}
          onchange={(event) => setEssenceFilter(event.currentTarget.value)}
          aria-label={text(
            'FABRICATE.Admin.Manager.Component.EssenceFilterLabel',
            'Filter components by essence'
          )}
        >
          <option value="all"
            >{text('FABRICATE.Admin.Manager.Component.EssenceAll', 'All essences')}</option
          >
          {#each componentEssenceOptions as essence (essence)}
            <option value={essence}>{essence}</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="manager-component-filter-row is-secondary">
      <!--
        THE MEMBERSHIP SEGMENT. `All world components` is the one option that changes what a row
        IS: it widens the list past this system's own components to world records it has no rules
        for, which is the only route on this screen to adopt one.
      -->
      <select
        class="manager-component-membership-filter"
        data-component-membership-filter
        value={membershipFilter}
        onchange={(event) => {
          membershipFilter = event.currentTarget.value;
          ui.pageIndex = 0;
        }}
        aria-label={text(
          'FABRICATE.Admin.Manager.Component.MembershipFilterLabel',
          'Filter components by world membership'
        )}
      >
        {#each membershipFilters as option (option.id)}
          <option value={option.id} data-component-membership-option={option.id}
            >{option.label}</option
          >
        {/each}
      </select>
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <select
        class="manager-component-category-filter"
        data-component-category-filter
        value={ui.categoryFilter}
        onchange={(event) => setCategoryFilter(event.currentTarget.value)}
        aria-label={text(
          'FABRICATE.Admin.Manager.Component.CategoryFilterLabel',
          'Filter components by category'
        )}
      >
        <option value="all"
          >{text('FABRICATE.Admin.Manager.Component.CategoryAll', 'All categories')}</option
        >
        {#each categoryOptions as category (category.name)}
          <option value={category.name}>{categoryLabel(category.name)} ({category.count})</option>
        {/each}
      </select>
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label" id="manager-component-group-label"
          >{text('FABRICATE.Admin.Manager.Component.GroupByCategory', 'Group by category')}</span
        >
        <!-- `data-component-group-by-category=""` rather than the bare attribute: on a
             COMPONENT a bare attribute is the boolean `true`, which the rest spread would
             stamp as `="true"` and change the byte the sheet's own
             `[data-component-group-by-category]` rule is written beside. -->
        <StatusToggle
          on={ui.groupByCategory}
          data-component-group-by-category=""
          aria-labelledby="manager-component-group-label"
          onclick={toggleGroupByCategory}
        />
      </div>
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label"
          >{text('FABRICATE.Admin.Manager.Component.SortBy', 'Sort by')}</span
        >
        <select
          value={ui.sortKey}
          data-component-sort
          onchange={(event) => setSortKey(event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Component.SortLabel', 'Sort components')}
        >
          {#each sortOptions as option (option.key)}
            <option value={option.key}>{option.label}</option>
          {/each}
        </select>
        <ManagerButton
          class="manager-component-sort-direction"
          data-component-sort-direction={ui.sortDirection}
          aria-label={text(
            'FABRICATE.Admin.Manager.Component.SortDirection',
            'Toggle sort direction'
          )}
          onclick={toggleSortDirection}
        >
          <i
            class={ui.sortDirection === 'asc'
              ? 'fas fa-arrow-down-short-wide'
              : 'fas fa-arrow-down-wide-short'}
            aria-hidden="true"
          ></i>
          <span
            >{ui.sortDirection === 'asc'
              ? text('FABRICATE.Admin.Manager.Component.SortAsc', 'Asc')
              : text('FABRICATE.Admin.Manager.Component.SortDesc', 'Desc')}</span
          >
        </ManagerButton>
      </div>
    </div>

    <div class="manager-component-filter-row is-chips">
      {#each chips as chip (chip.id)}
        <Chip
          tone="info"
          class="manager-component-filter-chip"
          data-component-filter-chip={chip.id}
        >
          <span>{chipLabel(chip)}</span>
          <button
            type="button"
            class="manager-component-chip-clear"
            aria-label={format(
              'FABRICATE.Admin.Manager.Component.ClearChip',
              'Clear {filter} filter',
              { filter: chip.id }
            )}
            onclick={() => clearChip(chip.id)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </Chip>
      {/each}
      <!--
        The count is quiet right-aligned metadata, not a control: a bordered chip read as
        something to press. It reports the page WINDOW ("1–5 of 12") — `paginateComponents`
        has computed `rangeStart`/`rangeEnd` since it was written and nothing read them —
        because "6 of 6" never told the GM which page they were looking at.
      -->
      <!--
        WHAT THIS SYSTEM'S ROWS RESOLVE THEIR CATEGORY FROM, summarised. The per-row line the
        design draws needs a prop on the shared row component, which this change does not open;
        the summary and the `Overriding` filter beside it are the two surfaces that state the same
        fact from inside this file. See the lane report's deviations.
      -->
      {#if inheritSummary.known > 0}
        <span class="manager-component-inherit-summary" data-component-inherit-summary>
          {format(
            'FABRICATE.Admin.Manager.Component.InheritSummary',
            '{inheriting} inherit the world category · {overriding} override it',
            inheritSummary
          )}
        </span>
      {/if}
      <span class="manager-component-count" data-component-count>
        {format('FABRICATE.Admin.Manager.Component.CountRange', '{start}–{end} of {total}', {
          start: page.rangeStart,
          end: page.rangeEnd,
          total: page.totalCount,
        })}
      </span>
    </div>

    <!--
      The multi-select row is the LAST row of the toolbar, immediately above the list —
      the prototype's third-row-then-list order (issue 772). It is a row of THIS toolbar,
      not a sticky bar of its own over the list, so it inherits the toolbar's own metrics
      instead of declaring a second register. It does cost the list one row's height at
      the default manager window size, which is why the PR carries a frame proving
      `.manager-table-scroll` still shows several rows with it present.
    -->
    <!--
      Rendered on the shared primitive's DEFAULTS (issue 1010): its row class and its five
      `data-*` hooks default to this studio's strings, so the smoke selectors, the view-lab
      cases and the mounted assertions that predate the extraction still resolve unchanged.
    -->
    <BulkSelectionToolbar
      pageSelectionState={selectionSummary.pageSelectionState}
      count={selectionSummary.count}
      showSelectAllResults={selectionSummary.showSelectAllResults}
      selectAllResultsCount={selectionSummary.selectAllResultsCount}
      onTogglePage={(on) => setPageSelected(on)}
      onSelectAllResults={selectAllResults}
      onClear={clearBulkSelection}
    />
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Component.Table', 'Components')}
  >
    <!--
      THE ZERO STATE IS GATED ON THE COHORT, NEVER ON THE RAW PROP. See `visibleGhostRows` for
      the measured defect that gate exists to prevent: an empty system under `All world
      components` drew the zero state over a toolbar counting three rows, and the only route in
      the product to adopt a component into an empty system became unreachable.
    -->
    {#if cohortRows.length === 0}
      <EmptyState
        icon="fas fa-box-open"
        title={text('FABRICATE.Admin.Manager.Component.EmptyTitle', 'No components yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Component.EmptyHint',
          'Drop Foundry items into this page to add components to the selected system.'
        )}
      />
    {:else if filteredComponents.length === 0 && visibleGhostRows.length === 0}
      <!-- A filtered-to-nothing library is not an error state and does not want the full
           empty-panel apparatus: one dashed panel says it, and Clear filters is the way
           out (the Recipe Studio's treatment). -->
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Component.EmptySearchTitle',
          'No components match your filters.'
        )}
      >
        <ManagerButton data-clear-filters="components" onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</ManagerButton
        >
      </EmptyState>
    {:else}
      <!-- A card row has no columns, so this is a LIST, not a grid: a real
           `<ul role="list">` of `<li>` cards carrying `aria-current`, mirroring the
           Recipe Studio, rather than nested `<div>`s with no selection semantics at all. -->
      <div class="manager-components-list">
        {#if ui.groupByCategory}
          {#each groups as group (group.category)}
            <section class="manager-component-group" data-component-group={group.category}>
              <CollapsibleGroupHeader
                name={categoryLabel(group.category)}
                countText={groupCountText(group)}
                expanded={!isCategoryCollapsed(group.category)}
                controls={`manager-component-group-${group.category}`}
                onToggle={() => toggleCategoryCollapsed(group.category)}
              />
              {#if !isCategoryCollapsed(group.category)}
                <ul
                  class="manager-component-group-body"
                  role="list"
                  id={`manager-component-group-${group.category}`}
                >
                  {#each group.components as item (item.id)}
                    <ComponentRow {...rowProps(item)} />
                  {:else}
                    <li class="manager-muted manager-component-group-empty">
                      {text(
                        'FABRICATE.Admin.Manager.Component.EmptyCategory',
                        'No components in this category.'
                      )}
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/each}
        {:else}
          <ul class="manager-component-group-body" role="list">
            {#each page.components as item (item.id)}
              <ComponentRow {...rowProps(item)} />
            {/each}
          </ul>
        {/if}

        <!--
          THE GHOST COHORT: world components this system has NO rules record for.

          They state NO behaviour at all — no category, no essences, no difficulty, no salvage —
          because everything a row says about behaviour is a MEMBERSHIP fact, and inventing one
          from the world default would claim rules that do not exist here. What they carry is the
          one verb they exist for.

          ADOPTION IS TWO WRITES AND THIS CALLS ONE KEY. `actions.addToSystem` is the COMPOSED
          verb: the published component family replaces the generic membership-only write under
          that key, so this button writes the membership record AND the in-system record the read
          union's row set is built from. A membership record written alone names a component no
          reader can see.
        -->
        {#if visibleGhostRows.length > 0}
          <ul
            class="manager-component-group-body manager-component-ghost-body"
            role="list"
            aria-label={text(
              'FABRICATE.Admin.Manager.Component.GhostListLabel',
              'World components this system has no rules for'
            )}
          >
            {#each visibleGhostRows as ghost (ghost.id)}
              <li class="manager-component-ghost-row" data-component-ghost-row={ghost.id}>
                <span class="manager-component-ghost-identity">
                  <span class="manager-component-ghost-name">{ghost.name}</span>
                  <span class="manager-muted manager-component-ghost-note"
                    >{text(
                      'FABRICATE.Admin.Manager.Component.GhostNote',
                      'No rules in this system yet'
                    )}</span
                  >
                </span>
                <ManagerButton
                  role="primary"
                  data-component-ghost-add={ghost.id}
                  aria-label={format(
                    'FABRICATE.Admin.Manager.Component.GhostAddNamed',
                    'Add {name} to this system',
                    { name: ghost.name }
                  )}
                  onclick={() => actions?.addToSystem?.(ghost.id, systemId)}
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Component.GhostAdd', 'Add')}</span>
                </ManagerButton>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={page.totalCount}
    pageSize={ui.pageSize}
    pageIndex={page.pageIndex}
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  />
</main>

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. Everything this view drew before issue 1371 keeps its rules in
     `styles/fabricate.css`; only the two surfaces this change ADDS are declared here, which is
     where a per-component override belongs — a component's `css: 'injected'` block lands
     UNLAYERED and therefore beats the host sheet at any specificity, so a rule authored in both
     places would silently resolve here anyway. */

  .manager-component-inherit-summary {
    margin-left: auto;
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    font-weight: 600;
    white-space: nowrap;
  }

  /* The ghost cohort reads QUIETER than an adopted row, because it is a record this system does
     not have: a dashed edge and the recessive surface say "available" where a solid card says
     "yours". */
  .manager-component-ghost-body {
    margin-top: var(--fab-space-2);
  }

  .manager-component-ghost-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px dashed var(--fab-border);
    border-radius: 9px;
    background: none;
    min-width: 0;
  }

  .manager-component-ghost-identity {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-component-ghost-name {
    color: var(--fab-text);
    font-size: 0.78rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-component-ghost-note {
    font-size: 0.62rem;
  }
</style>
