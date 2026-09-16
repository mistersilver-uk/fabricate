<!--
  THE UPPERCASE MICRO-LABEL THAT NAMES WHAT FOLLOWS — roughly 400 instances in 55 versions before it
  was a component. An import-free leaf, and already two rungs down in one tree because `StatBox`
  composes it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `as` | `'p'` \| `'span'` \| `'h3'` | `'p'` | A micro-label is sometimes a heading and sometimes not. The union is MEASURED: 62 `<p>`, 3 `<span>` and 1 `<h3>` across `src/ui/svelte/**`. |
  | `tone` / `children` | `'default'` \| `'accent'` / snippet | `'default'` / `undefined` | `accent` is `--fab-accent`, and the specimen states when: "Accent only when it names a whole section"; an unknown tone falls back to the default ink. `children` is the label text, already localized. |
  | `dataAttr` / `dataValue` | strings | `''` | An optional test/screenshot hook, SPREAD so the attribute is absent when unset. `dataValue` is passed through as written, per the `data-*` spelling rule in `openspec/specs/design-system/spec.md`. |

  Invariants:
  - IT TAKES NO `class`, NO `style` AND NO REST SPREAD. A caller that needs LAYOUT keeps its own
    wrapper and nests this inside it, which is the shape the specimen already draws. A named test
    hook is the exception, because a hook is not layout.
  - THE INK IS THE MUTED TONE, NOT THE SPECIMEN'S SUBTLE ONE: at 8.5px the subtle tone composites to
    3.69:1 and 3.50:1 over the two grounds, under the 4.5:1 small-text floor
    `openspec/specs/design-system/spec.md` states, while the muted tone clears it in all seven
    palettes.
  - THE TRACKING IS `0.11em`, NOT `.14em`; every shipped `.14em` is bound to a larger size.
  - NO `font-family`: the specimen names the library PAGE's own body-face variable, which is not a
    product token, so the eyebrow inherits the surface's UI face and re-skins with it.
-->
<script>
  let {
    as = 'p',
    tone = 'default',
    dataAttr = '',
    dataValue = '',
    children = undefined,
  } = $props();

  const HOSTS = new Set(['p', 'span', 'h3']);

  const FALLBACK_HOST = 'p';

  const host = $derived(HOSTS.has(as) ? as : FALLBACK_HOST);

  const accent = $derived(tone === 'accent');

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue } : {});
</script>

<svelte:element this={host} class="fab-kicker" class:is-accent={accent} {...hookAttributes}
  >{@render children?.()}</svelte:element
>

<style>
  .fab-kicker {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    line-height: 1.3;
  }

  .fab-kicker.is-accent {
    color: var(--fab-accent);
  }
</style>
