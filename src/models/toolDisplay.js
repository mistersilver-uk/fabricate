/**
 * The single derivation of a Tool's displayed name, image and description
 * (`data-models/spec.md` `## Tool` requirement 13).
 *
 * Since issue 561 a first-class, item-sourced Tool carries `componentId: null` and holds its
 * identity in a `name`/`img`/`description` display snapshot. A resolver that consults only the
 * linked managed component therefore renders a placeholder — or, worse, a plausible-but-wrong
 * identity — for a Tool whose own fields are fully populated. Issue 976 fixed two manager
 * surfaces that had each re-derived the rule; the sweep for issue 1119 found five more, in
 * `src/systems/` and `src/main.js`.
 *
 * Those surfaces could not reuse the previous reference implementation
 * (`src/ui/svelte/apps/manager/tools/toolStudio.js`) without inverting the layering — an engine
 * importing from the manager UI. That architectural fact is the mechanism by which the rule
 * recurred. This module is the layering-neutral home: `toolStudio.js` now re-exports it, and
 * every non-UI surface imports it directly.
 *
 * The **caller** resolves the linked component, because the consuming surfaces hold their
 * component lookup in three different shapes (an array, a pre-flattened pair of fields, and a
 * Map). Taking the resolved component keeps this module free of any lookup convention — which is
 * what let three surfaces drift in the first place.
 *
 * @module models/toolDisplay
 */

/**
 * The generic sentinel a Tool falls back to when neither it nor its linked component carries
 * artwork. Player-facing surfaces may map this to "no image" so the row inherits the same default
 * artwork an unarted component shows; GM surfaces render it literally.
 * @type {string}
 */
export const TOOL_IMAGE_SENTINEL = 'icons/svg/item-bag.svg';

/**
 * Resolve a Tool's displayed name: the user-authored `label` (trimmed) when non-empty, then the
 * registration display snapshot, then the linked managed component, then `fallback`.
 *
 * The snapshot outranks the linked component deliberately: a whetstone that is both a managed
 * component and a registered Tool keeps `componentId` populated, and its own snapshot is the more
 * specific identity.
 *
 * @param {object|null} tool The Tool (persisted or draft).
 * @param {object|null} [linkedComponent] The managed component `tool.componentId` names, already
 *   resolved by the caller. Pass `null` for an item-sourced Tool.
 * @param {string} [fallback] Localized last-resort name.
 * @returns {string}
 */
export function resolveToolDisplayName(tool, linkedComponent = null, fallback = 'Untitled tool') {
  return String(tool?.label || '').trim() || tool?.name || linkedComponent?.name || fallback;
}

/**
 * Resolve a Tool's displayed image: the registration snapshot, then the linked managed component,
 * then {@link TOOL_IMAGE_SENTINEL}.
 *
 * There is no `label` rung — `label` is a name override only.
 *
 * @param {object|null} tool The Tool (persisted or draft).
 * @param {object|null} [linkedComponent] The resolved managed component, or `null`.
 * @returns {string}
 */
export function resolveToolDisplayImage(tool, linkedComponent = null) {
  return tool?.img || linkedComponent?.img || TOOL_IMAGE_SENTINEL;
}

/**
 * Resolve a Tool's description: the registration snapshot, then the linked managed component,
 * then the empty string. Always trimmed.
 *
 * @param {object|null} tool The Tool (persisted or draft).
 * @param {object|null} [linkedComponent] The resolved managed component, or `null`.
 * @returns {string}
 */
export function resolveToolDescription(tool, linkedComponent = null) {
  return String(tool?.description || linkedComponent?.description || '').trim();
}

/**
 * Resolve the managed component a Tool links to, from an array of managed items. The common
 * caller shape; surfaces holding a Map or pre-flattened fields resolve their own and pass the
 * result straight to the three resolvers above.
 *
 * Deliberately returns `null` for an item-sourced Tool (`componentId: null`) rather than
 * falling back to any other entry — a Tool that names no component has no component.
 *
 * @param {object|null} tool
 * @param {object[]} [managedItems]
 * @returns {object|null}
 */
export function linkedComponentFor(tool, managedItems = []) {
  if (!tool?.componentId) return null;
  const items = Array.isArray(managedItems) ? managedItems : [];
  return items.find((item) => String(item?.id) === String(tool.componentId)) || null;
}
