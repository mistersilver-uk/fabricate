<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE essence quantity card: an icon tile + a truncating essence name above a
  clamped numeric stepper, tinted by whether this essence is contributed at all (issue 772).

  It was extracted out of `ComponentEditView`, which hand-rolled the card against the global
  `.manager-component-essence-card` rules and drove it with a bare `manager-icon-button` −,
  a raw `<input type="number">` and a +. The component browser's bulk-edit panel needs the
  same card, and building it from `Stepper` against that same global class would have left a
  THIRD essence-quantity control adjacent to the other two with different keyboard, clamp and
  commit behaviour. So the card was extracted and the editor was converted onto it in the
  same change: the editor's 4-up grid and the panel's 2-up grid now render one card.

  The number control is the shared `Stepper` (min 0), so typing, clamping and the −/+
  adjuncts behave here exactly as they do on the progressive DC beside it. The hand-rolled
  `.manager-component-essence-stepper` / `-quantity` pair it replaced is retired and
  ratcheted in `tests/components/manager-layout.test.js`.

  IDENTITY FIRST, then the stepper: the card was once a single five-column run rendering
  −, qty, +, icon, name, which put the control before the thing it counted.

  The class names are the SHIPPED ones. `.manager-component-essence-card`, `-identity`,
  `-icon` and `-name` moved out of the global sheet into this scoped block unchanged, so
  the editor renders what it rendered before the extraction. What stayed global is the
  PARENT grid (`.manager-component-essence-grid`), because the editor's 4-up and the bulk
  panel's 2-up are host layout, not card identity.

  Props:
   - id / name / icon: the essence's identity. `icon` falls back to a mortar-and-pestle.
   - quantity: the current amount. Zero renders the receding `is-inactive` treatment — an
     essence the GM has not used is still the control they would use to add one.
   - disabled: disables the stepper (a saving editor, an inert panel section).
   - ariaLabel / decrementLabel / incrementLabel: already-localized accessible names. This
     component takes no localization import of its own, so the strings arrive from the host.
   - onChange(quantity): the clamped integer the stepper committed.

  `data-component-edit-essence` and `data-component-essence-active` are PRESERVED verbatim
  from the editor's markup: they are the editor's authoring hooks, and renaming them during
  an extraction would move the surface and its seams in one commit.
-->
<script>
  import Stepper from '../../../components/Stepper.svelte';

  let {
    id = '',
    name = '',
    icon = '',
    // THE ESSENCE'S OWN COLOUR, inked onto the tile's glyph (issue 1371, parity round 4). The
    // reference tints each tile by the essence it names (`proto:5717`), which is how a GM reads a
    // four-column grid at a glance. It arrives as an authored CSS colour and is interpolated into
    // a custom property, so an absent or empty value leaves the `var()` FALLBACK — the accent this
    // tile has always painted — rather than emitting an invalid declaration.
    color = '',
    quantity = 0,
    disabled = false,
    ariaLabel = '',
    decrementLabel = '',
    incrementLabel = '',
    onChange = () => {},
  } = $props();

  const amount = $derived(Number(quantity) > 0 ? Number(quantity) : 0);
  const active = $derived(amount > 0);
</script>

<article
  class="manager-component-essence-card"
  class:is-active={active}
  class:is-inactive={!active}
  data-component-edit-essence={id}
  data-component-essence-active={active}
>
  <div class="manager-component-essence-identity">
    <span
      class="manager-component-essence-icon"
      style={color ? `--fab-essence-tile-ink:${color}` : undefined}
      aria-hidden="true"
    >
      <i class={icon || 'fas fa-mortar-pestle'}></i>
    </span>
    <strong class="manager-component-essence-name" title={name}>{name}</strong>
  </div>

  <div class="manager-component-essence-control">
    <Stepper
      value={amount}
      min={0}
      {disabled}
      {ariaLabel}
      {decrementLabel}
      {incrementLabel}
      onChange={(next) => onChange(next)}
    />
  </div>
</article>

<style>
  /* THEME-ROOT tokens only. The reason once recorded here — that living under
     `apps/manager/` puts an area-scoped `--fab-manager-*` property in scope — has LAPSED:
     a scoped `<style>` may not reach one from ANY directory (design-system spec, *The token
     namespace is one generation and names its purpose*). `SelectionCheckbox` records the
     same rule for the same reason; it is no longer the opposite case.

     TWO rows — identity (tile + label) above, the stepper below — not a single run. The
     card is TINTED by whether the component contributes this essence at all, so a GM
     scanning the grid sees which essences are set without reading every number. */

  .manager-component-essence-card {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-2);
    align-content: start;
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-2);
    /* `proto:5716`: a contributing tile is `--fab-bg-1` behind a `border-strong` hairline, not an
       accent wash. Radius 10 snaps to the 9 rung (`design-system/spec.md:218`). */
    border: 1px solid var(--fab-border-strong);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* No essence contributed: this card is a control the GM has not used. It recedes rather
     than disappearing — the stepper is still how they would add one. */
  .manager-component-essence-card.is-inactive {
    border-color: var(--fab-border);
    background: var(--fab-surface-soft);
    opacity: 0.6;
  }

  .manager-component-essence-identity {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
  }

  .manager-component-essence-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--fab-overlay-light-06);
    /* The FALLBACK is the accent this tile painted before the tint existed, so an untinted card
       is byte-identical to what shipped. */
    color: var(--fab-essence-tile-ink, var(--fab-accent));
    font-size: 0.7rem;
  }

  /* `proto:5717`: 11.5px/600 in the SECONDARY ink, ellipsised. The tile's subject is the
     numeral below it, so the name recedes a rung rather than competing with it. */
  .manager-component-essence-name {
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-weight: 600;
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* `Stepper` is an `inline-flex` island rather than the full-bleed row the retired
     `-stepper` / `-quantity` pair drew, so the row centres it: a grid of cards stays
     optically aligned whatever width the host hands out. */
  .manager-component-essence-control {
    display: flex;
    justify-content: center;
    min-width: 0;
  }
</style>
