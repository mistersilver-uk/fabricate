/**
 * Foundry drag-payload builders for mounted drop-zone tests (issue 1036).
 *
 * `ItemDropZone`'s guard widened from a raw `data.uuid` read to `resolveDropUuid(data)`,
 * and acceptance criterion 7 requires EVERY existing call site to be shown still rejecting
 * a payload that is not the document type it asked for. That is four near-identical drop
 * loops across four suites, and SonarCloud counts `tests/**` exactly like `src/**`, so the
 * event construction and the rejected-payload table live here once.
 *
 * The event is a real `drop` carrying a `dataTransfer`, so a test drives the shipped
 * `dragDrop` action and `getDragEventData` rather than calling a handler directly.
 */

/**
 * Dispatch a Foundry drag payload as a real `drop` event on a node.
 *
 * @param {HTMLElement} node
 * @param {object} payload the parsed Foundry drag data.
 */
export function dispatchDrop(node, payload) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: () => JSON.stringify(payload) },
  });
  node.dispatchEvent(event);
}

/**
 * Payloads an Item drop zone must refuse, whatever else changes about it.
 *
 * Two families, and both matter:
 *
 * - a payload naming a DIFFERENT document type (`Actor`, `Macro`, `Folder`). The widened
 *   guard resolves a uuid out of more shapes than before, so the type check is now the only
 *   thing standing between an Item zone and a macro drop.
 * - a payload naming NO document at all — no `uuid`, a blank `uuid`, or half of the legacy
 *   compendium pair. `resolveDropUuid` returns `null` for each, which is what the widened
 *   guard tests.
 *
 * Deliberately does NOT include `{ type: 'Item', pack, id }`: that is a well-formed
 * compendium drag and the whole point of the widening is that it is now ACCEPTED.
 */
export const NON_ITEM_DROP_PAYLOADS = Object.freeze([
  { type: 'Actor', uuid: 'Actor.hero' },
  { type: 'Macro', uuid: 'Macro.dc' },
  { type: 'Folder', uuid: 'Folder.bag' },
  { type: 'Item' },
  { type: 'Item', uuid: '   ' },
  { type: 'Item', pack: 'fabricate.items' },
]);

/**
 * Dispatch every {@link NON_ITEM_DROP_PAYLOADS} entry at a node.
 *
 * @param {HTMLElement} node
 */
export function dispatchRejectedDrops(node) {
  for (const payload of NON_ITEM_DROP_PAYLOADS) dispatchDrop(node, payload);
}
