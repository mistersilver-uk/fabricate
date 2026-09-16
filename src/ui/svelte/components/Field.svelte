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
  - `{...rest}` lands on the host element, so a call site keeps its `data-*` hooks, `id`,
    `aria-*`, `title`, and `disabled` on the fieldset.
  - `class` is a named prop, because a rest key would REPLACE `manager-field` outright and
    silently unstyle the field while every `data-*` selector kept resolving.

  Invariants:
  - `as` IS A CLOSED SET WITH NO CORRECT DEFAULT, and the choice must be written at the call
    site rather than remembered. A `<label>` field WRAPS its control and gives it its accessible
    name; a `<div>` field does not, and the sites that need a `<div>` hold two controls, or
    none, or a control already named by something else, where a `<label>` would hand the caption
    to whichever labelable descendant came first. The decision is invisible in the rendered
    pixels and load-bearing in the announcement.
    `tests/components/field-source-contract.test.js` requires a literal `as` on every `<Field>`
    in `src/`, so the fallback is unreachable from the product.
  - THE FALLBACK IS `div`, NEVER `label`. A missing `as` that renders a `<div>` LOSES an implicit
    association: the control keeps whatever name it had and the field reads as unlabelled. A
    missing `as` that rendered a `<label>` would INVENT one — the wrapped control announced under
    text belonging to a different control, plus click-to-focus that moves focus somewhere
    unexpected, neither visible on screen. `div` is the box with no contract; `label` and
    `fieldset` both carry behaviour, so neither may be reached by omission.
  - `fieldset` IS A MEMBER OF THE SET, not an allowlisted exception. Its one caller,
    `components/RadioCardGroup.svelte`, renders a `<legend>` (valid only as a fieldset's first
    child), holds a radio group, and forwards `disabled` — which on a `<fieldset>` disables every
    descendant control and on a `<div>` does nothing at all.
  - THE FONT FLOOR IS NOT IN THIS FAMILY'S BLOCK, and its POSITION is the rule. The family root is
    not its control — the field is a column and the control is a bare `<input>`, `<select>` or
    `<textarea>` inside it — so the floor is written as `.fabricate-field :is(input, select,
    textarea)` at (0,1,1), grouped immediately below the area's own bare-element baseline. `font`
    is a shorthand that resets `line-height`, and at (0,1,1) the group TIES every later same-rank
    rule in the area, two of which restate a `font` longhand for controls these floors reach.
    Declared thousands of lines further down in this family's own block it would win both and
    silently re-type every manager textarea and select.
  - THE FLOOR GROUP CARRIES `font: inherit` AND NOTHING ELSE, because at a tie a declaration the
    baseline does not also carry is a real move inside the manager. `appearance` and `min-height`
    are the two this family would like and cannot have at that rank, so Field's element-typed
    chrome is a SECOND rule in the family's own block that restates the baseline's element
    predicate leg for leg and carries only those. Widening the floor instead would take the
    radios inside a `<Field as="fieldset">` from 16px to 34, a range input from 28 to 34 and a
    `.fab-stepper-input` from 22 to 34.
  - THE FOCUS PAIR EXCLUDES `select`, DELIBERATELY. Both halves are declared over `input` and
    `textarea` only; a `select` leg would have been (0,2,1) and would have deleted the inset ring
    that exists because an outset outline on a select is clipped by an overflow-clipped
    container. A `<select>` in a Field keeps the area's ring and the area's `appearance`.
  - MOVING A CLASS ONTO THIS COMPONENT CAN KILL A SCOPED RULE, usually SILENTLY — the trap
    `ManagerButton.svelte` states in full, and it bit three callers here. The repair is
    `:global(.manager-field.the-other-class)`, CHAINED so the compound keeps the specificity the
    scoped form had. `tests/components/manager-button-scoped-class-reach.test.js` is the
    mechanical guard; its `PRIMITIVES` registry carries the `Field` row.
  - No scoped `<style>`: the global sheet owns `.manager-field` and its descendant rules, and a
    scoped block here would be a second source of truth for the same box.
-->
<script>
  let { as = undefined, class: extraClass = '', children = undefined, ...rest } = $props();

  // Declared outside the component instance so `field-source-contract.test.js` can read the
  // literal, and a `Set` so a fourth member cannot make the membership test a linear scan.
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
