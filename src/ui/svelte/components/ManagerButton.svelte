<!--
  THE manager's labelled push-button. The role is a required-shaped PROP rather than the remembered
  `class="manager-button"` plus modifier this replaced, because a forgotten modifier is invisible to
  lint, to `format:check` and to every source-contract test, and visible only on the screen.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `role` | `'neutral'` \| `'primary'` \| `'ghost'` \| `'danger'` \| `'dashed'` \| `'warning'` | `'neutral'` | A CLOSED set; see the invariants for how a caller picks. An unrecognised value renders neutral. |
  | `tag` | `'button'` \| `'a'` | `'button'` | An unrecognised value, and `tag="a"` with an empty `href`, render a `<button>`. |
  | `href` / `target` / `rel` | anchor attributes | `''` / `undefined` / `undefined` | Emitted only when an anchor is rendered. An explicit `rel` always wins; unset with `target="_blank"` it defaults to `noreferrer`. |
  | `type` / `disabled` | native button type / boolean | `'button'` / `false` | Both emitted only on a `<button>`, so a manager button inside a form-adjacent card never submits by accident and `disabled` is ignored and warned about on an anchor. |
  | `fullWidth` / `size` | boolean / `''` \| `'38'` | `false` / `''` | `is-full-width`, which is not a role because width states something about the CONTAINER rather than about the verb; and the control-height rung, named as a string, where an unrecognised value resolves to `''` rather than an unstyled `is-size-*`. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `element` / `children` | bindable / snippet | `null` / `undefined` | The rendered DOM node, since `bind:this` on a component yields the INSTANCE and a caller that must measure or focus the button has no other way to reach it; and the label, a snippet rather than a string because call sites interleave an `<i>` glyph with localized text. |

  Callbacks:
  - `onclick` — forwarded to the rendered element.

  Rest spread:
  - `{...rest}` lands on the element, carrying `data-*` hooks, `aria-*`, `title` and `data-tooltip`;
    `class` is a named prop merged by hand, and `data-keyboard-focus="true"` is written on the same
    side of the spreads as `class={classes}`. `openspec/specs/design-system/spec.md` states both
    rules, and how a bare `data-*` on a component tag is spelled.

  Invariants:
  - `manager-layout.test.js` READS `ROLE_CLASSES` and the `classes` array literal out of this file
    to build its browser probes, so the mapping stays a named object outside the array and the
    array's literals stay the three unconditional classes; an inline conditional there puts its
    tokens into every probe and the gate goes green while measuring markup nothing emits.
  - THE ROLE SET IS CLOSED and a caller routes by MEANING: `danger` is the DESTRUCTIVE verb,
    `warning` the OVERRIDE verb that proceeds against a flagged rule and destroys nothing, `dashed`
    the ADD action at the foot of its list, `neutral` the empty modifier. A control that does both
    of the first two is `danger`, and a per-site visual tweak is a pass-through on `class`.
  - THE ROLE-TO-CLASS RELATION IS A NAMED MAPPING, never an `is-${role}` template: the sheet's amber
    treatment is `.manager-button.is-warning-action` and `.manager-button.is-warning` is declared
    nowhere, so a guessed spelling ships with no treatment; and `scripts/lib/stylesheetLiveClasses.js`
    never widens an `is-` class through a positional wildcard, so a class only ever BUILT here would
    read as a rule with no customer.
  - `size` IS A STRING NAMING A RUNG, not a boolean and not a number: a boolean could express only
    the second of the six published rungs, and a number invites `size={37}`.
  - `tag="a"` WITH AN EMPTY `href` RENDERS A `<button>`, because an anchor with no `href` is not
    focusable, has no implicit link role and does not activate on Enter; several anchor call sites
    take their `href` from caller data, so the empty case is reachable.
  - No scoped `<style>`: the anchor's `text-decoration: none` and the `is-full-width` rule live in
    `styles/fabricate.css` even though this component emits their classes.
-->
<script>
  let {
    role = 'neutral',
    tag = 'button',
    href = '',
    target = undefined,
    rel = undefined,
    type = 'button',
    fullWidth = false,
    size = '',
    disabled = false,
    onclick = () => {},
    element = $bindable(null),
    children = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const ROLE_CLASSES = {
    primary: 'is-primary',
    ghost: 'is-ghost',
    danger: 'is-danger',
    dashed: 'is-dashed',
    warning: 'is-warning-action',
  };

  const FULL_WIDTH_CLASS = 'is-full-width';

  const SIZE_CLASSES = { 38: 'is-size-38' };

  const TAGS = new Set(['button', 'a']);

  const resolvedTag = $derived(
    TAGS.has(tag) && !(tag === 'a' && !String(href ?? '').trim()) ? tag : 'button'
  );

  const roleClass = $derived(Object.hasOwn(ROLE_CLASSES, role) ? ROLE_CLASSES[role] : '');

  const sizeClass = $derived(
    Object.hasOwn(SIZE_CLASSES, String(size ?? '')) ? SIZE_CLASSES[String(size)] : ''
  );

  const classes = $derived(
    [
      'fabricate-button',
      'manager-button',
      'fab-manager-button',
      roleClass,
      fullWidth ? FULL_WIDTH_CLASS : '',
      sizeClass,
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );

  const resolvedRel = $derived(rel ?? (target === '_blank' ? 'noreferrer' : undefined));

  const attributes = $derived(
    resolvedTag === 'a' ? { href, target, rel: resolvedRel } : { type, disabled }
  );

  $effect(() => {
    if (resolvedTag === 'a' && disabled) {
      console.warn(
        'Fabricate | ManagerButton: `disabled` is not a valid attribute on an anchor and was ignored. ' +
          'Render a <button> (drop `tag="a"`, or leave `href` empty) if the control needs a disabled state.'
      );
    }
  });
</script>

<svelte:element
  this={resolvedTag}
  bind:this={element}
  class={classes}
  data-keyboard-focus="true"
  {...attributes}
  {onclick}
  {...rest}>{@render children?.()}</svelte:element
>
