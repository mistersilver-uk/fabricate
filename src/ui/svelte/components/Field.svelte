<!--
  THE manager's labelled form field — the `.fabricate-field` column that stacks a caption over its
  control.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `as` | `'label'` \| `'div'` \| `'fieldset'` | none | REQUIRED-SHAPED; see the invariants. An unrecognised or missing value renders a `<div>` and `console.warn`s. |
  | `size` | `26` \| `28` \| `30` \| `34` \| `38` | `38` | The text-like control's height, a control-height rung at its radius band, as a number or its string (`'30'`); any other value draws `38` (issue 2848). |
  | `face` | `'sans'` \| `'serif'` \| `'mono'` | `'sans'` | The control's family: `sans` inherits, `serif` and `mono` are the type ladder's faces; any other value draws `sans`. |
  | `type` | `'text'` \| `'number'` | `'text'` | `number` draws a caller's `<input type="number">` with no step buttons; any other value draws `text`. |
  | `invalid` | boolean | `false` | Only `true` draws the danger edge and fill, and only on a control that also carries the caller's `aria-invalid="true"`. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | Conventionally a `<span>` caption followed by the control. The sheet draws a first-child `<span>` as the kicker, below a caller's caption class, and the box carries the value type its control inherits (issue 2532). |

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
  - Its `font: inherit` floor is written at `.fabricate-field :is(input, textarea)`, its
    element-typed chrome is a second rule, and it writes no scoped `<style>` — all three for the
    reasons the class-family requirement states; a select inside it is `Select`, which types its
    own trigger. Widening the floor would re-type the radios, ranges and steppers it excludes.
-->
<script>
  let {
    as = undefined,
    size = 38,
    face = 'sans',
    type = 'text',
    invalid = false,
    class: extraClass = '',
    children = undefined,
    ...rest
  } = $props();

  const HOSTS = new Set(['label', 'div', 'fieldset']);

  const FALLBACK_HOST = 'div';

  // Keyed by the rung's string, so `30` and `'30'` both draw it; `38` writes no class.
  const SIZE_CLASSES = Object.freeze({
    26: 'is-size-26',
    28: 'is-size-28',
    30: 'is-size-30',
    34: 'is-size-34',
  });
  const FACE_CLASSES = Object.freeze({ serif: 'is-face-serif', mono: 'is-face-mono' });

  const RUNG_TYPES = Object.freeze(['number', 'string']);
  const FACE_TYPES = Object.freeze(['string']);

  const classOf = (table, value, ofTypes) =>
    ofTypes.includes(typeof value) && Object.hasOwn(table, String(value)) ? table[value] : '';

  const host = $derived(HOSTS.has(as) ? as : FALLBACK_HOST);
  const classes = $derived(
    [
      'fabricate-field',
      classOf(SIZE_CLASSES, size, RUNG_TYPES),
      classOf(FACE_CLASSES, face, FACE_TYPES),
      type === 'number' ? 'is-type-number' : '',
      invalid === true ? 'is-invalid' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
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
