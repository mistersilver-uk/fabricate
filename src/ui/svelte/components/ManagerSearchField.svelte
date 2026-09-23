<!--
  The manager's search field: a `<label>` wrapping a leading glyph and an `<input type="search">`.
  An import-free leaf, so callers pass already-localized `placeholder` and `ariaLabel`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | bindable string | `''` | The current query. |
  | `onInput(next, event)` | function | `undefined` | Called after `value` is updated. |
  | `placeholder` / `ariaLabel` | localized strings | `undefined` | `ariaLabel` is REQUIRED; see the invariants. |
  | `compact` | boolean | `false` | Emits `is-compact`, the 32px `min(220px, 30%)` density. |
  | `size` | `''` \| `'38'` | `''` | The control-height rung, named as a string; an unrecognised value resolves to `''` rather than emitting an unstyled `is-size-*`. |
  | `class` | class string | `''` | An extra class, appended after the primitive's own and after `is-compact`. |
  | `inputAttrs` | attribute bag | `undefined` | Attributes for the INPUT, which the rest spread cannot reach. |

  Rest spread:
  - `{...rest}` lands on the `<label>`, carrying its `data-*` hooks and `id`; `class` is a named
    prop, because the spread is written after `class={classes}` and a rest key would replace it.
  - A bare `data-*` on a component TAG is the boolean `true`, and an `inputAttrs` entry written
    `{ 'data-x': true }` does the same; spell the value `''`, per
    `openspec/specs/design-system/spec.md`.

  Invariants:
  - `ariaLabel` IS REQUIRED. The `<label>` wraps an icon and an input and no text, so it contributes
    no accessible name. `tests/manager-search-field-source-contract.test.js` asserts every call site
    passes it.
  - It writes no scoped `<style>`, declares its `font: inherit` floor at `.fabricate-search input`
    and pairs a focus strip above its repaint, per the same spec's class-family requirement. Two
    `@container fabricate-manager` family rules stay behind in the manager for the reason it states,
    and `tests/components/re-rooted-controls-host-independence.test.js` excludes those two by count.
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

  const SIZE_CLASSES = { 38: 'is-size-38' };

  const sizeClass = $derived(
    Object.hasOwn(SIZE_CLASSES, String(size ?? '')) ? SIZE_CLASSES[String(size)] : ''
  );

  const classes = $derived(
    ['fabricate-search', 'manager-search', compact ? 'is-compact' : '', sizeClass, extraClass]
      .filter(Boolean)
      .join(' ')
  );

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
