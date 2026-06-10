<!-- Svelte 5 runes mode -->
<!--
  Expanded accordion body for a selected party on the Travel > Parties tab.
  Split into two columns: members (2/3) on the left and the travel marker (1/3)
  on the right.

  - Members: an inline searchable list of `character` actors (excluding current
    members) to add, then the member rows (portrait, name, a move-to-party
    popover, and a remove button). Adding routes through onAddMember, which the
    store implements as add-or-confirm-move.
  - Travel marker: a drop zone that accepts any dragged actor to set/replace the
    marker (shows the actor portrait when set). Right-click or the Clear button
    removes the linkage.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';
  import SearchablePopover from './SearchablePopover.svelte';
  import PartyNameField from './PartyNameField.svelte';

  let {
    party = null,
    parties = [],
    actorOptions = [],
    saving = false,
    onRename = () => {},
    onAddMember = () => {},
    onRemoveMember = () => {},
    onMoveMember = () => {},
    onSetTravelActor = () => {},
    onClearTravelActor = () => {}
  } = $props();

  const FALLBACK_PORTRAIT = 'fas fa-user';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const memberUuids = $derived(new Set((party?.memberCards || []).map(member => member.uuid)));
  const addableOptions = $derived(
    actorOptions
      .filter(actor => actor.type === 'character' && !memberUuids.has(actor.uuid))
      .map(actor => ({
        id: actor.uuid,
        label: actor.name,
        img: actor.img || undefined,
        icon: actor.img ? undefined : 'fas fa-user'
      }))
  );
  const addEmptyHint = $derived(
    addableOptions.length === 0
      ? text('FABRICATE.Admin.Manager.Travel.Members.NoActors', 'No character actors exist in this world yet.')
      : text('FABRICATE.Admin.Manager.Travel.Members.NoAddMatches', 'No characters match your search.')
  );

  const moveTargets = $derived(
    parties
      .filter(other => other.id !== party?.id)
      .map(other => ({ id: other.id, label: other.name, icon: 'fas fa-people-group' }))
  );

  const hasMarker = $derived(!!party?.travelActor || !!party?.staleTravelActor);

  function onMarkerDrop(data) {
    if (!party || !data || data.type !== 'Actor') return;
    const uuid = resolveDropUuid(data);
    if (uuid) onSetTravelActor(party.id, uuid);
  }

  function clearMarker(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (party) onClearTravelActor(party.id);
  }

  function onMarkerMouseDown(event) {
    if (event.button === 2) clearMarker(event);
  }
</script>

{#if party}
  <div class="manager-party-body" data-manager-party-body={party.id}>
    <section class="manager-party-members" aria-label={text('FABRICATE.Admin.Manager.Travel.Members.SectionLabel', 'Party members')}>
      <div class="manager-party-members-head">
        <PartyNameField
          name={party.name}
          disabled={saving}
          onRename={(name) => onRename(party.id, name)}
        />
        <div class="manager-party-add" data-manager-party-add>
          <span class="manager-card-subtitle">{text('FABRICATE.Admin.Manager.Travel.Members.AddLabel', 'Add members')}</span>
          <SearchablePopover
            options={addableOptions}
            disabled={saving}
            triggerClass="manager-button manager-party-add-trigger"
            triggerIcon="fas fa-user-plus"
            triggerLabel={text('FABRICATE.Admin.Manager.Travel.Members.AddTrigger', 'Add member')}
            showChevron={false}
            triggerAriaLabel={text('FABRICATE.Admin.Manager.Travel.Members.AddLabel', 'Add members')}
            dialogAriaLabel={text('FABRICATE.Admin.Manager.Travel.Members.AddLabel', 'Add members')}
            searchPlaceholder={text('FABRICATE.Admin.Manager.Travel.Members.AddSearchPlaceholder', 'Search characters...')}
            searchAriaLabel={text('FABRICATE.Admin.Manager.Travel.Members.AddSearchLabel', 'Search characters to add')}
            emptyHint={addEmptyHint}
            onChoose={(uuid) => onAddMember(party.id, uuid)}
          />
        </div>
      </div>

      <ul class="manager-party-member-rows" data-manager-party-member-rows>
        {#each party.memberCards as member (member.uuid)}
          <li class={`manager-party-member-row ${member.stale ? 'is-stale' : ''}`} data-member-uuid={member.uuid}>
            <span class="manager-travel-portrait" aria-hidden="true">
              {#if member.img}<img src={member.img} alt="" />{:else}<i class={FALLBACK_PORTRAIT}></i>{/if}
            </span>
            <span class="manager-party-member-name">
              {member.stale
                ? text('FABRICATE.Admin.Manager.Travel.StaleMemberLabel', 'Stale member')
                : member.name}
            </span>
            <div class="manager-party-member-actions">
              {#if !member.stale}
                <SearchablePopover
                  options={moveTargets}
                  disabled={saving || moveTargets.length === 0}
                  triggerClass="manager-icon-button"
                  triggerIcon="fas fa-arrow-right-arrow-left"
                  showChevron={false}
                  triggerAriaLabel={text('FABRICATE.Admin.Manager.Travel.Members.MoveLabel', 'Move member to another party')}
                  dialogAriaLabel={text('FABRICATE.Admin.Manager.Travel.Members.MoveLabel', 'Move member to another party')}
                  searchPlaceholder={text('FABRICATE.Admin.Manager.Travel.Members.MoveSearchPlaceholder', 'Search parties...')}
                  searchAriaLabel={text('FABRICATE.Admin.Manager.Travel.Members.MoveSearchLabel', 'Search parties')}
                  emptyHint={text('FABRICATE.Admin.Manager.Travel.Members.NoOtherParties', 'No other parties to move to.')}
                  onChoose={(targetId) => onMoveMember(party.id, targetId, member.uuid)}
                />
              {/if}
              <button
                type="button"
                class="manager-icon-button is-danger"
                aria-label={text('FABRICATE.Admin.Manager.Travel.Members.RemoveLabel', 'Remove member')}
                title={text('FABRICATE.Admin.Manager.Travel.Members.RemoveLabel', 'Remove member')}
                disabled={saving}
                onclick={() => onRemoveMember(party.id, member.uuid)}
              >
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>
          </li>
        {:else}
          <li class="manager-party-member-empty">
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Members.Empty', 'No members yet.')}</p>
          </li>
        {/each}
      </ul>
    </section>

    <section class="manager-party-travel-marker" aria-label={text('FABRICATE.Admin.Manager.Travel.Marker.SectionLabel', 'Travel marker')}>
      <span class="manager-card-subtitle">{text('FABRICATE.Admin.Manager.Travel.Marker.Label', 'Travel marker')}</span>
      <div
        class="manager-party-marker-dropzone"
        data-manager-party-marker
        role="button"
        tabindex="0"
        aria-label={text('FABRICATE.Admin.Manager.Travel.Marker.DropLabel', 'Drop an actor to set the travel marker')}
        title={text('FABRICATE.Admin.Manager.Travel.Marker.DropHint', 'Drag an actor here to set the travel marker. Right-click to clear.')}
        use:dragDrop={{ onDrop: onMarkerDrop, activeClass: 'is-drop-active', disabled: saving }}
        oncontextmenu={clearMarker}
        onmousedown={onMarkerMouseDown}
      >
        {#if party.travelActor}
          <span class="manager-party-marker-portrait" aria-hidden="true">
            {#if party.travelActor.img}<img src={party.travelActor.img} alt="" />{:else}<i class={FALLBACK_PORTRAIT}></i>{/if}
          </span>
          <span class="manager-party-marker-name">{party.travelActor.name}</span>
        {:else if party.staleTravelActor}
          <span class="manager-party-marker-name is-stale">{text('FABRICATE.Admin.Manager.Travel.StaleTravelActorLabel', 'Stale travel actor')}</span>
        {:else}
          <i class="fas fa-hand-pointer manager-party-marker-icon" aria-hidden="true"></i>
          <span class="manager-party-marker-hint">{text('FABRICATE.Admin.Manager.Travel.Marker.Empty', 'Drag an actor here')}</span>
        {/if}
      </div>
      <button
        type="button"
        class="manager-button manager-party-marker-clear"
        disabled={saving || !hasMarker}
        onclick={() => onClearTravelActor(party.id)}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Travel.Marker.Clear', 'Clear')}</span>
      </button>
    </section>
  </div>
{/if}
