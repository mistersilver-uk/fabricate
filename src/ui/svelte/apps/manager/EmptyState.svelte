<!--
  The manager's one no-state primitive: one dashed panel, one rounded icon tile, a serif title, a
  capped body line and an optional way out, matched to the reference prototype. Every manager
  "nothing here" message renders through it, and the player window's `PlayerViewState` composes it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `icon` / `title` / `hint` | string | `''` | omit `icon` for a panel with no tile and `title` for a one-sentence panel; `hint` is the optional explanatory line |
  | `compact` / `inline` / `note` | boolean | `false` | smaller tile and tighter padding for sidebars; the ONE-LINE form, where the stack becomes a ROW and the 46px tile is RELEASED rather than resized; and the POPOVER form, where the panel itself is released. `note` declares `place-items: start` and `text-align: left` on ITSELF, so a caller cannot restore a centred line through a wrapper. |
  | `filtered` / `field` | boolean | `false` | the filtered-to-nothing treatment (one quieter, wider-padded dashed panel, no icon or title), and a short placeholder at full control width and 34px height |
  | `contextClass` / `dataAttr` / `dataValue` | string | `''` | extra classes whose rules live in the global sheet because they describe how a container PLACES this panel — never for appearance — and an optional test and screenshot hook |
  | `children` | snippet | | trailing content INSIDE the panel: a Clear-filters button, a CTA or a docs link, which is the way out of the dead end |

  Invariants:
  - The DOM shape is part of the contract: the icon, title and body rules are written as
    `> div > i` / `h3` / `p` descendants of an inner stack `<div>`, so the wrapper cannot be
    flattened without silently dropping the icon tile and the stack gap.
  - There is no shared `.manager-empty` appearance class to hand-roll markup against: the appearance
    lives in this file's scoped `<style>`, which also keeps required-screenshot detection honest,
    since `VIEW_RECIPES` maps changed FILE PATHS to views. The class NAME is retained because the
    smoke harness and several mounted tests locate the panel by it. It SELF-PAINTS: every token is
    declared on `:root`, so a surface outside `.fabricate-manager` gets the same panel.
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

  // Spread, so an unset hook is absent rather than an empty attribute a selector would match.
  // `dataValue || true` COERCES A BARE HOOK TO `="true"` and an explicit `dataValue=""` does not
  // change that (issue 1514); every shipped reader is a presence selector, so nothing breaks.
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
     its purpose*. The no-state panel is padding-driven, as in the prototype; the old 220px floor
     made every empty state taller than its design. */
  .manager-empty {
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

  .manager-empty h3 {
    margin: 0;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-serif);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
  }

  .manager-empty p {
    max-width: 280px;
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 11px;
    line-height: 1.5;
    overflow-wrap: break-word;
  }

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

  /* The ONE-LINE variant (issue 1286): the stack flips to a ROW and the tile is RELEASED into a
     bare glyph, where `is-compact` only shrinks it to a third tile size. Written AFTER
     `.is-compact` so a caller that wrongly set both still gets the row. */
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

  .manager-empty.is-inline p {
    max-width: none;
    font-size: 11.5px;
  }

  .manager-empty.is-field {
    width: 100%;
    height: 34px;
    padding: var(--fab-space-1) var(--fab-space-2);
  }

  /* THE POPOVER NOTE: the one variant that releases the PANEL, because a picker's popover is
     already a bordered, shadowed panel and a second box inside it reads as a card the GM might act
     on. Written AFTER `.is-inline` so a caller that set both still gets the released panel. */
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

  /* The line at the popover's scale, with the hero title's serif face deliberately dropped. THE
     INK IS THE MUTED TONE, NOT THE SUBTLE ONE THE REFERENCE STATES (issue 1514): at this size the
     mark is SMALL TEXT, and in six of seven palettes the subtle tone composites under the 4.5:1
     floor `openspec/specs/design-system/spec.md` states. */
  .manager-empty.is-note h3 {
    color: var(--fab-text-muted);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.4;
  }

  .manager-empty.is-note p {
    max-width: none;
    color: var(--fab-text-muted);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.4;
  }

  /* Filtered to nothing is not an error and does not want the full empty-panel apparatus. The
     figures are the reference's, corrected on the VARIANT rather than route-scoped; the one NOT
     taken is the ink, which composites to 2.66:1 at this size — `is-note` above carries the same
     correction on the same measurement. */
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
