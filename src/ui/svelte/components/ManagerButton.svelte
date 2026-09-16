<!--
  THE manager's labelled push-button.

  Before this component the manager's button was a CSS convention: write
  `class="manager-button"`, then remember to add `is-primary`, `is-ghost` or `is-danger`. A
  forgotten modifier class is invisible to lint, to `format:check` and to every source-contract
  test; it is visible only to someone looking at the screen. Making the role a REQUIRED-SHAPED
  PROP is the fix — a call site either passes `role="danger"` or is visibly neutral in the source.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `role` | `'neutral'` \| `'primary'` \| `'ghost'` \| `'danger'` \| `'dashed'` \| `'warning'` | `'neutral'` | A CLOSED set; see the invariants for how a caller picks. An unrecognised value renders neutral. |
  | `tag` | `'button'` \| `'a'` | `'button'` | An unrecognised value, and `tag="a"` with an empty `href`, render a `<button>`. |
  | `href` / `target` / `rel` | anchor attributes | `''` / `undefined` / `undefined` | Emitted only when an anchor is actually rendered. An explicit `rel` always wins; unset with `target="_blank"` it defaults to `noreferrer`. |
  | `type` | native button type | `'button'` | A manager button inside a `<form>`-adjacent card must never submit by accident. Emitted only on a `<button>`. |
  | `fullWidth` | boolean | `false` | Emits `is-full-width`. Deliberately NOT a role: width is a statement about the CONTAINER, not about the verb. |
  | `size` | `''` \| `'38'` | `''` | The control-height RUNG, as a string naming the rung. `''` is the shipped 34px button. An unrecognised value resolves to `''`, never to an unstyled `is-size-*`. |
  | `disabled` | boolean | `false` | Not valid on an anchor, so it is ignored and warned about when one is rendered. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `element` | bindable | `null` | The rendered DOM node. `bind:this` on a component yields the INSTANCE, so a caller that must MEASURE or FOCUS the button has no other way to reach it. |
  | `children` | snippet | `undefined` | The label. A snippet rather than a string because call sites interleave an `<i>` glyph with localized text. |

  Callbacks:
  - `onclick` — forwarded to the rendered element.

  Rest spread:
  - `{...rest}` lands on the element, so a call site keeps its own `data-*` hooks, `aria-*`,
    `title` and `data-tooltip`.
  - `class` is the one exception: it is a named prop and merged by hand, because the spread lands
    after `class={classes}` and a `class` arriving through it would REPLACE the primitive's whole
    class string rather than add to it.
  - `data-keyboard-focus="true"` is written on the SAME SIDE of the spreads as `class={classes}`
    — before `{...attributes}`, `{onclick}` and `{...rest}` — and that placement is PRESCRIBED: a
    spread landing later wins, so a caller's `data-*` bag could unset it by accident. Foundry's
    `KeyboardManager#hasFocus` reads `dataset.keyboardFocus` on the focused element only, with no
    inheritance, so while this button holds focus Foundry's own Space/arrow/Tab bindings stop
    firing — the intended behaviour change, not a side effect.

  Invariants:
  - `manager-layout.test.js` READS `ROLE_CLASSES` and the `classes` array literal out of this
    file to build its browser probes, so keep the mapping a named object declared OUTSIDE the
    array and keep the array's own string literals to the three unconditional classes. This is a
    FALSE-PASS rule: an inline conditional there puts its tokens into every probe, and the gate
    goes green while measuring markup this component never emits.
  - THE ROLE SET IS CLOSED and a caller routes by MEANING, never by matching a role name to a
    token name. `danger` is the DESTRUCTIVE verb — it removes or unlinks a record — while
    `warning` is the OVERRIDE verb — it proceeds against a rule the system has already flagged,
    and destroys nothing. A control that does both is `danger`. `dashed` is the ADD action at the
    foot of a list it appends to. `neutral` is the EMPTY MODIFIER, which is why it has no entry
    in the mapping. A per-site visual tweak is a pass-through on `class`, never a seventh role.
  - THE ROLE-TO-CLASS RELATION IS A NAMED MAPPING, never an `is-${role}` template, and `warning`
    is the proof: the sheet's amber treatment is `.manager-button.is-warning-action` and
    `.manager-button.is-warning` is declared NOWHERE, so a site that guessed the obvious spelling
    shipped with no treatment at all while the amber treatment shipped with no call site. The
    class each role emits is an implementation detail of the sheet that the vocabulary must not
    be forced to mirror. `SIZE_CLASSES` is a named mapping for that reason and a fourth:
    `scripts/lib/stylesheetLiveClasses.js` never widens an `is-` class through a positional
    wildcard, so a class this component only ever BUILT would look like a rule with no customer.
  - `size` IS A STRING NAMING A RUNG, not a boolean and not a number: a boolean could only ever
    express the second of the six published control-height rungs, and a number invites
    `size={38}` and `size={37}` alike with only the sheet to say which exists.
    `ManagerSearchField`'s `size` is the same shape and emits the same token.
  - `tag="a"` WITH AN EMPTY `href` RENDERS A `<button>`. An anchor with no `href` is not
    focusable, has no implicit link role and does not activate on Enter; several anchor call
    sites take their `href` from caller data, so the empty case is reachable in the product.
  - No scoped `<style>`. A scoped block would be a second source of truth for the same control
    and would begin to disagree with the global sheet — the exact failure this component exists
    to end — which is why the anchor's `text-decoration: none` and the `is-full-width` rule live
    in `styles/fabricate.css` even though this component emits their classes.
  - MOVING A CLASS ONTO THIS COMPONENT CAN KILL A SCOPED RULE. This is the canonical account the
    other primitives point at. Svelte stamps a rule's `svelte-<hash>` onto the elements the
    component ITSELF writes, and a `class` prop handed to a child is forwarded verbatim, so a
    caller's scoped rule matches nothing the instant that class moves onto a component tag. It
    fails two ways and neither names the cause: EMITTED with the hash appended and silently
    matching nothing, or PRUNED behind a bare `css_unused_selector` warning. Measured on Svelte
    5.56.3, which you get is a property of the WHOLE caller rather than of the class you moved —
    it is emitted-and-silent whenever that file also holds a regular element carrying a spread or
    an expression-valued `class`, which is common, so assume the silent mode and grep the
    caller's own style block rather than trusting `lint:svelte:warnings`. The repair is
    `:global(…)`, RE-CHAINED with the ancestor and both primitive classes so its specificity is
    unchanged — a bare `:global(.the-other-class)` smuggles a cascade change in as a repair — or
    hoisted into `styles/fabricate.css` when more than one component needs the rule. A DESCENDANT
    selector must be wrapped WHOLE: `:global(ancestor) .child` leaves `.child` as the only scoped
    compound, so the hash is emitted bare and the rule silently gains a level of specificity.
    `tests/components/manager-button-scoped-class-reach.test.js` is the mechanical guard; this
    shipped twice before that guard existed.
  - `ArmedDangerButton` IS INDEPENDENT, not composed. It renders the same CSS contract, but its
    danger role is a fixed invariant of its arm/confirm machine rather than a caller's choice, so
    routing it through this primitive would buy one shared class string in exchange for a
    keydown/blur contract no other call site wants.
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
    // `null` until mount; unbound callers never observe it.
    element = $bindable(null),
    children = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  // A NAMED MAPPING, declared outside the `classes` array: see the header's first two
  // invariants, which are what keep `manager-layout.test.js`'s probes honest.
  const ROLE_CLASSES = {
    primary: 'is-primary',
    ghost: 'is-ghost',
    danger: 'is-danger',
    dashed: 'is-dashed',
    warning: 'is-warning-action',
  };

  // Hoisted out of the `classes` array for the same reason `ROLE_CLASSES` is.
  const FULL_WIDTH_CLASS = 'is-full-width';

  // The rungs this button can be asked for, and the class each one emits. Keys are strings
  // because a rung is a NAME and not an arithmetic quantity.
  const SIZE_CLASSES = { 38: 'is-size-38' };

  const TAGS = new Set(['button', 'a']);

  const resolvedTag = $derived(
    TAGS.has(tag) && !(tag === 'a' && !String(href ?? '').trim()) ? tag : 'button'
  );

  // `Object.hasOwn`, not a plain index: an index reads INHERITED members too, so the
  // unrecognised-value contract would hold only for values that are not names on
  // `Object.prototype`.
  const roleClass = $derived(Object.hasOwn(ROLE_CLASSES, role) ? ROLE_CLASSES[role] : '');

  // `Object.hasOwn` again, for the identical reason.
  const sizeClass = $derived(
    Object.hasOwn(SIZE_CLASSES, String(size ?? '')) ? SIZE_CLASSES[String(size)] : ''
  );

  // Family root first, then the primitive's own modifiers, then the rung, then the caller's
  // extra — the order `ManagerSearchField` documents for the same token.
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

  // A primitive that owns the anchor shape owns its safety default too. An explicit `rel`
  // still wins — `noopener noreferrer` is a legitimate thing for a caller to want.
  const resolvedRel = $derived(rel ?? (target === '_blank' ? 'noreferrer' : undefined));

  // Built conditionally rather than let through the rest spread, because the two element
  // shapes have DISJOINT attribute sets: `type` and `disabled` are invalid on an anchor,
  // and `href`, `target` and `rel` are invalid on a button.
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
