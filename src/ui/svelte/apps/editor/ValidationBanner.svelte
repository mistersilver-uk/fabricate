<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { errors = [], onScrollToError } = $props();

  function handleClick(error) {
    onScrollToError?.(error);
  }
</script>

{#if errors.length > 0}
  <div class="validation-banner" role="alert" aria-live="polite">
    <strong><i class="fas fa-exclamation-triangle"></i> {localize('FABRICATE.Editor.Validation.FixBeforeSaving')}</strong>
    <ul class="validation-error-list">
      {#each errors as error}
        <li>
          {#if error.panelId || error.fieldSelector}
            <button type="button" class="validation-error-link" onclick={() => handleClick(error)}>
              {error.message}
            </button>
          {:else}
            <span>{error.message}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .validation-banner {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--color-bg-error, #f8d7da);
    border: 1px solid var(--color-border-error, #f5c6cb);
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 8px;
  }

  .validation-banner strong {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    color: var(--color-text-error, #721c24);
  }

  .validation-error-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .validation-error-list li {
    padding: 2px 0;
  }

  .validation-error-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-text-error, #721c24);
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
  }

  .validation-error-link:hover {
    text-decoration: none;
  }
</style>
