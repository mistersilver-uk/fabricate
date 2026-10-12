/**
 * The primitives published through `game.fabricate.api.ui`, in publication order: each entry is
 * `{ name, path, version, props: { <key>: { kind: 'data', required? } }, rest }`, frozen. An entry
 * is appended, never interleaved; a breaking change to one bumps its own `version` (issue 2426).
 */
export const PUBLISHED_COMPONENT_MANIFEST = Object.freeze([
  Object.freeze({
    name: 'TierTrack',
    path: 'src/ui/svelte/components/TierTrack.svelte',
    version: 1,
    props: Object.freeze({
      tiers: Object.freeze({ kind: 'data', required: true }),
      currentIndex: Object.freeze({ kind: 'data' }),
      direction: Object.freeze({ kind: 'data' }),
      layout: Object.freeze({ kind: 'data' }),
      ariaLabel: Object.freeze({ kind: 'data', required: true }),
      currentLabel: Object.freeze({ kind: 'data', required: true }),
      reachedLabel: Object.freeze({ kind: 'data', required: true }),
      aheadLabel: Object.freeze({ kind: 'data', required: true }),
      hint: Object.freeze({ kind: 'data' }),
    }),
    rest: true,
  }),
]);
