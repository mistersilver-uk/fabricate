/**
 * The primitives published through `game.fabricate.api.ui`, in publication order: each entry is
 * `{ name, path, version, props: { <key>: { kind: 'data', required? } }, rest }`, frozen. An entry
 * is appended, never interleaved; a breaking change to one bumps its own `version` (issue 2426).
 */
export const PUBLISHED_COMPONENT_MANIFEST = Object.freeze([]);
