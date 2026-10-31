<!--
  The card shell (`<Card>`, `library.html`) — a `<section>` that renders its caller's children,
  under an optional head. The module sheet draws its box: radius 11, `--fab-space-4` padding, a 1px
  `--fab-border` edge on `--fab-bg-2`. An import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `flush` | boolean | `false` | Emits `is-flush`, padding 0, for a card whose head and body inset themselves. Unpublished. |
  | `tone` | `''` \| `'warning'` \| `'success'` \| `'accent'` \| `'info'` | `''` | Emits `is-tone-<tone>`: the family's `-border` edge on its `-soft` fill, and a second, inset edge under forced colours. Anything else draws no tone. No in-app caller passes it (issue 2854). |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |

  Snippets:
  - `title` — the head's level-3 heading; the head is drawn only when it is given.
  - `note` / `leading` / `trailing` — the muted line under the title, the element before the
    heading and the controls after it, each drawn only inside a head.
  - `children` — the card's contents, after the head.

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
  let {
    flush = false,
    tone = '',
    title = undefined,
    note = undefined,
    leading = undefined,
    trailing = undefined,
    children = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const classes = $derived(['fabricate-card', extraClass].filter(Boolean).join(' '));
</script>

<section
  class={classes}
  class:is-flush={flush}
  class:is-tone-warning={tone === 'warning'}
  class:is-tone-success={tone === 'success'}
  class:is-tone-accent={tone === 'accent'}
  class:is-tone-info={tone === 'info'}
  {...rest}
>
  {#if title}
    <div class="fab-card-head">
      <div class="fab-card-identity">
        {#if leading}<span class="fab-card-leading">{@render leading()}</span>{/if}
        <div class="fab-card-heading">
          <h3 class="fab-card-title">{@render title()}</h3>
          {#if note}<p class="fab-card-note">{@render note()}</p>{/if}
        </div>
      </div>
      {#if trailing}<span class="fab-card-trailing">{@render trailing()}</span>{/if}
    </div>
  {/if}
  {@render children?.()}
</section>
