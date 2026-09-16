<!--
  THE manager's labelled form field — the `.manager-field` column that stacks a caption over its
  control.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `as` | `'label'` \| `'div'` \| `'fieldset'` | none | REQUIRED-SHAPED; see the invariants. An unrecognised or missing value renders a `<div>` and `console.warn`s. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | Conventionally a `<span>` caption followed by the control — the shape the sheet's `> span` and blanket control rules are written against. |

  Rest spread:
  - `{...rest}` lands on the host element, carrying `data-*` hooks, `id`, `aria-*`, `title`, and
    `disabled` on the fieldset; `class` is a named prop, per
    `openspec/specs/design-system/spec.md`, "A shared primitive's class family is rooted at the
    primitive, not at an app".

  Invariants:
  - `as` IS A CLOSED SET WITH NO CORRECT DEFAULT. A `<label>` field wraps its control and gives it
    its accessible name; a `<div>` field does not, and the sites needing one hold two controls, or
    none, or a control already named elsewhere. The decision is invisible in the pixels and
    load-bearing in the announcement, so `tests/components/field-source-contract.test.js` requires a
    literal `as` on every `<Field>` in `src/`.
  - THE FALLBACK IS `div`, NEVER `label`. A missing `as` that renders a `<div>` loses an implicit
    association; one that rendered a `<label>` would INVENT one. `label` and `fieldset` both carry
    behaviour, so neither may be reached by omission.
  - `fieldset` is a member of the set rather than an allowlisted exception: its one caller,
    `RadioCardGroup.svelte`, renders a `<legend>`, holds a radio group, and forwards `disabled`,
    which only a `<fieldset>` applies to its descendants.
  - Its `font: inherit` floor is written at `.fabricate-field :is(input, select, textarea)`, its
    element-typed chrome is a second rule, its focus pair excludes `select`, and it writes no scoped
    `<style>` — all four for the reasons the class-family requirement states. Widening the floor
    instead would re-type the radios, ranges and steppers that rule deliberately excludes.
-->
<script>
  let { as = undefined, class: extraClass = '', children = undefined, ...rest } = $props();

  const HOSTS = new Set(['label', 'div', 'fieldset']);

  const FALLBACK_HOST = 'div';

  const host = $derived(HOSTS.has(as) ? as : FALLBACK_HOST);
  const classes = $derived(
    ['fabricate-field', 'manager-field', extraClass].filter(Boolean).join(' ')
  );

  $effect(() => {
    if (HOSTS.has(as)) return;
    console.warn(
      `Fabricate | Field: \`as\` must be one of ${[...HOSTS].join(', ')}; got ${JSON.stringify(as)}. ` +
        `Rendered a <${FALLBACK_HOST}>, so any control inside it is no longer named by this field.`
    );
  });
</script>

<svelte:element this={host} class={classes} {...rest}>{@render children?.()}</svelte:element>
