<!-- Svelte 5 runes mode -->
<!--
  ONE ROW PER WORLD MODIFIER — the manager's shared presentation of an entry in
  `characterLibraries.modifiers[]` (issue 1373, maintainer round 4).

  ── WHY IT IS A COMPONENT AND NOT A CONVENTION ─────────────────────────────────────────────
  The Checks Studio built this row inline (`checks/CraftingModifierCatalogueCard.svelte`) and
  the Tool Studio's check-bonus picker now draws the SAME roster. Two screens rendering one
  concept from two copies of the markup is how they come to disagree, and the maintainer's
  ruling on the bonus picker is explicit that a third modifier row must not be built. So the
  row moved here, unchanged, and both screens call it.

  ── WHAT IT OWNS, AND WHAT IT DOES NOT ─────────────────────────────────────────────────────
  It owns the ANATOMY: a glyph, the entry's name, and its expression in the mono face.
  Everything else is the caller's, rendered through `children` — the Checks Studio puts an
  eligibility toggle there (which entries this activity applies), the Tool bonus puts a radio
  there (which single entry this Tool adds), and the Tool prerequisite list puts a checkbox
  there (several apply at once).

  ── THE TWO DECLARED VARIANTS, AND WHY THEY ARE PROPS AND NOT A SECOND COMPONENT ───────────
  The reference draws this row twice on the Tool Requirements tab, with ONE geometry string
  (`proto:4741` and `proto:4752` are byte-identical) and two anatomies:

    `proto:2331`-`2333`   the CONTROL is the first child; then a BARE 11px accent glyph; then a
                          text block with the name over the expression.
    `proto:2361`-`2364`   no leading control; a 26px glyph TILE; the name and the expression on
                          ONE line; the dot trailing at `margin-left: auto`.

  Round 5 shipped one shape for both and recorded those two differences as deviations, on the
  argument that a row serving both would be two rows wearing one name. That argument holds
  against a single FIXED shape and not against declared variants, which is the answer this epic
  already reached for another primitive — and it is what `openspec/specs/design-system/spec.md`
  asks for in terms: a surface that needs one property of a shared primitive to differ extends
  it with a prop whose default is the shipped rendering.

  So there are two props, both defaulted to what shipped, and they are named for what they mean
  rather than for who calls them. `variant="prerequisite"` would describe a CALLER and would
  have to grow a value for every screen that ever adopted the row; `controlPlacement` and
  `textLayout` describe the row and are answerable by looking at it.

  ── THE GLYPH FOLLOWS THE CONTROL, AND THAT IS ONE RULE RATHER THAN A THIRD VARIANT ────────
  The reference's third difference is the glyph: bare on the prerequisite row, a tile on the
  bonus row and on the Checks Studio's. It is NOT a third prop, because it is not an
  independent choice — the tile is what makes the glyph the row's LEADING ANCHOR, and a row
  that leads with a control already has one. So `controlPlacement: 'leading'` demotes the glyph
  to the reference's bare accent mark, and every row whose control trails keeps the tile. Both
  of the reference's rows and the Checks Studio's agree with that rule, and a caller that ever
  genuinely wants a leading control BESIDE a tile is the point at which it earns its own prop.

  ── IT OWNS NO APPEARANCE, INCLUDING THE VARIANTS' ─────────────────────────────────────────
  The geometry is `styles/fabricate.css`'s, in one block per cell joined across the routes that
  draw the row, and the two variants are stated there too — on the ROW's own class, never on a
  route container, so a fourth caller opting in gets the rendering with the prop.
  `tests/components/manager-layout.test.js` asserts both the join and that rooting.

  ── THE HOST IS THE CALLER'S ───────────────────────────────────────────────────────────────
  `as` is `'div'` for a row whose control is a `<button>` and `'label'` for a row whose control
  is an `<input>`. A `<label>` host is what makes the whole row the input's hit target and its
  accessible name, and it may not be reached by omission: a `<label>` wrapped around a row that
  holds a `<button>` is the nested-interaction trap, so `'div'` — the host with no behaviour —
  is the default.

  ── THE DATA HOOKS ARE PASSED, NOT INVENTED ────────────────────────────────────────────────
  Each cell takes an attribute bag rather than this component naming a hook of its own. The
  Checks Studio's selectors (`data-crafting-modifier-row`, `data-crafting-modifier-readonly`)
  are pinned by its own suites, its View Lab cases and the parity fixture's
  `modifier-entry-row` region; renaming them to a shared vocabulary would be an unrelated
  change to a measured screen riding along inside a Tool Studio fix.
-->
<script>
  /** The glyph a library entry with no icon of its own falls back to. */
  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  /** What the expression cell shows when the entry has no expression yet. */
  const NO_EXPRESSION = '—';

  let {
    // `'div'` or `'label'`. See the header — a `<label>` host names and targets a wrapped
    // input, so it carries behaviour and is never the fallback.
    as = 'div',
    icon = '',
    label = '',
    expression = '',
    // WHERE THE CALLER'S CONTROL SITS: `'trailing'` (the shipped rendering, `proto:2364`) or
    // `'leading'` (`proto:2331`). Leading also demotes the glyph from its tile to the
    // reference's bare accent mark — see the header for why that is one rule and not a
    // separate prop.
    controlPlacement = 'trailing',
    // WHETHER THE NAME AND THE EXPRESSION SHARE A LINE: `'inline'` (the shipped rendering,
    // `proto:2362`) or `'stacked'` (`proto:2333`). Stacked wraps them in a text block, which
    // is markup and therefore reachable only from here: no sheet rule can add an element.
    textLayout = 'inline',
    // Appended to the row's own class, never a replacement for it: the sheet's joined block is
    // anchored on an ancestor, and this is how a caller adds its own row-level state class.
    class: extraClass = '',
    rowAttributes = {},
    iconAttributes = {},
    labelAttributes = {},
    expressionAttributes = {},
    // The row's control, and anything the caller sets beside it.
    children = undefined,
  } = $props();

  const host = $derived(as === 'label' ? 'label' : 'div');
  const leading = $derived(controlPlacement === 'leading');
  const stacked = $derived(textLayout === 'stacked');
  const classes = $derived(
    [
      'manager-modifier-readonly-row',
      leading ? 'is-control-leading' : '',
      stacked ? 'is-text-stacked' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- ONE DEFINITION OF THE TWO TEXT CELLS, rendered into the row directly or into the stacking
     block. Writing them twice would be two places for a hook or a fallback to drift, and would
     also emit a second copy of the same markup shape for SonarCloud to read as duplication. -->
{#snippet cells()}
  <span class="manager-modifier-readonly-label" {...labelAttributes}>{label}</span>
  <code class="manager-modifier-readonly-expression" {...expressionAttributes}
    >{expression || NO_EXPRESSION}</code
  >
{/snippet}

<svelte:element this={host} class={classes} {...rowAttributes}>
  {#if leading}{@render children?.()}{/if}
  <span class="manager-modifier-readonly-glyph" aria-hidden="true">
    <i class={icon || DEFAULT_MODIFIER_ICON} {...iconAttributes}></i>
  </span>
  {#if stacked}
    <span class="manager-modifier-readonly-text">{@render cells()}</span>
  {:else}
    {@render cells()}
  {/if}
  {#if !leading}{@render children?.()}{/if}
</svelte:element>
