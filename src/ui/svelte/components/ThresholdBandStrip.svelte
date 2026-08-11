<!-- Svelte 5 runes mode -->
<!--
  The product's ONE threshold band strip: N ordered, named bands laid over a value track,
  with a draggable, keyboard-operable handle on every INTERNAL boundary.

  It is a VISUALISATION, never the authority. The numeric `Stepper`s in the tier rows below
  it edit the same state and remain the control of record; this strip exists so a GM can
  see the shape of a routed check at a glance and nudge a threshold without counting.
  Everything it writes, it writes through the same `onChange` the steppers do.

  ## No gradient, and no visual-style exemption claimed

  `ui-integration/spec.md` §Product UI Visual Style exempts a FULL-TRACK semantic scale from
  the no-gradients rule, on condition that the gradient runs across the complete track and
  the fill stays full-width. This strip claims no such exemption and renders no gradient at
  all: each band is a SOLID fill with a hard edge, taken from that band's own authored
  runtime colour and applied inline through `style=`. Per-band identity is the whole point
  of the control, and a gradient across the complete track would erase it.

  A runtime colour applied inline is authored DATA, not a source literal, so it is outside
  `tests/components/theme-colour-contract.test.js`'s remit. A band with no authored colour
  falls back to a theme token through a class, never to a hard-coded value.

  ## Bands in, one authored patch out

  Callers hand `bands` in ABSOLUTE track values, whatever the binding underneath, because
  a strip that also had to know how to read three authored shapes would be three components
  wearing one name. Each band is `{ id, name, color, from, to, index }`; `to` is optional
  and derived from the next band's `from` when omitted.

  Bands are drawn in VALUE order, and `index` is the position of the band in the caller's
  own authored array. The two are the same thing for an ascending tier list and are NOT for
  a descending one — a routed check's tiers are authored in display order, and a GM who
  lists Masterwork first has authored a perfectly valid descending list. Sorting for display
  while writing through `index` is what lets one strip serve both; sorting the AUTHORED
  array instead would reorder a GM's tier rows from a drag, which is the one thing the clamp
  rule exists to forbid. A caller that omits `index` gets its array position, so an
  already-ascending list needs nothing.

  N bands yield N−1 handles, so some authored numbers get NO handle at all — the first
  band's lower bound and the last band's upper bound are `Stepper`-only. That is stated
  rather than inferred because it is exactly what the frames show: five relative tiers with
  steppers at −10/−5/0/+5/+10 carry only FOUR boundary labels (7/12/17/22), and Ruined's
  own DC is not one of them.

  `binding` decides which authored field a handle writes, and the strip emits that mapping
  as a patch rather than a raw index so a caller cannot get it wrong:

  - `relative` — handle *i* writes `outcomes[i+1].dc`, converted back to an OFFSET against
    the previewed record's DC: `{ binding: 'relative', index: i + 1, dc: <offset> }`.
  - `fixed` — handle *i* writes the coupled pair `outcomes[i].end` and `outcomes[i+1].start`
    as ONE update: `{ binding: 'fixed', index: i, end: v - 1, nextIndex: i + 1, start: v }`.
    Ranges are inclusive on both ends, so the boundary value IS the next band's start.
  - `simple` — the single handle writes the check's own DC: `{ binding: 'simple', dc: v }`.

  ## Two number systems, and what gets announced

  In `relative` mode the tier rows author OFFSETS while the strip renders and announces
  ABSOLUTE values against the previewed record's DC — that is what the visible ticks read.
  `aria-valuenow` therefore carries the absolute number. But that number is a function of
  the PREVIEW AGAINST record, so switching records re-announces every handle with no data
  change at all; `aria-valuetext` carries BOTH readings ("17 — DC +5 against Uncommon
  Craft") and the previewed record is named in the group label.

  ## Bounds, and the clamp

  `aria-valuemin` / `aria-valuemax` are ONE STEP INSIDE the neighbouring boundaries, and at
  the outermost handles one step inside the TRACK. The step of clearance is what stops a drag
  collapsing a band to zero width — including the first and last bands, whose outer edges have
  no handle of their own to be pushed back by. The domain is stated per binding:

  - `relative` — the authored range extended one step past the outermost tier. "One step"
    is the tier interval, not the stepper's increment: it is what makes the last band the
    same width as its neighbours rather than a sliver, which is how the frames render it.
  - `fixed` — the authored `[min(start), max(end)]` span, verbatim.
  - `simple` — the DC field's own stepper range, which the caller passes as `min`/`max`.

  A handle dragged or keyed past a neighbour CLAMPS. It never swaps and never reorders:
  reordering a tier list from a drag is a data change no undo on this surface can express.

  ## The non-contiguous fallback

  A gapped or overlapping authored FIXED set is reachable — `findRangeConflicts` sees
  overlap and `start > end`, and `rangeGap` reports the hole — and a contiguous strip
  cannot draw it. Rather than lie about the shape, the strip renders its note alone and
  leaves the tier rows as the only editor. The caller keeps rendering those rows either
  way.

  ## Interaction rules this component is bound by

  Every handle is a real ARIA widget: `role="slider"`, focusable, with a hit area of at
  least 24×24 CSS pixels (WCAG 2.5.8) — the ~2px seam between two bands is not a target.
  The prototype's click-handled bare `<span>` controls are never copied, and a
  `role="button"` wrapper is never converted into a `<button>`, which would nest buttons
  and land invalid DOM.
-->
<script>
  let {
    binding = 'relative',
    bands = [],
    /** The previewed record's DC. Only `relative` reads it, to convert absolute ↔ offset. */
    previewDc = 0,
    /** The previewed record's name, for the group label and the dual `aria-valuetext`. */
    previewLabel = '',
    step = 1,
    pageStep = 5,
    /** Track domain overrides. `simple` passes the DC stepper's own range through these. */
    min = null,
    max = null,
    groupLabel = 'Outcome bands',
    /** `(band, nextBand) => string` — the accessible name of the handle between them. */
    boundaryLabel = (band, nextBand) => `${band?.name || ''} / ${nextBand?.name || ''}`,
    /** The stated note rendered instead of the strip when the authored set is not contiguous. */
    fallbackNote = '',
    disabled = false,
    dataAttr = '',
    dataValue = '',
    onChange = () => {},
  } = $props();

  let trackElement = $state(null);
  let dragIndex = $state(-1);

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});

  // `null` and `''` are ABSENT, not zero. `Number(null)` is 0 and `Number.isFinite(0)` is
  // true, so a bare coercion turned every omitted upper edge — which is how `relative`
  // hands its bands over — into an authored `to: 0`, and the adjacency check below then
  // read a perfectly contiguous set as gapped and fell back to the note on every routed
  // frame. The guard is the whole difference between the strip rendering and not.
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
        from: numeric(band?.from),
        to: numeric(band?.to),
        index: Number.isInteger(band?.index) ? band.index : position,
      }))
      .sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
    if (rows.some((row) => row.from === null)) return null;

    for (let index = 0; index < rows.length - 1; index += 1) {
      // Strictly increasing lower edges: an equal or inverted pair is an overlap the
      // strip must not draw as if it were a clean seam.
      if (rows[index + 1].from <= rows[index].from) return null;
      // An authored upper edge that does not meet the next lower edge is a GAP (or an
      // overlap the comparison above cannot see). Inclusive ranges meet at `to + 1`.
      if (rows[index].to !== null && rows[index].to + 1 !== rows[index + 1].from) return null;
    }
    return rows;
  });

  /** Boundary values, one per internal seam: the lower edge of every band after the first. */
  const boundaries = $derived(resolved ? resolved.slice(1).map((row) => row.from) : []);

  const domain = $derived.by(() => {
    const rows = resolved;
    const low = numeric(min);
    const high = numeric(max);
    if (!rows) return { min: low ?? 0, max: high ?? 1 };
    const first = rows[0].from;
    const last = rows.at(-1);
    // One step past the outermost tier, where the step is the TIER interval — a bare
    // `+ step` would render the final band as a sliver beside four full-width neighbours.
    const tail = boundaries.length >= 2 ? boundaries.at(-1) - boundaries.at(-2) : step;
    const derivedMax =
      binding === 'fixed' && last.to !== null ? last.to : last.from + Math.max(tail, step);
    return { min: low ?? first, max: high ?? derivedMax };
  });

  /**
   * The value the DRAWN track ends at, which is not always the domain's own maximum.
   *
   * A `fixed` band owns an INCLUSIVE range, so a band ending at 20 occupies the track right
   * up to 21 — the same rule every interior seam already obeys, since band *i* is drawn from
   * its own `from` to the NEXT band's `from`, which is `end + 1`. Ending the drawing at the
   * authored `to` therefore made the last band exactly one unit narrower than a set of equal
   * ranges should render, on every fixed check. An explicit `max` override is respected
   * verbatim: a caller stating the track's extent has already answered this.
   */
  const trackMax = $derived.by(() => {
    if (!resolved || binding !== 'fixed' || numeric(max) !== null) return domain.max;
    return resolved.at(-1).to !== null ? domain.max + 1 : domain.max;
  });

  const span = $derived(Math.max(trackMax - domain.min, Number.EPSILON));

  const percentOf = (value) => ((value - domain.min) / span) * 100;

  /**
   * The `[lower, upper]` bound a handle may move between: one step inside its neighbours, and
   * one step inside the drawn track at the two outermost handles.
   *
   * EVERY BAND KEEPS AT LEAST ONE STEP OF WIDTH, including the first and the last. The
   * outermost handles used to be bounded by the raw track extent, so handle 0 could be
   * dragged onto the first band's OWN lower edge and collapse it to zero width — a named
   * tier reduced to nothing, with its focus ring clipped away by the track's
   * `overflow: hidden`, so the GM could neither see it nor aim at it again. The steppers in
   * the rows below remain the authority and can still author whatever the data allows; it is
   * the DRAG that must not be able to erase a band.
   *
   * A degenerate interval — a tier narrower than `step`, which authored data can be — would
   * otherwise report `aria-valuemin` ABOVE `aria-valuemax`, a range no assistive technology
   * can describe. It reports the handle's current value for both instead, which is the
   * truthful answer: this handle has nowhere to go.
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
   * The ANNOUNCED range, which is the movement range widened to contain the handle's own
   * value. They are the same thing for well-formed data and are not for authored data the
   * strip must still describe: a tier interval narrower than `step` puts the current boundary
   * outside its own movement range, and `aria-valuenow` outside `[aria-valuemin,
   * aria-valuemax]` is a slider no assistive technology can read out coherently. The
   * MOVEMENT clamp is deliberately left narrow — widening that instead would let a key press
   * push a handle past its neighbour, which is the one thing the clamp exists to forbid.
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

  /** Snap a raw domain value onto the authored step grid, anchored at the domain minimum. */
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
    // The AUTHORED indices of the two bands this seam sits between, not the drawn
    // positions: those differ the moment the caller's tier list is authored high-to-low.
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

  function valueAtClientX(clientX) {
    const rect = trackElement?.getBoundingClientRect?.();
    if (!rect || !rect.width) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    // Against the DRAWN extent, so the pointer maps onto the same scale the bands are
    // painted with — a `fixed` strip's last band reaches `to + 1`.
    return domain.min + ratio * span;
  }

  function onHandlePointerdown(event, index) {
    if (disabled) return;
    dragIndex = index;
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
  }

  /**
   * The dual reading. The absolute number is what the tick shows and what `aria-valuenow`
   * carries; the relative one is what the tier row's stepper shows for the same state.
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
          }`}
          data-band-strip-band={band.id || index}
        >
          <span class="fab-band-strip-band-name">{band.name}</span>
        </span>
      {/each}

      {#each boundaries as boundary, index (index)}
        {@const bounds = ariaBoundsFor(index)}
        <!-- A real ARIA widget, not a click-handled bare element: role, focus, keys and a
             24x24 hit area the ~2px seam could never offer. It nests INSIDE the track
             rather than converting a wrapper into a `<button>`, which would nest buttons. -->
        <span
          class="fab-band-strip-handle"
          class:is-dragging={dragIndex === index}
          style={`left: ${percentOf(boundary)}%;`}
          role="slider"
          tabindex={disabled ? -1 : 0}
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

  /* The track. `position: relative` is load-bearing: every band and every handle is placed
     against it as a percentage of the value domain, which is what keeps the drawn seam and
     the linear pointer mapping in agreement. */
  .fab-band-strip-track {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 44px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-raised);
  }

  /* SOLID fills with hard edges — no gradient, and no visual-style exemption claimed.

     The caller's runtime colour arrives inline as `--fab-band-strip-fill` and is painted
     from here, rather than landing inline as `background` directly. Two reasons, and both
     are about the value being real: the DECLARED FALLBACK means an absent or unresolvable
     colour paints the neutral surface rather than nothing at all (an unset `var()` resolves
     to the guaranteed-invalid value and `background` then falls back to `transparent`); and
     happy-dom's `cssText` parser silently DISCARDS a `color-mix()` written as a `background`
     value while preserving it verbatim as a custom property, so a mounted test can see the
     colour a caller actually derived instead of an empty style attribute. */
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

  /* The seam. A hairline is a border, not spacing, so it stays literal. */
  .fab-band-strip-band + .fab-band-strip-band {
    border-left: 1px solid var(--fab-border);
  }

  /* A long localized band name wraps to nothing and truncates instead, so a wide name
     cannot change the strip's height and shove the tier rows' steppers down the page. */
  .fab-band-strip-band-name {
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-text);
    font-size: 0.72rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* WCAG 2.5.8: a 24x24 target, centred on the seam. The visible grip is narrower than the
     target on purpose — the hit area is what the pointer needs, the grip is what the eye
     needs. */
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
