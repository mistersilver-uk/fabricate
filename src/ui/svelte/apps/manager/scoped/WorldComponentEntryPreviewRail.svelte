<!-- Svelte 5 runes mode -->
<!--
  The world Component entry's player-preview rail (issue 1371, maintainer parity round 4) —
  `proto:985-1020`.

  == IT IS THE GRID'S SECOND COLUMN, NOT A CHILD OF THE SCROLLER =============================
  The page places it; this file only says what is in it. Round 3 nested the rail inside the
  Definition tab's scrolling panel, so scrolling to the systems card left it blank, and the
  Validation tab had no rail at all.

  == `HOW PLAYERS SEE IT`, NOT `WORLD RECORD` ================================================
  The rail answers one question — what a player meets in their inventory — so it draws an
  inventory TILE with the quantity badge, the resolved category, the effective tag chips and
  the art note, then what USES the component and what PRODUCES it. Round 3 drew the world
  DEFAULTS list, which is the same three values the cards beside it already author.

  == THE LIVE FOOTER IS THE SHELL'S TRAILING SNIPPET ========================================
  `ScopedEntityPreview` draws its own `liveNote` region ABOVE the fact groups and the reference
  draws it BELOW them, so this rail passes no `liveNote` and renders the strip as the trailing
  snippet instead. It keeps the shell's own class and hook, so the shipped rule that paints it
  and every selector naming it still resolve.
-->
<script>
  import Chip from '../Chip.svelte';
  import ScopedEntityPreview from './ScopedEntityPreview.svelte';

  let {
    name = '',
    image = '',
    icon = 'fas fa-cube',
    categoryLabel = '',
    tags = [],
    linked = true,
    factGroups = [],
    text = (key, fallback) => fallback,
  } = $props();
</script>

<ScopedEntityPreview
  hookAttribute="data-scoped-entry-preview"
  ariaLabel={text(
    'FABRICATE.Admin.Manager.Scoped.Component.PreviewLabel',
    'How this component reaches the world'
  )}
  kicker={text('FABRICATE.Admin.Manager.Scoped.Component.Entry.RailKicker', 'How players see it')}
  scopeNote={text(
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.ScopeNote',
    'Across every system that has rules for it.'
  )}
  scopeNoteHook="data-scoped-entry-preview-scope-note"
  {factGroups}
  ruleHookAttribute="data-scoped-entry-preview-rule"
>
  {#snippet tile()}
    <div class="manager-component-entry-preview-head" data-scoped-entry-preview-identity>
      <div class="manager-component-entry-preview-tile-column">
        <p class="manager-component-entry-preview-tile-label">
          {text('FABRICATE.Admin.Manager.Scoped.Component.Entry.TileLabel', 'As an inventory tile')}
        </p>
        <div class="manager-component-entry-preview-tile" data-scoped-entry-preview-tile>
          <span class="manager-component-entry-preview-quantity"
            >{text('FABRICATE.Admin.Manager.Scoped.Component.Entry.TileQuantity', '×1')}</span
          >
          {#if image}
            <img src={image} alt="" />
          {:else}
            <i class={icon} aria-hidden="true"></i>
          {/if}
          <!-- THE STATUS BADGE IS THE ONE STATE A PLAYER-FACING TILE CANNOT HIDE. `proto:992`
               draws a badge slot on the tile and leaves it empty for a healthy record; the state
               that HAS to be on the tile is the one that explains a missing picture, which is a
               record with no linked item at all. -->
          {#if !linked}
            <span class="manager-component-entry-preview-status" data-scoped-entry-preview-status
              >{text('FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked', 'No source item')}</span
            >
          {/if}
        </div>
        <p class="manager-component-entry-preview-name" title={name}>{name}</p>
      </div>
      <div class="manager-component-entry-preview-facts">
        <p class="manager-component-entry-preview-category" data-scoped-entry-preview-category>
          {categoryLabel}
        </p>
        {#if tags.length > 0}
          <div class="manager-component-entry-preview-tags" data-scoped-entry-preview-tags>
            {#each tags as tag (tag)}
              <Chip tone="tag">{tag}</Chip>
            {/each}
          </div>
        {/if}
        <p class="manager-component-entry-preview-art">
          {linked
            ? text(
                'FABRICATE.Admin.Manager.Scoped.Component.Entry.ArtNote',
                'Art, name and description come from the linked item.'
              )
            : text(
                'FABRICATE.Admin.Manager.Scoped.Component.Entry.ArtNoteUnlinked',
                'No linked item, so players see the catalogue name and no art.'
              )}
        </p>
      </div>
    </div>
  {/snippet}

  <aside class="manager-scoped-preview-live" data-scoped-entry-preview-live>
    <i class="fas fa-circle-check" aria-hidden="true"></i><span
      >{text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.LiveNote',
        'This preview updates live as you edit.'
      )}</span
    >
  </aside>
</ScopedEntityPreview>
