<!-- Svelte 5 runes mode -->
<!--
  GatheringTravelView is the center-column surface for the gathering `Travel`
  route (issue 257, first slice). It manages WORLD-LEVEL Fabricate parties
  (create/rename/enable/members/travel actor) plus the PER-SYSTEM current-realm
  override for the selected crafting system. The right inspector renders a
  read-only evidence echo; all editing controls live here so override editing
  exists in exactly one place.

  All actor pickers follow the accessible semantics established by
  ActorSelectTopBar.svelte (searchable popover, listbox options, keyboard-
  reachable buttons). Inline validation errors come from the party store and are
  associated with the relevant control via aria-invalid + aria-describedby.

  Disclosure: this surface is GM-only, but it still routes realm labels through
  the store-provided realm records. Secret undiscovered realm names/ids belong
  to the player surface, not here; the redaction guard test asserts that even if
  a secret realm is present in evidence the view never leaks identity through a
  player-facing channel beyond what the GM is permitted to see.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import GatheringRealmQuickList from './GatheringRealmQuickList.svelte';

  let {
    parties = [],
    selectedPartyId = '',
    systemId = '',
    saving = false,
    error = null,
    fieldErrors = {},
    actorOptions = [],
    systemRealms = [],
    biomeOptions = [],
    onSelectParty = () => {},
    onCreateParty = () => {},
    onRenameParty = () => {},
    onSetPartyEnabled = () => {},
    onDeleteParty = () => {},
    onAddMember = () => {},
    onRemoveMember = () => {},
    onMoveMember = () => {},
    onSetTravelActor = () => {},
    onClearTravelActor = () => {},
    onSetRealmOverride = () => {},
    onClearRealmOverride = () => {},
    onRemoveStaleMember = () => {},
    onClearStaleTravelActor = () => {},
    onDropStaleOverrideRealm = () => {},
    onCreateRealm = () => {},
    onRenameRealm = () => {},
    onToggleRealmEnabled = () => {},
    onUpdateRealm = () => {},
    onDeleteRealm = () => {},
    onPickImagePath = null
  } = $props();

  const FALLBACK_PORTRAIT_ICON = 'fas fa-user';

  let memberPickerOpen = $state(false);
  let memberSearch = $state('');
  let memberPickerRoot = $state(null);
  let memberSearchInput = $state(null);

  let travelPickerOpen = $state(false);
  let travelSearch = $state('');
  let travelPickerRoot = $state(null);
  let travelSearchInput = $state(null);

  let pendingOverrideIds = $state(null);

  const selectedParty = $derived(parties.find(party => party.id === selectedPartyId) || null);
  const hasActors = $derived(actorOptions.length > 0);
  const hasParties = $derived(parties.length > 0);
  const hasRealms = $derived(systemRealms.length > 0);

  // Realm selection for the override editor is local while the GM is choosing,
  // and falls back to the persisted override ids when not mid-edit.
  const overrideRealmIds = $derived(
    pendingOverrideIds !== null
      ? pendingOverrideIds
      : (selectedParty?.overrideRealmIds || [])
  );

  function text(key, fallback, data) {
    const translated = localize(key, data);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function hasImg(actor) {
    return typeof actor?.img === 'string' && actor.img.trim() !== '';
  }

  function memberCountLabel(party) {
    return party.memberCount === 1
      ? text('FABRICATE.Admin.Manager.Travel.MemberCountOne', '1 member')
      : text('FABRICATE.Admin.Manager.Travel.MemberCount', `${party.memberCount} members`, { count: party.memberCount });
  }

  function selectParty(partyId) {
    pendingOverrideIds = null;
    onSelectParty(partyId);
  }

  function commitRename(event) {
    if (!selectedParty) return;
    const value = event.currentTarget.value.trim();
    if (!value || value === selectedParty.name) return;
    onRenameParty(selectedParty.id, value);
  }

  // --- Member picker (searchable popover, ActorSelectTopBar semantics) ---
  const availableMemberActors = $derived(
    actorOptions.filter(actor => !(selectedParty?.memberActorUuids || []).includes(actor.uuid))
  );
  const filteredMemberActors = $derived(
    availableMemberActors.filter(actor => {
      const term = memberSearch.trim().toLowerCase();
      if (!term) return true;
      return String(actor?.name ?? '').toLowerCase().includes(term);
    })
  );

  function closeMemberPicker() {
    memberPickerOpen = false;
    memberSearch = '';
  }
  function toggleMemberPicker() {
    if (!hasActors) return;
    memberPickerOpen = !memberPickerOpen;
    if (!memberPickerOpen) memberSearch = '';
  }
  function chooseMember(actor) {
    if (!selectedParty) return;
    onAddMember(selectedParty.id, actor.uuid);
    closeMemberPicker();
  }

  // --- Travel actor picker ---
  const filteredTravelActors = $derived(
    actorOptions.filter(actor => {
      const term = travelSearch.trim().toLowerCase();
      if (!term) return true;
      return String(actor?.name ?? '').toLowerCase().includes(term);
    })
  );
  function closeTravelPicker() {
    travelPickerOpen = false;
    travelSearch = '';
  }
  function toggleTravelPicker() {
    if (!hasActors) return;
    travelPickerOpen = !travelPickerOpen;
    if (!travelPickerOpen) travelSearch = '';
  }
  function chooseTravelActor(actor) {
    if (!selectedParty) return;
    onSetTravelActor(selectedParty.id, actor.uuid);
    closeTravelPicker();
  }

  // --- Override realm multi-select ---
  function toggleOverrideRealm(realmId) {
    const current = overrideRealmIds.slice();
    const index = current.indexOf(realmId);
    if (index >= 0) current.splice(index, 1);
    else current.push(realmId);
    pendingOverrideIds = current;
  }
  function commitOverride() {
    if (!selectedParty) return;
    onSetRealmOverride(selectedParty.id, systemId, overrideRealmIds);
    pendingOverrideIds = null;
  }
  function clearOverride() {
    if (!selectedParty) return;
    pendingOverrideIds = null;
    onClearRealmOverride(selectedParty.id, systemId);
  }

  function evidenceSourceLabel(source) {
    if (source === 'manualOverride') return text('FABRICATE.Admin.Manager.Travel.EvidenceSourceManualOverride', 'GM override');
    if (source === 'travelActor') return text('FABRICATE.Admin.Manager.Travel.EvidenceSourceTravelActor', 'Travel actor');
    return text('FABRICATE.Admin.Manager.Travel.EvidenceSourceUnresolved', 'No current realm');
  }

  $effect(() => {
    if (!memberPickerOpen || !memberSearchInput) return;
    queueMicrotask(() => memberSearchInput?.focus());
  });
  $effect(() => {
    if (!travelPickerOpen || !travelSearchInput) return;
    queueMicrotask(() => travelSearchInput?.focus());
  });

  // Reset transient picker/override edit state when the selected party changes.
  let lastPartyId = $state('');
  $effect(() => {
    if (selectedPartyId === lastPartyId) return;
    lastPartyId = selectedPartyId;
    memberPickerOpen = false;
    travelPickerOpen = false;
    memberSearch = '';
    travelSearch = '';
  });
</script>

<main class="manager-main manager-travel-view" data-manager-travel-view aria-label={text('FABRICATE.Admin.Manager.Travel.Title', 'Travel')}>
  <p class="manager-travel-scope-note">{text('FABRICATE.Admin.Manager.Travel.WorldScopeNote', 'Parties are shared across every crafting system. Only the current-realm override below is specific to this system.')}</p>

  {#if error}
    <p class="manager-travel-error" role="alert">{error}</p>
  {/if}

  <div class="manager-travel-layout">
    <!-- Party list column -->
    <section class="manager-travel-party-list" aria-label={text('FABRICATE.Admin.Manager.Travel.PartyListLabel', 'Parties')}>
      <div class="manager-travel-party-list-head">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Travel.PartyListLabel', 'Parties')}</h3>
        <button type="button" class="manager-button is-primary" disabled={saving} onclick={() => onCreateParty()}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Travel.CreateParty', 'Create party')}</span>
        </button>
      </div>

      {#if !hasParties}
        <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.PartyListEmpty', 'No parties yet.')}</p>
      {:else}
        <ul class="manager-travel-party-rows">
          {#each parties as party (party.id)}
            <li>
              <button
                type="button"
                class={`manager-travel-party-row ${party.id === selectedPartyId ? 'is-active' : ''}`}
                aria-current={party.id === selectedPartyId ? 'true' : undefined}
                data-party-id={party.id}
                onclick={() => selectParty(party.id)}
              >
                <span class="manager-travel-party-name">{party.name}</span>
                <span class="manager-travel-party-meta">
                  <span class={`manager-chip ${party.enabled ? 'is-active' : 'is-disabled'}`}>
                    {party.enabled
                      ? text('FABRICATE.Admin.Manager.Travel.EnabledChip', 'Enabled')
                      : text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}
                  </span>
                  <span class="manager-chip">{memberCountLabel(party)}</span>
                  {#if party.hasStaleReference}
                    <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Travel.StaleBadge', 'Needs repair')}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Selected-party / setup panel -->
    <section class="manager-travel-panel">
      {#if !hasParties}
        <!-- Setup checklist empty state -->
        <div class="manager-travel-checklist" aria-label={text('FABRICATE.Admin.Manager.Travel.ChecklistTitle', 'Set up location-aware gathering')}>
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Travel.ChecklistTitle', 'Set up location-aware gathering')}</h3>
          <ol class="manager-travel-checklist-steps">
            <li>{text('FABRICATE.Admin.Manager.Travel.ChecklistStep1', 'Create at least one realm.')}</li>
            <li>{text('FABRICATE.Admin.Manager.Travel.ChecklistStep2', 'Create a party.')}</li>
            <li>{text('FABRICATE.Admin.Manager.Travel.ChecklistStep3', 'Add actor members.')}</li>
            <li>{text('FABRICATE.Admin.Manager.Travel.ChecklistStep4', 'Assign a travel actor.')}</li>
            <li>{text('FABRICATE.Admin.Manager.Travel.ChecklistStep5', "Set the party's current realm.")}</li>
          </ol>
        </div>
      {:else if !selectedParty}
        <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.SelectPartyHint', 'Select a party to manage its members, travel actor, and current realm.')}</p>
      {:else}
        <!-- Rename + enable -->
        <div class="manager-travel-party-head">
          <label class="manager-field manager-travel-rename">
            <span class="manager-field-label">{text('FABRICATE.Admin.Manager.Travel.RenameLabel', 'Party name')}</span>
            <input
              value={selectedParty.name}
              placeholder={text('FABRICATE.Admin.Manager.Travel.RenamePlaceholder', 'Party name')}
              aria-label={text('FABRICATE.Admin.Manager.Travel.RenameLabel', 'Party name')}
              onblur={commitRename}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>

          <div class="manager-travel-enable">
            <button
              type="button"
              class={`manager-travel-status-toggle ${selectedParty.enabled ? 'is-on' : 'is-off'}`}
              aria-pressed={selectedParty.enabled}
              aria-label={text('FABRICATE.Admin.Manager.Travel.EnableToggleLabel', 'Enable party')}
              disabled={saving || (!selectedParty.enabled && !selectedParty.travelActorUuid)}
              onclick={() => onSetPartyEnabled(selectedParty.id, !selectedParty.enabled)}
            >
              {selectedParty.enabled
                ? text('FABRICATE.Admin.Manager.Travel.EnabledChip', 'Enabled')
                : text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}
            </button>
            {#if !selectedParty.travelActorUuid}
              <p class="manager-travel-hint">{text('FABRICATE.Admin.Manager.Travel.EnableToggleHint', 'Assign a travel actor to enable this party.')}</p>
            {/if}
          </div>

          <button type="button" class="manager-button is-danger" disabled={saving} onclick={() => onDeleteParty(selectedParty.id)}>
            <i class="fas fa-trash" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Travel.DeleteParty', 'Delete party')}</span>
          </button>
        </div>

        <!-- Members -->
        <section class="manager-travel-members" aria-label={text('FABRICATE.Admin.Manager.Travel.MembersLabel', 'Members')}>
          <h4 class="manager-card-subtitle">{text('FABRICATE.Admin.Manager.Travel.MembersLabel', 'Members')}</h4>
          {#if fieldErrors.members}
            <p class="manager-travel-field-error" id="manager-travel-member-error" role="alert">{fieldErrors.members}</p>
          {/if}
          {#if selectedParty.memberCards.length === 0}
            <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.MembersEmpty', 'No members yet.')}</p>
          {:else}
            <ul class="manager-travel-member-list">
              {#each selectedParty.memberCards as member (member.uuid)}
                <li class={`manager-travel-member-row ${member.stale ? 'is-stale' : ''}`} data-member-uuid={member.uuid}>
                  <span class="manager-travel-portrait" aria-hidden="true">
                    {#if hasImg(member)}
                      <img src={member.img} alt="" />
                    {:else}
                      <i class={FALLBACK_PORTRAIT_ICON}></i>
                    {/if}
                  </span>
                  <span class="manager-travel-member-name">
                    {member.stale
                      ? text('FABRICATE.Admin.Manager.Travel.StaleMemberLabel', 'Stale member')
                      : member.name}
                  </span>
                  {#if !member.stale}
                    <button
                      type="button"
                      class="manager-icon-button"
                      title={text('FABRICATE.Admin.Manager.Travel.MoveMemberLabel', 'Move member to party')}
                      aria-label={text('FABRICATE.Admin.Manager.Travel.MoveMember', `Move ${member.name} to another party`, { name: member.name })}
                      disabled={saving || parties.length < 2}
                      onclick={() => {
                        const target = parties.find(p => p.id !== selectedParty.id);
                        if (target) onMoveMember(selectedParty.id, target.id, member.uuid);
                      }}
                    >
                      <i class="fas fa-arrow-right-arrow-left" aria-hidden="true"></i>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="manager-icon-button is-danger"
                    title={text('FABRICATE.Admin.Manager.Travel.RemoveMember', `Remove ${member.name}`, { name: member.name })}
                    aria-label={text('FABRICATE.Admin.Manager.Travel.RemoveMember', `Remove ${member.name}`, { name: member.name })}
                    disabled={saving}
                    onclick={() => onRemoveMember(selectedParty.id, member.uuid)}
                  >
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          <div class="manager-travel-picker" bind:this={memberPickerRoot} use:dismissOnOutsideClick={{ enabled: memberPickerOpen, onDismiss: closeMemberPicker }}>
            <!-- aria-invalid + aria-describedby intentionally associate the
                 store's duplicate-member validation error with the control that
                 triggers the offending mutation (the add-member picker), per the
                 Manager's accessible-validation pattern. -->
            <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
            <button
              type="button"
              class="manager-button manager-travel-picker-trigger"
              aria-haspopup="dialog"
              aria-expanded={memberPickerOpen}
              aria-invalid={fieldErrors.members ? 'true' : undefined}
              aria-describedby={fieldErrors.members ? 'manager-travel-member-error' : undefined}
              disabled={!hasActors || saving}
              onclick={toggleMemberPicker}
            >
              <i class="fas fa-user-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Travel.AddMember', 'Add member')}</span>
            </button>
            {#if !hasActors}
              <p class="manager-travel-hint">{text('FABRICATE.Admin.Manager.Travel.NoActorsInWorld', 'No actors exist in this world yet — create an Actor first.')}</p>
            {/if}
            {#if memberPickerOpen}
              <div class="manager-travel-popover" role="dialog" aria-label={text('FABRICATE.Admin.Manager.Travel.ActorPickerLabel', 'Choose an actor')}>
                <div class="manager-travel-popover-search">
                  <input
                    bind:this={memberSearchInput}
                    bind:value={memberSearch}
                    type="text"
                    placeholder={text('FABRICATE.Admin.Manager.Travel.ActorSearchPlaceholder', 'Search actors...')}
                    aria-label={text('FABRICATE.Admin.Manager.Travel.ActorSearchLabel', 'Search actors')}
                  />
                </div>
                <div class="manager-travel-popover-options" role="listbox" aria-label={text('FABRICATE.Admin.Manager.Travel.ActorPickerLabel', 'Choose an actor')}>
                  {#each filteredMemberActors as actor (actor.uuid)}
                    <button type="button" class="manager-travel-option" role="option" aria-selected="false" title={actor.name} onclick={() => chooseMember(actor)}>
                      <span class="manager-travel-portrait" aria-hidden="true">
                        {#if hasImg(actor)}<img src={actor.img} alt="" />{:else}<i class={FALLBACK_PORTRAIT_ICON}></i>{/if}
                      </span>
                      <span class="manager-travel-option-name">{actor.name}</span>
                    </button>
                  {:else}
                    <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.MembersEmpty', 'No members yet.')}</p>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>

        <!-- Travel actor -->
        <section class="manager-travel-actor" aria-label={text('FABRICATE.Admin.Manager.Travel.TravelActorLabel', 'Travel actor')}>
          <h4 class="manager-card-subtitle">{text('FABRICATE.Admin.Manager.Travel.TravelActorLabel', 'Travel actor')}</h4>
          <p class="manager-travel-hint">{text('FABRICATE.Admin.Manager.Travel.TravelActorHint', 'The actor that represents the party on a campaign map.')}</p>
          {#if fieldErrors.travelActor}
            <p class="manager-travel-field-error" id="manager-travel-actor-error" role="alert">{fieldErrors.travelActor}</p>
          {/if}
          <div
            class="manager-travel-actor-row"
            aria-invalid={fieldErrors.travelActor ? 'true' : undefined}
            aria-describedby={fieldErrors.travelActor ? 'manager-travel-actor-error' : undefined}
          >
            {#if selectedParty.travelActor}
              <span class="manager-travel-portrait" aria-hidden="true">
                {#if hasImg(selectedParty.travelActor)}<img src={selectedParty.travelActor.img} alt="" />{:else}<i class={FALLBACK_PORTRAIT_ICON}></i>{/if}
              </span>
              <span class="manager-travel-member-name">{selectedParty.travelActor.name}</span>
              <button type="button" class="manager-icon-button" title={text('FABRICATE.Admin.Manager.Travel.ClearTravelActor', 'Clear travel actor')} aria-label={text('FABRICATE.Admin.Manager.Travel.ClearTravelActor', 'Clear travel actor')} disabled={saving} onclick={() => onClearTravelActor(selectedParty.id)}>
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            {:else if selectedParty.staleTravelActor}
              <span class="manager-travel-member-name is-stale">{text('FABRICATE.Admin.Manager.Travel.StaleTravelActorLabel', 'Stale travel actor')}</span>
              <button type="button" class="manager-icon-button is-danger" title={text('FABRICATE.Admin.Manager.Travel.ClearStaleTravelActor', 'Clear stale travel actor')} aria-label={text('FABRICATE.Admin.Manager.Travel.ClearStaleTravelActor', 'Clear stale travel actor')} disabled={saving} onclick={() => onClearStaleTravelActor(selectedParty.id)}>
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            {:else}
              <span class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.TravelActorEmpty', 'No travel actor assigned.')}</span>
            {/if}
          </div>

          <div class="manager-travel-picker" bind:this={travelPickerRoot} use:dismissOnOutsideClick={{ enabled: travelPickerOpen, onDismiss: closeTravelPicker }}>
            <button
              type="button"
              class="manager-button manager-travel-picker-trigger"
              aria-haspopup="dialog"
              aria-expanded={travelPickerOpen}
              disabled={!hasActors || saving}
              onclick={toggleTravelPicker}
            >
              <i class="fas fa-map-location-dot" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Travel.SetTravelActor', 'Set travel actor')}</span>
            </button>
            {#if !hasActors}
              <p class="manager-travel-hint">{text('FABRICATE.Admin.Manager.Travel.NoActorsInWorld', 'No actors exist in this world yet — create an Actor first.')}</p>
            {/if}
            {#if travelPickerOpen}
              <div class="manager-travel-popover" role="dialog" aria-label={text('FABRICATE.Admin.Manager.Travel.ActorPickerLabel', 'Choose an actor')}>
                <div class="manager-travel-popover-search">
                  <input
                    bind:this={travelSearchInput}
                    bind:value={travelSearch}
                    type="text"
                    placeholder={text('FABRICATE.Admin.Manager.Travel.ActorSearchPlaceholder', 'Search actors...')}
                    aria-label={text('FABRICATE.Admin.Manager.Travel.ActorSearchLabel', 'Search actors')}
                  />
                </div>
                <div class="manager-travel-popover-options" role="listbox" aria-label={text('FABRICATE.Admin.Manager.Travel.ActorPickerLabel', 'Choose an actor')}>
                  {#each filteredTravelActors as actor (actor.uuid)}
                    <button type="button" class="manager-travel-option" role="option" aria-selected={actor.uuid === selectedParty.travelActorUuid} title={actor.name} onclick={() => chooseTravelActor(actor)}>
                      <span class="manager-travel-portrait" aria-hidden="true">
                        {#if hasImg(actor)}<img src={actor.img} alt="" />{:else}<i class={FALLBACK_PORTRAIT_ICON}></i>{/if}
                      </span>
                      <span class="manager-travel-option-name">{actor.name}</span>
                    </button>
                  {:else}
                    <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.NoActorsInWorld', 'No actors exist in this world yet — create an Actor first.')}</p>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>

        <!-- Current-realm override (per selected system) -->
        <section class="manager-travel-override" aria-label={text('FABRICATE.Admin.Manager.Travel.OverrideLabel', 'Current realm override')}>
          <h4 class="manager-card-subtitle">{text('FABRICATE.Admin.Manager.Travel.OverrideLabel', 'Current realm override')}</h4>
          <p class="manager-travel-hint">{text('FABRICATE.Admin.Manager.Travel.OverrideHint', "Set the party's current realm for this crafting system.")}</p>

          {#if !hasRealms}
            <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.Realms.Empty', 'No realms yet.')}</p>
          {:else}
            <div class="manager-travel-realm-chips" role="group" aria-label={text('FABRICATE.Admin.Manager.Travel.RealmSelectLabel', 'Override realms')}>
              {#each systemRealms as realm (realm.id)}
                {@const selected = overrideRealmIds.includes(realm.id)}
                <button
                  type="button"
                  class={`manager-travel-realm-chip ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  data-realm-id={realm.id}
                  disabled={saving}
                  onclick={() => toggleOverrideRealm(realm.id)}
                >
                  <span>{realm.name}</span>
                  {#if !realm.enabled}
                    <span class="manager-travel-realm-chip-flag">{text('FABRICATE.Admin.Manager.Travel.DisabledRealmChip', 'Disabled')}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}

          <div class="manager-travel-override-actions">
            <button type="button" class="manager-button is-primary" disabled={saving || !hasRealms} onclick={commitOverride}>
              <span>{text('FABRICATE.Admin.Manager.Travel.SetOverride', 'Set current realm')}</span>
            </button>
            <button type="button" class="manager-button" disabled={saving} onclick={clearOverride}>
              <span>{text('FABRICATE.Admin.Manager.Travel.ClearOverride', 'Clear current realm')}</span>
            </button>
          </div>
        </section>

        <!-- Stale references to repair -->
        {#if selectedParty.hasStaleReference}
          <section class="manager-travel-stale" aria-label={text('FABRICATE.Admin.Manager.Travel.StaleSectionLabel', 'References to repair')}>
            <h4 class="manager-card-subtitle">{text('FABRICATE.Admin.Manager.Travel.StaleSectionLabel', 'References to repair')}</h4>
            <ul class="manager-travel-stale-list">
              {#each selectedParty.staleMembers as uuid (uuid)}
                <li class="manager-travel-stale-row" data-stale-member={uuid}>
                  <span>{text('FABRICATE.Admin.Manager.Travel.StaleMemberLabel', 'Stale member')}</span>
                  <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Travel.RemoveStaleMember', 'Remove stale member', { uuid })} disabled={saving} onclick={() => onRemoveStaleMember(selectedParty.id, uuid)}>
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
              {#if selectedParty.staleTravelActor}
                <li class="manager-travel-stale-row" data-stale-travel-actor={selectedParty.staleTravelActor}>
                  <span>{text('FABRICATE.Admin.Manager.Travel.StaleTravelActorLabel', 'Stale travel actor')}</span>
                  <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Travel.ClearStaleTravelActor', 'Clear stale travel actor')} disabled={saving} onclick={() => onClearStaleTravelActor(selectedParty.id)}>
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                </li>
              {/if}
              {#each selectedParty.staleRealmIds as realmId (realmId)}
                <li class="manager-travel-stale-row" data-stale-realm={realmId}>
                  <span>{text('FABRICATE.Admin.Manager.Travel.StaleRealmLabel', 'Stale override realm')}</span>
                  <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Travel.RemoveStaleRealm', 'Remove stale override realm', { id: realmId })} disabled={saving} onclick={() => onDropStaleOverrideRealm(selectedParty.id, systemId, realmId)}>
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      {/if}

      <!-- Realm quick list (temporary host until the dedicated Realms route) -->
      <GatheringRealmQuickList
        realms={systemRealms}
        {systemId}
        {saving}
        {biomeOptions}
        {onCreateRealm}
        {onRenameRealm}
        {onToggleRealmEnabled}
        {onUpdateRealm}
        {onDeleteRealm}
        {onPickImagePath}
      />
    </section>
  </div>
</main>
