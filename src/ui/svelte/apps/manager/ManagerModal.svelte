<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE modal-dialog chrome (issue 877).

  Every centred, portaled manager dialog — the folder-mapping step and the post-import
  reference report today — renders through this component, so "modal dialog" has a
  single implementation rather than one per feature. It owns the chrome only: the
  portal into `.fabricate-manager`, the fixed centring and panel surface, the compact
  title + subtitle heading, the round close control, and the right-aligned footer rail.
  Everything between the header and the footer is the caller's `body` snippet, which
  keeps its own component's style scope, so a feature's row/list styling stays with
  that feature.

  `rootAttributes` exists so a caller can keep its own stable test/automation hook on
  the dialog root (e.g. `data-import-mapping`, pinned by the Foundry smoke harness)
  without this component knowing anything about that feature.
-->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';

  let {
    open = false,
    title = '',
    subtitle = '',
    closeLabel = 'Close',
    // Any CSS length; the panel still clamps to the viewport.
    width = '560px',
    // Extra attributes for the dialog root (feature-owned automation hooks).
    rootAttributes = {},
    onClose = () => {},
    // Snippets: the scrollable content and the footer's action rail.
    body = undefined,
    footer = undefined,
  } = $props();

  function getHost() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('.fabricate-manager') || document.body;
  }
</script>

{#if open}
  <div class="manager-modal-overlay" data-manager-modal-overlay>
    <div
      class="manager-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={`--manager-modal-width: ${width};`}
      data-manager-modal
      {...rootAttributes}
      use:portal={() => getHost()}
      use:dismissOnOutsideClick={{ enabled: open, onDismiss: onClose }}
    >
      <div class="manager-modal-header">
        <div class="manager-modal-heading">
          <h3 class="manager-modal-title">{title}</h3>
          {#if subtitle}
            <p class="manager-modal-subtitle manager-muted">{subtitle}</p>
          {/if}
        </div>
        <button
          type="button"
          class="manager-icon-button"
          data-manager-modal-close
          aria-label={closeLabel}
          onclick={() => onClose()}
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      {#if body}{@render body()}{/if}

      {#if footer}
        <div class="manager-modal-footer">{@render footer()}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .manager-modal-overlay {
    display: contents;
  }

  .manager-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: min(var(--manager-modal-width, 560px), calc(100vw - 48px));
    max-height: min(640px, calc(100vh - 64px));
    padding: var(--fab-space-4);
    background: var(--fab-bg-1);
    border: 1px solid var(--fab-border-strong);
    border-radius: 12px;
    box-shadow: var(--fab-shadow-lg);
  }

  .manager-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .manager-modal-title {
    margin: 0;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--fab-text);
  }

  .manager-modal-subtitle {
    margin: var(--fab-space-2xs) 0 0;
    font-size: 0.72rem;
  }

  .manager-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--fab-space-2);
  }
</style>
