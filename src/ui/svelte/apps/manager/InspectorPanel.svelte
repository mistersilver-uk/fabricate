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
  - The foot publishes its height plus the fade on the aside as `--fab-inspector-scroll-pad`, its
    `scroll-padding-block-end`, so a focused control stops above the foot (WCAG 2.4.11); the fade
    shows only while content lies below the visible edge. Pinned by `tests/components/inspector-foot-pinning.test.js`.
-->
<script module>
  /**
   * Reports through `onchange(more)` whether `scroller` holds content below its visible edge,
   * re-reading on scroll and on a resize of the scroller or any child; returns the teardown.
   */
  export function trackContentBelow(scroller, onchange) {
    let last;
    const update = () => {
      const more = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1;
      if (more !== last) onchange((last = more));
    };
    const resize = new ResizeObserver(update);
    const observeAll = () => {
      resize.disconnect();
      for (const node of [scroller, ...scroller.children]) resize.observe(node);
      update();
    };
    const children = new MutationObserver(observeAll);
    children.observe(scroller, { childList: true });
    scroller.addEventListener('scroll', update, { passive: true });
    observeAll();
    return () => {
      resize.disconnect();
      children.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }

  /** An attachment: `has-content-below` on the scroller itself, for a frame with its own foot. */
  export const markContentBelow = (node) =>
    trackContentBelow(node, (more) => node.classList.toggle('has-content-below', more));
</script>

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
  let contentBelow = $state(false);

  // The aside is the scroller: the root is its direct child.
  const trackAside = (root) =>
    trackContentBelow(root.parentElement, (more) => (contentBelow = more));

  // On the aside, not the content: Chromium's focus scroll ignores a `scroll-margin` on a control
  // that is inside the scrollport but under the foot, and honours the scroller's padding. The
  // `--fab-space-5` addend is the fade's 20px.
  function publishScrollPad(root) {
    const aside = root.parentElement;
    aside.style.setProperty(
      '--fab-inspector-scroll-pad',
      `calc(${footHeight}px + var(--fab-space-5))`
    );
    return () => aside.style.removeProperty('--fab-inspector-scroll-pad');
  }
</script>

<section
  class={['fab-inspector-panel', extraClass]}
  {@attach trackAside}
  {@attach publishScrollPad}
  {...rest}
>
  {@render children?.()}
  {#if foot}
    <div
      class={['fab-inspector-panel-foot', footClass]}
      class:has-content-below={contentBelow}
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

  /* Drawn over the content, above the hairline, only while the aside has more below. */
  .fab-inspector-panel-foot.has-content-below::before {
    position: absolute;
    inset-inline: 0;
    bottom: calc(100% + 1px);
    block-size: 20px;
    background: linear-gradient(to top, var(--fab-inspector-bg), transparent);
    pointer-events: none;
    content: '';
  }
</style>
