<!--
  The product's ONE threshold band strip: N ordered, named bands over a value track, with a
  draggable, keyboard-operable handle on every INTERNAL boundary unless `readonly`, so N bands yield
  N−1 handles. It is a VISUALISATION, never the authority: the caller's numeric `Stepper`s edit the
  same state through the same `onChange`. Markers and an add rail are opt-in (issue 2431).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `binding` | `'relative'` \| `'fixed'` \| `'simple'` \| `'start'` | `'relative'` | Which authored field a handle writes, emitted as a PATCH rather than a raw index so a caller cannot get the mapping wrong. `relative` writes `{ binding, index: i + 1, dc }`; `fixed` writes the coupled pair as ONE update, `{ binding, index: i, end: v - 1, nextIndex: i + 1, start: v }`, because ranges are inclusive on both ends and the boundary value IS the next band's start; `simple` writes `{ binding, dc: v }`; `start` writes `{ binding, index: i + 1, start: v }`, the start of the band beginning there; unlike the other bindings it may draw a single band. |
  | `bands` | `{ id, name, color, ink, from, to?, index? }[]` | `[]` | ABSOLUTE track values, whatever the binding underneath. `to` is derived from the next band's `from` when omitted. `ink` travels with `color` because the two are ONE decision: the name is drawn ON the fill, so whoever picks the fill is the only party that can know what stays readable on it. Bands are DRAWN in value order and WRITTEN through `index`, the position in the caller's own AUTHORED array; the two differ for a descending tier list, and sorting the authored array instead would reorder the tier rows from a drag. |
  | `previewDc` / `previewLabel` | number / string | `0` / `''` | The previewed record. Only `relative` reads the DC, to convert absolute ↔ offset. |
  | `step` / `pageStep` / `min` / `max` | numbers or `null` | `1` / `5` / `null` / `null` | The keyboard increments and snap grid, and the track domain overrides `simple` passes the DC stepper's own range through. |
  | `ariaLabel` / `boundaryLabel(band, next)` | string / function | `'Outcome bands'` / name pair | The group's accessible name, composed with `previewLabel`, and the accessible name of the handle between two bands. |
  | `fallbackNote` | string | `''` | Rendered INSTEAD of the strip when the authored set is not contiguous: a gapped or overlapping FIXED set is reachable and a contiguous strip cannot draw it, so the tier rows are left as the only editor. |
  | `disabled` / `class` | boolean / class string | `false` / `''` | The handles go inert, and an extra class appended to the root's own. |
  | `leadingTick` | string | `''` | A label under the track's start, before the boundary ticks: a count strip passes `<0` under its Botch band. |
  | `readonly` | boolean | `false` | A derived band PICTURE: no handles, so no slider role, tabindex or drag cursor, and the group is described by a visually hidden list of each band's `name` and caller-formatted `range` (`bands[].range`). |
  | `onChange(patch, { phase })` | function | no-op | The authored patch, per binding above. A pointer move emits `phase: 'drag'`, its release or cancel re-emits the last patch as `'commit'`, and every key emits `'commit'`. |
  | `formatValue(value)` / `ticks` | function / boolean | `String` / `true` | Formats every tick and value text; `ticks={false}` omits the tick row. |
  | `rangeSublabels` | boolean | `false` | Draws `bands[].range` under each name, inside the fixed 46px track. |
  | `markers` | `{ id, value, label, valueText?, draggable?, snap? }[]` | `[]` | A fixed marker is a reading: a line, stated in the hidden description. A draggable one is a slider in a 13px lane above the track, over each grid value or, with `snap: 'band'`, each band's centre. |
  | `onMarkerChange({ id, value, index }, { phase })` | function | no-op | A draggable marker's stop, with the authored `index` of its band, in the phases above. |
  | `addable` / `railLabel` / `addLabel(band)` | boolean / string / function | `false` / `''` / name | A toolbar under the track with one 24px add per band at least two steps wide, named by `addLabel`, skipping one that would overlap its neighbour at the measured width. |
  | `onAdd({ index, value })` | function | no-op | The band's authored index and its midpoint, rounded down to the step; the strip creates nothing. |

  Rest spread:
  - `{...rest}` lands on the root, written after `class`, whichever of the strip and its fallback
    note renders, and carries a caller's `data-*` hook.

  Invariants:
  - NO GRADIENT, AND NO VISUAL-STYLE EXEMPTION CLAIMED: `ui-visual-style/spec.md` exempts a
    FULL-TRACK semantic scale, and this strip claims none, because per-band identity is the point. A
    runtime colour applied inline is authored DATA rather than a source literal, so it is outside
    `tests/components/theme-colour-contract.test.js`'s remit, and a band with no authored colour
    falls back to a theme token through a CLASS.
  - `aria-valuenow` CARRIES THE ABSOLUTE NUMBER and `aria-valuetext` CARRIES BOTH READINGS, because
    in `relative` mode the tier rows author OFFSETS while the strip renders absolutes against a
    previewed record — so switching records re-announces every handle with no data change.
  - EVERY BAND KEEPS AT LEAST ONE STEP OF WIDTH, including the first and the last, so the bounds are
    one step inside the neighbouring boundaries and one step inside the TRACK at the outermost
    handles; without it handle 0 collapses a named tier to nothing, with its focus ring clipped away
    by the track's `overflow: hidden`. In `relative` mode "one step" is the TIER interval.
  - A HANDLE DRAGGED OR KEYED PAST A NEIGHBOUR CLAMPS. It never swaps and never reorders: reordering
    a tier list from a drag is a data change no undo on this surface can express.
  - THE CHECK STRIPS PASS NONE OF THE OPT-IN PROPS, and their markup is frozen by
    `tests/fixtures/threshold-band-strip/checkCallerStrips.js`; a drag's release re-sends its last
    patch to them once, an identical write.
  - EVERY HANDLE IS A REAL ARIA WIDGET: `role="slider"`, focusable, with a hit area of at least
    24×24 CSS pixels (WCAG 2.5.8), because the ~2px seam is not a target. A `role="button"` wrapper
    is never converted into a `<button>`, which would nest buttons and land invalid DOM.
-->
<script>
  import IconButton from './IconButton.svelte';
  import RangeBarMarker from './RangeBarMarker.svelte';
  import {
    ariaBoundsFor,
    bandDomain,
    bandEnd,
    boundaryPatch,
    boundsFor,
    clampTo,
    markerBandStep,
    markerLayout,
    railSeeds,
    resolveBands,
    snapTo,
    trackMaxOf,
    valueAtClientX,
  } from '../util/rangeBarGeometry.js';

  let {
    binding = 'relative',
    bands = [],
    previewDc = 0,
    previewLabel = '',
    step = 1,
    pageStep = 5,
    min = null,
    max = null,
    ariaLabel = 'Outcome bands',
    boundaryLabel = (band, nextBand) => `${band?.name || ''} / ${nextBand?.name || ''}`,
    fallbackNote = '',
    disabled = false,
    readonly = false,
    leadingTick = '',
    onChange = () => {},
    markers = [],
    onMarkerChange = () => {},
    addable = false,
    railLabel = '',
    addLabel = (band) => band?.name || '',
    onAdd = () => {},
    formatValue = String,
    rangeSublabels = false,
    ticks = true,
    class: extraClass = '',
    ...rest
  } = $props();

  const instanceId = $props.id();
  const bandListId = `${instanceId}-bands`;

  let trackElement = $state(null);
  let trackWidth = $state(0);
  let dragIndex = $state(-1);
  let railStop = $state(0);

  const resolved = $derived(resolveBands(bands, binding === 'start' ? 1 : 2));
  const boundaries = $derived(resolved ? resolved.slice(1).map((row) => row.from) : []);
  const domain = $derived(bandDomain({ rows: resolved, boundaries, min, max, binding, step }));
  const trackMax = $derived(trackMaxOf({ rows: resolved, binding, max, domain }));
  const span = $derived(Math.max(trackMax - domain.min, Number.EPSILON));
  const percentOf = (value) => ((value - domain.min) / span) * 100;
  const geometry = $derived({ boundaries, domainMin: domain.min, trackMax, step });
  const layout = $derived(markerLayout(markers, resolved, geometry, formatValue));
  const draggable = $derived(readonly ? [] : layout.draggable);
  const described = $derived(readonly || layout.fixed.length > 0);
  const seeds = $derived(
    addable && !readonly && resolved ? railSeeds(resolved, trackMax, step, trackWidth / span) : []
  );
  const railAt = $derived(Math.min(railStop, seeds.length - 1));

  /** A gesture's last drag, re-emitted as its commit on release (issue 2431). */
  let pendingCommit = null;

  function commit(index, rawValue, phase = 'commit') {
    if (disabled) return;
    const next = clampTo(index, snapTo(rawValue, domain.min, step), geometry);
    const from = phase === 'drag' && pendingCommit ? pendingCommit.next : boundaries[index];
    if (next === from) return;
    const patch = boundaryPatch({ binding, rows: resolved, index, next, previewDc });
    if (phase === 'drag') pendingCommit = { next, patch };
    onChange(patch, { phase });
  }

  const KEY_DELTAS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

  function onHandleKeydown(event, index) {
    if (disabled) return;
    const current = boundaries[index];
    let next = null;
    if (event.key in KEY_DELTAS) next = current + KEY_DELTAS[event.key] * step;
    else if (event.key === 'PageUp') next = current + pageStep * step;
    else if (event.key === 'PageDown') next = current - pageStep * step;
    else if (event.key === 'Home') next = boundsFor(index, geometry)[0];
    else if (event.key === 'End') next = boundsFor(index, geometry)[1];
    if (next === null) return;
    event.preventDefault();
    commit(index, next);
  }

  let dragScale = null;

  const measure = () => {
    const rect = trackElement?.getBoundingClientRect?.();
    return rect?.width ? { left: rect.left, width: rect.width, min: domain.min, span } : null;
  };

  function onHandlePointerdown(event, index) {
    if (disabled) return;
    dragIndex = index;
    dragScale = measure();
    pendingCommit = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus?.();
  }

  function onHandlePointermove(event) {
    if (dragIndex < 0) return;
    const value = valueAtClientX(event.clientX, dragScale ?? measure());
    if (value === null) return;
    commit(dragIndex, value, 'drag');
  }

  function onHandlePointerup(event) {
    if (dragIndex < 0) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragIndex = -1;
    dragScale = null;
    if (pendingCommit) onChange(pendingCommit.patch, { phase: 'commit' });
    pendingCommit = null;
  }

  function onRailKeydown(event) {
    const next = markerBandStep(event.key, railAt, seeds.length);
    if (next === null) return;
    event.preventDefault();
    railStop = next;
    event.currentTarget.querySelectorAll('[data-band-strip-add]')[next]?.focus();
  }

  function valueText(index) {
    const absolute = formatValue(boundaries[index]);
    if (binding !== 'relative') {
      return previewLabel ? `${absolute} — ${previewLabel}` : absolute;
    }
    const offset = boundaries[index] - previewDc;
    const signed = offset >= 0 ? `+${offset}` : String(offset);
    return previewLabel
      ? `${absolute} — DC ${signed} against ${previewLabel}`
      : `${absolute} — DC ${signed}`;
  }
</script>

{#if !resolved}
  <p class={['fab-band-strip-fallback', extraClass]} data-band-strip-fallback {...rest}>
    {fallbackNote}
  </p>
{:else}
  <div class={['fab-band-strip', draggable.length > 0 && 'has-marker-lane', extraClass]} {...rest}>
    {#each draggable as { marker, stops, at, left } (marker.id)}
      <RangeBarMarker
        {marker}
        {stops}
        {at}
        {left}
        {pageStep}
        {disabled}
        {measure}
        {onMarkerChange}
      />
    {/each}
    <div
      class="fab-band-strip-track"
      class:is-disabled={disabled}
      bind:this={trackElement}
      bind:clientWidth={trackWidth}
      role="group"
      aria-label={previewLabel ? `${ariaLabel} — ${previewLabel}` : ariaLabel}
      aria-describedby={described ? bandListId : undefined}
      data-band-strip-track
    >
      {#each resolved as band, index (band.id || index)}
        {@const from = band.from}
        {@const to = bandEnd(resolved, index, trackMax)}
        {@const sublabel = rangeSublabels && band.range}
        <span
          class="fab-band-strip-band"
          class:is-untinted={!band.color}
          class:has-range={sublabel}
          style={`left: ${percentOf(from)}%; width: ${percentOf(to) - percentOf(from)}%;${
            band.color ? ` --fab-band-strip-fill: ${band.color};` : ''
          }${band.ink ? ` --fab-band-strip-ink: ${band.ink};` : ''}`}
          data-band-strip-band={band.id || index}
        >
          <span class="fab-band-strip-band-name">{band.name}</span>
          {#if sublabel}
            <span class="fab-band-strip-band-range" data-band-strip-range>{band.range}</span>
          {/if}
        </span>
      {/each}

      {#each layout.fixed as { marker, left } (marker.id)}
        <RangeBarMarker {marker} {left} />
      {/each}

      {#each readonly ? [] : boundaries as boundary, index (index)}
        {@const bounds = ariaBoundsFor(index, geometry)}
        <span
          class="fab-band-strip-handle"
          class:is-dragging={dragIndex === index}
          style={`left: ${percentOf(boundary)}%;`}
          role="slider"
          tabindex={disabled ? -1 : 0}
          data-keyboard-focus="true"
          aria-label={boundaryLabel(resolved[index], resolved[index + 1])}
          aria-valuenow={boundary}
          aria-valuemin={bounds[0]}
          aria-valuemax={bounds[1]}
          aria-valuetext={valueText(index)}
          aria-disabled={disabled || undefined}
          aria-orientation="horizontal"
          data-band-strip-handle={index}
          onkeydown={(event) => onHandleKeydown(event, index)}
          onpointerdown={(event) => onHandlePointerdown(event, index)}
          onpointermove={onHandlePointermove}
          onpointerup={onHandlePointerup}
          onpointercancel={onHandlePointerup}
          onlostpointercapture={onHandlePointerup}
        >
          <span class="fab-band-strip-grip" aria-hidden="true"></span>
        </span>
      {/each}
    </div>

    {#if ticks}
      <div class="fab-band-strip-ticks" aria-hidden="true">
        {#if leadingTick}
          <span
            class="fab-band-strip-tick is-leading"
            style="left: 0%;"
            data-band-strip-leading-tick
          >
            {leadingTick}
          </span>
        {/if}
        {#each boundaries as boundary, index (index)}
          <span class="fab-band-strip-tick" style={`left: ${percentOf(boundary)}%;`}
            >{formatValue(boundary)}</span
          >
        {/each}
      </div>
    {/if}
    {#if seeds.length > 0}
      <div
        class="fab-band-strip-rail"
        role="toolbar"
        tabindex="-1"
        data-keyboard-focus="true"
        aria-label={railLabel || undefined}
        data-band-strip-rail
        onkeydown={onRailKeydown}
      >
        {#each seeds as seed, position (seed.band.id || position)}
          <span class="fab-band-strip-rail-slot" style={`left: ${percentOf(seed.value)}%;`}>
            <IconButton
              size={24}
              ariaLabel={addLabel(seed.band)}
              {disabled}
              tabindex={position === railAt ? 0 : -1}
              data-keyboard-focus="true"
              data-band-strip-add={seed.band.id || position}
              onfocus={() => (railStop = position)}
              onclick={() => onAdd({ index: seed.band.index, value: seed.value })}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
            </IconButton>
          </span>
        {/each}
      </div>
    {/if}
    {#if described}
      <ul class="visually-hidden" id={bandListId} data-band-strip-band-list>
        {#each resolved as band, index (band.id || index)}
          <li>{band.range ? `${band.name}: ${band.range}` : band.name}</li>
        {/each}
        {#each layout.fixed as { marker, value } (marker.id)}
          <li>{`${marker.label}: ${marker.valueText ?? formatValue(value)}`}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .fab-band-strip {
    box-sizing: border-box;
    display: block;
    width: 100%;
  }

  .fab-band-strip.has-marker-lane {
    position: relative;
    /* ratchet-exempt(design-system): a derived lane, not spacing; the 24px dot hit area centred on the track's top edge reaches 13px above it */
    padding-top: 13px;
  }

  .fab-band-strip-track {
    position: relative;
    box-sizing: border-box;
    width: 100%;

    height: 46px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-0);
  }

  .fab-band-strip-band {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0 var(--fab-space-chip);
    overflow: hidden;
    background: var(--fab-band-strip-fill, var(--fab-surface-soft));
  }

  .fab-band-strip-band.is-untinted {
    background: var(--fab-surface-active);
  }

  .fab-band-strip-band + .fab-band-strip-band {
    border-left: 1px solid var(--fab-bg-0);
  }

  .fab-band-strip-band-name {
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-band-strip-ink, var(--fab-text));
    font-size: 10px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-band-strip-band.has-range {
    flex-direction: column;
  }

  .fab-band-strip-band.has-range .fab-band-strip-band-name {
    line-height: 1.2;
  }

  .fab-band-strip-band-range {
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-band-strip-ink, var(--fab-text));
    font-family: var(--fab-font-mono);
    font-size: 8.5px;
    font-weight: 500;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-band-strip-handle {
    position: absolute;
    top: 50%;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    transform: translate(-50%, -50%);
    border-radius: 6px;
    cursor: ew-resize;
    touch-action: none;
  }

  .fab-band-strip-handle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .fab-band-strip-grip {
    display: block;
    width: 6px;
    height: 20px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 999px;
    background: var(--fab-surface);
  }

  .fab-band-strip-handle.is-dragging .fab-band-strip-grip,
  .fab-band-strip-handle:hover .fab-band-strip-grip {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .fab-band-strip-track.is-disabled .fab-band-strip-handle {
    cursor: default;
  }

  .fab-band-strip-ticks {
    position: relative;
    height: 16px;
    margin-top: var(--fab-space-2xs);
  }

  .fab-band-strip-tick {
    position: absolute;
    transform: translateX(-50%);
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-band-strip-tick.is-leading {
    transform: none;
  }

  .fab-band-strip-rail {
    position: relative;
    height: 24px;
    margin-top: var(--fab-space-2xs);
  }

  .fab-band-strip-rail-slot {
    position: absolute;
    top: 0;
    display: flex;
    transform: translateX(-50%);
  }

  .fab-band-strip-fallback {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.7rem;
    line-height: 1.45;
  }
</style>
