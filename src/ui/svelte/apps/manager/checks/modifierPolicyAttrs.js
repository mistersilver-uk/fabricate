/**
 * The DOM hook names the check-modifier combination-rule group renders, hoisted out of Svelte
 * markup so a test can import them. `scripts/lib/viewLabCases.js` targets rule options by that
 * attribute and `tests/view-lab-cases.test.js` asserts every value in the registry is a real
 * `MODIFIER_POLICIES` member — a guard worthless if it RESTATES the name: on a rename it
 * extracts an EMPTY set, the subset assertion holds, and the registry's selectors point at a
 * dead hook, failing the capture job whole while `check-screenshots` stays green on stale
 * frames. Importing the name from the component is not implementable: the card passes the
 * literal as a PROP VALUE in markup and exports nothing. */

/** The attribute `RadioCardGroup` stamps on the WRAPPER of the whole rule group.
 *  @type {string} */
export const MODIFIER_POLICY_GROUP_ATTR = 'data-crafting-modifier-policy';

/**
 * The attribute `RadioCardGroup` stamps on EACH rule option, carrying that option's
 * `MODIFIER_POLICIES` value. The `crafting-` segment is a legacy spelling kept on purpose:
 * renaming it would break every published View Lab selector for no behavioural gain.
 * @type {string}
 */
export const MODIFIER_POLICY_OPTION_ATTR = 'data-crafting-modifier-policy-option';
