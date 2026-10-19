<!--
  The card shell (`<Card>`, `library.html`) — a `<section>` that renders its caller's children and
  nothing else. The module sheet draws its box: radius 11, `--fab-space-4` padding, a 1px
  `--fab-border` edge on `--fab-bg-2`. An import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `flush` | boolean | `false` | Emits `is-flush`, padding 0, for a card whose head and body inset themselves. Unpublished. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | The card's contents. |

  Rest spread:
  - `{...rest}` lands on the `<section>`, written after `class={…}`; `class` is a named prop, and a
    bare `data-*` on a component tag is spelled `=""`, both per
    `openspec/specs/design-system/spec.md`.

  Invariants:
  - It declares no font floor and no focus pair, because it owns no control of its own. Pinned by
    `tests/components/re-rooted-controls-host-independence.test.js`.
  - No `as` prop and no scoped `<style>`. A caller rule places a card and never restates its box,
    and a card never contains a card. Pinned by `tests/components/card-drawing-parity.test.js`.
-->
<script>
  let { flush = false, children = undefined, class: extraClass = '', ...rest } = $props();

  const classes = $derived(['fabricate-card', extraClass].filter(Boolean).join(' '));
</script>

<section class={classes} class:is-flush={flush} {...rest}>{@render children?.()}</section>
