/**
 * The one derivation of a Tool's displayed name, image and description (`data-models` "Tool"
 * requirement 13). An item-sourced Tool has `componentId: null` and its own snapshot, so reading
 * only the linked component shows a wrong identity. The caller resolves the linked component.
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

/** From an array of managed items. */
export function linkedComponentFor(tool, managedItems = []) {
  if (!tool?.componentId) return null;
  const items = Array.isArray(managedItems) ? managedItems : [];
  return items.find((item) => String(item?.id) === String(tool.componentId)) || null;
}
