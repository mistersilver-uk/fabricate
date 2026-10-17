/** A fresh id for a draft entry: Foundry's own where it is loaded, else a 16-character UUID slice. */
export function newDraftId() {
  const random = globalThis.foundry?.utils?.randomID;
  if (typeof random === 'function') return random();
  return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}
