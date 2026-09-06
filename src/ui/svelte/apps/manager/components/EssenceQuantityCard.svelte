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

  THE TILE IS THE SHARED `Medallion` (issue 1371 r18-colour, maintainer ruling M29). The card
  used to draw its own 22px span and take a `color` prop for the glyph's ink — a prop the editor
  passed and nothing ever fed, because the editor's option builder is a whitelist rebuild that
  never named the colour, so every tile painted the accent. The reference draws the tile as a
  22px slate chip with the glyph in the essence's colour (`proto:5717`: `width: 22px; height:
  22px; border-radius: 6px; background: var(--bg3); color: e.color`), which is exactly the
  `variant="glyph-chip"` face the bulk panels' essence rows already draw at the same size, so
  the card now renders that medallion rather than a second tile of its own. The colour arrives
  as the BARE `--fab-tag-*` key the Essence Catalogue stores (`colorToken`), the same shape
  `Medallion`'s `tint` and `Chip`'s `tint` validate; the retired `color` prop took an authored
  CSS colour, which no projection ever produced.

  The class names are the SHIPPED ones. `.manager-component-essence-card`, `-identity` and
  `-name` moved out of the global sheet into this scoped block unchanged, so the editor
  renders what it rendered before the extraction. What stayed global is the PARENT grid
  (`.manager-component-essence-grid`), because the editor's 4-up and the bulk panel's 2-up are
  host layout, not card identity.

  Props:
   - id / name / icon: the essence's identity. `icon` falls back to a mortar-and-pestle.
   - colorToken: the essence's own colour as a bare `--fab-tag-*` key, or '' for the untinted
     tile (the accent glyph the tile has always painted).
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
  import Medallion from '../../../components/Medallion.svelte';
  import Stepper from '../../../components/Stepper.svelte';

  let {
    id = '',
    name = '',
    icon = '',
    colorToken = '',
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
    <!-- `size` and `glyph` are the reference's 22px tile and its 10px glyph; the variant owns the
         absent edge and the slate fill that does not follow the tint. See the header note. -->
    <Medallion
      icon={icon || 'fas fa-mortar-pestle'}
      size={22}
      glyph={10}
      tint={colorToken || ''}
      variant="glyph-chip"
    />
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
