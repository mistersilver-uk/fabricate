/**
 * What the three GM Interactables windows PROMISED when they joined the shared component library
 * (issue 1520), stated once for all three.
 */
import assert from 'node:assert/strict';

import { byTokenName } from './interactablesSmokeLocators.js';

/**
 * The rich GM config panel. `Stepper` is deliberately absent from its primitives: it converted
 * earlier, and its own contract - including the `<label>`-around-a-Stepper trap - lives in
 * `tests/helpers/stepperSourceContract.js`.
 */
export const CONFIG_PANEL_CONTRACT = Object.freeze({
  rootClass: 'fabricate-interactable-config',
  classPrefix: 'fab-ic-',
  residueDescription: "this window's own layout and status readings",
  primitives: Object.freeze([
    ['Chip', '../components/Chip.svelte'],
    ['Field', '../components/Field.svelte'],
    ['ManagerButton', '../components/ManagerButton.svelte'],
    ['Notice', '../components/Notice.svelte'],
    ['Select', '../components/Select.svelte'],
    ['StatusToggle', '../components/StatusToggle.svelte'],
  ]),
  layoutClasses: Object.freeze([
    'fab-ic-actions',
    'fab-ic-actions-inline',
    'fab-ic-empty',
    'fab-ic-fact',
    'fab-ic-fact-id',
    'fab-ic-fact-list',
    'fab-ic-fact-muted',
    'fab-ic-fact-name',
    'fab-ic-facts',
    'fab-ic-header',
    'fab-ic-identity',
    'fab-ic-identity-body',
    'fab-ic-identity-head',
    'fab-ic-node-count-field',
    'fab-ic-node-depleted',
    'fab-ic-node-exhausted',
    'fab-ic-node-hint',
    'fab-ic-node-state',
    'fab-ic-section',
    'fab-ic-section-title',
    'fab-ic-title',
    'fab-ic-visual-status',
  ]),
});

/** The GM browser window. */
export const BROWSER_WINDOW_CONTRACT = Object.freeze({
  rootClass: 'fabricate-interactable-browser',
  classPrefix: 'fab-ib-',
  residueDescription: "this window's own layout and its tablist residue",
  primitives: Object.freeze([
    ['IconButton', '../components/IconButton.svelte'],
    ['ManagerSearchField', '../components/ManagerSearchField.svelte'],
    ['ManagerToolbar', '../components/ManagerToolbar.svelte'],
    ['Select', '../components/Select.svelte'],
  ]),
  layoutClasses: Object.freeze([
    'fab-ib-controls',
    'fab-ib-empty',
    'fab-ib-header',
    'fab-ib-hint',
    'fab-ib-hint-modifier',
    'fab-ib-hint-region',
    'fab-ib-list',
    'fab-ib-panel-tasks',
    'fab-ib-panel-tools',
    'fab-ib-row',
    'fab-ib-row-actions',
    'fab-ib-row-icon',
    'fab-ib-row-label',
    'fab-ib-row-thumb',
    'fab-ib-section',
    'fab-ib-tab',
    'fab-ib-tab-tasks',
    'fab-ib-tab-tools',
    'fab-ib-tabs',
    'fab-ib-title',
  ]),
});

/** The GM Manage Interactables panel (issue 1509). */
export const MANAGE_PANEL_CONTRACT = Object.freeze({
  rootClass: 'fabricate-interactables-manager-body',
  classPrefix: 'fab-im-',
  residueDescription: "this window's own layout",
  primitives: Object.freeze([
    ['Chip', '../../components/Chip.svelte'],
    ['Field', '../../components/Field.svelte'],
    ['IconButton', '../../components/IconButton.svelte'],
    ['InspectorCard', '../../components/InspectorCard.svelte'],
    ['ManagerButton', '../../components/ManagerButton.svelte'],
    ['Select', '../../components/Select.svelte'],
    ['SegmentedControl', '../manager/SegmentedControl.svelte'],
  ]),
  layoutClasses: Object.freeze([
    'fab-im-empty',
    'fab-im-header',
    'fab-im-list',
    'fab-im-list-section',
    'fab-im-marker-kind',
    'fab-im-promote',
    'fab-im-promote-actions',
    'fab-im-promote-hint',
    'fab-im-row',
    'fab-im-row-actions',
    'fab-im-row-main',
    'fab-im-row-meta',
    'fab-im-row-name',
    'fab-im-source-type',
    'fab-im-subtitle',
    'fab-im-title',
    'fab-im-toolbar',
    'fab-im-visual-mode',
  ]),
});

/**
 * Assert a window renders the shared control primitives and keeps only its own layout classes.
 *
 * @param {string} params.rootSource The root component's own source text.
 * @param {object} params.contract One of the exported per-window contracts.
 */
export function assertWindowContract({ rootSource, contract }) {
  const { rootClass, classPrefix, residueDescription, primitives, layoutClasses } = contract;

  assert.ok(
    rootSource.includes(`class="${rootClass}"`),
    `the root element carries the namespaced ${rootClass} class`
  );

  for (const [primitive, importPath] of primitives) {
    assert.ok(
      rootSource.includes(`import ${primitive} from '${importPath}'`),
      `${primitive} is imported from ${importPath}`
    );
    assert.ok(
      new RegExp(`<${primitive}[\\s/>]`).test(rootSource),
      `${primitive} is rendered by the window`
    );
  }

  const residue = [...new Set(rootSource.match(new RegExp(`${classPrefix}[a-z-]+`, 'g')) ?? [])];
  assert.deepEqual(
    residue.sort(byTokenName),
    [...layoutClasses],
    `the surviving ${classPrefix}* names are exactly ${residueDescription}`
  );
}
