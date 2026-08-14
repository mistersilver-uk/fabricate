<!-- Svelte 5 runes mode -->
<!--
  The contents of ONE World > Parties card — head plus body — rendered
  unconditionally for every party on the page. There is no accordion any more:
  selection drives the right inspector only and never gates a card's controls, so
  rename, enable/disable, delete, member add/remove/move and travel-actor
  link/unlink are all reachable without selecting the party first.

  Head: icon tile · always-editable name over a meta line · enable pill · delete.
  Body: `minmax(0, 1fr) 210px` — members on the left, the travel actor on the right.

  Three Fabricate rules the prototype has no equivalent of:

   - The enable pill is GATED on the travel actor (`ui-integration/spec.md:1601`,
     `gathering-and-harvesting` req 4, enforced at `GatheringPartyStore.js:272-273`).
     While the gate is closed it uses `aria-disabled` plus `aria-describedby` rather
     than `disabled`, because a `disabled` button is not keyboard-reachable and
     suppresses hover in some engines, which would make the hint invisible. The hint
     renders IN PLACE OF the meta line's "travel actor: none" fragment, not after it.
   - Delete routes through the shared confirm seam (`adminStore.deleteParty`), which
     names the party: deleting one drops its membership, its travel actor and its
     per-system current-realm overrides across every crafting system.
   - The realm-override control lives HERE, in the card's right column, not in the
     right inspector — `ui-integration/spec.md:1603-1604` pins every editing control
     including override Set/Clear to the centre column and declares the inspector a
     read-only evidence echo.

  Store validation errors are CARD-SCOPED: the pane records which card issued the
  failing mutation and passes the duplicate-member message down here for the member
  list and the duplicate-travel-actor message for the travel-actor panel.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import PartyNameField from './PartyNameField.svelte';
  import PartyMemberRow from './PartyMemberRow.svelte';
  import PartyAddMemberPanel from './PartyAddMemberPanel.svelte';
  import PartyTravelActorPanel from './PartyTravelActorPanel.svelte';
  import RealmOverridePicker from './RealmOverridePicker.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    party = null,
    parties = [],
    actorOptions = [],
    saving = false,
    systemId = '',
    systemRealms = [],
    // Root always supplies the real selected-system gate. Defaulting to available preserves
    // this component's established direct-mount/API behaviour for isolated consumers.
    realmOverridesAvailable = true,
    realmOverridesUnavailableHint = '',
    memberError = '',
    travelActorError = '',
    closeToken = 0,
    onRename = () => {},
    onSetEnabled = () => {},
    onDelete = () => {},
    onAddMember = () => {},
    onRemoveMember = () => {},
    onMoveMember = () => {},
    onSetTravelActor = () => {},
    onClearTravelActor = () => {},
    onSetRealmOverride = () => {},
    onClearRealmOverride = () => {},
  } = $props();

  let openMemberUuid = $state('');
  let adding = $state(false);

  // A page or page-size change closes every open drawer and add panel, so nothing
  // outlives the card that anchored it.
  $effect(() => {
    void closeToken;
    openMemberUuid = '';
    adding = false;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function memberUuidsOf(candidate) {
    if (Array.isArray(candidate?.memberActorUuids)) return candidate.memberActorUuids;
    return (candidate?.memberCards || []).map((member) => member.uuid);
  }

  const memberCards = $derived(party?.memberCards || []);
  const memberUuids = $derived(memberUuidsOf(party));
  const otherParties = $derived(parties.filter((other) => other.id !== party?.id));

  const memberCount = $derived(party?.memberCount ?? memberCards.length);
  const travelActorName = $derived(
    party?.travelActor?.name ||
      (party?.staleTravelActor
        ? text('FABRICATE.Admin.Manager.World.Parties.TravelActor.Stale', 'Stale travel actor')
        : '')
  );

  // The gate: a party with no travel actor cannot be enabled (req 4).
  const enableGated = $derived(party?.enabled !== true && !party?.travelActorUuid);
  const gateHintId = $derived(party ? `party-enable-gate-${party.id}` : '');
  const memberErrorId = $derived(memberError && party ? `party-member-error-${party.id}` : '');

  const memberCountLabel = $derived(
    memberCount === 1
      ? text('FABRICATE.Admin.Manager.World.Parties.MetaMembersOne', '1 member')
      : text('FABRICATE.Admin.Manager.World.Parties.MetaMembers', '{count} members').replace(
          '{count}',
          String(memberCount)
        )
  );
  const travelActorFragment = $derived(
    text('FABRICATE.Admin.Manager.World.Parties.MetaTravelActor', 'travel actor: {name}').replace(
      '{name}',
      travelActorName || text('FABRICATE.Admin.Manager.World.Parties.MetaTravelActorNone', 'none')
    )
  );
  const disabledSuffix = $derived(
    party?.enabled === true
      ? ''
      : text(
          'FABRICATE.Admin.Manager.World.Parties.MetaDisabledSuffix',
          ' · disabled, ignored by current-realm resolution'
        )
  );
  const enableGateHint = $derived(
    text(
      'FABRICATE.Admin.Manager.World.Parties.EnableNeedsTravelActor',
      'Assign a travel actor to enable this party.'
    )
  );

  // uuid -> the FIRST other party that lists it, by name.
  const otherPartyNameByUuid = $derived.by(() => {
    const map = {};
    for (const other of otherParties) {
      for (const uuid of memberUuidsOf(other)) {
        if (!map[uuid]) map[uuid] = other.name;
      }
    }
    return map;
  });

  // uuid -> where that actor already stands, for the travel-actor picker's meta line.
  // It surfaces a composite-uniqueness collision BEFORE the pick fails rather than after.
  const actorPlacements = $derived.by(() => {
    const map = {};
    for (const other of parties) {
      if (other.travelActorUuid && !map[other.travelActorUuid]) {
        map[other.travelActorUuid] = text(
          'FABRICATE.Admin.Manager.World.Parties.TravelActor.OptionTravelActorFor',
          'Travel actor for {name}'
        ).replace('{name}', other.name);
      }
    }
    for (const other of parties) {
      for (const uuid of memberUuidsOf(other)) {
        if (!map[uuid]) {
          map[uuid] = text(
            'FABRICATE.Admin.Manager.World.Parties.TravelActor.OptionInParty',
            'In {name}'
          ).replace('{name}', other.name);
        }
      }
    }
    return map;
  });

  function alsoInCount(uuid) {
    return otherParties.filter((other) => memberUuidsOf(other).includes(uuid)).length;
  }

  function moveTargetsFor(uuid) {
    return otherParties.map((other) => ({
      id: other.id,
      name: other.name,
      memberCount: other.memberCount ?? memberUuidsOf(other).length,
      enabled: other.enabled === true,
      alreadyMember: memberUuidsOf(other).includes(uuid),
    }));
  }

  function toggleMove(uuid) {
    openMemberUuid = openMemberUuid === uuid ? '' : uuid;
  }

  function moveMember(targetPartyId, uuid) {
    openMemberUuid = '';
    onMoveMember(party.id, targetPartyId, uuid);
  }

  function addMember(uuid) {
    onAddMember(party.id, uuid);
  }

  function overrideValue() {
    if (
      party?.overrideMode === 'manual' &&
      Array.isArray(party.overrideRealmIds) &&
      party.overrideRealmIds.length > 0
    ) {
      return party.overrideRealmIds[0];
    }
    return '';
  }

  function chooseOverride(realmId) {
    if (realmId) {
      onSetRealmOverride(party.id, systemId, [realmId]);
    } else {
      onClearRealmOverride(party.id, systemId);
    }
  }
</script>

{#if party}
  <div class="manager-party-head">
    <span class="manager-party-icon" aria-hidden="true"><i class="fas fa-users"></i></span>

    <div class="manager-party-identity">
      <PartyNameField
        name={party.name}
        disabled={saving}
        onRename={(name) => onRename(party.id, name)}
      />
      <div class="manager-party-meta">
        <span>{memberCountLabel}</span>
        <span> · </span>
        {#if enableGated}
          <span class="manager-party-gate-hint" id={gateHintId}>{enableGateHint}</span>
        {:else}
          <span>{travelActorFragment}</span>
        {/if}
        {#if disabledSuffix}<span>{disabledSuffix}</span>{/if}
      </div>
    </div>

    <button
      type="button"
      class="manager-party-enable-pill"
      class:is-on={party.enabled === true}
      data-manager-party-enable={party.id}
      aria-pressed={party.enabled === true}
      aria-disabled={enableGated ? 'true' : undefined}
      aria-describedby={enableGated ? gateHintId : undefined}
      disabled={saving}
      onclick={() => {
        if (enableGated) return;
        onSetEnabled(party.id, party.enabled !== true);
      }}
    >
      <i
        class={party.enabled === true ? 'fas fa-circle-check' : 'fas fa-circle-pause'}
        aria-hidden="true"
      ></i>
      <span
        >{party.enabled === true
          ? text('FABRICATE.Admin.Manager.World.Parties.Enabled', 'Enabled')
          : text('FABRICATE.Admin.Manager.World.Parties.Disabled', 'Disabled')}</span
      >
    </button>

    <button
      type="button"
      class="manager-party-delete"
      data-manager-party-delete={party.id}
      aria-label={text('FABRICATE.Admin.Manager.World.Parties.Delete', 'Delete party')}
      title={text('FABRICATE.Admin.Manager.World.Parties.Delete', 'Delete party')}
      disabled={saving}
      onclick={() => onDelete(party.id)}
    >
      <i class="fas fa-trash" aria-hidden="true"></i>
    </button>
  </div>

  <div class="manager-party-body" data-manager-party-body={party.id}>
    <div class="manager-party-members-col">
      {#if memberCards.length > 0}
        <ul
          class="manager-party-member-rows"
          data-manager-party-member-rows
          aria-describedby={memberErrorId || undefined}
        >
          {#each memberCards as member (member.uuid)}
            <PartyMemberRow
              {member}
              {saving}
              isTravelActor={!!party.travelActorUuid && member.uuid === party.travelActorUuid}
              alsoInCount={alsoInCount(member.uuid)}
              moveTargets={moveTargetsFor(member.uuid)}
              moving={openMemberUuid === member.uuid}
              onToggleMove={toggleMove}
              onMove={moveMember}
              onRemove={(uuid) => onRemoveMember(party.id, uuid)}
            />
          {/each}
        </ul>
      {:else}
        <EmptyState
          compact
          hint={text(
            'FABRICATE.Admin.Manager.World.Parties.Members.Empty',
            "No members yet. Only the travel actor's own location resolves until you add characters."
          )}
          dataAttr="data-manager-party-members-empty"
        />
      {/if}

      {#if adding}
        <PartyAddMemberPanel
          partyName={party.name}
          {actorOptions}
          {memberUuids}
          {otherPartyNameByUuid}
          {saving}
          onAdd={addMember}
          onClose={() => (adding = false)}
        />
      {:else}
        <button
          type="button"
          class="manager-party-add-open"
          data-manager-party-add-open={party.id}
          aria-describedby={memberErrorId || undefined}
          disabled={saving}
          onclick={() => (adding = true)}
        >
          <i class="fas fa-user-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.World.Parties.Members.Add', 'Add a member')}</span>
        </button>
      {/if}

      {#if memberError}
        <p class="manager-party-field-error" id={memberErrorId} role="alert">{memberError}</p>
      {/if}
    </div>

    <div class="manager-party-travel-col">
      <PartyTravelActorPanel
        {party}
        {actorOptions}
        {actorPlacements}
        {saving}
        {closeToken}
        errorMessage={travelActorError}
        onSet={onSetTravelActor}
        onClear={onClearTravelActor}
      />

      <div class="manager-party-override">
        {#if realmOverridesAvailable}
          <div class="manager-party-override-eyebrow">
            {text(
              'FABRICATE.Admin.Manager.World.Parties.Override.Eyebrow',
              'Current realm override'
            )}
          </div>
          <RealmOverridePicker
            value={overrideValue()}
            realms={systemRealms}
            disabled={saving}
            onChoose={(realmId) => chooseOverride(realmId)}
          />
        {:else}
          <p class="manager-party-override-unavailable" data-party-realm-override-unavailable>
            <span class="manager-party-override-eyebrow">
              {text(
                'FABRICATE.Admin.Manager.World.Parties.Override.Eyebrow',
                'Current realm override'
              )}
            </span>
            <span>{realmOverridesUnavailableHint}</span>
          </p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Theme-ROOT tokens only (`--fab-mv2-*` is declared on `.fabricate-manager`). Geometry
     is the prototype's: an 11px head gap over a `minmax(0,1fr) 210px` body at 12px. */
  .manager-party-head {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .manager-party-icon {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    color: var(--fab-accent);
    background: var(--fab-bg-0);
    font-size: 14px;
  }

  .manager-party-identity {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .manager-party-meta {
    overflow: hidden;
    color: var(--fab-text-muted);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-party-gate-hint {
    color: var(--fab-warning-text);
  }

  .manager-party-enable-pill {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 11px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-subtle);
    background: var(--fab-surface-soft);
    font-family: var(--font-primary);
    font-size: 10.5px;
    font-weight: 600;
  }

  .manager-party-enable-pill.is-on {
    border-color: var(--fab-success-border);
    color: var(--fab-success-text);
    background: var(--fab-success-soft);
  }

  .manager-party-enable-pill > i {
    font-size: 9px;
  }

  .manager-party-delete {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--fab-danger-border);
    border-radius: 8px;
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
    font-size: 11px;
  }

  .manager-party-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 210px;
    gap: 12px;
    margin-top: 11px;
  }

  .manager-party-members-col {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-party-member-rows {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-party-add-open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    height: auto;
    padding: 8px;
    border: 1px dashed var(--fab-border-strong);
    border-radius: 9px;
    color: var(--fab-text-secondary);
    background: none;
    font-family: var(--font-primary);
    font-size: 10.5px;
    font-weight: 600;
  }

  .manager-party-add-open > i {
    font-size: 9px;
  }

  .manager-party-field-error {
    margin: 0;
    color: var(--fab-danger-text);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.4;
  }

  .manager-party-travel-col {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-party-override {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .manager-party-override-eyebrow {
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .manager-party-override-unavailable {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0;
    color: var(--fab-text-muted);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.4;
  }

  @media (max-width: 720px) {
    .manager-party-body {
      grid-template-columns: 1fr;
    }
  }
</style>
