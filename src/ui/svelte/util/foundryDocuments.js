import { enrichToHtml } from './foundryEnrich.js';

export async function viewScene(uuid) {
  const id = String(uuid || '').trim();
  if (!id || typeof globalThis.fromUuid !== 'function') return false;
  const doc = await globalThis.fromUuid(id);
  if (doc && typeof doc.view === 'function') {
    await doc.view();
    return true;
  }
  return false;
}

async function itemSourceDescription(item) {
  // Most consumers need only the lightweight wrappers, so the description pipeline loads lazily.
  const { descriptionTextCandidate, plainTextDescription } =
    await import('../../../utils/plainTextDescription.js');
  const candidates = [
    item?.system?.description?.value,
    item?.system?.description,
    item?.description?.value,
    item?.description,
  ];
  for (const candidate of candidates) {
    const raw = descriptionTextCandidate(candidate);
    if (!raw) continue;
    const enriched = await enrichToHtml(raw, { relativeTo: item });
    const description = plainTextDescription(enriched);
    if (description) return description;
  }
  return '';
}

// Non-Item documents, missing documents and resolver failures are all rejected BEFORE a caller
// mutates draft state.
export async function resolveItemSourceSnapshot(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== 'function') return null;
  try {
    const item = await globalThis.fromUuid(uuid);
    if (item?.documentName !== 'Item') return null;
    return {
      uuid: item.uuid || uuid,
      name: item.name || '',
      img: item.img || '',
      type: item.type || '',
      description: await itemSourceDescription(item),
    };
  } catch {
    return null;
  }
}
