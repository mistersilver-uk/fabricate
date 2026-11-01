/**
 * The standalone specimen's wiring (issues 2456, 2679, 2680), which `PublishedStandalone.svelte`
 * lays out and mounts, and `tests/components/published-standalone-root-mounted.test.js` runs the
 * View Lab cases against: the twenty-one entries that state `standaloneRoot`, each mounted into a
 * target by key (the switch and the card in more than one state), the `Well` in the
 * `InspectorCard`'s slot, the `Field`'s slot holding a caption, input and hint, a closed `Modal`
 * that a published `Button`, the opener, opens through `update`, and a closed `Popover`. Every
 * word is a companion's final text, so none is localized.
 */

/** The fixture's three columns of target keys, top to bottom, one column to a line. */
// prettier-ignore
export const COLUMNS = Object.freeze([
  Object.freeze(['button', 'icon-button', 'toggle', 'toggle-switch', 'toggle-card', 'card', 'field', 'search']),
  Object.freeze(['stepper', 'segmented', 'cards', 'tabs', 'pager', 'toggle-card-off', 'checkbox', 'disclosure', 'typeahead']),
  Object.freeze(['select', 'icon-picker', 'menu', 'opener', 'modal', 'toggle-card-bare', 'toggle-card-long', 'popover']),
]);

const DIALOG = Object.freeze({
  title: 'Rename the tonic',
  subtitle: 'Shown to every player',
  closeLabel: 'Close',
  body: true,
});

const noop = () => {};

const CARD = Object.freeze({
  title: 'Spend when this stage begins',
  sub: 'The ingredient is used up as the stage starts.',
  on: false,
});

/** The cards beside the first: off, with no glyph, and with a title long enough to wrap. */
const CARDS = Object.freeze({
  'toggle-card-off': { icon: 'fa-solid fa-hammer' },
  'toggle-card-bare': { icon: '' },
  'toggle-card-long': {
    title:
      'Spend MoonpetalSilverleafEmberSaltVerdigrisAlloyCatalystResidueInfusion when this stage begins',
  },
});

/** An element named `tag` in `slot`'s document, carrying `text` and `attributes`. */
function drawn(slot, tag, text, attributes = {}) {
  const element = slot.ownerDocument.createElement(tag);
  if (text) element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/** Mounts the specimen with `mount` into `targets`, by key; answers its teardown. */
export function mountStandaloneSpecimen({ mount, targets }) {
  const card = mount('InspectorCard', { target: targets.card, props: { children: true } });
  const slot = card.slot('children');
  const wellTarget = drawn(slot, 'div', '');
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
      'aria-describedby': 'lab-standalone-field-hint',
    }),
    drawn(column, 'small', 'Shown to players', { id: 'lab-standalone-field-hint' })
  );
  const dialogProps = (open) => ({
    ...DIALOG,
    open,
    onClose: () => dialog.update(dialogProps(false)),
  });
  const dialog = mount('Modal', { target: targets.modal, props: dialogProps(false) });
  const disclosure = mount('Disclosure', {
    target: targets.disclosure,
    props: { open: true, head: true, body: true, onToggle: noop },
  });
  disclosure.slot('head').append('Ironwrights’ Guild');
  const note = drawn(disclosure.slot('body'), 'p', 'Holds the forges on the east quay.');
  note.style.margin = '0';
  disclosure.slot('body').append(note);
  dialog
    .slot('body')
    .append(drawn(dialog.slot('body'), 'p', 'Choose the name the whole table will read.'));
  const handles = [
    disclosure,
    dialog,
    mount('Popover', {
      target: targets.popover,
      props: {
        anchorId: 'lab-standalone-popover-anchor',
        ariaLabel: 'Adjust the batch',
        onClose: noop,
      },
    }),
    mount('Button', {
      target: targets.opener,
      props: {
        children: 'Rename the tonic',
        onclick: () => dialog.update(dialogProps(true)),
      },
    }),
    mount('Select', {
      target: targets.select,
      props: {
        options: [
          { value: 'forge', label: 'Forge' },
          { value: 'brew', label: 'Brew' },
          { value: 'hand', label: 'By hand' },
        ],
        value: 'forge',
        ariaLabel: 'Method',
        onChange: noop,
      },
    }),
    mount('IconPicker', {
      target: targets['icon-picker'],
      props: {
        value: 'fas fa-flask',
        ariaLabel: 'Tonic icon',
        listLabel: 'Tonic icons',
        searchLabel: 'Search tonic icons',
        searchPlaceholder: 'Name a glyph',
        noMatchesText: 'No glyph matches',
        onChange: noop,
      },
    }),
    mount('ActionMenu', {
      target: targets.menu,
      props: {
        items: [
          { id: 'duplicate', label: 'Duplicate tonic', icon: 'fas fa-copy' },
          { id: 'archive', label: 'Archive tonic', icon: 'fas fa-box-archive', disabled: true },
          { id: 'delete', label: 'Delete tonic', icon: 'fas fa-trash', danger: true },
        ],
        ariaLabel: 'Tonic actions',
        align: 'start',
        onSelect: noop,
      },
    }),
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
    mount('StatusToggle', {
      target: targets['toggle-switch'],
      props: { on: false, semantics: 'switch', ariaLabel: 'Spend on start', onclick: noop },
    }),
    ...Object.entries(CARDS).map(([key, props]) =>
      mount('ToggleCard', { target: targets[key], props: { ...CARD, ...props, onToggle: noop } })
    ),
    mount('ToggleCard', {
      target: targets['toggle-card'],
      props: {
        title: 'Spend when this stage begins',
        sub: 'The ingredient is used up as the stage starts.',
        icon: 'fa-solid fa-hammer',
        on: true,
        semantics: 'switch',
        onToggle: noop,
      },
    }),
    mount('SelectionCheckbox', {
      target: targets.checkbox,
      props: { checked: true, label: 'Award the recipe’s ingredients first', onChange: noop },
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
    mount('Typeahead', {
      target: targets.typeahead,
      props: {
        options: [],
        ariaLabel: 'Find a reward',
        placeholder: 'Search rewards',
        onChange: noop,
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
}
