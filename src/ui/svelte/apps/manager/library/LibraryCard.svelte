<!--
  ONE library GRID CARD, shared by every studio: header (media + name, optional subtitle), badges,
  description, a recessed facts well, a divider, then a footer of leading and trailing actions. That
  order is the Recipe Studio prototype's, and the order IS what is being shared.

  Fixed vocabulary is a PROP (`name`, `subtitle`, `description`, `facts`); anything whose CONTENT is
  studio-specific is a SNIPPET, so this never imports a studio's chips nor grows a branch per studio.
  It emits its own `fab-library-card-*` classes AND the studio's `rootClass` / `identityClass`,
  because the smoke walk, the View Lab cases and `managerLayoutGuards` navigate by studio selectors.

  The root `<li>` takes no handler: the selecting `<button>` wraps only the non-interactive body, and
  the selection box and footer controls are its SIBLINGS, because an interactive element nested in a
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
    // The recessed well: [{ id, label, tone, title, attrs, class }]. `tone` is 'muted' (default),
    // 'strong' for the leading stat, or the semantic 'warning' / 'danger' / 'success', which
    // resolve to the same tokens `Chip` uses.
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
        <!-- Only when a studio HAS one, so a studio without reserves no space and keeps its height. -->
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
  /* The card SHELL only. The row skin, hover and `.is-selected` ring stay in `styles/fabricate.css`
     keyed off the studio's `rootClass`, so its cards and its list rows signal selection alike. */
  .fab-library-card {
    position: relative;
    display: flex;
    /* Inherited from the studio row rule this grew out of; declared, not dropped, so the card
       computes identically to the row it replaced. */
    flex-wrap: wrap;
    flex-direction: column;
    align-items: stretch;
    min-height: 0;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    list-style: none;
  }

  /* The manager's `<button>` reset is joined to the studio identity classes in
     `styles/fabricate.css` — it must beat Foundry's host geometry; this only stacks the rows. */
  .fab-library-card-body {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
  }

  /* `padding-right` reserves the corner the absolute selection box occupies. */
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

  /* The reserved min-height keeps a card with no badges as tall as one with. */
  .fab-library-card-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-height: 1.35rem;
  }

  /* A fixed 2-line box, so the well and the footer land at one offset and a shelf stays level. */
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

  /* A RECESSED well: `--fab-bg-1` over `--fab-border` is the inspector stat-tile idiom, which the
     prototype measures to as well. */
  .fab-library-card-facts {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    white-space: nowrap;
  }

  /* `muted` is the container default and needs no rule. The semantic three are the same
     `--fab-<tone>-text` tokens `Chip` answers to, so a studio colours a stat by NAMING a tone
     rather than inventing a colour at the call site. */
  .fab-library-card-fact.is-strong {
    color: var(--fab-text);
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
    background: var(--fab-border);
  }

  /* Trailing actions are GROUPED rather than relying on `space-between`, which is equivalent only
     at exactly two children: a third action would spread all three evenly instead of keeping two
     leading and one trailing. The group plus `margin-left: auto` holds for any number. */
  .fab-library-card-footer {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-1);
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
  }

  .fab-library-card-footer-end {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin-left: auto;
  }

  /* Dimmed as well as badged: the badge carries the state, the dimming reinforces it. */
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
