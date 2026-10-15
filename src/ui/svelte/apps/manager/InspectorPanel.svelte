<!--
  A manager inspector's filling root and its pinned foot: the selected record's content, then its
  record verbs on the rail's bottom edge at the rail's full inner width (issue 2498).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `class` | class string | `''` | An extra class on the root, appended to the primitive's own. |
  | `footClass` | class string | `''` | An extra class on the foot, for a caller's sheet hooks. |
  | `footAttrs` | object | `{}` | Spread on the foot, for a caller's `data-*` hooks. |

  Snippets:
  - `children` — the inspector's content, as flex items of the root at the aside's own gap.
  - `foot` — the record verbs, stacked in the pinned foot; verbs only, never a note.

  Rest spread:
  - `{...rest}` lands on the root `<section>`, written after `class={…}`.

  Invariants:
  - The root is the `.manager-inspector` aside's direct child and fills it, so the foot sits on
    the aside's foot whether or not the content overflows; the aside's `--fab-inspector-pad` and
    `--fab-inspector-bg` size the foot's bleed and paint its fill.
  - The foot publishes its height, and everything above it takes that plus `--fab-space-5` as
    `scroll-margin-block-end` (WCAG 2.4.11). Pinned by
    `tests/components/inspector-foot-pinning.test.js`.
-->
<script>
  let {
    class: extraClass = '',
    footClass = '',
    footAttrs = {},
    children = undefined,
    foot = undefined,
    ...rest
  } = $props();

  // `bind:offsetHeight` is a ResizeObserver Svelte disconnects on destroy.
  let footHeight = $state(0);
</script>

<section
  class={['fab-inspector-panel', extraClass]}
  style:--fab-inspector-foot-block-size={footHeight > 0 ? `${footHeight}px` : undefined}
  {...rest}
>
  {@render children?.()}
  {#if foot}
    <div
      class={['fab-inspector-panel-foot', footClass]}
      bind:offsetHeight={footHeight}
      {...footAttrs}
    >
      {@render foot()}
    </div>
  {/if}
</section>

<style>
  /* Fills the aside, so the foot's `margin-top: auto` seats it on the foot of a short panel. */
  .fab-inspector-panel {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: inherit;
    min-width: 0;
  }

  /* `bottom` answers the scrollport clamp, which Chromium measures from the aside's content box,
     and `margin-bottom` the containing-block clamp on the margin box at maximum scroll; both are
     the aside's own padding token. No shadow and no `z-index`: it reads by its hairline and fill. */
  .fab-inspector-panel-foot {
    position: sticky;
    bottom: calc(-1 * var(--fab-inspector-pad));
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    margin: auto calc(-1 * var(--fab-inspector-pad)) calc(-1 * var(--fab-inspector-pad));
    padding: var(--fab-space-3) var(--fab-inspector-pad);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-inspector-bg);
  }

  /* Not inherited, so set on every node above the foot; `:global` because the content is the
     caller's. */
  .fab-inspector-panel > :global(:not(.fab-inspector-panel-foot)),
  .fab-inspector-panel > :global(:not(.fab-inspector-panel-foot) *) {
    scroll-margin-block-end: calc(var(--fab-inspector-foot-block-size, 0px) + var(--fab-space-5));
  }
</style>
