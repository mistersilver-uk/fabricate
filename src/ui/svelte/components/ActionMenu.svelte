<!--
  THE overflow ACTION MENU: an icon trigger announcing `aria-haspopup="menu"` over a portaled
  `role="menu"` of `role="menuitem"` buttons. IT IS NOT A MODE OF `SearchablePopover`, AND THAT
  PRIMITIVE MUST NOT GROW A `role` PROP TO ABSORB IT: a listbox keeps DOM focus on ONE element while
  a menu MOVES FOCUS to its items, which are incompatible focus models rather than two settings of
  one. `design-system/spec.md`'s "a picker announces the panel it opens, and a look-alike is
  adjudicated rather than converted" is the rule.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `items` | `[{ id, label, icon?, disabled?, danger?, tone?, data? }]` | `[]` | `label` is ALREADY-LOCALIZED; `danger` emits `is-danger` and `tone` emits `is-<tone>`, whose sheet rule tints the item's glyph and never its label; `data` is stamped verbatim on that item's button and spread FIRST, so a caller can never override this component's own `type`, `role`, `tabindex` or `onclick`. |
  | `ariaLabel` | pre-localized string | `''` | The trigger's accessible name, required in the sense `design-system/spec.md` requires it of any icon-only control. A caller rendering one menu per row names the record in it; the menu items stay generic, because the trigger the menu was opened from is what identifies the row. |
  | `triggerClass` / `triggerIcon` / `triggerTitle` / `triggerProps` | strings / attribute object | `''` / `{}` | The trigger's extra class, glyph, tooltip (`IconButton`'s `tooltip`, else its name) and hooks. The trigger is `<IconButton>`, so the primitive that owns the icon-only-button meaning keeps owning it. |
  | `panelLabel` / `menuClass` | string / class string | `ariaLabel` / `''` | The panel's accessible name, and an extra class on the portaled panel, which escapes this component's root, so a caller's popover-scoped hook has to ride the panel itself. |
  | `heading` | pre-localized string | `''` | A `<Kicker>` atop the panel and outside its `role="menu"`, which it names through `aria-labelledby` in place of `panelLabel`. |
  | `align` | `'end'` \| `'start'` | `'end'` | The trigger edge the panel lines up with: `end` for a kebab at a row's end, `start` for an adder at a list's start. Either is clamped inside the host. |
  | `trigger` | snippet `{ attributes, open }` | `undefined` | Replaces the `<IconButton>`. The caller spreads `attributes` — `aria-haspopup`, `aria-expanded`, the click and key handlers, and an attachment handing this component the element — last onto its own button, which it names, titles and disables itself; `triggerClass`, `triggerIcon`, `triggerTitle` and `triggerProps` then reach nothing, and `ariaLabel` still names a menu without a heading when no `panelLabel` is passed. |
  | `open` | bindable boolean | `false` | For a surface that must close the menu from outside itself. |

  Callbacks:
  - `onSelect(id)` — the chosen item's id. ROUTE IT BY EXPLICIT ID: one `if`/`else if` per id and NO
    terminal `else`. A trailing bare `else` makes the last branch the CATCH-ALL for every id this
    component was not told about, and the last branch of a row menu is Delete.

  Invariants:
  - THE ARIA AND KEYBOARD CONTRACT IS THE W3C APG MENU BUTTON PATTERN. The trigger carries
    `aria-haspopup="menu"` and `aria-expanded` and NO `aria-controls`, because the panel is portaled
    and an id reference across two subtrees is a relation nothing here can check; items are
    `role="menuitem"`, `tabindex="-1"`, with no `aria-selected` and no `aria-activedescendant`.
    Enter/Space/ArrowDown on the trigger open and focus the FIRST item, ArrowUp the LAST, arrows
    wrap, Home/End jump, and Escape closes and RETURNS FOCUS TO THE TRIGGER.
  - TWO DELIBERATE DEVIATIONS FROM THE APG: a disabled `menuitem` is a native `<button disabled>`, so
    arrow navigation SKIPS it; and Tab returns focus to the TRIGGER, kept as published (issue 2700).
  - IT IS PORTALED, AND THAT IS MEASURED RATHER THAN HYPOTHETICAL: a row menu opened near the bottom
    of a long list inside an `overflow: auto` panel is cut off by that panel's own edge, and
    `tests/components/overlay-portal-host-position.test.js` measures it with `elementFromPoint`,
    because a clipped element still reports its full box.
  - NO SCOPED `<style>`: everything that paints this component lives in `styles/fabricate.css`,
    rooted at the two namespace classes it writes — one on its own root and one on the portaled
    panel — per `openspec/specs/design-system/spec.md`, which also owns the portal-host contract.
  - Published through `game.fabricate.api.ui` with `items`, `ariaLabel`, `align` and `onSelect`
    only, the seam dropping each item's `data` (`ui-extension-points`' issue 2652 group).
  - The headed list's static `data-action-menu-list` hook tells the seam's gate its two menu divs apart.
  - Each element it focuses in the menu carries `data-action-menu-focused` while it holds focus, the marker the
    sheet paints, because a focus moved after a pointer press matches no `:focus-visible`.
  - An open menu whose root leaves its document closes, moving no focus and choosing nothing, as
    `dismissOnOutsideClick`'s `onDetached` states (issue 2671).
  - A repeating Enter in the menu is prevented, never stopped, so the repeats of an Enter held from
    the press that opened it choose nothing; `tests/components/published-action-menu-mounted.test.js`.
-->
<script>
  import { tick } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';
  import IconButton from './IconButton.svelte';
  import Kicker from './Kicker.svelte';
  import { anchoredPopover } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { computeActionMenuLayout } from '../util/actionMenuLayout.js';

  let {
    items = [],
    disabled = false,
    triggerClass = '',
    triggerIcon = 'fas fa-ellipsis-vertical',
    ariaLabel = '',
    triggerTitle = '',
    triggerProps = {},
    menuClass = '',
    panelLabel = '',
    heading = '',
    align = 'end',
    trigger = undefined,
    open = $bindable(false),
    onSelect = () => {},
  } = $props();

  const menuLayout = (triggerRect, panelRect, hostRect) =>
    computeActionMenuLayout(triggerRect, panelRect, hostRect, { align });

  const FOCUS_MARK = 'data-action-menu-focused';
  const instanceId = $props.id();
  const headingId = `${instanceId}-heading`;

  let menuRoot = $state(null);
  let triggerButton = $state(null);
  let panelRoot = $state(null);

  let pendingFocusIndex = 0;
  let markedEl = null;

  const panelName = $derived(panelLabel || ariaLabel || undefined);

  function focusableItems() {
    if (!panelRoot) return [];
    return [...panelRoot.querySelectorAll('[role="menuitem"]:not([disabled])')];
  }

  function unmark() {
    markedEl?.removeAttribute(FOCUS_MARK);
    markedEl = null;
  }

  // Stamped once it holds focus, never on focusin: a focus made in a blurred window fires none.
  function focusAndMark(target) {
    unmark();
    target?.focus?.();
    if (target && target.ownerDocument?.activeElement === target) {
      markedEl = target;
      target.setAttribute(FOCUS_MARK, '');
    }
  }

  function focusItemAt(index) {
    const focusable = focusableItems();
    if (focusable.length === 0) {
      focusAndMark(panelRoot?.querySelector('[role="menu"]') ?? panelRoot);
      return;
    }
    const resolved = ((index % focusable.length) + focusable.length) % focusable.length;
    focusAndMark(focusable[resolved]);
  }

  // A window blur keeps `markedEl` for the focusin that returns; any other focus loss drops it.
  function onPanelFocusout(event) {
    if (!markedEl) return;
    markedEl.removeAttribute(FOCUS_MARK);
    if (event.relatedTarget !== null || markedEl.ownerDocument.hasFocus()) markedEl = null;
  }

  function onPanelFocusin(event) {
    if (markedEl && event.target === markedEl) markedEl.setAttribute(FOCUS_MARK, '');
  }

  function restoreTriggerFocus() {
    tick().then(() => {
      const target = triggerButton ?? menuRoot?.querySelector?.('button');
      if (target?.isConnected !== false) target?.focus?.();
    });
  }

  function close({ restoreFocus = true } = {}) {
    open = false;
    markedEl = null;
    if (restoreFocus) restoreTriggerFocus();
  }

  function openAt(index) {
    if (disabled) return;
    pendingFocusIndex = index;
    open = true;
  }

  function toggleFromTrigger(event) {
    event.stopPropagation();
    if (disabled) return;
    if (open) {
      close({ restoreFocus: false });
      return;
    }
    openAt(0);
  }

  function onTriggerKeydown(event) {
    // Not stopped: a choice returns focus here, and the Enter still held would press the trigger.
    if (event.key === 'Enter' && event.repeat) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    if (open) focusItemAt(event.key === 'ArrowUp' ? -1 : 0);
    else openAt(event.key === 'ArrowUp' ? -1 : 0);
  }

  function choose(id) {
    onSelect(id);
    close();
  }

  function stop(event) {
    event.stopPropagation();
  }

  // The panel's own document holds focus, which in a Foundry 14 detached window is not Fabricate's.
  function activeItemIndex() {
    const focusable = focusableItems();
    return focusable.indexOf(panelRoot?.ownerDocument?.activeElement ?? null);
  }

  function onPanelKeydown(event) {
    const { key } = event;
    if (key === 'Enter' && event.repeat) {
      event.preventDefault();
      return;
    }
    if (key === 'Escape') {
      stop(event);
      return;
    }
    if (key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    const count = focusableItems().length;
    if (count === 0) return;
    const index = activeItemIndex();
    if (key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(index + 1);
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(index <= 0 ? count - 1 : index - 1);
    } else if (key === 'Home') {
      event.preventDefault();
      focusItemAt(0);
    } else if (key === 'End') {
      event.preventDefault();
      focusItemAt(count - 1);
    }
  }

  // Created once: an attachment is re-run whenever its function's identity changes.
  const triggerElementKey = createAttachmentKey();
  function captureTrigger(node) {
    triggerButton = node;
    return () => {
      triggerButton = null;
    };
  }
  const triggerAttributes = $derived({
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onclick: toggleFromTrigger,
    onkeydown: onTriggerKeydown,
    [triggerElementKey]: captureTrigger,
  });

  $effect(() => {
    if (!open) markedEl = null;
    if (!open || !panelRoot) return;
    tick().then(() => {
      if (open) focusItemAt(pendingFocusIndex);
    });
  });

  // An item disabled while marked drops its mark; the sheet's :not(:disabled) already hides the paint.
  $effect(() => {
    const anyDisabled = items.filter((item) => item.disabled === true).length > 0;
    if (anyDisabled && markedEl?.disabled) unmark();
  });
</script>

<div
  class="fabricate-action-menu"
  bind:this={menuRoot}
  use:dismissOnOutsideClick={{
    enabled: open,
    onDismiss: (event) => close({ restoreFocus: event?.key === 'Escape' }),
    onDetached: () => close({ restoreFocus: false }),
    additionalNodes: () => [panelRoot],
  }}
>
  {#if trigger}
    {@render trigger({ attributes: triggerAttributes, open })}
  {:else}
    <IconButton
      bind:element={triggerButton}
      class={triggerClass}
      {ariaLabel}
      {disabled}
      icon={triggerIcon}
      {...triggerProps}
      aria-haspopup="menu"
      aria-expanded={open}
      tooltip={triggerTitle || undefined}
      onclick={toggleFromTrigger}
      onkeydown={onTriggerKeydown}
    />
  {/if}

  {#snippet menuItems()}
    {#each items as item (item.id)}
      <button
        {...item.data}
        type="button"
        class={`manager-action-menu-item ${item.danger ? 'is-danger' : ''}${item.tone ? ` is-${item.tone}` : ''}`}
        role="menuitem"
        tabindex="-1"
        data-keyboard-focus="true"
        disabled={item.disabled === true}
        onclick={() => choose(item.id)}
        ><i class={item.icon ?? ''} aria-hidden="true"></i><span>{item.label}</span></button
      >
    {/each}
  {/snippet}

  {#if open && heading}
    <!-- A headed panel holds the heading beside the menu, which it names from outside. Clicks stop
         at the panel root in both forms, so one on the heading or the padding never escapes it. -->
    <div
      bind:this={panelRoot}
      class={`fabricate-action-menu-panel manager-action-menu-panel ${menuClass}`}
      role="presentation"
      use:anchoredPopover={{
        component: 'ActionMenu',
        trigger: triggerButton,
        layout: menuLayout,
      }}
      onclick={stop}
      onfocusin={onPanelFocusin}
      onfocusout={onPanelFocusout}
    >
      <div class="manager-action-menu-heading" id={headingId}>
        <Kicker as="span">{heading}</Kicker>
      </div>
      <div
        class="manager-action-menu-list"
        data-action-menu-list=""
        role="menu"
        tabindex="-1"
        data-keyboard-focus="true"
        aria-labelledby={headingId}
        onkeydown={onPanelKeydown}
      >
        {@render menuItems()}
      </div>
    </div>
  {:else if open}
    <div
      bind:this={panelRoot}
      class={`fabricate-action-menu-panel manager-action-menu-panel ${menuClass}`}
      role="menu"
      tabindex="-1"
      data-keyboard-focus="true"
      aria-label={panelName}
      use:anchoredPopover={{
        component: 'ActionMenu',
        trigger: triggerButton,
        layout: menuLayout,
      }}
      onclick={stop}
      onkeydown={onPanelKeydown}
      onfocusin={onPanelFocusin}
      onfocusout={onPanelFocusout}
    >
      {@render menuItems()}
    </div>
  {/if}
</div>
