/** Foundry drag-payload builders for mounted drop-zone tests (issue 1036). */

/**
 * Dispatch a Foundry drag payload as a real `drop` event on a node.
 *
 * @param {object} payload the parsed Foundry drag data.
 */
export function dispatchDrop(node, payload) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: () => JSON.stringify(payload) },
  });
  node.dispatchEvent(event);
}

/** Payloads an Item drop zone must refuse, whatever else changes about it. */
export const NON_ITEM_DROP_PAYLOADS = Object.freeze([
  { type: 'Actor', uuid: 'Actor.hero' },
  { type: 'Macro', uuid: 'Macro.dc' },
  { type: 'Folder', uuid: 'Folder.bag' },
  { type: 'Item' },
  { type: 'Item', uuid: '   ' },
  { type: 'Item', pack: 'fabricate.items' },
]);

/** Dispatch every {@link NON_ITEM_DROP_PAYLOADS} entry at a node. */
export function dispatchRejectedDrops(node) {
  for (const payload of NON_ITEM_DROP_PAYLOADS) dispatchDrop(node, payload);
}
