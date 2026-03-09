<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ValidationBanner from './ValidationBanner.svelte';
  import ItemPickerGrid from './ItemPickerGrid.svelte';
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

  // Active step (when multi-step enabled)
  const activeStep = $derived(
    $featureState.showMultiStepRecipes && $draft.steps?.[$activeStepIndex]
      ? $draft.steps[$activeStepIndex]
      : null
  );

  // Active ingredient sets & result groups (either from step or top-level)
  const ingredientSets = $derived($activeContainers?.ingredientSets || []);
  const resultGroups = $derived($activeContainers?.results || []);

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
      <section class="basic-info">
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
                    <option value={cat}>{cat}</option>
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

          <div class="field-row">
            <label for="recipeImg">{localize('FABRICATE.Editor.BasicInfo.ImageLabel')}</label>
            <input
              id="recipeImg"
              type="text"
              value={$draft.img}
              oninput={(e) => store.setField('img', e.target.value)}
              placeholder="icons/svg/item-bag.svg"
            />
          </div>
        </div>
      </section>

      <!-- Flags -->
      <section class="flags-section">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={$draft.enabled}
            onchange={(e) => store.setField('enabled', e.target.checked)}
          />
          {localize('FABRICATE.Editor.Flags.Enabled')}
        </label>
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={$draft.locked}
            onchange={(e) => store.setField('locked', e.target.checked)}
          />
          {localize('FABRICATE.Editor.Flags.Locked')}
        </label>
        {#if $featureState.showComplexRecipes && !$featureState.isMappedMode}
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
      <section class="ingredient-sets-section">
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
          />
        {/each}
      </section>

      <!-- Result Groups -->
      <section class="result-groups-section">
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
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .editor-header {
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border-light, #ccc);
    flex-shrink: 0;
  }

  .editor-header h2 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .editor-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .editor-main {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  .basic-info {
    margin-bottom: 12px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
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
  }

  .field-row input,
  .field-row select,
  .field-row textarea {
    width: 100%;
    box-sizing: border-box;
  }

  .flags-section {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
    padding: 8px;
    border: 1px solid var(--color-border-light, #ddd);
    border-radius: 4px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .section-header h3 {
    margin: 0;
  }

  .ingredient-sets-section,
  .result-groups-section {
    margin-bottom: 12px;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid var(--color-border-light, #ccc);
    flex-shrink: 0;
  }

  .save-btn {
    font-weight: bold;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-error {
    border-color: var(--color-border-error, #dc3545) !important;
    box-shadow: 0 0 0 1px var(--color-border-error, #dc3545);
  }

  .inline-error {
    color: var(--color-text-error, #dc3545);
    font-size: 0.8rem;
    margin-top: 2px;
  }
</style>
