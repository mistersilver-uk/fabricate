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
  import RecipeImagePicker from './RecipeImagePicker.svelte';
  import IngredientSetPanel from './IngredientSetPanel.svelte';
  import ResultGroupPanel from './ResultGroupPanel.svelte';
  import VisibilitySection from './VisibilitySection.svelte';
  import StepNavigator from './StepNavigator.svelte';
  import ResultSelectionProvider from './ResultSelectionProvider.svelte';

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
    systemCategories
  } = store;

  // Build item map for name/image resolution
  const itemMap = $derived(new Map(($pickerItems || []).map(item => [item.id, item])));

  // Resolve system categories for select
  const categories = $derived($systemCategories || []);

  // Resolve non-GM users for visibility
  const nonGMUsers = $derived(services.getNonGMUsers?.() || []);

  // Resolve linked item if any
  const linkedItem = $derived(
    $draft.linkedRecipeItemUuid
      ? services.resolveItem?.($draft.linkedRecipeItemUuid) || null
      : null
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
        <div class="info-layout">
          <div class="info-image-column">
            <RecipeImagePicker
              value={$draft.img}
              onChange={(path) => store.setField('img', path)}
            />
          </div>
          <div class="info-fields-column">
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

            <div class="field-row">
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
        linkedRecipeItemUuid={$draft.linkedRecipeItemUuid}
        {linkedItem}
        {nonGMUsers}
        onUpdateVisibility={(vis) => store.setField('visibility', vis)}
        onClearLinkedItem={() => store.clearLinkedRecipeItem()}
        onSetLinkedItemUuid={(uuid) => store.setLinkedRecipeItemUuid(uuid)}
        onBrowseLinkedItem={() => services.browseLinkedItem?.()}
        onCreateLinkedItem={() => services.createLinkedItem?.()}
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
        outcomeRouting={$activeContainers?.outcomeRouting || {}}
        onUpdateOutcomeRouting={handleUpdateOutcomeRouting}
        onUpdateIngredientSetMapping={handleUpdateIngredientSetMapping}
        onUpdateIsVariable={(v) => store.setField('isVariable', v)}
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
    --fabricate-editor-surface: rgba(0, 0, 0, 0.16);
    --fabricate-editor-surface-strong: rgba(0, 0, 0, 0.24);
    --fabricate-editor-surface-soft: rgba(255, 255, 255, 0.05);
    --fabricate-editor-border: rgba(255, 255, 255, 0.14);
    --fabricate-editor-border-strong: rgba(255, 255, 255, 0.24);
    --fabricate-editor-border-danger: rgba(255, 124, 102, 0.48);
    --fabricate-editor-text: rgba(255, 243, 232, 0.92);
    --fabricate-editor-muted: rgba(255, 229, 210, 0.68);
    --fabricate-editor-muted-strong: rgba(255, 236, 220, 0.82);
    --fabricate-editor-placeholder: rgba(255, 231, 212, 0.42);
    --fabricate-editor-input-bg: rgba(255, 255, 255, 0.04);
    --fabricate-editor-input-bg-hover: rgba(255, 255, 255, 0.07);
    --fabricate-editor-input-bg-active: rgba(255, 255, 255, 0.1);
    --fabricate-editor-menu-bg: #171b26;
    --fabricate-editor-menu-selected: #5a88bb;
    --fabricate-editor-accent: var(--fabricate-primary, #4a90e2);
    --fabricate-editor-accent-soft: rgba(74, 144, 226, 0.22);
    --fabricate-editor-danger: rgba(255, 216, 208, 0.95);
    --fabricate-editor-danger-soft: rgba(220, 53, 69, 0.18);
    --fabricate-editor-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--fabricate-editor-text);
    background: rgba(6, 9, 17, 0.21);
  }

  .editor-header {
    padding: 12px 18px;
    border-bottom: 1px solid var(--fabricate-editor-border);
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.14);
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

  .info-layout {
    display: flex;
    flex-direction: row;
    gap: 14px;
    align-items: flex-start;
  }

  .info-image-column {
    flex-shrink: 0;
  }

  .info-fields-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-row label {
    font-weight: bold;
    font-size: 0.9rem;
    color: var(--fabricate-editor-muted-strong);
  }

  .field-row input,
  .field-row select,
  .field-row textarea {
    width: 100%;
    box-sizing: border-box;
  }

  .editor-panel-surface {
    background: var(--fabricate-editor-surface);
    border: 1px solid var(--fabricate-editor-border);
    border-radius: 12px;
    padding: 14px;
    box-shadow: var(--fabricate-editor-shadow);
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
    color: var(--fabricate-editor-muted-strong);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
    border-top: 1px solid var(--fabricate-editor-border);
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.18);
  }

  .save-btn {
    font-weight: bold;
    background: rgba(62, 108, 175, 0.93);
    border-color: rgba(148, 190, 255, 0.34);
    color: #fff;
  }

  .save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--fabricate-editor-surface-strong);
    border-color: var(--fabricate-editor-border);
    color: var(--fabricate-editor-muted);
  }

  .field-error {
    border-color: var(--fabricate-editor-border-danger) !important;
    box-shadow: 0 0 0 1px var(--fabricate-editor-border-danger), 0 0 0 4px rgba(220, 53, 69, 0.12);
  }

  .inline-error {
    color: var(--fabricate-editor-danger);
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

    .info-layout {
      flex-direction: column;
    }

    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
