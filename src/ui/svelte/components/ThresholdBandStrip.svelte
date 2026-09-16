<!--
  The product's ONE threshold band strip: N ordered, named bands over a value track, with a
  draggable, keyboard-operable handle on every INTERNAL boundary, so N bands yield N−1 handles. It is
  a VISUALISATION, never the authority: the numeric `Stepper`s in the tier rows below edit the same
  state through the same `onChange`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `binding` | `'relative'` \| `'fixed'` \| `'simple'` | `'relative'` | Which authored field a handle writes, emitted as a PATCH rather than a raw index so a caller cannot get the mapping wrong. `relative` writes `{ binding, index: i + 1, dc }`; `fixed` writes the coupled pair as ONE update, `{ binding, index: i, end: v - 1, nextIndex: i + 1, start: v }`, because ranges are inclusive on both ends and the boundary value IS the next band's start; `simple` writes `{ binding, dc: v }`. |
  | `bands` | `{ id, name, color, ink, from, to?, index? }[]` | `[]` | ABSOLUTE track values, whatever the binding underneath. `to` is derived from the next band's `from` when omitted. `ink` travels with `color` because the two are ONE decision: the name is drawn ON the fill, so whoever picks the fill is the only party that can know what stays readable on it. Bands are DRAWN in value order and WRITTEN through `index`, the position in the caller's own AUTHORED array; the two differ for a descending tier list, and sorting the authored array instead would reorder the tier rows from a drag. |
  | `previewDc` / `previewLabel` | number / string | `0` / `''` | The previewed record. Only `relative` reads the DC, to convert absolute ↔ offset. |
  | `step` / `pageStep` / `min` / `max` | numbers or `null` | `1` / `5` / `null` / `null` | The keyboard increments and snap grid, and the track domain overrides `simple` passes the DC stepper's own range through. |
  | `groupLabel` / `boundaryLabel(band, next)` | string / function | `'Outcome bands'` / name pair | The group's accessible name, and the accessible name of the handle between two bands. |
  | `fallbackNote` | string | `''` | Rendered INSTEAD of the strip when the authored set is not contiguous: a gapped or overlapping FIXED set is reachable and a contiguous strip cannot draw it, so the tier rows are left as the only editor. |
  | `disabled` / `dataAttr` / `dataValue` | boolean / strings | `false` / `''` | The handles go inert, and the caller's own hook on the root. |
  | `onChange(patch)` | function | no-op | The authored patch, per binding above. |

  Invariants:
  - NO GRADIENT, AND NO VISUAL-STYLE EXEMPTION CLAIMED: `ui-integration/spec.md` exempts a
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
  - EVERY HANDLE IS A REAL ARIA WIDGET: `role="slider"`, focusable, with a hit area of at least
    24×24 CSS pixels (WCAG 2.5.8), because the ~2px seam is not a target. A `role="button"` wrapper
    is never converted into a `<button>`, which would nest buttons and land invalid DOM.
-->
<script>
  let {
    binding = 'relative',
    bands = [],
    previewDc = 0,
    previewLabel = '',
    step = 1,
    pageStep = 5,
    min = null,
    max = null,
    groupLabel = 'Outcome bands',
    boundaryLabel = (band, nextBand) => `${band?.name || ''} / ${nextBand?.name || ''}`,
    fallbackNote = '',
    disabled = false,
    dataAttr = '',
    dataValue = '',
    onChange = () => {},
  } = $props();

  let trackElement = $state(null);
  let dragIndex = $state(-1);

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});

  const numeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const resolved = $derived.by(() => {
    if (!Array.isArray(bands) || bands.length < 2) return null;
    const rows = bands
      .map((band, position) => ({
        id: band?.id ?? '',
        name: band?.name ?? '',
        color: typeof band?.color === 'string' ? band.color : '',
        ink: typeof band?.ink === 'string' ? band.ink : '',
        from: numeric(band?.from),
        to: numeric(band?.to),
        index: Number.isInteger(band?.index) ? band.index : position,
      }))
      .sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
    if (rows.some((row) => row.from === null)) return null;

    for (let index = 0; index < rows.length - 1; index += 1) {
      if (rows[index + 1].from <= rows[index].from) return null;
      if (rows[index].to !== null && rows[index].to + 1 !== rows[index + 1].from) return null;
    }
    return rows;
  });

  const boundaries = $derived(resolved ? resolved.slice(1).map((row) => row.from) : []);

  const domain = $derived.by(() => {
    const rows = resolved;
    const low = numeric(min);
    const high = numeric(max);
    if (!rows) return { min: low ?? 0, max: high ?? 1 };
    const first = rows[0].from;
    const last = rows.at(-1);
    const tail = boundaries.length >= 2 ? boundaries.at(-1) - boundaries.at(-2) : step;
    const derivedMax =
      binding === 'fixed' && last.to !== null ? last.to : last.from + Math.max(tail, step);
    return { min: low ?? first, max: high ?? derivedMax };
  });

  const trackMax = $derived.by(() => {
    if (!resolved || binding !== 'fixed' || numeric(max) !== null) return domain.max;
    return resolved.at(-1).to !== null ? domain.max + 1 : domain.max;
  });

  const span = $derived(Math.max(trackMax - domain.min, Number.EPSILON));

  const percentOf = (value) => ((value - domain.min) / span) * 100;

  function boundsFor(index) {
    const lower = index === 0 ? domain.min + step : boundaries[index - 1] + step;
    const upper = index === boundaries.length - 1 ? trackMax - step : boundaries[index + 1] - step;
    if (lower > upper) {
      const pinned = boundaries[index];
      return [pinned, pinned];
    }
    return [lower, upper];
  }

  function ariaBoundsFor(index) {
    const [lower, upper] = boundsFor(index);
    const now = boundaries[index];
    return [Math.min(lower, now), Math.max(upper, now)];
  }

  function clampTo(index, value) {
    const [lower, upper] = boundsFor(index);
    return Math.min(upper, Math.max(lower, value));
  }

  function snap(value) {
    const size = step > 0 ? step : 1;
    return domain.min + Math.round((value - domain.min) / size) * size;
  }

  function commit(index, rawValue) {
    if (disabled) return;
    const next = clampTo(index, snap(rawValue));
    if (next === boundaries[index]) return;
    if (binding === 'simple') {
      onChange({ binding: 'simple', dc: next });
      return;
    }
    const below = resolved[index].index;
    const above = resolved[index + 1].index;
    if (binding === 'fixed') {
      onChange({ binding: 'fixed', index: below, end: next - 1, nextIndex: above, start: next });
      return;
    }
    onChange({ binding: 'relative', index: above, dc: next - previewDc });
  }

  const KEY_DELTAS = {
    ArrowRight: 1,
    ArrowUp: 1,
    ArrowLeft: -1,
    ArrowDown: -1,
  };

  function onHandleKeydown(event, index) {
    if (disabled) return;
    const current = boundaries[index];
    let next = null;
    if (event.key in KEY_DELTAS) next = current + KEY_DELTAS[event.key] * step;
    else if (event.key === 'PageUp') next = current + pageStep * step;
    else if (event.key === 'PageDown') next = current - pageStep * step;
    else if (event.key === 'Home') next = boundsFor(index)[0];
    else if (event.key === 'End') next = boundsFor(index)[1];
    if (next === null) return;
    event.preventDefault();
    commit(index, next);
  }

  let dragScale = null;

  function valueAtClientX(clientX) {
    const scale = dragScale ?? {
      left: trackElement?.getBoundingClientRect?.()?.left,
      width: trackElement?.getBoundingClientRect?.()?.width,
      min: domain.min,
      span,
    };
    if (!scale.width) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - scale.left) / scale.width));
    return scale.min + ratio * scale.span;
  }

  function onHandlePointerdown(event, index) {
    if (disabled) return;
    dragIndex = index;
    const rect = trackElement?.getBoundingClientRect?.();
    dragScale = rect?.width ? { left: rect.left, width: rect.width, min: domain.min, span } : null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus?.();
  }

  function onHandlePointermove(event) {
    if (dragIndex < 0) return;
    const value = valueAtClientX(event.clientX);
    if (value === null) return;
    commit(dragIndex, value);
  }

  function onHandlePointerup(event) {
    if (dragIndex < 0) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragIndex = -1;
    dragScale = null;
  }

  function valueText(index) {
    const absolute = boundaries[index];
    if (binding !== 'relative') {
      return previewLabel ? `${absolute} — ${previewLabel}` : String(absolute);
    }
    const offset = absolute - previewDc;
    const signed = offset >= 0 ? `+${offset}` : String(offset);
    return previewLabel
      ? `${absolute} — DC ${signed} against ${previewLabel}`
      : `${absolute} — DC ${signed}`;
  }
</script>

{#if !resolved}
  <p class="fab-band-strip-fallback" data-band-strip-fallback {...hookAttributes}>
    {fallbackNote}
  </p>
{:else}
  <div class="fab-band-strip" {...hookAttributes}>
    <div
      class="fab-band-strip-track"
      class:is-disabled={disabled}
      bind:this={trackElement}
      role="group"
      aria-label={previewLabel ? `${groupLabel} — ${previewLabel}` : groupLabel}
      data-band-strip-track
    >
      {#each resolved as band, index (band.id || index)}
        {@const from = band.from}
        {@const to = index === resolved.length - 1 ? trackMax : resolved[index + 1].from}
        <span
          class="fab-band-strip-band"
          class:is-untinted={!band.color}
          style={`left: ${percentOf(from)}%; width: ${percentOf(to) - percentOf(from)}%;${
            band.color ? ` --fab-band-strip-fill: ${band.color};` : ''
          }${band.ink ? ` --fab-band-strip-ink: ${band.ink};` : ''}`}
          data-band-strip-band={band.id || index}
        >
          <span class="fab-band-strip-band-name">{band.name}</span>
        </span>
      {/each}

      {#each boundaries as boundary, index (index)}
        {@const bounds = ariaBoundsFor(index)}
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
        >
          <span class="fab-band-strip-grip" aria-hidden="true"></span>
        </span>
      {/each}
    </div>

    <div class="fab-band-strip-ticks" aria-hidden="true">
      {#each boundaries as boundary, index (index)}
        <span class="fab-band-strip-tick" style={`left: ${percentOf(boundary)}%;`}>{boundary}</span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .fab-band-strip {
    box-sizing: border-box;
    display: block;
    width: 100%;
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
    padding: 0 var(--fab-space-2);
    overflow: hidden;
    background: var(--fab-band-strip-fill, var(--fab-surface-soft));
  }

  .fab-band-strip-band.is-untinted {
    background: var(--fab-surface-active);
  }

  .fab-band-strip-band + .fab-band-strip-band {
    border-left: 1px solid var(--fab-border);
  }

  .fab-band-strip-band-name {
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-band-strip-ink, var(--fab-text));
    font-size: 0.72rem;
    font-weight: 600;
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
    margin: -12px 0 0 -12px;
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
    border-radius: 3px;
    background: var(--fab-surface);
    box-shadow: var(--fab-shadow-sm);
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
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }

  .fab-band-strip-fallback {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.7rem;
    line-height: 1.45;
  }
</style>
