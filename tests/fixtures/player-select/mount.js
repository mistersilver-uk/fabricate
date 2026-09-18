/** Mount the REAL converted player controls, and the three caption SHAPES, for issue 1511. */
import { mount } from 'svelte';

import en from '../../../lang/en.json';

import InventoryBookDetail from '../../../src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte';
import InventoryFilters from '../../../src/ui/svelte/apps/inventory/InventoryFilters.svelte';
import InventorySystemSelector from '../../../src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte';
import JournalListShell from '../../../src/ui/svelte/apps/journal/JournalListShell.svelte';
import Select from '../../../src/ui/svelte/components/Select.svelte';
import { installFixtureI18n, mountCaptionShape } from '../select-fixture-shared.js';

const params = new URLSearchParams(globalThis.location.search);
const subject = params.get('subject') ?? 'span';
const startValue = params.get('value') ?? '';

installFixtureI18n(en);

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

/**
 * The three caption shapes around one bare `Select`, hosted the way the journal's sort row hosts
 * its control (the wrapper and caption classes are the difference under test).
 */
function mountShape() {
  mountCaptionShape({
    mount,
    Select,
    mountPoint,
    subject,
    startValue,
    wrapperClass: 'journal-sort fixture-wrapper',
    captionClass: 'journal-sort-label fixture-caption',
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
