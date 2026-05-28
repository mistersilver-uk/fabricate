<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize, viewScene } from '../../util/foundryBridge.js';
  import { resolveDropData } from '../../util/dropUtils.js';
  import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';

  let {
    hazard = null,
    weatherOptions = [],
    timeOfDayOptions = [],
    regionOptions = [],
    biomeOptions = [],
    onPickImagePath = null,
    onUpdateHazard = () => {}
  } = $props();

  const DEFAULT_DANGER_TAGS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

  let openAvailabilityMenu = $state('');

  const rawDangerTags = $derived(Array.isArray(hazard?.dangerTags) ? hazard.dangerTags : []);
  const dangerTags = $derived([...rawDangerTags].sort((a, b) => {
    const ai = DEFAULT_DANGER_TAGS.indexOf(a);
    const bi = DEFAULT_DANGER_TAGS.indexOf(b);
    const aRank = ai === -1 ? DEFAULT_DANGER_TAGS.length : ai;
    const bRank = bi === -1 ? DEFAULT_DANGER_TAGS.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return String(a).localeCompare(String(b));
  }));
  const suggestedDangerTags = $derived(DEFAULT_DANGER_TAGS.filter(tag => !dangerTags.includes(tag)));
  const nameValid = $derived(Boolean((hazard?.name || '').trim()));
  const linkedSceneUuid = $derived(String(hazard?.linkedSceneUuid || ''));
  let linkedSceneName = $state('');
  let linkedSceneThumb = $state('');
  $effect(() => {
    const uuid = linkedSceneUuid;
    linkedSceneName = '';
    linkedSceneThumb = '';
    if (!uuid || typeof globalThis.fromUuid !== 'function') return;
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid)).then(doc => {
      if (cancelled || !doc) return;
      linkedSceneName = String(doc.name || '');
      linkedSceneThumb = String(doc.thumb || doc.background?.src || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  });
  const linkedSceneLabel = $derived(linkedSceneName || linkedSceneUuid);

  function handleSceneDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Scene' || !uuid) return;
    onUpdateHazard({ linkedSceneUuid: uuid });
  }

  function unlinkScene() {
    onUpdateHazard({ linkedSceneUuid: '' });
  }

  function onLinkedSceneMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkScene();
  }

  const dropRateRaw = $derived(Number(hazard?.dropRate));
  const dropRateValid = $derived(Number.isFinite(dropRateRaw) && dropRateRaw >= 1 && dropRateRaw <= 100);
  const dropRateValue = $derived(Math.max(1, Math.min(100, Math.floor(Number.isFinite(dropRateRaw) ? dropRateRaw : 1))));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function hazardImage() {
    return hazard?.img || 'icons/svg/hazard.svg';
  }

  function dangerLabel(tag) {
    const key = `FABRICATE.Admin.Manager.Environment.Hazards.DangerTag.${tag}`;
    return text(key, tag.charAt(0).toUpperCase() + tag.slice(1));
  }

  function conditionId(option) {
    return String(option?.id || option || '').trim();
  }

  function conditionLabel(option) {
    return String(option?.label || option?.id || option || '').trim();
  }

  function conditionIcon(option) {
    return String(option?.icon || 'fas fa-circle').trim();
  }

  function conditionOptions(kind) {
    if (kind === 'weather') return weatherOptions;
    if (kind === 'biomes') return biomeOptions;
    if (kind === 'regions') return regionOptions;
    return timeOfDayOptions;
  }

  function selectedConditionIds(kind) {
    let values;
    if (kind === 'weather') values = hazard?.weather;
    else if (kind === 'biomes') values = hazard?.biomes;
    else if (kind === 'regions') values = Array.isArray(hazard?.regions)
      ? hazard.regions
      : (hazard?.region ? [hazard.region] : []);
    else values = hazard?.timeOfDay;
    return Array.isArray(values)
      ? values.map(value => String(value || '').trim()).filter(Boolean)
      : [];
  }

  function selectedConditionOptions(kind) {
    const selectedIds = selectedConditionIds(kind);
    return selectedIds.map(id => (conditionOptions(kind) || []).find(option => conditionId(option) === id) || { id, label: id });
  }

  function availableConditionOptions(kind) {
    const selectedIds = new Set(selectedConditionIds(kind));
    return (conditionOptions(kind) || []).filter(option => {
      const id = conditionId(option);
      return id && !selectedIds.has(id);
    });
  }

  function availabilityFieldLabel(kind) {
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Hazards.Weather', 'Weather');
    if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Hazards.Biome', 'Biome');
    if (kind === 'regions') return text('FABRICATE.Admin.Manager.Environment.Hazards.Region', 'Region');
    return text('FABRICATE.Admin.Manager.Environment.Hazards.TimeOfDay', 'Time of day');
  }

  function availabilityMenuLabel(kind) {
    const available = availableConditionOptions(kind);
    if (available.length === 0) {
      if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Hazards.AllWeatherSelected', 'All weather selected');
      if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Hazards.AllBiomesSelected', 'All biomes selected');
      if (kind === 'regions') return text('FABRICATE.Admin.Manager.Environment.Hazards.AllRegionsSelected', 'All regions selected');
      return text('FABRICATE.Admin.Manager.Environment.Hazards.AllTimesSelected', 'All times selected');
    }
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Hazards.AddWeatherCondition', 'Add weather');
    if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Hazards.AddBiomeCondition', 'Add biome');
    if (kind === 'regions') return text('FABRICATE.Admin.Manager.Environment.Hazards.AddRegionCondition', 'Add region');
    return text('FABRICATE.Admin.Manager.Environment.Hazards.AddTimeOfDayCondition', 'Add time of day');
  }

  function emptyAvailabilityLabel(kind) {
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Hazards.AnyWeatherTitle', 'Any Weather');
    if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Hazards.AnyBiomeTitle', 'Any Biome');
    if (kind === 'regions') return text('FABRICATE.Admin.Manager.Environment.Hazards.AnyRegionTitle', 'Any Region');
    return text('FABRICATE.Admin.Manager.Environment.Hazards.AnyTimeTitle', 'Any Time');
  }

  function removeAvailabilityLabel(option) {
    return text('FABRICATE.Admin.Manager.Environment.Hazards.RemoveAvailabilityCondition', 'Remove {name}')
      .replace('{name}', conditionLabel(option));
  }

  function addAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const selectedIds = selectedConditionIds(kind);
    if (selectedIds.includes(normalizedId)) return;
    onUpdateHazard({ [kind]: [...selectedIds, normalizedId] });
    openAvailabilityMenu = '';
  }

  function removeAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    onUpdateHazard({ [kind]: selectedConditionIds(kind).filter(value => value !== normalizedId) });
  }

  async function chooseHazardImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(hazard?.img || '');
    if (value) onUpdateHazard({ img: value });
  }

  function addDangerTag(tag) {
    const normalized = String(tag || '').trim().toLowerCase();
    if (!normalized) return;
    if (dangerTags.includes(normalized)) return;
    onUpdateHazard({ dangerTags: [...dangerTags, normalized] });
  }

  function removeDangerTag(tag) {
    onUpdateHazard({ dangerTags: dangerTags.filter(value => value !== tag) });
  }

  function onDropRateInput(event) {
    const raw = Number(event.currentTarget.value);
    if (!Number.isFinite(raw)) return;
    const clamped = Math.min(100, Math.max(1, Math.floor(raw)));
    onUpdateHazard({ dropRate: clamped });
  }

</script>

<main
  class="manager-main manager-gathering-hazard-edit-view"
  aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.EditTitle', 'Edit gathering hazard')}
  data-gathering-hazard-editor
>
  {#if hazard}
    <section class="manager-task-core-card" data-gathering-hazard-core-editor>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.HazardIdentity', 'Hazard Identity')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Hazards.HazardIdentityHint', 'Name the hazard, give it a description, choose an image, and toggle whether it is enabled.')}</p>
        </div>
      </div>
      <div class="manager-task-core-grid">
        <div class="manager-task-media-column">
          <button type="button" class="manager-task-image-picker" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.ChooseImage', 'Choose hazard image')} onclick={chooseHazardImage} disabled={typeof onPickImagePath !== 'function'}>
            <img src={hazardImage()} alt="" />
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>

          <div class="manager-task-core-status">
            <button
              type="button"
              class={`manager-status-toggle ${hazard.enabled === false ? 'is-off' : 'is-on'}`}
              data-gathering-hazard-field="enabled"
              aria-pressed={hazard.enabled !== false}
              aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.ToggleNamed', 'Toggle {name}').replace('{name}', hazard.name || text('FABRICATE.Admin.Manager.Environment.Hazards.UnnamedHazard', 'Unnamed hazard'))}
              onclick={() => onUpdateHazard({ enabled: hazard.enabled === false })}
            >
              <span class="manager-status-toggle-track" aria-hidden="true">
                <span class="manager-status-toggle-knob"></span>
              </span>
              <span class="manager-status-toggle-label">
                {hazard.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
              </span>
            </button>
            <p class="manager-muted">{hazard.enabled === false ? text('FABRICATE.Admin.Manager.Environment.Hazards.DisabledHint', 'Disabled hazards never match player gathering.') : text('FABRICATE.Admin.Manager.Environment.Hazards.EnabledHint', 'This hazard is available when its tags match.')}</p>
          </div>
        </div>

        <div class="manager-task-identity-fields">
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.Name', 'Name')}</span>
            <input data-gathering-hazard-field="name" value={hazard.name || ''} oninput={(event) => onUpdateHazard({ name: event.currentTarget.value })} />
            {#if !nameValid}
              <span class="manager-field-error">{text('FABRICATE.Admin.Manager.Environment.Hazards.NameRequired', 'Name is required.')}</span>
            {/if}
          </label>
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.Description', 'Description')}</span>
            <textarea data-gathering-hazard-field="description" value={hazard.description || ''} oninput={(event) => onUpdateHazard({ description: event.currentTarget.value })}></textarea>
          </label>
        </div>
      </div>
    </section>

    <section class="manager-task-availability-card">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.HazardAvailability', 'Hazard Matching')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Hazards.AvailabilityHint', 'Hazards match environments by region, biome, weather, and time of day. Empty fields mean "matches any".')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row" data-gathering-hazard-availability>
        {#each ['regions', 'biomes', 'timeOfDay', 'weather'] as kind (kind)}
          <div class="manager-field manager-availability-multi" data-gathering-hazard-field={kind}>
            <span>{availabilityFieldLabel(kind)}</span>
            <div
              class="manager-availability-picker"
              use:dismissOnOutsideClick={{
                enabled: openAvailabilityMenu === kind,
                onDismiss: () => { if (openAvailabilityMenu === kind) openAvailabilityMenu = ''; }
              }}
            >
              <button
                type="button"
                class="manager-availability-menu-button"
                aria-haspopup="listbox"
                aria-expanded={openAvailabilityMenu === kind}
                onclick={() => openAvailabilityMenu = openAvailabilityMenu === kind ? '' : kind}
              >
                <span>{availabilityMenuLabel(kind)}</span>
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
              </button>
              {#if openAvailabilityMenu === kind}
                <div class="manager-availability-menu" role="listbox" aria-label={availabilityFieldLabel(kind)}>
                  {#if availableConditionOptions(kind).length > 0}
                    {#each availableConditionOptions(kind) as option (conditionId(option))}
                      <button
                        type="button"
                        class="manager-availability-option"
                        role="option"
                        aria-selected="false"
                        data-gathering-hazard-availability-option={kind}
                        data-condition-id={conditionId(option)}
                        onclick={() => addAvailability(kind, conditionId(option))}
                      >
                        <i class={conditionIcon(option)} aria-hidden="true"></i>
                        <span>{conditionLabel(option)}</span>
                      </button>
                    {/each}
                  {:else}
                    <span class="manager-availability-empty">{availabilityMenuLabel(kind)}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="manager-availability-pill-row" data-gathering-hazard-availability-pills={kind}>
              {#if selectedConditionOptions(kind).length > 0}
                {#each selectedConditionOptions(kind) as option (conditionId(option))}
                  <span class="manager-availability-pill" data-gathering-hazard-availability-pill={kind} data-condition-id={conditionId(option)}>
                    <i class={conditionIcon(option)} aria-hidden="true"></i>
                    <span>{conditionLabel(option)}</span>
                    <button type="button" class="manager-availability-remove" aria-label={removeAvailabilityLabel(option)} onclick={() => removeAvailability(kind, conditionId(option))}>
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted manager-availability-any">{emptyAvailabilityLabel(kind)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <div class="manager-gathering-hazard-edit-row" data-gathering-hazard-row="danger-drop-rate">
    <section class="manager-task-availability-card" data-gathering-hazard-danger-tags>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.DangerTags', 'Danger tags')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Hazards.DangerTagsHint', 'Danger tags let environments opt in to this hazard. Empty matches any environment danger profile.')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row">
        <div class="manager-field manager-availability-multi">
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.DangerTagsField', 'Current tags')}</span>
          <div class="manager-availability-pill-row" data-gathering-hazard-danger-pills>
            {#if dangerTags.length > 0}
              {#each dangerTags as tag (tag)}
                <span class={`manager-danger-tag-pill is-${tag}`} data-danger-tag={tag}>
                  <span>{dangerLabel(tag)}</span>
                  <button type="button" class="manager-availability-remove" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.RemoveDangerTag', 'Remove {name}').replace('{name}', dangerLabel(tag))} onclick={() => removeDangerTag(tag)}>
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </span>
              {/each}
            {:else}
              <span class="manager-muted manager-availability-any">{text('FABRICATE.Admin.Manager.Environment.Hazards.AnyDanger', 'Any danger profile')}</span>
            {/if}
          </div>
          {#if suggestedDangerTags.length > 0}
            <div class="manager-availability-pill-row" data-gathering-hazard-danger-suggestions>
              {#each suggestedDangerTags as tag (tag)}
                <button
                  type="button"
                  class={`manager-danger-tag-pill is-suggestion is-${tag}`}
                  data-danger-tag-suggestion={tag}
                  onclick={() => addDangerTag(tag)}
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{dangerLabel(tag)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="manager-task-availability-card" data-gathering-hazard-drop-rate>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.DropRate', 'Drop rate')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Hazards.DropRateHint', 'Chance from 1 to 100 that this hazard drops on a matching gathering attempt before modifiers.')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row">
        <label class="manager-field manager-drop-rate-editor">
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.DropRatePercent', 'Drop rate (%)')}</span>
          <span class="manager-drop-rate-value">
            <span class="manager-drop-rate-percent">
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                value={dropRateValue}
                oninput={onDropRateInput}
                data-gathering-hazard-field="dropRate"
                aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.DropRatePercent', 'Drop rate (%)')}
              />
              <span aria-hidden="true">%</span>
            </span>
            <span class={`manager-drop-rate-control ${dropRateTierClass(dropRateValue)}`} style={`--fab-drop-rate-value: ${dropRateValue}%; --fab-drop-rate-color: ${dropRateTierColor(dropRateValue)};`}>
              <span class="manager-drop-rate-track" aria-hidden="true">
                <span class="manager-drop-rate-fill"></span>
              </span>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={dropRateValue}
                oninput={onDropRateInput}
                aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.DropRatePercent', 'Drop rate (%)')}
              />
            </span>
          </span>
          {#if !dropRateValid}
            <span class="manager-field-error">{text('FABRICATE.Admin.Manager.Environment.Hazards.DropRateInvalid', 'Drop rate must be between 1 and 100.')}</span>
          {/if}
        </label>
      </div>
    </section>
    </div>

    <section class="manager-task-availability-card manager-gathering-hazard-scene" data-gathering-hazard-scene>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.SceneLink', 'Linked scene')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Hazards.SceneLinkHint', 'Optionally link a scene to open when this hazard is triggered.')}</p>
        </div>
      </div>
      {#if linkedSceneUuid}
        <div
          class="manager-gathering-hazard-scene-linked"
          data-gathering-hazard-scene-linked
          title={text('FABRICATE.Admin.Manager.Environment.Hazards.SceneRemoveTooltip', 'Right-click to remove the linked scene')}
          oncontextmenu={(event) => { event.preventDefault(); unlinkScene(); }}
          onmousedown={onLinkedSceneMouseDown}
        >
          {#if linkedSceneThumb}
            <img class="manager-gathering-hazard-scene-thumb" src={linkedSceneThumb} alt="" />
          {:else}
            <span class="manager-gathering-hazard-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-map"></i></span>
          {/if}
          <button
            type="button"
            class="manager-gathering-hazard-scene-name"
            title={text('FABRICATE.Admin.Manager.Environment.Hazards.SceneOpen', 'Open scene')}
            onclick={(event) => { event.stopPropagation(); viewScene(linkedSceneUuid); }}
          >{linkedSceneLabel}</button>
          <button
            type="button"
            class="manager-icon-button is-danger"
            aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.SceneUnlink', 'Unlink scene')}
            title={text('FABRICATE.Admin.Manager.Environment.Hazards.SceneUnlink', 'Unlink scene')}
            onclick={unlinkScene}
          >
            <i class="fas fa-link-slash" aria-hidden="true"></i>
          </button>
        </div>
      {:else}
        <div
          class="manager-gathering-hazard-scene-dropzone"
          data-gathering-hazard-scene-dropzone
          use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}
        >
          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.SceneDropHint', 'Drag a scene here to link it.')}</span>
        </div>
      {/if}
    </section>

  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.SelectHazard', 'Select a hazard to edit')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Environment.Hazards.SelectHazardHint', 'Choose a hazard from the browser to edit its identity, matching, and modifiers.')}</p>
      </div>
    </div>
  {/if}
</main>
