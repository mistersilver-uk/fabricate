<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    activeStepIndex = 0,
    totalSteps = 0,
    stepName = '',
    stepDescription = '',
    timeRequirement = null,
    currencyRequirement = null,
    showTimeRequirements = false,
    showCurrencyRequirements = false,
    onPrevStep,
    onNextStep,
    onAddStep,
    onRemoveStep,
    onUpdateStep
  } = $props();

  const timeUnits = ['minutes', 'hours', 'days', 'months', 'years'];
</script>

<div class="step-navigator">
  <div class="step-nav-bar">
    <button type="button" onclick={onPrevStep} disabled={totalSteps <= 1} title={localize('FABRICATE.Editor.Steps.PrevStep')}>
      <i class="fas fa-chevron-left"></i>
    </button>
    <span class="step-label">
      {localize('FABRICATE.Editor.Steps.StepOf', { current: activeStepIndex + 1, total: totalSteps })}
    </span>
    <button type="button" onclick={onNextStep} disabled={totalSteps <= 1} title={localize('FABRICATE.Editor.Steps.NextStep')}>
      <i class="fas fa-chevron-right"></i>
    </button>

    <button type="button" onclick={onAddStep} title={localize('FABRICATE.Editor.Steps.AddStep')}>
      <i class="fas fa-plus"></i>
    </button>
    <button type="button" onclick={onRemoveStep} disabled={totalSteps <= 1} title={localize('FABRICATE.Editor.Steps.RemoveStep')}>
      <i class="fas fa-trash"></i>
    </button>
  </div>

  <div class="step-fields">
    <div class="field-row">
      <label for="fab-step-name">{localize('FABRICATE.Editor.Steps.StepNameLabel')}</label>
      <input
        id="fab-step-name"
        type="text"
        value={stepName}
        oninput={(e) => onUpdateStep?.('name', e.target.value)}
        placeholder={`Step ${activeStepIndex + 1}`}
      />
    </div>
    <div class="field-row">
      <label for="fab-step-description">{localize('FABRICATE.Editor.Steps.StepDescriptionLabel')}</label>
      <textarea
        id="fab-step-description"
        value={stepDescription}
        oninput={(e) => onUpdateStep?.('description', e.target.value)}
        rows="2"
      ></textarea>
    </div>
  </div>

  {#if showTimeRequirements}
    <div class="time-fields">
      <h4>{localize('FABRICATE.Editor.Steps.TimeRequirementTitle')}</h4>
      <div class="time-grid">
        {#each timeUnits as unit}
          <div class="time-field">
            <label for="fab-step-time-{unit}">{localize(`FABRICATE.Editor.Steps.${unit.charAt(0).toUpperCase() + unit.slice(1)}Label`)}</label>
            <input
              id="fab-step-time-{unit}"
              type="number"
              min="0"
              value={timeRequirement?.[unit] || 0}
              oninput={(e) => onUpdateStep?.(`timeRequirement.${unit}`, Number(e.target.value) || 0)}
            />
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if showCurrencyRequirements}
    <div class="currency-fields">
      <h4>{localize('FABRICATE.Editor.Steps.CurrencyRequirementTitle')}</h4>
      <div class="currency-grid">
        <div class="field-row">
          <label for="fab-step-currency-unit">{localize('FABRICATE.Editor.Steps.CurrencyUnitLabel')}</label>
          <input
            id="fab-step-currency-unit"
            type="text"
            value={currencyRequirement?.unit || ''}
            oninput={(e) => onUpdateStep?.('currencyRequirement.unit', e.target.value)}
          />
        </div>
        <div class="field-row">
          <label for="fab-step-currency-amount">{localize('FABRICATE.Editor.Steps.CurrencyAmountLabel')}</label>
          <input
            id="fab-step-currency-amount"
            type="number"
            min="0"
            value={currencyRequirement?.amount || 0}
            oninput={(e) => onUpdateStep?.('currencyRequirement.amount', Number(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .step-navigator {
    margin-bottom: 0;
    padding: 14px;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 12px;
    background: var(--fab-editor-surface, var(--fab-overlay-dark-16));
    box-shadow: 0 14px 32px var(--fab-overlay-dark-20);
  }

  .step-nav-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--fab-overlay-light-08);
  }

  .step-label {
    font-weight: bold;
    flex: 1;
    text-align: center;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .step-nav-bar button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .step-fields {
    margin-bottom: 8px;
  }

  .field-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }

  .field-row label {
    font-weight: bold;
    white-space: nowrap;
    min-width: 80px;
    padding-top: 4px;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .field-row input,
  .field-row textarea {
    flex: 1;
  }

  .time-fields,
  .currency-fields {
    margin-top: 8px;
  }

  .time-fields h4,
  .currency-fields h4 {
    margin: 0 0 6px;
    font-size: 0.9rem;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .time-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }

  .time-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .time-field label {
    font-size: 0.8rem;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .time-field input {
    width: 100%;
  }

  .currency-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  @media (max-width: 860px) {
    .field-row {
      flex-direction: column;
      align-items: stretch;
    }

    .field-row label {
      min-width: 0;
      padding-top: 0;
    }

    .time-grid,
    .currency-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
