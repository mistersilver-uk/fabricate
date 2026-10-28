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
  | `trapFocus` | boolean | `false` | Focus enters on open, Tab cycles inside, the modal owns every key, and focus returns to the opener, or the host while the opener is disabled or is the page; only then is the dialog `aria-modal` (issue 2662). |
  | `initialFocus` | selector | `''` | The element `trapFocus` focuses first; the first focusable one when absent. |
  | `footerLayout` | `'end'` \| `'equal'` | `'end'` | `equal` gives every footer child one equal share of the rail. |
  | `onSubmit(event)` | function | none | Wraps body and footer in one form; Enter submits through its first submit button. |

  Invariants (issue 2658):
  - Body and footer are drawn once, inside the one `svelte:element` that is a `<form>` when
    `onSubmit` is passed and a `display: contents` `<div>` otherwise.
  - An Escape inside the dialog stops there in every mode, so Foundry's `core.dismiss` never hears it.
    An Escape outside it, which dismisses it only with `closeOnOutsideClick`, goes on to Foundry. It
    calls `onClose` once per keydown, a held Escape once per repeat, and never for a composing key.
  - An expanded control inside the dialog, such as an open Select, keeps its own Escape. Whether a
    control is expanded is read as the key goes down, from a record `escapeOrigin` takes on the
    window's capture phase: a browser flushes Svelte's update at the microtask checkpoint after each
    listener, so a control that collapses on Escape from a document capture listener has already
    written `aria-expanded="false"` by the time the key reaches the dialog. The window comes before
    the document in every capture path, so the record precedes every document capture listener
    whatever its registration order.
  - A panel a control inside the dialog opened, or a panel opened from such a panel, counts as
    inside it wherever it is portaled, by `overlaysOpenedFrom` in `util/overlayHost.js`: a press
    there dismisses nothing, and its Escape is left to the panel, judged from the same record.
  - The dialog element is a `tabindex="-1"` focus target held off Foundry's keybindings, so a press
    on its surface focuses it; Tab or Shift+Tab from it moves to its first or its last control in
    every mode (issue 2661).
  - The dialog's host is acquired through the overlay chain and given back when it is destroyed.
  - Published through `game.fabricate.api.ui` with `open`, `title`, `subtitle`, `closeLabel`,
    `closeOnOutsideClick`, `onClose`, `body` and `footer` only (`ui-extension-points`' issue 2656
    group): a published dialog moves no focus and states no inline style, and an Escape a
    companion's slot content does not keep stops at it; `tests/components/published-modal-mounted.test.js`.

  Limits: a window capture listener registered before the dialog opens that collapses on Escape
  still runs first. A dialog left open across a move to another window gets no record in the new
  window and reads the live attribute there, and whether the key came from a panel opened inside,
  live too; one left open across a Foundry 14 window move keeps hearing the old window. A document
  capture listener registered before the dialog opened that releases such a panel on mousedown
  runs first, and the press then counts as outside; a `Modal` opened in another's slot counts as
  outside it. Escape on the close IconButton no longer reaches its delegated tooltip hide; the
  tooltip hides when the dialog is destroyed or focus leaves.
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';
  import IconButton from './IconButton.svelte';
  import {
    acquireOverlayHost,
    heldBy,
    overlaysOpenedFrom,
    releaseOverlayHost,
  } from '../util/overlayHost.js';

  let {
    open = false,
    title = '',
    subtitle = '',
    closeLabel = 'Close',
    width = '',
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

  // Inside a published mount, the chain's container for the dialog; otherwise the class walk from
  // the dialog node upwards, never a document-wide query.
  function acquireHost(node) {
    host = acquireOverlayHost(node, node, { component: 'Modal' });
    return host;
  }

  // Gives the host back to the chain when the dialog closes or the component is destroyed.
  function heldHost(node) {
    return { destroy: () => releaseOverlayHost(node) };
  }

  // Where an Escape started: the first entry of the composed path, so a target inside an open shadow
  // root is not retargeted to its host.
  function originOf(event) {
    return event.composedPath?.()[0] ?? event.target;
  }

  // True when `origin` is in a panel that counts as inside `container`; see Invariants.
  function inPanelOpenedFrom(container, origin) {
    return overlaysOpenedFrom(container).some((panel) => heldBy(panel, origin));
  }

  // True when `origin` sits in an expanded control that `container` holds, looking through open
  // shadow roots to their hosts. An expanded ancestor of the dialog itself never counts.
  function expandedIn(container, origin) {
    for (let at = origin; at?.closest; at = at.getRootNode?.().host) {
      const control = at.closest('[aria-expanded="true"]');
      if (control) return heldBy(container, control);
    }
    return false;
  }

  // Taken on the window's capture phase; see Invariants. The window is kept and released from, never
  // read again at destroy: after `adoptNode` it is the wrong one and once a detached window has
  // closed it is `null`.
  function escapeOrigin(node) {
    const view = node.ownerDocument?.defaultView;
    if (typeof view?.addEventListener !== 'function') return {};
    const record = (event) => {
      if (event.key !== 'Escape') return;
      const origin = originOf(event);
      escapeRecord = {
        event,
        expanded: expandedIn(node, origin),
        nested: inPanelOpenedFrom(node, origin),
      };
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

  // Whether the key started in the dialog, by the composed path so an open shadow root under it counts.
  function cameFromInside(event) {
    return event.composedPath?.().includes(dialog) ?? Boolean(dialog?.contains?.(event.target));
  }

  // An Escape is judged from the window's record, taken before a panel can close and release
  // itself; a mousedown, or a key in a document with no window, live.
  function fromPanelOpenedInside(event) {
    if (escapeRecord?.event === event) return escapeRecord.nested;
    return inPanelOpenedFrom(dialog, originOf(event));
  }

  // An outside mousedown or an Escape that did not come from inside the dialog. Escape inside it
  // is `handleKeydown`'s, so it is not closed twice, nor is an expanded control's.
  function dismissFromOutside(event) {
    if (event?.type === 'keydown' && (event.isComposing || cameFromInside(event))) return;
    if (fromPanelOpenedInside(event)) return;
    requestClose();
  }

  function focusables(node) {
    return [...node.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest('[inert]'));
  }

  // The page itself is no opener, nor a place focus stays inside a trapped dialog.
  function isPage(element) {
    const doc = element?.ownerDocument;
    return !element || element === doc?.body || element === doc?.documentElement;
  }

  function restoreFocus(opener, host) {
    if (!isPage(opener) && opener.isConnected && !opener.disabled) {
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
    const view = node.ownerDocument.defaultView;
    const first = (initialFocus && node.querySelector(initialFocus)) || focusables(node)[0];
    first?.focus?.();
    return {
      destroy() {
        // A frame later, so an opener the answer's own flow re-enables can take focus back.
        view?.requestAnimationFrame?.(() => restoreFocus(opener, held));
      },
    };
  }

  // A trapped modal owns the keyboard: Foundry's window-level keybindings read only
  // `document.activeElement`. Stopped at the document, so Svelte's delegated handlers still run.
  // A Tab from a panel outside whose handler moved focus inside, as a picker's does, or with focus
  // fallen to the page, as when the focused control is removed, is handled as one from inside.
  function ownKeyboard(node, enabled) {
    if (!enabled) return {};
    const doc = node.ownerDocument;
    const ours = () => node.contains(doc.activeElement) || isPage(doc.activeElement);
    const stop = (event) => {
      if (node.contains(event.target)) event.stopPropagation();
      else if (event.key === 'Tab' && !event.defaultPrevented && ours()) handleTab(event, node);
    };
    doc.addEventListener('keydown', stop);
    return { destroy: () => doc.removeEventListener('keydown', stop) };
  }

  // From the dialog element Tab enters it in every mode; from inside it only `trapFocus` wraps.
  function handleTab(event, node = event.currentTarget) {
    const inside = focusables(node);
    if (inside.length === 0) return;
    const active = node.ownerDocument.activeElement;
    const edge = event.shiftKey ? inside[0] : inside.at(-1);
    if (active !== node && (!trapFocus || (active !== edge && inside.includes(active)))) return;
    event.preventDefault();
    (event.shiftKey ? inside.at(-1) : inside[0]).focus();
  }

  function handleKeydown(event) {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      // An expanded control inside, such as an open Select, closes its own list first.
      const expanded =
        escapeRecord?.event === event
          ? escapeRecord.expanded
          : expandedIn(event.currentTarget, originOf(event));
      if (!expanded) {
        // Foundry's `core.dismiss` would otherwise close every framed window.
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }
      return;
    }
    if (event.key === 'Tab' && !event.defaultPrevented) handleTab(event);
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
      aria-modal={trapFocus ? 'true' : undefined}
      aria-label={title}
      tabindex="-1"
      data-keyboard-focus="true"
      style={width && `--manager-modal-width: ${width};`}
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
            <p class="manager-modal-subtitle">{subtitle}</p>
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
    color: var(--fab-text-muted);
    font-size: 10.5px;
    font-weight: 500;
    line-height: normal;
    overflow-wrap: break-word;
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
