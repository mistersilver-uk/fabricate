/**
 * Mount the REAL converted player controls, and the three caption SHAPES, for issue 1511.
 *
 * Everything except the window frame around it is production code, reached through the real
 * Svelte plugin: each component is imported from `src/`, its own `<style>` is compiled and
 * injected exactly as the shipped bundle injects it, and `styles/fabricate.css` is served raw.
 * That matters more than usual here, because both questions the suite asks are about things a
 * hand-written copy of the markup could not reproduce — the listeners a caption click meets, and
 * a `min-width` that only exists in a compiled scoped block.
 *
 * `?subject=` picks one of seven:
 *
 *   filters   `InventoryFilters`, whose sort trigger carries a floor
 *   journal   `JournalListShell`, whose sort trigger carries a floor and renders twice in the app
 *   book      `InventoryBookDetail`, whose page-size trigger carries a floor
 *   system    `InventorySystemSelector`, the one converted row that REFUSES a floor
 *   label     a bare `Select` re-wrapped in the `<label>` the conversion demotes
 *   span      the same control in the `<span>` the conversion demotes it to
 *   field     the primitive's OWN shipped labelled form (`Select label=`), which renders
 *             `<Field as="label">` around the trigger — a surviving `<label>` wrapper with
 *             twelve live callers, carried here as a REPORT-ONLY third subject for issue 1510
 *
 * `?value=` picks which option starts selected, so the same subject can be measured with its
 * shortest and its longest label without remounting into a different tree.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';

import InventoryBookDetail from '../../../src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte';
import InventoryFilters from '../../../src/ui/svelte/apps/inventory/InventoryFilters.svelte';
import InventorySystemSelector from '../../../src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte';
import JournalListShell from '../../../src/ui/svelte/apps/journal/JournalListShell.svelte';
import Select from '../../../src/ui/svelte/components/Select.svelte';

const params = new URLSearchParams(globalThis.location.search);
const subject = params.get('subject') ?? 'span';
const startValue = params.get('value') ?? '';

/**
 * `game.i18n`, backed by the REAL `lang/en.json`.
 *
 * Not decoration: `localize` returns the KEY when no `game` is present, and every width this
 * fixture reports is a text measurement. A trigger reading
 * `FABRICATE.App.Inventory.Filters.SortQuantity` is three times the width of one reading
 * "Quantity", so a fixture without this would measure its own stub rather than the product.
 */
function lookup(key) {
  return String(key)
    .split('.')
    .reduce((node, part) => (node == null ? undefined : node[part]), en);
}

globalThis.game = {
  i18n: {
    localize(key) {
      const value = lookup(key);
      return typeof value === 'string' ? value : key;
    },
    format(key, data = {}) {
      const template = this.localize(key);
      return template.replace(/\{(\w+)\}/g, (whole, name) =>
        Object.hasOwn(data, name) ? String(data[name]) : whole
      );
    },
  },
};

const frame = document.createElement('div');
frame.className = 'fabricate fabricate-app';
const mountPoint = document.createElement('div');
mountPoint.className = 'fixture-mount fixture-column';
frame.append(mountPoint);
document.body.append(frame);

/** A book teaching more than one page of recipes, so the page-size control clears its guard. */
function bookItem() {
  return {
    key: 'sys:book',
    componentId: 'book',
    systemId: 'sys',
    name: 'Tome of Distillation',
    img: null,
    learnable: true,
    isRecipeItem: true,
    totalQuantity: 1,
    recipes: Array.from({ length: 9 }, (unused, index) => ({
      id: `br${index}`,
      name: `Book Recipe ${index}`,
      img: null,
      description: '',
      learned: false,
    })),
    requirements: [],
    sources: [],
  };
}

/** The two participations the multi-system selector is drawn for. */
const PARTICIPATIONS = [
  { systemId: 'Alchemists Supplies v1.6', systemName: 'Alchemists Supplies v1.6', isTool: true, salvage: { enabled: true } },
  { systemId: 'Alchemy', systemName: 'Alchemy', isTool: false, salvage: { enabled: false } },
];

/** The three sort rows the journal's two lists offer between them. */
const JOURNAL_SORTS = [
  { value: 'soonestReady', label: 'Soonest Ready' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

/** One option set for the three caption SHAPES, so all three measure the same control. */
const SHAPE_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

/**
 * The three caption shapes, built around the same `Select`.
 *
 * `label` and `span` are hosted by fixture markup because that is exactly the difference under
 * test — the wrapper element — and the wrapper is what the conversion changed at all six call
 * sites. `field` is the primitive's own shipped form and is built by the component itself.
 *
 * @returns {void}
 */
function mountShape() {
  if (subject === 'field') {
    mount(Select, {
      target: mountPoint,
      props: {
        size: 'inline',
        label: 'Sort',
        value: startValue || 'newest',
        options: SHAPE_OPTIONS,
        triggerData: { 'data-fixture-select': '' },
        onChange: () => {},
      },
    });
    return;
  }

  const wrapper = document.createElement(subject === 'label' ? 'label' : 'span');
  wrapper.className = 'journal-sort fixture-wrapper';
  const caption = document.createElement('span');
  caption.className = 'journal-sort-label fixture-caption';
  caption.id = 'fixture-caption';
  caption.textContent = 'Sort';
  wrapper.append(caption);
  mountPoint.append(wrapper);

  mount(Select, {
    target: wrapper,
    props: {
      size: 'inline',
      value: startValue || 'newest',
      options: SHAPE_OPTIONS,
      ariaLabelledBy: 'fixture-caption',
      triggerData: { 'data-fixture-select': '' },
      onChange: () => {},
    },
  });
}

const SUBJECTS = {
  filters: () =>
    mount(InventoryFilters, {
      target: mountPoint,
      props: {
        search: '',
        filter: 'all',
        sort: startValue || 'name',
        counts: { all: 3, components: 2, essences: 1, tools: 1, recipeItems: 0 },
        onSort: () => {},
      },
    }),
  journal: () =>
    mount(JournalListShell, {
      target: mountPoint,
      props: {
        titleId: 'fixture-journal-title',
        kind: 'active',
        title: 'Active Runs',
        count: '(3)',
        sortLabel: 'Sort',
        sortValue: startValue || 'soonestReady',
        sortOptions: JOURNAL_SORTS,
        onSortChange: () => {},
        isEmpty: true,
        emptyText: 'No active runs.',
      },
    }),
  book: () =>
    mount(InventoryBookDetail, {
      target: mountPoint,
      props: { item: bookItem() },
    }),
  system: () =>
    mount(InventorySystemSelector, {
      target: mountPoint,
      props: {
        systems: PARTICIPATIONS,
        selectedSystemId: startValue || PARTICIPATIONS[0].systemId,
        onSelect: () => {},
      },
    }),
};

if (Object.hasOwn(SUBJECTS, subject)) SUBJECTS[subject]();
else mountShape();

globalThis.__playerSelectFixtureReady = true;
