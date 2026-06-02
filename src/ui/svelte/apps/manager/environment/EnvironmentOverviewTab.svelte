<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionModeControl from './CompositionModeControl.svelte';

  let {
    environment = null,
    composition = { counts: {}, conditions: {} },
    regionOptions = [],
    biomeOptions = [],
    dangerOptions = [],
    linkedSceneImage = '',
    onPickImagePath = null,
    onUpdate = () => {},
    onSetCompositionMode = () => {}
  } = $props();

  const isSceneLinked = $derived(Boolean(String(environment?.sceneUuid || '').trim()));

  const DANGER_LEVELS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];
  const DEFAULT_ENVIRONMENT_IMAGE_DIR = 'icons/environment/';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function optId(option) { return String(option?.id ?? option ?? '').trim(); }
  function optLabel(option) { return String(option?.label ?? option?.id ?? option ?? '').trim(); }
  function defaultDangerLabel(id) {
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Hazards.DangerTag.${id}`, id.charAt(0).toUpperCase() + id.slice(1));
  }
  function dangerOption(option) {
    const id = optId(option);
    const label = option && typeof option === 'object' && optLabel(option)
      ? optLabel(option)
      : defaultDangerLabel(id);
    return { id, label };
  }

  const biomes = $derived(Array.isArray(environment?.biomes) ? environment.biomes : []);
  const availableBiomes = $derived(biomeOptions.filter(option => !biomes.includes(optId(option))));
  const dangerLevelOptions = $derived((Array.isArray(dangerOptions) && dangerOptions.length > 0
    ? dangerOptions
    : DANGER_LEVELS
  ).map(dangerOption).filter(option => option.id));
  const dangerLevel = $derived(String(environment?.dangerLevel || '').trim() || 'safe');
  const renderedDangerOptions = $derived(dangerLevelOptions.some(option => option.id === dangerLevel)
    ? dangerLevelOptions
    : [{ id: dangerLevel, label: defaultDangerLabel(dangerLevel) }, ...dangerLevelOptions]);
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');

  function addBiome(event) {
    const id = String(event.currentTarget.value || '').trim();
    if (!id) return;
    if (!biomes.includes(id)) onUpdate({ biomes: [...biomes, id] });
    event.currentTarget.value = '';
  }
  function removeBiome(id) { onUpdate({ biomes: biomes.filter(value => value !== id) }); }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || isSceneLinked) return;
    const value = await onPickImagePath(environment?.img || DEFAULT_ENVIRONMENT_IMAGE_DIR);
    if (value) onUpdate({ img: value });
  }

  function biomeLabel(id) {
    return optLabel(biomeOptions.find(option => optId(option) === id)) || id;
  }
  function biomeColorStyle(id) {
    const option = biomeOptions.find(entry => optId(entry) === id);
    const hex = /^#[0-9a-fA-F]{6}$/.test(option?.customColor || '') ? option.customColor : '';
    const token = String(option?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
  }
  function dangerLabel(id) {
    const option = renderedDangerOptions.find(option => option.id === id);
    return option?.label || defaultDangerLabel(id);
  }
</script>

<section class="manager-environment-tab manager-environment-overview" data-environment-tab="overview" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Title', 'Overview')}>
  {#if !environment}
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Empty', 'No environment loaded.')}</p>
  {:else}
    <div class="manager-environment-overview-stack">
      <section class="manager-task-core-card" data-overview-section="identity">
        <div class="manager-task-card-heading">
          <div>
            <h3>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Identity', 'Environment identity')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.IdentityHint', 'Name the environment, describe it, choose an image, and toggle whether it is active.')}</p>
          </div>
        </div>
        <div class="manager-task-core-grid">
          <div class="manager-task-media-column">
            {#if isSceneLinked}
              <span
                class="manager-task-image-picker is-scene-linked"
                data-scene-locked-image
                title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneLockedImageTooltip', "This image comes from the linked scene and can't be edited. Unlink the scene to choose a custom image.")}
                aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneLockedImage', 'Image provided by the linked scene')}
              >
                <img src={linkedSceneImage || environment.img || 'icons/svg/direction.svg'} alt="" />
                <i class="fas fa-lock" aria-hidden="true"></i>
              </span>
            {:else}
              <button type="button" class="manager-task-image-picker" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ChooseImage', 'Choose environment image')} onclick={chooseImage} disabled={typeof onPickImagePath !== 'function'}>
                <img src={environment.img || 'icons/svg/direction.svg'} alt="" />
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
            {/if}
            <div class="manager-task-core-status">
              <button
                type="button"
                class={`manager-status-toggle ${environment.enabled === false ? 'is-off' : 'is-on'}`}
                data-environment-field="enabled"
                aria-pressed={environment.enabled !== false}
                onclick={() => onUpdate({ enabled: environment.enabled === false })}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">{environment.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}</span>
              </button>
              <p class="manager-muted">{environment.enabled === false
                ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.DraftHint', 'Hidden from players while off.')
                : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ActiveHint', 'Available to players while on.')}</p>
            </div>
          </div>
          <div class="manager-task-identity-fields">
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Name', 'Name')}</span>
              <input data-environment-field="name" value={environment.name || ''} oninput={(event) => onUpdate({ name: event.currentTarget.value })} />
            </label>
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Description', 'Description')}</span>
              <textarea data-environment-field="description" value={environment.description || ''} oninput={(event) => onUpdate({ description: event.currentTarget.value })}></textarea>
            </label>
          </div>
        </div>
      </section>

      <section class="manager-environment-card" data-overview-section="context">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Context', 'Environment context')}</h3>
        <div class="manager-environment-context-split">
          <div class="manager-environment-context-col">
            <label class="manager-field manager-environment-context-field">
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Region', 'Region')}</span>
              <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RegionHint', 'Where this environment is (optional). Tasks and hazards match a region if specified.')}</p>
              <select data-environment-field="region" value={environment.region || ''} onchange={(event) => onUpdate({ region: event.currentTarget.value })}>
                <option value="">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AnyRegion', 'Any region')}</option>
                {#each regionOptions as option (optId(option))}
                  <option value={optId(option)}>{optLabel(option)}</option>
                {/each}
              </select>
            </label>

            <label class="manager-field manager-environment-context-field">
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Danger', 'Danger level')}</span>
              <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.DangerHint', 'A ceiling — hazards up to and including this level can appear.')}</p>
              <select data-environment-field="dangerLevel" value={dangerLevel} onchange={(event) => onUpdate({ dangerLevel: event.currentTarget.value })}>
                {#each renderedDangerOptions as option (option.id)}
                  <option value={option.id}>{dangerLabel(option.id)}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="manager-field manager-environment-context-field manager-environment-context-biomes">
            <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Biomes', 'Biomes')}</span>
            <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BiomesHint', 'The terrain here. Tasks and hazards match if they share one or more biomes.')}</p>
            {#if availableBiomes.length > 0}
              <select aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AddBiome', 'Add biome')} onchange={addBiome}>
                <option value="">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AddBiome', 'Add biome')}</option>
                {#each availableBiomes as option (optId(option))}
                  <option value={optId(option)}>{optLabel(option)}</option>
                {/each}
              </select>
            {/if}
            <div class="manager-availability-pill-row" data-environment-field="biomes">
              {#if biomes.length > 0}
                {#each biomes as id (id)}
                  <span class="manager-availability-pill is-biome" style={biomeColorStyle(id)}>
                    <span>{biomeLabel(id)}</span>
                    <button type="button" class="manager-availability-remove" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RemoveBiome', 'Remove {name}').replace('{name}', biomeLabel(id))} onclick={() => removeBiome(id)}><i class="fas fa-xmark" aria-hidden="true"></i></button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.NoBiomes', 'No biomes selected')}</span>
              {/if}
            </div>
          </div>
        </div>
      </section>

      <div class="manager-environment-overview-duo">
      <section class="manager-environment-card" data-overview-section="player">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.PlayerFacing', 'Player-facing behaviour')}</h3>
        <div class="manager-environment-mode-control" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SelectionMode', 'Task selection mode')}>
          {#each [['targeted', 'Targeted', 'fas fa-eye'], ['blind', 'Blind', 'fas fa-eye-slash']] as option (option[0])}
            <button
              type="button"
              role="radio"
              class={`manager-environment-mode-option ${selectionMode === option[0] ? 'is-selected' : ''}`}
              aria-checked={selectionMode === option[0]}
              data-selection-mode-option={option[0]}
              onclick={() => onUpdate({ selectionMode: option[0] })}
            >
              <span class="manager-environment-mode-head"><i class={option[2]} aria-hidden="true"></i><span>{text(`FABRICATE.Admin.Manager.EnvironmentEditor.Overview.${option[1]}`, option[1])}</span></span>
            </button>
          {/each}
        </div>
        <p class="manager-muted manager-environment-mode-hint">
          {selectionMode === 'blind'
            ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindHint', 'Players get a generic gather action unless tasks are revealed.')
            : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.TargetedHint', 'Players choose a visible task.')}
        </p>
      </section>

      <section class="manager-environment-card" data-overview-section="composition">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.CompositionMode', 'Composition mode')}</h3>
        <CompositionModeControl mode={environment.compositionMode || 'automatic'} onChange={onSetCompositionMode} />
      </section>
      </div>

    </div>
  {/if}
</section>
