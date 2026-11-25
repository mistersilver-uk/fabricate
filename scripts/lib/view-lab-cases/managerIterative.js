/**
 * The iterative library: its rail entries, the Counters and Actions screens and the Crafting Action
 * editor, on the lab's `lab-ironworks` system (issue 3009).
 */

import { managerCase } from './caseFactories.js';

/** The one claim every case in this file makes: the whole `iterative/` directory. */
const ITERATIVE_SOURCES = /^src\/ui\/svelte\/apps\/manager\/iterative\//;

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
]);
