<!-- Svelte 5 runes mode -->
<!--
  The manager's one no-state primitive: one dashed panel, one rounded icon tile, a serif title, a
  capped body line and an optional way out, matched to the reference prototype. Every manager
  "nothing here" message renders through it, and the player window's `PlayerViewState` composes it
  too.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `icon` | Font Awesome classes | `''` | omit for a panel with no tile |
  | `title` | string | `''` | the short statement of what is absent; omit for a one-sentence panel |
  | `hint` | string | `''` | the optional explanatory sentence beneath it |
  | `compact` | boolean | `false` | smaller tile and tighter padding for sidebars, popovers and inline panels |
  | `inline` | boolean | `false` | the ONE-LINE form: the stack becomes a ROW and the 46px tile is RELEASED, not resized |
  | `note` | boolean | `false` | the POPOVER form: the panel itself is released — no dashed edge, corner, fill or tile |
  | `filtered` | boolean | `false` | the filtered-to-nothing treatment: one quieter, wider-padded dashed panel, no icon or title |
  | `field` | boolean | `false` | sizes a short placeholder to full control width and 34px height |
  | `contextClass` | string | `''` | extra classes whose rules live in the global sheet because they describe how a container PLACES this panel; never for appearance |
  | `dataAttr` / `dataValue` | string | `''` | an optional test and screenshot hook |

  Snippets:
  - `children` — trailing content inside the panel: a Clear-filters button, a CTA or a docs link.
    It is the way out of the dead end, so it belongs inside the panel rather than beside it.

  Invariants:
  - The DOM shape is part of the contract: the icon, title and body rules are written as
    `> div > i` / `h3` / `p` descendants of an inner stack `<div>`, so the wrapper cannot be
    flattened without silently dropping the icon tile and the stack gap.
  - There is no shared `.manager-empty` appearance class to hand-roll markup against: the
    appearance lives in this file's scoped `<style>`, which also keeps required-screenshot
    detection honest, since `VIEW_RECIPES` maps changed FILE PATHS to views. The class NAME is
    retained because the smoke harness and several mounted tests locate the panel by it, and
    because layout-context rules an ancestor selector needs still live in `styles/fabricate.css`.
  - It SELF-PAINTS: every token it reads is declared on `:root`, so a surface outside
    `.fabricate-manager` gets the same panel. A caller that needs the panel to FILL a region owns
    that fill itself.
  - `note` declares `place-items: start` and `text-align: left` on ITSELF, so a caller cannot
    restore a centred line through a wrapper — an inherited `text-align` loses to the variant's
    own declaration.
-->
<script>
  let {
    icon = '',
    title = '',
    hint = '',
    compact = false,
    inline = false,
    field = false,
    note = false,
    filtered = false,
    contextClass = '',
    dataAttr = '',
    dataValue = '',
    children = undefined,
  } = $props();

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a selector
  // would still match.
  //
  // `dataValue || true` COERCES A BARE HOOK TO `="true"`, and an explicit `dataValue=""` at a call
  // site does not change that. Measured at issue 1514: 61 hook-bearing call sites of this
  // component and `Callout` render `="true"` where the markup they replaced wrote the attribute
  // bare. Nothing breaks, because every shipped reader is a presence selector — which is why the
  // drift is invisible and is written down here. `components/Kicker.svelte` and
  // `components/Notice.svelte` pass `dataValue` through as written.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<div
  class="manager-empty {contextClass}"
  class:is-compact={compact}
  class:is-inline={inline}
  class:is-field={field}
  class:is-note={note}
  class:is-filtered={filtered}
  {...hookAttributes}
>
  <div>
    {#if icon}
      <i class={icon} aria-hidden="true"></i>
    {/if}
    {#if title}
      <h3>{title}</h3>
    {/if}
    {#if hint}
      <p>{hint}</p>
    {/if}
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  /* Theme-root tokens only — design-system spec, *The token namespace is one generation and names
     its purpose*, gated by `tests/token-generation-gate.test.js`. Outside the manager such a
     property is not in scope, the declaration becomes invalid at computed-value time and the
     colour silently falls back to inheritance: nothing fails, it just looks wrong, and the trigger
     is exactly the reuse this primitive exists to enable. */
  /* The no-state panel, matched to the reference prototype. Height is padding-driven, as in the
     prototype — the old 220px floor made every empty state taller than its design. */
  .manager-empty {
    /* Declared here rather than leaned on: an area-agnostic primitive that a container widens to
       `width: 100%` must not depend on the host area for its padding model. */
    box-sizing: border-box;
    display: grid;
    place-items: center;
    padding: 44px 20px;
    border: 1.5px dashed var(--fab-border);
    border-radius: 12px;
    color: var(--fab-text-subtle);
    text-align: center;
  }

  .manager-empty > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  /* A 46px rounded tile holding an 18px glyph in the SUBTLE tone — the prototype's icon is both
     smaller and dimmer than a heading. Spacing comes from the stack gap, not a margin. */
  .manager-empty > div > i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    color: var(--fab-text-subtle);
    background: var(--fab-surface-soft);
    font-size: 18px;
  }

  /* Serif title over a body capped at 280px so the sentence wraps into a readable column instead
     of spanning a wide pane. */
  .manager-empty h3 {
    margin: 0;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-serif);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
  }

  /* `overflow-wrap` is carried here for every consumer: an unbreakable token — a long item name,
     a pasted uuid — otherwise overflows the 280px cap. */
  .manager-empty p {
    max-width: 280px;
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 11px;
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  /* The sidebar and inline scale of the same vocabulary: same dashed panel, tile and type, just
     less furniture. The alternative — a bare sentence — is what made these states look unrelated
     to each other in the first place. */
  .manager-empty.is-compact {
    padding: var(--fab-space-4) var(--fab-space-3);
  }

  .manager-empty.is-compact > div {
    gap: var(--fab-space-chip);
  }

  .manager-empty.is-compact > div > i {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    font-size: 14px;
  }

  .manager-empty.is-compact h3 {
    font-size: 12px;
  }

  /* The ONE-LINE variant (issue 1286). Two declarations do the work and BOTH are required, which
     is why `is-compact` was not the cheap answer: the inner stack flips from a column to a ROW,
     and the 46px icon TILE is RELEASED — width, height, radius and fill — into a bare glyph, where
     `is-compact` only shrinks it to 32px, a third tile size rather than the absence of one.

     Written AFTER `.is-compact` so a caller that wrongly set both still gets the row. The dashed
     edge, radius and type stay the shared panel's: one vocabulary at a second density. */
  .manager-empty.is-inline {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 14px 16px;
    text-align: left;
  }

  .manager-empty.is-inline > div {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .manager-empty.is-inline > div > i {
    width: auto;
    height: auto;
    border-radius: 0;
    background: none;
    font-size: 13px;
  }

  /* The 280px column cap is a HERO-panel rule: on one line it would clip the sentence into a
     narrow column beside the glyph, which is the opposite of what this variant is for. */
  .manager-empty.is-inline p {
    max-width: none;
    font-size: 11.5px;
  }

  .manager-empty.is-field {
    width: 100%;
    height: 34px;
    padding: var(--fab-space-1) var(--fab-space-2);
  }

  /* THE POPOVER NOTE: the one variant that releases the PANEL. Every other member of this family
     keeps the dashed box, because each answers for a REGION of a screen and a box marks the region
     out; a picker's popover is already a bordered, shadowed panel, and a second box inside it
     reads as a card the GM might be able to act on.

     Written AFTER `.is-inline` so a caller that set both still gets the released panel, and the
     tile is released the way `is-inline` releases it rather than resized. */
  .manager-empty.is-note {
    place-items: start;
    padding: var(--fab-space-chip);
    border: 0;
    border-radius: 0;
    background: none;
    text-align: left;
  }

  .manager-empty.is-note > div {
    align-items: flex-start;
    gap: var(--fab-space-2xs);
  }

  .manager-empty.is-note > div > i {
    width: auto;
    height: auto;
    border-radius: 0;
    background: none;
    font-size: 10px;
  }

  /* The line itself, at the popover's scale rather than the panel family's: a sentence in the
     list's own voice, quieter than the rows it stands in for. The serif face the hero title
     carries is deliberately dropped.

     THE INK IS THE MUTED TONE, NOT THE SUBTLE ONE THE REFERENCE STATES (issue 1514). At this size
     the mark is SMALL TEXT, and six of the seven palettes state `muted` and `subtle` as alphas
     over the surface, so the subtle tone composites under the 4.5:1 small-text floor
     `openspec/specs/design-system/spec.md` states. The muted tone clears it in all seven. The
     correction is on the VARIANT rather than at a call site because the reference's figure is
     wrong for every caller of it, and `mythwright` — the one palette stating those tones as
     opaque hues — is the single passing outlier the specimen's figure was set from. */
  .manager-empty.is-note h3 {
    color: var(--fab-text-muted);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.4;
  }

  /* The optional second line, kept at the same quiet scale so a two-line note is one voice rather
     than a heading over a body. The ink is declared here rather than inherited: `.manager-empty p`
     above paints the HERO panel's sentence, which is not this one. */
  .manager-empty.is-note p {
    max-width: none;
    color: var(--fab-text-muted);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.4;
  }

  /*
    Filtered to nothing is not an error and does not want the full empty-panel apparatus. One
    dashed panel says it in a sentence, and the Clear-filters button — which the reference has no
    equivalent of, and which is kept — is the way out.

    The figures are the reference's, corrected on the VARIANT rather than route-scoped: appearance
    belongs to this file, and a layered global rule could not reach an unlayered scoped block in
    any case. The one figure NOT taken is the ink. The reference's disabled tone composites to
    2.66:1 on `--fab-surface` at this size — the worst reading in the family, and a long way under
    the 4.5:1 small-text floor — so it moves to `--fab-text-muted`, which clears the floor in all
    seven palettes. `is-note` above carries the same correction on the same measurement.
  */
  .manager-empty.is-filtered {
    align-content: center;
    padding: var(--fab-space-6);
    border-width: 1px;
    border-color: var(--fab-border);
    border-radius: 10px;
    color: var(--fab-text-muted);
  }

  .manager-empty.is-filtered > div {
    gap: var(--fab-space-3);
  }

  .manager-empty.is-filtered p {
    color: var(--fab-text-muted);
    font-size: 11.5px;
    font-weight: 400;
  }
</style>
