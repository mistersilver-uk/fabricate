<!-- Svelte 5 runes mode -->
<!--
  THE ORDERED ROW (issue 1512) — the one LIST implementation of `design-system/spec.md`'s
  requirement "An ordered row opens in place to its editing body".

  ── WHAT IT IS ────────────────────────────────────────────────────────────────────────
  A list whose ORDER is the meaning, whose rows open IN PLACE to their editing body, and
  whose adder is the list's own footer rather than a sibling of it. Before this component
  the product hand-rolled that shape five times — recipe steps, the environment composition
  list, recipe result stages, salvage stages and the recipe difficulty tiers — and the five
  copies had already drifted into five different row geometries, three different reorder
  affordances and two different answers to what happens to a collapsed body.

  It is built to the `library.html` `<SortableList>` specimen, which is the authority for
  the row geometry (padding 12 / radius 9 / `--fab-bg-1` / gap 12, and a 22x22 r6
  `--fab-surface-raised` ordinal badge after the grip), for "both affordances always", for
  the keyboard contract and for the announcement.

  ── BOTH AFFORDANCES ALWAYS ───────────────────────────────────────────────────────────
  Wherever the list ORDERS, it draws the drag grip AND the visible up/down chevron rocker.
  A single-position nudge is faster than a drag, and the rocker is the only affordance a
  reader can SEE the range of; at the ends the unavailable chevron is `disabled` rather
  than hidden, so the range stays legible. Where `reorderable` is false neither is drawn
  and `onReorder` is not required, because a handle the surface does not honour is a
  promise it does not keep.

  ── THE ROW IS NOT A BUTTON ───────────────────────────────────────────────────────────
  The `<li>` carries no `role="button"`, no `tabindex` and no `onclick`. A whole-row button
  would nest this list's own grip, chevrons, disclosure and delete inside it, which is
  invalid DOM that `createElement` accepts and no mounted test detects. The disclosure is
  the only control in the row that OPENS the row, and it sits LEADING, before the row's own
  copy, so the disclosure chevron and the rocker chevrons are never adjacent.

  ── THE COLLAPSED BODY STAYS IN THE DOM ───────────────────────────────────────────────
  Ruled by the maintainer on 2026-09-09, taking the reading `library.html` recorded: a
  collapsed body is KEPT under `display: none` and its controls leave the tab order with
  `hidden` and `inert`. One markup tree is easier to reason about than a second rendering
  path, and retention holds the uncommitted field state that unmounting discards.

  It is ONE SWITCH — `KEEP_COLLAPSED_BODY` below, and the single `{#if}` it guards. There
  is deliberately NO prop and no caller choice: a choice offered per call site is exactly
  how two defensible behaviours became accidental in the first place.

  ── STATE IS THE LIST'S, AND IT IS KEYED BY RECORD ID ─────────────────────────────────
  `expandedId` and the drag index live here rather than in the store the caller renders
  from, so both survive the store refresh that follows every persisted edit; lift them and
  the row the GM is editing collapses under them.

  The key is the item's own `id`, READ BY THE LIST. It is not a caller-supplied
  `itemKey(item)`: `expandedId` is bindable, so the list and its caller must agree on ONE
  derivation of the identity, and a key function lets the two disagree silently. A caller
  whose records carry no stable id supplies one before it renders them.

  ── REORDER ANSWERS BOTH INPUTS ───────────────────────────────────────────────────────
  Pointer: the `<li>` is the drag source and the drop target, the grip is the visible
  handle, and the travelling row carries `is-dragging`.

  Keyboard: the grip is a real `<button>` and ArrowUp/ArrowDown move its row, because
  HTML5 drag and drop has no keyboard path at all. Every control this list renders declares
  `data-keyboard-focus="true"` (each of them is an `IconButton` or a `RowDisclosure`, both
  of which emit it), or Foundry's `KeyboardManager#hasFocus` stays false and the arrows pan
  the canvas instead of moving the row.

  The moved item's NAME is read BEFORE the move, because the caller round-trips the array
  and `items[index]` afterwards is a different record. Focus follows the row to its new
  position, and only THEN is the sentence written into the polite live region — a region
  written in the same mutation as the focus change is not announced.

  ── NO SHARED ACTION COULD BE REUSED ──────────────────────────────────────────────────
  `actions/dragSource.js` is refused: it writes a Foundry canvas-drop `text/plain` JSON
  payload and sets `draggable="true"` for that purpose, so adopting it would publish every
  list row to the canvas. `actions/dragDrop.js` is the DROP half for EXTERNAL payloads and
  carries an `activeClass` for that case. Neither is a reorder, and nothing in the tree
  supports the keyboard half at all, so this component owns both halves itself.

  ── THE FAMILY LIVES IN THE GLOBAL SHEET ──────────────────────────────────────────────
  `styles/fabricate.css`, under `fabricate-sortable-list`, and NOT in a scoped `<style>`
  block: a Svelte-scoped rule is injected UNLAYERED against a sheet imported at
  `layer(modules)` and silently out-ranks every global rule at any specificity, and the
  gate that proves a family is not app-rooted cannot see a scoped block. It portals
  nothing, so it needs exactly one root.

  Props (the specimen's twelve, plus the seven this change publishes into
  `library.html`'s Svelte API block):
   - items: the records, in order. The array order IS the order.
   - onReorder(from, to): required WHEN `reorderable`.
   - itemLabel(item): required. The announcement and every control's accessible name need
     a name, and this component has none of its own to invent.
   - numbered / handles / removable, and onRemove(item).
   - expandable, expandedId (bindable), onToggle(id), alwaysOpen. The spec's three
     disclosure modes are these two booleans rather than a `mode` enum: `expandable` with
     `alwaysOpen` false is the single-open accordion, `alwaysOpen` renders every body and
     drops the disclosure, and `expandable` false is the plain collapsed list.
   - body(item, index) / footer / row(item, index) snippets. `row` renders the row's own
     content BETWEEN the badge and the trailing cluster; the list still draws the grip, the
     badge, the rocker, the disclosure and the delete around it. It is load-bearing rather
     than a convenience — without it this component could not draw the composition list's
     grid columns, the result row's control order or the tier row's live input and stepper.
   - reorderable (default true).
   - rowClass(item, index): the CALLER's per-record state classes on the row element, which
     is the primitive's. The list's own `is-expanded` and `is-dragging` are not
     caller-settable.
   - rowData(item): a verbatim `{ 'data-x': value }` map written onto the row element, on
     `SearchablePopover`'s `triggerData` precedent, for the per-record hooks the converted
     surfaces already answer.
   - dataAttr / dataValue: the single-hook shorthand every component in this set takes.
-->
<script>
  import IconButton from './IconButton.svelte';
  import RowDisclosure from './RowDisclosure.svelte';
  import { localize } from '../util/foundryBridge.js';
  import { reorderAnnouncementText } from '../util/listReorderAnnouncement.js';

  /**
   * THE MAINTAINER'S RULING, 2026-09-09, as one switch (issue 1512).
   *
   * A collapsed body that this list renders stays in the DOM, `hidden` and `inert`, rather
   * than being unmounted. There is no prop and no caller choice, because the open question
   * this closes was precisely that two defensible behaviours were being chosen by accident.
   */
  const KEEP_COLLAPSED_BODY = true;

  let {
    items = [],
    onReorder = () => {},
    itemLabel = () => '',
    numbered = false,
    handles = false,
    removable = false,
    expandable = false,
    expandedId = $bindable(''),
    onToggle = () => {},
    alwaysOpen = false,
    body = undefined,
    footer = undefined,
    row = undefined,
    onRemove = () => {},
    reorderable = true,
    rowClass = () => '',
    rowData = () => ({}),
    dataAttr = '',
    dataValue = '',
  } = $props();

  const MOVE_UP_KEY = 'FABRICATE.Common.SortableList.MoveUp';
  const MOVE_DOWN_KEY = 'FABRICATE.Common.SortableList.MoveDown';
  const REORDER_KEY = 'FABRICATE.Common.SortableList.Reorder';
  const REMOVE_KEY = 'FABRICATE.Common.SortableList.Remove';

  const list = $derived(Array.isArray(items) ? items : []);

  // The list ORDERS, so it draws both affordances. When it does not, it draws neither and
  // never calls `onReorder`.
  const ordered = $derived(reorderable !== false);
  const hasBody = $derived(Boolean(body) && (alwaysOpen || expandable));
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});

  let dragIndex = $state(-1);
  let announcement = $state('');
  let listElement = $state(null);

  // The move that has been emitted and whose focus has not landed yet. It is state rather
  // than a local because the effect below reads it AFTER the caller has round-tripped the
  // array, which is a later render than the one that set it.
  let pendingFocusId = $state('');
  let pendingSentence = $state('');

  function idOf(item) {
    return String(item?.id ?? '');
  }

  function nameOf(item) {
    return String(itemLabel(item) ?? '');
  }

  /**
   * ONE composer for every name this list writes, so a control's name is the record's name
   * in one place rather than four `${…} — ${…}` templates that drift apart.
   */
  function named(key, fallback, item) {
    const name = nameOf(item);
    const translated = localize(key, { name });
    return translated && translated !== key ? translated : fallback.replace('{name}', name);
  }

  function isOpen(item) {
    return Boolean(alwaysOpen) || (Boolean(expandable) && expandedId === idOf(item));
  }

  function bodyId(item) {
    return `fab-sortable-body-${idOf(item)}`;
  }

  // THE STATE HALF ONLY. The root literal stays in the markup's own `class` template, because
  // the area-scope gate reads a component's family out of its `class="…"` and `` class={`…`} ``
  // attributes: a root composed in `<script>` is a root that gate cannot see it emit.
  function rowStateClasses(item, index) {
    return [
      isOpen(item) ? 'is-expanded' : '',
      dragIndex === index ? 'is-dragging' : '',
      String(rowClass(item, index) || '').trim(),
    ]
      .filter(Boolean)
      .join(' ');
  }

  function rowAttributes(item) {
    const map = rowData(item);
    return map && typeof map === 'object' ? map : {};
  }

  function toggle(item) {
    const id = idOf(item);
    expandedId = expandedId === id ? '' : id;
    onToggle(expandedId);
  }

  /**
   * Announce a completed move through the shared helper, reading the moved record's name
   * BEFORE the array is round-tripped.
   *
   * @returns {string} The sentence, so the keyboard path can hold it until focus lands.
   */
  function sentenceFor(index, target) {
    return reorderAnnouncementText(nameOf(list[index]), target + 1, list.length);
  }

  function moveFrom(index, target) {
    if (!ordered) return null;
    if (index < 0 || index >= list.length) return null;
    if (target < 0 || target >= list.length || target === index) return null;
    const sentence = sentenceFor(index, target);
    const id = idOf(list[index]);
    onReorder(index, target);
    return { id, sentence };
  }

  /** The KEYBOARD path: move, follow the row with focus, announce after the focus lands. */
  function moveByKeyboard(index, delta) {
    const moved = moveFrom(index, index + delta);
    if (!moved) return;
    pendingFocusId = moved.id;
    pendingSentence = moved.sentence;
  }

  /** The POINTER path: the drop lands where the pointer is, so focus is left where it is. */
  function dropOn(targetIndex) {
    const from = dragIndex;
    dragIndex = -1;
    const moved = moveFrom(from, targetIndex);
    if (moved) announcement = moved.sentence;
  }

  function onGripKeydown(event, index) {
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    moveByKeyboard(index, delta);
  }

  // FOCUS FIRST, THEN THE REGION. `list` is read so the effect re-runs once the caller has
  // round-tripped the reordered array, which is when the grip is in its new position; the
  // region is written afterwards, because a live region written in the same mutation as a
  // focus change is not announced.
  $effect(() => {
    void list;
    if (!pendingFocusId) return;
    const wanted = pendingFocusId;
    const sentence = pendingSentence;
    pendingFocusId = '';
    pendingSentence = '';
    const grips = listElement?.querySelectorAll?.('[data-sortable-grip]') ?? [];
    const grip = Array.from(grips).find(
      (element) => element.getAttribute('data-sortable-grip') === wanted
    );
    grip?.focus?.();
    announcement = sentence;
  });
</script>

<ul class="fabricate-sortable-list" bind:this={listElement} {...hookAttributes}>
  {#each list as item, index (idOf(item) || index)}
    <li
      class={`fabricate-sortable-list-row ${rowStateClasses(item, index)}`}
      {...rowAttributes(item)}
      draggable={ordered ? true : undefined}
      ondragstart={ordered
        ? () => {
            dragIndex = index;
          }
        : undefined}
      ondragend={ordered
        ? () => {
            dragIndex = -1;
          }
        : undefined}
      ondragover={ordered ? (event) => event.preventDefault() : undefined}
      ondrop={ordered
        ? (event) => {
            event.preventDefault();
            dropOn(index);
          }
        : undefined}
    >
      <!-- The row's own LINE. It carries the row's padding, so a body that draws an
           edge-to-edge strip can run to the row's own border — which is the shape the
           specimen's expanded row draws, and the shape the two complication bands need. -->
      <div class="fabricate-sortable-list-line">
        {#if handles && ordered}
          <IconButton
            class="fabricate-sortable-list-grip"
            data-sortable-grip={idOf(item)}
            ariaLabel={named(REORDER_KEY, 'Reorder {name} — use the up and down arrow keys', item)}
            onkeydown={(event) => onGripKeydown(event, index)}
          >
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </IconButton>
        {/if}

        {#if numbered}
          <span class="fabricate-sortable-list-ordinal" data-sortable-ordinal={idOf(item)}
            >{index + 1}</span
          >
        {/if}

        {#if expandable && !alwaysOpen}
          <RowDisclosure
            side="leading"
            expanded={isOpen(item)}
            controls={bodyId(item)}
            label={nameOf(item)}
            dataAttr="data-sortable-disclosure"
            dataValue={idOf(item)}
            onToggle={() => toggle(item)}
          />
        {/if}

        <div class="fabricate-sortable-list-content">{@render row?.(item, index)}</div>

        {#if ordered}
          <span class="fabricate-sortable-list-rocker">
            <IconButton
              class="fabricate-sortable-list-move"
              data-sortable-move="up"
              ariaLabel={named(MOVE_UP_KEY, 'Move {name} up', item)}
              disabled={index === 0}
              onclick={() => moveByKeyboard(index, -1)}
            >
              <i class="fas fa-chevron-up" aria-hidden="true"></i>
            </IconButton>
            <IconButton
              class="fabricate-sortable-list-move"
              data-sortable-move="down"
              ariaLabel={named(MOVE_DOWN_KEY, 'Move {name} down', item)}
              disabled={index === list.length - 1}
              onclick={() => moveByKeyboard(index, 1)}
            >
              <i class="fas fa-chevron-down" aria-hidden="true"></i>
            </IconButton>
          </span>
        {/if}

        {#if removable}
          <IconButton
            class="is-danger fabricate-sortable-list-remove"
            data-sortable-remove={idOf(item)}
            ariaLabel={named(REMOVE_KEY, 'Remove {name}', item)}
            onclick={() => onRemove(item)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </IconButton>
        {/if}
      </div>

      {#if hasBody}
        {#if KEEP_COLLAPSED_BODY || isOpen(item)}
          <div
            class="fabricate-sortable-list-body"
            id={bodyId(item)}
            hidden={!isOpen(item)}
            inert={!isOpen(item)}
          >
            {@render body(item, index)}
          </div>
        {/if}
      {/if}
    </li>
  {/each}

  {#if footer}{@render footer()}{/if}
</ul>

<p class="visually-hidden" aria-live="polite" data-sortable-list-status>{announcement}</p>
