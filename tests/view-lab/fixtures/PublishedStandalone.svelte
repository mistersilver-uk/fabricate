<!--
  A View Lab specimen, not a Fabricate surface (issues 2456, 2679). It mounts the twelve entries that
  state `standaloneRoot` through the page-session seam `game.fabricate.api.ui` binds, as a companion
  does, each into a target of its own but the `Well`, which sits in the `InspectorCard`'s content
  slot over a line of the companion's own text; the `Field`'s slot holds the companion's caption,
  text input and hint. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-standalone` only.

  Under a window with no Fabricate root the seam writes one standalone style root in each target
  and none for the well inside the card; under a Fabricate window it writes none. The props are the
  same in both, so the two frames differ only by the root.

  The ground is two 360px columns on `--fab-bg-1`, the ground the standalone style root paints none
  of: B6a's five, the field and the search field in the first, the stepper, the segmented control,
  the option cards, the tabs and the pager in the second. Neither carries a `fabricate` class or a
  theme attribute, so the ink and scheme their content shows are the root's. A case addresses the
  ground by `data-lab-standalone-ground`, a column by `data-lab-standalone-column` and each target
  by its `data-lab-standalone-target` key; each target is `display: flex`, as the spec asks of a
  companion.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const COLUMNS = Object.freeze([
    Object.freeze(['button', 'icon-button', 'toggle', 'card', 'field', 'search']),
    Object.freeze(['stepper', 'segmented', 'cards', 'tabs', 'pager']),
  ]);
  const KEYS = COLUMNS.flat();

  let targets = $state({});

  const noop = () => {};

  /** An element named `tag` in `slot`'s document, carrying `text` and `attributes`. */
  function drawn(slot, tag, text, attributes = {}) {
    const element = slot.ownerDocument.createElement(tag);
    if (text) element.textContent = text;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  $effect(() => {
    if (KEYS.some((key) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const card = mount('InspectorCard', { target: targets.card, props: { children: true } });
    const slot = card.slot('children');
    const wellTarget = drawn(slot, 'div');
    slot.append(wellTarget);
    const well = mount('Well', {
      target: wellTarget,
      props: { label: 'Chosen reagents', children: true },
    });
    const line = drawn(well.slot('children'), 'p', 'Moonpetal, silverleaf and ember salt');
    line.style.margin = '0';
    well.slot('children').append(line);
    const field = mount('Field', { target: targets.field, props: { as: 'div', children: true } });
    const column = field.slot('children');
    column.append(
      drawn(column, 'span', 'Batch name', { id: 'lab-standalone-field-caption' }),
      drawn(column, 'input', '', {
        type: 'text',
        placeholder: 'Moonpetal tonic',
        'aria-labelledby': 'lab-standalone-field-caption',
      }),
      drawn(column, 'small', 'Shown to players')
    );
    const handles = [
      mount('Button', {
        target: targets.button,
        props: { children: 'Craft the tonic', role: 'primary', onclick: noop },
      }),
      mount('IconButton', {
        target: targets['icon-button'],
        props: { icon: 'fas fa-pen', ariaLabel: 'Rename the tonic', onclick: noop },
      }),
      mount('StatusToggle', {
        target: targets.toggle,
        props: { on: true, ariaLabel: 'Hidden tasks', onclick: noop },
      }),
      card,
      field,
      mount('SearchField', {
        target: targets.search,
        props: { ariaLabel: 'Search recipes', placeholder: 'Name or tag' },
      }),
      mount('Stepper', {
        target: targets.stepper,
        props: {
          value: 3,
          min: 0,
          max: 10,
          ariaLabel: 'Batch size',
          decrementLabel: 'Fewer',
          incrementLabel: 'More',
          onChange: noop,
        },
      }),
      mount('SegmentedControl', {
        target: targets.segmented,
        props: {
          options: [
            { value: 'all', label: 'All' },
            { value: 'owned', label: 'Owned' },
            { value: 'missing', label: 'Missing' },
          ],
          value: 'all',
          ariaLabel: 'Show',
          onChange: noop,
        },
      }),
      mount('RadioCardGroup', {
        target: targets.cards,
        props: {
          options: [
            {
              value: 'forge',
              label: 'Forge',
              description: 'Heat and hammer',
              icon: 'fas fa-hammer',
            },
            { value: 'brew', label: 'Brew', description: 'Simmer it low', icon: 'fas fa-flask' },
          ],
          value: 'forge',
          legend: 'Method',
          onChange: noop,
        },
      }),
      mount('EditorTabs', {
        target: targets.tabs,
        props: {
          tabs: [
            { id: 'overview', label: 'Overview', icon: 'fas fa-scroll' },
            { id: 'steps', label: 'Steps' },
            { id: 'results', label: 'Results' },
          ],
          activeTab: 'steps',
          ariaLabel: 'Recipe sections',
          idStem: 'lab-standalone',
          onSelect: noop,
        },
      }),
      mount('Pagination', {
        target: targets.pager,
        props: {
          totalCount: 42,
          pageSize: 10,
          pageSizeOptions: [10, 25, 50],
          onPageChange: noop,
          onPageSizeChange: noop,
          ariaLabel: 'Recipes pages',
          navLabel: 'Recipes page navigation',
          previousLabel: 'Previous page',
          nextLabel: 'Next page',
          perPageLabel: 'Per page',
          rangeTemplate: 'Showing {first}–{last} of {total}',
          pageTemplate: 'Page {page} of {total}',
        },
      }),
    ];
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-standalone-ground" data-lab-standalone-ground>
  {#each COLUMNS as keys, index (index)}
    <div class="published-standalone-column" data-lab-standalone-column={index + 1}>
      {#each keys as key (key)}
        <div
          class="published-standalone-target"
          data-lab-standalone-target={key}
          bind:this={targets[key]}
        ></div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .published-standalone-ground {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
  }

  .published-standalone-column {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-standalone-target {
    display: flex;
  }
</style>
