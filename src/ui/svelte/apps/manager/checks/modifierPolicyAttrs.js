/**
 * The DOM hook names the check-modifier combination-rule group renders, hoisted out of
 * Svelte markup so a test can import them (issue 1095).
 *
 * WHY THIS MODULE EXISTS. `scripts/lib/viewLabCases.js` targets individual rule options by
 * `[${MODIFIER_POLICY_OPTION_ATTR}="bySubject"]`, and `tests/view-lab-cases.test.js` has to
 * assert that every value appearing in the registry is a real member of
 * `MODIFIER_POLICIES`. That guard is worthless if it restates the attribute NAME: the
 * moment the attribute is renamed, the guard extracts an EMPTY set, `[] ⊆
 * MODIFIER_POLICIES` holds, the test passes — and the registry's selectors point at a dead
 * hook, which fails the capture job WHOLE and publishes nothing while `check-screenshots`
 * stays green on stale frames.
 *
 * The obvious fix — "import the name from the component" — is not implementable:
 * `CraftingModifierCatalogueCard.svelte` passes the literal as a PROP VALUE in markup, has
 * no `<script module>`, exports nothing, and the consuming test is a plain `node --test`
 * file that compiles no Svelte. So the literal is hoisted HERE, consumed by the component
 * AND imported by the test, which is the same shape the `MODIFIER_POLICIES` import already
 * uses. Renaming the hook now moves both sides at once, or fails to compile.
 *
 * Deliberately import-free and Foundry-free.
 */

/**
 * The attribute `RadioCardGroup` stamps on the WRAPPER of the whole rule group.
 * @type {string}
 */
export const MODIFIER_POLICY_GROUP_ATTR = 'data-crafting-modifier-policy';

/**
 * The attribute `RadioCardGroup` stamps on EACH rule option, carrying that option's
 * `MODIFIER_POLICIES` value.
 *
 * The `crafting-` segment is a legacy spelling kept on purpose: renaming it would break
 * every published View Lab selector for no behavioural gain, and issue 1095 is already
 * renaming the rule VALUE (`byRecipe` → `bySubject`) that those same selectors carry.
 * Changing both in one release would leave no anchor for a bisect.
 * @type {string}
 */
export const MODIFIER_POLICY_OPTION_ATTR = 'data-crafting-modifier-policy-option';
