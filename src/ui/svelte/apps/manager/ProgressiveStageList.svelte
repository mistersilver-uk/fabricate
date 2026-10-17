<!-- Svelte 5 runes mode -->
<!--
  The ordered progressive stage list the Recipe Studio and the Component Studio's salvage editor
  both draw (issue 2511): a numbered, always-open, removable `SortableList` whose every row is a
  quantity-less `PickerRow` ending in the stage component's read-only DC and an `Edit ↗` deep link,
  over that component's `StageComplicationList` for the one activity this list authors.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `items` | stage[] | `[]` | non-empty; each stage names its component by `componentId` |
  | `componentOptions` | option[] | `[]` | the projected components, carrying `difficulty` and the unredacted `complications` |
  | `activity` | `'crafting'` \| `'salvage'` | `'crafting'` | the complication activity a stage's body shows |
  | `kinds` / `catalogue` / `nameProps` | as `PickerRow` | `['component']` / `{}` / `{}` | handed to every row's `PickerRow` |
  | `recipeItemHook` | boolean | `false` | writes `data-recipe-result-item` on every row's `PickerRow` |
  | `disabled` | boolean | `false` | the saving state: no reorder, and every picker, delete and Edit disabled |
  | `rowData(item, index)` / `removeData(item)` | functions | `() => ({})` | `SortableList`'s own, `index` being `items.indexOf(item)` |
  | `difficultyDataAttr` / `editDataAttr` | attribute names | required | written on the DC with its value (`''` unset) and on Edit with the component id |
  | `itemLabel(item)` / `ownerIdOf(item)` | functions | — / `componentId \|\| ''` | a stage's name, and its complication list's `ownerId` |
  | `dcLabel` / `dcUnsetLabel` / `editLabel` / `editTitle` | strings | `''` | the caller's own copy |
  | `editAriaLabel(item)` | function | `() => ''` | the Edit link's accessible name |
  | `macroNames` / `triggerLabels` | `Map` | `undefined` | passed to `StageComplicationList` |
  | `adderClass` | string | `''` | the class of the footer `<li>` around `adder` |

  Snippets:
  - `adder` — the stage adder, in a `<li class={adderClass}>` as the list's own footer.

  Callbacks:
  - `onItemChange(item, index, value)` — a row's picker change, as `PickerRow`'s `value`.
  - `onReorder(from, to)` / `onRemove(item)` — the list's move and delete.
  - `onOpenComponent(componentId)` — Edit, which routes to the component's own editor.

  Invariants, each pinned by the named case in
  `tests/components/progressive-stage-list-mounted.test.js`:
  - The root is `SortableList`'s own `<ul>` ("the recipe hooks land on …").
  - `has-band` is set exactly when the activity-filtered complication list the body draws is
    non-empty ("has-band and the body follow the activity filter").
  - Edit keeps `data-keyboard-focus="true"` ("the recipe hooks land on …") and renders only for a
    stage whose component resolves ("hides Edit for a stage whose component resolves to no option").
  - Each caller's hooks stay on the row `<li>`, the delete, the DC, Edit and the `PickerRow` root
    ("the recipe hooks land on …", "the salvage hooks land on the same elements …").
-->
<script>
  import PickerRow from '../../components/PickerRow.svelte';
  import { toValue } from '../../components/pickerRowKinds.js';
  import SortableList from '../../components/SortableList.svelte';
  import StageComplicationList from './StageComplicationList.svelte';

  let {
    items = [],
    componentOptions = [],
    activity = 'crafting',
    kinds = ['component'],
    catalogue = {},
    nameProps = {},
    recipeItemHook = false,
    disabled = false,
    rowData = () => ({}),
    removeData = () => ({}),
    difficultyDataAttr,
    editDataAttr,
    itemLabel = () => '',
    ownerIdOf = (item) => item?.componentId || '',
    dcLabel = '',
    dcUnsetLabel = '',
    editLabel = '',
    editTitle = '',
    editAriaLabel = () => '',
    macroNames = undefined,
    triggerLabels = undefined,
    adder = undefined,
    adderClass = '',
    onItemChange = () => {},
    onReorder = () => {},
    onRemove = () => {},
    onOpenComponent = () => {},
  } = $props();

  function componentFor(item) {
    const id = item?.componentId;
    return id ? (componentOptions || []).find((option) => option.id === id) || null : null;
  }

  // `difficulty` is projected onto the component options; one never given reads as unset, not 0.
  function difficultyOf(component) {
    const difficulty = Number(component?.difficulty);
    return component && Number.isFinite(difficulty) ? difficulty : null;
  }

  // The unredacted authored list, filtered to this list's activity. The same filter decides
  // `has-band`, because `alwaysOpen` renders every body and an empty one would draw a padded box.
  function complicationsFor(item) {
    const authored = componentFor(item)?.complications;
    return (Array.isArray(authored) ? authored : []).filter(
      (complication) => complication?.activities?.[activity] === true
    );
  }
</script>

<SortableList
  {items}
  {itemLabel}
  numbered
  alwaysOpen
  removable
  reorderable={!disabled}
  {onReorder}
  {onRemove}
  rowClass={(item) =>
    complicationsFor(item).length > 0
      ? 'manager-progressive-stage-row has-band'
      : 'manager-progressive-stage-row'}
  rowData={(item) => rowData(item, items.indexOf(item))}
  removeData={(item) => ({ ...removeData(item), disabled })}
  footer={adder ? stageAdder : undefined}
>
  {#snippet row(item, index)}
    <!-- No amount (issue 676): a progressive award spends one entry at a time, so "two of X" is
         authored by listing X twice. The clear stays, so a stage swaps its component in place. -->
    <PickerRow
      value={toValue(item)}
      {kinds}
      {catalogue}
      amount={false}
      removable={false}
      {disabled}
      {nameProps}
      class="is-result"
      data-recipe-result-item={recipeItemHook ? '' : undefined}
      onChange={(value) => onItemChange(item, index, value)}
    >
      {#snippet trailing()}{@render stageControls(item)}{/snippet}
    </PickerRow>
  {/snippet}
  {#snippet body(item)}
    <StageComplicationList
      complications={complicationsFor(item)}
      ownerId={ownerIdOf(item)}
      ownerName={itemLabel(item)}
      {macroNames}
      {triggerLabels}
    />
  {/snippet}
</SortableList>

{#snippet stageAdder()}
  <li class={adderClass}>{@render adder()}</li>
{/snippet}

<!-- The stage component's read-only DC and its Edit link: the component's own editor owns
     `difficulty` and its save lifecycle, so the link is the one route to changing it. -->
{#snippet stageControls(item)}
  {@const component = componentFor(item)}
  {@const difficulty = difficultyOf(component)}
  <span
    class="manager-progressive-stage-dc"
    {...{ [difficultyDataAttr]: difficulty === null ? '' : String(difficulty) }}
    >{difficulty === null ? dcUnsetLabel : `${dcLabel} ${difficulty}`}</span
  >
  {#if component}
    <button
      type="button"
      class="manager-progressive-stage-edit"
      {...{ [editDataAttr]: item.componentId }}
      data-keyboard-focus="true"
      aria-label={editAriaLabel(item)}
      title={editTitle}
      {disabled}
      onclick={() => onOpenComponent(item.componentId)}
    >
      <span>{editLabel}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  {/if}
{/snippet}
