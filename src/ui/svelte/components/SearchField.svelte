<!--
  The library's `<Search>`: a query field that narrows a list already on screen and never commits a
  choice (a field that commits is a `Typeahead`). The default shell is 38 high, radius 9, on
  `--fab-surface-soft`, with an in-flow 12px glyph 8px before the input; `density="compact"` keeps
  the ruled 32px exception at its four sites. An import-light leaf: callers pass localized text.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | bindable string | `''` | The current query. |
  | `onChange(next, event)` | function | `undefined` | Called after `value` is updated. |
  | `placeholder` | localized string | `undefined` | The hint inside the empty field. |
  | `label` / `ariaLabel` / `ariaLabelledBy` | localized string / string / id list | `''` | EXACTLY ONE names the input; see the invariants. |
  | `density` | `'default'` \| `'compact'` | `'default'` | `compact` emits `is-compact`. |
  | `icon` | Font Awesome class | `'fas fa-search'` | The glyph before the input. |
  | `class` | class string | `''` | Appended to the root's own class. |
  | `inputProps` | attribute object | `undefined` | Attributes and handlers for the input, which the rest spread cannot reach. |

  Invariants:
  - ONE NAMING ROUTE. `label` renders the root as `<Field as="label">` with a caption above an
    inner `<span class="fabricate-search">`; `ariaLabel` or `ariaLabelledBy` keeps the root a
    `<label class="fabricate-search">` wrapping a glyph and the input, which has no text of its
    own. `tests/components/manager-filter-bar-source-contract.test.js` holds every call site to
    exactly one, and this component warns when it is given none or several.
  - `{...rest}` lands on the root. The input's own `type`, `value`, name and `oninput` are written
    after `inputProps`, and a caller's `oninput` runs AFTER `onChange` rather than replacing it.
  - It writes no scoped `<style>`: `styles/fabricate.css` owns the `fabricate-search` family.
-->
<script>
  import Field from './Field.svelte';

  let {
    value = $bindable(''),
    onChange = undefined,
    placeholder = undefined,
    label = '',
    ariaLabel = '',
    ariaLabelledBy = '',
    density = 'default',
    icon = 'fas fa-search',
    class: extraClass = '',
    inputProps = undefined,
    ...rest
  } = $props();

  const classes = $derived(
    ['fabricate-search', density === 'compact' ? 'is-compact' : ''].filter(Boolean).join(' ')
  );
  const fieldClasses = $derived(['fabricate-search-field', extraClass].filter(Boolean).join(' '));

  const { oninput: callerInput = undefined, ...inputAttributes } = $derived(inputProps ?? {});

  const namingRoutes = $derived([label, ariaLabel, ariaLabelledBy].filter(Boolean).length);

  $effect(() => {
    if (namingRoutes === 1) return;
    console.warn(
      `Fabricate | SearchField: given ${namingRoutes} naming routes. Pass exactly one of ` +
        '`label`, `ariaLabel` or `ariaLabelledBy`, so the input has one accessible name.'
    );
  });

  function handleInput(event) {
    const next = event.currentTarget.value;
    value = next;
    onChange?.(next, event);
    callerInput?.(event);
  }
</script>

{#snippet control()}
  <i class={icon || 'fas fa-search'} aria-hidden="true"></i>
  <input
    {...inputAttributes}
    type="search"
    {value}
    {placeholder}
    aria-label={label ? undefined : ariaLabel || undefined}
    aria-labelledby={label ? undefined : ariaLabelledBy || undefined}
    oninput={handleInput}
  />
{/snippet}

{#if label}
  <!-- ratchet-exempt(design-system): the spread is this primitive's own rest, forwarded to the root it composes -->
  <Field as="label" class={fieldClasses} {...rest}>
    <span class="fabricate-search-caption">{label}</span>
    <span class={classes}>{@render control()}</span>
  </Field>
{:else}
  <label class={[classes, extraClass].filter(Boolean).join(' ')} {...rest}>
    {@render control()}
  </label>
{/if}
