<!--
  Fabricate's ONE modal-dialog chrome (issue 877), a shared primitive: every centred, portaled
  dialog renders through it, the manager's and the player roll prompt's alike, so "modal dialog" has
  a single implementation rather than one per feature. It owns the
  chrome only — the portal, the fixed centring and panel surface, the title/subtitle heading, the
  close control and the right-aligned footer rail. Everything between header and footer is the
  caller's `body` snippet, which keeps its own style scope, and `dialogProps` lets a caller keep
  its own stable automation hook on the dialog element without this component knowing the feature.
  It draws ONE frame, the library's banded Modal measured off the prototype: a 60px `--fab-bg-2`
  header band, a padded body and a `--fab-bg-2` footer band (maintainer rulings 2026-09-28).

  Props added for the roll prompt (issue 2021); each default leaves an earlier caller unchanged:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `closeOnOutsideClick` | boolean | `true` | `false` keeps a stray click, and an Escape outside the dialog, from dismissing; Escape inside it still calls `onClose`. |
  | `trapFocus` | boolean | `false` | Focus enters on open, Tab cycles inside, the modal owns every key, and focus returns to the opener, or the host while the opener is disabled. |
  | `initialFocus` | selector | `''` | The element `trapFocus` focuses first; the first focusable one when absent. |
  | `footerLayout` | `'end'` \| `'equal'` | `'end'` | `equal` gives every footer child one equal share of the rail. |
  | `onSubmit(event)` | function | none | Wraps body and footer in one form; Enter submits through its first submit button. |

  Invariants (issue 2658):
  - Body and footer are drawn once, inside the one `svelte:element` that is a `<form>` when
    `onSubmit` is passed and a `display: contents` `<div>` otherwise.
  - Escape stops at the dialog in every mode, so Foundry's `core.dismiss` closes no window. It calls
    `onClose` once per keydown, a held Escape once per repeat, and never for a composing key.
  - An expanded control inside the dialog, such as an open Select, keeps its own Escape. Whether a
    control is expanded is read as the key goes down, from a record `escapeOrigin` takes on the
    WINDOW's capture phase: a browser flushes Svelte's update at the microtask checkpoint after each
    listener, so a control that collapses on Escape from a document capture listener has already
    written `aria-expanded="false"` by the time the key reaches the dialog. The window comes before
    the document in every capture path, so the record precedes every document capture listener
    whatever its registration order.
  - The dialog's host is acquired through the overlay chain and given back when it is destroyed.

  Limits: a window capture listener registered before the dialog opens that collapses on Escape
  still runs first. A dialog left open across a move to another window gets no record in the new
  window and reads the live attribute there. Escape or a press in a panel that a control in the
  dialog portals outside it is an outside dismissal.
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';
  import IconButton from './IconButton.svelte';
  import { acquireOverlayHost, releaseOverlayHost } from '../util/overlayHost.js';

  let {
    open = false,
    title = '',
    subtitle = '',
    closeLabel = 'Close',
    width = '560px',
    dialogProps = {},
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

  // The dialog element, to tell a key inside it from one outside it.
  let dialog = $state(null);
  // The last Escape the window saw as it went down: the event and whether it came from an expanded
  // control inside the dialog.
  let escapeRecord = null;

  // The host the dialog was last acquired into, kept for `modalFocus` to restore focus into.
  let host = null;

  // Acquired through the overlay chain (issue 2658): inside a published mount the dialog lives in
  // the chain's container for it, and otherwise the class walk from the dialog node UPWARDS, never a
  // document query for an application root by name (issue 1466): that found the manager window
  // wherever it is, so this chrome opened from another application portaled into a DIFFERENT
  // WINDOW and the `|| document.body` fallback made that silent.
  function acquireHost(node) {
    host = acquireOverlayHost(node, node, { component: 'Modal' });
    return host;
  }

  // Gives the host back to the chain when the dialog closes or the component is destroyed.
  function heldHost(node) {
    return { destroy: () => releaseOverlayHost(node) };
  }

  // True when `target` sits in an expanded control that `container` holds. An expanded ancestor of
  // the dialog itself never counts.
  function expandedIn(container, target) {
    const control = target?.closest?.('[aria-expanded="true"]');
    return Boolean(control) && Boolean(container?.contains?.(control));
  }

  // Taken on the window's capture phase, which precedes every document capture listener, so it
  // holds the attribute as the key went down and not as a later listener left it. The origin is the
  // first entry of the composed path, so a target inside an open shadow root is not retargeted to
  // its host. The window is kept and released from, never read again at destroy: after `adoptNode`
  // it is the wrong one and once a detached window has closed it is `null`.
  function escapeOrigin(node) {
    const view = node.ownerDocument?.defaultView;
    if (typeof view?.addEventListener !== 'function') return {};
    const record = (event) => {
      if (event.key !== 'Escape') return;
      const origin = event.composedPath?.()[0] ?? event.target;
      escapeRecord = { event, expanded: expandedIn(node, origin) };
    };
    view.addEventListener('keydown', record, true);
    return {
      destroy() {
        view.removeEventListener('keydown', record, true);
        escapeRecord = null;
      },
    };
  }

  function requestClose() {
    onClose();
  }

  // An outside mousedown or an Escape that did not come from inside the dialog. Escape inside it
  // is `handleKeydown`'s, so it is not closed twice, nor is an expanded control's.
  function dismissFromOutside(event) {
    if (event?.type === 'keydown' && (event.isComposing || dialog?.contains?.(event.target)))
      return;
    requestClose();
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
    const held = host;
    const first = (initialFocus && node.querySelector(initialFocus)) || focusables(node)[0];
    first?.focus?.();
    return {
      destroy() {
        // A frame later, so an opener the answer's own flow re-enables can take focus back.
        node.ownerDocument.defaultView.requestAnimationFrame(() => restoreFocus(opener, held));
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
    if (event.key === 'Escape') {
      // An expanded control inside, such as an open Select, closes its own list first.
      const expanded =
        escapeRecord?.event === event
          ? escapeRecord.expanded
          : expandedIn(event.currentTarget, event.target);
      if (!expanded) {
        // Foundry's `core.dismiss` would otherwise close every framed window.
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }
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

{#if open}
  <div class="manager-modal-overlay" data-manager-modal-overlay>
    <div
      class="fabricate-modal"
      bind:this={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={`--manager-modal-width: ${width};`}
      data-manager-modal
      {...dialogProps}
      use:portal={(node) => acquireHost(node)}
      use:escapeOrigin
      use:heldHost
      use:dismissOnOutsideClick={{
        enabled: open && closeOnOutsideClick,
        onDismiss: dismissFromOutside,
      }}
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
          size="26"
          ariaLabel={closeLabel}
          icon="fas fa-xmark"
          onclick={requestClose}
        />
      </div>

      <svelte:element
        this={onSubmit ? 'form' : 'div'}
        class="manager-modal-form"
        novalidate={onSubmit ? true : undefined}
        onsubmit={onSubmit ? submit : undefined}
      >
        {#if body}
          <div class="manager-modal-body">{@render body()}</div>
        {/if}

        {#if footer}
          <div class="manager-modal-footer" class:is-equal={footerLayout === 'equal'}>
            {@render footer()}
          </div>
        {/if}
      </svelte:element>
    </div>
  </div>
{/if}

<style>
  .manager-modal-overlay {
    display: contents;
  }

  /* The library's canonical Modal, measured off the prototype (maintainer ruling 2026-09-28). */
  .fabricate-modal {
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
    gap: var(--fab-space-3);
    padding: var(--fab-space-3) var(--fab-space-4);
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
  .fabricate-modal :global([data-manager-modal-close]) {
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
    gap: var(--fab-space-4);
    min-height: 0;
    padding: var(--fab-space-4);
  }

  .manager-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3) var(--fab-space-4) var(--fab-space-4);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }

  .manager-modal-footer.is-equal > :global(*) {
    flex: 1 1 0;
    min-width: 0;
  }
</style>
