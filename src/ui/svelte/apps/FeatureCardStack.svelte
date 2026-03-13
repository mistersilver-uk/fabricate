<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import FeatureCard from './FeatureCard.svelte';
  import EssenceSourceSelector from '../components/EssenceSourceSelector.svelte';
  import IconPicker from '../components/IconPicker.svelte';
  import TokenList from './TokenList.svelte';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../util/essenceIcons.js';

  let { selectedSystem, store, services = null } = $props();

  // Essence add form state
  let essenceName = $state('');
  let essenceDesc = $state('');
  let essenceIcon = $state(DEFAULT_ESSENCE_ICON);
  let essenceSourceItem = $state('');
  let editingEssenceId = $state(null);
  let editingEssenceName = $state('');
  let editingEssenceDesc = $state('');
  let editingEssenceIcon = $state(DEFAULT_ESSENCE_ICON);
  let lastSelectedSystemId = $state(null);

  function resetAddEssenceForm() {
    essenceName = '';
    essenceDesc = '';
    essenceIcon = DEFAULT_ESSENCE_ICON;
    essenceSourceItem = '';
  }

  function cancelEssenceEdit() {
    editingEssenceId = null;
    editingEssenceName = '';
    editingEssenceDesc = '';
    editingEssenceIcon = DEFAULT_ESSENCE_ICON;
  }

  async function handleAddEssence() {
    if (!essenceName.trim()) return;
    const didAdd = await store.addEssence(
      essenceName.trim(),
      essenceDesc,
      essenceIcon,
      essenceSourceItem || null
    );
    if (didAdd) {
      resetAddEssenceForm();
    }
  }

  function beginEssenceEdit(definition) {
    editingEssenceId = definition.id;
    editingEssenceName = definition.name || '';
    editingEssenceDesc = definition.description || '';
    editingEssenceIcon = normalizeEssenceIcon(definition.icon);
  }

  async function handleSaveEssence(definition) {
    if (!editingEssenceName.trim()) return;
    const didSave = await store.updateEssence(definition.id, {
      name: editingEssenceName.trim(),
      description: editingEssenceDesc,
      icon: editingEssenceIcon
    });

    if (didSave) {
      cancelEssenceEdit();
    }
  }

  // Crafting check state
  // svelte-ignore state_referenced_locally
  let checkMode = $state(selectedSystem?.craftingCheck?.mode ?? 'passFail');
  // svelte-ignore state_referenced_locally
  let checkMacroUuid = $state(selectedSystem?.craftingCheck?.macroUuid ?? '');
  // svelte-ignore state_referenced_locally
  let checkOutcomes = $state(selectedSystem?.craftingCheck?.outcomesText ?? '');

  $effect(() => {
    checkMode = selectedSystem?.craftingCheck?.mode ?? 'passFail';
    checkMacroUuid = selectedSystem?.craftingCheck?.macroUuid ?? '';
    checkOutcomes = selectedSystem?.craftingCheck?.outcomesText ?? '';
  });

  // Currency config state
  let currencyProvider = $state('macro');
  let currencyAdapter = $state('');
  let checkCurrencyMacro = $state('');
  let decrementCurrencyMacro = $state('');
  let formatCurrencyMacro = $state('');

  $effect(() => {
    const req = selectedSystem?.requirements?.currency;
    currencyProvider = req?.provider || 'macro';
    currencyAdapter = req?.systemAdapter || '';
    checkCurrencyMacro = req?.checkCurrencyMacroUuid || '';
    decrementCurrencyMacro = req?.decrementCurrencyMacroUuid || '';
    formatCurrencyMacro = req?.formatCurrencyMacroUuid || '';
  });

  // Visibility config state
  let visListMode = $state('global');
  let visKnowledgeMode = $state('itemOrLearned');
  let visConsumeOnLearn = $state(true);

  $effect(() => {
    const vis = selectedSystem?.recipeVisibility || {};
    visListMode = vis.listMode || 'global';
    visKnowledgeMode = vis.knowledge?.mode || 'itemOrLearned';
    visConsumeOnLearn = vis.knowledge?.learn?.consumeOnLearn !== false;
  });

  $effect(() => {
    const currentSystemId = selectedSystem?.id || null;
    if (currentSystemId === lastSelectedSystemId) return;
    lastSelectedSystemId = currentSystemId;
    resetAddEssenceForm();
    cancelEssenceEdit();
  });

  function getManagedItemOption(itemId) {
    if (!itemId) return null;
    return selectedSystem?.managedItemOptions?.find(option => option.id === itemId) || null;
  }

  async function importDroppedManagedItem(data) {
    return services?.importSingleManagedItemFromDrop?.(data) ?? null;
  }

  function handleCreateEssenceSourceSelect(itemId) {
    essenceSourceItem = itemId || '';
  }

  async function handleCreateEssenceSourceDrop(data) {
    const item = await importDroppedManagedItem(data);
    if (item?.id) {
      essenceSourceItem = item.id;
    }
  }

  async function handleEssenceSourceDrop(definition, data) {
    const item = await importDroppedManagedItem(data);
    if (!item?.id) return;
    await store.updateEssence(definition.id, { sourceItemUuid: item.id });
  }

  async function handleEssenceSourceSelect(definition, itemId) {
    await store.updateEssence(definition.id, { sourceItemUuid: itemId || null });
  }

  async function handleEssenceSourceClear(definition) {
    await store.updateEssence(definition.id, { sourceItemUuid: null });
  }
</script>

<div class="feature-card-stack">
  <!-- Categories -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.Categories.Title')}
    hint={localize('FABRICATE.Admin.Features.Categories.Hint')}
    enabled={selectedSystem.features.recipeCategories}
    onToggle={(v) => store.toggleFeature('categories', v)}
  >
    <div class="token-list">
      <span class="token token-locked">
        {localize('FABRICATE.Common.General')}
        <i class="fas fa-lock" aria-hidden="true"></i>
      </span>
    </div>
    <TokenList
      items={selectedSystem.categories}
      placeholder={localize('FABRICATE.Admin.Features.Categories.Placeholder')}
      emptyText={localize('FABRICATE.Admin.Features.Categories.Empty')}
      onAdd={store.addCategory}
      onRemove={store.removeCategory}
    />
  </FeatureCard>

  <!-- Item Tags -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.ItemTags.Title')}
    hint={localize('FABRICATE.Admin.Features.ItemTags.Hint')}
    enabled={selectedSystem.features.itemTags}
    onToggle={(v) => store.toggleFeature('itemTags', v)}
  >
    <TokenList
      items={selectedSystem.itemTags}
      placeholder={localize('FABRICATE.Admin.Features.ItemTags.Placeholder')}
      emptyText={localize('FABRICATE.Admin.Features.ItemTags.Empty')}
      onAdd={store.addTag}
      onRemove={store.removeTag}
    />
  </FeatureCard>

  <!-- Essences -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.Essences.Title')}
    hint={localize('FABRICATE.Admin.Features.Essences.Hint')}
    enabled={selectedSystem.features.essences}
    onToggle={(v) => store.toggleFeature('essences', v)}
  >
    <div class="essence-creation-form">
      <EssenceSourceSelector
        value={getManagedItemOption(essenceSourceItem)}
        items={selectedSystem.managedItemOptions}
        onDrop={handleCreateEssenceSourceDrop}
        onSelect={handleCreateEssenceSourceSelect}
        onClear={() => { essenceSourceItem = ''; }}
      />

      <div class="essence-creation-fields">
        <div class="panel-toolbar compact essence-creation-toolbar">
          <input
            type="text"
            bind:value={essenceName}
            placeholder={localize('FABRICATE.Admin.Features.Essences.NamePlaceholder')}
          />
          <IconPicker
            value={essenceIcon}
            buttonTitle={localize('FABRICATE.Admin.Features.Essences.ChooseIcon')}
            onChange={(iconClass) => { essenceIcon = iconClass; }}
          />
        </div>

        <div class="essence-creation-description-row">
          <input
            type="text"
            bind:value={essenceDesc}
            placeholder={localize('FABRICATE.Admin.Features.Essences.DescPlaceholder')}
          />
          {#if getManagedItemOption(essenceSourceItem)}
            <p class="hint">
              {localize('FABRICATE.Admin.Features.Essences.SourceItem')} {getManagedItemOption(essenceSourceItem).name}
            </p>
          {/if}
        </div>

        <div class="essence-creation-actions">
          <button
            type="button"
            class="essence-create-submit"
            onclick={handleAddEssence}
            disabled={!essenceName.trim()}
          >
            <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Features.Essences.Add')}
          </button>
        </div>
      </div>
    </div>

    <div class="essence-definition-list">
      {#each selectedSystem.essenceDefinitions as def}
        <article class="essence-definition-row">
          <EssenceSourceSelector
            value={def.associatedItem}
            items={selectedSystem.managedItemOptions}
            onDrop={(data) => handleEssenceSourceDrop(def, data)}
            onSelect={(itemId) => handleEssenceSourceSelect(def, itemId)}
            onClear={() => handleEssenceSourceClear(def)}
          />

          <div class="essence-definition-meta">
            <div class="essence-definition-summary">
              {#if editingEssenceId === def.id}
                <IconPicker
                  value={editingEssenceIcon}
                  iconOnly={true}
                  buttonTitle={localize('FABRICATE.Admin.Features.Essences.ChooseIcon')}
                  onChange={(iconClass) => { editingEssenceIcon = iconClass; }}
                />
              {:else}
                <span class="essence-definition-icon" aria-hidden="true">
                  <i class={normalizeEssenceIcon(def.icon || DEFAULT_ESSENCE_ICON)}></i>
                </span>
              {/if}
              <div class="essence-definition-copy">
                {#if editingEssenceId === def.id}
                  <input
                    type="text"
                    bind:value={editingEssenceName}
                    placeholder={localize('FABRICATE.Admin.Features.Essences.NamePlaceholder')}
                  />
                {:else}
                  <strong>{def.name}</strong>
                  {#if def.description}
                    <p class="hint">{def.description}</p>
                  {/if}
                  {#if def.associatedItemName}
                    <p class="hint">
                      {localize('FABRICATE.Admin.Features.Essences.SourceItem')} {def.associatedItemName}
                    </p>
                  {/if}
                {/if}
              </div>
            </div>

            {#if editingEssenceId === def.id}
              <div class="essence-definition-editor">
                <textarea
                  bind:value={editingEssenceDesc}
                  rows="3"
                  placeholder={localize('FABRICATE.Admin.Features.Essences.DescPlaceholder')}
                ></textarea>
                {#if def.associatedItemName}
                  <p class="hint">
                    {localize('FABRICATE.Admin.Features.Essences.SourceItem')} {def.associatedItemName}
                  </p>
                {/if}
              </div>
            {/if}
          </div>
          <div class="essence-definition-actions">
            {#if editingEssenceId === def.id}
              <button
                type="button"
                onclick={() => handleSaveEssence(def)}
                title={localize('FABRICATE.Admin.Features.Essences.Save')}
                disabled={!editingEssenceName.trim()}
              >
                <i class="fas fa-save"></i>
              </button>
              <button
                type="button"
                onclick={cancelEssenceEdit}
                title={localize('FABRICATE.Admin.Features.Essences.Cancel')}
              >
                <i class="fas fa-times"></i>
              </button>
            {:else}
              <button
                type="button"
                onclick={() => beginEssenceEdit(def)}
                title={localize('FABRICATE.Admin.Features.Essences.Edit')}
              >
                <i class="fas fa-pen"></i>
              </button>
            {/if}
            <button
              type="button"
              onclick={() => store.removeEssence(def.id)}
              title={localize('FABRICATE.Admin.Features.Essences.Remove')}
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </article>
      {:else}
        <p class="hint">{localize('FABRICATE.Admin.Features.Essences.Empty')}</p>
      {/each}
    </div>
  </FeatureCard>

  <!-- Complex Recipes -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.ComplexRecipes.Title')}
    hint={localize('FABRICATE.Admin.Features.ComplexRecipes.Hint')}
    enabled={selectedSystem.features.complexRecipes}
    onToggle={(v) => store.toggleFeature('complexRecipes', v)}
  />

  <!-- Multi-Step Recipes -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.MultiStepRecipes.Title')}
    hint={localize('FABRICATE.Admin.Features.MultiStepRecipes.Hint')}
    enabled={selectedSystem.features.multiStepRecipes}
    onToggle={(v) => store.toggleFeature('multiStepRecipes', v)}
  />

  <!-- Time Requirements -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.TimeRequirements.Title')}
    hint={localize('FABRICATE.Admin.Features.TimeRequirements.Hint')}
    enabled={selectedSystem.requirements?.time?.enabled === true}
    onToggle={(v) => store.toggleRequirement('time', v)}
  />

  <!-- Currency Requirements -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.CurrencyRequirements.Title')}
    hint={localize('FABRICATE.Admin.Features.CurrencyRequirements.Hint')}
    enabled={selectedSystem.requirements?.currency?.enabled === true}
    onToggle={(v) => store.toggleRequirement('currency', v)}
  >
    <div class="panel-toolbar compact">
      <select bind:value={currencyProvider}>
        <option value="macro">{localize('FABRICATE.Admin.Features.CurrencyRequirements.MacroProvider')}</option>
        <option value="system">{localize('FABRICATE.Admin.Features.CurrencyRequirements.SystemAdapter')}</option>
      </select>
      <select bind:value={currencyAdapter}>
        <option value="">{localize('FABRICATE.Admin.Features.CurrencyRequirements.SelectAdapter')}</option>
        <option value="dnd5e">dnd5e</option>
        <option value="pf2e">pf2e</option>
      </select>
    </div>
    <div class="panel-toolbar compact">
      <select bind:value={checkCurrencyMacro}>
        <option value="">{localize('FABRICATE.Admin.Features.CurrencyRequirements.CheckMacro')}</option>
        {#each selectedSystem.availableScriptMacros as macro}
          <option value={macro.uuid}>{macro.name}</option>
        {/each}
      </select>
      <select bind:value={decrementCurrencyMacro}>
        <option value="">{localize('FABRICATE.Admin.Features.CurrencyRequirements.DecrementMacro')}</option>
        {#each selectedSystem.availableScriptMacros as macro}
          <option value={macro.uuid}>{macro.name}</option>
        {/each}
      </select>
      <select bind:value={formatCurrencyMacro}>
        <option value="">{localize('FABRICATE.Admin.Features.CurrencyRequirements.FormatMacro')}</option>
        {#each selectedSystem.availableScriptMacros as macro}
          <option value={macro.uuid}>{macro.name}</option>
        {/each}
      </select>
      <button type="button" onclick={() => store.saveCurrencyConfig(currencyProvider, currencyAdapter, checkCurrencyMacro, decrementCurrencyMacro, formatCurrencyMacro)}>
        <i class="fas fa-save"></i> {localize('FABRICATE.Admin.Features.CurrencyRequirements.SaveConfig')}
      </button>
    </div>
  </FeatureCard>

  <!-- Property Macros -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.PropertyMacros.Title')}
    hint={localize('FABRICATE.Admin.Features.PropertyMacros.Hint')}
    enabled={selectedSystem.features.propertyMacros}
    onToggle={(v) => store.toggleFeature('propertyMacros', v)}
  />

  <!-- Crafting Checks -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.CraftingChecks.Title')}
    hint={localize('FABRICATE.Admin.Features.CraftingChecks.Hint')}
    enabled={selectedSystem.features.craftingChecks}
    onToggle={(v) => store.toggleFeature('craftingChecks', v)}
  >
    <div class="panel-toolbar compact">
      <select bind:value={checkMode}>
        <option value="passFail">{localize('FABRICATE.Admin.Features.CraftingChecks.PassFail')}</option>
        <option value="namedOutcomes">{localize('FABRICATE.Admin.Features.CraftingChecks.NamedOutcomes')}</option>
      </select>
      <select bind:value={checkMacroUuid}>
        <option value="">{localize('FABRICATE.Admin.Features.CraftingChecks.NoCheckMacro')}</option>
        {#each selectedSystem.availableScriptMacros as macro}
          <option value={macro.uuid}>{macro.name}</option>
        {/each}
      </select>
      <input type="text" bind:value={checkOutcomes} placeholder={localize('FABRICATE.Admin.Features.CraftingChecks.OutcomesPlaceholder')} />
      <button type="button" onclick={() => store.saveCraftingCheckConfig(checkMode, checkMacroUuid, checkOutcomes)}>
        <i class="fas fa-save"></i> {localize('FABRICATE.Admin.Features.CraftingChecks.SaveConfig')}
      </button>
    </div>
  </FeatureCard>

  <!-- Outcome Routing -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.OutcomeRouting.Title')}
    hint={localize('FABRICATE.Admin.Features.OutcomeRouting.Hint')}
    enabled={selectedSystem.features.outcomeRouting}
    onToggle={(v) => store.toggleFeature('outcomeRouting', v)}
  />

  <!-- Effect Transfer -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.EffectTransfer.Title')}
    hint={localize('FABRICATE.Admin.Features.EffectTransfer.Hint')}
    enabled={selectedSystem.features.effectTransfer}
    onToggle={(v) => store.toggleFeature('effectTransfer', v)}
  />

  <!-- Recipe Visibility -->
  <FeatureCard
    title={localize('FABRICATE.Admin.Features.RecipeVisibility.Title')}
    hint={localize('FABRICATE.Admin.Features.RecipeVisibility.Hint')}
    showToggle={false}
  >
    <div class="panel-toolbar compact">
      <select bind:value={visListMode}>
        <option value="global">{localize('FABRICATE.Admin.Features.RecipeVisibility.Global')}</option>
        <option value="player">{localize('FABRICATE.Admin.Features.RecipeVisibility.PlayerSpecific')}</option>
        <option value="knowledge">{localize('FABRICATE.Admin.Features.RecipeVisibility.KnowledgeBased')}</option>
      </select>
      <button type="button" onclick={() => store.saveVisibilityConfig(visListMode, visKnowledgeMode, visConsumeOnLearn)}>
        <i class="fas fa-save"></i> {localize('FABRICATE.Admin.Features.RecipeVisibility.SaveConfig')}
      </button>
    </div>
    {#if visListMode === 'player'}
      <p class="hint">{localize('FABRICATE.Admin.Features.RecipeVisibility.PlayerNote')}</p>
    {/if}
    {#if visListMode === 'knowledge'}
      <div class="panel-toolbar compact">
        <select bind:value={visKnowledgeMode}>
          <option value="item">{localize('FABRICATE.Admin.Features.RecipeVisibility.KnowledgeByItem')}</option>
          <option value="learned">{localize('FABRICATE.Admin.Features.RecipeVisibility.KnowledgeByLearning')}</option>
          <option value="itemOrLearned">{localize('FABRICATE.Admin.Features.RecipeVisibility.KnowledgeByEither')}</option>
        </select>
      </div>
      {#if visKnowledgeMode !== 'item'}
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={visConsumeOnLearn} />
          {localize('FABRICATE.Admin.Features.RecipeVisibility.ConsumeOnLearn')}
        </label>
      {/if}
    {/if}
  </FeatureCard>
</div>
