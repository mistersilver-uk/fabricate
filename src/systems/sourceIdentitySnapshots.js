/**
 * Source-identity SNAPSHOTS (issue 1699): the enricher-backed description resolver and the three
 * per-kind source snapshots, extracted from `CraftingSystemManager`. Every collaborator arrives in `io`,
 * rebuilt per call, so a patch to the manager member is still observed. Nothing here reads a Foundry global.
 */

/** The ordered description fields a Foundry Item may carry, most specific first. Shared by
 * {@link extractSourceDescription} and the repair pass's priming sweep, which needs the RAW
 * text only. */
function sourceDescriptionCandidates(source = null) {
  if (!source || typeof source !== 'object') return [];
  return [
    source?.system?.description?.value,
    source?.system?.description,
    source?.description?.value,
    source?.description,
  ];
}

/** The first non-empty RAW description text on a source document, without resolving anything;
 * feeds the repair pass's single priming sweep. */
export function rawSourceDescription(io, source = null) {
  for (const candidate of sourceDescriptionCandidates(source)) {
    const raw = io.descriptionTextCandidate(candidate);
    if (raw) return raw;
  }
  return '';
}

/** RESOLVE a source document's description through Foundry's enricher, then normalize the
 * enriched HTML to display-safe plain text — the whole point of issue 800, so a label-less
 * `@UUID[…]` becomes the referenced document's real NAME. Async because `enrichHTML` is. */
export async function extractSourceDescription(io, source = null) {
  if (!source || typeof source !== 'object') return '';

  const candidates = sourceDescriptionCandidates(source);

  for (const candidate of candidates) {
    const raw = io.descriptionTextCandidate(candidate);
    if (!raw) continue;
    const enriched = await io.enrichToHtml(raw, { relativeTo: source });
    const plainText = io.plainTextDescription(enriched);
    if (plainText) return plainText;
  }

  return '';
}

/** Build a component's source display snapshot: resolves refs and description through `io`, falling back to `fallbackItem` when unresolved. */
export async function buildComponentSourceSnapshot(
  io,
  itemUuid,
  source = null,
  fallbackItem = null,
  sourceData = null
) {
  const resolvedSourceData =
    sourceData ?? (await io.resolveImportedComponentSourceData(itemUuid, source));
  const sourceResolved = !!source;
  const fallbackName = fallbackItem?.name || itemUuid?.split('.')?.pop() || 'Imported Item';
  const fallbackImg = fallbackItem?.img || 'icons/svg/item-bag.svg';

  return {
    name: sourceResolved ? source?.name || fallbackName : fallbackName,
    img: sourceResolved ? source?.img || fallbackImg : fallbackImg,
    description: sourceResolved
      ? await io.extractSourceDescription(source)
      : io.normalizeComponentDescription(fallbackItem?.description),
    registeredItemUuid: resolvedSourceData.currentUuid,
    originItemUuid: resolvedSourceData.canonicalUuid,
    aliasItemUuids: resolvedSourceData.aliasItemUuids,
    sourceFallbacks: resolvedSourceData.sourceFallbacks,
    references: resolvedSourceData.references,
  };
}

/** Build a recipe-item definition's source display snapshot, the same reference union a
 * component records: resolves refs and description through `io`, falling back to `fallbackDefinition`. */
export async function buildRecipeItemSourceSnapshot(
  io,
  itemUuid,
  source = null,
  fallbackDefinition = null
) {
  // Resolve the same union of source refs a component records (live document uuid +
  // canonical compendium uuid + broken-source fallbacks), so a recipe item claims the
  // full breadth for matching (issue 555). Clone-gated identity is applied inside
  // `_resolveImportedSourceData`, so a duplicated source keys on its own uuid.
  const sourceData = await io.resolveImportedComponentSourceData(itemUuid, source);
  const fallbackName = fallbackDefinition?.name || itemUuid?.split('.')?.pop() || 'Recipe Item';
  const fallbackImg = fallbackDefinition?.img || 'icons/svg/item-bag.svg';

  return {
    name: source?.name || fallbackName,
    img: source?.img || fallbackImg,
    description: source
      ? await io.extractSourceDescription(source)
      : io.normalizeComponentDescription(fallbackDefinition?.description),
    registeredItemUuid: sourceData.currentUuid,
    originItemUuid: sourceData.canonicalUuid,
    aliasItemUuids: sourceData.aliasItemUuids,
  };
}

/** Build a first-class Tool's source snapshot from an Item uuid (issue 561): the same union of
 * source refs a component records, plus the `name` and `img` display snapshot — but NEVER
 * `label`, which is a distinct user-authored override. */
export async function buildToolSourceSnapshot(io, itemUuid, source = null) {
  const sourceData = await io.resolveImportedComponentSourceData(itemUuid, source);
  const fallbackName = itemUuid?.split('.')?.pop() || 'Imported Tool';
  return {
    name: source?.name || fallbackName,
    img: source?.img || 'icons/svg/item-bag.svg',
    description: source ? await io.extractSourceDescription(source) : '',
    registeredItemUuid: sourceData.currentUuid,
    originItemUuid: sourceData.canonicalUuid,
    aliasItemUuids: sourceData.aliasItemUuids,
  };
}

/** The alias set a re-pointed registration keeps: every ref the record already claimed, plus the
 * caller's extras, less the two the new source now owns. Pure — it needs no collaborator. */
export function buildFallbackSourceReferences(
  item,
  nextSourceUuid,
  nextSourceItemUuid,
  additionalFallbacks = []
) {
  const fallbackSet = new Set(Array.isArray(item?.aliasItemUuids) ? item.aliasItemUuids : []);
  for (const ref of [item?.registeredItemUuid, item?.originItemUuid]) {
    if (ref) fallbackSet.add(ref);
  }
  for (const ref of Array.isArray(additionalFallbacks) ? additionalFallbacks : []) {
    if (ref) fallbackSet.add(ref);
  }
  fallbackSet.delete(nextSourceUuid);
  fallbackSet.delete(nextSourceItemUuid);
  return [...fallbackSet];
}
