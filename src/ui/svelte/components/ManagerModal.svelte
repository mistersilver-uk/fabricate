<!--
  Fabricate's ONE modal-dialog chrome (issue 877), a shared primitive: every centred, portaled
  dialog renders through it, the manager's and the player roll prompt's alike, so "modal dialog" has
  a single implementation rather than one per feature. It owns the
  chrome only — the portal, the fixed centring and panel surface, the title/subtitle heading, the
  close control and the right-aligned footer rail. Everything between header and footer is the
  caller's `body` snippet, which keeps its own style scope, and `rootAttributes` lets a caller keep
  its own stable automation hook on the dialog root without this component knowing the feature.
  It draws ONE frame, the library's banded Modal measured off the prototype: a 60px `--fab-bg-2`
  header band, a padded body and a `--fab-bg-2` footer band (maintainer rulings 2026-09-28).

  Props added for the roll prompt (issue 2021); each default leaves an earlier caller unchanged:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `closeOnOutsideClick` | boolean | `true` | `false` keeps a stray click from dismissing; Escape still calls `onClose`. |
  | `trapFocus` | boolean | `false` | Focus enters on open, Tab cycles inside, the modal owns every key, and focus returns to the opener, or the host while the opener is disabled. |
  | `initialFocus` | selector | `''` | The element `trapFocus` focuses first; the first focusable one when absent. |
  | `footerLayout` | `'end'` \| `'equal'` | `'end'` | `equal` gives every footer child one equal share of the rail. |
  | `onSubmit(event)` | function | none | Wraps body and footer in one form; Enter submits through its first submit button. |
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';
  import IconButton from './IconButton.svelte';
  import { resolveOverlayHost } from '../util/overlayHost.js';

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

  function restoreFocus(opener, host) {
    if (opener?.isConnected && !opener.disabled) {
      opener.focus?.();
      return;
    }
    if (!host?.isConnected) return;
    if (!host.hasAttribute('tabindex')) host.tabIndex = -1;
    host.focus?.();
  }

  function modalFocus(node, enabled) {
    if (!enabled) return {};
    const opener = node.ownerDocument.activeElement;
    const host = getHost(node);
    const first = (initialFocus && node.querySelector(initialFocus)) || focusables(node)[0];
    first?.focus?.();
    return {
      destroy() {
        // A frame later, so an opener the answer's own flow re-enables can take focus back.
        node.ownerDocument.defaultView.requestAnimationFrame(() => restoreFocus(opener, host));
      },
    };
  }

  // A trapped modal owns the keyboard: Foundry's window-level keybindings read only
  // `document.activeElement`. Stopped at the document, so Svelte's delegated handlers still run.
  function ownKeyboard(node, enabled) {
    if (!enabled) return {};
    const doc = node.ownerDocument;
    const stop = (event) => {
      if (node.contains(event.target)) event.stopPropagation();
    };
    doc.addEventListener('keydown', stop);
    return { destroy: () => doc.removeEventListener('keydown', stop) };
  }

  function handleKeydown(event) {
    if (event.isComposing) return;
    // An expanded control inside, such as an open Select, closes its own list first.
    const expanded = event.target?.closest?.('[aria-expanded="true"]');
    if (event.key === 'Escape' && !closeOnOutsideClick && !expanded) {
      // Foundry's `core.dismiss` would otherwise close every framed window.
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
  {#if body}
    <div class="manager-modal-body">{@render body()}</div>
  {/if}

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
      use:ownKeyboard={trapFocus}
      use:modalKeys
    >
      <div class="manager-modal-header">
        <div class="manager-modal-heading">
          <h3 class="manager-modal-title">{title}</h3>
          {#if subtitle}
            <p class="manager-modal-subtitle manager-muted">{subtitle}</p>
          {/if}
        </div>
        <IconButton
          data-manager-modal-close=""
          size={26}
          ariaLabel={closeLabel}
          onclick={() => onClose()}
        >
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

  /* The library's canonical Modal, measured off the prototype (maintainer ruling 2026-09-28). */
  .manager-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    display: flex;
    flex-direction: column;
    width: min(var(--manager-modal-width, 560px), calc(100vw - 48px));
    max-height: min(640px, calc(100vh - 64px));
    overflow: hidden;
    background: var(--fab-bg-1);
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    box-shadow: var(--fab-shadow-lg);
  }

  .manager-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--fab-space-2) + var(--fab-space-2xs));
    padding: var(--fab-space-3) calc(var(--fab-space-3) + var(--fab-space-2xs));
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }

  .manager-modal-heading {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-modal-title {
    margin: 0;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 14px;
    font-weight: 600;
    line-height: normal;
  }

  .manager-modal-subtitle {
    margin: 1px 0 0;
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    font-weight: 500;
    line-height: normal;
  }

  /* Paint only, at (0,3,0): above the family's resting paint and below its hover. */
  .manager-modal :global([data-manager-modal-close]) {
    display: grid;
    place-items: center;
    gap: normal;
    border-radius: 7px;
    color: var(--fab-text-muted);
    background: transparent;
    font-size: 11px;
  }

  .manager-modal-form {
    display: contents;
  }

  .manager-modal-body {
    display: flex;
    flex-direction: column;
    gap: calc(var(--fab-space-3) + var(--fab-space-2xs));
    min-height: 0;
    padding: calc(var(--fab-space-3) + var(--fab-space-2xs)) var(--fab-space-4);
  }

  .manager-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3) var(--fab-space-4) calc(var(--fab-space-3) + var(--fab-space-2xs));
    border-top: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }

  .manager-modal-footer.is-equal > :global(*) {
    flex: 1 1 0;
    min-width: 0;
  }
</style>
