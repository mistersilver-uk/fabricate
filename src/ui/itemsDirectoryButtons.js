/**
 * Locate or create the Items Directory header action container.
 *
 * Foundry themes and versions can expose different header class names, so the
 * lookup accepts the known V13 containers before creating a matching fallback.
 *
 * @param {object} itemsDirectory Foundry Items sidebar directory instance.
 * @param {Document} [documentRef=globalThis.document] DOM document adapter.
 * @returns {HTMLElement|null} Header actions container, or null when unavailable.
 */
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

/**
 * Synchronize the player Gathering button in the Items Directory.
 *
 * The button is present only while at least one crafting system has the
 * gathering feature enabled. Repeated syncs remove stale/duplicate buttons so
 * system feature changes and directory rerenders converge on one visible action.
 *
 * @param {object} options Sync options.
 * @param {object} options.itemsDirectory Foundry Items sidebar directory.
 * @param {boolean} options.enabled Whether any system currently enables gathering.
 * @param {Function} options.createButton Factory for the Gathering button element.
 * @param {Document} [options.documentRef=globalThis.document] DOM document adapter.
 * @returns {{synced: boolean, visible: boolean}} Sync result.
 */
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
