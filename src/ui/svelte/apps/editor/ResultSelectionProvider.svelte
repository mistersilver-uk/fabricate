<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    featureState = {},
    isVariable = false,
    ingredientSets = [],
    resultGroups = [],
    outcomeRouting = {},
    onUpdateOutcomeRouting,
    onUpdateIngredientSetMapping,
    onUpdateIsVariable
  } = $props();

  const showProvider = $derived(
    featureState.showComplexRecipes &&
    (featureState.isMappedMode || isVariable || featureState.showOutcomeRouting)
  );

  const outcomes = $derived(featureState.craftingCheckOutcomes || []);
</script>

{#if showProvider}
  <div class="result-selection-section">
    <h4>{localize('FABRICATE.Editor.ResultSelection.MappedResultGroupLabel')}</h4>

    {#if featureState.showComplexRecipes && !featureState.isMappedMode}
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={isVariable}
          onchange={(e) => onUpdateIsVariable?.(e.target.checked)}
        />
        {localize('FABRICATE.Editor.Flags.VariableOutput')}
      </label>
    {/if}

    {#if featureState.isMappedMode}
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

    {#if featureState.showOutcomeRouting && featureState.showCraftingChecks && outcomes.length > 0}
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
  .outcome-routing-section {
    margin-top: 8px;
  }

  .outcome-routing-section h5 {
    margin: 0 0 4px;
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
