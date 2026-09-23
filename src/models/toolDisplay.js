/**
 * The single derivation of a Tool's displayed name, image and description (data-models "Tool"
 * requirement 13). Since issue 561 a first-class item-sourced Tool carries `componentId: null` and
 * holds its identity in its own display snapshot, so a resolver consulting only the linked
 * component renders a placeholder or a plausible-but-wrong identity — the rule had recurred in
 * seven surfaces (issues 976, 1119) because the reference implementation lived in the manager UI.
 * This is the layering-neutral home, and the CALLER resolves the linked component, so no lookup
 * convention lands here.
 */

/** The sentinel used when neither a Tool nor its linked component carries artwork. */
export const TOOL_IMAGE_SENTINEL = 'icons/svg/item-bag.svg';

/** Displayed name: authored `label`, the snapshot, the linked component, then `fallback`. */
export function resolveToolDisplayName(tool, linkedComponent = null, fallback = 'Untitled tool') {
  return String(tool?.label || '').trim() || tool?.name || linkedComponent?.name || fallback;
}

/** Displayed image: the snapshot, the linked component, then {@link TOOL_IMAGE_SENTINEL}. */
export function resolveToolDisplayImage(tool, linkedComponent = null) {
  return tool?.img || linkedComponent?.img || TOOL_IMAGE_SENTINEL;
}

/** Description: the registration snapshot, then the linked component, then the empty string. */
export function resolveToolDescription(tool, linkedComponent = null) {
  return String(tool?.description || linkedComponent?.description || '').trim();
}

/** Resolve the managed component a Tool links to, from an array of managed items. */
export function linkedComponentFor(tool, managedItems = []) {
  if (!tool?.componentId) return null;
  const items = Array.isArray(managedItems) ? managedItems : [];
  return items.find((item) => String(item?.id) === String(tool.componentId)) || null;
}
