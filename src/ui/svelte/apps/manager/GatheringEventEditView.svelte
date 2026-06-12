<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize, viewScene } from '../../util/foundryBridge.js';
  import { resolveDropData } from '../../util/dropUtils.js';
  import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';
  import { sceneDocumentImage } from '../../util/sceneImages.js';

  let {
    event = null,
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    onPickImagePath = null,
    onUpdateEvent = () => {}
  } = $props();

  const DEFAULT_DANGER_TAGS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

  let openAvailabilityMenu = $state('');

  const rawDangerTags = $derived(Array.isArray(event?.dangerTags) ? event.dangerTags : []);
  const dangerTags = $derived([...rawDangerTags].sort((a, b) => {
    const ai = DEFAULT_DANGER_TAGS.indexOf(a);
    const bi = DEFAULT_DANGER_TAGS.indexOf(b);
    const aRank = ai === -1 ? DEFAULT_DANGER_TAGS.length : ai;
    const bRank = bi === -1 ? DEFAULT_DANGER_TAGS.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return String(a).localeCompare(String(b));
  }));
  const suggestedDangerTags = $derived(DEFAULT_DANGER_TAGS.filter(tag => !dangerTags.includes(tag)));
  const nameValid = $derived(Boolean((event?.name || '').trim()));
  const linkedSceneUuid = $derived(String(event?.linkedSceneUuid || ''));
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
      linkedSceneThumb = sceneDocumentImage(doc);
    }).catch(() => {});
    return () => { cancelled = true; };
  });
  const linkedSceneLabel = $derived(linkedSceneName || linkedSceneUuid);

  function handleSceneDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Scene' || !uuid) return;
    onUpdateEvent({ linkedSceneUuid: uuid });
  }

  function unlinkScene() {
    onUpdateEvent({ linkedSceneUuid: '' });
  }

  function onLinkedSceneMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkScene();
  }

  const dropRateRaw = $derived(Number(event?.dropRate));
  const dropRateValid = $derived(Number.isFinite(dropRateRaw) && dropRateRaw >= 1 && dropRateRaw <= 100);
  const dropRateValue = $derived(Math.max(1, Math.min(100, Math.floor(Number.isFinite(dropRateRaw) ? dropRateRaw : 1))));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function eventImage() {
    return event?.img || 'icons/svg/hazard.svg';
  }

  function dangerLabel(tag) {
    const key = `FABRICATE.Admin.Manager.Environment.Events.DangerTag.${tag}`;
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
    return timeOfDayOptions;
  }

  function selectedConditionIds(kind) {
    let values;
    if (kind === 'weather') values = event?.weather;
    else if (kind === 'biomes') values = event?.biomes;
    else values = event?.timeOfDay;
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
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Events.Weather', 'Weather');
    if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Events.Biome', 'Biome');
    return text('FABRICATE.Admin.Manager.Environment.Events.TimeOfDay', 'Time of day');
  }

  function availabilityMenuLabel(kind) {
    const available = availableConditionOptions(kind);
    if (available.length === 0) {
      if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Events.AllWeatherSelected', 'All weather selected');
      if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Events.AllBiomesSelected', 'All biomes selected');
      return text('FABRICATE.Admin.Manager.Environment.Events.AllTimesSelected', 'All times selected');
    }
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Events.AddWeatherCondition', 'Add weather');
    if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Events.AddBiomeCondition', 'Add biome');
    return text('FABRICATE.Admin.Manager.Environment.Events.AddTimeOfDayCondition', 'Add time of day');
  }

  function emptyAvailabilityLabel(kind) {
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Events.AnyWeatherTitle', 'Any Weather');
    if (kind === 'biomes') return text('FABRICATE.Admin.Manager.Environment.Events.AnyBiomeTitle', 'Any Biome');
    return text('FABRICATE.Admin.Manager.Environment.Events.AnyTimeTitle', 'Any Time');
  }

  function removeAvailabilityLabel(option) {
    return text('FABRICATE.Admin.Manager.Environment.Events.RemoveAvailabilityCondition', 'Remove {name}')
      .replace('{name}', conditionLabel(option));
  }

  function addAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const selectedIds = selectedConditionIds(kind);
    if (selectedIds.includes(normalizedId)) return;
    onUpdateEvent({ [kind]: [...selectedIds, normalizedId] });
    openAvailabilityMenu = '';
  }

  function removeAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    onUpdateEvent({ [kind]: selectedConditionIds(kind).filter(value => value !== normalizedId) });
  }

  async function chooseEventImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(event?.img || '');
    if (value) onUpdateEvent({ img: value });
  }

  function addDangerTag(tag) {
    const normalized = String(tag || '').trim().toLowerCase();
    if (!normalized) return;
    if (dangerTags.includes(normalized)) return;
    onUpdateEvent({ dangerTags: [...dangerTags, normalized] });
  }

  function removeDangerTag(tag) {
    onUpdateEvent({ dangerTags: dangerTags.filter(value => value !== tag) });
  }

  function onDropRateInput(event) {
    const raw = Number(event.currentTarget.value);
    if (!Number.isFinite(raw)) return;
    const clamped = Math.min(100, Math.max(1, Math.floor(raw)));
    onUpdateEvent({ dropRate: clamped });
  }

</script>

<main
  class="manager-main manager-gathering-event-edit-view"
  aria-label={text('FABRICATE.Admin.Manager.Environment.Events.EditTitle', 'Edit gathering event')}
  data-gathering-event-editor
>
  {#if event}
    <section class="manager-task-core-card" data-gathering-event-core-editor>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.EventIdentity', 'Event Identity')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Events.EventIdentityHint', 'Name the event, give it a description, choose an image, and toggle whether it is enabled.')}</p>
        </div>
      </div>
      <div class="manager-task-core-grid">
        <div class="manager-task-media-column">
          <button type="button" class="manager-task-image-picker" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.ChooseImage', 'Choose event image')} onclick={chooseEventImage} disabled={typeof onPickImagePath !== 'function'}>
            <img src={eventImage()} alt="" />
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>

          <div class="manager-task-core-status">
            <button
              type="button"
              class={`manager-status-toggle ${event.enabled === false ? 'is-off' : 'is-on'}`}
              data-gathering-event-field="enabled"
              aria-pressed={event.enabled !== false}
              aria-label={text('FABRICATE.Admin.Manager.Environment.Events.ToggleNamed', 'Toggle {name}').replace('{name}', event.name || text('FABRICATE.Admin.Manager.Environment.Events.UnnamedEvent', 'Unnamed event'))}
              onclick={() => onUpdateEvent({ enabled: event.enabled === false })}
            >
              <span class="manager-status-toggle-track" aria-hidden="true">
                <span class="manager-status-toggle-knob"></span>
              </span>
              <span class="manager-status-toggle-label">
                {event.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
              </span>
            </button>
            <p class="manager-muted">{event.enabled === false ? text('FABRICATE.Admin.Manager.Environment.Events.DisabledHint', 'Disabled events never match player gathering.') : text('FABRICATE.Admin.Manager.Environment.Events.EnabledHint', 'This event is available when its tags match.')}</p>
          </div>
        </div>

        <div class="manager-task-identity-fields">
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Events.Name', 'Name')}</span>
            <input data-gathering-event-field="name" value={event.name || ''} oninput={(event) => onUpdateEvent({ name: event.currentTarget.value })} />
            {#if !nameValid}
              <span class="manager-field-error">{text('FABRICATE.Admin.Manager.Environment.Events.NameRequired', 'Name is required.')}</span>
            {/if}
          </label>
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Events.Description', 'Description')}</span>
            <textarea data-gathering-event-field="description" value={event.description || ''} oninput={(event) => onUpdateEvent({ description: event.currentTarget.value })}></textarea>
          </label>
        </div>
      </div>
    </section>

    <section class="manager-task-availability-card">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.EventAvailability', 'Event Matching')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Events.AvailabilityHint', 'Events match environments by biome, weather, and time of day. Empty fields mean "matches any".')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row" data-gathering-event-availability>
        {#each ['biomes', 'timeOfDay', 'weather'] as kind (kind)}
          <div class="manager-field manager-availability-multi" data-gathering-event-field={kind}>
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
                        data-gathering-event-availability-option={kind}
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
            <div class="manager-availability-pill-row" data-gathering-event-availability-pills={kind}>
              {#if selectedConditionOptions(kind).length > 0}
                {#each selectedConditionOptions(kind) as option (conditionId(option))}
                  <span class="manager-availability-pill" data-gathering-event-availability-pill={kind} data-condition-id={conditionId(option)}>
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

    <div class="manager-gathering-event-edit-row" data-gathering-event-row="danger-drop-rate">
    <section class="manager-task-availability-card" data-gathering-event-danger-tags>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.DangerTags', 'Danger tags')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Events.DangerTagsHint', 'Danger tags let environments opt in to this event. Empty matches any environment danger profile.')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row">
        <div class="manager-field manager-availability-multi">
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.DangerTagsField', 'Current tags')}</span>
          <div class="manager-availability-pill-row" data-gathering-event-danger-pills>
            {#if dangerTags.length > 0}
              {#each dangerTags as tag (tag)}
                <span class={`manager-danger-tag-pill is-${tag}`} data-danger-tag={tag}>
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  <span>{dangerLabel(tag)}</span>
                  <button type="button" class="manager-availability-remove" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.RemoveDangerTag', 'Remove {name}').replace('{name}', dangerLabel(tag))} onclick={() => removeDangerTag(tag)}>
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </span>
              {/each}
            {:else}
              <span class="manager-muted manager-availability-any">{text('FABRICATE.Admin.Manager.Environment.Events.AnyDanger', 'Any danger profile')}</span>
            {/if}
          </div>
          {#if suggestedDangerTags.length > 0}
            <div class="manager-availability-pill-row" data-gathering-event-danger-suggestions>
              {#each suggestedDangerTags as tag (tag)}
                <button
                  type="button"
                  class={`manager-danger-tag-pill is-suggestion is-${tag}`}
                  data-danger-tag-suggestion={tag}
                  onclick={() => addDangerTag(tag)}
                >
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{dangerLabel(tag)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="manager-task-availability-card" data-gathering-event-drop-rate>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.DropRate', 'Drop rate')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Events.DropRateHint', 'Chance from 1 to 100 that this event drops on a matching gathering attempt before modifiers.')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row">
        <label class="manager-field manager-drop-rate-editor">
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.DropRatePercent', 'Drop rate (%)')}</span>
          <span class="manager-drop-rate-value">
            <span class="manager-drop-rate-percent">
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                value={dropRateValue}
                oninput={onDropRateInput}
                data-gathering-event-field="dropRate"
                aria-label={text('FABRICATE.Admin.Manager.Environment.Events.DropRatePercent', 'Drop rate (%)')}
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
                aria-label={text('FABRICATE.Admin.Manager.Environment.Events.DropRatePercent', 'Drop rate (%)')}
              />
            </span>
          </span>
          {#if !dropRateValid}
            <span class="manager-field-error">{text('FABRICATE.Admin.Manager.Environment.Events.DropRateInvalid', 'Drop rate must be between 1 and 100.')}</span>
          {/if}
        </label>
      </div>
    </section>
    </div>

    <section class="manager-task-availability-card manager-gathering-event-scene" data-gathering-event-scene>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.SceneLink', 'Linked scene')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Events.SceneLinkHint', 'Optionally link a scene to open when this event is triggered.')}</p>
        </div>
      </div>
      {#if linkedSceneUuid}
        <!-- Right-click-to-unlink and mousedown-drag are enhancements; the
             visible Open/Unlink buttons inside provide the accessible path. -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="manager-gathering-event-scene-linked"
          data-gathering-event-scene-linked
          role="group"
          aria-label={text('FABRICATE.Admin.Manager.Environment.Events.SceneLink', 'Linked scene')}
          title={text('FABRICATE.Admin.Manager.Environment.Events.SceneRemoveTooltip', 'Right-click to remove the linked scene')}
          oncontextmenu={(event) => { event.preventDefault(); unlinkScene(); }}
          onmousedown={onLinkedSceneMouseDown}
        >
          {#if linkedSceneThumb}
            <img class="manager-gathering-event-scene-thumb" src={linkedSceneThumb} alt="" />
          {:else}
            <span class="manager-gathering-event-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-map"></i></span>
          {/if}
          <button
            type="button"
            class="manager-gathering-event-scene-name"
            title={text('FABRICATE.Admin.Manager.Environment.Events.SceneOpen', 'Open scene')}
            onclick={(event) => { event.stopPropagation(); viewScene(linkedSceneUuid); }}
          >{linkedSceneLabel}</button>
          <button
            type="button"
            class="manager-icon-button is-danger"
            aria-label={text('FABRICATE.Admin.Manager.Environment.Events.SceneUnlink', 'Unlink scene')}
            title={text('FABRICATE.Admin.Manager.Environment.Events.SceneUnlink', 'Unlink scene')}
            onclick={unlinkScene}
          >
            <i class="fas fa-link-slash" aria-hidden="true"></i>
          </button>
        </div>
      {:else}
        <div
          class="manager-gathering-event-scene-dropzone"
          data-gathering-event-scene-dropzone
          use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}
        >
          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.SceneDropHint', 'Drag a scene here to link it.')}</span>
        </div>
      {/if}
    </section>

  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Environment.Events.SelectEvent', 'Select an event to edit')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Environment.Events.SelectEventHint', 'Choose an event from the browser to edit its identity, matching, and modifiers.')}</p>
      </div>
    </div>
  {/if}
</main>
