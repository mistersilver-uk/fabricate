/**
 * Core's `parseUuid` edge semantics rather than its happy path: a double stricter or looser than
 * core manufactures a refusal, or a resolution, that production never makes.
 *
 * @returns {object|null} `null` for a non-string uuid and for a malformed embedded chain.
 */
export function parseUuidDouble(uuid) {
  if (typeof uuid !== 'string') return null;
  const parts = uuid.split('.');
  const identity = {
    collection: parts[0] ?? null,
    documentId: parts.at(-1) ?? null,
    id: parts.at(-1) ?? null,
  };
  // A single segment is not malformed to core: an unresolvable primary id is not a parse failure.
  if (parts.length < 2) return { ...identity, embedded: [] };
  // The `Compendium`/scope/pack triple first when present, then the primary `<Type>.<id>` pair.
  if (parts[0] === 'Compendium') parts.splice(0, 3);
  parts.splice(0, 2);
  // An odd remainder core answers `null` for rather than half-reading it.
  if (parts.length % 2 !== 0) return null;
  return { ...identity, embedded: parts };
}
