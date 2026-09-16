<!--
  THE APP'S ONE SELECT, which the design system's specimen states in one line: "Every select in the
  app renders this list". A native `<select>` popup is drawn by the OPERATING SYSTEM, so it ignores
  the theme, differs between browsers and cannot carry a tick, a group heading, a description, a
  badge or a reason for being unavailable. It is a THIN COMPOSITION over `SearchablePopover` with
  the query field suppressed; what it owns is the SELECT'S OWN vocabulary — a
  `{value, label, hint, badge, group}` option shape, three published size rungs, the tick column and
  the `<Field as="div">` labelled form.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string \| number \| null | `null` | The chosen option's `value`. `null` shows `placeholder`. BOTH SIDES OF THE SELECTION TEST MUST BE STRINGIFIED: the primitive writes `aria-selected={option.id === value}`, a STRICT equality, so forwarding a numeric `value` beside `id: String(option.value)` leaves `'25' === 25` false and NO row marked selected. `valueForId` maps back, so `onChange` hands the caller the value it passed in. |
  | `onChange(value)` | function | no-op | REQUIRED. Called with the option's own `value`, typed as the caller passed it. |
  | `options` | `[{ value, label, hint?, badge?, disabled?, disabledReason?, group? }]` | `[]` | `hint` is a second line, `badge` a trailing pill, `group` a heading whose VALUE is both the bucket id and the heading TEXT — so it is LOCALIZED COPY, and nothing may key off `data-popover-group` for a grouped `<Select>`. `disabled` is a RECORDED DIVERGENCE from the specimen's shape, which lists `disabledReason` without it: a reason cannot be drawn without a state to draw it for. An empty-string `value` takes `UNCHANGED_OPTION_ID` as its hook, because the primitive omits `data-popover-option` for an empty `dataId` and `''` is exactly what a bulk-edit panel's leading "Leave unchanged" row uses as its sentinel — the panel's default and its only affordance for unstaging an axis. That literal is a hand-maintained mirror guarded by `tests/components/select-mounted.test.js`. |
  | `size` | `'form'` \| `'inline'` \| `'toolbar'` | `'form'` | 38px/radius 9/12.5px/`--fab-surface-soft`, 30px/radius 7/11.5px/`--fab-bg-2`, 34px/radius 9/`0.72rem`/`--fab-bg-1`. It names a height, a corner, a type size AND a fill, because the fill is its own axis rather than a consequence of the geometry. A call site needing a different fill states it in a descendant rule of its own wrapper class; there is deliberately NO trigger-box prop, because the trigger's width and fill are per-site skin rather than primitive appearance. |
  | `showTick` | boolean | `true` | The selected column, a property of the LIST rather than of an option. `spec.md` earns it "where options are close cousins and a reader must confirm which is live" and drops it "where the trigger already states the value"; both polarities have callers. |
  | `placeholder` | string | `''` | The trigger's text while `value` is null. |
  | `minWidth` / `maxWidth` | px | `0` | The PANEL's width band; `0` takes the rung's own. Either DECIDES a measured panel's box, because `anchoredPopover` resolves the band into one width and writes it as that width and as both bounds. `SIZES` is the single source of the numbers and a mounted case pins the sheet's per-rung fallback against it. |
  | `triggerData` | `{ 'data-x': 'value' }` | `{}` | Stamped verbatim on the trigger button, which is where a converted call site's stable hook goes. It CANNOT carry a NAME or a TOOLTIP: `SearchablePopover` spreads it FIRST and then writes `title`, `aria-label` and `aria-labelledby` from its own props, so any of the three placed here is deleted. |
  | `triggerTitle` | string | `''` | A native `title` on the trigger, and the only route to one. |
  | `label` / `hint` / `error` | strings | `''` | Any of the three renders the whole control inside `<Field as="div">`, with a caption span before the trigger and the note span after it. |
  | `ariaLabel` / `ariaLabelledBy` | string / id list | `''` | The accessible name when there is no `label`. ONE OF THE THREE IS REQUIRED, AND `ariaLabel` IS NEVER PASSED BESIDE `ariaLabelledBy`: a labelledby WINS wherever both are present, so the string would be dead text free to drift from the caption it duplicates. ALL THREE NAME THE OPEN PANEL as well as the trigger — `label`/`ariaLabel` as the primitive's `dialogAriaLabel` and `ariaLabelledBy` as its `dialogAriaLabelledBy` — so a control given only a `hint` or an `error` satisfies neither and would open an unnamed dialog wrapping an unnamed list. |
  | `ariaDescribedBy` | id list | `''` | The trigger's description, for a caller that renders its own hint or error beside the control. Overrides this component's own note span. Never routed through `triggerData`. |
  | `id` / `name` | strings | `''` | Forwarded to the trigger button. Neither is required, because the labelled form names its trigger with `aria-labelledby` and there is no `for`/`id` pair to complete. |
  | `readonly` | boolean | `false` | Takes focus and REFUSES to open. Mapped to the primitive's `triggerAriaDisabled`, NOT to `disabled`: a `disabled` button does not take focus at all, so "takes focus and refuses" could not be built on it. |
  | `disabled` | boolean | `false` | The whole control off. |
  | `invalid` | boolean | `false` | `aria-invalid` on the trigger and the danger border. |
  | `mono` | boolean | `false` | The value in the mono face with tabular figures. |
  | `icon` | Font Awesome classes | `''` | A leading glyph on the trigger. |
  | `class` | class string | `''` | An extra class on the picker ROOT, so a call site can reach the trigger's own box with a descendant rule. |

  Rest spread:
  - `{...rest}` lands on the `<Field>` root in the LABELLED form only. The bare form's root is the
    picker root, which `SearchablePopover` writes and which takes no spread, so a rest attribute
    there is refused loudly rather than dropped silently; `triggerData` is the route.

  Invariants:
  - THIS COMPONENT HAS NO `<style>` AT ALL, and the `.fabricate-select*` family lives in
    `styles/fabricate.css`: `searchable-popover-area-scope.test.js` reads the SHEET, so a
    scoped-style family gives the one gate that proves a family is not app-rooted nothing to
    quantify over, and a scoped rule is injected UNLAYERED, which would let this component out-rank
    every global rule at any specificity. The one licensed exception is a CALL SITE stating its own
    per-site skin, which wins on that same unlayered axis deliberately.
  - THE `toolbar` RUNG'S TYPE IS THE LITERAL `0.72rem`, never a read of `--fab-recipe-control-font`.
    That property is declared only inside `.fabricate-manager`, so read from outside the manager it
    is undefined, the declaration is invalid at computed-value time and the size silently falls
    back to inheritance; `tests/token-generation-gate.test.js` ratchets that read out of scoped
    styles. Its WEIGHT is a published ramp numeral rather than the off-ramp `normal`.
  - THE LABELLED FORM'S HOST IS A `<div>`, NEVER A `<label>`. A `<label>` also FORWARDS a caption
    click into the control it wraps, and this control toggles a portaled panel dismissed on
    `mousedown` in the capture phase — so from open, the caption's mousedown dismissed the list
    and the forwarded click re-opened it, and the list could never be closed from its own caption.
    The caption is named by `aria-labelledby` because there is no `id`-bearing labelable element
    for a `for` to address, NOT because a `<label>` cannot name a `<button>`. The ACCEPTED COST is
    that the caption stops being a hit target.
-->
<script>
  import Chip from './Chip.svelte';
  import Field from './Field.svelte';
  import SearchablePopover from './SearchablePopover.svelte';

  /**
   * THE NON-EMPTY HOOK FOR AN EMPTY-STRING VALUE, declared once and nowhere else; see the
   * header. It is a HAND-MAINTAINED MIRROR — the literal is spelled here, in the mounted suite
   * and in any capture or smoke step that clicks the default row, and nothing in `npm test`
   * would red if it drifted, so `tests/components/select-mounted.test.js` reads this literal out
   * of this file's SOURCE and compares it against the value its own cases use.
   */
  const UNCHANGED_OPTION_ID = '__unchanged__';

  /**
   * The three published rungs, and the PANEL band each one opens at. The band is here rather than
   * only in the CSS because `SearchablePopover` needs it as PROPS, and `anchoredPopover` writes
   * the resolved width as a width AND as both bounds — so THIS table decides a measured panel's
   * box and a caller's own `maxWidth` wins outright. The sheet's per-rung rules mirror it for the
   * unmeasured fallback alone, and a mounted case pins the two copies equal.
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
    triggerTitle = '',
    label = '',
    hint = '',
    error = '',
    ariaLabel = '',
    ariaLabelledBy = '',
    ariaDescribedBy = '',
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

  // Per instance: two `<Select>`s with the same label on one screen must not both point their
  // trigger at the same caption.
  const instanceId = $props.id();
  const captionId = `${instanceId}-caption`;
  const noteId = `${instanceId}-note`;

  const rung = $derived(Object.hasOwn(SIZES, size) ? size : FALLBACK_SIZE);
  const band = $derived(SIZES[rung]);

  // THE LABELLED FORM IS DECIDED BY THE CONTENT, not by a prop. `<Field>` is a COLUMN, so a call
  // site with an INLINE caption beside the control passes none of the three and keeps its own
  // layout.
  const labelled = $derived(Boolean(label || hint || error));

  const labelledByTarget = $derived(ariaLabelledBy || (label ? captionId : ''));
  const labelTarget = $derived(labelledByTarget ? '' : ariaLabel);

  // THE DESCRIPTION IS THE SPAN THIS COMPONENT ALREADY DRAWS, unless the caller names its own.
  // The labelled form renders the note AFTER the trigger with nothing pointing at it, and a
  // `<button>` has no containment that would announce it. A caller that draws the hint itself has
  // the id the trigger must point at and this component does not.
  const describedByTarget = $derived(
    ariaDescribedBy || (labelled && (error || hint) ? noteId : '')
  );

  /**
   * The primitive's option array, built at the ONE point where the two vocabularies meet, so the
   * strict equality and the string serialization agree by construction. `hint`, `badge` and
   * `disabledReason` ride along as DATA, because the row's content is drawn by this component's
   * own `option` snippet — which is the row's sole content.
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
   * The group headings, DERIVED from the options rather than declared by the caller, so no caller
   * states the same vocabulary twice. FIRST-APPEARANCE order is what orders them without a second
   * prop; options with no `group` fall into the primitive's trailing, heading-less bucket.
   */
  const optionGroups = $derived.by(() => {
    const groups = [];
    for (const option of options) {
      const group = option?.group;
      // An ARRAY rather than a `Set`: `svelte/prefer-svelte-reactivity` refuses a mutable
      // built-in `Set` in a component, and an option list is a handful of rows.
      if (!group || groups.some((held) => held.id === group)) continue;
      groups.push({ id: group, label: group });
    }
    return groups;
  });

  const selectedOption = $derived(options.find((option) => option.value === value));
  const triggerText = $derived(selectedOption ? selectedOption.label : placeholder);
  const showingPlaceholder = $derived(!selectedOption && Boolean(placeholder));

  /**
   * The caller's own typed value for a row the primitive identified by string. The lookup is over
   * `options` rather than a `Number()` coercion, because only the option that produced the id
   * knows which type it was.
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
   * WHERE `...rest` LANDS; see the header's rest-spread note for why the bare form refuses it
   * loudly rather than dropping a `data-*` hook silently.
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
    if (!labelled && !labelledByTarget && !ariaLabel) {
      console.warn(
        'Fabricate | Select: rendered with no `label`, no `ariaLabel` and no `ariaLabelledBy`, ' +
          'so the trigger has no accessible name at all.'
      );
    }
    // THE PANEL IS NAMED SEPARATELY FROM THE TRIGGER, because the two resolve from the same
    // three props through DIFFERENT routes: the trigger can be named by the caption id this
    // component mints, while the panel needs the caller's own string or pointer.
    if (!label && !ariaLabel && !ariaLabelledBy) {
      console.warn(
        'Fabricate | Select: the panel it opens, and the option list inside it, have no ' +
          'accessible name: neither `dialogAriaLabel` nor `dialogAriaLabelledBy` resolves to ' +
          'anything. Pass a `label`, an `ariaLabel` or an `ariaLabelledBy`.'
      );
    }
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
  <!-- The tick is on EVERY row rather than only the selected one, so the label column does not go
       ragged; the specimen draws an unselected row's check at `opacity: 0` for that reason. Which
       row shows it is decided in CSS from the row's own `aria-selected`, which the primitive
       owns, so the marker cannot disagree with the announcement. -->
  {#if showTick}
    <span class="fabricate-select-tick" aria-hidden="true"><i class="fas fa-check"></i></span>
  {/if}
  {#if option.hint}
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
  <!-- THE REASON IS DRAWN HERE, NOT BY THE PRIMITIVE: this snippet is the row's sole content, so
       for a `<Select>` the reason is this component's to draw. It renders LAST so it sits at the
       row's trailing edge, and INSIDE the button so the reason is part of the accessible name. -->
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
    {triggerTitle}
    triggerAriaLabel={labelTarget}
    triggerAriaLabelledBy={labelledByTarget}
    triggerAriaDescribedBy={describedByTarget}
    triggerAriaDisabled={readonly}
    dialogAriaLabel={label || ariaLabel}
    dialogAriaLabelledBy={ariaLabelledBy}
    minWidth={minWidth || band.minWidth}
    maxWidth={maxWidth || band.maxWidth}
    {disabled}
    option={optionRow}
    onChoose={choose}
  />
{/snippet}

{#if labelled}
  <Field as="div" class={`fabricate-select-field ${extraClass}`} {...restTarget}>
    <span class="fabricate-select-caption" id={captionId}>{label}</span>
    {@render control()}
    {#if error}
      <span class="fabricate-select-error" id={noteId}>{error}</span>
    {:else if hint}
      <span class="fabricate-select-note" id={noteId}>{hint}</span>
    {/if}
  </Field>
{:else}
  {@render control()}
{/if}
