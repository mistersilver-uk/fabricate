<!--
  The product's one ordered list: rows whose order is the meaning, which open in place to their
  editing body, and whose adder is the list's own footer. It is the `library.html` `<SortableList>`
  specimen, and `design-system/spec.md`'s "An ordered row opens in place to its editing body" is
  the requirement it implements (issue 1512).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `items` | array | `[]` | The records in order; the array order is the order, and each record carries a stable `id`. |
  | `onReorder(from, to)` | function | no-op | Required while `reorderable`; the caller round-trips the array. |
  | `itemLabel(item)` | function | `() => ''` | Required. Every control's name and the announcement read it. |
  | `numbered` / `removable` | boolean | `false` | Whether the ordinal badge and the delete are drawn. |
  | `onRemove(item)` | function | no-op | Required while `removable`. |
  | `reorderable` | boolean | `true` | False draws neither grip nor rocker and never calls `onReorder`. |
  | `expandable` / `alwaysOpen` | boolean | `false` | The three disclosure modes, as two booleans rather than an enum. |
  | `expandedId` | bindable id | `''` | The open row's own `id`, read by this component so caller and list cannot disagree. |
  | `onToggle(id)` | function | no-op | Fires after `expandedId` moves. |
  | `rowClass(item, index)` | function | `() => ''` | The caller's per-record state classes; `is-expanded` and `is-dragging` are not caller-settable. |
  | `rowData(item)` | function | `() => ({})` | A verbatim `{ 'data-x': value }` map for the caller's per-record hooks. |
  | `dataAttr` / `dataValue` | strings | `''` | The single-hook shorthand, written on the `<ul>`. |

  Snippets:
  - `row(item, index)` — the row's own content, between the badge and the trailing cluster.
  - `body(item, index)` — the editing body, below the row's line.
  - `footer` — the adder, as the list's own last child.

  Invariants:
  - The row is never a button: no `role`, no `tabindex`, no `onclick`, because a whole-row button
    would nest this list's own grip, chevrons, disclosure and delete.
  - A collapsed body stays in the DOM under `hidden` and `inert` — one switch,
    `KEEP_COLLAPSED_BODY`, with no prop, per the maintainer's ruling of 2026-09-09.
  - A keyboard move reads the name before the move, lands focus on the moved row's grip, and only
    then writes the live region, because a region written in the same mutation is not announced.
  - The family is rooted at `fabricate-sortable-list` in `styles/fabricate.css`, never in a scoped
    block; pinned by `tests/sortable-list-source-contract.test.js`.
-->
<script>
  import IconButton from './IconButton.svelte';
  import RowDisclosure from './RowDisclosure.svelte';
  import { localize } from '../util/foundryBridge.js';
  import { reorderAnnouncementText } from '../util/listReorderAnnouncement.js';

  // The maintainer's ruling of 2026-09-09 as one switch: no prop exposes it, because a choice
  // offered per call site is how two defensible behaviours became accidental (issue 1512).
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
    dataAttr = '',
    dataValue = '',
  } = $props();

  // The rocker reuses the three existing callers' keys verbatim, so it adds none (issue 1512).
  const MOVE_UP_KEY = 'FABRICATE.Admin.Manager.ListErgonomics.MoveUp';
  const MOVE_DOWN_KEY = 'FABRICATE.Admin.Manager.ListErgonomics.MoveDown';
  const REORDER_KEY = 'FABRICATE.Common.SortableList.Reorder';
  const REMOVE_KEY = 'FABRICATE.Common.SortableList.Remove';

  const CONTROL_SIZE = 24;

  const list = $derived(Array.isArray(items) ? items : []);
  const ordered = $derived(reorderable !== false);
  const hasBody = $derived(Boolean(body) && (alwaysOpen || expandable));
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});

  let dragIndex = $state(-1);
  let announcement = $state('');
  let listElement = $state(null);

  // The emitted move whose focus has not landed yet. State rather than a local, because the effect
  // reads it after the caller has round-tripped the array, which is a later render.
  let pendingFocusId = $state('');
  let pendingSentence = $state('');

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

  function bodyId(item) {
    return `fab-sortable-body-${idOf(item)}`;
  }

  // The state half only: the root literal stays in the markup's own `class` template, because the
  // area-scope gate reads a component's family out of its `class` attributes.
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
   * Emit one move, reading the moved record's name before the caller round-trips the array.
   *
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

  /** The keyboard path: move, follow the row with focus, announce after the focus lands. */
  function moveByKeyboard(index, delta) {
    const moved = moveFrom(index, index + delta);
    if (!moved) return;
    pendingFocusId = moved.id;
    pendingSentence = moved.sentence;
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

  // `list` is read so the effect re-runs once the caller has round-tripped the reordered array,
  // which is when the grip is in its new position; the region is written after the focus lands.
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
      <!-- The row's own line carries the row's padding, so a body drawing an edge-to-edge strip can
           run to the row's border. -->
      <div class="fabricate-sortable-list-line">
        {#if ordered}
          <IconButton
            class="fabricate-sortable-list-grip"
            size={CONTROL_SIZE}
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
              onclick={() => moveByKeyboard(index, -1)}
            >
              <i class="fas fa-chevron-up" aria-hidden="true"></i>
            </IconButton>
            <IconButton
              class="fabricate-sortable-list-move"
              size={CONTROL_SIZE}
              data-sortable-move="down"
              ariaLabel={named(MOVE_DOWN_KEY, 'Move down', item)}
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
            size={CONTROL_SIZE}
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
