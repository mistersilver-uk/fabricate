<!-- Svelte 5 runes mode -->
<!--
  The 210px travel-actor column of a World > Parties card: eyebrow, tile, and the
  anchored link/change control with its flipping actor picker.

  Three things here are Fabricate's rather than the prototype's.

  1. The tile's UNLINKED state renders through `EmptyState` in its `compact`
     treatment, which `ui-integration/spec.md:174` requires of every manager "nothing
     here" message and `:182` forbids resizing per screen. The `<button>` WRAPS the
     primitive rather than being replaced by it, because `EmptyState` has no root
     handlers and no element prop: replacing the button would lose click-to-open,
     right-click-to-open and the drop target. The wrapper therefore takes the button
     reset (Foundry pins a fixed button height, which crops the panel) and owns the
     `is-drop-active` affordance, because after the wrap that class lands on the button
     while the dashed border lives inside the primitive's scoped style.
  2. The LINKED state mirrors the compact metrics (32px tile at radius 9, the same
     padding, gap and type) rather than the prototype's 38px tile, or linking an actor
     visibly shrinks the panel and swaps tile sizes in the same slot. The `min-height`,
     the prototype's `--fab-bg-1` fill and its radius all hang on the WRAPPER — the slot
     both states occupy — so the linked tile is filled as the prototype draws it without
     any of it reaching `EmptyState`'s chrome or its no-fill contract.
  3. The picker's candidate set is EVERY world actor, not only player characters — a
     travel actor is frequently a group token, vehicle or NPC. Its per-option meta says
     where that actor already stands ("Travel actor for X" / "In X"), which surfaces the
     composite-uniqueness collision before the pick fails instead of after.

  A separate unlink button is present whenever a travel actor is set, because the
  right-click affordance on the tile is not keyboard-reachable.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import SearchablePopover from './SearchablePopover.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';

  let {
    party = null,
    actorOptions = [],
    actorPlacements = {},
    saving = false,
    errorMessage = '',
    closeToken = 0,
    onSet = () => {},
    onClear = () => {},
  } = $props();

  let pickerOpen = $state(false);

  // A page or page-size change closes every open picker, so no popover outlives the
  // card that anchored it.
  $effect(() => {
    void closeToken;
    pickerOpen = false;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const actor = $derived(party?.travelActor || null);
  const stale = $derived(!actor && !!party?.staleTravelActor);
  const hasTravelActor = $derived(!!actor || stale);

  const errorId = $derived(errorMessage && party ? `party-travel-actor-error-${party.id}` : '');

  const actorName = $derived(
    actor?.name ||
      (stale
        ? text('FABRICATE.Admin.Manager.World.Parties.TravelActor.Stale', 'Stale travel actor')
        : '')
  );

  const pickerOptions = $derived(
    actorOptions.map((option) => ({
      id: option.uuid,
      label: option.name,
      img: option.img || undefined,
      icon: option.img ? undefined : 'fas fa-user',
      meta: actorPlacements[option.uuid] || undefined,
      trailingIcon: option.uuid === party?.travelActorUuid ? 'fas fa-check' : undefined,
    }))
  );

  const pickerEmptyHint = $derived(
    actorOptions.length === 0
      ? text(
          'FABRICATE.Admin.Manager.Travel.NoActorsInWorld',
          'No actors exist in this world yet — create an Actor first.'
        )
      : text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerNoMatches',
          'No actor matches your search.'
        )
  );

  const unlinkLabel = $derived(
    text('FABRICATE.Admin.Manager.World.Parties.TravelActor.Unlink', 'Unlink {name}').replace(
      '{name}',
      actorName
    )
  );

  function onTileDrop(data) {
    if (!party || !data || data.type !== 'Actor') return;
    const uuid = resolveDropUuid(data);
    if (uuid) onSet(party.id, uuid);
  }

  // Right-click UNLINKS a linked travel actor and OPENS the picker when none is
  // linked, exactly as the prototype does.
  function onTileContextMenu(event) {
    event?.preventDefault?.();
    if (!party) return;
    if (hasTravelActor) {
      onClear(party.id);
      return;
    }
    pickerOpen = true;
  }

  function unlink() {
    if (party) onClear(party.id);
    pickerOpen = false;
  }
</script>

{#if party}
  <div class="manager-party-actor-panel">
    <div class="manager-party-actor-eyebrow">
      {text('FABRICATE.Admin.Manager.World.Parties.TravelActor.Eyebrow', 'Travel actor')}
    </div>

    <button
      type="button"
      class="manager-party-actor-tile"
      class:is-linked={hasTravelActor}
      data-manager-party-travel-actor={party.id}
      aria-describedby={errorId || undefined}
      title={hasTravelActor
        ? text(
            'FABRICATE.Admin.Manager.World.Parties.TravelActor.TileLinkedTitle',
            'Click to change · right-click to unlink'
          )
        : text(
            'FABRICATE.Admin.Manager.World.Parties.TravelActor.TileUnlinkedTitle',
            'Click to search actors, or drag one here'
          )}
      disabled={saving}
      use:dragDrop={{ onDrop: onTileDrop, activeClass: 'is-drop-active', disabled: saving }}
      oncontextmenu={onTileContextMenu}
      onclick={() => (pickerOpen = true)}
    >
      {#if hasTravelActor}
        <span class="manager-party-actor-portrait" aria-hidden="true">
          {#if actor?.img}<img src={actor.img} alt="" />{:else}<i
              class={stale ? 'fas fa-triangle-exclamation' : 'fas fa-user'}
            ></i>{/if}
        </span>
        <span class="manager-party-actor-name" class:is-stale={stale}>{actorName}</span>
        <span class="manager-party-actor-note">
          {text(
            'FABRICATE.Admin.Manager.World.Parties.TravelActor.LinkedNote',
            'One actor stands for the whole party on the map.'
          )}
        </span>
      {:else}
        <EmptyState
          compact
          icon="fa-regular fa-circle-dot"
          title={text('FABRICATE.Admin.Manager.World.Parties.TravelActor.None', 'No travel actor')}
          hint={text(
            'FABRICATE.Admin.Manager.World.Parties.TravelActor.UnlinkedNote',
            'Pick the actor that represents this party on the map.'
          )}
          dataAttr="data-manager-party-travel-actor-empty"
        />
      {/if}
    </button>

    <div class="manager-party-actor-row">
      <SearchablePopover
        bind:open={pickerOpen}
        options={pickerOptions}
        value={party.travelActorUuid || ''}
        disabled={saving}
        inlineSearchTrigger
        pickerClass="manager-party-actor-picker"
        popoverClass="manager-travel-actor-popover"
        triggerClass="manager-party-actor-open"
        triggerIcon="fas fa-magnifying-glass"
        triggerLabel={hasTravelActor
          ? text('FABRICATE.Admin.Manager.World.Parties.TravelActor.Change', 'Change actor')
          : text('FABRICATE.Admin.Manager.World.Parties.TravelActor.Link', 'Link an actor')}
        triggerData={{ 'data-manager-party-actor-trigger': party.id }}
        showChevron={false}
        minWidth={268}
        maxWidth={268}
        maxHeight={280}
        triggerAriaLabel={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerLabel',
          'Choose a travel actor'
        )}
        dialogAriaLabel={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerLabel',
          'Choose a travel actor'
        )}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerSearchPlaceholder',
          'Search actors…'
        )}
        searchAriaLabel={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerSearchLabel',
          'Search actors'
        )}
        inlineCloseLabel={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerClose',
          'Close the actor search'
        )}
        popoverTitle={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerEyebrow',
          'Actors'
        )}
        showFilteredCount
        filteredCountTemplate={text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerCount',
          '{matched} of {total}'
        )}
        compactOptionRows
        emptyHint={pickerEmptyHint}
        onChoose={(uuid) => onSet(party.id, uuid)}
      />

      {#if hasTravelActor}
        <button
          type="button"
          class="manager-party-actor-unlink"
          data-manager-party-actor-unlink={party.id}
          aria-label={unlinkLabel}
          title={unlinkLabel}
          disabled={saving}
          onclick={unlink}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
        </button>
      {/if}
    </div>

    {#if errorMessage}
      <p class="manager-party-actor-error" id={errorId} role="alert">{errorMessage}</p>
    {/if}
  </div>
{/if}

<style>
  /* Theme-ROOT tokens only. */
  .manager-party-actor-panel {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }

  .manager-party-actor-eyebrow {
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* The slot BOTH tile states occupy, so the panel does not resize on link/unlink.
     `height: auto` and the padding/border reset are what stop Foundry's fixed button
     height from cropping the wrapped `EmptyState`.

     The FILL and the radius are the prototype's tile, measured like-for-like against its
     LINKED state, and they hang here rather than on `.is-linked` for two reasons: the
     wrapper is the slot, and `EmptyState`'s own chrome — its dashed border, its geometry
     and its no-fill contract — stays untouched, which Deviation 9 requires of the
     unlinked state.

     `align-items: stretch` is load-bearing, not tidiness. `.manager-empty` is a
     shrink-to-fit grid child, so under `center` a shorter localized string narrows the
     dashed panel inside a full-width button — and the `is-drop-active` ring, which lives
     on the BUTTON, then rings a wider box than the panel it is meant to outline. The
     linked state puts `center` back below, because its children are a fixed 32px tile
     over centred text rather than one full-width panel. */
  .manager-party-actor-tile {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: 100%;
    height: auto;
    min-height: 96px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: var(--fab-bg-1);
    text-align: inherit;
  }

  /* The linked state mirrors `EmptyState`'s COMPACT metrics — padding 16px 12px, a 6px
     stack gap, a 32px tile at radius 9, a 12px serif title and an 11px/1.5 body — so
     linking an actor does not visibly shrink the panel. */
  .manager-party-actor-tile.is-linked {
    box-sizing: border-box;
    align-items: center;
    padding: var(--fab-space-4) var(--fab-space-3);
    border: 1.5px dashed var(--fab-accent-border);
  }

  /* `.manager-party-actor-tile.is-drop-active` lives in `styles/fabricate.css`, not
     here: the class is added by the `dragDrop` ACTION, never by this template, so a
     scoped rule for it compiles to an "unused" comment with a `css_unused_selector`
     warning — which fails `scripts/check-svelte-warnings.mjs` AND silently deletes the
     affordance. */

  /* HAND-MAINTAINED COPY of `EmptyState.svelte:180-185`'s compact tile (32px at radius 9),
     because the linked state renders an actor rather than a no-state message and so cannot
     reach that scoped block. The two are the two halves of ONE slot: an edit to the
     primitive's compact tile that is not mirrored here makes the panel change size on
     link/unlink, which is the whole defect the mirroring exists to prevent. The font-size
     and colour are this file's own — the primitive's glyph rule is not a portrait frame. */
  .manager-party-actor-portrait {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    color: var(--fab-text-subtle);
    background: var(--fab-surface-soft);
    font-size: 14px;
    overflow: hidden;
  }

  .manager-party-actor-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-party-actor-name {
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-serif);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-party-actor-name.is-stale {
    color: var(--fab-warning-text);
  }

  .manager-party-actor-note {
    max-width: 100%;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    text-align: center;
  }

  .manager-party-actor-row {
    position: relative;
    display: flex;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-party-actor-unlink {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-danger-text);
    background: var(--fab-surface-soft);
    font-size: 10px;
  }

  .manager-party-actor-error {
    margin: 0;
    color: var(--fab-danger-text);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.4;
  }
</style>
