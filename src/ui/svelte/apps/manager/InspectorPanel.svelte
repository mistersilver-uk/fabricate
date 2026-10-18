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
    the aside's foot whether or not the content overflows; the manager sheet bleeds the foot by
    the aside's `--fab-manager-inspector-pad` and paints it with `--fab-manager-inspector-bg`.
  - The foot publishes its height on the aside as `--fab-manager-inspector-scroll-pad`, the
    aside's `scroll-padding-block-end`, so a focused control stops above the foot (WCAG 2.4.11);
    the sheet releases it while focus is in the foot, so a foot verb takes focus without a scroll.
    Pinned by `tests/components/inspector-foot-pinning.test.js`.
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

  // The aside is the scroller, and the root is its direct child.
  function publishScrollPad(root) {
    const aside = root.parentElement;
    aside.style.setProperty('--fab-manager-inspector-scroll-pad', `${footHeight}px`);
    return () => aside.style.removeProperty('--fab-manager-inspector-scroll-pad');
  }
</script>

<section class={['fab-inspector-panel', extraClass]} {@attach publishScrollPad} {...rest}>
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

  /* Its bleed and fill are the manager sheet's, which reads the aside's tokens. No shadow and no
     `z-index`: it reads by its hairline and fill. */
  .fab-inspector-panel-foot {
    position: sticky;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    margin-top: auto;
    padding-block: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }
</style>
