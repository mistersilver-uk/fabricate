<!-- Svelte 5 runes mode -->
<script>
  import { localize, viewScene } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import { sceneDocumentImage } from '../../../util/sceneImages.js';
  import CompositionModeControl from './CompositionModeControl.svelte';

  let {
    environment = null,
    composition = { counts: {}, conditions: {} },
    regionOptions = [],
    biomeOptions = [],
    dangerOptions = [],
    onPickImagePath = null,
    onUpdate = () => {},
    onSetCompositionMode = () => {}
  } = $props();

  const DANGER_LEVELS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];
  const DEFAULT_ENVIRONMENT_IMAGE_DIR = 'icons/environment/';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function optId(option) { return String(option?.id ?? option ?? '').trim(); }
  function optLabel(option) { return String(option?.label ?? option?.id ?? option ?? '').trim(); }

  const biomes = $derived(Array.isArray(environment?.biomes) ? environment.biomes : []);
  const availableBiomes = $derived(biomeOptions.filter(option => !biomes.includes(optId(option))));
  const dangerLevel = $derived(DANGER_LEVELS.includes(environment?.dangerLevel) ? environment.dangerLevel : 'safe');
  const sceneUuid = $derived(String(environment?.sceneUuid || ''));
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');

  function addBiome(event) {
    const id = String(event.currentTarget.value || '').trim();
    if (!id) return;
    if (!biomes.includes(id)) onUpdate({ biomes: [...biomes, id] });
    event.currentTarget.value = '';
  }
  function removeBiome(id) { onUpdate({ biomes: biomes.filter(value => value !== id) }); }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(environment?.img || DEFAULT_ENVIRONMENT_IMAGE_DIR);
    if (value) onUpdate({ img: value });
  }

  let sceneThumb = $state('');
  let sceneName = $state('');
  $effect(() => {
    const uuid = sceneUuid;
    sceneThumb = '';
    sceneName = '';
    if (!uuid || typeof globalThis.fromUuid !== 'function') return;
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid)).then(doc => {
      if (cancelled || !doc) return;
      sceneName = String(doc.name || '');
      sceneThumb = sceneDocumentImage(doc);
    }).catch(() => {});
    return () => { cancelled = true; };
  });
  const sceneLabel = $derived(sceneName || sceneUuid);

  function handleSceneDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Scene' || !uuid) return;
    onUpdate({ sceneUuid: uuid });
  }
  function unlinkScene() { onUpdate({ sceneUuid: '' }); }
  function onLinkedSceneMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkScene();
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
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Hazards.DangerTag.${id}`, id.charAt(0).toUpperCase() + id.slice(1));
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
            <button type="button" class="manager-task-image-picker" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ChooseImage', 'Choose environment image')} onclick={chooseImage} disabled={typeof onPickImagePath !== 'function'}>
              <img src={environment.img || 'icons/svg/direction.svg'} alt="" />
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <div class="manager-task-core-status">
              <button
                type="button"
                class={`manager-status-toggle ${environment.enabled === false ? 'is-off' : 'is-on'}`}
                data-environment-field="enabled"
                aria-pressed={environment.enabled !== false}
                onclick={() => onUpdate({ enabled: environment.enabled === false })}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">{environment.enabled === false ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Draft', 'Draft') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Active', 'Active')}</span>
              </button>
              <p class="manager-muted">{environment.enabled === false
                ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.DraftHint', 'Draft environments are hidden from players.')
                : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ActiveHint', 'Active environments are available to players.')}</p>
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
              <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RegionHint', 'Where this environment is. Records match its region, or any region.')}</p>
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
                {#each DANGER_LEVELS as level (level)}
                  <option value={level}>{dangerLabel(level)}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="manager-field manager-environment-context-field manager-environment-context-biomes">
            <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Biomes', 'Biomes')}</span>
            <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BiomesHint', 'The terrain here. Records match if they share a biome.')}</p>
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

      <section class="manager-environment-card" data-overview-section="scene">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Scene', 'Linked scene')}</h3>
        {#if sceneUuid}
          <div
            class="manager-environment-scene-linked"
            data-overview-scene-linked
            title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneReplaceTooltip', 'Drop a scene to replace it, or right-click to unlink.')}
            use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}
            oncontextmenu={(event) => { event.preventDefault(); unlinkScene(); }}
            onmousedown={onLinkedSceneMouseDown}
          >
            {#if sceneThumb}
              <img class="manager-environment-scene-thumb" src={sceneThumb} alt="" />
            {:else}
              <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-map"></i></span>
            {/if}
            <button type="button" class="manager-environment-scene-name" onclick={(event) => { event.stopPropagation(); viewScene(sceneUuid); }} title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.OpenScene', 'Open scene')}>{sceneLabel}</button>
            <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnlinkScene', 'Unlink scene')} title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnlinkScene', 'Unlink scene')} onclick={(event) => { event.stopPropagation(); unlinkScene(); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
          </div>
        {:else}
          <div class="manager-environment-scene-dropzone" use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}>
            <i class="fas fa-map-location-dot" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneDropHint', 'Drag a scene here to link it.')}</span>
          </div>
        {/if}
      </section>

    </div>
  {/if}
</section>
