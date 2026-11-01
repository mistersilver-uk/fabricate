<!--
  Fabricate's anchored popover (issue 2861): a small non-modal dialog holding a caller's controls,
  portaled to the overlay host and placed under or over an anchor element the caller owns, flipping
  to the side with room. It owns the placement, the panel surface, dismissal and the focus model.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `open` | `true` | `false` | Only `true` draws it; the caller closes it from `onClose`. |
  | `anchorId` | string | `''` | The anchor's `id`, looked up in this mount's own document or shadow root; while it names no connected element with a layout box the panel is not drawn and nothing is called. |
  | `placement` | `'bottom-start'` \| `'bottom-end'` \| `'top-start'` \| `'top-end'` | `'bottom-start'` | The side tried first and the anchor edge the panel lines up with; any other value draws the default. |
  | `title` / `ariaLabel` | snippet / string | none / `''` | The dialog's name: `ariaLabel` when given, else the visible `title` heading. |
  | `closeOnOutsideClick` | `false` | `true` | Only `false` keeps an outside press from calling `onClose`. |

  Snippets:
  - `body` — the content, in a column that scrolls when the panel is capped to the room it has.

  Callbacks:
  - `onClose()` — an outside press, or an Escape inside the panel; the caller sets `open` false.

  Invariants:
  - The panel is `role="dialog"`, not `aria-modal`, with the id `<anchorId>-popover` for a caller's
    `aria-controls`; it writes nothing on the anchor, whose `aria-expanded` is the caller's.
  - A press on the anchor, or in a panel opened from inside this one, is not an outside press, and
    the host is acquired from this mount, so the overlay chain and `overlaysOpenedFrom` hold.
  - `tests/components/published-popover-mounted.test.js` and `popover-rendered.test.js` pin it.
-->
<script>
  import { untrack } from 'svelte';

  import { anchoredPopover } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { anchorClipped, followAnchor, resolveAnchor } from '../actions/followAnchor.js';
  import { focusablesIn, originOf, popoverFocus, popoverKeys } from '../actions/popoverFocus.js';
  import { heldBy, overlaysOpenedFrom } from '../util/overlayHost.js';
  import { computePopoverLayout, popoverPlacement } from '../util/popoverLayout.js';

  let {
    open = false,
    anchorId = '',
    placement = 'bottom-start',
    title = undefined,
    ariaLabel = '',
    closeOnOutsideClick = true,
    onClose = () => {},
    body = undefined,
  } = $props();

  // The in-place element the host and the anchor are both looked up from.
  let origin = $state(null);
  let anchor = $state(null);
  let panel = $state(null);

  const isOpen = $derived(open === true);
  const side = $derived(popoverPlacement(placement));
  // Bumped when the panel or the anchor changes size, so the placement below is measured again.
  let resized = $state(0);
  const panelId = $derived(typeof anchorId === 'string' && anchorId ? `${anchorId}-popover` : '');
  const named = $derived(typeof ariaLabel === 'string' && ariaLabel.trim() !== '');
  // Whether the anchor is scrolled out of view, which hides the panel without closing it.
  let clipped = $state(false);
  // A body that overflows with nothing focusable in it takes a Tab stop, so the keyboard scrolls it.
  let bodyStop = $state(-1);
  // Whether focus has entered during this open.
  let entered = false;

  $effect(() => {
    if (!isOpen) entered = false;
  });

  const bodyOf = () => panel?.querySelector(':scope > .fabricate-popover-body') ?? null;

  // The panel's height with its body uncapped, so a re-measure after a cap still sees the content.
  function contentHeight() {
    const scroller = bodyOf();
    const extra = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
    return (panel?.getBoundingClientRect().height ?? 0) + extra;
  }

  // Read on every measure: the stated side, the content's height, and the two states it decides.
  function measured() {
    clipped = Boolean(anchor && anchorClipped(anchor));
    const scroller = bodyOf();
    const overflows = scroller && scroller.scrollHeight > scroller.clientHeight;
    bodyStop = overflows && focusablesIn(scroller).length === 0 ? 0 : -1;
    return { placement: side, contentHeight: contentHeight() };
  }

  // A press on the anchor or in a panel opened from inside is inside the popover.
  function holds(node) {
    if (heldBy(anchor, node)) return true;
    return overlaysOpenedFrom(panel).some((opened) => heldBy(opened, node));
  }

  // Focus enters on the first draw of an open, and on a later one only while it is on the page, as
  // where it was inside when the anchor went, so a control the user has since focused keeps it.
  function mayEnter(onPage) {
    const enter = !entered || onPage;
    entered = true;
    return enter;
  }

  function requestClose() {
    onClose();
  }

  // An Escape is the panel's own (`popoverKeys`); a press in a panel opened from inside is inside.
  function dismissFromOutside(event) {
    if (event?.type === 'keydown') return;
    if (holds(originOf(event))) return;
    requestClose();
  }

  function closeOnEscape() {
    requestClose();
  }

  // Untracked, because the anchor's action calls it inside its own update, which would then read it.
  function bumpSize() {
    untrack(() => (resized += 1));
  }

  // Each element's size, observed in the panel's own window; the first report is the open's own.
  function watchSize(node, watched) {
    const Observer = node.ownerDocument?.defaultView?.ResizeObserver;
    if (typeof Observer !== 'function') return {};
    const watch = new Observer(bumpSize);
    const follow = (next) => {
      watch.disconnect();
      for (const element of [node, next]) if (element) watch.observe(element);
    };
    follow(watched);
    return { update: follow, destroy: () => watch.disconnect() };
  }
</script>

<span
  class="fabricate-popover-origin"
  hidden
  bind:this={origin}
  use:followAnchor={{
    id: anchorId,
    enabled: isOpen,
    ignore: () => panel,
    onChange: (next) => (anchor = next),
    onMoved: bumpSize,
  }}
></span>
{#if isOpen && anchor}
  <div
    class="fabricate-popover"
    class:is-clipped={clipped}
    bind:this={panel}
    id={panelId}
    role="dialog"
    aria-label={named ? ariaLabel : undefined}
    aria-labelledby={!named && title ? `${panelId}-title` : undefined}
    tabindex="-1"
    data-keyboard-focus="true"
    use:anchoredPopover={{
      component: 'Popover',
      trigger: anchor,
      opener: origin,
      layout: computePopoverLayout,
      layoutOptions: measured,
      applyWidth: false,
      // Read here, so a new placement or size runs the action's update, which measures again.
      measuredFor: [side, resized],
    }}
    use:watchSize={anchor}
    use:dismissOnOutsideClick={{
      enabled: closeOnOutsideClick !== false,
      onDismiss: dismissFromOutside,
      additionalNodes: () => [anchor],
    }}
    use:popoverKeys={{ onEscape: closeOnEscape, anchor: () => anchor }}
    use:popoverFocus={{
      anchor: () => resolveAnchor(origin, anchorId),
      holds,
      mayEnter,
    }}
  >
    {#if title}
      <h3 class="fabricate-popover-title" id={`${panelId}-title`}>{@render title()}</h3>
    {/if}
    {#if body}
      <!-- A scroll container takes a Tab stop only while it overflows with no control, so the keyboard can scroll it. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="fabricate-popover-body"
        data-popover-body
        tabindex={bodyStop}
        data-keyboard-focus="true"
      >
        {@render body()}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The popover family's stacking level, above a `Modal`; panels at one level stack in open order. */
  .fabricate-popover {
    position: absolute;
    z-index: 4000;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: max-content;
    max-width: min(360px, calc(100% - 16px));
    overflow: hidden;
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    background: var(--fab-bg-0);
    box-shadow: var(--fab-shadow-lg);
    color: var(--fab-text);
  }

  /* Hidden while its anchor is scrolled out of view; still open, so nothing is called. */
  .fabricate-popover.is-clipped {
    visibility: hidden;
  }

  .fabricate-popover-title {
    flex: none;
    margin: 0;
    padding: var(--fab-space-3) var(--fab-space-3) 0;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 13px;
    font-weight: 600;
    line-height: normal;
    /* Restated, so a host's own heading rule, as Foundry core's, does not redraw it. */
    border: 0;
    text-align: start;
    text-transform: none;
    letter-spacing: normal;
    text-shadow: none;
  }

  .fabricate-popover-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-height: 0;
    padding: var(--fab-space-3);
    overflow: auto;
  }

  @media (forced-colors: active) {
    .fabricate-popover {
      border-color: CanvasText;
    }
  }
</style>
