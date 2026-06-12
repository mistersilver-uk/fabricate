<!-- Svelte 5 runes mode -->
<!--
  GatheringRealmQuickList is the canonical realm authoring surface for the
  gathering `Travel` route. It uses a realm list + detail layout: the left list
  selects/creates/deletes realms, the right detail pane edits the selected
  realm's name, description, image, enabled, secret, and biomes (chosen from the
  system biome vocabulary). All edits round-trip through `onUpdateRealm`, which
  merge-patches over the existing record so unedited fields (sort, sceneMappings,
  modifiers) survive untouched. Delete is destructive and routes through the
  store's confirm dialog with referenced-by evidence.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    realms = [],
    systemId = '',
    saving = false,
    biomeOptions = [],
    onCreateRealm = () => {},
    onRenameRealm = () => {},
    onToggleRealmEnabled = () => {},
    onUpdateRealm = () => {},
    onDeleteRealm = () => {},
    onPickImagePath = null
  } = $props();

  let createInput = $state('');
  let selectedRealmId = $state('');

  const DEFAULT_REALM_IMAGE_DIR = 'icons/environment/';

  function text(key, fallback, data) {
    const translated = localize(key, data);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function optId(option) { return String(option?.id ?? option ?? '').trim(); }
  function optLabel(option) { return String(option?.label ?? option?.id ?? option ?? '').trim(); }

  const realmList = $derived(Array.isArray(realms) ? realms : []);
  const selectedRealm = $derived(
    realmList.find(realm => realm.id === selectedRealmId)
    || realmList[0]
    || null
  );

  // Keep the local selection valid as the list changes (create/delete/system swap).
  $effect(() => {
    if (realmList.length === 0) {
      if (selectedRealmId) selectedRealmId = '';
      return;
    }
    if (!realmList.some(realm => realm.id === selectedRealmId)) {
      selectedRealmId = realmList[0].id;
    }
  });

  const selectedBiomes = $derived(Array.isArray(selectedRealm?.biomes) ? selectedRealm.biomes : []);
  const availableBiomes = $derived(biomeOptions.filter(option => !selectedBiomes.includes(optId(option))));

  function biomeLabel(id) {
    return optLabel(biomeOptions.find(option => optId(option) === id)) || id;
  }
  function biomeColorStyle(id) {
    const option = biomeOptions.find(entry => optId(entry) === id);
    const hex = /^#[0-9a-fA-F]{6}$/.test(option?.customColor || '') ? option.customColor : '';
    const token = String(option?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
  }

  function submitCreate(event) {
    event.preventDefault();
    const name = createInput.trim();
    if (!name) return;
    onCreateRealm(systemId, name);
    createInput = '';
  }

  function commitName(realm, event) {
    const value = event.currentTarget.value.trim();
    if (!value || value === realm.name) return;
    onRenameRealm(systemId, realm.id, value);
  }

  function commitDescription(realm, event) {
    const value = event.currentTarget.value;
    if (value === (realm.description || '')) return;
    onUpdateRealm(systemId, realm.id, { description: value });
  }

  function addBiome(event) {
    const id = String(event.currentTarget.value || '').trim();
    event.currentTarget.value = '';
    if (!id || !selectedRealm) return;
    if (selectedBiomes.includes(id)) return;
    onUpdateRealm(systemId, selectedRealm.id, { biomes: [...selectedBiomes, id] });
  }

  function removeBiome(id) {
    if (!selectedRealm) return;
    onUpdateRealm(systemId, selectedRealm.id, { biomes: selectedBiomes.filter(value => value !== id) });
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || !selectedRealm) return;
    const value = await onPickImagePath(selectedRealm.img || DEFAULT_REALM_IMAGE_DIR);
    if (value) onUpdateRealm(systemId, selectedRealm.id, { img: value });
  }
</script>

<section class="manager-travel-realms" aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.SectionLabel', 'Realms')}>
  <header class="manager-travel-realms-header">
    <span class="manager-travel-realms-title">
      <i class="fas fa-map-location-dot" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Travel.Realms.SectionLabel', 'Realms')}</span>
    </span>
  </header>

  <form class="manager-travel-realm-create" onsubmit={submitCreate}>
    <input
      class="manager-travel-realm-create-input"
      bind:value={createInput}
      placeholder={text('FABRICATE.Admin.Manager.Travel.Realms.CreatePlaceholder', 'New realm name')}
      aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.CreateLabel', 'New realm name')}
    />
    <button type="submit" class="manager-button" disabled={saving || !createInput.trim()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Travel.Realms.Create', 'Add realm')}</span>
    </button>
  </form>

  {#if realmList.length === 0}
    <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.Realms.Empty', 'No realms yet.')}</p>
  {:else}
    <div class="manager-travel-realm-layout">
      <ul class="manager-travel-realm-list" aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.ListLabel', 'Realms')}>
        {#each realmList as realm (realm.id)}
          <li class="manager-travel-realm-row" data-realm-id={realm.id}>
            <button
              type="button"
              class={`manager-travel-realm-select ${selectedRealm?.id === realm.id ? 'is-selected' : ''}`}
              aria-pressed={selectedRealm?.id === realm.id}
              data-realm-select={realm.id}
              onclick={() => (selectedRealmId = realm.id)}
            >
              <span class="manager-travel-realm-select-name">{realm.name}</span>
              {#if realm.secret}
                <i class="fas fa-eye-slash manager-travel-realm-secret-flag" aria-hidden="true" title={text('FABRICATE.Admin.Manager.Travel.Realms.SecretChip', 'Secret')}></i>
              {/if}
              {#if !realm.enabled}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.Realms.DisabledChip', 'Disabled')}</span>
              {/if}
            </button>
            <button
              type="button"
              class="manager-icon-button is-danger"
              title={text('FABRICATE.Admin.Manager.Travel.Realms.Delete', 'Delete realm')}
              aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.DeleteNamed', 'Delete {name}', { name: realm.name }).replace('{name}', realm.name)}
              disabled={saving}
              onclick={() => onDeleteRealm(systemId, realm.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>

      {#if selectedRealm}
        <div class="manager-travel-realm-detail" data-realm-detail={selectedRealm.id}>
          <div class="manager-travel-realm-detail-head">
            <button
              type="button"
              class="manager-travel-realm-image"
              aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.ChooseImage', 'Choose realm image')}
              onclick={chooseImage}
              disabled={typeof onPickImagePath !== 'function'}
            >
              <img src={selectedRealm.img || 'icons/svg/direction.svg'} alt="" />
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <div class="manager-travel-realm-detail-toggles">
              <button
                type="button"
                class={`manager-status-toggle ${selectedRealm.enabled ? 'is-on' : 'is-off'}`}
                data-realm-field="enabled"
                aria-pressed={selectedRealm.enabled}
                aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.EnabledToggle', 'Toggle realm enabled')}
                disabled={saving}
                onclick={() => onToggleRealmEnabled(systemId, selectedRealm.id, !selectedRealm.enabled)}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">
                  {selectedRealm.enabled
                    ? text('FABRICATE.Admin.Manager.Travel.Realms.EnabledChip', 'Enabled')
                    : text('FABRICATE.Admin.Manager.Travel.Realms.DisabledChip', 'Disabled')}
                </span>
              </button>
              <button
                type="button"
                class={`manager-status-toggle ${selectedRealm.secret ? 'is-on' : 'is-off'}`}
                data-realm-field="secret"
                aria-pressed={selectedRealm.secret}
                aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.SecretToggle', 'Toggle realm secret')}
                disabled={saving}
                onclick={() => onUpdateRealm(systemId, selectedRealm.id, { secret: !selectedRealm.secret })}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">
                  {selectedRealm.secret
                    ? text('FABRICATE.Admin.Manager.Travel.Realms.SecretChip', 'Secret')
                    : text('FABRICATE.Admin.Manager.Travel.Realms.RevealedChip', 'Revealed')}
                </span>
              </button>
            </div>
          </div>

          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Travel.Realms.NameLabel', 'Name')}</span>
            <input
              class="manager-travel-realm-name"
              data-realm-field="name"
              value={selectedRealm.name}
              onblur={(event) => commitName(selectedRealm, event)}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>

          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Travel.Realms.DescriptionLabel', 'Description')}</span>
            <textarea
              class="manager-travel-realm-description"
              data-realm-field="description"
              value={selectedRealm.description || ''}
              onblur={(event) => commitDescription(selectedRealm, event)}
            ></textarea>
          </label>

          <div class="manager-field manager-travel-realm-biomes" data-realm-field="biomes">
            <span>{text('FABRICATE.Admin.Manager.Travel.Realms.BiomesLabel', 'Biomes')}</span>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Realms.BiomesHint', 'The terrain in this realm, drawn from the system biome vocabulary.')}</p>
            {#if availableBiomes.length > 0}
              <select aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.AddBiome', 'Add biome')} onchange={addBiome}>
                <option value="">{text('FABRICATE.Admin.Manager.Travel.Realms.AddBiome', 'Add biome')}</option>
                {#each availableBiomes as option (optId(option))}
                  <option value={optId(option)}>{optLabel(option)}</option>
                {/each}
              </select>
            {/if}
            <div class="manager-availability-pill-row">
              {#if selectedBiomes.length > 0}
                {#each selectedBiomes as id (id)}
                  <span class="manager-availability-pill is-biome" style={biomeColorStyle(id)}>
                    <span>{biomeLabel(id)}</span>
                    <button
                      type="button"
                      class="manager-availability-remove"
                      aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.RemoveBiome', 'Remove {name}', { name: biomeLabel(id) }).replace('{name}', biomeLabel(id))}
                      onclick={() => removeBiome(id)}
                    ><i class="fas fa-xmark" aria-hidden="true"></i></button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Realms.NoBiomes', 'No biomes selected')}</span>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>
