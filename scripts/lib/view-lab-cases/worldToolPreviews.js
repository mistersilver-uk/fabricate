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
      // SCROLLED for the reason the repair frame is: the card is the last thing in the second
      // card of the panel, and its unlink control sits at the foot of it.
      { selector: '[data-tool-replacement-target]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-replacement-target]',
    // The filled face of the drop zone AND the tile it explains.
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
      // The rail's player tile is what this frame's second assertion is about, so a change to
      // the shared preview publishes it rather than a frame of the working copy alone.
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-destroyed-preview',
    label: 'Manager — World Tool entry, destroyed copy',
    reaches: 'beyond',
    smokeLabels: [],
    // The third face of `Show as broken`, and the one no case could reach (issue 1373, maintainer
    // round 2).
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
      // AND THE SENTENCE THAT EXPLAINS THE EMPTY BOX. With the chip gone, this note is the only
      // thing that says WHY the slot is empty, so a frame without it would show an absence with
      // no account of itself.
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
    // The third frame on this screen, and it is the only one that can show its preview column
    // (issue 1373).
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
    // One assertion per region, against the preview column itself. A frame proving only the
    // inventory tile would be evidence for a third of the change.
    expectContained: [
      // The PLAYER tile, its name caption, the usability CARD AND the paged `Required for` list —
      // one per region.
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
      // The `Required for` region is asserted through its two parts rather than its wrapper, and
      // that is a real constraint rather than a weaker claim.
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
    // THE SHARED RAIL AND THE SHELL UNDER IT ARE BOTH CLAIMED, unlike this screen's other two
    // cases: every region in this frame is drawn by `ToolBehaviorPreview` through
    // `ScopedEntityPreview`'s trailing slot, so a change to either that only published a system
    // scope frame would leave the world rail unphotographed.
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
    // Kept AND load-bearing. The prototype has no collapsed rail state, so the parity oracle
    // structurally cannot reach this; this frame and the full-width set-equality gate are its only
    // evidence.
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-manager-rail-toggle]' },
    ],
    expectView: 'world-components',
    // The ACTIVE leaf inside the collapsed rail. Asserting the leaf alone would pass on a rail
    // that never collapsed, so the state and the element are asserted together.
    expectSelector:
      '.manager-body.is-rail-collapsed #manager-world-nav-component-catalogue.is-active',
    // And every one of the four leaves keeps its glyph INSIDE its 56px button, which is what
    // makes the strip navigable at all once the labels are gone.
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
    // The absence of the dead strip, measured in the browser rather than inferred from the
    // stylesheet. `expectedTracks: 2` is the released column; `absentSelector` is the aside.
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: '.manager-body',
      expectedTracks: 2,
      absentSelector: '.manager-inspector',
    },
    position: { width: 1024, height: 860 },
    kinds: ['manager', 'world', 'scoped', 'responsive'],
    // The placeholder claim is gone here too (issue 1371).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
    ],
  }),
]);
