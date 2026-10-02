<!-- Svelte 5 runes mode -->
<!--
  The overland-travel inspector card: the selected realm on the realms tab, the selected map
  region and its two party lists on the map tab, and each tab's no-selection line (issue 1707).

  `travelTab` is `'realms'` or `'map'` and any other value renders an empty card; `realms` is the
  whole library, which resolves the map region's linked realm by id. `onDeleteRealm(realmId)` and
  `onRenameRealm(realmId, name)` are the realm's two writers, and `travelSaving` disables both.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import RealmNameField from '../RealmNameField.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    travelTab = 'realms',
    realm = null,
    mapRegion = null,
    realms = [],
    travelSaving = false,
    onDeleteRealm = () => {},
    onRenameRealm = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<section
  class="fabricate-card manager-inspector-card manager-travel-inspector"
  class:is-empty={(travelTab === 'realms' && !realm) || (travelTab === 'map' && !mapRegion)}
  data-gathering-inspector-travel
  data-travel-inspector={travelTab}
  aria-label={travelTab === 'map'
    ? text('FABRICATE.Admin.Manager.Travel.MapLinksInspector', 'Selected map region link')
    : text('FABRICATE.Admin.Manager.Travel.RealmsInspector', 'Selected realm')}
>
  {#if travelTab === 'realms'}
    {#if realm}
      <div class="manager-inspector-title-row">
        <span class="manager-inspector-icon" aria-hidden="true">
          <i class="fas fa-map-location-dot"></i>
        </span>
        <div class="manager-inspector-copy">
          <p class="manager-kicker">
            {text('FABRICATE.Admin.Manager.Travel.Realms.InspectorKicker', 'Selected realm')}
          </p>
          <h2 class="manager-inspector-name">{realm.name}</h2>
        </div>
      </div>

      <div class="manager-travel-inspector-actions">
        <ManagerButton
          role="danger"
          disabled={travelSaving}
          onclick={() => onDeleteRealm(realm.id)}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Travel.Realms.Delete', 'Delete realm')}</span>
        </ManagerButton>
      </div>

      <section class="fabricate-card manager-inspector-card">
        <RealmNameField
          name={realm.name}
          disabled={travelSaving}
          onRename={(name) => onRenameRealm(realm.id, name)}
        />
      </section>

      <section class="fabricate-card manager-inspector-card">
        <h3 class="manager-card-title">
          <i class="fas fa-seedling" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Travel.Realms.EnvironmentsCardTitle', 'Environments')}
        </h3>
        {#if realm.environments.length > 0}
          <ul class="manager-travel-region-environments">
            {#each realm.environments as environment (environment.id)}
              <li>
                <span class="manager-travel-region-thumb" aria-hidden="true">
                  {#if environment.img}<img src={environment.img} alt="" />{:else}<i
                      class="fas fa-seedling"
                    ></i>{/if}
                </span>
                <span class="manager-travel-region-item-name">{environment.name}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Travel.Realms.NoEnvironments',
              'No environments include this realm yet.'
            )}
          </p>
        {/if}
      </section>

      <section class="fabricate-card manager-inspector-card">
        <h3 class="manager-card-title">
          <i class="fas fa-people-group" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Travel.Realms.PartiesCardTitle', 'Parties in this realm')}
        </h3>
        {#if realm.parties.length > 0}
          <ul class="manager-travel-region-parties">
            {#each realm.parties as party (party.id)}
              <li>
                <span class="manager-travel-region-thumb" aria-hidden="true">
                  {#if party.img}<img src={party.img} alt="" />{:else}<i class="fas fa-people-group"
                    ></i>{/if}
                </span>
                <span class="manager-travel-region-item-name">{party.name}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Travel.Realms.NoParties',
              'No parties are currently in this realm.'
            )}
          </p>
        {/if}
      </section>
    {:else}
      <EmptyState
        fill
        icon="fas fa-map-location-dot"
        title={text('FABRICATE.Admin.Manager.Travel.Realms.SelectTitle', 'Select a realm')}
        hint={text(
          'FABRICATE.Admin.Manager.Travel.Inspector.RealmsPlaceholder',
          'Select a realm to see its details.'
        )}
        dataAttr="data-travel-inspector-empty"
        dataValue="realms"
      />
    {/if}
  {:else if travelTab === 'map'}
    {#if mapRegion}
      <section class="fabricate-card manager-inspector-card manager-map-link-region-card">
        <div class="manager-inspector-title-row">
          <span
            class="manager-inspector-icon manager-map-link-inspector-swatch"
            aria-hidden="true"
            style={mapRegion.color ? `background:${mapRegion.color};` : ''}
          ></span>
          <div class="manager-inspector-copy">
            <p class="manager-kicker">
              {text(
                'FABRICATE.Admin.Manager.Travel.MapLinks.InspectorKicker',
                'Selected map region'
              )}
            </p>
            <h2 class="manager-inspector-name">
              {mapRegion.name ||
                text('FABRICATE.Admin.Manager.Travel.MapLinks.UnnamedRegion', 'Unnamed region')}
            </h2>
          </div>
        </div>
      </section>

      <section class="fabricate-card manager-inspector-card">
        <h3 class="manager-card-title">
          <i class="fas fa-link" aria-hidden="true"></i>
          {text(
            'FABRICATE.Admin.Manager.Travel.MapLinks.LinkSectionTitle',
            'Linked Fabricate realm'
          )}
        </h3>
        {#if mapRegion.linkedRegionId}
          {@const linkedRealm = realms.find(
            (candidate) => candidate.id === mapRegion.linkedRegionId
          )}
          <ul class="manager-travel-region-parties">
            <li>
              <span class="manager-travel-region-thumb" aria-hidden="true"
                ><i class="fas fa-map-location-dot"></i></span
              >
              <span class="manager-travel-region-item-name"
                >{linkedRealm?.name ||
                  text('FABRICATE.Admin.Manager.Travel.MapLinks.Stale', 'Unknown realm')}</span
              >
              {#if linkedRealm && !linkedRealm.enabled}
                <Chip tone="disabled"
                  >{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</Chip
                >
              {/if}
            </li>
          </ul>
        {:else}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Travel.MapLinks.NotLinked',
              'This map region isn’t linked to a Fabricate realm.'
            )}
          </p>
        {/if}
      </section>

      <section class="fabricate-card manager-inspector-card">
        <h3 class="manager-card-title">
          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
          {text(
            'FABRICATE.Admin.Manager.Travel.MapLinks.PartiesInMapRegionTitle',
            'Parties in this map region'
          )}
        </h3>
        {#if mapRegion.partiesInMapRegion?.length > 0}
          <ul class="manager-travel-region-parties">
            {#each mapRegion.partiesInMapRegion as party (party.id)}
              <li>
                <span class="manager-travel-region-thumb" aria-hidden="true">
                  {#if party.img}<img src={party.img} alt="" />{:else}<i class="fas fa-people-group"
                    ></i>{/if}
                </span>
                <span class="manager-travel-region-item-name">{party.name}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Travel.MapLinks.NoPartiesInMapRegion',
              'No party travel actors are in this map region.'
            )}
          </p>
        {/if}
      </section>

      <section class="fabricate-card manager-inspector-card">
        <h3 class="manager-card-title">
          <i class="fas fa-people-group" aria-hidden="true"></i>
          {text(
            'FABRICATE.Admin.Manager.Travel.MapLinks.PartiesInFabricateRegionTitle',
            'Parties in this Fabricate realm'
          )}
        </h3>
        {#if !mapRegion.linkedRegionId}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Travel.MapLinks.NotLinked',
              'This map region isn’t linked to a Fabricate realm.'
            )}
          </p>
        {:else if mapRegion.partiesInFabricateRealm?.length > 0}
          <ul class="manager-travel-region-parties">
            {#each mapRegion.partiesInFabricateRealm as party (party.id)}
              <li>
                <span class="manager-travel-region-thumb" aria-hidden="true">
                  {#if party.img}<img src={party.img} alt="" />{:else}<i class="fas fa-people-group"
                    ></i>{/if}
                </span>
                <span class="manager-travel-region-item-name">{party.name}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Travel.MapLinks.NoPartiesInFabricateRegion',
              'No parties are in this Fabricate realm.'
            )}
          </p>
        {/if}
      </section>
    {:else}
      <EmptyState
        fill
        icon="fas fa-map"
        title={text('FABRICATE.Admin.Manager.Travel.MapLinks.SelectTitle', 'Select a map region')}
        hint={text(
          'FABRICATE.Admin.Manager.Travel.Inspector.MapLinksPlaceholder',
          'Select a region to map it to Scene Regions.'
        )}
        dataAttr="data-travel-inspector-empty"
        dataValue="map"
      />
    {/if}
  {/if}
</section>

<style>
  .manager-travel-inspector.is-empty {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
  }
</style>
