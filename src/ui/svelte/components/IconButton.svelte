<!--
  THE manager's icon-only push-button: a `<button type="button">` whose only content is a glyph.
  Before it, that was a CSS convention plus a remembered `type` and a remembered `aria-label`,
  written out at 82 sites across 37 components. An IMPORT-FREE LEAF taking ALREADY-LOCALIZED
  strings: one util import inside a leaf propagates a required raw-module entry into every mount
  harness that compiles anything rendering it, and a missing entry HANGS that suite as
  `# cancelled` rather than failing it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `ariaLabel` | pre-localized string | `''` | REQUIRED; see the invariants. Dropped when empty rather than emitted blank. |
  | `disabled` | boolean | `false` | Forwarded to the `<button>`. |
  | `onclick` | function | no-op | Forwarded verbatim, so a call site keeps its `event.stopPropagation()`. |
  | `children` | snippet | `undefined` | The glyph, an `<i class="fas fa-…" aria-hidden="true">` at every site. A snippet rather than an `icon` string, because the sites interleave Font Awesome class sets this component has no vocabulary for. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. A named prop rather than a rest key, because the spread lands after `class={classes}` and would REPLACE the whole string — silently unstyling the control while every `data-*` selector kept resolving. Before writing a rule against it, read `ManagerButton.svelte`'s canonical scoped-class account, whose guard covers this primitive too. |
  | `element` | bindable | `null` | The rendered `<button>`. `ActionMenu` needs it for the element it MEASURES its portaled panel against and the element focus returns to; `Chip` carries the same prop for the same reason. |

  Rest spread:
  - `{...rest}` lands on the `<button>`, carrying `data-*` hooks, `aria-haspopup`,
    `aria-expanded`, `title`, `data-tooltip` and `onkeydown`.

  Invariants:
  - THE ACCESSIBLE NAME IS A REQUIRED PROP, which `design-system/spec.md` states as a rule. An icon
    button that loses its `aria-label` announces itself as "button" and is IDENTICAL on screen, so
    no frame, no computed-style probe and no assertion resolving it by its `data-*` hook can see
    the defect; `tests/icon-button-source-contract.test.js` is the gate. It is emitted only when
    non-empty, because `aria-label=""` names the control the empty string and suppresses the
    fallback a screen reader would derive.
  - THERE IS NO `as` PROP AND NO `role` PROP. Every one of the 82 sites is the same host, so an
    `as` set of one would be a seam for a variation the product does not contain. The role
    question is left STATED rather than answered: this control's modifiers mix roles with STATES,
    one site legitimately compounds two, and a vocabulary carrying both kinds is a design decision
    rather than a mechanical extraction. Every modifier travels as a pass-through on `class`.
  - NO SCOPED `<style>`, for the reason `ManagerButton.svelte`'s header states in full. The family
    is rooted at `fabricate-icon-button` — the class this component emits as the FIRST literal of
    `classes` — so the control paints wherever it renders. Six player-app components carry their
    own `:global()` rules for the pager's arrows; those are CORRECT, are what `:global` is for,
    and win unlayered at any specificity, which is why the re-root preserved their frames.
  - CLASS ORDER IS DELIBERATE: the root, the contract class, then the caller's extra. The last two
    are the order all 82 hand-rolled sites wrote, so the conversion was a no-op in the DOM; the
    root was then prepended, so the rendered `class` is no longer byte-identical to the
    pre-conversion one and an exact-`className` equality is the shape that reds on it.
  - `data-keyboard-focus="true"` IS WRITTEN ON THE SAME SIDE OF `{...rest}` AS `class={classes}`.
    Foundry's `KeyboardManager#hasFocus` reads it off the FOCUSED element with no inheritance, so
    it cannot live on an ancestor; and a spread landing after it wins, so a caller's `data-*` bag
    could unset it — any site that means to must say so deliberately.
  - A BARE `data-*` ATTRIBUTE ON A COMPONENT TAG IS THE BOOLEAN `true`, not the empty string it is
    on an element, so 17 of the converted attributes are spelled `data-…=""` at their call sites.
    Presence selectors resolve either way, which is why the suites using them cannot catch it.
-->
<script>
  let {
    ariaLabel = '',
    disabled = false,
    onclick = () => {},
    children = undefined,
    class: extraClass = '',
    element = $bindable(null),
    ...rest
  } = $props();

  // The ROOT class leads, and every token is an unconditional literal in this array rather than
  // inline in the markup, because the array is what `manager-layout.test.js`'s class reader
  // parses to build its probes. `icon-button-source-contract.test.js` pins this file's
  // occurrences of the contract class at exactly 1 — the one place that writes it.
  const classes = $derived(
    ['fabricate-icon-button', 'manager-icon-button', extraClass].filter(Boolean).join(' ')
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
