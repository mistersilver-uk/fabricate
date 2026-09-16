<!--
  THE APP'S ONE SELECT, which the design system's specimen states in one line: "Every select in the
  app renders this list". It is a THIN COMPOSITION over `SearchablePopover` with the query field
  suppressed; what it owns is the SELECT'S OWN vocabulary — a `{value, label, hint, badge, group}`
  option shape, three published size rungs, the tick column and the `<Field as="div">` labelled form.
  Why it is app-drawn at all is `openspec/specs/design-system/spec.md`'s, under "The Foundry contract
  binds every primitive".

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string \| number \| null | `null` | The chosen option's `value`; `null` shows `placeholder`. BOTH SIDES OF THE SELECTION TEST MUST BE STRINGIFIED, because the primitive writes a STRICT `option.id === value` and `'25' === 25` leaves no row marked. `valueForId` maps back, so `onChange` hands the caller the value it passed in. |
  | `onChange(value)` | function | no-op | REQUIRED. Called with the option's own `value`, typed as the caller passed it. |
  | `options` | `[{ value, label, hint?, badge?, disabled?, disabledReason?, group? }]` | `[]` | `hint` is a second line, `badge` a trailing pill, and `group` is both the bucket id and the heading TEXT — so it is LOCALIZED COPY, and nothing may key off `data-popover-group` for a grouped `<Select>`. `disabled` is a recorded divergence from the specimen, which lists `disabledReason` without it. An empty-string `value` takes `UNCHANGED_OPTION_ID` as its hook, because the primitive omits `data-popover-option` for an empty `dataId`. |
  | `size` | `'form'` \| `'inline'` \| `'toolbar'` | `'form'` | 38px/radius 9/12.5px/`--fab-surface-soft`, 30px/radius 7/11.5px/`--fab-bg-2`, 34px/radius 9/`0.72rem`/`--fab-bg-1`. It names a height, a corner, a type size AND a fill, because the fill is its own axis. There is deliberately no trigger-box prop: the trigger's width and fill are per-site skin, stated in a descendant rule of the caller's own wrapper class. |
  | `showTick` / `placeholder` | boolean / string | `true` / `''` | The selected column, a property of the LIST rather than of an option and with callers on both polarities; and the trigger's text while `value` is null. |
  | `minWidth` / `maxWidth` | px | `0` | The PANEL's width band; `0` takes the rung's own. Either DECIDES a measured panel's box, because `anchoredPopover` resolves the band into one width and writes it as both bounds; `SIZES` is the single source of the numbers. |
  | `triggerData` / `triggerTitle` | `{ 'data-x': 'value' }` / string | `{}` / `''` | Hooks stamped verbatim on the trigger button, and the only route to a native `title` on it. `triggerData` CANNOT carry a NAME or a TOOLTIP: `SearchablePopover` spreads it FIRST and then writes `title`, `aria-label` and `aria-labelledby` from its own props. |
  | `label` / `hint` / `error` | strings | `''` | Any renders the whole control inside `<Field as="div">`, with a caption span before the trigger and the note span after it. |
  | `ariaLabel` / `ariaLabelledBy` | string / id list | `''` | The accessible name when there is no `label`. ONE OF THE THREE IS REQUIRED, and `ariaLabel` IS NEVER PASSED BESIDE `ariaLabelledBy`, which wins and would leave the string dead text free to drift. All three name the OPEN PANEL as well as the trigger, so a control given only a `hint` or an `error` would open an unnamed dialog wrapping an unnamed list. |
  | `ariaDescribedBy` / `id` / `name` | id list / strings | `''` | The trigger's description, overriding this component's own note span and never routed through `triggerData`; and two attributes forwarded to the trigger button, neither required, because the labelled form names its trigger with `aria-labelledby`. |
  | `readonly` | boolean | `false` | Takes focus and REFUSES to open. Mapped to `triggerAriaDisabled`, not to `disabled`: a disabled button does not take focus, so "takes focus and refuses" could not be built on it. |
  | `disabled` / `invalid` / `mono` / `icon` / `class` | booleans / Font Awesome classes / class string | `false` / `false` / `false` / `''` / `''` | The whole control off; `aria-invalid` and the danger border; the value in the mono face with tabular figures; a leading glyph on the trigger; and an extra class on the picker ROOT, so a call site can reach the trigger's own box with a descendant rule. |

  Rest spread:
  - `{...rest}` lands on the `<Field>` root in the LABELLED form only. The bare form's root is the
    picker root, which `SearchablePopover` writes and which takes no spread, so a rest attribute
    there is refused loudly rather than dropped silently; `triggerData` is the route.

  Invariants:
  - THIS COMPONENT HAS NO `<style>` AT ALL, and the `.fabricate-select*` family lives in
    `styles/fabricate.css`, for the two reasons `openspec/specs/design-system/spec.md` states; a
    CALL SITE stating its own per-site skin is the licensed exception.
  - THE `toolbar` RUNG'S TYPE IS THE LITERAL `0.72rem`, never a read of `--fab-recipe-control-font`,
    which is declared only inside `.fabricate-manager` — the area-scoped-property rule in the same
    requirement; `tests/token-generation-gate.test.js` ratchets that read out of scoped styles.
  - THE LABELLED FORM'S HOST IS A `<div>`, NEVER A `<label>`. A `<label>` forwards a caption click
    into the control it wraps, and this control toggles a portaled panel dismissed on `mousedown` in
    the capture phase — so from open, the caption's mousedown dismissed the list and the forwarded
    click re-opened it. The caption is named by `aria-labelledby`, at the cost of not being a hit
    target.
  - `UNCHANGED_OPTION_ID` IS A HAND-MAINTAINED MIRROR spelled here, in the mounted suite and in any
    capture or smoke step that clicks the default row, so `tests/components/select-mounted.test.js`
    reads it out of this file's source and compares it against the value its own cases use.
-->
<script>
  import Chip from './Chip.svelte';
  import Field from './Field.svelte';
  import SearchablePopover from './SearchablePopover.svelte';

  const UNCHANGED_OPTION_ID = '__unchanged__';

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

  const instanceId = $props.id();
  const captionId = `${instanceId}-caption`;
  const noteId = `${instanceId}-note`;

  const rung = $derived(Object.hasOwn(SIZES, size) ? size : FALLBACK_SIZE);
  const band = $derived(SIZES[rung]);

  const labelled = $derived(Boolean(label || hint || error));

  const labelledByTarget = $derived(ariaLabelledBy || (label ? captionId : ''));
  const labelTarget = $derived(labelledByTarget ? '' : ariaLabel);

  const describedByTarget = $derived(
    ariaDescribedBy || (labelled && (error || hint) ? noteId : '')
  );

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

  const optionGroups = $derived.by(() => {
    const groups = [];
    for (const option of options) {
      const group = option?.group;
      if (!group || groups.some((held) => held.id === group)) continue;
      groups.push({ id: group, label: group });
    }
    return groups;
  });

  const selectedOption = $derived(options.find((option) => option.value === value));
  const triggerText = $derived(selectedOption ? selectedOption.label : placeholder);
  const showingPlaceholder = $derived(!selectedOption && Boolean(placeholder));

  function valueForId(chosenId) {
    const match = options.find((option) => String(option.value) === chosenId);
    return match ? match.value : undefined;
  }

  function choose(chosenId) {
    const chosen = valueForId(chosenId);
    if (chosen === undefined) return;
    onChange(chosen);
  }

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
