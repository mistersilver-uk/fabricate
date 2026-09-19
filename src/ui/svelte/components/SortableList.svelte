<!--
  The product's one ordered list: rows whose order is the meaning, which open in place to their
  editing body, and whose adder is the list's own footer. It IS the `library.html` `<SortableList>`
  specimen, whose Svelte API block is the published prop contract — read against this file's
  `$props()`, both ways, by `tests/sortable-list-source-contract.test.js` — and it implements
  `design-system/spec.md`'s "An ordered row opens in place to its editing body" (issue 1512).

  Snippets: `row(item, index)` between the badge and the trailing cluster, `body(item, index)`
  below the row's line, and `footer` as the list's own last child.

  Invariants:
  - The row is never a button: no `role`, no `tabindex`, no `onclick`, because a whole-row button
    would nest this list's own grip, chevrons, disclosure and delete.
  - A collapsed body stays in the DOM under `hidden` and `inert` — one switch,
    `KEEP_COLLAPSED_BODY`, with no prop, per the maintainer's ruling of 2026-09-09.
  - A move reads the name first, returns focus to the control that initiated it (the grip for its
    arrow keys, the pressed chevron for a rocker click, the grip when that chevron has disabled
    itself at an end) and only then writes the live region, which is not announced otherwise.
  - The family is rooted at `fabricate-sortable-list` in `styles/fabricate.css`, never in a scoped
    block.
-->
<script>
  import IconButton from './IconButton.svelte';
  import RowDisclosure from './RowDisclosure.svelte';
  import { localize } from '../util/foundryBridge.js';
  import { reorderAnnouncementText } from '../util/listReorderAnnouncement.js';

  // One switch, no prop: a choice offered per call site is how two defensible behaviours became
  // accidental (maintainer ruling, 2026-09-09; issue 1512).
  const KEEP_COLLAPSED_BODY = true;

  let {
    items = [],
    onReorder = () => {},
    itemLabel = () => '',
    numbered = false,
    removable = false,
    onRemove = () => {},
    reorderable = true,
    expandable = false,
    expandedId = $bindable(''),
    onToggle = () => {},
    alwaysOpen = false,
    row = undefined,
    body = undefined,
    footer = undefined,
    rowClass = () => '',
    rowData = () => ({}),
    removeData = () => ({}),
    dataAttr = '',
    dataValue = '',
    ariaLabel = '',
  } = $props();

  // The rocker reuses the three existing callers' keys verbatim, so it adds none (issue 1512).
  const MOVE_UP_KEY = 'FABRICATE.Admin.Manager.ListErgonomics.MoveUp';
  const MOVE_DOWN_KEY = 'FABRICATE.Admin.Manager.ListErgonomics.MoveDown';
  const REORDER_KEY = 'FABRICATE.Common.SortableList.Reorder';
  const REMOVE_KEY = 'FABRICATE.Common.SortableList.Remove';

  const CONTROL_SIZE = 24;
  const GRIP_ATTR = 'data-sortable-grip';
  const GRIP_SELECTOR = `[${GRIP_ATTR}]`;

  const list = $derived(Array.isArray(items) ? items : []);
  const ordered = $derived(reorderable !== false);
  const hasBody = $derived(Boolean(body) && (alwaysOpen || expandable));
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});

  let dragIndex = $state(-1);
  let announcement = $state('');
  let listElement = $state(null);

  // The emitted move whose focus has not landed. State, not a local: the effect reads it after the
  // caller has round-tripped the array, which is a later render.
  let pendingFocusId = $state('');
  let pendingSentence = $state('');
  let pendingFocusSelector = $state(GRIP_SELECTOR);

  function idOf(item) {
    return String(item?.id ?? '');
  }

  function nameOf(item) {
    return String(itemLabel(item) ?? '');
  }

  /** One composer for every name this list writes, so a control's name is the record's in one place. */
  function named(key, fallback, item) {
    const name = nameOf(item);
    const translated = localize(key, { name });
    return translated && translated !== key ? translated : fallback.replace('{name}', name);
  }

  function isOpen(item) {
    return Boolean(alwaysOpen) || (Boolean(expandable) && expandedId === idOf(item));
  }

  // Disclosure is not render state: under `alwaysOpen` every body renders, and `is-expanded` fires
  // the accent the specimen reserves for the row a GM opened (issue 1512).
  function isDisclosed(item) {
    return Boolean(expandable) && !alwaysOpen && expandedId === idOf(item);
  }

  function bodyId(item) {
    return `fab-sortable-body-${idOf(item)}`;
  }

  // The state half only: the area-scope gate reads a component's family out of its `class`
  // attributes, so the root literal stays in the markup's own template.
  function rowStateClasses(item, index) {
    return [
      isDisclosed(item) ? 'is-expanded' : '',
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

  // Spread last onto the delete, so a caller's own `data-*` hook, `title` or `disabled` wins: each
  // converted surface addresses its delete by a hook of its own (issue 1512).
  function removeAttributes(item) {
    const map = removeData(item);
    return map && typeof map === 'object' ? map : {};
  }

  function toggle(item) {
    const id = idOf(item);
    expandedId = expandedId === id ? '' : id;
    onToggle(expandedId);
  }

  /**
   * Emit one move, naming the record before the caller round-trips the array.
   * @returns {{id: string, sentence: string}|null} Null when the move would change nothing.
   */
  function moveFrom(index, target) {
    if (!ordered) return null;
    if (index < 0 || index >= list.length) return null;
    if (target < 0 || target >= list.length || target === index) return null;
    const sentence = reorderAnnouncementText(nameOf(list[index]), target + 1, list.length);
    const id = idOf(list[index]);
    onReorder(index, target);
    return { id, sentence };
  }

  /** Move, follow the row with `selector`'s control, announce once that focus has landed. */
  function moveAndFollow(index, delta, selector) {
    const moved = moveFrom(index, index + delta);
    if (!moved) return;
    pendingFocusId = moved.id;
    pendingSentence = moved.sentence;
    pendingFocusSelector = selector;
  }

  /** The grip's arrow keys: focus stays on the grip, which is the control that has it. */
  function moveByKeyboard(index, delta) {
    moveAndFollow(index, delta, GRIP_SELECTOR);
  }

  /** The rocker: focus returns to the chevron the GM pressed rather than jumping to the grip. */
  function moveByRocker(index, delta) {
    moveAndFollow(index, delta, `[data-sortable-move="${delta < 0 ? 'up' : 'down'}"]`);
  }

  /** The pointer path: the drop lands where the pointer is, so focus is left where it is. */
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

  // `list` is read so the effect re-runs once the caller has round-tripped the array, which is
  // when the grip is in its new position; the region is written after the focus lands.
  $effect(() => {
    void list;
    if (!pendingFocusId) return;
    const movedId = pendingFocusId;
    const sentence = pendingSentence;
    const selector = pendingFocusSelector;
    pendingFocusId = '';
    pendingSentence = '';
    pendingFocusSelector = GRIP_SELECTOR;
    const grips = listElement?.querySelectorAll?.(GRIP_SELECTOR) ?? [];
    const grip = Array.from(grips).find((element) => element.getAttribute(GRIP_ATTR) === movedId);
    const row = grip?.closest?.('.fabricate-sortable-list-row') ?? null;
    const wanted = row?.querySelector?.(selector) ?? null;
    // A chevron that has just disabled itself at an end cannot take focus, so the grip takes it.
    const focusTarget = wanted && wanted.disabled !== true ? wanted : grip;
    focusTarget?.focus?.();
    announcement = sentence;
  });
</script>

<ul
  class="fabricate-sortable-list"
  role="list"
  aria-label={ariaLabel || undefined}
  bind:this={listElement}
  {...hookAttributes}
>
  {#each list as item, index (idOf(item) || index)}
    <li
      class={`fabricate-sortable-list-row ${rowStateClasses(item, index)}`}
      {...rowAttributes(item)}
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
      <!-- The row's own line carries the row's padding, so a body drawing an edge-to-edge strip can
           run to the row's border. -->
      <div class="fabricate-sortable-list-line">
        {#if ordered}
          <!-- The drag source is the grip, not the whole row: an expanded editing body is not
               something a GM drags. `dragstart` bubbles to the row, which owns the drop. -->
          <IconButton
            class="fabricate-sortable-list-grip"
            size={CONTROL_SIZE}
            draggable={true}
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
              size={CONTROL_SIZE}
              data-sortable-move="up"
              ariaLabel={named(MOVE_UP_KEY, 'Move up', item)}
              disabled={index === 0}
              onclick={() => moveByRocker(index, -1)}
            >
              <i class="fas fa-chevron-up" aria-hidden="true"></i>
            </IconButton>
            <IconButton
              class="fabricate-sortable-list-move"
              size={CONTROL_SIZE}
              data-sortable-move="down"
              ariaLabel={named(MOVE_DOWN_KEY, 'Move down', item)}
              disabled={index === list.length - 1}
              onclick={() => moveByRocker(index, 1)}
            >
              <i class="fas fa-chevron-down" aria-hidden="true"></i>
            </IconButton>
          </span>
        {/if}

        {#if removable}
          <IconButton
            class="is-danger fabricate-sortable-list-remove"
            size={CONTROL_SIZE}
            data-sortable-remove={idOf(item)}
            ariaLabel={named(REMOVE_KEY, 'Remove {name}', item)}
            onclick={() => onRemove(item)}
            {...removeAttributes(item)}
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
