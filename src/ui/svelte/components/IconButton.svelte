<!--
  THE manager's icon-only push-button: a `<button type="button">` whose only content is a glyph. An
  import-free leaf taking already-localized strings.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `ariaLabel` | pre-localized string | `''` | REQUIRED; see the invariants. Dropped when empty rather than emitted blank. |
  | `disabled` | boolean | `false` | Forwarded to the `<button>`. |
  | `onclick` | function | no-op | Forwarded verbatim, so a call site keeps its `event.stopPropagation()`. |
  | `children` | snippet | `undefined` | The glyph, an `<i class="fas fa-…" aria-hidden="true">`. A snippet rather than an `icon` string, because the sites interleave Font Awesome class sets this component has no vocabulary for. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `element` | bindable | `null` | The rendered `<button>`, which `ActionMenu` measures its portaled panel against and returns focus to. |

  Rest spread:
  - `{...rest}` lands on the `<button>`, carrying `data-*` hooks, `aria-haspopup`, `aria-expanded`,
    `title`, `data-tooltip` and `onkeydown`.
  - `class` is a named prop and `data-keyboard-focus="true"` is written on the same side of the
    spread as it, both per `openspec/specs/design-system/spec.md`, which also states how a bare
    `data-*` on a component tag is spelled — 17 of the converted attributes are spelled `=""`.

  Invariants:
  - THE ACCESSIBLE NAME IS A REQUIRED PROP. An icon button that loses its `aria-label` announces as
    "button" and is identical on screen, so no frame, computed-style probe or `data-*` assertion can
    see the defect; `tests/icon-button-source-contract.test.js` is the gate. It is emitted only when
    non-empty, because `aria-label=""` suppresses the fallback rather than falling back.
  - THERE IS NO `as` PROP AND NO `role` PROP. Every one of the 82 sites is the same host, and this
    control's modifiers mix roles with STATES, so a closed vocabulary over both is a design decision
    rather than a mechanical extraction. Every modifier is a pass-through on `class`.
  - CLASS ORDER IS THE ROOT, THE CONTRACT CLASS, THEN THE CALLER'S EXTRA, and the array is where
    `manager-layout.test.js`'s class reader looks; `icon-button-source-contract.test.js` pins this
    file's occurrences of the contract class at exactly 1. No scoped `<style>`: the family is rooted
    at `fabricate-icon-button` in `styles/fabricate.css`.
-->
<script>
  let {
    ariaLabel = '',
    disabled = false,
    onclick = () => {},
    children = undefined,
    class: extraClass = '',
    size = 'default',
    element = $bindable(null),
    ...rest
  } = $props();

  const classes = $derived(
    ['fabricate-icon-button', 'manager-icon-button', size === 24 ? 'is-size-24' : '', extraClass]
      .filter(Boolean)
      .join(' ')
  );

  const accessibleName = $derived(ariaLabel || undefined);
</script>

<button
  bind:this={element}
  type="button"
  class={classes}
  data-keyboard-focus="true"
  aria-label={accessibleName}
  {disabled}
  {onclick}
  {...rest}>{@render children?.()}</button
>
