/**
 * The manager rail's entries, as `(stable id, visible label)` pairs (issue 1362, epic 1357).
 *
 * ## Why the smoke harness stopped matching a rail entry by its text
 *
 * The world scoped-entity leaves made rail labels ambiguous three separate ways at once, and
 * only one of the three is recoverable by DOM order:
 *
 *  - `Components` became `Component Rules`, while a `Component`-prefixed entry now exists in
 *    BOTH rail scopes, so no substring of either is unique;
 *  - `Tools` became `Tool Rules` and is now a live SUBSTRING of the world leaf
 *    `Tools Catalogue`, which `:has-text("Tools")` matches too — resolvable only by
 *    `.first()`, which is order, not identity;
 *  - `Tags & Categories` was NOT relabelled and is CHARACTER-FOR-CHARACTER IDENTICAL across
 *    the two scopes. There is no text locator that can tell those two buttons apart.
 *
 * So every rail button carries an `id`, and both harnesses target the id.
 *
 * ## Why the label is carried here as well
 *
 * Because an id-only harness stops checking the thing a GM actually reads. The smoke's
 * membership assertion walks these pairs: the id proves the entry is THERE, the label proves
 * it still SAYS what it is meant to say, and `tests/foundry-manager-rail-hooks.test.js`
 * checks both halves against the component that renders the rail — so a relabel that updated
 * the harness and not the component (or the reverse) fails in CI, on every commit, rather
 * than twenty-five minutes into a Foundry smoke run.
 *
 * ## It imports nothing
 *
 * Deliberately, and for the reason `managerLayoutGuards.js` gives: `foundry-test-run.mjs`
 * launches Chromium on import, so a test that needed these constants could not reach them
 * through the harness. This module is a pure leaf both sides import.
 */

/**
 * The SYSTEM-scope rail entries a selected crafting system renders, in DOM order.
 *
 * `Graph` is the planned-view placeholder: it renders `disabled`, which is exactly why it is
 * listed — a membership assertion that quietly stopped seeing it would report the rail as
 * healthy while an entry had gone.
 *
 * @type {ReadonlyArray<{id: string, label: string}>}
 */
export const MANAGER_SYSTEM_RAIL_ENTRIES = Object.freeze([
  Object.freeze({ id: 'manager-nav-system-overview', label: 'System Overview' }),
  Object.freeze({ id: 'manager-nav-crafting', label: 'Crafting' }),
  Object.freeze({ id: 'manager-nav-component-rules', label: 'Component Rules' }),
  Object.freeze({ id: 'manager-nav-tags', label: 'Tags & Categories' }),
  Object.freeze({ id: 'manager-nav-essence-rules', label: 'Essence Rules' }),
  Object.freeze({ id: 'manager-nav-tool-rules', label: 'Tool Rules' }),
  Object.freeze({ id: 'manager-nav-checks', label: 'Checks' }),
  Object.freeze({ id: 'manager-nav-gathering', label: 'Gathering' }),
  Object.freeze({ id: 'manager-nav-graph', label: 'Graph' }),
]);

/**
 * The WORLD-scope rail leaves this epic adds, in the prototype's authored order.
 *
 * THE THREE ODDITIES ARE AUTHORED, NOT TYPOS: the lowercase `c` in `Component catalogue`, the
 * plural in `Tools Catalogue`, and `Tags & Categories` duplicating the system entry exactly.
 * `scripts/visual-parity/inventory.mjs` asserts landmark ORDER against the prototype, so
 * "correcting" any of the three reds the parity gate.
 *
 * @type {ReadonlyArray<{id: string, label: string}>}
 */
export const MANAGER_WORLD_SCOPED_RAIL_ENTRIES = Object.freeze([
  Object.freeze({ id: 'manager-world-nav-component-catalogue', label: 'Component catalogue' }),
  Object.freeze({ id: 'manager-world-nav-vocabulary', label: 'Tags & Categories' }),
  Object.freeze({ id: 'manager-world-nav-essence-catalogue', label: 'Essence Catalogue' }),
  Object.freeze({ id: 'manager-world-nav-tool-catalogue', label: 'Tools Catalogue' }),
]);

/**
 * The CSS selector for one rail entry, scoped to the manager window.
 *
 * @param {string} id A rail entry id.
 * @returns {string}
 */
export function railSelector(id) {
  return `.fabricate-manager #${id}`;
}
