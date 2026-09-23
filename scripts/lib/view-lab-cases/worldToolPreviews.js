/**
 * World scope: the tool entry's previews and the world-scoped rail's own geometry.
 */

import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'world-tool-entry-on-break-replace',
    label: 'Manager — World Tool entry, replacement component',
    reaches: 'beyond',
    smokeLabels: [],
    // The other unreachable state: replace-mode with a component attached.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="hb-tool-alembic"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-player-broken]' },
      // Scrolled for the reason the repair frame is: the unlink control sits at the foot of the second card.
      { selector: '[data-tool-replacement-target]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-replacement-target]',
    // The filled face of the drop zone and the tile it explains.
    expectContained: [
      {
        container: '[data-tool-replacement-target]',
        target: '[data-tool-replacement-tile]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-image="replacement"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolReplacementTarget\.svelte$/,
      // The rail's player tile is this frame's second assertion, so a shared-preview change publishes it.
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-destroyed-preview',
    label: 'Manager — World Tool entry, destroyed copy',
    reaches: 'beyond',
    smokeLabels: [],
    // The third face of `Show as broken`, and the one no other case reaches (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-tool-player-broken]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-preview]',
    expectContained: [
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-image="none"]',
      },
      // With the chip gone, this note is the only thing that says why the slot is empty.
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-note]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-player-preview',
    label: 'Manager — World Tool entry, player preview',
    reaches: 'beyond',
    smokeLabels: [],
    // The third frame on this screen, and the only one that can show its preview column (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      // Scrolled, because the column is what this frame is about and it does not fit.
      { selector: '[data-tool-required-for] .manager-pagination', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-preview]',
    // One assertion per region: a frame proving only the inventory tile is evidence for a third of it.
    expectContained: [
      // The player tile, its name caption, the usability card and the paged `Required for` list.
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-preview]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-name]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-preview-usability]',
      },
      // `Required for` is asserted through its two parts rather than its wrapper, which is the stronger claim.
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-required-row]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-required-for] .manager-pagination',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // Every region here is drawn through `ScopedEntityPreview`'s trailing slot, so the world rail is claimed too.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntityPreview\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-scoped-rail-collapsed',
    label: 'Manager — World scoped rail collapsed',
    reaches: 'beyond',
    smokeLabels: [],
    // The prototype has no collapsed-rail state, so the parity oracle cannot reach this; only this frame can.
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-manager-rail-toggle]' },
    ],
    expectView: 'world-components',
    // The active leaf and the collapsed state are asserted together: the leaf alone passes on an open rail.
    expectSelector:
      '.manager-body.is-rail-collapsed #manager-world-nav-component-catalogue.is-active',
    // And every leaf keeps its glyph inside its 56px button, which is what makes the strip navigable.
    expectContained: [
      {
        container: '#manager-world-nav-component-catalogue',
        target: '#manager-world-nav-component-catalogue > i',
      },
      { container: '#manager-world-nav-vocabulary', target: '#manager-world-nav-vocabulary > i' },
      {
        container: '#manager-world-nav-essence-catalogue',
        target: '#manager-world-nav-essence-catalogue > i',
      },
      {
        container: '#manager-world-nav-tool-catalogue',
        target: '#manager-world-nav-tool-catalogue > i',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-scoped-narrow',
    label: 'Manager — World scoped narrow',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [{ selector: '#manager-world-nav-component-catalogue' }],
    expectView: 'world-components',
    expectSelector: '[data-scoped-page="world-components"]',
    // The dead strip's absence measured in the browser: `expectedTracks: 2` is the released column.
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: '.manager-body',
      expectedTracks: 2,
      absentSelector: '.manager-inspector',
      // The side rail runs the body's full height below the 1120px rung (issue 1976).
      fillSelector: '.manager-rail',
    },
    position: { width: 1024, height: 860 },
    kinds: ['manager', 'world', 'scoped', 'responsive'],
    // The placeholder claim is gone here too (issue 1371).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
    ],
  }),
]);
