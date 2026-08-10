<!-- Svelte 5 runes mode -->
<!--
  ONE library GRID CARD, shared by every studio (issue 1036 follow-up).

  The Essence Studio proved the anatomy against the maintainer's Recipe Studio prototype;
  this is that anatomy with the essence vocabulary lifted out, so Recipes, Components and
  Tools can render the SAME card rather than each re-deriving it. The order is fixed
  because it is the prototype's order and the thing being shared IS the order:

      header (media + name, and an optional subtitle beneath it)
      badges
      description
      facts        — a recessed well of short stats, split by hairlines
      ─────────    — divider
      footer       — leading actions, trailing actions

  ── WHAT IS A PROP AND WHAT IS A SNIPPET ────────────────────────────────────────
  Fixed vocabulary is a PROP (`name`, `subtitle`, `description`, `facts`), because those
  are the same idea in every studio and a studio that passes markup for them is a studio
  drifting. Everything whose CONTENT is studio-specific is a SNIPPET (`media`, `badges`,
  `selection`, `footerStart`, `footerEnd`), because the alternative is this component
  importing every studio's chips and toggles and growing a branch per studio.

  That split is what lets Recipes add its padlock beside the toggle (`footerStart`), show
  its category under the name (`subtitle`), and colour a stat (`facts[].tone`) without a
  single change here.

  ── THE HOOK CLASSES ARE THE CALLER'S ───────────────────────────────────────────
  This card emits its own `fab-library-card-*` classes, which is where the LOOK lives, and
  ALSO whatever `rootClass` / `identityClass` the studio passes. The Foundry smoke walk,
  the View Lab cases and `managerLayoutGuards` all navigate by studio-specific selectors
  (`.manager-essence-row`, `.manager-essence-identity`), so those must survive the move —
  the same override-prop convention `BulkSelectionToolbar` already uses in this app.

  ── THE CARD IS NOT A `<button>`; ITS BODY IS ───────────────────────────────────
  The root is an `<li>` with no handler. The selecting control is an inner `<button>`
  wrapping only the NON-interactive body (header → facts). The selection box and the
  footer controls are its SIBLINGS, because an interactive element nested inside a
  `<button>` is invalid DOM that `createElement` lands silently.
-->
<script>
  let {
    // Root
    rootClass = '',
    identityClass = '',
    rootAttrs = {},
    selected = false,
    disabled = false,
    bulkSelected = false,
    onSelect = () => {},
    // Content
    name = '',
    nameTitle = undefined,
    subtitle = '',
    subtitleTitle = undefined,
    description = '',
    descriptionTitle = undefined,
    // `facts` is the recessed well: [{ id, label, tone, title, attrs, class }]. `tone` is
    // one of 'muted' (the default), 'strong' for the leading stat that carries the emphasis
    // — the prototype's "2 in · 1 out" over its "2 steps" — or one of the semantic
    // 'warning' / 'danger' / 'success', which resolve to the same tokens `Chip` and
    // `StatusPill` use.
    facts = [],
    factsAttrs = {},
    // Snippets
    media = undefined,
    badges = undefined,
    selection = undefined,
    footerStart = undefined,
    footerEnd = undefined,
  } = $props();

  const hasFooter = $derived(Boolean(footerStart || footerEnd));
  const hasFacts = $derived((facts || []).length > 0);
</script>

<li
  class={`fab-library-card ${rootClass} ${selected ? 'is-selected' : ''} ${disabled ? 'is-off' : ''}`}
  class:is-bulk-selected={bulkSelected}
  aria-current={selected ? 'true' : undefined}
  {...rootAttrs}
>
  <button type="button" class={`fab-library-card-body ${identityClass}`} onclick={() => onSelect()}>
    <span class="fab-library-card-header">
      {#if media}{@render media()}{/if}
      <span class="fab-library-card-heading">
        <span class="fab-library-card-name manager-system-name" title={nameTitle}>{name}</span>
        <!-- Rendered only when a studio HAS a subtitle, so a studio without one reserves no
             space for it and its cards keep the height they have today. -->
        {#if subtitle}
          <span class="fab-library-card-subtitle" title={subtitleTitle}>{subtitle}</span>
        {/if}
      </span>
    </span>

    {#if badges}
      <span class="fab-library-card-badges">{@render badges()}</span>
    {/if}

    <span class="fab-library-card-description manager-system-description" title={descriptionTitle}>
      {description}
    </span>

    {#if hasFacts}
      <span class="fab-library-card-facts" {...factsAttrs}>
        {#each facts as fact, index (fact.id)}
          {#if index > 0}
            <span class="fab-library-card-facts-sep" aria-hidden="true"></span>
          {/if}
          <span
            class={`fab-library-card-fact is-${fact.tone || 'muted'} ${fact.class || ''}`}
            title={fact.title}
            {...fact.attrs || {}}>{fact.label}</span
          >
        {/each}
      </span>
    {/if}
  </button>

  {#if selection}{@render selection()}{/if}

  {#if hasFooter}
    <div class="fab-library-card-footer">
      {#if footerStart}{@render footerStart()}{/if}
      {#if footerEnd}<span class="fab-library-card-footer-end">{@render footerEnd()}</span>{/if}
    </div>
  {/if}
</li>

<style>
  /* The card SHELL. The row skin, hover and `.is-selected` ring stay in
     `styles/fabricate.css` keyed off the studio's own `rootClass`, so a studio keeps one
     consistent selected-row signal with its list rows. Only the card's INTERIOR is here. */
  .fab-library-card {
    position: relative;
    display: flex;
    /* `wrap` is inherited from the studio row rule this card grew out of. It changes nothing
       for a column of fitting children, and it is declared rather than dropped so the card
       computes identically to the row it replaced. */
    flex-wrap: wrap;
    flex-direction: column;
    align-items: stretch;
    min-height: 0;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    list-style: none;
  }

  /* The body `<button>`. The manager's `<button>` reset (appearance, text-align, height:auto)
     is joined to the studio identity classes in `styles/fabricate.css`, because it must beat
     Foundry's host button geometry; this only stacks the rows. */
  .fab-library-card-body {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
  }

  /* HEADER: media on the left, the name to its right. `padding-right` reserves the corner the
     absolute selection box occupies, so a long name never runs under it. */
  .fab-library-card-header {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    padding-right: 2.25rem;
  }

  .fab-library-card-heading {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    min-height: 40px;
  }

  .fab-library-card-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--fab-font-serif);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.2;
  }

  /* The optional category line beneath the name (the prototype's "Smithing"). */
  .fab-library-card-subtitle {
    min-width: 0;
    margin-top: 0.15rem;
    overflow: hidden;
    color: var(--fab-text-subtle);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.6rem;
    font-weight: 500;
    line-height: 1.2;
  }

  /* BADGES: a reserved min-height keeps a card with no badges the same height as one with. */
  .fab-library-card-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-height: 1.35rem;
  }

  /* DESCRIPTION: a fixed 2-line box so the facts well and the footer land at the same offset
     in every card and a shelf stays level. `title` keeps the full text reachable. */
  .fab-library-card-description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    min-height: calc(1.4em * 2);
    font-size: 0.72rem;
    line-height: 1.4;
  }

  /* FACTS: a RECESSED well, split by hairlines. `--fab-bg-1` over `--fab-mv2-border` is the
     inspector stat-tile idiom (`.manager-essence-stat`), and the maintainer's prototype
     measures to the same pair — so the faithful render and the tokenised one agree. */
  .fab-library-card-facts {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    white-space: nowrap;
  }

  /* The TONES a fact can take. `muted` is the container default and needs no rule; `strong`
     is the leading stat that carries the emphasis, because a well whose halves read
     identically is a box with no hierarchy.

     The semantic three are the same `--fab-<tone>-text` tokens `Chip` and `StatusPill`
     already answer to, so a studio marking a fact as a problem gets the colour the rest of
     the app uses for a problem, rather than a colour invented at the call site. They exist
     so `tone` is a real enum rather than a boolean wearing a string's clothes: a studio can
     colour a stat by NAMING one, without editing this file. */
  .fab-library-card-fact.is-strong {
    color: var(--fab-mv2-text);
    font-size: 0.66rem;
    font-weight: 600;
  }

  .fab-library-card-fact.is-warning {
    color: var(--fab-warning-text);
    font-weight: 600;
  }

  .fab-library-card-fact.is-danger {
    color: var(--fab-danger-text);
    font-weight: 600;
  }

  .fab-library-card-fact.is-success {
    color: var(--fab-success-text);
    font-weight: 600;
  }

  .fab-library-card-facts-sep {
    flex: 0 0 auto;
    width: 1px;
    height: 0.9em;
    background: var(--fab-mv2-border);
  }

  /* FOOTER: a divider, leading actions, then trailing actions pushed to the far end.

     The trailing actions are GROUPED in their own element rather than the footer using
     `justify-content: space-between`. Space-between is only equivalent while there are
     exactly two children: the moment a studio adds a third action — the Recipe Studio's
     padlock beside its toggle is the known case — space-between spreads all three evenly
     instead of keeping two leading and one trailing. The group plus `margin-left: auto`
     holds for any number on either side, and it renders in the same box as the ungrouped
     button did, so the card it replaced is pixel-identical. */
  .fab-library-card-footer {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-1);
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-mv2-border);
  }

  .fab-library-card-footer-end {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin-left: auto;
  }

  /* A disabled entry is DIMMED as well as badged — the badge carries the state, the dimming
     only reinforces it. */
  .fab-library-card.is-off .fab-library-card-body {
    opacity: 0.72;
  }

  /* The selection box is pinned into the top-right corner over the header. */
  .fab-library-card :global(.fab-selection-checkbox) {
    position: absolute;
    top: var(--fab-space-3);
    right: var(--fab-space-3);
  }
</style>
