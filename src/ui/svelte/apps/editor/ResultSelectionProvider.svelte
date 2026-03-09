<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    featureState = {},
    isVariable = false,
    ingredientSets = [],
    resultGroups = [],
    outcomeRouting = {},
    resultSelection = null,
    onUpdateOutcomeRouting,
    onUpdateIngredientSetMapping,
    onUpdateIsVariable,
    onUpdateResultSelection
  } = $props();

  const showProvider = $derived(
    featureState.showComplexRecipes &&
    (featureState.isMappedMode || isVariable || featureState.showOutcomeRouting)
  );

  const outcomes = $derived(featureState.craftingCheckOutcomes || []);

  const currentProvider = $derived(resultSelection?.provider || null);
  const showProviderSelector = $derived(featureState.showComplexRecipes === true);
</script>

{#if showProvider}
  <div class="result-selection-section">
    <h4>{localize('FABRICATE.Editor.ResultSelection.MappedResultGroupLabel')}</h4>

    {#if showProviderSelector}
      <div class="provider-selector">
        <label for="result-provider-select">{localize('FABRICATE.Editor.ResultSelection.ProviderLabel')}</label>
        <select
          id="result-provider-select"
          value={currentProvider || ''}
          onchange={(e) => onUpdateResultSelection?.(e.target.value || null, {})}
        >
          <option value="">{localize('FABRICATE.Editor.ResultSelection.DefaultFirstGroup')}</option>
          <option value="ingredientSet">{localize('FABRICATE.Editor.ResultSelection.ProviderIngredientSet')}</option>
          <option value="macroOutcome">{localize('FABRICATE.Editor.ResultSelection.ProviderMacroOutcome')}</option>
          <option value="rollTableOutcome">{localize('FABRICATE.Editor.ResultSelection.ProviderRollTable')}</option>
        </select>
      </div>
    {/if}

    {#if !currentProvider && featureState.showComplexRecipes && !featureState.isMappedMode}
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={isVariable}
          onchange={(e) => onUpdateIsVariable?.(e.target.checked)}
        />
        {localize('FABRICATE.Editor.Flags.VariableOutput')}
      </label>
    {/if}

    {#if featureState.isMappedMode && currentProvider !== 'rollTableOutcome' && currentProvider !== 'macroOutcome'}
      <div class="mapping-section">
        <p class="hint">{localize('FABRICATE.Editor.ResultSelection.ResultGroupForSet')}</p>
        {#each ingredientSets as set, setIdx}
          <div class="mapping-row">
            <span class="mapping-label">{set.name}</span>
            <select
              value={set.resultGroupId || ''}
              onchange={(e) => onUpdateIngredientSetMapping?.(setIdx, 'resultGroupId', e.target.value || null)}
            >
              <option value="">{localize('FABRICATE.Editor.ResultSelection.DefaultFirstGroup')}</option>
              {#each resultGroups as group}
                <option value={group.id}>{group.name}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    {/if}

    {#if featureState.showOutcomeRouting && featureState.showCraftingChecks && outcomes.length > 0 && currentProvider !== 'rollTableOutcome'}
      <div class="outcome-routing-section">
        <h5>{localize('FABRICATE.Editor.OutcomeRouting.SectionTitle')}</h5>
        <p class="hint">{localize('FABRICATE.Editor.OutcomeRouting.Hint')}</p>
        {#each outcomes as outcome}
          <div class="mapping-row">
            <span class="mapping-label">{outcome}</span>
            <select
              value={outcomeRouting?.[outcome] || ''}
              onchange={(e) => onUpdateOutcomeRouting?.(outcome, e.target.value || null)}
            >
              <option value="">{localize('FABRICATE.Editor.ResultSelection.DefaultFirstGroup')}</option>
              {#each resultGroups as group}
                <option value={group.id}>{group.name}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    {/if}

    {#if currentProvider === 'rollTableOutcome'}
      <div class="roll-table-section">
        <label for="roll-table-uuid-input">{localize('FABRICATE.Editor.ResultSelection.RollTableUuid')}</label>
        <input
          id="roll-table-uuid-input"
          type="text"
          name="rollTableUuid"
          value={resultSelection?.rollTableUuid || ''}
          placeholder="RollTable.xxxxxxxxxxxx"
          oninput={(e) => onUpdateResultSelection?.('rollTableOutcome', { rollTableUuid: e.target.value || null })}
        />
        <p class="hint">{localize('FABRICATE.Editor.ResultSelection.RollTableHint')}</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .result-selection-section {
    margin: 12px 0;
    padding: 8px;
    border: 1px solid var(--color-border-light, #ddd);
    border-radius: 4px;
  }

  .result-selection-section h4 {
    margin: 0 0 8px;
  }

  .provider-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .provider-selector select {
    flex: 1;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    margin-bottom: 8px;
  }

  .hint {
    color: var(--color-text-light-heading, #888);
    font-style: italic;
    font-size: 0.9rem;
    margin: 4px 0 8px;
  }

  .mapping-section,
  .outcome-routing-section,
  .roll-table-section {
    margin-top: 8px;
  }

  .outcome-routing-section h5 {
    margin: 0 0 4px;
  }

  .roll-table-section label {
    display: block;
    font-weight: bold;
    margin-bottom: 4px;
  }

  .roll-table-section input[type="text"] {
    width: 100%;
    box-sizing: border-box;
  }

  .mapping-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .mapping-label {
    font-weight: bold;
    min-width: 100px;
  }

  .mapping-row select {
    flex: 1;
  }
</style>
