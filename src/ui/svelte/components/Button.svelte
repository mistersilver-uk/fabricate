<!--
  THE manager's labelled push-button. The role is a required-shaped PROP rather than the remembered
  hand-written class string plus modifier this replaced, because a forgotten modifier is invisible to
  lint, to `format:check` and to every source-contract test, and visible only on the screen.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `role` | `'neutral'` \| `'primary'` \| `'ghost'` \| `'danger'` \| `'dashed'` \| `'warning'` \| `'info'` \| `'accent'` \| `'urgent'` | `'neutral'` | A CLOSED set; see the invariants for how a caller picks. An unrecognised value renders neutral. |
  | `tag` | `'button'` \| `'a'` | `'button'` | An unrecognised value, and `tag="a"` with an empty `href`, render a `<button>`. |
  | `href` / `target` / `rel` | anchor attributes | `''` / `undefined` / `undefined` | Emitted only when an anchor is rendered. An explicit `rel` always wins; unset with `target="_blank"` it defaults to `noreferrer`. |
  | `type` / `disabled` | `'button'` \| `'submit'` \| `'reset'` / boolean | `'button'` / `false` | Both emitted only on a `<button>`, so a manager button inside a form-adjacent card never submits by accident and `disabled` is ignored and warned about on an anchor. A closed set: an unrecognised `type` renders `'button'`, because the browser reads one as `'submit'`. |
  | `fullWidth` / `size` | boolean / `''` \| `'24'` \| `'26'` \| `'28'` \| `'38'` | `false` / `''` | `is-full-width`, which is not a role because width states something about the CONTAINER rather than about the verb; and the control-height rung, named as a string, where an unrecognised value resolves to `''` rather than an unstyled `is-size-*`. |
  | `icon` | Font Awesome class string | `''` | The leading glyph, drawn as a hidden `<i>` before `children`; empty draws none. `children` stays the required label, because the icon-only form is `IconButton`. |
  | `busy` | boolean | `false` | An action in flight: writes `aria-busy` and `aria-disabled`, never `disabled`, so focus and arm state survive, and swallows the press. `disabled` beside it still renders disabled. |
  | `pressed` | `true` \| `false` \| absent | `undefined` | A toggle's state: writes `aria-pressed`, and `true` the `is-pressed` face; any other value writes neither (issue 2852). |
  | `ariaLabel` / `tooltip` | pre-localized strings | `''` / `''` | The name that replaces the label, which the published seam holds to containing it, and hint text written as `data-tooltip-text` and opened on keyboard focus as `IconButton`'s is; a blank string writes neither. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `element` / `children` | bindable / snippet | `null` / `undefined` | The rendered DOM node, since `bind:this` on a component yields the INSTANCE and a caller that must measure or focus the button has no other way to reach it; and the label, a snippet rather than a string because call sites wrap the label in their own spans. |

  Callbacks:
  - `onclick` — forwarded to the rendered element.
  - `onfocus`, `onblur`, `onkeydown` — a caller's handlers, each run before the tooltip's own.

  Rest spread:
  - `{...rest}` lands on the element, carrying `data-*` hooks, `aria-*`, `title` and `data-tooltip`;
    `class` is a named prop merged by hand, and `data-keyboard-focus="true"` is written on the same
    side of the spreads as `class={classes}`. `openspec/specs/design-system/spec.md` states both
    rules, and how a bare `data-*` on a component tag is spelled.
  - `title`, `data-tooltip`, `data-tooltip-html`, `data-tooltip-text` and `data-locked` are a
    caller's own, written back beside the spread; any of them suppresses `tooltip`.

  Invariants:
  - `manager-layout.test.js` READS `ROLE_CLASSES` and the `classes` array literal out of this file
    to build its browser probes, so the mapping stays a named object outside the array and the
    array's one literal stays the unconditional root; an inline conditional there puts its
    tokens into every probe and the gate goes green while measuring markup nothing emits.
  - THE ROLE SET IS CLOSED and a caller routes by MEANING: `danger` is the DESTRUCTIVE verb, which
    removes a record or breaks a reference together with data re-making it would not restore;
    `warning` the CAUTION verb, which destroys nothing and proceeds against a flagged rule or breaks
    a reference the GM can re-make exactly; `dashed` the ADD action at the foot of its list;
    `neutral` the empty modifier. `accent` (outlined) and `urgent` (solid) are the published seam's
    forward verb and the one verb that is due now (issue 2841), with no in-app caller. A control
    that both destroys and cautions is `danger`, and a per-site visual tweak is a pass-through on `class`.
  - THE ROLE-TO-CLASS RELATION IS A NAMED MAPPING, never an `is-${role}` template: the sheet's amber
    treatment is `.fabricate-button.is-warning-action` and `.fabricate-button.is-warning` is declared
    nowhere, so a guessed spelling ships with no treatment; and `scripts/lib/stylesheetLiveClasses.js`
    never widens an `is-` class through a positional wildcard, so a class only ever BUILT here would
    read as a rule with no customer.
  - `busy` ALONE IS A CONTRACT BREACH: the primitive draws no busy label, so the caller changes
    `children` while busy (the specimen's loading rule), or the control reads as idle but refuses;
    on a neutral button the busy and disabled faces differ only slightly, so the label carries it.
    The busy ARIA stands BEFORE the rest spread: the published gate reads `rest` only through
    its spread, and a caller's own `aria-disabled` must survive while idle; so do not pass
    `aria-busy` or `aria-disabled` beside `busy`.
  - `size` IS A STRING NAMING A RUNG, not a boolean and not a number: a boolean could express only
    one of the four non-default rungs (`'24'`, `'26'`, `'28'` and `'38'`), and a number invites
    `size={37}`.
  - `tag="a"` WITH AN EMPTY `href` RENDERS A `<button>`, because an anchor with no `href` is not
    focusable, has no implicit link role and does not activate on Enter; several anchor call sites
    take their `href` from caller data, so the empty case is reachable.
  - No scoped `<style>`: the anchor's `text-decoration: none` and the `is-full-width` rule live in
    `styles/fabricate.css` even though this component emits their classes.
-->
<script>
  import { getContext, onDestroy } from 'svelte';

  let {
    role = 'neutral',
    tag = 'button',
    href = '',
    target = undefined,
    rel = undefined,
    type = 'button',
    fullWidth = false,
    size = '',
    icon = '',
    busy = false,
    pressed = undefined,
    ariaLabel = '',
    tooltip = '',
    disabled = false,
    onclick = () => {},
    onfocus = undefined,
    onblur = undefined,
    onkeydown = undefined,
    title = undefined,
    'data-tooltip': dataTooltip = undefined,
    'data-tooltip-html': dataTooltipHtml = undefined,
    'data-tooltip-text': dataTooltipText = undefined,
    'data-locked': dataLocked = undefined,
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
    info: 'is-info-action',
    accent: 'is-accent-action',
    urgent: 'is-urgent-action',
  };

  const FULL_WIDTH_CLASS = 'is-full-width';

  const PRESSED_CLASS = 'is-pressed';

  // The `APP_TOOLTIPS` facade, by its registry key (`util/appLocalizer.js`).
  const tooltips = getContext(Symbol.for('fabricate.appTooltips'));

  const SIZE_CLASSES = {
    24: 'is-size-24',
    26: 'is-size-26',
    28: 'is-size-28',
    38: 'is-size-38',
  };

  const TAGS = new Set(['button', 'a']);

  const TYPES = new Set(['button', 'submit', 'reset']);

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
      roleClass,
      fullWidth ? FULL_WIDTH_CLASS : '',
      sizeClass,
      pressed === true ? PRESSED_CLASS : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );

  const isText = (value) => typeof value === 'string' && value.trim() !== '';

  const pressedState = $derived(
    pressed === true || pressed === false ? String(pressed) : undefined
  );

  // A caller's own tooltip, or a `data-locked` Foundry pins a tooltip copy on, drops the hint.
  const tooltipText = $derived(
    isText(tooltip) &&
      [title, dataTooltip, dataTooltipHtml, dataTooltipText, dataLocked].every(
        (value) => value == null
      )
      ? tooltip
      : ''
  );

  // The text the focus tooltip opened with, until it closes; no markup reads it.
  let shownText = null;

  function dismissTooltip() {
    if (tooltipText || shownText !== null) tooltips?.hide(element);
    shownText = null;
  }

  function showOnKeyboardFocus(event) {
    onfocus?.(event);
    if (!tooltipText || !event.currentTarget.matches(':focus-visible')) return;
    shownText = tooltipText;
    tooltips?.show(event.currentTarget, tooltipText);
  }

  function press(event) {
    dismissTooltip();
    if (busy) event.preventDefault();
    else onclick(event);
  }

  // Both are read before any test short-circuits, so a change to either re-runs it.
  $effect(() => {
    const [text, off] = [tooltipText, disabled];
    if (shownText !== null && (text !== shownText || off)) dismissTooltip();
  });

  onDestroy(dismissTooltip);

  const resolvedRel = $derived(rel ?? (target === '_blank' ? 'noreferrer' : undefined));

  const attributes = $derived(
    resolvedTag === 'a'
      ? { href, target, rel: resolvedRel }
      : { type: TYPES.has(type) ? type : 'button', disabled }
  );

  $effect(() => {
    if (resolvedTag === 'a' && disabled) {
      console.warn(
        'Fabricate | Button: `disabled` is not a valid attribute on an anchor and was ignored. ' +
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
  onclick={press}
  aria-busy={busy ? 'true' : undefined}
  aria-disabled={busy ? 'true' : undefined}
  aria-pressed={pressedState}
  aria-label={isText(ariaLabel) ? ariaLabel : undefined}
  {title}
  data-tooltip={dataTooltip}
  data-tooltip-html={dataTooltipHtml}
  data-tooltip-text={dataTooltipText ?? (tooltipText || undefined)}
  {...rest}
  data-locked={dataLocked}
  onfocus={showOnKeyboardFocus}
  onblur={(event) => {
    onblur?.(event);
    dismissTooltip();
  }}
  onkeydown={(event) => {
    onkeydown?.(event);
    if (event.key === 'Escape') dismissTooltip();
  }}
  >{#if icon}<i class={icon} aria-hidden="true"></i>{/if}{@render children?.()}</svelte:element
>
