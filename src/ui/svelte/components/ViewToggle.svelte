<!--
  A list's arrangement switch: SegmentedControl's icon-only form over the closed list and grid
  pair. A list glyph and a grid glyph are the two layouts, so each label is clipped, never removed.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `view` | `'list'` \| `'grid'` | `'list'` | The current arrangement; anything but `'grid'` checks list, as `LibraryShelf` reads the same value. |
  | `listLabel` / `gridLabel` / `ariaLabel` | strings | `''` | Required and already localized: each radio's name and title, and the group's name. |
  | `optionDataAttr` | data-* name | `''` | The per-option hook, on each option's clickable `<label>`, never on its radio. |

  Callbacks:
  - `onChange(view)` — the chosen arrangement; it never fires for the one already checked.

  Rest spread:
  - `{...rest}` lands on the SegmentedControl root, written after `class`; the track props follow it, so
    a caller cannot override them.
-->
<script>
  import SegmentedControl from './SegmentedControl.svelte';

  let {
    view = 'list',
    listLabel = '',
    gridLabel = '',
    ariaLabel = '',
    optionDataAttr = '',
    onChange = () => {},
    class: extraClass = '',
    ...rest
  } = $props();

  const groupName = $props.id();
  const options = $derived([
    { value: 'list', label: listLabel, icon: 'fas fa-list' },
    { value: 'grid', label: gridLabel, icon: 'fas fa-table-cells-large' },
  ]);
</script>

<!-- ratchet-exempt(design-system): the spread is this primitive's own rest, forwarded to the root it composes -->
<SegmentedControl
  class={extraClass}
  {...rest}
  {options}
  value={view === 'grid' ? 'grid' : 'list'}
  iconOnly
  {groupName}
  {ariaLabel}
  {optionDataAttr}
  {onChange}
  fill={false}
  density="default"
  tone=""
  shape=""
  surface="default"
  size=""
/>
