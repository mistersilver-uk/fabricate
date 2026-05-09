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
    background: var(--fab-danger-surface);
    border: 1px solid var(--fab-editor-border-danger, var(--fab-editor-border-danger));
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 10px;
    box-shadow: 0 10px 22px var(--fab-overlay-dark-18);
  }

  .validation-banner strong {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--fab-editor-danger, var(--fab-editor-danger));
  }

  .validation-error-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .validation-error-list li {
    padding: 3px 0;
    line-height: 1.45;
  }

  .validation-error-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--fab-editor-danger, var(--fab-editor-danger));
    text-decoration: underline;
    text-decoration-color: var(--fab-danger-text);
    cursor: pointer;
    font-size: inherit;
    text-align: left;
  }

  .validation-error-link:hover {
    color: var(--fab-text);
    text-decoration-color: var(--fab-text);
  }
</style>
