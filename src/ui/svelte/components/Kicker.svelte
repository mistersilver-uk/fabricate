<!-- Svelte 5 runes mode -->
<!--
  THE UPPERCASE MICRO-LABEL THAT NAMES WHAT FOLLOWS (issue 1505).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  The eyebrow is the most-restated shape in the product. `library.html:955` draws it
  once and `:956` captions it "Roughly 400 instances across the corpus, in 55
  versions", and
  the seven byte-identical `.crafting-detail-section-title` blocks this change deletes
  are the measured proof that the eighth restatement arrives unbidden: seven files in
  ONE directory each declare the same six declarations, three of them under a comment
  saying so in terms ("Svelte scopes CSS per component, so the rule is redefined
  rather than shared"). A convention cannot be corrected in one edit; a component can.

  ── THE FIGURES, AND THE TWO CORRECTIONS ──────────────────────────────────────────
  Geometry from `library.html:120` — 700 / 8.5px / uppercase — with TWO corrections,
  both made in the specimen in this same programme. The first is the tracking: it is
  `0.11em`, not the `.14em` that line carried. Two independent issue-1373
  measurements agree.

  THE SECOND IS THE INK, and it is a contrast reading rather than a preference
  (issue 1514). `library.html:120` states `--fab-text-subtle`. At 8.5px this is the
  smallest text the product draws, and the default `fabricate` theme declares its three
  text tones as ALPHAS over the surface rather than as opaque values — so the subtle
  tone composites to 3.69:1 on `--fab-surface` and 3.50:1 on `--fab-surface-soft`,
  under the 4.5:1 small-text floor `openspec/specs/design-system/spec.md` states. The
  muted tone reads 5.42:1 and 5.00:1 at those two grounds and clears the floor in all
  seven palettes, the worst being `ironblood-forge` at 5.19:1 and 4.77:1.

  ONE palette in seven hid it, which is why it survived the specimen: `mythwright` alone
  states `muted` and `subtle` as opaque hues rather than as alphas over the surface, and it is
  the only palette of the seven in which the subtle tone clears the floor at all — 5.28:1 from
  the SAME declaration. Six fail and one passes, so the specimen's figure was set from the
  single outlier rather than from the set. It is corrected on the
  component rather than at a call site because the figure is wrong for every caller,
  and it moves the two sites this programme did not convert — the manager's recipe-item
  Overview tab and `StatBox`'s composed label — as well as the ones it did. `styles/fabricate.css` records the reference's own eyebrow at
  `700 8.5px var(--sans); letter-spacing: .11em; color: var(--subtle)` in 64 of its 71
  eyebrows over sixteen cited prototype anchors, and the converged shipped
  `.manager-kicker` beside it states exactly that; a second measurement pass on a
  different surface — the Tool Studio rail's own five reference eyebrows — reports
  "all five state `font: 700 8.5px var(--sans); letter-spacing: .11em`". The decisive
  argument is that NO measured surface anywhere pairs 8.5px with `.14em`: every
  shipped `.14em` is bound to a larger size (9px, 0.58rem, 0.62rem). The specimen's
  pair was a hybrid rather than a figure, so the measurement is the authority.

  No `font-family`. `library.html:120` names `var(--page-ui-face)`, which is the
  library PAGE's own body face variable and not a product token; the converged shipped
  class declares no family either, so the eyebrow inherits the surface's UI face and
  re-skins with it.

  `margin: 0` IS declared, and it is not in the specimen: the specimen draws its
  kicker only as a `<span>`, while nine of this change's seventeen call sites are a
  `<p>` that zeroes the user-agent margin itself today. Without it every one of those
  frames would move by the browser's default block margin.

  ── WHAT IT DOES NOT TAKE ─────────────────────────────────────────────────────────
  No `class`, no `style` and no rest spread. A caller that needs LAYOUT — a flex row,
  an ellipsis, a min-width — keeps its OWN wrapper element and nests this inside it,
  which is the shape `library.html:955` already draws (a plain kicker span inside a
  caller-owned flex row). `ConsumptionPlanPanel.svelte` and `EssencePoolPanel.svelte`
  are the two conversions that exercise it: each keeps its OWN wrapper, stripped to what
  is genuinely the caller's — the flex row and its glyph in the first, and in the second
  the one outer margin this primitive zeroes — with the kicker inside.

  A named test/screenshot HOOK is the exception, because a hook is not layout: see
  `dataAttr`/`dataValue` below.

  It is an IMPORT-FREE LEAF — props only, no bridge, no util imports — for
  `InspectorCard.svelte`'s reason: one util import inside a leaf propagates a required
  raw-module entry into every mount harness that compiles anything rendering it, and a
  missing entry HANGS that suite (`# cancelled`) rather than failing it. This leaf is
  two rungs down in one tree already, because `StatBox.svelte` composes it.

  Props:
   - as: `'p' | 'span' | 'h3'`. The element it renders, because a micro-label is
     sometimes a heading and sometimes not. The union is MEASURED rather than
     forward-looking: across `src/ui/svelte/**` the hosts are 62 `<p>`, 3 `<span>` and
     1 `<h3>`; `h2` and `h4` have no caller and are withdrawn. `h3` is the one member of
     that union no shipped site reaches — nine pass `p` and eight pass `span` — and is kept
     on the measurement rather than on a caller.
   - tone: `'default' | 'accent'`. `accent` is `--fab-accent` (`library.html:121`), and
     the specimen states when: "Accent only when it names a whole section"
     (`library.html:956`). It is on the specimen — the rule, the drawn example and the
     caption are all there — which is why it survives the unreachable-configuration
     rule that withdrew `StatBox`'s `accent`.
   - children: the label text, already localized by the caller. A nested child is
     legitimate and is how `RecipeItemOverviewTab.svelte` keeps its "· from linked
     item" note, which declares no size and therefore inherits this component's.
   - dataAttr / dataValue: an optional test/screenshot hook, e.g.
     `dataAttr="data-item-page-mid-label"`. Spread, so the attribute is genuinely
     ABSENT when unset rather than an empty one a selector would still match.

     `dataValue` defaults to the EMPTY STRING and is passed through as written. That
     is a deliberate difference from `apps/manager/Callout.svelte`, whose older
     `dataValue || true` renders `data-x="true"` where the hand-rolled element rendered
     `data-x=""`. Every hook this change carries was written BARE on an element, so the
     empty string is what "preserved verbatim" means here — presence selectors resolve
     either way, which is exactly why the difference would not have been caught.
-->
<script>
  let {
    as = 'p',
    tone = 'default',
    dataAttr = '',
    dataValue = '',
    children = undefined,
  } = $props();

  /** The measured host set. `h2` and `h4` have no caller and are not in it. */
  const HOSTS = new Set(['p', 'span', 'h3']);

  // `p` is the fallback because it is the most common measured host and carries no
  // heading semantics to invent.
  const FALLBACK_HOST = 'p';

  const host = $derived(HOSTS.has(as) ? as : FALLBACK_HOST);

  // An unknown tone falls back to the default ink rather than rendering untinted-but-
  // unstyled, the same way `Callout.svelte` resolves its own.
  const accent = $derived(tone === 'accent');

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue } : {});
</script>

<svelte:element this={host} class="fab-kicker" class:is-accent={accent} {...hookAttributes}
  >{@render children?.()}</svelte:element
>

<style>
  /* Theme-root tokens ONLY. NO scoped `<style>` may reference `--fab-manager-*`, or any other
     custom property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY
     directory — a component is placed in a directory, not in a DOM subtree, so its scoped CSS
     cannot guarantee where its host renders, and `tests/token-generation-gate.test.js` reds the
     reference wherever it is written. Both tokens below are declared in `:root` and in all seven
     `.fabricate[data-fabricate-theme="…"]` blocks, which every Fabricate surface carries. */
  .fab-kicker {
    /* Declared, not inherited: nine of the seventeen converted sites render as a `<p>` and each
       zeroes the user-agent block margin itself today. */
    margin: 0;
    /* The muted tone, not the specimen's subtle one — see the second correction in the
       header. At 8.5px the subtle tone is under the small-text contrast floor on five of
       the seven palettes. */
    color: var(--fab-text-muted);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    /* Recorded deviation from `library.html:120`, which declares none because the specimen
       never draws a wrapped kicker. Without this a wrapped kicker inherits the host's ~1.5 —
       about 12.75px of leading on 8.5px type, which reads as two loose lines rather than one
       label. The rules this component replaces declared 1.2; 1.3 keeps a two-line label
       together without crowding the descenders.

       It sets the leading of a kicker that is ITSELF the block — the `as="p"` sites, where it
       tightens the recipe-item Overview tab visibly. An `as="span"` kicker is an inline box
       whose line box is governed by its HOST block's strut, not by its own `line-height`, so
       this declaration does not reach it; that is why `StatBox.svelte` declares the same 1.3
       on `.fab-stat-box` for the label it composes. */
    line-height: 1.3;
  }

  /* `tone` changes the ink. Nothing else — a tone that changed the size would reintroduce
     exactly the drift this component removes. */
  .fab-kicker.is-accent {
    color: var(--fab-accent);
  }
</style>
