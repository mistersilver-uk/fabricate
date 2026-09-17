<!--
  The manager's ONE essence quantity card: an icon tile and a truncating essence name above a
  clamped numeric stepper, tinted by whether this essence is contributed at all. The editor's 4-up
  grid and the bulk panel's 2-up grid render this one card, so no third essence-quantity control
  exists with its own keyboard, clamp and commit behaviour. The number control is the shared
  `Stepper` (min 0); the hand-rolled pair it replaced is ratcheted in `manager-layout.test.js`.

  IDENTITY FIRST, then the stepper: the card was once one five-column run putting the control
  before the thing it counted. THE TILE IS THE SHARED `Medallion` at `variant="glyph-chip"` —
  a 22px slate chip with the glyph in the essence's colour — rather than a second tile of its own,
  and the colour arrives as the BARE `--fab-tag-*` key the Essence Catalogue stores.

  The class names are the SHIPPED ones, moved out of the global sheet into this scoped block
  unchanged; what stayed global is the PARENT grid, which is host layout rather than card identity.
  `data-component-edit-essence` and `data-component-essence-active` are likewise PRESERVED verbatim.

  Props: id / name / icon (falling back to a mortar-and-pestle); colorToken ('' for the untinted
  tile); quantity (zero renders the receding `is-inactive` treatment, since an unused essence is
  still the control a GM would add one with); disabled; ariaLabel / decrementLabel / incrementLabel,
  already localized because this component imports no localization; onChange(quantity).
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
  /* THEME-ROOT tokens only: a scoped `<style>` may not reach an area-scoped `--fab-manager-*`
     property from any directory (`openspec/specs/design-system/spec.md`, "The token namespace is
     one generation and names its purpose").

     TWO rows — identity above, stepper below — not a single run, and TINTED by whether the
     component contributes this essence, so a grid reads without every number being read. */

  .manager-component-essence-card {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-2);
    align-content: start;
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-2);
    /* A contributing tile is `--fab-bg-1` behind a `border-strong` hairline, not an accent wash. */
    border: 1px solid var(--fab-border-strong);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* No essence contributed: the card recedes rather than disappearing, since the stepper is
     still how a GM would add one. */
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

  /* Ellipsised in the SECONDARY ink: the tile's subject is the numeral below it. */
  .manager-component-essence-name {
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-weight: 600;
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* `Stepper` is an `inline-flex` island, not a full-bleed row, so centring it keeps a grid of
     cards optically aligned whatever width the host hands out. */
  .manager-component-essence-control {
    display: flex;
    justify-content: center;
    min-width: 0;
  }
</style>
