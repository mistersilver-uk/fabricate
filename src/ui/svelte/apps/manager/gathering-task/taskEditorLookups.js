/**
 * The gathering task editor's record lookups, shared by its tabs and cards (issue 1522): a managed
 * component by id, and a condition option's id, label and icon.
 */

export function managedItemFor(options, componentId) {
  return (
    (options || []).find((option) => String(option.id || '') === String(componentId || '')) || null
  );
}

export function conditionId(option) {
  return String(option?.id || option || '').trim();
}

export function conditionLabel(option) {
  return String(option?.label || option?.id || option || '').trim();
}

export function conditionIcon(option) {
  return String(option?.icon || 'fas fa-circle').trim();
}
