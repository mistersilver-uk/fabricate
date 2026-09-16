<!--
  The product's ONE threshold band strip: N ordered, named bands over a value track, with a
  draggable, keyboard-operable handle on every INTERNAL boundary — so N bands yield N−1 handles and
  the outermost authored bounds have none. It is a VISUALISATION, never the authority: the numeric
  `Stepper`s in the tier rows below edit the same state through the same `onChange`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `binding` | `'relative'` \| `'fixed'` \| `'simple'` | `'relative'` | Which authored field a handle writes, emitted as a PATCH rather than a raw index so a caller cannot get the mapping wrong. `relative` writes `{ binding, index: i + 1, dc: <offset against the previewed DC> }`; `fixed` writes the coupled pair as ONE update, `{ binding, index: i, end: v - 1, nextIndex: i + 1, start: v }`, because ranges are inclusive on both ends and the boundary value IS the next band's start; `simple` writes `{ binding, dc: v }`. |
  | `bands` | `{ id, name, color, ink, from, to?, index? }[]` | `[]` | ABSOLUTE track values, whatever the binding underneath — a strip that also had to read three authored shapes would be three components wearing one name. `to` is derived from the next band's `from` when omitted. `ink` travels with `color` because the two are ONE decision: the name is drawn ON the fill, so whoever picks the fill is the only party that can know what stays readable on it, and the `--fab-text` fallback is right only for a fill chosen against it. Bands are DRAWN in value order and WRITTEN through `index`, the position in the caller's own AUTHORED array — the two differ for a descending tier list, which is a perfectly valid thing for a GM to author, and sorting the authored array instead would reorder their tier rows from a drag. |
  | `previewDc` / `previewLabel` | number / string | `0` / `''` | The previewed record. Only `relative` reads the DC, to convert absolute ↔ offset; the label is used in the group name and the dual `aria-valuetext`. |
  | `step` / `pageStep` | numbers | `1` / `5` | The keyboard increments and the snap grid. |
  | `min` / `max` | numbers or `null` | `null` | Track domain overrides. `simple` passes the DC stepper's own range through these. |
  | `groupLabel` | string | `'Outcome bands'` | The group's accessible name. |
  | `boundaryLabel(band, next)` | function | name pair | The accessible name of the handle between two bands. |
  | `fallbackNote` | string | `''` | Rendered INSTEAD of the strip when the authored set is not contiguous: a gapped or overlapping FIXED set is reachable and a contiguous strip cannot draw it, so rather than lie about the shape the tier rows are left as the only editor. |
  | `disabled` | boolean | `false` | The handles go inert. |
  | `dataAttr` / `dataValue` | strings | `''` | The caller's own hook on the root. |
  | `onChange(patch)` | function | no-op | The authored patch, per binding above. |

  Invariants:
  - NO GRADIENT, AND NO VISUAL-STYLE EXEMPTION CLAIMED. `ui-integration/spec.md` exempts a
    FULL-TRACK semantic scale from the no-gradients rule; this strip claims none, because per-band
    identity is the point of the control and a gradient across the track would erase it. A runtime
    colour applied inline is authored DATA rather than a source literal, so it is outside
    `tests/components/theme-colour-contract.test.js`'s remit, and a band with no authored colour
    falls back to a theme token through a CLASS, never to a hard-coded value.
  - `aria-valuenow` CARRIES THE ABSOLUTE NUMBER and `aria-valuetext` CARRIES BOTH READINGS,
    because in `relative` mode the tier rows author OFFSETS while the strip renders absolutes
    against a previewed record — so switching records re-announces every handle with no data
    change.
  - EVERY BAND KEEPS AT LEAST ONE STEP OF WIDTH, including the first and the last, so the bounds
    are ONE STEP INSIDE the neighbouring boundaries and one step inside the TRACK at the outermost
    handles. Without it handle 0 collapses a named tier to nothing, with its focus ring clipped
    away by the track's `overflow: hidden`. In `relative` mode "one step" is the TIER interval
    rather than the stepper's increment, which keeps the last band its neighbours' width.
  - A HANDLE DRAGGED OR KEYED PAST A NEIGHBOUR CLAMPS. It never swaps and never reorders:
    reordering a tier list from a drag is a data change no undo on this surface can express.
  - EVERY HANDLE IS A REAL ARIA WIDGET: `role="slider"`, focusable, with a hit area of at least
    24×24 CSS pixels (WCAG 2.5.8), because the ~2px seam is not a target. The prototype's
    click-handled bare `<span>` controls are never copied, and a `role="button"` wrapper is never
    converted into a `<button>`, which would nest buttons and land invalid DOM.
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

  // `null` and `''` are ABSENT, not zero: a bare coercion turns every omitted upper edge — which
  // is how `relative` hands its bands over — into an authored `to: 0`, and the adjacency check
  // below then reads a contiguous set as gapped and falls back to the note on every frame.
  const numeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  /**
   * The bands with every derived edge resolved, or `null` when the authored set cannot be
   * drawn as a contiguous strip. Returning null rather than throwing keeps the fallback a
   * rendering decision the template makes once.
   */
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
      // An upper edge that does not meet the next lower edge is a GAP. Inclusive ranges meet at
      // `to + 1`.
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

  /**
   * The value the DRAWN track ends at, which is not always the domain's own maximum: a `fixed`
   * band owns an INCLUSIVE range, so a band ending at 20 occupies the track up to 21. An explicit
   * `max` override is respected verbatim.
   */
  const trackMax = $derived.by(() => {
    if (!resolved || binding !== 'fixed' || numeric(max) !== null) return domain.max;
    return resolved.at(-1).to !== null ? domain.max + 1 : domain.max;
  });

  const span = $derived(Math.max(trackMax - domain.min, Number.EPSILON));

  const percentOf = (value) => ((value - domain.min) / span) * 100;

  /**
   * The `[lower, upper]` bound a handle may move between; see the header's width invariant. A
   * degenerate interval — a tier narrower than `step`, which authored data can be — would report
   * `aria-valuemin` ABOVE `aria-valuemax`, a range no assistive technology can describe, so it
   * reports the handle's current value for both instead: this handle has nowhere to go.
   */
  function boundsFor(index) {
    const lower = index === 0 ? domain.min + step : boundaries[index - 1] + step;
    const upper = index === boundaries.length - 1 ? trackMax - step : boundaries[index + 1] - step;
    if (lower > upper) {
      const pinned = boundaries[index];
      return [pinned, pinned];
    }
    return [lower, upper];
  }

  /**
   * The ANNOUNCED range: the movement range widened to contain the handle's own value, because
   * `aria-valuenow` outside its own bounds is a slider no assistive technology can read out. The
   * MOVEMENT clamp is deliberately left narrow.
   */
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

  /**
   * The scale a drag maps against, FROZEN at pointerdown, and one snapshot per gesture: `domain`
   * is `$derived` from the tier list, so dragging the last handle right raised `domain.max`, which
   * stretched `span`, which made the same pointer position resolve to a larger value — a feedback
   * loop that diverged geometrically rather than tracking the pointer.
   */
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

  /**
   * The dual reading: the absolute number the tick shows, and the relative one the tier row's
   * stepper shows for the same state.
   */
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
        <!-- A real ARIA widget nested INSIDE the track rather than a wrapper converted into a
             `<button>`, which would nest buttons. -->
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

  /* `position: relative` is load-bearing: every band and every handle is placed against the track
     as a percentage of the value domain, which keeps the drawn seam and the pointer mapping in
     agreement. */
  .fab-band-strip-track {
    position: relative;
    box-sizing: border-box;
    width: 100%;

    /* Measured from the prototype and pinned by the Checks Studio parity fixture's `band-strip`
       region. A translucent raised surface let whatever the strip was stacked on show through an
       unfilled gap. */
    height: 46px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-0);
  }

  /* SOLID fills with hard edges; see the header. The caller's runtime colour arrives inline as a
     custom property and is painted from here rather than landing inline as `background`, for two
     reasons about the value being real: the DECLARED FALLBACK means an unresolvable colour paints
     the neutral surface rather than nothing at all, since an unset `var()` resolves to the
     guaranteed-invalid value; and happy-dom's `cssText` parser silently DISCARDS a `color-mix()`
     written as a `background` value while preserving it verbatim as a custom property. */
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

  /* A long localized band name truncates rather than wrapping, so it cannot change the strip's
     height and shove the tier rows' steppers down the page. The ink arrives inline as a custom
     property for the same two reasons the fill does. */
  .fab-band-strip-band-name {
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-band-strip-ink, var(--fab-text));
    font-size: 0.72rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* WCAG 2.5.8: a 24x24 target centred on the seam. The visible grip is narrower on purpose —
     the hit area is what the pointer needs, the grip is what the eye needs. */
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
