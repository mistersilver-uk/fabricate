/**
 * The test-only probe's manifest entry, injected through the seam factory's `table`, never shipped.
 * `mirror` is the one value key an effect writes (issue 2453).
 */
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
    query: Object.freeze({ kind: 'value', initial: '' }),
    count: Object.freeze({ kind: 'value', initial: 0 }),
    mirror: Object.freeze({ kind: 'value', initial: '' }),
    mirrorAt: Object.freeze({ kind: 'data' }),
  }),
  rest: true,
  root: 'any',
});

/** The test-only overlay probe's entry, which opens an overlay through the seam (issue 2454). */
export const PROBE_OVERLAY_ENTRY = Object.freeze({
  name: 'PublishedOverlayProbe',
  path: 'tests/fixtures/published-components/PublishedOverlayProbe.svelte',
  version: 1,
  props: Object.freeze({
    open: Object.freeze({ kind: 'data' }),
    label: Object.freeze({ kind: 'data' }),
    explode: Object.freeze({ kind: 'data' }),
    onChoose: Object.freeze({ kind: 'callback', args: 1 }),
  }),
  rest: false,
  root: 'any',
  overlays: true,
});

/** The probe with no key the host draws content for, so its host takes the no-content path. */
export const PROBE_VALUE_ENTRY = Object.freeze({
  ...PROBE_ENTRY,
  props: Object.freeze({
    label: PROBE_ENTRY.props.label,
    query: PROBE_ENTRY.props.query,
    count: PROBE_ENTRY.props.count,
  }),
});
