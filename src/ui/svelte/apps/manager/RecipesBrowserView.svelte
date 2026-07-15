<!-- Svelte 5 runes mode -->
<!--
  The GM recipe library (issue 643): filter bar → collapsible category groups →
  rich rows → pager, with the shell's own `.manager-inspector` column carrying the
  selected-recipe inspector (this view does NOT nest a second inspector grid — that
  overflows `.manager-recipe-row` at the smoke harness's 1280px width and
  `assertManagerLayoutStable()` throws).

  Row ARIA is chosen, not inherited: a card row has no columns, so the rows are a
  real `<ul role="list">` of `<li>` cards rather than the former table / row / cell
  roles with `columnheader` spans. The class names (`manager-recipes-table`,
  `manager-recipe-row`, `manager-recipe-identity`, `manager-recipe-status`) are
  FROZEN — the smoke harness's overflow check pins them and FAILS OPEN, so a rename
  silently stops measuring the row rather than failing.

  All list mechanics (filter / sort / group / paginate + the per-row derivations)
  live in the pure `recipeBrowserModel.js`; this component only renders.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import StatusPill from '../../components/StatusPill.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';
  import {
    RECIPE_DEFAULT_PAGE_SIZE,
    RECIPE_SORT_KEYS,
    buildRecipeBrowserModel,
    deriveRecipeIo,
    deriveRecipeStatuses
  } from '../../../../utils/recipeBrowserModel.js';

  let {
    recipes = [],
    recipeCategories = [],
    recipeSearchTerm = '',
    selectedRecipeId = '',
    showRecipeCategories = false,
    resolutionMode = 'simple',
    onSearchChange = () => {},
    onSelectRecipe = () => {},
    onToggleEnabled = () => {},
    onToggleLocked = () => {}
  } = $props();

  // The blocked-enable flash. Enabling is GATED (an incomplete recipe is refused),
  // and this view CLAIMS the refusal message by handing the store an `onBlocked`
  // sink: the store then SUPPRESSES its Foundry notification, so the GM is never told
  // the same thing twice — once here and once in a toast behind a maximised window.
  // The error is never surfaced from inside this component — it has no Foundry
  // notification path at all — which is what makes the seam stubbable in a mounted
  // test and keeps the suppression invariant enforceable.
  let flashMessage = $state('');

  function handleToggleEnabled(recipe) {
    flashMessage = '';
    onToggleEnabled(recipe.id, recipe.enabled === false, {
      onBlocked: (message) => { flashMessage = message; }
    });
  }

  // Defaults are load-bearing for the smoke harness: it waits for a VISIBLE row and
  // throws "Manager rendered no table rows" on zero. Groups start EXPANDED, the
  // status and lock filters start at `all`, and the page size exceeds the fixture
  // recipe count.
  let statusFilter = $state('all');
  let lockFilter = $state('all');
  let categoryFilter = $state('all');
  let groupByCategory = $state(true);
  let sortKey = $state('name');
  let sortDirection = $state('asc');
  let pageIndex = $state(0);
  let pageSize = $state(RECIPE_DEFAULT_PAGE_SIZE);
  // Collapse is opt-IN: a category absent from this set is expanded.
  let collapsedCategories = $state(new Set());

  const model = $derived(
    buildRecipeBrowserModel(recipes || [], {
      status: statusFilter,
      lock: lockFilter,
      category: categoryFilter,
      search: recipeSearchTerm,
      sortKey,
      sortDirection,
      pageIndex,
      pageSize,
      groupByCategory: groupByCategory && showRecipeCategories
    })
  );

  $effect(() => {
    if (model.pageIndex !== pageIndex) pageIndex = model.pageIndex;
  });

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

  const statusOptions = $derived([
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.FilterAll', fallback: 'All' },
    { value: 'on', labelKey: 'FABRICATE.Admin.Manager.StatusOn', fallback: 'On' },
    { value: 'off', labelKey: 'FABRICATE.Admin.Manager.StatusOff', fallback: 'Off' }
  ]);
  const lockOptions = $derived([
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.FilterAll', fallback: 'All' },
    { value: 'unlocked', labelKey: 'FABRICATE.Admin.Manager.Recipe.Unlocked', fallback: 'Unlocked' },
    { value: 'locked', labelKey: 'FABRICATE.Admin.Manager.Recipe.Locked', fallback: 'Locked' }
  ]);

  const SORT_LABELS = {
    name: ['FABRICATE.Admin.Manager.Recipe.SortName', 'Name'],
    attention: ['FABRICATE.Admin.Manager.Recipe.SortAttention', 'Needs attention'],
    dc: ['FABRICATE.Admin.Manager.Recipe.SortDc', 'Check DC'],
    ingredients: ['FABRICATE.Admin.Manager.Recipe.SortIngredients', 'Ingredients'],
    results: ['FABRICATE.Admin.Manager.Recipe.SortResults', 'Results']
  };

  const FILTER_CHIP_LABELS = {
    status: ['FABRICATE.Admin.Manager.Recipe.ChipStatus', 'Status: {value}'],
    lock: ['FABRICATE.Admin.Manager.Recipe.ChipLock', 'Lock: {value}'],
    category: ['FABRICATE.Admin.Manager.Recipe.ChipCategory', 'Category: {value}'],
    search: ['FABRICATE.Admin.Manager.Recipe.ChipSearch', 'Search: {value}']
  };

  function sortLabel(key) {
    const [labelKey, fallback] = SORT_LABELS[key] || SORT_LABELS.name;
    return text(labelKey, fallback);
  }

  function chipLabel(chip) {
    const [labelKey, fallback] = FILTER_CHIP_LABELS[chip.id];
    const value = chip.id === 'category' ? getRecipeCategoryLabel(chip.value, localize) : chip.value;
    return format(labelKey, fallback, { value });
  }

  function clearChip(chipId) {
    if (chipId === 'status') statusFilter = 'all';
    if (chipId === 'lock') lockFilter = 'all';
    if (chipId === 'category') categoryFilter = 'all';
    if (chipId === 'search') onSearchChange('');
  }

  function clearFilters() {
    statusFilter = 'all';
    lockFilter = 'all';
    categoryFilter = 'all';
    onSearchChange('');
  }

  function recipeImage(recipe) {
    // The linked-book image wins; otherwise the shared resolver maps an empty OR
    // generic item-bag image → the recipe blueprint (never the bag SVG). The
    // Medallion itself is an import-free leaf, so the CALLER resolves this.
    return recipe?.recipeItemImg || resolveRecipeImage(recipe);
  }

  function categoryLabel(category) {
    return getRecipeCategoryLabel(category, localize);
  }

  function groupRegionId(category) {
    return `manager-recipe-group-${category || 'all'}`;
  }

  // The header counts what the GROUP RENDERS, not what the whole filtered list holds.
  // `buildRecipeBrowserModel` groups the PAGE, so counting `model.filtered` would put
  // "12 recipes" above three rows on page 2.
  function groupCountText(group) {
    const count = (group?.recipes || []).length;
    return count === 1
      ? text('FABRICATE.Admin.Manager.Recipe.GroupCountOne', '1 recipe')
      : format('FABRICATE.Admin.Manager.Recipe.GroupCount', '{count} recipes', { count });
  }

  function isExpanded(category) {
    return !collapsedCategories.has(category);
  }

  function toggleGroup(category) {
    const next = new Set(collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    collapsedCategories = next;
  }

  // The four row states, localized. `recipe.incomplete` is the derived authoring
  // flag (no ingredient sets / no result groups); off + incomplete means enabling
  // would be REFUSED, so the row says so rather than merely "incomplete".
  const STATUS_LABELS = {
    disabled: ['FABRICATE.Admin.Manager.StatusDisabled', 'Disabled'],
    locked: ['FABRICATE.Admin.Manager.Recipe.Locked', 'Locked'],
    blocked: ['FABRICATE.Admin.Manager.Recipe.CantEnable', "Can't enable"],
    incomplete: ['FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete']
  };

  function statusPills(recipe) {
    return deriveRecipeStatuses(recipe).map((pill) => {
      const [labelKey, fallback] = STATUS_LABELS[pill.id];
      return { ...pill, label: text(labelKey, fallback) };
    });
  }

  // The I/O readout (issue 643 §9): always "N in"; "N out" ONLY in simple and
  // progressive — a tier- or set-keyed mode has no single outputs number, so it
  // reports the RESULT-GROUP count with a routing glyph instead.
  function groupsText(count) {
    // "1 groups" is not a sentence. The singular is its own key, as GroupCount /
    // GroupCountOne already are.
    return count === 1
      ? text('FABRICATE.Admin.Manager.Recipe.CountResultGroupsOne', '1 group')
      : format('FABRICATE.Admin.Manager.Recipe.CountResultGroups', '{count} groups', { count });
  }

  function ioReadout(recipe) {
    const io = deriveRecipeIo(recipe, resolutionMode);
    const inText = format('FABRICATE.Admin.Manager.Recipe.CountIn', '{count} in', { count: io.inCount });
    const outText =
      io.outKind === 'items'
        ? format('FABRICATE.Admin.Manager.Recipe.CountOut', '{count} out', { count: io.outCount })
        : groupsText(io.outCount);
    return { ...io, inText, outText, routed: io.outKind === 'groups' };
  }

  function stepText(recipe) {
    const steps = recipe?.stepCount ?? 0;
    return steps > 1
      ? format('FABRICATE.Admin.Manager.Recipe.StepRequirements', '{count} steps', { count: steps })
      : text('FABRICATE.Admin.Manager.Recipe.SingleStep', 'Single step');
  }

  // The five check states. `none` is the one WARNING: a system that cannot roll for
  // this recipe is a thing the GM must be able to scan a library for, and the old em
  // dash + ban glyph said nothing at all. `ingredients` is its neutral sibling — a
  // routedByIngredients system resolves off the ingredient set that was used, so no
  // check is a working configuration, not a gap.
  const CHECK_PILLS = {
    dc: ['FABRICATE.Admin.Manager.Recipe.CheckDc', 'DC {dc}', 'fas fa-dice-d20'],
    dynamic: ['FABRICATE.Admin.Manager.Recipe.CheckDynamic', 'Dynamic DC', 'fas fa-dice-d20'],
    progressive: ['FABRICATE.Admin.Manager.Recipe.CheckProgressive', 'Progressive', 'fas fa-list-ol'],
    ingredients: ['FABRICATE.Admin.Manager.Recipe.CheckByIngredients', 'By ingredients', 'fas fa-code-branch'],
    none: ['FABRICATE.Admin.Manager.Recipe.CheckNone', 'No check', 'fas fa-triangle-exclamation']
  };

  const CHECK_TOOLTIPS = {
    ingredients: [
      'FABRICATE.Admin.Manager.Recipe.CheckByIngredientsTooltip',
      'This system routes results by the ingredient set used, with no crafting check.'
    ],
    none: [
      'FABRICATE.Admin.Manager.Recipe.CheckNoneTooltip',
      'This system has no usable crafting check.'
    ]
  };

  // The check pill is projected by the store (`recipe.checkSummary`) — the row cannot
  // resolve `checkTierId` → a tier DC, nor the system's mode, on its own.
  function checkPill(recipe) {
    const summary = recipe?.checkSummary || { kind: 'none', dc: null };
    const [labelKey, fallback, icon] = CHECK_PILLS[summary.kind] || CHECK_PILLS.none;
    const tooltip = CHECK_TOOLTIPS[summary.kind];
    return {
      kind: summary.kind,
      icon,
      label: format(labelKey, fallback, { dc: summary.dc ?? '' }),
      title: tooltip ? text(tooltip[0], tooltip[1]) : ''
    };
  }

  function isSelectedRecipe(recipe) {
    return !!selectedRecipeId && recipe.id === selectedRecipeId;
  }
</script>

<!--
  There is ONE page header, and the shell owns it. This view used to render a SECOND
  one — kicker + "Recipe library" + a second subtitle — directly under the shell's
  breadcrumb / "Recipes" / subtitle / Create block: ~74px of duplicated chrome saying
  what the breadcrumb and the titlebar's gold system badge already said.
-->
<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}>
  <section class="manager-toolbar manager-recipe-toolbar" aria-label={text('FABRICATE.Admin.Manager.Recipe.Filters', 'Recipe filters')}>
    <div class="manager-recipe-filter-row">
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={recipeSearchTerm || ''}
          oninput={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={text('FABRICATE.Admin.Manager.Recipe.SearchPlaceholder', 'Search recipes...')}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.SearchLabel', 'Search recipes')}
        />
      </label>
      <SegmentedControl
        options={statusOptions}
        value={statusFilter}
        groupName="manager-recipe-status-filter"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.StatusFilterLabel', 'Filter recipes by status')}
        dataAttr="data-recipe-status-filter"
        optionDataAttr="data-recipe-status-option"
        onChange={(value) => { statusFilter = value; pageIndex = 0; }}
      />
      <SegmentedControl
        options={lockOptions}
        value={lockFilter}
        groupName="manager-recipe-lock-filter"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.LockFilterLabel', 'Filter recipes by lock state')}
        dataAttr="data-recipe-lock-filter"
        optionDataAttr="data-recipe-lock-option"
        onChange={(value) => { lockFilter = value; pageIndex = 0; }}
      />
    </div>

    <!--
      Row two carries the category FILTER together with the two VIEW controls — how the
      list is grouped, and how it is ordered — on a single tighter row (issue 643). The
      category select used to sit on row one, where it wrapped below search/status/lock
      and pushed the grouping and sorting controls onto a third line; keeping all three
      here stops that unnecessary break. The view controls are separated from the filter
      by a rule and each is titled by an uppercase micro-label that precedes its control
      and never wraps ("Sort by" broke onto two lines in the flagship frame otherwise).
    -->
    <div class="manager-recipe-filter-row is-secondary">
      {#if showRecipeCategories}
        <!-- Bare: the `aria-label` is the select's accessible name. -->
        <select
          class="manager-recipe-category-filter"
          data-recipe-category-filter
          value={categoryFilter}
          onchange={(event) => { categoryFilter = event.currentTarget.value; pageIndex = 0; }}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.CategoryFilterLabel', 'Filter recipes by category')}
        >
          <option value="all">{text('FABRICATE.Admin.Manager.Recipe.CategoryAll', 'All categories')}</option>
          {#each recipeCategories || [] as category (category.name)}
            <option value={category.name}>{categoryLabel(category.name)} ({category.count})</option>
          {/each}
        </select>
        <span class="manager-recipe-filter-divider" aria-hidden="true"></span>
        <div class="manager-recipe-filter-field">
          <span class="manager-recipe-filter-label" id="manager-recipe-group-label">{text('FABRICATE.Admin.Manager.Recipe.GroupByCategory', 'Group by category')}</span>
          <button
            type="button"
            class={`manager-status-toggle ${groupByCategory ? 'is-on' : 'is-off'}`}
            data-recipe-group-toggle
            aria-pressed={groupByCategory}
            aria-labelledby="manager-recipe-group-label"
            onclick={() => groupByCategory = !groupByCategory}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
          </button>
        </div>
        <span class="manager-recipe-filter-divider" aria-hidden="true"></span>
      {/if}
      <div class="manager-recipe-filter-field">
        <span class="manager-recipe-filter-label">{text('FABRICATE.Admin.Manager.Recipe.SortBy', 'Sort by')}</span>
        <select value={sortKey} data-recipe-sort onchange={(event) => sortKey = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Recipe.SortLabel', 'Sort recipes')}>
          {#each RECIPE_SORT_KEYS as key (key)}
            <option value={key}>{sortLabel(key)}</option>
          {/each}
        </select>
        <button
          type="button"
          class="manager-button manager-recipe-sort-direction"
          data-recipe-sort-direction={sortDirection}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.ToggleSortDirection', 'Toggle sort direction')}
          onclick={() => sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'}
        >
          <i class={sortDirection === 'asc' ? 'fas fa-arrow-down-short-wide' : 'fas fa-arrow-down-wide-short'} aria-hidden="true"></i>
          <span>{sortDirection === 'asc'
            ? text('FABRICATE.Admin.Manager.Recipe.SortAscending', 'Asc')
            : text('FABRICATE.Admin.Manager.Recipe.SortDescending', 'Desc')}</span>
        </button>
      </div>
    </div>

    <div class="manager-recipe-filter-row is-chips">
      {#each model.chips as chip (chip.id)}
        <span class="manager-chip is-info manager-recipe-filter-chip" data-recipe-filter-chip={chip.id}>
          <span>{chipLabel(chip)}</span>
          <button
            type="button"
            class="manager-recipe-chip-clear"
            aria-label={format('FABRICATE.Admin.Manager.Recipe.ClearChip', 'Clear {filter} filter', { filter: chip.id })}
            onclick={() => clearChip(chip.id)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </span>
      {/each}
      <!--
        The count is quiet right-aligned metadata, not a control: a bordered mono chip
        read as something to press. It reports the page WINDOW ("1–5 of 12"), because
        "5 of 12" never told the GM which page they were looking at.
      -->
      <span class="manager-recipe-count" data-recipe-count>
        {format('FABRICATE.Admin.Manager.Recipe.CountRange', '{start}–{end} of {total}', {
          start: model.rangeStart,
          end: model.rangeEnd,
          total: model.totalCount
        })}
      </span>
    </div>
  </section>

  {#if flashMessage}
    <!-- The blocked-enable flash. It REPLACES the Foundry notification (the store
         suppresses it when this owns the message) so the GM is never told the same
         thing twice; it is an error, so it is a dismissible role="alert" that does
         not auto-hide.

         It FLOATS over the list (absolutely positioned against the recipes
         `.manager-main`), rather than sitting in flow between the toolbar and the
         first row, where its appearance shoved every row down the page. -->
    <div class="manager-recipe-flash" role="alert" data-recipe-flash>
      <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      <span class="manager-recipe-flash-message">{flashMessage}</span>
      <button
        type="button"
        class="manager-icon-button manager-recipe-flash-dismiss"
        data-recipe-flash-dismiss
        aria-label={text('FABRICATE.Admin.Manager.Recipe.DismissFlash', 'Dismiss')}
        onclick={() => flashMessage = ''}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/if}

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Recipe.Table', 'Recipes table')}>
    {#if (recipes || []).length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-scroll" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptyTitle', 'No recipes yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Recipe.EmptyHint', 'Create recipes for the selected crafting system.')}</p>
        </div>
      </div>
    {:else if model.filtered.length === 0}
      <!-- A filtered-to-nothing library is not an error state and does not want the
           full empty-panel apparatus: one dashed panel says it, and the Clear-filters
           button is the way out. -->
      <div class="manager-empty manager-recipe-empty-filtered">
        <div>
          <p>{text('FABRICATE.Admin.Manager.Recipe.EmptySearchTitle', 'No recipes match your filters.')}</p>
          <button type="button" class="manager-button" data-clear-filters="recipes" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-recipes-table">
        {#each model.groups as group (group.category || '__ungrouped')}
          {@const grouped = groupByCategory && showRecipeCategories && !!group.category}
          <div class="manager-recipe-group">
            {#if grouped}
              <CollapsibleGroupHeader
                name={categoryLabel(group.category)}
                countText={groupCountText(group)}
                expanded={isExpanded(group.category)}
                controls={groupRegionId(group.category)}
                onToggle={() => toggleGroup(group.category)}
              />
            {/if}
            {#if !grouped || isExpanded(group.category)}
              <!-- A card row has no columns, so this is a list, not a table. -->
              <ul class="manager-recipe-group-list" role="list" id={groupRegionId(group.category)}>
                {#each group.recipes as recipe (recipe.id)}
                  {@const io = ioReadout(recipe)}
                  {@const check = checkPill(recipe)}
                  <li
                    class={`manager-recipe-row ${isSelectedRecipe(recipe) ? 'is-selected' : ''} ${recipe.enabled === false ? 'is-off' : ''}`}
                    data-recipe-id={recipe.id}
                    data-recipe-incomplete={recipe.incomplete === true}
                    aria-current={isSelectedRecipe(recipe) ? 'true' : undefined}
                  >
                    <button type="button" class="manager-recipe-identity" onclick={() => onSelectRecipe(recipe.id)}>
                      <Medallion src={recipeImage(recipe)} icon="fas fa-scroll" size={40} />
                      <span class="manager-system-copy">
                        <span class="manager-recipe-name-row">
                          <span class="manager-system-name" title={recipe.name}>{recipe.name}</span>
                          {#each statusPills(recipe) as pill (pill.id)}
                            <StatusPill tone={pill.tone} icon={pill.icon} label={pill.label} />
                          {/each}
                        </span>
                        <span class="manager-system-description manager-recipe-description" title={recipe.description}>
                          {recipe.description || text('FABRICATE.Admin.Manager.NoDescription', 'No description')}
                        </span>
                      </span>
                    </button>

                    <div class="manager-recipe-cluster">
                      <span class={`manager-recipe-io ${io.empty ? 'is-empty' : ''}`} data-recipe-io>
                        <span class="manager-recipe-io-counts">
                          <span>{io.inText}</span>
                          <span aria-hidden="true">·</span>
                          {#if io.routed}<i class="fas fa-code-branch manager-recipe-io-routed" aria-hidden="true"></i>{/if}
                          <span>{io.outText}</span>
                        </span>
                        <span class="manager-recipe-io-steps">
                          <i class={(recipe.stepCount ?? 0) > 1 ? 'fas fa-list-ol' : 'fas fa-minus'} aria-hidden="true"></i>
                          <span>{stepText(recipe)}</span>
                        </span>
                      </span>

                      <!-- The DC is the archetypal numeric in this row, so the pill
                           takes the mono face (`is-mono`, tabular figures) when it
                           carries a number. The word-only kinds (Dynamic DC,
                           Progressive, the em dash) stay in the UI face. -->
                      <span class={`manager-chip manager-recipe-check is-${check.kind} ${check.kind === 'dc' ? 'is-mono' : ''}`} data-recipe-check={check.kind} title={check.title || undefined}>
                        <i class={check.icon} aria-hidden="true"></i>
                        <span>{check.label}</span>
                      </span>

                      <button
                        type="button"
                        class={`manager-icon-button manager-recipe-lock ${recipe.locked ? 'is-locked' : ''}`}
                        data-recipe-lock={recipe.locked === true}
                        aria-pressed={recipe.locked === true}
                        aria-label={format(
                          recipe.locked
                            ? 'FABRICATE.Admin.Manager.Recipe.UnlockNamed'
                            : 'FABRICATE.Admin.Manager.Recipe.LockNamed',
                          recipe.locked ? 'Unlock {name}' : 'Lock {name}',
                          { name: recipe.name }
                        )}
                        title={text('FABRICATE.Admin.Manager.Recipe.LockHint', 'Locked recipes stay visible to players, but only a GM can craft them.')}
                        onclick={() => onToggleLocked(recipe.id, recipe.locked !== true)}
                      >
                        <i class={recipe.locked ? 'fas fa-lock' : 'fas fa-lock-open'} aria-hidden="true"></i>
                      </button>

                      <!--
                        No "On"/"Off" text IN THE ROW. The track colour already carries
                        the state, the `aria-label` names it for assistive tech, and the
                        row's Disabled pill says it in words — a third copy on every row
                        cost ~30px of the description. (The label stays everywhere else
                        in the manager, where a switch has no pill beside it.)
                      -->
                      <span class="manager-recipe-status">
                        <button
                          type="button"
                          class={`manager-status-toggle ${recipe.enabled === false ? 'is-off' : 'is-on'}`}
                          aria-pressed={recipe.enabled !== false}
                          aria-label={format(
                            recipe.enabled === false
                              ? 'FABRICATE.Admin.Manager.Recipe.EnableNamed'
                              : 'FABRICATE.Admin.Manager.Recipe.DisableNamed',
                            recipe.enabled === false ? 'Enable {name}' : 'Disable {name}',
                            { name: recipe.name }
                          )}
                          onclick={() => handleToggleEnabled(recipe)}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true">
                            <span class="manager-status-toggle-knob"></span>
                          </span>
                        </button>
                      </span>

                      <!--
                        Edit / Duplicate / Delete used to live here as three ghost icons,
                        which turned every row into a toolbar and truncated every
                        description. They now live ONLY in the inspector (issue 643), which
                        already owns all three as full-width buttons — so no capability is
                        lost. The row keeps just the lock toggle and the enable switch; a
                        click on the identity selects the row and drives the inspector.
                      -->
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={model.totalCount}
    {pageSize}
    pageIndex={model.pageIndex}
    pageSizeOptions={[10, 25, 50]}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</main>
