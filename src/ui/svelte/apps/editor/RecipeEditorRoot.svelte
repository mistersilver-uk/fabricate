<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';
  import {
    getRecipeAvailabilityState,
    RECIPE_AVAILABILITY_STATES
  } from '../../../recipeAvailability.js';
  import ValidationBanner from './ValidationBanner.svelte';
  import ItemPickerGrid from './ItemPickerGrid.svelte';
  import IngredientSetPanel from './IngredientSetPanel.svelte';
  import ResultGroupPanel from './ResultGroupPanel.svelte';
  import VisibilitySection from './VisibilitySection.svelte';
  import StepNavigator from './StepNavigator.svelte';
  import ResultSelectionProvider from './ResultSelectionProvider.svelte';
  import RecipeImagePicker from './RecipeImagePicker.svelte';

  let { store, services = {} } = $props();

  // svelte-ignore state_referenced_locally
  const {
    draft,
    activeStepIndex,
    collapsedPanels,
    pickerSearch,
    featureState,
    activeContainers,
    validationErrors,
    pickerItems,
    isNewRecipe,
    systemCategories,
    recipeItemDefinitionsVersion
  } = store;

  // Build item map for name/image resolution
  const itemMap = $derived(new Map(($pickerItems || []).map(item => [item.id, item])));

  // Resolve system categories for select
  const categories = $derived($systemCategories || []);

  // Resolve non-GM users for visibility
  const nonGMUsers = $derived(services.getNonGMUsers?.() || []);

  const recipeItems = $derived.by(() => {
    $recipeItemDefinitionsVersion;
    return services.getRecipeItemDefinitions?.($draft.craftingSystemId) || [];
  });
  const selectedRecipeItem = $derived(
    (recipeItems || []).find(item => item.id === $draft.recipeItemId) || null
  );

  // All system tags for datalist
  const allTags = $derived(services.getSystemTags?.($draft.craftingSystemId) || []);

  // All system essence definitions
  const allEssences = $derived(services.getEssenceDefinitions?.($draft.craftingSystemId) || []);

  // Active step (when multi-step enabled)
  const activeStep = $derived(
    $featureState.showMultiStepRecipes && $draft.steps?.[$activeStepIndex]
      ? $draft.steps[$activeStepIndex]
      : null
  );

  // Active ingredient sets & result groups (either from step or top-level)
  const ingredientSets = $derived($activeContainers?.ingredientSets || []);
  const resultGroups = $derived($activeContainers?.results || []);
  const availabilityState = $derived(getRecipeAvailabilityState($draft));

  // Field-level error helpers
  const errorFieldSelectors = $derived(
    new Set(($validationErrors || []).map(e => e.fieldSelector).filter(Boolean))
  );

  function hasFieldError(selector) {
    return errorFieldSelectors.has(selector);
  }

  const errorPanelIds = $derived(
    new Set(($validationErrors || []).map(e => e.panelId).filter(Boolean))
  );

  function handleScrollToError(error) {
    if (error.panelId && $collapsedPanels.has(error.panelId)) {
      store.togglePanel(error.panelId); // only expand if currently collapsed
    }
    if (error.fieldSelector) {
      // Give DOM time to update after panel expand
      requestAnimationFrame(() => {
        const el = document.querySelector(error.fieldSelector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus?.();
        }
      });
    }
  }

  async function handleSave() {
    const result = await store.saveRecipe();
    if (result.success) {
      services.onClose?.();
    }
  }

  // Ingredient option field updates
  function handleUpdateOption(setIndex, groupIndex, optionIndex, field, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const set = containers?.ingredientSets?.[setIndex];
      const option = set?.ingredientGroups?.[groupIndex]?.options?.[optionIndex];
      if (option) option[field] = value;
    });
  }

  function handleUpdateGroupName(setIndex, groupIndex, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const set = containers?.ingredientSets?.[setIndex];
      const group = set?.ingredientGroups?.[groupIndex];
      if (group) group.name = value;
    });
  }

  function handleUpdateSetName(setIndex, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const set = containers?.ingredientSets?.[setIndex];
      if (set) set.name = value;
    });
  }

  function handleUpdateResultGroupName(groupIndex, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const group = containers?.results?.[groupIndex];
      if (group) group.name = value;
    });
  }

  function handleUpdateResult(groupIndex, resultIndex, field, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const result = containers?.results?.[groupIndex]?.results?.[resultIndex];
      if (result) result[field] = value;
    });
  }

  function handleUpdateCatalyst(setIndex, catalystIndex, field, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const catalyst = containers?.ingredientSets?.[setIndex]?.catalysts?.[catalystIndex];
      if (catalyst) catalyst[field] = value;
    });
  }

  function handleDropCatalyst(setIndex, catalystIndex, componentId) {
    store.assignCatalystItem(setIndex, catalystIndex, componentId);
  }

  function handleUpdateStep(field, value) {
    store.updateDraft(d => {
      const step = d.steps?.[$activeStepIndex];
      if (!step) return;
      if (field.startsWith('timeRequirement.')) {
        const unit = field.split('.')[1];
        if (!step.timeRequirement) step.timeRequirement = { minutes: 0, hours: 0, days: 0, months: 0, years: 0 };
        step.timeRequirement[unit] = value;
      } else if (field.startsWith('currencyRequirement.')) {
        const unit = field.split('.')[1];
        if (!step.currencyRequirement) step.currencyRequirement = { unit: '', amount: 0 };
        step.currencyRequirement[unit] = value;
      } else {
        step[field] = value;
      }
    });
  }

  function handleUpdateOutcomeRouting(outcome, resultGroupId) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      if (!containers.outcomeRouting) return;
      containers.outcomeRouting[outcome] = resultGroupId;
    });
  }

  function handleUpdateIngredientSetMapping(setIndex, field, value) {
    store.updateDraft(d => {
      const containers = $activeContainers;
      const set = containers?.ingredientSets?.[setIndex];
      if (set) set[field] = value;
    });
  }

  async function handleAssignRecipeItem(data) {
    if (!$draft.craftingSystemId) return;
    const recipeItem = await services.assignRecipeItemFromDrop?.(data, $draft.craftingSystemId);
    if (recipeItem?.id) {
      store.setRecipeItemId(recipeItem.id);
    }
  }

  async function handleCopyRecipeItemSource(recipeItemId) {
    const recipeItem = (recipeItems || []).find(item => item.id === recipeItemId) || null;
    const sourceUuid = recipeItem?.sourceItemUuid || '';
    if (!sourceUuid) {
      services.notify?.('warn', localize('FABRICATE.Admin.Items.NoSourceUuid'));
      return;
    }

    try {
      await services.copyToClipboard?.(sourceUuid);
      services.notify?.('info', localize('FABRICATE.Admin.Items.SourceUuidCopied'));
    } catch (err) {
      console.error('Fabricate | Failed to copy recipe item source UUID:', err);
      services.notify?.('error', localize('FABRICATE.Admin.Items.SourceUuidCopyFailed'));
    }
  }

  async function handleDeleteRecipeItem(recipeItemId) {
    await store.deleteRecipeItemDefinition?.(recipeItemId);
  }

  function handleRefreshRecipeItem() {
    store.refreshRecipeItemImage?.();
  }
</script>

<div class="fabricate-recipe-editor">
  <!-- Header -->
  <header class="editor-header">
    <h2>
      <i class="fa-solid fa-flask"></i>
      {$isNewRecipe ? localize('FABRICATE.Editor.Header.NewRecipe') : localize('FABRICATE.Editor.Header.EditRecipe')}
    </h2>
  </header>

  <div class="editor-layout">
    <!-- Main Editor Content -->
    <main class="editor-main">
      <ValidationBanner errors={$validationErrors} onScrollToError={handleScrollToError} />

      <!-- Basic Info Grid -->
      <section class="basic-info editor-panel-surface">
        <div class="basic-info-layout">
          <div class="recipe-image-column">
            <RecipeImagePicker
              value={$draft.img}
              onChange={(path) => store.setField('img', path)}
              disabled={Boolean(selectedRecipeItem)}
              disabledTitle={selectedRecipeItem
                ? localize('FABRICATE.Editor.LinkedItem.ImageLockedHint', { name: selectedRecipeItem.name })
                : ''}
            />
            {#if selectedRecipeItem}
              <p class="recipe-image-lock-hint">
                {localize('FABRICATE.Editor.LinkedItem.ImageLockedHint', { name: selectedRecipeItem.name })}
              </p>
            {/if}
          </div>
          <div class="info-grid">
            <div class="field-row">
              <label for="recipeName">{localize('FABRICATE.Editor.BasicInfo.NameLabel')}</label>
              <input
                id="recipeName"
                name="recipeName"
                type="text"
                value={$draft.name}
                oninput={(e) => store.setField('name', e.target.value)}
                placeholder={localize('FABRICATE.Recipe.Name')}
                required
                class:field-error={hasFieldError('[name="recipeName"]')}
              />
              {#if hasFieldError('[name="recipeName"]')}
                <span class="inline-error">{localize('FABRICATE.Editor.Validation.NameRequired')}</span>
              {/if}
            </div>

            {#if $featureState.showCategories}
              <div class="field-row">
                <label for="recipeCategory">{localize('FABRICATE.Editor.BasicInfo.CategoryLabel')}</label>
                {#if categories.length > 0}
                  <select
                    id="recipeCategory"
                    value={$draft.category}
                    onchange={(e) => store.setField('category', e.target.value)}
                  >
                    {#each categories as cat}
                      <option value={cat}>{getRecipeCategoryLabel(cat, localize)}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    id="recipeCategory"
                    type="text"
                    value={$draft.category}
                    oninput={(e) => store.setField('category', e.target.value)}
                  />
                {/if}
              </div>
            {/if}

            <div class="field-row full-width">
              <label for="recipeDescription">{localize('FABRICATE.Editor.BasicInfo.DescriptionLabel')}</label>
              <textarea
                id="recipeDescription"
                value={$draft.description}
                oninput={(e) => store.setField('description', e.target.value)}
                rows="3"
              ></textarea>
            </div>
          </div>
        </div>
      </section>

      <!-- Flags -->
      <section class="flags-section editor-panel-surface">
        <div class="field-row availability-field">
          <label for="recipeAvailability">{localize('FABRICATE.Editor.Flags.Availability')}</label>
          <select
            id="recipeAvailability"
            value={availabilityState}
            onchange={(e) => store.setAvailabilityState(e.target.value)}
          >
            <option value={RECIPE_AVAILABILITY_STATES.ENABLED}>
              {localize('FABRICATE.Editor.Flags.StatusEnabled')}
            </option>
            <option value={RECIPE_AVAILABILITY_STATES.DISABLED}>
              {localize('FABRICATE.Editor.Flags.StatusDisabled')}
            </option>
            <option value={RECIPE_AVAILABILITY_STATES.LOCKED}>
              {localize('FABRICATE.Editor.Flags.StatusLocked')}
            </option>
          </select>
        </div>
        {#if $featureState.showComplexRecipes && !$featureState.isMappedMode && !$featureState.isAlchemyMode}
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={$draft.isVariable}
              onchange={(e) => store.setField('isVariable', e.target.checked)}
            />
            {localize('FABRICATE.Editor.Flags.VariableOutput')}
          </label>
        {/if}
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={$draft.transferEffects}
            onchange={(e) => store.setField('transferEffects', e.target.checked)}
          />
          {localize('FABRICATE.Editor.Flags.TransferEffects')}
        </label>
      </section>

      <!-- Visibility & Linked Item -->
      <VisibilitySection
        featureState={$featureState}
        visibility={$draft.visibility}
        recipeItemId={$draft.recipeItemId}
        {recipeItems}
        selectedRecipeItem={selectedRecipeItem}
        {nonGMUsers}
        onUpdateVisibility={(vis) => store.setField('visibility', vis)}
        onClearRecipeItem={() => store.clearRecipeItem()}
        onSelectRecipeItem={(recipeItemId) => store.setRecipeItemId(recipeItemId)}
        onAssignRecipeItemFromDrop={handleAssignRecipeItem}
        onCopyRecipeItemSource={handleCopyRecipeItemSource}
        onDeleteRecipeItem={handleDeleteRecipeItem}
        onRefreshRecipeItem={handleRefreshRecipeItem}
      />

      <!-- Multi-Step Navigator -->
      {#if $featureState.showMultiStepRecipes}
        <StepNavigator
          activeStepIndex={$activeStepIndex}
          totalSteps={($draft.steps || []).length}
          stepName={activeStep?.name || ''}
          stepDescription={activeStep?.description || ''}
          timeRequirement={activeStep?.timeRequirement}
          currencyRequirement={activeStep?.currencyRequirement}
          showTimeRequirements={$featureState.showTimeRequirements}
          showCurrencyRequirements={$featureState.showCurrencyRequirements}
          onPrevStep={() => store.prevStep()}
          onNextStep={() => store.nextStep()}
          onAddStep={() => store.addStep()}
          onRemoveStep={() => store.removeStep()}
          onUpdateStep={handleUpdateStep}
        />
      {/if}

      <!-- Ingredient Sets -->
      <section class="ingredient-sets-section editor-panel-surface">
        <div class="section-header">
          <h3>{localize('FABRICATE.Editor.IngredientSets.SectionTitle')}</h3>
          {#if $featureState.showComplexRecipes}
            <button type="button" onclick={() => store.addIngredientSet()}>
              <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.IngredientSets.AddSet')}
            </button>
          {/if}
        </div>

        {#each ingredientSets as set, setIdx (set.id)}
          <IngredientSetPanel
            {set}
            setIndex={setIdx}
            totalSets={ingredientSets.length}
            collapsed={$collapsedPanels.has(set.id)}
            {itemMap}
            showComplexRecipes={$featureState.showComplexRecipes}
            showItemTags={$featureState.showItemTags}
            {allTags}
            validationErrors={$validationErrors}
            onTogglePanel={(id) => store.togglePanel(id)}
            onMoveUp={(idx) => store.moveIngredientSetUp(idx)}
            onMoveDown={(idx) => store.moveIngredientSetDown(idx)}
            onRemoveSet={(idx) => store.removeIngredientSet(idx)}
            onUpdateSetName={handleUpdateSetName}
            onAddGroup={(si) => store.addIngredientGroup(si)}
            onRemoveGroup={(si, gi) => store.removeIngredientGroup(si, gi)}
            onAddOption={(si, gi) => store.addIngredientOption(si, gi)}
            onRemoveOption={(si, gi, oi) => store.removeIngredientOption(si, gi, oi)}
            onClearComponent={(si, gi, oi) => store.clearIngredientComponent(si, gi, oi)}
            onDropIngredient={(si, gi, oi, itemId) => store.assignIngredientItem(si, gi, oi, itemId)}
            onUpdateOption={handleUpdateOption}
            onUpdateGroupName={handleUpdateGroupName}
            onAddCatalyst={(si) => store.addCatalystRow(si)}
            onRemoveCatalyst={(si, ci) => store.removeCatalystRow(si, ci)}
            onClearCatalyst={(si, ci) => store.clearCatalystComponent(si, ci)}
            onDropCatalyst={handleDropCatalyst}
            onUpdateCatalyst={handleUpdateCatalyst}
            showEssences={$featureState.showEssences}
            {allEssences}
            onAddEssence={(si, eid, qty) => store.addEssence(si, eid, qty)}
            onUpdateEssence={(si, eid, qty) => store.updateEssence(si, eid, qty)}
            onRemoveEssence={(si, eid) => store.removeEssence(si, eid)}
          />
        {/each}
      </section>

      <!-- Result Groups -->
      <section class="result-groups-section editor-panel-surface">
        <div class="section-header">
          <h3>{localize('FABRICATE.Editor.ResultGroups.SectionTitle')}</h3>
          {#if $featureState.showComplexRecipes}
            <button type="button" onclick={() => store.addResultGroup()}>
              <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.ResultGroups.AddGroup')}
            </button>
          {/if}
        </div>

        {#each resultGroups as group, groupIdx (group.id)}
          <ResultGroupPanel
            {group}
            groupIndex={groupIdx}
            totalGroups={resultGroups.length}
            collapsed={$collapsedPanels.has(group.id)}
            {itemMap}
            showComplexRecipes={$featureState.showComplexRecipes}
            showPropertyMacros={$featureState.showPropertyMacros}
            hasError={errorPanelIds.has(group.id)}
            onTogglePanel={(id) => store.togglePanel(id)}
            onMoveUp={(idx) => store.moveResultGroupUp(idx)}
            onMoveDown={(idx) => store.moveResultGroupDown(idx)}
            onRemoveGroup={(idx) => store.removeResultGroup(idx)}
            onUpdateGroupName={handleUpdateResultGroupName}
            onAddResult={(gi) => store.addResultRow(gi)}
            onRemoveResult={(gi, ri) => store.removeResultRow(gi, ri)}
            onDropResult={(gi, ri, itemId) => store.assignResultItem(gi, ri, itemId)}
            onUpdateResult={handleUpdateResult}
          />
        {/each}
      </section>

      <!-- Result Selection Provider (mapped mode / outcome routing) -->
      <ResultSelectionProvider
        featureState={$featureState}
        isVariable={$draft.isVariable}
        {ingredientSets}
        {resultGroups}
        resultSelection={$draft.resultSelection}
        outcomeRouting={$activeContainers?.outcomeRouting || {}}
        onUpdateOutcomeRouting={handleUpdateOutcomeRouting}
        onUpdateIngredientSetMapping={handleUpdateIngredientSetMapping}
        onUpdateIsVariable={(v) => store.setField('isVariable', v)}
        onUpdateResultSelection={store.setResultSelection}
      />
    </main>

    <!-- Item Picker Sidebar -->
    <ItemPickerGrid
      items={$pickerItems}
      searchTerm={$pickerSearch}
      onSearch={(term) => store.setPickerSearch(term)}
    />
  </div>

  <!-- Footer -->
  <footer class="editor-footer">
    <button type="button" class="cancel-btn" onclick={() => store.cancel()}>
      {localize('FABRICATE.Editor.Footer.Cancel')}
    </button>
    <button type="button" class="save-btn" onclick={handleSave} disabled={$validationErrors.length > 0}>
      {localize('FABRICATE.Editor.Footer.Save')}
    </button>
  </footer>
</div>

  <style>
  .fabricate-recipe-editor {
    --fab-editor-surface: var(--fab-overlay-dark-16);
    --fab-editor-surface-strong: var(--fab-overlay-dark-24);
    --fab-editor-surface-soft: var(--fab-overlay-light-05);
    --fab-editor-border: var(--fab-overlay-light-14);
    --fab-editor-border-strong: var(--fab-overlay-light-24);
    --fab-editor-border-danger: var(--fab-danger-border);
    --fab-editor-text: var(--fab-text);
    --fab-editor-muted: var(--fab-text-muted);
    --fab-editor-muted-strong: var(--fab-text-secondary);
    --fab-editor-placeholder: var(--fab-text-disabled);
    --fab-editor-input-bg: var(--fab-overlay-light-04);
    --fab-editor-input-bg-hover: var(--fab-overlay-light-07);
    --fab-editor-input-bg-active: var(--fab-overlay-light-10);
    --fab-editor-menu-bg: var(--fab-bg-3);
    --fab-editor-menu-selected: var(--fab-info-strong);
    --fab-editor-accent: var(--fab-info);
    --fab-editor-accent-soft: var(--fab-info-soft);
    --fab-editor-danger: var(--fab-danger-text);
    --fab-editor-danger-soft: var(--fab-danger-soft);
    --fab-editor-shadow: 0 10px 24px var(--fab-overlay-dark-18);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--fab-editor-text);
    background: var(--fab-overlay-dark-20);
  }

  .editor-header {
    padding: 12px 18px;
    border-bottom: 1px solid var(--fab-editor-border);
    flex-shrink: 0;
    background: var(--fab-overlay-dark-14);
  }

  .editor-header h2 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
  }

  .editor-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .editor-main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .basic-info {
    margin-bottom: 0;
  }

  .basic-info-layout {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .recipe-image-column {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .recipe-image-lock-hint {
    max-width: 190px;
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--fab-editor-muted);
  }

  .basic-info-layout .info-grid {
    flex: 1;
    min-width: 0;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .full-width {
    grid-column: 1 / -1;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-row label {
    font-weight: bold;
    font-size: 0.9rem;
    color: var(--fab-editor-muted-strong);
  }

  .field-row input,
  .field-row select,
  .field-row textarea {
    width: 100%;
    box-sizing: border-box;
  }

  .editor-panel-surface {
    background: var(--fab-editor-surface);
    border: 1px solid var(--fab-editor-border);
    border-radius: 12px;
    padding: 14px;
    box-shadow: var(--fab-editor-shadow);
  }

  .flags-section {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 0;
    padding: 12px 14px;
  }

  .availability-field {
    flex: 1 1 220px;
    min-width: min(100%, 240px);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--fab-editor-muted-strong);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--fab-overlay-light-08);
  }

  .section-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .ingredient-sets-section,
  .result-groups-section {
    margin-bottom: 0;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--fab-editor-border);
    flex-shrink: 0;
    background: var(--fab-overlay-dark-18);
  }

  .save-btn {
    font-weight: bold;
    background: var(--fab-info-strong);
    border-color: var(--fab-blue-border);
    color: var(--fab-text);
  }

  .save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--fab-editor-surface-strong);
    border-color: var(--fab-editor-border);
    color: var(--fab-editor-muted);
  }

  .field-error {
    border-color: var(--fab-editor-border-danger) !important;
    box-shadow: 0 0 0 1px var(--fab-editor-border-danger), 0 0 0 4px var(--fab-danger-soft);
  }

  .inline-error {
    color: var(--fab-editor-danger);
    font-size: 0.8rem;
    margin-top: 2px;
  }

  @media (max-width: 1100px) {
    .editor-layout {
      flex-direction: column;
    }
  }

  @media (max-width: 780px) {
    .editor-main {
      padding: 12px;
    }

    .editor-panel-surface {
      padding: 12px;
    }

    .basic-info-layout {
      flex-direction: column;
      align-items: center;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }

    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
