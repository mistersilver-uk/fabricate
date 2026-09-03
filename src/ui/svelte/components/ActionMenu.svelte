<!-- Svelte 5 runes mode -->
<!--
  THE overflow ACTION MENU (issue 1477).

  ── WHY IT EXISTS, AND WHY IT IS NOT A MODE OF `SearchablePopover` ────────────────
  One meaning was implemented twice, and the copy that reused a shared primitive was
  the semantically wrong one.

  `environment/CompositionList.svelte` hand-rolled it correctly at four sites: an
  `fa-ellipsis-vertical` trigger announcing `aria-haspopup="menu"` over a
  `role="menu"` of `role="menuitem"` buttons. `component/ComponentIdentityStrip.svelte`
  reached for `SearchablePopover` — its own comment called that "the house action-menu
  vehicle" — and got a trigger announcing `aria-haspopup="dialog"` over a
  `role="dialog"` containing a `role="listbox"` of `role="option"` rows, with
  `aria-selected` on each. "Unlink Source Item" was announced to a screen-reader user
  as an option they could SELECT rather than as a command they could RUN.

  That is precisely the conversion issue 1458 refused to make in the other direction.
  It adjudicated `CompositionList`'s four menus against `SearchablePopover` and ruled
  them a different widget on exactly this ground; nobody checked whether a sibling had
  already gone the way the adjudication forbade. `design-system/spec.md` requirement
  "A picker announces the panel it opens, and a look-alike is adjudicated rather than
  converted" records the rule, and this component is the vehicle that lets the strip
  obey it.

  `SearchablePopover` MUST NOT grow a `role` prop to absorb this. Two announced
  semantics behind one component is how the defect happened, and the two widgets do
  not merely announce differently — a listbox keeps DOM focus on one element and
  points at its options with `aria-activedescendant`, while a menu MOVES FOCUS to its
  items. Those are incompatible focus models, not two settings of one.

  ── THE ARIA AND KEYBOARD CONTRACT, AND WHERE IT COMES FROM ───────────────────────
  Derived from the W3C ARIA Authoring Practices Guide's MENU BUTTON pattern (its
  `menu-button` example, which composes the "Menu Button" and "Menu" patterns), not by
  copying the picker beside it:

    trigger  `aria-haspopup="menu"`, `aria-expanded`, and NO `aria-controls` — the
             panel is portaled, so an id reference across two subtrees would be the
             only thing holding the relation together and nothing in the repository
             could check it
    panel    `role="menu"` with an accessible name
    items    `role="menuitem"`, `tabindex="-1"`, NO `aria-selected` and NO
             `aria-activedescendant` anywhere

    Enter / Space / ArrowDown on the trigger   open, focus the first item
    ArrowUp on the trigger                     open, focus the LAST item
    ArrowDown / ArrowUp in the menu            move focus, wrapping
    Home / End                                 first / last item
    Escape                                     close, RETURN FOCUS TO THE TRIGGER
    Enter / Space on an item                   activate (the native `<button>` does
                                               this; the menu then closes and restores
                                               focus through `choose`)

  TWO DELIBERATE DEVIATIONS, stated rather than left to be discovered.

  (1) APG RECOMMENDS that a disabled `menuitem` remain focusable. These items are
  native `<button disabled>` elements, which the browser removes from the focus order
  outright, so arrow navigation SKIPS them. The alternative is `aria-disabled` plus a
  hand-written click refusal on every item, which is `SearchablePopover`'s
  `triggerAriaDisabled` problem re-solved for a row that nothing focuses on purpose.
  The one disabled item in the corpus is a NOTE ("Enable in library first"), and a note
  the keyboard cannot land on is the correct outcome for it.

  (2) APG says Tab "closes the menu and moves focus to the next element in the tab
  sequence". Here Tab closes the menu and returns focus to the TRIGGER. The panel is
  portaled to the application root, so "the next element in the tab sequence" from the
  panel is whatever happens to follow the portal host — somewhere else in the window
  entirely, and never the control after the trigger. Returning to the trigger is the
  only answer that keeps the tab order the GM can see.

  ── PORTALED, FOR A REASON THAT IS ON RECORD AND MEASURED ────────────────────────
  `ComponentIdentityStrip` already said it: "a naive absolutely-positioned menu clips
  inside a scrolling column". The same is true of the composition menus, which is a
  LIVE DEFECT this component fixes rather than a hypothetical:
  `.manager-environment-tab-panel` is `overflow: auto`, so a row menu opened near the
  bottom of a long Tasks list is cut off by the panel's own edge.
  `tests/components/overlay-portal-host-position.test.js` measures it with
  `elementFromPoint`, because a clipped element still reports its full box from
  `getBoundingClientRect` and no rect comparison can see the difference.

  The host comes from `resolveOverlayHost` (issue 1466) rather than a hard-coded
  ancestor, and the SAME resolved element is both the portal target and the coordinate
  origin. `src/ui/svelte/util/overlayHost.js` records why those two must never be
  computed separately.

  ── NO SCOPED `<style>`, DELIBERATELY ─────────────────────────────────────────────
  For `IconButton`'s and `ManagerButton`'s reason, plus one of this component's own: a
  scoped rule on a class that moves onto a component tag dies SILENTLY when the
  selector is a bare single compound — emitted with the hash attached, matching
  nothing, no compiler warning and byte-identical compiled CSS. Everything this
  component is painted by lives in `styles/fabricate.css`, rooted at the two namespace
  classes it writes: `fabricate-action-menu` on its own root and
  `fabricate-action-menu-panel` on the panel it portals, because a portaled node keeps
  its classes and loses its ancestors.

  Props:
   - items: `[{ id, label, icon?, disabled?, danger?, data? }]`. `label` is
     ALREADY-LOCALIZED text; `icon` is a Font Awesome class set; `danger` emits
     `is-danger`; `data` is an optional `{ 'data-x': 'value' }` map stamped verbatim on
     that item's button, which is how the composition rows keep the `data-action`
     hooks (`include`, `force-include`, `exclude`, `restore`) their tests address by.
     Spread FIRST, so a caller can never override this component's own `type`, `role`,
     `tabindex` or `onclick`.
   - triggerLabel: the pre-localized accessible name. REQUIRED in the sense
     `design-system/spec.md` requires it of any icon-only control — the trigger renders
     a glyph and nothing else, so without it the control announces "button".
   - triggerClass / triggerIcon / triggerTitle / triggerData: the trigger's extra
     class, glyph, native tooltip and `data-*` hooks. The trigger IS `<IconButton>`
     rather than a bare `<button class="manager-icon-button">`, so the primitive that
     owns the icon-only-button meaning keeps owning it here.
   - menuAriaLabel: the panel's accessible name, defaulting to `triggerLabel`.
   - menuClass: an extra class on the portaled panel. The panel escapes the component's
     own root, so a caller's popover-scoped hook has to ride the panel itself.
   - open: OPTIONAL `$bindable` open state, for a surface that must close the menu from
     outside itself.
   - onSelect(id): called with the chosen item's id.
-->
<script>
  import { tick } from 'svelte';
  import IconButton from './IconButton.svelte';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';
  import { computeActionMenuLayout } from '../util/actionMenuLayout.js';
  import { overlayHostRect, resolveOverlayHost } from '../util/overlayHost.js';

  let {
    items = [],
    disabled = false,
    triggerClass = '',
    triggerIcon = 'fas fa-ellipsis-vertical',
    triggerLabel = '',
    triggerTitle = '',
    triggerData = {},
    menuClass = '',
    menuAriaLabel = '',
    open = $bindable(false),
    onSelect = () => {},
  } = $props();

  let menuRoot = $state(null);
  let triggerButton = $state(null);
  let panelRoot = $state(null);
  let panelStyle = $state('');

  // Which item takes focus on the next open. `-1` means the last one, which is what ArrowUp on
  // the trigger asks for; every other opening path asks for the first.
  let pendingFocusIndex = 0;

  const panelLabel = $derived(menuAriaLabel || triggerLabel || undefined);

  /** The item buttons that can actually take focus. A native `disabled` button cannot. */
  function focusableItems() {
    if (!panelRoot) return [];
    return [...panelRoot.querySelectorAll('[role="menuitem"]:not([disabled])')];
  }

  function focusItemAt(index) {
    const focusable = focusableItems();
    if (focusable.length === 0) {
      // Every item is disabled — the library-disabled note on its own. Focus the panel so Escape
      // still has a home and the keystroke does not fall through to Foundry's canvas bindings.
      panelRoot?.focus?.();
      return;
    }
    const resolved = ((index % focusable.length) + focusable.length) % focusable.length;
    focusable[resolved]?.focus?.();
  }

  function restoreTriggerFocus() {
    tick().then(() => {
      const target = triggerButton ?? menuRoot?.querySelector?.('button');
      if (target?.isConnected !== false) target?.focus?.();
    });
  }

  function close({ restoreFocus = true } = {}) {
    open = false;
    panelStyle = '';
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

  /** The index, among the focusable items, of the one that currently has focus. */
  function activeItemIndex() {
    const focusable = focusableItems();
    const active = typeof document === 'undefined' ? null : document.activeElement;
    return focusable.indexOf(active);
  }

  function onPanelKeydown(event) {
    const { key } = event;
    if (key === 'Escape') {
      // The CLOSE is `dismissOnOutsideClick`'s: it registers a DOCUMENT-level capture-phase
      // keydown while enabled, so it has already run by the time this handler sees the key, and it
      // restores focus to the trigger because the event it is handed is a keydown. What is left to
      // do here is stop the key travelling any further up the portal host.
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

  function getPanelHost() {
    return resolveOverlayHost(menuRoot, { component: 'ActionMenu' });
  }

  function updatePosition() {
    if (!open || !triggerButton || !panelRoot || typeof window === 'undefined') return;
    const layout = computeActionMenuLayout(
      triggerButton.getBoundingClientRect(),
      panelRoot.getBoundingClientRect(),
      overlayHostRect(getPanelHost())
    );
    if (!layout) {
      panelStyle = '';
      return;
    }
    panelStyle = [
      'left: auto;',
      `right: ${layout.right}px;`,
      layout.placement === 'top'
        ? `top: auto; bottom: ${layout.bottom}px;`
        : `top: ${layout.top}px; bottom: auto;`,
    ].join(' ');
  }

  // ONE EFFECT, and it runs TWICE per opening by design. `panelRoot` is `$state`, so the first
  // pass (panel not yet bound) does nothing and the second measures the panel's natural
  // `max-content` box and places it. That is why nothing here reads a width from a stylesheet: the
  // panel is rendered unpositioned for exactly one frame and then measured.
  $effect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') {
      panelStyle = '';
      return;
    }
    if (!panelRoot) return;
    updatePosition();
    // Focus moves TO an item, which is the difference between a menu and a listbox and the reason
    // this is a separate primitive rather than a prop on the picker.
    tick().then(() => {
      if (open) focusItemAt(pendingFocusIndex);
    });
    if (typeof window.addEventListener !== 'function') return;
    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<!-- `fabricate-action-menu` is the primitive's own NAMESPACE root, per `design-system/spec.md`
     requirement "A shared primitive's class family is rooted at the primitive, not at an app".
     `styles/fabricate.css` is loaded page-wide, so every selector in it must begin with
     `.fabricate`; a root the COMPONENT writes satisfies that AND travels with it. Do not swap it
     for an application root and do not delete it — the family roots at nothing without it. -->
<div
  class="fabricate-action-menu manager-action-menu"
  bind:this={menuRoot}
  use:dismissOnOutsideClick={{
    enabled: open,
    // Escape and an outside mousedown arrive through the same callback, and they want DIFFERENT
    // focus outcomes: Escape must return focus to the trigger (the APG contract above), while an
    // outside mousedown must leave focus wherever the GM just clicked rather than yanking it back.
    // The action passes the event, so the two are told apart here instead of with a second handler.
    onDismiss: (event) => close({ restoreFocus: event?.key === 'Escape' }),
    additionalNodes: () => [panelRoot],
  }}
>
  <IconButton
    bind:element={triggerButton}
    class={triggerClass}
    ariaLabel={triggerLabel}
    {disabled}
    {...triggerData}
    aria-haspopup="menu"
    aria-expanded={open}
    title={triggerTitle || undefined}
    onclick={toggleFromTrigger}
    onkeydown={onTriggerKeydown}
  >
    <i class={triggerIcon} aria-hidden="true"></i>
  </IconButton>

  {#if open}
    <!-- `fabricate-action-menu-panel` is the panel's own half of the namespace root. It is a
         SECOND class rather than the one on the root above because `use:portal` moves this node
         out of that root, taking its classes and losing its ancestors. -->
    <div
      bind:this={panelRoot}
      class={`fabricate-action-menu-panel manager-action-menu-panel ${menuClass}`}
      style={panelStyle}
      role="menu"
      tabindex="-1"
      data-keyboard-focus="true"
      aria-label={panelLabel}
      use:portal={() => getPanelHost()}
      onclick={stop}
      onkeydown={onPanelKeydown}
    >
      {#each items as item (item.id)}
        <button
          {...item.data}
          type="button"
          class={`manager-action-menu-item ${item.danger ? 'is-danger' : ''}`}
          role="menuitem"
          tabindex="-1"
          data-keyboard-focus="true"
          disabled={item.disabled === true}
          onclick={() => choose(item.id)}
          ><i class={item.icon ?? ''} aria-hidden="true"></i><span>{item.label}</span></button
        >
      {/each}
    </div>
  {/if}
</div>
