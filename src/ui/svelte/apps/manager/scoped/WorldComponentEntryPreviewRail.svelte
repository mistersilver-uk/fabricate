<!-- Svelte 5 runes mode -->
<!--
  The Component `How players see it` rail (issue 1371) — `proto:985-1020` on the world entry,
  `proto:1467-1500` on the system rules editor.

  ONE RAIL, TWO SCREENS (M27), from one template; the editor's second implementation had already
  drifted into a different layout. `scope` is the only thing the two screens say differently.
  It is the GRID'S SECOND COLUMN, not a child of the scroller, which went blank on scroll. It
  answers `HOW PLAYERS SEE IT`, not `World record`, so it draws the inventory tile, what USES the
  component and what PRODUCES it. The live footer is the shell's TRAILING snippet, because
  `ScopedEntityPreview` draws `liveNote` above the fact groups and the reference draws it below.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EssenceChip from '../components/EssenceChip.svelte';
  import ScopedEntityPreview from './ScopedEntityPreview.svelte';

  let {
    name = '',
    image = '',
    icon = 'fas fa-cube',
    categoryLabel = '',
    tags = [],
    // THE ESSENCES A PLAYER MEETS (M31): chip rows from `componentEssenceChips`, over the map
    // each screen states — the entry its draft's world map, the editor the map this system
    // resolves. Empty by default, so a caller that passes nothing renders what it did.
    essences = [],
    linked = true,
    factGroups = [],
    text = (key, fallback) => fallback,
    // THE SCOPE THE RAIL SPEAKS FOR (M27): `world` is the entry's reading and `system` the rules
    // editor's, `What a player sees in {system}.` (`proto:1487`). `world` by default.
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
  // `{system}` is substituted here rather than by a caller-supplied formatter: a third copy of
  // the same four-line helper would make every caller agree an interpolation contract for one token.
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
          <!-- THE STATUS BADGE IS THE ONE STATE A PLAYER-FACING TILE CANNOT HIDE (`proto:992`):
               the one that explains a missing picture, a record with no linked item at all. -->
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
        <!-- THE ESSENCE RUN, under the tags and on the tag run's layout rule (M29): the one
             behaviour fact a player-facing tile states, drawn from the map the card beside it
             authors, so the preview follows the draft. -->
        {#if essences.length > 0}
          <div class="manager-component-entry-preview-tags" data-scoped-entry-preview-essences>
            {#each essences as essence (essence.id)}
              <EssenceChip {essence} showName />
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
