<!--
  THE UPPERCASE MICRO-LABEL THAT NAMES WHAT FOLLOWS. The eyebrow is the most-restated shape in the
  product — roughly 400 instances in 55 versions — so it is a component rather than a convention. An
  IMPORT-FREE LEAF for `InspectorCard.svelte`'s reason, and already two rungs down in one tree,
  because `StatBox` composes it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `as` | `'p'` \| `'span'` \| `'h3'` | `'p'` | A micro-label is sometimes a heading and sometimes not. The union is MEASURED: across `src/ui/svelte/**` the hosts are 62 `<p>`, 3 `<span>` and 1 `<h3>`; `h2` and `h4` have no caller and are withdrawn. |
  | `tone` | `'default'` \| `'accent'` | `'default'` | `accent` is `--fab-accent`, and the specimen states when: "Accent only when it names a whole section". An unknown tone falls back to the default ink. |
  | `children` | snippet | `undefined` | The label text, already localized. A nested child is legitimate and inherits this component's size. |
  | `dataAttr` / `dataValue` | strings | `''` | An optional test/screenshot hook. Spread, so the attribute is ABSENT when unset rather than an empty one a selector would still match. `dataValue` is passed through AS WRITTEN — every hook converted here was written bare on an element, so the empty string is what "preserved verbatim" means; a `dataValue \|\| true` would render `="true"` instead. |

  Invariants:
  - IT TAKES NO `class`, NO `style` AND NO REST SPREAD. A caller that needs LAYOUT — a flex row, an
    ellipsis, a min-width — keeps its OWN wrapper and nests this inside it, which is the shape the
    specimen already draws. A named test hook is the exception, because a hook is not layout.
  - THE INK IS THE MUTED TONE, NOT THE SPECIMEN'S SUBTLE ONE, and that is a contrast reading rather
    than a preference: at 8.5px the subtle tone composites to 3.69:1 and 3.50:1 over the two
    grounds, under the 4.5:1 small-text floor `openspec/specs/design-system/spec.md` states, while
    the muted tone clears it in all seven palettes. ONE palette in seven hid it — the only one
    stating these tones as opaque hues rather than alphas — so the specimen's figure was set from
    the single outlier rather than from the set.
  - THE TRACKING IS `0.11em`, NOT `.14em`. No measured surface anywhere pairs 8.5px with `.14em`:
    every shipped `.14em` is bound to a larger size.
  - NO `font-family`. The specimen names the library PAGE's own body-face variable, which is not a
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
  /* THEME-ROOT TOKENS ONLY. No scoped `<style>` may reference `--fab-manager-*`, or any other
     property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY directory: a
     component is placed in a directory, not in a DOM subtree, so its scoped CSS cannot guarantee
     where its host renders. `tests/token-generation-gate.test.js` reds the reference. */
  .fab-kicker {
    /* Declared, not inherited: nine of the converted sites render as a `<p>` and each zeroes the
       user-agent block margin itself today. */
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    /* A recorded deviation from the specimen, which declares no leading because it never draws a
       wrapped kicker: without this a wrapped kicker inherits the host's ~1.5, which reads as two
       loose lines rather than one label. It reaches the `as="p"` sites only — an inline kicker's
       line box is governed by its HOST block's strut — which is why `StatBox.svelte` declares the
       same figure on its own composed label. */
    line-height: 1.3;
  }

  /* `tone` changes the ink and nothing else: a tone that changed the size would reintroduce the
     drift this component removes. */
  .fab-kicker.is-accent {
    color: var(--fab-accent);
  }
</style>
