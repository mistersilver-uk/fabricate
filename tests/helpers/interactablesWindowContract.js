/**
 * What the three GM Interactables windows PROMISED when they joined the shared component
 * library (issue 1520), stated once for all three.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────
 * Each window's suite made the same two-part statement about the conversion, in the same
 * shape, over its own data: every CONTROL family is a shared primitive imported from the
 * library, and the window-prefixed class names that SURVIVE are an exact allow-list of that
 * window's own layout. Three copies of one statement is three places for the statement to
 * drift - and, because SonarCloud's copy/paste detector normalises literals, three
 * near-identical bodies over three different prefixes are duplicated code to the gate even
 * though every string in them differs.
 *
 * `tests/helpers/interactablesSmokeLocators.js` is the sibling of this file and the other
 * half of the same idea: it owns the HARNESS MIRROR (what the Foundry smoke addresses is
 * still emitted), where this one owns the LIBRARY ADOPTION (what the window renders and what
 * it is still allowed to paint itself). They are kept apart because they fail for different
 * reasons and are read by different people.
 *
 * ── WHY THE ALLOW-LIST IS EXACT, NOT A FLOOR ──────────────────────────────────────────────
 * `assert.deepEqual` in both directions is the whole point. A hand-rolled button, field, chip
 * or banner re-appearing ADDS a name; a name deleted without its markup DROPS one. A
 * "contains" test would see neither.
 */
import assert from 'node:assert/strict';

import { byTokenName } from './interactablesSmokeLocators.js';

/**
 * The rich GM config panel.
 *
 * `Stepper` is deliberately absent from its primitives: it converted earlier, and its own
 * contract - including the `<label>`-around-a-Stepper trap - lives in
 * `tests/helpers/stepperSourceContract.js`.
 *
 * Every surviving class is this window's own LAYOUT or one of its status readings - the
 * scroll column, the section rhythm, the facts grid, the node-state colours - which is the
 * half a shared primitive cannot own.
 *
 * `fab-ic-toggle` LEFT this list at review, and the way it left is the point. It was recorded
 * here as "not an unconverted control - the `<label>` around the native Hidden from players
 * checkbox, which carries no `aria-pressed` and is not a switch", and that reading was wrong in
 * a way an allow-list cannot catch: the class supplied flex layout and a font size and nothing
 * else, so the checkbox inside it was drawn by the browser - and adopting the area class put
 * `color-scheme: dark` on this window, taking that control from a light UA box on a dark panel
 * to a dark box on a dark panel at 1.15:1. It is a `StatusToggle` now, and the name went with
 * the markup. A residue entry justified by what a control is NOT is worth re-reading.
 *
 * `fab-ic-node-count-field` is on the list because the stepper's width cap is layout the
 * `<Field>` it now travels to does not own.
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

/**
 * The GM browser window.
 *
 * Its surviving names are this window's own LAYOUT - the scroll column, the header rhythm,
 * the list and its rows - or the two-tab strip, which this phase deliberately does not
 * convert because it is a tablist KEYBOARD CONTRACT (roving tabindex, arrow/Home/End,
 * aria-controls onto two panels) rather than a radio group.
 *
 * The four `fab-ib-tab-*` / `fab-ib-panel-*` entries are ID values rather than classes; they
 * are on the list because the scan reads the prefix wherever it is written, and pinning them
 * is what keeps the `aria-controls` / `aria-labelledby` pairing from being renamed on one
 * side only.
 */
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

/**
 * The GM Manage Interactables panel.
 *
 * `SegmentedControl` is the one primitive whose path is `apps/manager/` rather than
 * `components/`, and that is recorded rather than smoothed over - issue 1509 moves it, and
 * this pin is what makes the move visible here when it lands.
 *
 * The `fab-im-*` family also MOVED, from `styles/fabricate.css` into this root's own scoped
 * block: those 29 sheet rules were the only thing keeping the panel's appearance rooted at an
 * application class, so a scoped block is what makes the window host-independent.
 * `fabricate-interactables-manager-body` is deliberately NOT on the list - it stays in the
 * sheet, because the window's scroll containment is its frame contract rather than its
 * content layout.
 *
 * THREE ENTRIES ARE NOT CLASSES AT ALL, and they are on the list because the scan reads the
 * prefix wherever it is written: `fab-im-source-type`, `fab-im-visual-mode` and
 * `fab-im-marker-kind` are the radio groups' `name` attributes, carried across the conversion
 * byte for byte. Pinning them here is what keeps a rename from silently detaching the Foundry
 * smoke's own radio locator from the group it addresses.
 */
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
 * The IMPORT PATH is asserted, not merely the identifier: an adoption that reached for a local
 * copy, or for another window's directory, is not this window joining the library. And each
 * primitive is asserted RENDERED, because an unused import adopts nothing.
 *
 * The residue scan is `[a-z-]+` rather than the harness helper's letter-terminated
 * `[a-z-]*[a-z]`, deliberately: this one is a CENSUS rather than a locator lookup, so a
 * half-deleted `fab-ic-btn-` must be reported as the unexpected name it is rather than
 * quietly trimmed into a plausible one.
 *
 * @param {object} params
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
