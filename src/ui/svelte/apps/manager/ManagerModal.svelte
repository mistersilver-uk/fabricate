<!--
  The manager's ONE modal-dialog chrome (issue 877): every centred, portaled manager dialog renders
  through it, so "modal dialog" has a single implementation rather than one per feature. It owns the
  chrome only — the portal, the fixed centring and panel surface, the title/subtitle heading, the
  round close control and the right-aligned footer rail. Everything between header and footer is the
  caller's `body` snippet, which keeps its own style scope, and `rootAttributes` lets a caller keep
  its own stable automation hook on the dialog root without this component knowing the feature.

  Props added for the roll prompt (issue 2021); each default leaves an earlier caller unchanged:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `closeOnOutsideClick` | boolean | `true` | `false` keeps a stray click from dismissing; Escape still calls `onClose`. |
  | `trapFocus` | boolean | `false` | Focus enters on open, Tab cycles inside, and focus returns to the opener on close. |
  | `initialFocus` | selector | `''` | The element `trapFocus` focuses first; the first focusable one when absent. |
  | `footerLayout` | `'end'` \| `'equal'` | `'end'` | `equal` gives every footer child one equal share of the rail. |
  | `serifTitle` | boolean | `false` | Names the dialog in the serif face. |
  | `onSubmit(event)` | function | none | Wraps body and footer in one form; Enter submits through its first submit button. |
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
    closeOnOutsideClick = true,
    trapFocus = false,
    initialFocus = '',
    footerLayout = 'end',
    serifTitle = false,
    onSubmit = undefined,
  } = $props();

  const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Resolved from the dialog node UPWARDS, never by querying the document for an application root
  // by name (issue 1466): a `document.querySelector` lookup finds the manager window wherever it
  // is, so this chrome opened from another application portaled into a DIFFERENT WINDOW and the
  // `|| document.body` fallback made that silent.
  function getHost(node) {
    return resolveOverlayHost(node, { component: 'ManagerModal' });
  }

  function focusables(node) {
    return [...node.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest('[inert]'));
  }

  function modalFocus(node, enabled) {
    if (!enabled) return {};
    const opener = node.ownerDocument.activeElement;
    const first = (initialFocus && node.querySelector(initialFocus)) || focusables(node)[0];
    first?.focus?.();
    return {
      destroy() {
        if (opener?.isConnected) opener.focus?.();
      },
    };
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && !closeOnOutsideClick) {
      // Stopped here so Foundry's own Escape binding does not also close the window beneath.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !trapFocus) return;
    const inside = focusables(event.currentTarget);
    if (inside.length === 0) return;
    const active = event.currentTarget.ownerDocument.activeElement;
    const edge = event.shiftKey ? inside[0] : inside.at(-1);
    if (active !== edge && inside.includes(active)) return;
    event.preventDefault();
    (event.shiftKey ? inside.at(-1) : inside[0]).focus();
  }

  // A node listener rather than a delegated handler: it runs before Foundry's window-level one.
  function modalKeys(node) {
    node.addEventListener('keydown', handleKeydown);
    return { destroy: () => node.removeEventListener('keydown', handleKeydown) };
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(event);
  }
</script>

{#snippet content()}
  {#if body}{@render body()}{/if}

  {#if footer}
    <div class="manager-modal-footer" class:is-equal={footerLayout === 'equal'}>
      {@render footer()}
    </div>
  {/if}
{/snippet}

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
      use:dismissOnOutsideClick={{ enabled: open && closeOnOutsideClick, onDismiss: onClose }}
      use:modalFocus={trapFocus}
      use:modalKeys
    >
      <div class="manager-modal-header">
        <div class="manager-modal-heading">
          <h3 class="manager-modal-title" class:is-serif={serifTitle}>{title}</h3>
          {#if subtitle}
            <p class="manager-modal-subtitle manager-muted">{subtitle}</p>
          {/if}
        </div>
        <IconButton data-manager-modal-close="" ariaLabel={closeLabel} onclick={() => onClose()}>
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </IconButton>
      </div>

      {#if onSubmit}
        <form class="manager-modal-form" novalidate onsubmit={submit}>{@render content()}</form>
      {:else}
        {@render content()}
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

  .manager-modal-title.is-serif {
    font-family: var(--fab-font-serif);
  }

  .manager-modal-subtitle {
    margin: var(--fab-space-2xs) 0 0;
    font-size: 0.72rem;
  }

  .manager-modal-form {
    display: contents;
  }

  .manager-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--fab-space-2);
  }

  .manager-modal-footer.is-equal > :global(*) {
    flex: 1 1 0;
    min-width: 0;
  }
</style>
