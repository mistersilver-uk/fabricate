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
    background: rgba(82, 22, 31, 0.94);
    border: 1px solid var(--fabricate-editor-border-danger, rgba(255, 124, 102, 0.48));
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 10px;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(8px);
  }

  .validation-banner strong {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--fabricate-editor-danger, rgba(255, 216, 208, 0.95));
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
    color: var(--fabricate-editor-danger, rgba(255, 216, 208, 0.95));
    text-decoration: underline;
    text-decoration-color: rgba(255, 216, 208, 0.56);
    cursor: pointer;
    font-size: inherit;
    text-align: left;
  }

  .validation-error-link:hover {
    color: #fff;
    text-decoration-color: #fff;
  }
</style>
