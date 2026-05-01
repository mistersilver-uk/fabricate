<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    validationErrors = [],
    validationState = null,
    saveError = null,
    focusValidationError
  } = $props();
</script>

{#if validationErrors.length > 0}
  <div class="environment-validation-summary" role="alert" aria-labelledby="environment-validation-summary-title">
    <i class="fas fa-exclamation-triangle"></i>
    <div>
      <h5 id="environment-validation-summary-title">{validationState?.summary || localize('FABRICATE.Admin.Environments.ValidationSummary', { count: validationErrors.length })}</h5>
      <ul>
        {#each validationErrors as error (error.id)}
          <li>
            {#if error.fieldSelector}
              <button type="button" class="environment-validation-link" onclick={() => focusValidationError(error)}>
                {error.message}
              </button>
            {:else}
              <span>{error.message}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
{:else if saveError}
  <div class="environment-save-error" role="alert">
    <i class="fas fa-exclamation-triangle"></i>
    <span>{saveError}</span>
  </div>
{/if}
