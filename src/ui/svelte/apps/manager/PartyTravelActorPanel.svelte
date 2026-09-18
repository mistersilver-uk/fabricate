<!--
  The 210px travel-actor column of a World > Parties card: eyebrow, tile, and the anchored
  link/change control with its flipping actor picker. A separate unlink button is present whenever a
  travel actor is set, because the right-click affordance on the tile is not keyboard-reachable.

  Three things here are Fabricate's rather than the prototype's.

  1. The tile's UNLINKED state renders through `EmptyState` in its `compact` treatment, which
     `ui-integration/spec.md` requires of every manager "nothing here" message and forbids resizing
     per screen. The `<button>` WRAPS the primitive rather than being replaced by it, because
     `EmptyState` has no root handlers and no element prop, so replacing the button would lose
     click-to-open, right-click-to-open and the drop target. The wrapper therefore takes the button
     reset and owns the `is-drop-active` affordance.
  2. The LINKED state mirrors the compact metrics rather than the prototype's 38px tile, or linking
     an actor visibly shrinks the panel and swaps tile sizes in the same slot. The `min-height`, the
     fill and the radius hang on the WRAPPER — the slot both states occupy — so none of it reaches
     `EmptyState`'s chrome or its no-fill contract.
  3. The picker's candidate set is the GM-CONFIGURED player-character actor types, the same
     membership the member picker uses: a world's NPC roster is unbounded, and listing all of it
     buries the handful of actors that could stand for a party. Membership is read from the
     projected `isPlayerCharacter` flag, tested STRICTLY for the reason `PartyAddMemberPanel.svelte`
     documents. A DROP is deliberately unfiltered — it names one actor explicitly — and because that
     escape hatch exists the CURRENT travel actor is always offered even when ineligible, so the
     picker never hides the value it is opened to change. Each option's meta says where that actor
     already stands, which surfaces the composite-uniqueness collision before the pick fails.
-->
<script>
  import EmptyState from '../../components/EmptyState.svelte';
  import SearchablePopover from '../../components/SearchablePopover.svelte';
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

  // The eligible set, not the world roster — plus the CURRENT travel actor, always, even when it
  // is ineligible: a drop is unfiltered and the GM may have narrowed the configured types since, so
  // that is a state the panel can genuinely be in, and filtering it out would open the picker on a
  // list with nothing marked. Appended rather than merged into the filter, so the eligibility rule
  // stays exactly one predicate.
  const eligibleActors = $derived(
    actorOptions.filter((option) => option.isPlayerCharacter === true)
  );

  const offeredActors = $derived.by(() => {
    const current = party?.travelActorUuid
      ? actorOptions.find((option) => option.uuid === party.travelActorUuid)
      : null;
    if (!current || current.isPlayerCharacter === true) return eligibleActors;
    return [...eligibleActors, current];
  });

  const pickerOptions = $derived(
    offeredActors.map((option) => ({
      id: option.uuid,
      label: option.name,
      img: option.img || undefined,
      icon: option.img ? undefined : 'fas fa-user',
      meta: actorPlacements[option.uuid] || undefined,
      trailingIcon: option.uuid === party?.travelActorUuid ? 'fas fa-check' : undefined,
    }))
  );

  // THREE reasons in precedence order, mirroring `PartyAddMemberPanel`: an empty world and a world
  // whose actors are all of an unconfigured type are different problems with different fixes, and
  // collapsing them tells a GM staring at a world full of actors to search harder. TWO live here
  // (issue 1373) because both are facts about the WORLD; the SEARCH MISS is a fact about the
  // control and is `SearchablePopover`'s own predicate, which is what makes the distinction
  // `openspec/specs/design-system/spec.md` requires hold at all 24 call sites.
  const pickerEmptyHint = $derived(
    actorOptions.length === 0
      ? text(
          'FABRICATE.Admin.Manager.Travel.NoActorsInWorld',
          'No actors exist in this world yet — create an Actor first.'
        )
      : text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerNoEligibleActors',
          'No eligible actors'
        )
  );

  // The SEARCH MISS, stated here rather than left to the primitive's `No matches` default
  // because this panel lists actors and names them as such.
  const pickerNoMatchesHint = $derived(
    text(
      'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerNoMatches',
      'No actor matches your search.'
    )
  );

  // The explanation is the panel's BODY, not its title: it names a setting, which is prose, and
  // `EmptyState` sets a title as a serif heading with no width cap.
  const pickerEmptyDetail = $derived(
    actorOptions.length > 0 && eligibleActors.length === 0
      ? text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.PickerNoEligibleActorsDetail',
          'Fabricate offers the actor types listed under Player Character Actor Types in its module settings. Adding a type there also makes those actors eligible party members. You can still drag any actor onto the tile above to assign it directly.'
        )
      : ''
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
        emptyDetail={pickerEmptyDetail}
        noMatchesHint={pickerNoMatchesHint}
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

  /* The slot BOTH tile states occupy, so the panel does not resize on link/unlink. `height: auto`
     and the padding/border reset stop Foundry's fixed button height cropping the wrapped
     `EmptyState`, and the FILL and radius hang here rather than on `.is-linked` so the primitive's
     own chrome and no-fill contract stay untouched (Deviation 9).

     `align-items: stretch` is load-bearing: `.manager-empty` is a shrink-to-fit grid child, so
     under `center` a shorter localized string narrows the dashed panel inside a full-width button,
     and the `is-drop-active` ring on the BUTTON then rings a wider box than the panel. The linked
     state puts `center` back below, its children being a fixed tile over centred text. */
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

  /* The linked state mirrors `EmptyState`'s COMPACT metrics, so linking does not shrink it. */
  .manager-party-actor-tile.is-linked {
    box-sizing: border-box;
    align-items: center;
    padding: var(--fab-space-4) var(--fab-space-3);
    border: 1.5px dashed var(--fab-accent-border);
  }

  /* `.is-drop-active` lives in `styles/fabricate.css`, not here: the `dragDrop` ACTION adds it,
     never this template, so a scoped rule is pruned with a warning AND loses the affordance. */

  /* HAND-MAINTAINED COPY of `EmptyState`'s compact tile, because the linked state renders an actor
     and cannot reach that scoped block. An edit there not mirrored here makes the panel change
     size on link/unlink, which is the defect the mirroring exists to prevent. */
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
