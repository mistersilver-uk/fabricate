<!-- Svelte 5 runes mode -->
<!--
  THE APP'S ONE SELECT (issue 1504).

  `openspec/specs/design-system/library.html`'s `<Field> <Select> <Search>` specimen states it in
  one line: "Every select in the app renders this list". A native `<select>` popup is drawn by the
  OPERATING SYSTEM, so it ignores the theme, differs between browsers and platforms, and cannot
  carry a tick, a group heading, a description, a badge or a reason for being unavailable. This is
  the control that replaces it.

  ── WHAT THIS COMPONENT IS, AND WHAT IT IS NOT ──────────────────────────────────────────────
  It is a THIN COMPOSITION over `SearchablePopover` with the query field suppressed, and that is
  the whole design: the panel, the positioning, the portal, the outside-click dismissal, the
  listbox focus model (`aria-activedescendant` on one holder, rows that never take DOM focus), the
  option ids, the group buckets, the gated row, the arrow arithmetic and the type-ahead are ALL
  already shipped by that primitive and by `util/listboxNavigation.js`. Nothing here rebuilds any
  of it. What this component owns is the SELECT'S OWN vocabulary — a `{value, label, hint, badge,
  group}` option shape rather than the primitive's `{id, dataId}` one, three published size rungs,
  the tick column, and the `<Field as="label">` labelled form.

  It uses the primitive's OWN trigger rather than supplying a `trigger` snippet, which is what
  makes the combobox contract free: with `showSearch={false}` the primitive already puts
  `role="combobox"`, `aria-controls`, `aria-expanded`, `aria-activedescendant` and
  `data-keyboard-focus="true"` on the button. A snippet would have made this component responsible
  for all five.

  ── THE OPTION SHAPE, AND THE TWO STRINGIFICATIONS IT NEEDS ─────────────────────────────────
  Callers speak `option.value`, which may be a NUMBER (a page-size control's options are 10, 25,
  50). The primitive keys on `option.id`, a string, and stamps `data-popover-option` from
  `option.dataId`. Two facts follow, and both are defects if they are left to discovery.

  FIRST, both sides of the selection test must be stringified. The primitive writes
  `aria-selected={option.id === value}` — a STRICT equality — so forwarding a numeric `value`
  beside `id: String(option.value)` leaves `'25' === 25` false and NO row marked selected. So
  `String(value)` is forwarded, and the map back to the caller's own typed value is
  {@link valueForId}: `onChange` hands back the value the caller passed in, not a string of it.

  SECOND, the hook has to be non-empty on EVERY row. The primitive writes
  `data-popover-option={option.dataId || undefined}`, so a `dataId` of `''` OMITS the attribute —
  and an empty string is exactly what a bulk-edit panel's leading "Leave unchanged" row uses as
  its sentinel. That row is the panel's DEFAULT and its only affordance for unstaging an axis, so
  the one row a capture walk and a mounted test most need to address would have been the one row
  with no handle at all. {@link UNCHANGED_OPTION_ID} is the declared token that closes it.

  ── SIZE IS THREE THINGS, NOT ONE ───────────────────────────────────────────────────────────
  `size` names a height, a corner, a type size AND a fill, because the fill is genuinely its own
  axis rather than a consequence of the geometry: the specimen paints the 38px form control on
  `--fab-surface-soft` "in cards" and the 30px inline control on `--fab-bg-2` "inside bg-1 rows",
  and the third rung is the scoped-catalogue toolbar's documented 34px line on `--fab-bg-1`. A
  call site that needs a different fill states it in a descendant rule of its own wrapper class;
  there is deliberately NO trigger-box prop, because the trigger's width and fill are per-site
  skin rather than primitive appearance.

  The `toolbar` rung's type is written as the LITERAL `0.72rem` rather than as a read of
  `--fab-recipe-control-font`, and that is forced rather than stylistic. That property has
  exactly one declaration site, inside the `.fabricate-manager` block, so it is AREA-SCOPED: read
  from outside the manager it is undefined, the declaration is invalid at computed-value time, and
  the size silently falls back to inheritance. `tests/token-generation-gate.test.js` ratchets that
  read out of Svelte scoped styles for precisely this reason. The literal is the same number in
  both areas, which is what the real-browser clause in `tests/components/manager-layout.test.js`
  measures. Its WEIGHT is a published ramp numeral (500) rather than the `normal` the shipped
  toolbar select computes today, because `normal` is off-ramp.

  ── WHERE THE APPEARANCE LIVES ──────────────────────────────────────────────────────────────
  In `styles/fabricate.css`, under the `.fabricate-select*` family, and NOT in a scoped `<style>`
  block here. This component has NO `<style>` at all, and that is the design rather than an
  omission. `openspec/specs/design-system/spec.md` roots a shared primitive's family at the
  primitive; `searchable-popover-area-scope.test.js` reads the SHEET, so a scoped-style family
  gives the one gate that proves a family is not app-rooted nothing to quantify over; and
  `tests/helpers/scoped-component-css.js` records that a scoped rule compiles to two classes and
  is injected AFTER the sheet, UNLAYERED — which would let this component silently out-rank every
  global rule at any specificity. That is a hazard the programme is removing, not a mechanism to
  build a primitive on. (The one licensed exception is a CALL SITE stating its own per-site skin:
  the five player pagers reach this trigger from their own `:global(…)` blocks, and they win on
  that same unlayered axis deliberately.)

  The consequence, since the sheet imports at `layer(modules)`: every rule this component
  inherits from `.fabricate-picker*` and `.manager-travel-*` is an ORDINARY same-layer contest,
  won on specificity or on source order. The sheet's own family block records which, rule by
  rule, from a mechanical enumeration rather than from prose — and
  `tests/components/manager-layout.test.js` measures the resulting paint in a real browser.

  ── PROPS ───────────────────────────────────────────────────────────────────────────────────
    value      — the chosen option's `value`: string, number or null. `null` shows `placeholder`.
    onChange   — REQUIRED. Called with the option's own `value`, typed as the caller passed it.
    options    — [{ value, label, hint?, badge?, disabled?, disabledReason?, group? }]
                 `hint` is a second line under the label, `badge` a trailing pill, `group` a
                 heading (see below), and `disabled` gates the row with `disabledReason` as its
                 announced reason. `disabled` is a RECORDED DIVERGENCE from the specimen's option
                 shape, which lists `disabledReason` without it: a reason cannot be drawn without
                 a state to draw it for, and a snippet alone cannot make a row refuse a click.
    size       — `'form'` (default) 38px / radius 9 / 12.5px / `--fab-surface-soft`
                 `'inline'` 30px / radius 7 / 11.5px / `--fab-bg-2`
                 `'toolbar'` 34px / radius 9 / `0.72rem` / `--fab-bg-1`
    showTick   — the selected column in the option list. DEFAULT TRUE, and it is a property of the
                 LIST rather than of an option: `spec.md` earns it "where options are close
                 cousins and a reader must confirm which is live" and drops it "where the trigger
                 already states the value". Both polarities have callers, which is why it is a
                 prop and not a constant.
    placeholder — the trigger's text while `value` is null.
    minWidth / maxWidth — the PANEL's width band in px, `0` for the rung's own default (240/340
                 form, 96/240 inline, 160/320 toolbar). Both are needed AND not sufficient on
                 their own: `.fabricate-picker-popover.manager-travel-popover` declares
                 `min-width: 240px` in the sheet, which FLOORS the inline width the layout writes,
                 so the per-rung panel rules below restate the band. {@link SIZES} is the single
                 source of the numbers and a mounted case pins the CSS against it.
    triggerData — a `data-*` map stamped verbatim on the trigger button, which is where every
                 converted call site's own stable hook goes. `data-select-size` is added to it.
    label / hint / error — present ⇒ the whole control renders inside `<Field as="label">`, with a
                 caption span before the trigger and the hint or error span after it. A `<label>`
                 does not name a `<button>` by containment, so the caption is given an id and
                 pointed at with `aria-labelledby`; that is why the labelled form does not also
                 need an `ariaLabel`.
    ariaLabel / ariaLabelledBy — the accessible name when there is no `label`. One of the three is
                 required. Never pass `ariaLabel` beside `ariaLabelledBy`: a labelledby WINS over
                 a label wherever both are present, so the string would be dead text free to drift
                 from the caption it duplicates.
    id / name  — the specimen marks both required because a `<label for>` and an error message
                 reference them. Neither is required here and the reason is structural: the
                 labelled form names its trigger with `aria-labelledby`, so there is no `for`/`id`
                 pair to complete. Both are forwarded to the trigger button when supplied.
    readonly   — takes focus and REFUSES to open. Mapped to the primitive's `triggerAriaDisabled`
                 rather than to `disabled`, because a `disabled` button does not take focus at all
                 and "takes focus and refuses" could not have been built on it.
    disabled   — the whole control off.
    invalid    — `aria-invalid` on the trigger and the danger border.
    mono       — the value in the mono face with tabular figures.
    icon       — a leading Font Awesome glyph class on the trigger.
    class      — an extra class on the picker ROOT, so a call site can reach the trigger's own box
                 with a descendant rule.
    ...rest    — forwarded to the `<Field>` root in the labelled form. See the note at
                 {@link restTarget} for why the bare form has no home for it yet.
-->
<script>
  import Chip from '../apps/manager/Chip.svelte';
  import Field from './Field.svelte';
  import SearchablePopover from './SearchablePopover.svelte';

  /**
   * THE NON-EMPTY HOOK FOR AN EMPTY-STRING VALUE, declared once and nowhere else.
   *
   * `SearchablePopover` writes `data-popover-option={option.dataId || undefined}`, so a `dataId`
   * of `''` omits the attribute entirely. The three bulk-edit selects this component converts all
   * lead with an empty-string sentinel — the "Leave unchanged" row, which is both the panel's
   * default and the only way to UNSTAGE an axis — so `String(option.value)` would leave exactly
   * that row unaddressable by the capture registry's `data-popover-option` idiom, by any mounted
   * test and by the Foundry smoke, while every other row resolved.
   *
   * It is a HAND-MAINTAINED MIRROR: the literal is spelled here, in the mounted suite, and in any
   * capture step or smoke step that clicks the default row. Nothing in `npm test` would red if
   * this spelling drifted — the only symptom would be a click timeout in a capture run — so
   * `tests/components/select-mounted.test.js` reads this literal out of this file's SOURCE and
   * compares it against the value its own cases use.
   */
  const UNCHANGED_OPTION_ID = '__unchanged__';

  /**
   * The three published rungs, and the PANEL band each one opens at.
   *
   * The band is here rather than only in the CSS because `SearchablePopover` needs it as PROPS:
   * `actions/anchoredPopover.js` writes the panel's width as an inline style computed inside
   * `[minWidth, maxWidth]`, while the sheet's own `min-width: 240px` then floors the result. So
   * both halves are required, and the CSS half below is pinned against THIS table by a mounted
   * case rather than left as a second copy free to drift.
   *
   * The numbers are starting values derived from the widest rendered option label at each
   * converting site: two-digit page sizes and a three-word category for `inline`, a lane-filter
   * value or a sort key for `toolbar`, and the primitive's own untouched band for `form`.
   */
  const SIZES = Object.freeze({
    form: Object.freeze({ minWidth: 240, maxWidth: 340 }),
    inline: Object.freeze({ minWidth: 96, maxWidth: 240 }),
    toolbar: Object.freeze({ minWidth: 160, maxWidth: 320 }),
  });

  const FALLBACK_SIZE = 'form';

  let {
    value = null,
    onChange = () => {},
    options = [],
    size = FALLBACK_SIZE,
    showTick = true,
    placeholder = '',
    minWidth = 0,
    maxWidth = 0,
    triggerData = {},
    label = '',
    hint = '',
    error = '',
    ariaLabel = '',
    ariaLabelledBy = '',
    id = '',
    name = '',
    readonly = false,
    disabled = false,
    invalid = false,
    mono = false,
    icon = '',
    class: extraClass = '',
    ...rest
  } = $props();

  // The caption's id, per instance. `$props.id()` is Svelte's own answer to "this element needs a
  // document-unique id": two `<Select>`s with the same label on one screen must not both point
  // their trigger at the same caption.
  const instanceId = $props.id();
  const captionId = `${instanceId}-caption`;

  const rung = $derived(Object.hasOwn(SIZES, size) ? size : FALLBACK_SIZE);
  const band = $derived(SIZES[rung]);

  // THE LABELLED FORM IS DECIDED BY THE CONTENT, not by a prop. `<Field>` is a COLUMN — a caption
  // above the control and a hint below it — so a call site with an INLINE caption beside the
  // control (a pager's "Per page", a toolbar's "SORT BY") deliberately passes none of the three
  // and keeps its own layout.
  const labelled = $derived(Boolean(label || hint || error));

  // `aria-labelledby` WINS over `aria-label`, so the two are mutually exclusive rather than
  // additive: with a caption on screen the caption is the name, and a string beside it would be a
  // second copy free to drift. The labelled form therefore points at its own caption and passes
  // no label at all.
  const labelledByTarget = $derived(ariaLabelledBy || (label ? captionId : ''));
  const labelTarget = $derived(labelledByTarget ? '' : ariaLabel);

  /**
   * The primitive's option array, built at the ONE point where the two vocabularies meet.
   *
   * `id` and `dataId` are derived from the same `option.value` in the same place, so the strict
   * equality `aria-selected` performs and the string serialization `data-popover-option` performs
   * agree by construction rather than by two authors remembering the same rule.
   *
   * `hint`, `badge` and `disabledReason` ride along as DATA rather than being mapped onto the
   * primitive's own `meta`/`trailing` props, because the row's content is drawn by this
   * component's own `option` snippet below — which is the row's sole content, so the primitive
   * draws none of its own.
   */
  const popoverOptions = $derived(
    options.map((option) => ({
      id: String(option.value),
      dataId: option.value === '' ? UNCHANGED_OPTION_ID : String(option.value),
      label: option.label,
      hint: option.hint,
      badge: option.badge,
      group: option.group,
      disabled: Boolean(option.disabled),
      disabledReason: option.disabledReason,
    }))
  );

  /**
   * The group headings, DERIVED from the options rather than declared by the caller.
   *
   * `SearchablePopover` returns an unbucketed list when `optionGroups` is empty, so `option.group`
   * alone renders no heading at all — the prop is what makes a group visible. Deriving it means no
   * caller has to state the same vocabulary twice, and FIRST-APPEARANCE order is what puts the
   * check-tier list's two instructions above its named tiers without a second prop to order them.
   *
   * The group VALUE is both the bucket id and the heading TEXT, so it is localized copy: nothing
   * may key off `data-popover-group` for a grouped `<Select>`, because that attribute is now
   * locale-dependent. Options with no `group` fall into the primitive's own trailing,
   * heading-less bucket.
   */
  const optionGroups = $derived.by(() => {
    const groups = [];
    for (const option of options) {
      const group = option?.group;
      // An ARRAY rather than a `Set` because `svelte/prefer-svelte-reactivity` refuses a mutable
      // built-in `Set` inside a component, and a reactive one would be a store for a value that
      // lives and dies inside this one derivation. An option list is a handful of rows.
      if (!group || groups.some((held) => held.id === group)) continue;
      groups.push({ id: group, label: group });
    }
    return groups;
  });

  const selectedOption = $derived(options.find((option) => option.value === value));
  const triggerText = $derived(selectedOption ? selectedOption.label : placeholder);
  const showingPlaceholder = $derived(!selectedOption && Boolean(placeholder));

  /**
   * The caller's own typed value for a row the primitive identified by string.
   *
   * The lookup is over `options` rather than a `Number()` coercion because the API's `value` is
   * `string | number | null`: a page-size control wants the number 25 back and a category filter
   * wants the string `consumable`, and only the option that produced the id knows which.
   *
   * @param {string} chosenId The primitive's own option id.
   * @returns {string|number|null|undefined} The caller's value for that row.
   */
  function valueForId(chosenId) {
    const match = options.find((option) => String(option.value) === chosenId);
    return match ? match.value : undefined;
  }

  function choose(chosenId) {
    const chosen = valueForId(chosenId);
    if (chosen === undefined) return;
    onChange(chosen);
  }

  /**
   * WHERE `...rest` LANDS, and the one shape that has no home for it yet.
   *
   * In the labelled form the root is this component's own `<Field>`, which forwards every
   * unrecognised attribute. In the BARE form the root is the picker root, which
   * `SearchablePopover` writes and which takes no attribute spread — so a rest attribute there
   * would be silently dropped, and silently dropping a `data-*` hook is exactly the failure this
   * plan's gates exist to prevent. It is therefore refused loudly instead, and the route every
   * converting call site actually uses is `triggerData`, which stamps the hook on the CONTROL
   * rather than on a wrapper around it.
   */
  const restTarget = $derived(labelled ? rest : {});

  $effect(() => {
    if (labelled || Object.keys(rest).length === 0) return;
    console.warn(
      `Fabricate | Select: ${Object.keys(rest).join(', ')} cannot be forwarded without a ` +
        "`label`, `hint` or `error`, because the bare form's root element belongs to " +
        'SearchablePopover and takes no attribute spread. Pass a `data-*` hook through ' +
        '`triggerData`, which stamps it on the trigger button itself.'
    );
  });

  $effect(() => {
    if (labelled || labelledByTarget || ariaLabel) return;
    console.warn(
      'Fabricate | Select: rendered with no `label`, no `ariaLabel` and no `ariaLabelledBy`, so ' +
        'the trigger has no accessible name at all.'
    );
  });

  const triggerAttributeData = $derived({
    ...triggerData,
    'data-select-size': rung,
    'aria-invalid': invalid ? 'true' : undefined,
    id: id || undefined,
    name: name || undefined,
  });

  const triggerClass = $derived(`fabricate-select-trigger fabricate-select-trigger-${rung}`);
  const popoverClass = $derived(
    [
      'fabricate-select-popover',
      `fabricate-select-popover-${rung}`,
      showTick ? 'fabricate-select-popover-ticked' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
  const valueClass = $derived(
    [
      'fabricate-select-value',
      showingPlaceholder ? 'fabricate-select-value-placeholder' : '',
      mono ? 'fabricate-select-value-mono' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

{#snippet optionRow(option)}
  <!-- The tick is on EVERY row rather than only on the selected one, so the label column does not
       go ragged: the specimen draws an unselected row's check at `opacity: 0` for exactly that
       reason. Which row shows it is decided in CSS from the row's own `aria-selected`, which the
       primitive owns — so the marker cannot disagree with the announcement. -->
  {#if showTick}
    <span class="fabricate-select-tick" aria-hidden="true"><i class="fas fa-check"></i></span>
  {/if}
  {#if option.hint}
    <!-- The two-line form. The wrapper carries the flex sizing the single-line label carries on
         its own, so the label keeps ellipsising rather than pushing a trailing badge out of the
         row. -->
    <span class="fabricate-select-lines">
      <span class="fabricate-select-label">{option.label}</span>
      <span class="fabricate-select-hint">{option.hint}</span>
    </span>
  {:else}
    <span class="fabricate-select-label">{option.label}</span>
  {/if}
  {#if option.badge}
    <Chip class="fabricate-select-badge" data-popover-option-badge="">{option.badge}</Chip>
  {/if}
  <!-- WHY THE REASON IS DRAWN HERE AND NOT BY THE PRIMITIVE. `SearchablePopover` draws a gated
       row's reason as a trailing disabled Chip in its OWN row content, and this snippet is the
       row's sole content — so for a `<Select>` the reason is this component's to draw. It renders
       LAST so it sits at the row's trailing edge, and INSIDE the button so a screen-reader user
       is told WHY as well as THAT. -->
  {#if option.disabled && option.disabledReason}
    <Chip tone="disabled" class="fabricate-select-reason" data-popover-option-reason=""
      >{option.disabledReason}</Chip
    >
  {/if}
{/snippet}

{#snippet control()}
  <SearchablePopover
    options={popoverOptions}
    {optionGroups}
    value={String(value)}
    showSearch={false}
    triggerHasPopup="listbox"
    pickerClass={`fabricate-select ${extraClass}`}
    {triggerClass}
    {valueClass}
    {popoverClass}
    listClass="fabricate-select-options"
    optionClass="fabricate-select-option"
    triggerLabel={triggerText}
    triggerIcon={icon}
    triggerData={triggerAttributeData}
    triggerAriaLabel={labelTarget}
    triggerAriaLabelledBy={labelledByTarget}
    triggerAriaDisabled={readonly}
    dialogAriaLabel={label || ariaLabel}
    minWidth={minWidth || band.minWidth}
    maxWidth={maxWidth || band.maxWidth}
    {disabled}
    option={optionRow}
    onChoose={choose}
  />
{/snippet}

{#if labelled}
  <Field as="label" class={`fabricate-select-field ${extraClass}`} {...restTarget}>
    <span class="fabricate-select-caption" id={captionId}>{label}</span>
    {@render control()}
    {#if error}
      <span class="fabricate-select-error">{error}</span>
    {:else if hint}
      <span class="fabricate-select-note">{hint}</span>
    {/if}
  </Field>
{:else}
  {@render control()}
{/if}
