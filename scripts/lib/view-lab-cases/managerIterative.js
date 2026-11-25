/**
 * The iterative library: its rail entries, the Counters and Actions screens and the Crafting Action
 * editor, on the lab's `lab-ironworks` system (issue 3009).
 */

import { managerCase } from './caseFactories.js';

/** The one claim every case in this file makes: the whole `iterative/` directory. */
const ITERATIVE_SOURCES = /^src\/ui\/svelte\/apps\/manager\/iterative\//;

const COUNTERS_STEPS = ['Crafting', { selector: '#manager-crafting-nav-counters' }];

/** One iterative frame: `Ironworks` in `state`, reached through the rail, claimed by the directory. */
function iterativeCase({ state = 'populated', width = 1280, ...entry }) {
  return managerCase({
    // `beyond`: the smoke walk never builds an iterative system.
    reaches: 'beyond',
    smokeLabels: [],
    position: { width, height: 900 },
    kinds: ['manager', 'iterative'],
    sourceMatches: [ITERATIVE_SOURCES],
    ...entry,
    query: { system: 'lab-ironworks', iterative: state, ...entry.query },
  });
}

const openCounter = (id) => ({
  selector: `[data-iterative-counter="${id}"] [data-sortable-disclosure]`,
});
const openBody = (id) =>
  `[data-iterative-counter="${id}"] .fabricate-sortable-list-body:not([hidden])`;

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-iterative-rail',
    label: 'Manager — Iterative Crafting rail',
    // `beyond`: the smoke walk never builds an iterative system.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-ironworks', iterative: 'populated' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-counters' }],
    expectView: 'iterative-counters',
    // The route root wearing its own view token, which no other iterative case satisfies.
    expectSelector: '[data-iterative-route][data-iterative-view="iterative-counters"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'iterative'],
    sourceMatches: [
      ITERATIVE_SOURCES,
      /^src\/ui\/svelte\/apps\/manager\/crafting\/craftingNav\.js$/,
    ],
  }),
  iterativeCase({
    id: 'manager-iterative-counters',
    label: 'Manager — Iterative Counters',
    steps: COUNTERS_STEPS,
    expectView: 'iterative-counters',
    expectSelector: '[data-iterative-counters] [data-iterative-counter-list]',
    expectCenterHit: '[data-iterative-counter="iron"] [data-sortable-move="down"]',
  }),
  iterativeCase({
    id: 'manager-iterative-counters-searched',
    label: 'Manager — Iterative Counters searched',
    steps: [
      ...COUNTERS_STEPS,
      { selector: '[data-iterative-counters] .fabricate-search input', fill: 'he' },
    ],
    expectView: 'iterative-counters',
    // The one row left, with neither a grip nor a rocker to reorder it by.
    expectSelector:
      '[data-iterative-counter-list]:not(:has([data-sortable-grip])) [data-iterative-counter="heat"]',
    expectCenterHit: '[data-iterative-counter="heat"] [data-iterative-counter-delete]',
  }),
  iterativeCase({
    id: 'manager-iterative-counter-limit-none',
    label: 'Manager — Iterative Counter, No limit',
    steps: [...COUNTERS_STEPS, openCounter('slag')],
    expectView: 'iterative-counters',
    expectSelector: openBody('slag'),
  }),
  iterativeCase({
    id: 'manager-iterative-counter-limit-per-recipe',
    label: 'Manager — Iterative Counter, Per recipe',
    steps: [...COUNTERS_STEPS, openCounter('heat')],
    expectView: 'iterative-counters',
    expectSelector: `${openBody('heat')} [data-iterative-counter-clear="min"]`,
    expectCenterHit: '[data-iterative-counter="heat"] [data-sortable-disclosure]',
  }),
  iterativeCase({
    id: 'manager-iterative-counter-limit-global',
    label: 'Manager — Iterative Counter, Global',
    steps: [...COUNTERS_STEPS, openCounter('temper')],
    expectView: 'iterative-counters',
    expectSelector: openBody('temper'),
  }),
  iterativeCase({
    id: 'manager-iterative-counters-empty',
    label: 'Manager — Iterative Counters empty',
    state: 'empty',
    steps: COUNTERS_STEPS,
    expectView: 'iterative-counters',
    expectSelector: '[data-iterative-counters-state="empty"] [data-iterative-add-counter]',
  }),
  iterativeCase({
    id: 'manager-iterative-counter-duplicate-name',
    label: 'Manager — Iterative Counter duplicate name',
    state: 'duplicate',
    steps: COUNTERS_STEPS,
    expectView: 'iterative-counters',
    expectSelector: '[data-iterative-counter] [data-iterative-duplicate-chip]',
  }),
  iterativeCase({
    id: 'manager-iterative-counter-bounds-inverted',
    label: 'Manager — Iterative Counter min above max',
    state: 'inverted',
    steps: [...COUNTERS_STEPS, openCounter('temper')],
    expectView: 'iterative-counters',
    expectSelector: '[data-iterative-bounds-error]',
  }),
  iterativeCase({
    id: 'manager-iterative-counter-delete-in-use',
    label: 'Manager — Iterative Counter delete in use',
    steps: [
      ...COUNTERS_STEPS,
      { selector: '[data-iterative-counter="heat"] [data-iterative-counter-delete]' },
    ],
    // `dialog: 'open'` leaves the confirmation standing: the dialog is the state.
    query: { dialog: 'open' },
    expectView: 'iterative-counters',
    expectSelector: '.application.dialog:has(ul li)',
  }),
  iterativeCase({
    id: 'manager-iterative-counters-filtered-empty',
    label: 'Manager — Iterative Counters filtered to nothing',
    steps: [
      ...COUNTERS_STEPS,
      { selector: '[data-iterative-counters] .fabricate-search input', fill: 'zzz' },
    ],
    expectView: 'iterative-counters',
    expectSelector: '[data-clear-filters="counters"]',
  }),
  iterativeCase({
    id: 'manager-iterative-counters-narrow',
    label: 'Manager — Iterative Counters at 880px',
    width: 880,
    steps: [...COUNTERS_STEPS, openCounter('heat')],
    expectView: 'iterative-counters',
    expectSelector: `[data-iterative-counter-list] ${openBody('heat')}`,
  }),
  iterativeCase({
    id: 'manager-iterative-library-unsupported',
    label: 'Manager — Iterative library newer than this build',
    state: 'newer',
    steps: COUNTERS_STEPS,
    expectView: 'iterative-counters',
    expectSelector: '[data-iterative-unsupported-notice]',
  }),
]);
