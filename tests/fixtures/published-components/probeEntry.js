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
    note: Object.freeze({ kind: 'text' }),
    aside: Object.freeze({ kind: 'slot', element: 'span' }),
    body: Object.freeze({ kind: 'slot' }),
    bodyAs: Object.freeze({ kind: 'data' }),
    label: Object.freeze({ kind: 'data' }),
    pickAt: Object.freeze({ kind: 'data' }),
    onPing: Object.freeze({ kind: 'callback' }),
    onPick: Object.freeze({ kind: 'callback', args: 1 }),
  }),
  rest: true,
  root: 'any',
});
