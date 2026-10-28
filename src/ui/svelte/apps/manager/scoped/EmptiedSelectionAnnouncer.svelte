<!--
  The scoped list's report of an emptied bulk selection: it re-homes the keyboard on the list's
  toolbar and then says the change through one polite region (`ui-visual-style/spec.md`, "Emptying
  a bulk selection"). It renders as a child of the list column, directly after the toolbar it
  focuses, and takes no space in the column's flow.

  Exports:
  - `report()` — moves focus to the toolbar only when the re-render dropped it (focus on the
    document body or on a detached node), then announces that the selection was cleared, queued
    behind the focus move by `util/announceAfterFocus.js`; a later call overtakes a pending one.

  Invariants:
  - The region exists, empty, before its first sentence, and each sentence replaces the region's
    content node, so clearing a selection twice running is announced twice.
  - The toolbar is an inert landmark made focusable for this hop, never an actionable control.
-->
<script>
  import { announceAfterFocusMove } from '../../../util/announceAfterFocus.js';
  import { localizeOr } from '../../../util/localizeOr.js';

  const KEY = 'FABRICATE.Admin.Manager.BulkEdit.SelectionCleared';

  let region = $state(null);
  let announcement = $state(null);
  let ticket = 0;

  function focusToolbar() {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected !== false) return false;
    const toolbar = region?.parentElement?.querySelector('[data-scoped-list-toolbar]');
    toolbar?.focus?.();
    return Boolean(toolbar) && document.activeElement === toolbar;
  }

  export function report() {
    ticket += 1;
    const mine = ticket;
    announceAfterFocusMove(focusToolbar, () => {
      if (mine === ticket) announcement = { text: localizeOr(KEY, 'Selection cleared.') };
    });
  }
</script>

<p
  bind:this={region}
  class="visually-hidden"
  aria-live="polite"
  aria-atomic="true"
  data-scoped-list-selection-announce
>
  {#key announcement}{#if announcement}<span>{announcement.text}</span>{/if}{/key}
</p>
