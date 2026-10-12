/** The test-only probe's manifest entry, injected through the seam factory's `table`, never shipped. */
export const PROBE_ENTRY = Object.freeze({
  name: 'PublishedProbe',
  path: 'tests/fixtures/published-components/PublishedProbe.svelte',
  version: 1,
  props: Object.freeze({
    text: Object.freeze({ kind: 'data' }),
    leading: Object.freeze({ kind: 'data' }),
    throwAt: Object.freeze({ kind: 'data' }),
    explode: Object.freeze({ kind: 'data' }),
  }),
  rest: true,
});
