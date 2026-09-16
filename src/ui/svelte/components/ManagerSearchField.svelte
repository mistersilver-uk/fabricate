<!--
  THE manager's search field: a `<label>` wrapping a leading glyph and an `<input type="search">`.
  It is a second component rather than part of `ManagerToolbar` because thirteen of the twenty-three
  sites writing its class are inside no toolbar at all. An IMPORT-FREE LEAF, so callers pass
  ALREADY-LOCALIZED `placeholder` and `ariaLabel`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | bindable string | `''` | The current query. `$bindable`, because ten of the converted sites bound it directly. |
  | `onInput(next, event)` | function | `undefined` | Called AFTER `value` is updated, for the sites that do more than store the string. |
  | `placeholder` / `ariaLabel` | already-localized strings | `undefined` | `ariaLabel` is REQUIRED; see the invariants. |
  | `compact` | boolean | `false` | Emits `is-compact`, the 32px `min(220px, 30%)` density. A boolean rather than a rung because it is a WIDTH with a height attached, which is a density and not a size. |
  | `size` | `''` \| `'38'` | `''` | The control-height RUNG, as a string naming the rung; `''` is the shipped 34px field. An unrecognised value resolves to `''` rather than emitting an unstyled `is-size-*`. |
  | `class` | class string | `''` | An EXTRA class, appended after the primitive's own and after `is-compact` — the order every hand-rolled site already wrote, so a converted site emits a byte-identical `class`. A named prop rather than a rest key, because the spread lands after `class={classes}` and would REPLACE it. |
  | `inputAttrs` | attribute bag | `undefined` | Attributes for the INPUT rather than for the label, which the rest spread cannot reach. Spread rather than a `*Attr` name prop, because one of the four hooks carries a VALUE rather than the empty string. |

  Rest spread:
  - `{...rest}` lands on the `<label>`, carrying its `data-*` hooks and `id`.

  Invariants:
  - `ariaLabel` IS REQUIRED. The `<label>` wraps an icon and an input and NO text, so it
    contributes no accessible name, and an unnamed search box is announced as "search" and nothing
    else. `tests/manager-search-field-source-contract.test.js` asserts every call site passes it.
  - A BARE `data-*` ATTRIBUTE ON A COMPONENT TAG IS THE BOOLEAN `true`, not the empty string it is
    on an element, and an `inputAttrs` entry written `{ 'data-x': true }` does the same. Presence
    selectors resolve either way, which is why the suites and smoke steps using them cannot catch
    it: spell the value `''`.
  - NO SCOPED `<style>`, for the reason `ManagerButton.svelte`'s header states in full: the pill is
    painted by `styles/fabricate.css` and a scoped block would be a second source of truth.
  - THE FONT FLOOR IS NOT IN THIS FAMILY'S BLOCK. This family's root is not its control, so the
    floor is written at the family root PLUS the element it owns, `.fabricate-search input` at
    (0,1,1), grouped with `Field`'s and `ChanceSlider`'s members immediately below the area's own
    bare-element baseline. POSITION IS LOAD-BEARING: `font` is a shorthand that resets
    `line-height`, and at (0,1,1) the group ties every LATER same-rank rule in the area, two of
    which restate a `font` longhand — declared down in this family's own block it would win both
    and silently re-type every manager textarea and select. The group carries `font: inherit` AND
    NOTHING ELSE, because at a tie any declaration the baseline does not also carry is a real move.
  - IT OWNS ITS CONTROL, SO IT DECLARES BOTH HALVES OF THE PAIR: the strip
    `.fabricate-search input:focus`, restating verbatim the module reset that removes core's orange
    outline and glow, and the repaint `.fabricate-search input:focus-visible`, copied verbatim from
    the module ring. Both are (0,2,1) and THE STRIP IS WRITTEN ABOVE THE REPAINT, because a
    keyboard-focused input matches both and source order decides the tie. Neither moves anything
    where a Fabricate root is an ancestor; what they are FOR is the bare host, where a primitive
    leaning on the module ring would render none.
  - TWO FAMILY RULES CANNOT TRAVEL, named rather than silently left behind:
    `.fabricate-search.manager-search.is-compact { width: 100% }` and
    `.fabricate-search.manager-search { flex-basis: 100% }` are declared inside
    `@container fabricate-manager (max-width: 680px)`, and that container NAME is established by
    `.fabricate-manager` itself — so in a host without it there is no such container to query and
    the responsive narrowing does not apply. `re-rooted-controls-host-independence.test.js`
    excludes exactly these two by count, so the host-equality walk is not read as covering them.
  - THE HOST IS ALWAYS A `<label>` AND THE GLYPH IS ALWAYS `fas fa-search`, so neither is a prop:
    the variation set is of size one. The three combobox sites wearing this class are
    `SearchablePopover`'s surface rather than this one, and are deliberately not covered.
-->
<script>
  let {
    value = $bindable(''),
    onInput = undefined,
    placeholder = undefined,
    ariaLabel = undefined,
    compact = false,
    size = '',
    class: extraClass = '',
    inputAttrs = undefined,
    ...rest
  } = $props();

  /**
   * The rungs this field can be asked for, and the class each one emits.
   *
   * A NAMED MAPPING RATHER THAN AN `is-size-${size}` TEMPLATE, for two reasons: the rung set is
   * closed, so an unrecognised value must render the shipped field rather than an unstyled class
   * the caller composed; and `scripts/lib/stylesheetLiveClasses.js` never widens an `is-` class
   * through a positional wildcard, so a class this component only ever BUILDS is not one the
   * dead-rule gate can see a customer for. The keys are STRINGS because a rung is a name and not
   * an arithmetic quantity.
   */
  const SIZE_CLASSES = { 38: 'is-size-38' };

  // `Object.hasOwn`, not a plain index: a plain read finds `toString` on `Object.prototype` and
  // the closed-set contract would hold only for values that are not names on it.
  const sizeClass = $derived(
    Object.hasOwn(SIZE_CLASSES, String(size ?? '')) ? SIZE_CLASSES[String(size)] : ''
  );

  const classes = $derived(
    ['fabricate-search', 'manager-search', compact ? 'is-compact' : '', sizeClass, extraClass]
      .filter(Boolean)
      .join(' ')
  );

  /**
   * @param {Event & { currentTarget: HTMLInputElement }} event
   */
  function handleInput(event) {
    const next = event.currentTarget.value;
    value = next;
    onInput?.(next, event);
  }
</script>

<label class={classes} {...rest}>
  <i class="fas fa-search" aria-hidden="true"></i>
  <input
    type="search"
    {value}
    {placeholder}
    aria-label={ariaLabel}
    oninput={handleInput}
    {...inputAttrs}
  />
</label>
