<!--
  THE manager's icon-only push-button: a `<button type="button">` whose only content is a glyph. An
  import-free leaf taking already-localized strings.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `ariaLabel` | pre-localized string | `''` | REQUIRED; see the invariants. Dropped when empty rather than emitted blank. |
  | `icon` | Font Awesome class string | `''` | The glyph, drawn as a hidden `<i>`; empty draws none. |
  | `role` | `'neutral'` \| `'primary'` \| `'ghost'` \| `'danger'` \| `'ghost-danger'` | `'neutral'` | A closed subset of `Button`'s verb roles plus the ghost-danger compound; an unrecognised value renders neutral. Never an ARIA role. |
  | `size` | `''` \| `'24'` \| `'26'` | `''` | The rung, named as a string as `Button`'s is: `''` is 34, `'26'` the banded Modal's close; an unrecognised value draws 34. |
  | `tooltip` | pre-localized string | `ariaLabel` | The plain-text name shown on hover and keyboard focus; `''` shows none. |
  | `disabled` | boolean | `false` | Forwarded to the `<button>`. |
  | `onclick` | function | no-op | Forwarded, so a call site keeps its `event.stopPropagation()`. |
  | `children` | snippet | `undefined` | Content after the glyph, for a caller whose label is not an icon. |
  | `class` | class string | `''` | An extra class — a state such as `is-locked`, never a role — appended to the primitive's own. |
  | `element` | bindable | `null` | The rendered `<button>`, which `ActionMenu` measures its panel against and returns focus to. |

  Rest spread:
  - `{...rest}` lands on the `<button>`, carrying `data-*` hooks, `aria-haspopup`, `aria-expanded`
    and handlers; a caller's `onfocus`, `onblur` and `onkeydown` run before the tooltip's own.
  - `class` and `data-keyboard-focus="true"` stand before the spread, per `design-system/spec.md`.

  Invariants:
  - The accessible name is a required prop, emitted only when non-empty, because `aria-label=""`
    suppresses the fallback; `tests/icon-button-source-contract.test.js` is the gate.
  - The name is written as `data-tooltip-text`, Foundry's plain-text path, so a record name never reaches the
    localize or HTML path. Keyboard focus activates `game.tooltip` only under `:focus-visible`, and
    blur, click and Escape deactivate it only while this button owns it. A caller's `title`,
    `data-tooltip`, `data-tooltip-html` or raw `data-tooltip-text` wins: the primitive writes no
    tooltip beside it and opens none on focus, so a hint belongs in `tooltip` instead.
  - Class order is the root, the rung, the role, then the caller's extra; the root is the array's
    only literal, which `re-rooted-controls-host-independence.test.js` reads. No scoped `<style>`.
-->
<script>
  let {
    ariaLabel = '',
    icon = '',
    role = 'neutral',
    size = '',
    tooltip = undefined,
    disabled = false,
    onclick = () => {},
    children = undefined,
    class: extraClass = '',
    element = $bindable(null),
    ...rest
  } = $props();

  const ROLE_CLASSES = {
    primary: 'is-primary',
    ghost: 'is-ghost',
    danger: 'is-danger',
    'ghost-danger': 'is-ghost is-danger',
  };

  const SIZE_CLASSES = { 24: 'is-size-24', 26: 'is-size-26' };

  const CALLER_TOOLTIPS = ['title', 'data-tooltip', 'data-tooltip-html', 'data-tooltip-text'];

  const roleClass = $derived(Object.hasOwn(ROLE_CLASSES, role) ? ROLE_CLASSES[role] : '');

  const sizeClass = $derived(
    Object.hasOwn(SIZE_CLASSES, String(size ?? '')) ? SIZE_CLASSES[String(size)] : ''
  );

  const classes = $derived(
    ['fabricate-icon-button', sizeClass, roleClass, extraClass].filter(Boolean).join(' ')
  );

  const accessibleName = $derived(ariaLabel || undefined);

  const callerTooltip = $derived(CALLER_TOOLTIPS.some((name) => rest[name] != null));

  const tooltipText = $derived(callerTooltip ? '' : (tooltip ?? ariaLabel));

  function dismissOwnTooltip() {
    const manager = globalThis.game?.tooltip;
    if (manager && manager.element === element) manager.deactivate();
  }

  function showOnKeyboardFocus(event) {
    rest.onfocus?.(event);
    if (!tooltipText || !event.currentTarget.matches(':focus-visible')) return;
    globalThis.game?.tooltip?.activate(event.currentTarget, { text: tooltipText });
  }

  function hideOnBlur(event) {
    rest.onblur?.(event);
    dismissOwnTooltip();
  }

  function hideOnEscape(event) {
    rest.onkeydown?.(event);
    if (event.key === 'Escape') dismissOwnTooltip();
  }

  function press(event) {
    dismissOwnTooltip();
    onclick(event);
  }
</script>

<button
  bind:this={element}
  type="button"
  class={classes}
  data-keyboard-focus="true"
  aria-label={accessibleName}
  data-tooltip-text={tooltipText || undefined}
  {disabled}
  {...rest}
  onclick={press}
  onfocus={showOnKeyboardFocus}
  onblur={hideOnBlur}
  onkeydown={hideOnEscape}
  >{#if icon}<i class={icon} aria-hidden="true"></i>{/if}{@render children?.()}</button
>
