// Foundry themes and versions expose different header class names, so the known V13 containers are
// tried in turn before a matching fallback is created.
export function findItemsDirectoryActionsContainer(itemsDirectory, documentRef = globalThis.document) {
  const root = itemsDirectory?.element ?? null;
  if (!root) return null;

  const header = root.querySelector?.('.directory-header, header') ?? null;
  if (!header) return null;

  let actionsContainer = header.querySelector?.('.header-actions, .action-buttons') ?? null;
  if (!actionsContainer) {
    actionsContainer = header.querySelector?.('.directory-controls, .header-controls') ?? null;
  }
  if (!actionsContainer && documentRef?.createElement) {
    actionsContainer = documentRef.createElement('div');
    actionsContainer.className = 'header-actions action-buttons flexrow';
    header.appendChild(actionsContainer);
  }

  return actionsContainer;
}

// The button is present only while some crafting system enables gathering. This is IDEMPOTENT by
// design: a repeated sync removes stale and duplicate buttons, so feature changes and directory
// rerenders converge on one visible action.
export function syncGatheringDirectoryButton({
  itemsDirectory,
  enabled,
  createButton,
  documentRef = globalThis.document
} = {}) {
  const actionsContainer = findItemsDirectoryActionsContainer(itemsDirectory, documentRef);
  if (!actionsContainer) return { synced: false, visible: false };

  const existingButtons = Array.from(actionsContainer.querySelectorAll?.('button.create-document') ?? [])
    .filter(button =>
      button.dataset?.fabricateAction === 'gathering' ||
      button.textContent?.includes('Gathering')
    );

  if (enabled !== true) {
    for (const button of existingButtons) {
      button.remove();
    }
    return { synced: true, visible: false };
  }

  if (existingButtons.length > 0) {
    for (const duplicate of existingButtons.slice(1)) {
      duplicate.remove();
    }
    return { synced: true, visible: true };
  }

  const gatheringButton = createButton?.();
  if (!gatheringButton) return { synced: true, visible: false };
  actionsContainer.insertBefore(gatheringButton, craftButtonAnchor(actionsContainer));
  return { synced: true, visible: true };
}

function craftButtonAnchor(actionsContainer) {
  return Array.from(actionsContainer.querySelectorAll?.('button.create-document') ?? [])
    .find(button => button.dataset?.fabricateAction === 'craft') ?? actionsContainer.firstChild;
}
