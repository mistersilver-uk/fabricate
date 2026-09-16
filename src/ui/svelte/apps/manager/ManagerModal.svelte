<!--
  The manager's ONE modal-dialog chrome (issue 877): every centred, portaled manager dialog renders
  through it, so "modal dialog" has a single implementation rather than one per feature. It owns the
  chrome only — the portal, the fixed centring and panel surface, the title/subtitle heading, the
  round close control and the right-aligned footer rail. Everything between header and footer is the
  caller's `body` snippet, which keeps its own style scope, and `rootAttributes` lets a caller keep
  its own stable automation hook on the dialog root without this component knowing the feature.
-->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import IconButton from '../../components/IconButton.svelte';
  import { resolveOverlayHost } from '../../util/overlayHost.js';

  let {
    open = false,
    title = '',
    subtitle = '',
    closeLabel = 'Close',
    width = '560px',
    rootAttributes = {},
    onClose = () => {},
    body = undefined,
    footer = undefined,
  } = $props();

  // Resolved from the dialog node UPWARDS, never by querying the document for an application root
  // by name (issue 1466): a `document.querySelector` lookup finds the manager window wherever it
  // is, so this chrome opened from another application portaled into a DIFFERENT WINDOW and the
  // `|| document.body` fallback made that silent.
  function getHost(node) {
    return resolveOverlayHost(node, { component: 'ManagerModal' });
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
      use:portal={(node) => getHost(node)}
      use:dismissOnOutsideClick={{ enabled: open, onDismiss: onClose }}
    >
      <div class="manager-modal-header">
        <div class="manager-modal-heading">
          <h3 class="manager-modal-title">{title}</h3>
          {#if subtitle}
            <p class="manager-modal-subtitle manager-muted">{subtitle}</p>
          {/if}
        </div>
        <IconButton data-manager-modal-close="" ariaLabel={closeLabel} onclick={() => onClose()}>
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </IconButton>
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
