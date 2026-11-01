<!--
  The disclosure card (`<Disclosure>` in the library, issue 2862): one heading holding one
  `aria-expanded` button, its head, over a body that stays in the DOM while hidden, so what it
  holds keeps its state. The module sheet draws it, rooted at `fabricate-disclosure`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `open` | boolean | `false` | Read for truthiness: shows the body and writes `aria-expanded="true"`. The caller owns it. |
  | `level` | `2` to `6` | `3` | The heading level around the button; any other value draws `3`. |
  | `disabled` | boolean | `false` | Read for truthiness: writes `aria-disabled="true"`, so a press asks for nothing while the button keeps its Tab stop and focus; the body keeps its state. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own. |

  Snippets:
  - `head` — the button's content, and so its accessible name, before the chevron; phrasing
    content holding nothing focusable.
  - `body` — the disclosed content, in the body element `aria-controls` names.

  Callbacks:
  - `onToggle(next)` — on each press of a button that is not `disabled`, with the state asked
    for, `!open`; the card draws no state of its own, so the caller passes the new `open`.

  Rest spread:
  - `{...rest}` lands on the root `<div>`, written after `class={…}`.

  Invariants:
  - A focusable element inside `head` throws to the nearest boundary, a published mount's fault,
    because a control inside a button is unreachable — pinned by
    `tests/components/published-disclosure-mounted.test.js`.
-->
<script>
  import { watchFocusable } from '../actions/watchFocusable.js';

  const HEADINGS = new Map([
    [2, 'h2'],
    [3, 'h3'],
    [4, 'h4'],
    [5, 'h5'],
    [6, 'h6'],
  ]);

  let {
    open = false,
    level = 3,
    disabled = false,
    onToggle = null,
    head = null,
    body = null,
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();
  const bodyId = `fabricate-disclosure-${uid}-body`;
  const expanded = $derived(Boolean(open));
  const tag = $derived(HEADINGS.get(level) ?? 'h3');
  const classes = $derived(['fabricate-disclosure', extraClass, { 'is-open': expanded }]);
  let refused = $state('');

  $effect(() => {
    if (!refused) return;
    throw new TypeError(
      `Fabricate | Disclosure: "head" must hold nothing focusable, and it holds a <${refused}>`
    );
  });

  function toggle() {
    if (!disabled) onToggle?.(!expanded);
  }
</script>

<div class={classes} {...rest}>
  <svelte:element this={tag} class="fabricate-disclosure-heading">
    <button
      type="button"
      class="fabricate-disclosure-head"
      aria-expanded={expanded ? 'true' : 'false'}
      aria-controls={bodyId}
      data-keyboard-focus="true"
      aria-disabled={disabled ? 'true' : undefined}
      onclick={toggle}
    >
      <span
        class="fabricate-disclosure-content"
        use:watchFocusable={(found) => (refused = found.localName)}>{@render head?.()}</span
      ><span class="fabricate-disclosure-chevron" aria-hidden="true"></span>
    </button>
  </svelte:element>
  <div class="fabricate-disclosure-body" id={bodyId} hidden={!expanded}>
    {@render body?.()}
  </div>
</div>
