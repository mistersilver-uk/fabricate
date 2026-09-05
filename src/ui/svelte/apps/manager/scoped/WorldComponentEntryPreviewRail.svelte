<!-- Svelte 5 runes mode -->
<!--
  The Component `How players see it` rail (issue 1371, maintainer parity round 4) —
  `proto:985-1020` on the world entry, `proto:1467-1500` on the system rules editor.

  == ONE RAIL, TWO SCREENS (issue 1371 r18-list, maintainer ruling M27) =====================
  The reference draws the two rails from ONE template: the entry's binds `d.en.pv` and the rules
  editor's binds `d.pr.pv`, and nothing else differs. The rules editor used to draw a rail of its
  own — a 64px medallion in a 90px box, a sans name, iconed micro chips — and the maintainer's
  live test found the two "using a different layout", which is exactly what a second
  implementation of one template does over time. So this file is the rail on BOTH screens, and
  the editor renders it in place of its own markup. `scope` is what the two screens say
  differently: the scope sentence under the head and the aside's accessible name. Everything the
  scope does not change is stated once, here, and cannot be restated somewhere else.

  The file keeps its name. Renaming it would touch the world entry, its suites and the naming
  gate that counts `World…` children for a change that moves no pixel, and the rail was the
  entry's first; the header records that it is no longer ONLY the entry's.

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
    // THE SCOPE THE RAIL SPEAKS FOR (issue 1371 r18-list, M27): `world` is the catalogue entry's
    // reading — `Across every system that has rules for it.` — and `system` is the rules editor's,
    // `What a player sees in {system}.` (`proto:1487`), naming the system through `systemLabel`.
    // `world` by default, so the entry passes nothing and renders byte for byte what it did.
    scope = 'world',
    systemLabel = '',
  } = $props();

  const systemScope = $derived(scope === 'system');
  const ariaLabel = $derived(
    systemScope
      ? text('FABRICATE.Admin.Manager.Component.Rail.Label', 'Player preview')
      : text(
          'FABRICATE.Admin.Manager.Scoped.Component.PreviewLabel',
          'How this component reaches the world'
        )
  );
  // `{system}` is substituted here rather than by a caller-supplied formatter: the two screens
  // that render this rail each carry the same four-line `replaceAll` helper, and a rail that took
  // a third copy as a prop would be asking every caller to agree on an interpolation contract for
  // one token.
  const scopeNote = $derived(
    systemScope
      ? text(
          'FABRICATE.Admin.Manager.Component.Rail.ScopeNote',
          'What a player sees in {system}.'
        ).replaceAll('{system}', String(systemLabel ?? ''))
      : text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.ScopeNote',
          'Across every system that has rules for it.'
        )
  );
</script>

<ScopedEntityPreview
  hookAttribute="data-scoped-entry-preview"
  {ariaLabel}
  kicker={text('FABRICATE.Admin.Manager.Scoped.Component.Entry.RailKicker', 'How players see it')}
  {scopeNote}
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
