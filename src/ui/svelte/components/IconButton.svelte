<!--
  THE manager's icon-only push-button: a `<button type="button">` whose only content is a glyph. A
  leaf taking already-localized strings; its one local import is the tooltip context's key.

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
  | `title`, `data-tooltip`, `data-tooltip-html`, `data-tooltip-text` | string | `undefined` | A caller's own tooltip, written back onto the `<button>`; see the invariants. |
  | `onfocus`, `onblur`, `onkeydown` | function | `undefined` | A caller's handlers, each run before the tooltip's own. |

  Rest spread:
  - `{...rest}` lands on the `<button>`, carrying `data-*` hooks, `aria-haspopup`, `aria-expanded`
    and handlers.
  - `class` and `data-keyboard-focus="true"` stand before the spread, per `design-system/spec.md`.

  Invariants:
  - The accessible name is a required prop, emitted only when non-empty, because `aria-label=""`
    suppresses the fallback; `tests/icon-button-source-contract.test.js` is the gate.
  - The name is always written as `data-tooltip-text`, Foundry's plain-text path, so a record name
    never reaches the localize or HTML path and core's own hover listener shows it. Keyboard focus
    opens it through the `APP_TOOLTIPS` facade only under `:focus-visible`, and blur, click and
    Escape close it only while this button owns it; with no facade, focus opens none. An update
    that changes the text or disables the button, and unmounting it, close its own tooltip.
  - A caller's `title`, `data-tooltip`, `data-tooltip-html` or raw `data-tooltip-text` wins: the
    primitive writes no tooltip beside it and opens none on focus, so a hint belongs in `tooltip`.
  - Class order is the root, the rung, the role, then the caller's extra; the root is the array's
    only literal, which `re-rooted-controls-host-independence.test.js` reads. No scoped `<style>`.
-->
<script>
  import { getContext, onDestroy } from 'svelte';

  import { APP_TOOLTIPS } from '../util/appLocalizer.js';

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
    title = undefined,
    'data-tooltip': dataTooltip = undefined,
    'data-tooltip-html': dataTooltipHtml = undefined,
    'data-tooltip-text': dataTooltipText = undefined,
    onfocus = undefined,
    onblur = undefined,
    onkeydown = undefined,
    ...rest
  } = $props();

  const ROLE_CLASSES = {
    primary: 'is-primary',
    ghost: 'is-ghost',
    danger: 'is-danger',
    'ghost-danger': 'is-ghost is-danger',
  };

  const SIZE_CLASSES = { 24: 'is-size-24', 26: 'is-size-26' };

  const tooltips = getContext(APP_TOOLTIPS);

  const roleClass = $derived(Object.hasOwn(ROLE_CLASSES, role) ? ROLE_CLASSES[role] : '');

  const sizeClass = $derived(
    Object.hasOwn(SIZE_CLASSES, String(size ?? '')) ? SIZE_CLASSES[String(size)] : ''
  );

  const classes = $derived(
    ['fabricate-icon-button', sizeClass, roleClass, extraClass].filter(Boolean).join(' ')
  );

  const accessibleName = $derived(ariaLabel || undefined);

  const callerTooltip = $derived(
    [title, dataTooltip, dataTooltipHtml, dataTooltipText].some((value) => value != null)
  );

  const tooltipText = $derived(callerTooltip ? '' : (tooltip ?? ariaLabel));

  // The text the focus tooltip opened with, until it closes; no markup reads it.
  let shownText = null;

  function dismissOwnTooltip() {
    shownText = null;
    tooltips?.hide(element);
  }

  function showOnKeyboardFocus(event) {
    onfocus?.(event);
    if (!tooltipText || !event.currentTarget.matches(':focus-visible')) return;
    shownText = tooltipText;
    tooltips?.show(event.currentTarget, tooltipText);
  }

  function hideOnBlur(event) {
    onblur?.(event);
    dismissOwnTooltip();
  }

  function hideOnEscape(event) {
    onkeydown?.(event);
    if (event.key === 'Escape') dismissOwnTooltip();
  }

  function press(event) {
    dismissOwnTooltip();
    onclick(event);
  }

  // Both are read before any test short-circuits, so a change to either re-runs it.
  $effect(() => {
    const [text, off] = [tooltipText, disabled];
    if (shownText !== null && (text !== shownText || off)) dismissOwnTooltip();
  });

  onDestroy(dismissOwnTooltip);
</script>

<button
  bind:this={element}
  type="button"
  class={classes}
  data-keyboard-focus="true"
  aria-label={accessibleName}
  data-tooltip-text={dataTooltipText ?? (tooltipText || undefined)}
  {disabled}
  {title}
  data-tooltip={dataTooltip}
  data-tooltip-html={dataTooltipHtml}
  {...rest}
  onclick={press}
  onfocus={showOnKeyboardFocus}
  onblur={hideOnBlur}
  onkeydown={hideOnEscape}
  >{#if icon}<i class={icon} aria-hidden="true"></i>{/if}{@render children?.()}</button
>
