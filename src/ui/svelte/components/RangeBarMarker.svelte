<!--
  One marker on the shared range bar, `ThresholdBandStrip.svelte`, its only caller: a fixed
  marker's line inside the track, or a draggable marker's slider in the lane above it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `marker` | `{ id, label, draggable?, snap? }` | required | The caller's marker, as the strip takes it. |
  | `left` | number | `0` | Its place along the track, in percent. |
  | `stops` / `at` | `{ from, value, now, text, index }[]` / number | `[]` / `0` | A draggable marker's stops, from `markerStops`, and the one it rests at. |
  | `pageStep` / `disabled` | number / boolean | `1` / `false` | The page keys' stride over grid stops; inert when disabled. |
  | `measure()` | function | `() => null` | The track's scale, `{ left, width, min, span }`, read once per gesture. |
  | `onMarkerChange({ id, value, index }, { phase })` | function | no-op | A stop reached: `'drag'` per pointer move, the last re-emitted as `'commit'` on release or cancel, `'commit'` per key. |

  Invariants:
  - A FIXED MARKER IS A READING: a solid `--fab-text-muted` line, `aria-hidden`, with no tab stop,
    and never snapped; the strip states it in the group's hidden description.
  - THE DOT STRADDLES THE TRACK'S TOP EDGE in the strip's 13px lane, and its 24×24 slider ends 11px
    into the track, so it never meets a divider's hit area; `hit-areas-rendered.test.js` pins it.
-->
<script>
  import { bandIndexAt, markerBandStep, valueAtClientX } from '../util/rangeBarGeometry.js';

  let {
    marker,
    left = 0,
    stops = [],
    at = 0,
    pageStep = 1,
    disabled = false,
    measure = () => null,
    onMarkerChange = () => {},
  } = $props();

  let dragging = $state(false);
  let scale = null;
  let last = -1;
  let pending = null;

  function emit(position, phase) {
    const stop = stops[position];
    const change = { id: marker.id, value: stop.value, index: stop.index };
    if (phase === 'drag') pending = change;
    onMarkerChange(change, { phase });
  }

  function onkeydown(event) {
    if (disabled) return;
    const page = marker.snap === 'band' ? 1 : pageStep;
    const next = markerBandStep(event.key, at, stops.length, page);
    if (next === null) return;
    event.preventDefault();
    if (next !== at) emit(next, 'commit');
  }

  function onpointerdown(event) {
    if (disabled) return;
    dragging = true;
    scale = measure();
    last = at;
    pending = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus?.();
  }

  function onpointermove(event) {
    if (!dragging) return;
    const value = valueAtClientX(event.clientX, scale ?? measure());
    if (value === null) return;
    const position = Math.max(0, bandIndexAt(value, stops));
    if (position === last) return;
    last = position;
    emit(position, 'drag');
  }

  function onpointerup(event) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragging = false;
    scale = null;
    if (pending) onMarkerChange(pending, { phase: 'commit' });
    pending = null;
  }
</script>

{#if marker.draggable}
  <span
    class="fab-band-strip-marker"
    class:is-dragging={dragging}
    style={`left: ${left}%;`}
    role="slider"
    tabindex={disabled ? -1 : 0}
    data-keyboard-focus="true"
    aria-label={marker.label}
    aria-valuenow={stops[at].now}
    aria-valuemin={stops[0].now}
    aria-valuemax={stops.at(-1).now}
    aria-valuetext={stops[at].text}
    aria-disabled={disabled || undefined}
    aria-orientation="horizontal"
    data-band-strip-marker={marker.id}
    {onkeydown}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    onlostpointercapture={onpointerup}
  >
    <span class="fab-band-strip-dot" aria-hidden="true"></span>
  </span>
{:else}
  <span
    class="fab-band-strip-line"
    style={`left: ${left}%;`}
    aria-hidden="true"
    data-band-strip-marker-line={marker.id}
  ></span>
{/if}

<style>
  .fab-band-strip-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    transform: translateX(-50%);
    background: var(--fab-text-muted);
    pointer-events: none;
  }

  .fab-band-strip-marker {
    position: absolute;
    top: 0;
    z-index: 2;
    width: 24px;
    height: 24px;
    transform: translateX(-50%);
    border-radius: 6px;
    cursor: ew-resize;
    touch-action: none;
  }

  .fab-band-strip-marker[aria-disabled='true'] {
    cursor: default;
  }

  .fab-band-strip-marker:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .fab-band-strip-dot {
    position: absolute;
    top: 13px;
    left: 50%;
    width: 9px;
    height: 9px;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    background: var(--fab-accent);
  }

  .fab-band-strip-marker.is-dragging .fab-band-strip-dot,
  .fab-band-strip-marker:hover .fab-band-strip-dot {
    box-shadow: 0 0 0 3px var(--fab-accent-soft);
  }
</style>
