<!-- Svelte 5 runes mode -->
<!--
  Limits tab of the recipe-item editor. MODE-DEPENDENT via `visibilityMode`: the item
  ("uses") card and the knowledge ("learning") card never appear together.

   - item      → Uses card. A "Limited use" toggle (caps.item.limitUses); when on, a
                 "Uses per copy" stepper (caps.item.maxUses, min 1) and a "When the
                 last use is spent" SegmentedControl (caps.item.whenSpent).
   - knowledge → Learning card. A "Limited learning" toggle (caps.learn.limitLearning);
                 when on, a detail block with "Limit applies" (caps.learn.learnScope:
                 perInstance = per copy / total = across all copies) + "Recipes allowed"
                 stepper (caps.learn.learnsAllowed, min 1) on one line, then two columns:
                 "Required Knowledge" (caps.learn.prerequisiteIds — recipes the reader
                 must already know, AND) and "Learning prerequisites"
                 (caps.learn.characterPrerequisiteIds — character prerequisites the reader
                 must pass, AND), each a searchable typeahead + removable pills, then a
                 live plain-English explanation. When the toggle is off, none of this
                 shows and neither gate is enforced at runtime.

  CONTROLLED: every change emits a nested partial patch via `onPatch`; the router
  deep-merges it into the draft.

  Props:
   - recipeItem: the draft `{ caps: { item, learn } }`.
   - visibilityMode: 'item' | 'knowledge'.
   - linkedRecipes / availableRecipes: `[{ id, name }]` for the prerequisite selector.
   - onPatch(patch).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SegmentedControl from '../SegmentedControl.svelte';

  import { prerequisitePreview } from '../../../../../systems/characterPrerequisites.js';

  let {
    recipeItem = null,
    visibilityMode = 'item',
    linkedRecipes = [],
    availableRecipes = [],
    // System-owned character prerequisite library (issue 544) — the options for
    // the "Character prerequisites to learn" multi-select.
    characterPrerequisites = [],
    onPatch = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const modeItem = $derived(visibilityMode === 'item');
  const modeKnowledge = $derived(visibilityMode === 'knowledge');

  const itemCaps = $derived(recipeItem?.caps?.item || {});
  const learnCaps = $derived(recipeItem?.caps?.learn || {});

  const limitUses = $derived(itemCaps.limitUses === true);
  const maxUses = $derived(Number.isFinite(itemCaps.maxUses) ? itemCaps.maxUses : 1);
  const whenSpent = $derived(itemCaps.whenSpent === 'inert' ? 'inert' : 'destroyed');

  const limitLearning = $derived(learnCaps.limitLearning === true);
  // Canonical cap scope: 'perInstance' (per copy in a character's inventory) or
  // 'total' (shared across every copy of the source item). Falls back to deriving
  // from the legacy `learningMode` so un-normalized drafts still read correctly.
  const learnScope = $derived(
    ['perInstance', 'total'].includes(learnCaps.learnScope)
      ? learnCaps.learnScope
      : learnCaps.learningMode === 'party'
        ? 'total'
        : 'perInstance'
  );
  const learnsAllowed = $derived(
    Number.isFinite(learnCaps.learnsAllowed) && learnCaps.learnsAllowed > 0 ? learnCaps.learnsAllowed : 1
  );

  const WHEN_SPENT_OPTIONS = [
    { value: 'destroyed', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.Destroyed', fallback: 'Destroyed' },
    { value: 'inert', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.Inert', fallback: 'Becomes inert' }
  ];
  const LEARN_SCOPE_OPTIONS = [
    { value: 'perInstance', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.ScopePerCopy', fallback: 'Per copy', icon: 'fas fa-book' },
    { value: 'total', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.ScopeTotal', fallback: 'Across all copies', icon: 'fas fa-layer-group' }
  ];

  // Prerequisite options: prefer the recipes already linked to this item, then any
  // other available recipe, de-duplicated by id.
  const prerequisiteOptions = $derived.by(() => {
    const seen = new Set();
    const options = [];
    for (const recipe of [...(linkedRecipes || []), ...(availableRecipes || [])]) {
      const id = String(recipe?.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      options.push({ id, name: String(recipe?.name || id) });
    }
    return options;
  });

  const learnExplain = $derived.by(() => {
    const n = learnsAllowed;
    const recipes = `${n} ${n === 1
      ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.Recipe', 'recipe')
      : text('FABRICATE.Admin.Manager.RecipeItem.Limits.Recipes', 'recipes')}`;
    if (learnScope === 'total') {
      return text('FABRICATE.Admin.Manager.RecipeItem.Limits.ExplainTotal', 'Up to {recipes} can be learned in total across every copy of this item, no matter who reads them.').replace('{recipes}', recipes);
    }
    return text('FABRICATE.Admin.Manager.RecipeItem.Limits.ExplainPerCopy', 'Each copy of this item teaches up to {recipes}; the reader picks which.').replace('{recipes}', recipes);
  });

  function patchItem(patch) {
    onPatch({ caps: { item: patch } });
  }
  function patchLearn(patch) {
    onPatch({ caps: { learn: patch } });
  }

  function toggleLimitUses() {
    patchItem({ limitUses: !limitUses });
  }
  function stepUses(delta) {
    const next = Math.max(1, maxUses + delta);
    if (next !== maxUses) patchItem({ maxUses: next });
  }
  function selectWhenSpent(value) {
    patchItem({ whenSpent: value });
  }

  function toggleLimitLearning() {
    patchLearn({ limitLearning: !limitLearning });
  }
  function selectLearnScope(value) {
    patchLearn({ learnScope: value });
  }
  function stepLearns(delta) {
    const next = Math.max(1, learnsAllowed + delta);
    if (next !== learnsAllowed) patchLearn({ learnsAllowed: next });
  }

  // Required Knowledge (issue 544): the recipe ids a reader must ALREADY have
  // learned (AND semantics — must know ALL of them) before learning from this book
  // or scroll. Authored as a searchable typeahead + removable pills (mirrors the
  // tag picker in ComponentsBrowserView). Folds the legacy single `prerequisite`
  // string into the array so un-normalized drafts still read correctly.
  const prerequisiteIds = $derived(
    Array.isArray(learnCaps.prerequisiteIds)
      ? learnCaps.prerequisiteIds
      : learnCaps.prerequisite
        ? [String(learnCaps.prerequisite)]
        : []
  );
  // The selected required-knowledge recipes resolved to `{ id, name }` (order = selection).
  const selectedRequiredKnowledge = $derived.by(() => {
    const byId = new Map(prerequisiteOptions.map((option) => [String(option.id), option]));
    return prerequisiteIds.map((id) => byId.get(String(id))).filter(Boolean);
  });
  let requiredKnowledgeSearch = $state('');
  const normalizedRequiredKnowledgeSearch = $derived(
    (requiredKnowledgeSearch || '').trim().toLowerCase()
  );
  // Options not already selected whose name matches the (non-empty) search term.
  const requiredKnowledgeSuggestions = $derived(
    normalizedRequiredKnowledgeSearch
      ? prerequisiteOptions.filter(
          (option) =>
            !prerequisiteIds.includes(option.id) &&
            option.name.toLowerCase().includes(normalizedRequiredKnowledgeSearch)
        )
      : []
  );
  function addRequiredKnowledge(id) {
    const value = String(id || '');
    if (!value || prerequisiteIds.includes(value)) return;
    patchLearn({ prerequisiteIds: [...prerequisiteIds, value] });
    requiredKnowledgeSearch = '';
  }
  function removeRequiredKnowledge(id) {
    patchLearn({ prerequisiteIds: prerequisiteIds.filter((value) => value !== id) });
  }

  // Learning prerequisites (issue 544): the system-owned character-prerequisite ids
  // a reader must ALL pass (AND) to learn from this book, gating on actor roll data
  // — distinct from Required Knowledge above, which gates on prior recipe knowledge.
  // Authored with the same searchable typeahead + removable pills.
  const characterPrerequisiteIds = $derived(
    Array.isArray(learnCaps.characterPrerequisiteIds) ? learnCaps.characterPrerequisiteIds : []
  );
  // The selected prerequisites resolved to their definitions (order = selection).
  const selectedCharacterPrerequisites = $derived.by(() => {
    const byId = new Map((characterPrerequisites || []).map((p) => [String(p.id), p]));
    return characterPrerequisiteIds.map((id) => byId.get(String(id))).filter(Boolean);
  });
  // The prerequisites still available to add (not already selected).
  const availableCharacterPrerequisites = $derived(
    (characterPrerequisites || []).filter((p) => !characterPrerequisiteIds.includes(p.id))
  );
  let characterPrereqSearch = $state('');
  const normalizedCharacterPrereqSearch = $derived(
    (characterPrereqSearch || '').trim().toLowerCase()
  );
  const characterPrereqSuggestions = $derived(
    normalizedCharacterPrereqSearch
      ? availableCharacterPrerequisites.filter((p) =>
          String(p.name || '').toLowerCase().includes(normalizedCharacterPrereqSearch)
        )
      : []
  );
  function addCharacterPrerequisite(id) {
    const value = String(id || '');
    if (!value || characterPrerequisiteIds.includes(value)) return;
    patchLearn({ characterPrerequisiteIds: [...characterPrerequisiteIds, value] });
    characterPrereqSearch = '';
  }
  function removeCharacterPrerequisite(id) {
    patchLearn({ characterPrerequisiteIds: characterPrerequisiteIds.filter((value) => value !== id) });
  }
</script>

<section class="manager-recipe-item-tab manager-recipe-item-limits" data-recipe-item-tab="limits" data-visibility-mode={visibilityMode} aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Title', 'Limits')}>
  {#if modeItem}
    <div class="manager-recipe-item-limits-section" data-recipe-item-limits-card="item">
      <div class="manager-recipe-item-limits-heading">
        <i class="fas fa-rotate" aria-hidden="true"></i>
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.UsesTitle', 'Uses')}</h3>
      </div>
      <p class="manager-muted manager-recipe-item-limits-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.UsesHint', 'How many times a single copy of this item can be read before it’s spent.')}</p>

      <div class="manager-recipe-item-limits-panel">
        <div class="manager-recipe-item-limits-toggle-row">
          <div class="manager-recipe-item-limits-toggle-copy">
            <span class="manager-recipe-item-limits-toggle-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUse', 'Limited use')}</span>
            <span class="manager-recipe-item-limits-toggle-sub">{limitUses
              ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUseOn', 'On — a copy is spent as it’s read.')
              : text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUseOff', 'Off — this item can be read any number of times.')}</span>
          </div>
          <button
            type="button"
            class={`manager-status-toggle ${limitUses ? 'is-on' : 'is-off'}`}
            data-recipe-item-limit-uses
            aria-pressed={limitUses}
            aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUse', 'Limited use')}
            onclick={toggleLimitUses}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{limitUses ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
        </div>

        {#if limitUses}
          <div class="manager-recipe-item-limits-detail">
            <div class="manager-recipe-item-stepper-group">
              <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.UsesPerCopy', 'Uses per copy')}</span>
              <div class="manager-recipe-item-stepper" data-recipe-item-uses-stepper>
                <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-uses-dec aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Decrement', 'Decrease')} onclick={() => stepUses(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                <span class="manager-recipe-item-stepper-value" data-recipe-item-uses-value>{maxUses}</span>
                <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-uses-inc aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Increment', 'Increase')} onclick={() => stepUses(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="manager-recipe-item-limits-divider" aria-hidden="true"></div>
            <div class="manager-recipe-item-when-spent">
              <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.WhenSpent', 'When the last use is spent')}</span>
              <SegmentedControl
                options={WHEN_SPENT_OPTIONS}
                value={whenSpent}
                onChange={selectWhenSpent}
                groupName="recipe-item-when-spent"
                ariaLabel={text('FABRICATE.Admin.Manager.RecipeItem.Limits.WhenSpent', 'When the last use is spent')}
                dataAttr="data-recipe-item-when-spent"
                optionDataAttr="data-recipe-item-when-spent-option"
              />
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if modeKnowledge}
    <div class="manager-recipe-item-limits-section" data-recipe-item-limits-card="knowledge">
      <div class="manager-recipe-item-limits-heading">
        <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningTitle', 'Learning')}</h3>
      </div>
      <p class="manager-muted manager-recipe-item-limits-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningHint', 'How many recipes may be learned from this item — independent of how many times the item can be opened.')}</p>

      <div class="manager-recipe-item-limits-panel">
        <div class="manager-recipe-item-limits-toggle-row">
          <div class="manager-recipe-item-limits-toggle-copy">
            <span class="manager-recipe-item-limits-toggle-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearning', 'Limited learning')}</span>
            <span class="manager-recipe-item-limits-toggle-sub">{limitLearning
              ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearningOn', 'On — a limited number of recipes can be learned from this item.')
              : text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearningOff', 'Off — readers can learn every recipe in this item freely.')}</span>
          </div>
          <button
            type="button"
            class={`manager-status-toggle ${limitLearning ? 'is-on' : 'is-off'}`}
            data-recipe-item-limit-learning
            aria-pressed={limitLearning}
            aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearning', 'Limited learning')}
            onclick={toggleLimitLearning}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{limitLearning ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
        </div>

        {#if limitLearning}
          <div class="manager-recipe-item-limits-detail is-column">
            <!-- Line 1: Limit applies · divider · Recipes allowed. -->
            <div class="manager-recipe-item-learning-row">
              <div class="manager-recipe-item-learning-limit">
                <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.AppliesTo', 'Limit applies')}</span>
                <SegmentedControl
                  options={LEARN_SCOPE_OPTIONS}
                  value={learnScope}
                  onChange={selectLearnScope}
                  groupName="recipe-item-learn-scope"
                  ariaLabel={text('FABRICATE.Admin.Manager.RecipeItem.Limits.AppliesTo', 'Limit applies')}
                  dataAttr="data-recipe-item-learn-scope"
                  optionDataAttr="data-recipe-item-learn-scope-option"
                />
              </div>
              <div class="manager-recipe-item-limits-divider is-vertical" aria-hidden="true"></div>
              <div class="manager-recipe-item-stepper-group">
                <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.RecipesAllowed', 'Recipes allowed')}</span>
                <div class="manager-recipe-item-stepper" data-recipe-item-learns-stepper>
                  <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-learns-dec aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Decrement', 'Decrease')} onclick={() => stepLearns(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <span class="manager-recipe-item-stepper-value" data-recipe-item-learns-value>{learnsAllowed}</span>
                  <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-learns-inc aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Increment', 'Increase')} onclick={() => stepLearns(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                  <span class="manager-recipe-item-stepper-unit">{learnScope === 'total'
                    ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.UnitTotal', 'total · shared')
                    : text('FABRICATE.Admin.Manager.RecipeItem.Limits.UnitPerCopy', 'per copy')}</span>
                </div>
              </div>
            </div>

            <!-- Line 2: two equal columns — Required Knowledge · Learning prerequisites. -->
            <div class="manager-recipe-item-prereq-columns">
              <!-- Required Knowledge (recipes the reader must already have learned). -->
              <div class="manager-recipe-item-prereq-column" data-recipe-item-required-knowledge-column>
                <span id="recipe-item-required-knowledge-label" class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledge', 'Required Knowledge')}</span>
                <p class="manager-muted manager-recipe-item-prereq-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledgeHint', 'The character must already know these recipes to learn from this book or scroll.')}</p>
                {#if prerequisiteOptions.length === 0}
                  <p class="manager-muted manager-recipe-item-prereq-empty" data-recipe-item-required-knowledge-empty>{text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledgeEmpty', 'No recipes to require yet')}</p>
                {:else}
                  <div class="manager-tag-search">
                    <input
                      type="search"
                      class="manager-recipe-item-prereq-search"
                      data-recipe-item-required-knowledge-search
                      role="combobox"
                      aria-expanded={requiredKnowledgeSuggestions.length > 0}
                      aria-controls="recipe-item-required-knowledge-suggestions"
                      value={requiredKnowledgeSearch}
                      placeholder={text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledgeSearch', 'Search recipes…')}
                      aria-labelledby="recipe-item-required-knowledge-label"
                      oninput={(event) => (requiredKnowledgeSearch = event.currentTarget.value)}
                    />
                    {#if requiredKnowledgeSuggestions.length > 0}
                      <div id="recipe-item-required-knowledge-suggestions" class="manager-tag-suggestions" role="listbox" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledge', 'Required Knowledge')}>
                        {#each requiredKnowledgeSuggestions as option (option.id)}
                          <button type="button" role="option" aria-selected="false" class="manager-tag-suggestion" data-recipe-item-required-knowledge-option={option.id} onclick={() => addRequiredKnowledge(option.id)}>
                            <i class="fas fa-scroll" aria-hidden="true"></i>
                            <span>{option.name}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
                {#if selectedRequiredKnowledge.length > 0}
                  <div class="manager-selected-tag-row" role="list">
                    {#each selectedRequiredKnowledge as option (option.id)}
                      <span class="manager-chip manager-selected-tag-pill" role="listitem" data-recipe-item-required-knowledge={option.id}>
                        <span>{option.name}</span>
                        <button
                          type="button"
                          data-recipe-item-required-knowledge-remove={option.id}
                          aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledgeRemove', 'Remove')}
                          title={text('FABRICATE.Admin.Manager.RecipeItem.Limits.RequiredKnowledgeRemove', 'Remove')}
                          onclick={() => removeRequiredKnowledge(option.id)}
                        ><i class="fas fa-xmark" aria-hidden="true"></i></button>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Learning prerequisites (character prerequisites the reader must pass). -->
              <div class="manager-recipe-item-prereq-column" data-recipe-item-character-prereqs>
                <span id="recipe-item-character-prereqs-label" class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningPrerequisites', 'Learning prerequisites')}</span>
                <p class="manager-muted manager-recipe-item-prereq-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningPrerequisitesHint', 'The character must have these attributes to learn.')}</p>
                {#if characterPrerequisites.length === 0}
                  <p class="manager-muted manager-recipe-item-prereq-empty" data-recipe-item-character-prereq-empty>{text('FABRICATE.Admin.Manager.RecipeItem.Limits.CharacterPrerequisitesNone', 'No prerequisites yet — add them in System Settings.')}</p>
                {:else}
                  <div class="manager-tag-search">
                    <input
                      type="search"
                      class="manager-recipe-item-prereq-search"
                      data-recipe-item-character-prereq-search
                      role="combobox"
                      aria-expanded={characterPrereqSuggestions.length > 0}
                      aria-controls="recipe-item-character-prereq-suggestions"
                      value={characterPrereqSearch}
                      placeholder={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningPrerequisitesSearch', 'Search prerequisites…')}
                      aria-labelledby="recipe-item-character-prereqs-label"
                      oninput={(event) => (characterPrereqSearch = event.currentTarget.value)}
                    />
                    {#if characterPrereqSuggestions.length > 0}
                      <div id="recipe-item-character-prereq-suggestions" class="manager-tag-suggestions" role="listbox" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningPrerequisites', 'Learning prerequisites')}>
                        {#each characterPrereqSuggestions as prereq (prereq.id)}
                          <button type="button" role="option" aria-selected="false" class="manager-tag-suggestion" data-recipe-item-character-prereq-option={prereq.id} onclick={() => addCharacterPrerequisite(prereq.id)}>
                            <i class="fas fa-user-check" aria-hidden="true"></i>
                            <span>{prereq.name}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
                {#if selectedCharacterPrerequisites.length > 0}
                  <div class="manager-selected-tag-row" data-recipe-item-character-prereq-chips role="list">
                    {#each selectedCharacterPrerequisites as prereq (prereq.id)}
                      <span class="manager-chip manager-selected-tag-pill" role="listitem" data-recipe-item-character-prereq={prereq.id} title={prerequisitePreview(prereq)}>
                        <span>{prereq.name}</span>
                        <button
                          type="button"
                          data-recipe-item-character-prereq-remove={prereq.id}
                          aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.CharacterPrerequisitesRemove', 'Remove')}
                          title={text('FABRICATE.Admin.Manager.RecipeItem.Limits.CharacterPrerequisitesRemove', 'Remove')}
                          onclick={() => removeCharacterPrerequisite(prereq.id)}
                        ><i class="fas fa-xmark" aria-hidden="true"></i></button>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <div class="manager-recipe-item-learn-explain" data-recipe-item-learn-explain>
              <i class="fas fa-circle-info" aria-hidden="true"></i>
              <span>{learnExplain}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .manager-recipe-item-limits {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
  }

  /* Required Knowledge + Learning prerequisites — two equal columns (issue 544). */
  .manager-recipe-item-prereq-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-4);
  }

  .manager-recipe-item-prereq-column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-recipe-item-prereq-hint {
    margin: 0;
    font-size: 0.66rem;
    line-height: 1.4;
  }

  /* Inline empty state shown instead of the search input when a column has no
     options — a real, readable text node (not a disabled-input placeholder). */
  .manager-recipe-item-prereq-empty {
    margin: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px dashed var(--fab-border);
    border-radius: 6px;
    font-size: 0.72rem;
    line-height: 1.4;
  }

  /* The typeahead search stretches to fill its column (overrides the global
     toolbar-oriented max-width and min-width so a narrow column can't overflow). */
  .manager-recipe-item-prereq-column :global(.manager-tag-search) {
    max-width: none;
    min-width: 0;
    width: 100%;
  }

  /* Stack the two columns when the editor body itself is narrow. Keyed to the
     detail block's own inline size (~600px content width) rather than the whole
     manager shell, so the flip tracks the real column width. */
  @container recipe-item-limits-detail (max-width: 600px) {
    .manager-recipe-item-prereq-columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .manager-recipe-item-limits-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-accent);
  }

  .manager-recipe-item-limits-heading .manager-card-title {
    margin: 0;
  }

  .manager-recipe-item-limits-hint {
    margin: var(--fab-space-1) 0 var(--fab-space-3);
  }

  .manager-recipe-item-limits-panel {
    border: 1px solid var(--fab-accent-border);
    border-radius: 11px;
    background: var(--fab-surface-soft);
    /* Not `overflow: hidden`: the typeahead suggestions dropdown is absolutely
       positioned near the panel's bottom edge and must be allowed to escape it
       (a clip can't be beaten by z-index). Children have transparent backgrounds,
       so the rounded corners still read cleanly. */
    overflow: visible;
  }

  .manager-recipe-item-limits-toggle-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
  }

  .manager-recipe-item-limits-toggle-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 1;
    min-width: 0;
  }

  .manager-recipe-item-limits-toggle-title {
    font-weight: 600;
    font-size: 0.82rem;
    color: var(--fab-text);
  }

  .manager-recipe-item-limits-toggle-sub {
    font-size: 0.66rem;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-limits-detail {
    display: flex;
    align-items: center;
    gap: var(--fab-space-4);
    padding: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .manager-recipe-item-limits-detail.is-column {
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-4);
    /* Query container for the two-column prereq grid below — measures the detail
       block's own inline size (the true column area), not the whole shell. */
    container-type: inline-size;
    container-name: recipe-item-limits-detail;
  }

  .manager-recipe-item-learning-row {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-4);
  }

  .manager-recipe-item-stepper-group,
  .manager-recipe-item-when-spent,
  .manager-recipe-item-learning-limit {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-stepper-label {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-stepper {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-stepper.is-disabled {
    opacity: 0.4;
  }

  .manager-recipe-item-stepper-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-2);
    color: var(--fab-text-secondary);
    cursor: pointer;
  }

  .manager-recipe-item-stepper-button:hover:not(:disabled) {
    border-color: var(--fab-accent-border);
  }

  .manager-recipe-item-stepper-button:disabled {
    cursor: not-allowed;
  }

  .manager-recipe-item-stepper-value {
    min-width: 26px;
    text-align: center;
    font-family: var(--fab-font-mono, monospace);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--fab-text);
  }

  .manager-recipe-item-stepper-unit {
    font-size: 0.66rem;
    color: var(--fab-text-subtle);
    margin-left: var(--fab-space-1);
  }

  .manager-recipe-item-limits-divider {
    width: 1px;
    align-self: stretch;
    background: var(--fab-border);
  }

  .manager-recipe-item-limits-divider.is-vertical {
    min-height: 40px;
  }

  .manager-recipe-item-learn-explain {
    display: flex;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-info-border);
    border-radius: 9px;
    background: var(--fab-info-soft);
    font-size: 0.68rem;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .manager-recipe-item-learn-explain > i {
    color: var(--fab-info);
    margin-top: 1px;
  }
</style>
