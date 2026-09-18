export function getDragEventData(event) {
  const impl = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  if (impl?.getDragEventData) {
    return impl.getDragEventData(event);
  }

  // `text/plain` on the dataTransfer is the universal Foundry format.
  try {
    const raw = event?.dataTransfer?.getData?.('text/plain');
    if (raw) return JSON.parse(raw);
  } catch {
    // Not valid JSON: fall through to the null answer below.
  }

  return null;
}
