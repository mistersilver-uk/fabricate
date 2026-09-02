<!-- Svelte 5 runes mode -->
<!--
  ONE ROW PER WORLD MODIFIER, ON ONE LINE — the manager's shared presentation of an entry in
  `characterLibraries.modifiers[]` (issue 1373, maintainer round 4).

  ── WHY IT IS A COMPONENT AND NOT A CONVENTION ─────────────────────────────────────────────
  The Checks Studio built this row inline (`checks/CraftingModifierCatalogueCard.svelte`) and
  the Tool Studio's check-bonus picker now draws the SAME roster. Two screens rendering one
  concept from two copies of the markup is how they come to disagree, and the maintainer's
  ruling on the bonus picker is explicit that a third modifier row must not be built. So the
  row moved here, unchanged, and both screens call it.

  ── WHAT IT OWNS, AND WHAT IT DOES NOT ─────────────────────────────────────────────────────
  It owns the ANATOMY: a leading glyph tile, the entry's name, and its expression in the mono
  face as the row's one elastic cell. Everything after that is the caller's, rendered through
  `children` at the row's trailing edge, because that is the part the two screens genuinely
  differ on — the Checks Studio puts an eligibility toggle there (which entries this activity
  applies), and the Tool bonus puts a radio there (which single entry this Tool adds).

  It owns NO appearance. The geometry is `styles/fabricate.css`'s, where it already lived, in
  one block per cell joined across the two routes that draw the row —
  `.manager-checks-card` and `.manager-tool-bonus-list`. That is deliberate rather than
  incidental: a scoped block here would be a second source of truth for a box the sheet
  already declares, and `tests/components/manager-layout.test.js` asserts the join so a third
  route cannot silently render the row with no metrics at all.

  ── THE HOST IS THE CALLER'S ───────────────────────────────────────────────────────────────
  `as` is `'div'` for a row whose control is a `<button>` and `'label'` for a row whose control
  is an `<input>`. A `<label>` host is what makes the whole row the radio's hit target and its
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
    // Appended to the row's own class, never a replacement for it: the sheet's joined block is
    // anchored on an ancestor, and this is how a caller adds its own row-level state class.
    class: extraClass = '',
    rowAttributes = {},
    iconAttributes = {},
    labelAttributes = {},
    expressionAttributes = {},
    // The row's trailing control, and anything the caller sets beside it.
    children = undefined,
  } = $props();

  const host = $derived(as === 'label' ? 'label' : 'div');
  const classes = $derived(['manager-modifier-readonly-row', extraClass].filter(Boolean).join(' '));
</script>

<svelte:element this={host} class={classes} {...rowAttributes}>
  <span class="manager-modifier-readonly-glyph" aria-hidden="true">
    <i class={icon || DEFAULT_MODIFIER_ICON} {...iconAttributes}></i>
  </span>
  <span class="manager-modifier-readonly-label" {...labelAttributes}>{label}</span>
  <code class="manager-modifier-readonly-expression" {...expressionAttributes}
    >{expression || NO_EXPRESSION}</code
  >
  {@render children?.()}
</svelte:element>
