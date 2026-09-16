<!--
  THE manager's card shell — a `<section>` that renders its caller's children and nothing else. An
  import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | The card's contents. |

  Rest spread:
  - `{...rest}` lands on the `<section>`, written after `class={…}`; `class` is a named prop, and a
    bare `data-*` on a component tag is spelled `=""`, both per
    `openspec/specs/design-system/spec.md`.

  Invariants:
  - It declares no font floor and no focus pair, because it owns no control of its own. Pinned by
    `tests/components/re-rooted-controls-host-independence.test.js`.
  - No `as` prop, no `variant` prop and no scoped `<style>`. All 80 converted sites are a
    `<section>`, and the three painted treatments are keyed on two different anchors — the card's
    own modifier class and the Checks rail ANCESTOR — so a closed variant set spanning both stays an
    open design ruling.
-->
<script>
  let { children = undefined, class: extraClass = '', ...rest } = $props();

  const classes = $derived(
    ['fabricate-card', 'manager-inspector-card', extraClass].filter(Boolean).join(' ')
  );
</script>

<section class={classes} {...rest}>{@render children?.()}</section>
