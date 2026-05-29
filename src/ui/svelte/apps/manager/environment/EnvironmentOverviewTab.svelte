<!-- Svelte 5 runes mode -->
<script>
  import { localize, viewScene } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
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

  const DEFAULT_DANGER = ['safe', 'hazardous', 'dangerous', 'deadly'];
  const DEFAULT_ENVIRONMENT_IMAGE_DIR = 'icons/environment/';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function optId(option) { return String(option?.id ?? option ?? '').trim(); }
  function optLabel(option) { return String(option?.label ?? option?.id ?? option ?? '').trim(); }

  const biomes = $derived(Array.isArray(environment?.biomes) ? environment.biomes : []);
  const dangerTags = $derived(Array.isArray(environment?.dangerTags) ? environment.dangerTags : []);
  const dangerChoices = $derived((dangerOptions && dangerOptions.length ? dangerOptions.map(optId) : DEFAULT_DANGER));
  const availableBiomes = $derived(biomeOptions.filter(option => !biomes.includes(optId(option))));
  const availableDanger = $derived(dangerChoices.filter(tag => !dangerTags.includes(tag)));
  const sceneUuid = $derived(String(environment?.sceneUuid || ''));
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');

  function addBiome(event) {
    const id = String(event.currentTarget.value || '').trim();
    if (!id) return;
    if (!biomes.includes(id)) onUpdate({ biomes: [...biomes, id] });
    event.currentTarget.value = '';
  }
  function removeBiome(id) { onUpdate({ biomes: biomes.filter(value => value !== id) }); }

  function addDanger(event) {
    const id = String(event.currentTarget.value || '').trim();
    if (!id) return;
    if (!dangerTags.includes(id)) onUpdate({ dangerTags: [...dangerTags, id] });
    event.currentTarget.value = '';
  }
  function removeDanger(id) { onUpdate({ dangerTags: dangerTags.filter(value => value !== id) }); }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(environment?.img || DEFAULT_ENVIRONMENT_IMAGE_DIR);
    if (value) onUpdate({ img: value });
  }

  function handleSceneDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Scene' || !uuid) return;
    onUpdate({ sceneUuid: uuid });
  }
  function unlinkScene() { onUpdate({ sceneUuid: '' }); }

  function biomeLabel(id) {
    return optLabel(biomeOptions.find(option => optId(option) === id)) || id;
  }
  function dangerLabel(id) {
    return text(`FABRICATE.Admin.Manager.Environment.Hazards.DangerTag.${id}`, id.charAt(0).toUpperCase() + id.slice(1));
  }
</script>

<section class="manager-environment-tab manager-environment-overview" data-environment-tab="overview" aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.Title', 'Overview')}>
  {#if !environment}
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Overview.Empty', 'No environment loaded.')}</p>
  {:else}
    <div class="manager-environment-overview-stack">
      <section class="manager-task-core-card" data-overview-section="identity">
        <div class="manager-task-card-heading">
          <div>
            <h3>{text('FABRICATE.Admin.Manager.Environment.Overview.Identity', 'Environment identity')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Overview.IdentityHint', 'Name the environment, describe it, choose an image, and toggle whether it is active.')}</p>
          </div>
        </div>
        <div class="manager-task-core-grid">
          <div class="manager-task-media-column">
            <button type="button" class="manager-task-image-picker" aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.ChooseImage', 'Choose environment image')} onclick={chooseImage} disabled={typeof onPickImagePath !== 'function'}>
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
                <span class="manager-status-toggle-label">{environment.enabled === false ? text('FABRICATE.Admin.Manager.Environment.Overview.Draft', 'Draft') : text('FABRICATE.Admin.Manager.Environment.Overview.Active', 'Active')}</span>
              </button>
              <p class="manager-muted">{environment.enabled === false
                ? text('FABRICATE.Admin.Manager.Environment.Overview.DraftHint', 'Draft environments are hidden from players.')
                : text('FABRICATE.Admin.Manager.Environment.Overview.ActiveHint', 'Active environments are available to players.')}</p>
            </div>
          </div>
          <div class="manager-task-identity-fields">
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Environment.Overview.Name', 'Name')}</span>
              <input data-environment-field="name" value={environment.name || ''} oninput={(event) => onUpdate({ name: event.currentTarget.value })} />
            </label>
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Environment.Overview.Description', 'Description')}</span>
              <textarea data-environment-field="description" value={environment.description || ''} oninput={(event) => onUpdate({ description: event.currentTarget.value })}></textarea>
            </label>
          </div>
        </div>
      </section>

      <section class="manager-environment-card" data-overview-section="context">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Overview.Context', 'Environment context')}</h3>
        <div class="manager-environment-context-grid">
          <label class="manager-field manager-environment-context-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Overview.Region', 'Region')}</span>
            <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.Environment.Overview.RegionHint', 'Where this environment is — records match its region or any region.')}</p>
            <select data-environment-field="region" value={environment.region || ''} onchange={(event) => onUpdate({ region: event.currentTarget.value })}>
              <option value="">{text('FABRICATE.Admin.Manager.Environment.Overview.AnyRegion', 'Any region')}</option>
              {#each regionOptions as option (optId(option))}
                <option value={optId(option)}>{optLabel(option)}</option>
              {/each}
            </select>
          </label>

          <div class="manager-field manager-environment-context-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Overview.Biomes', 'Biomes')}</span>
            <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.Environment.Overview.BiomesHint', 'Terrain here — records match if they share a biome.')}</p>
            {#if availableBiomes.length > 0}
              <select aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.AddBiome', 'Add biome')} onchange={addBiome}>
                <option value="">{text('FABRICATE.Admin.Manager.Environment.Overview.AddBiome', 'Add biome')}</option>
                {#each availableBiomes as option (optId(option))}
                  <option value={optId(option)}>{optLabel(option)}</option>
                {/each}
              </select>
            {/if}
            <div class="manager-availability-pill-row" data-environment-field="biomes">
              {#if biomes.length > 0}
                {#each biomes as id (id)}
                  <span class="manager-availability-pill">
                    <span>{biomeLabel(id)}</span>
                    <button type="button" class="manager-availability-remove" aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.RemoveBiome', 'Remove {name}').replace('{name}', biomeLabel(id))} onclick={() => removeBiome(id)}><i class="fas fa-xmark" aria-hidden="true"></i></button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Overview.NoBiomes', 'No biomes selected')}</span>
              {/if}
            </div>
          </div>

          <div class="manager-field manager-environment-context-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Overview.Danger', 'Danger level')}</span>
            <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.Environment.Overview.DangerHint', 'Caps eligible hazards; those up to this level can appear.')}</p>
            {#if availableDanger.length > 0}
              <select aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.AddDanger', 'Add danger tag')} onchange={addDanger}>
                <option value="">{text('FABRICATE.Admin.Manager.Environment.Overview.AddDanger', 'Add danger tag')}</option>
                {#each availableDanger as id (id)}
                  <option value={id}>{dangerLabel(id)}</option>
                {/each}
              </select>
            {/if}
            <div class="manager-availability-pill-row" data-environment-field="dangerTags">
              {#if dangerTags.length > 0}
                {#each dangerTags as id (id)}
                  <span class={`manager-danger-tag-pill is-${id}`}>
                    <span>{dangerLabel(id)}</span>
                    <button type="button" class="manager-availability-remove" aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.RemoveDanger', 'Remove {name}').replace('{name}', dangerLabel(id))} onclick={() => removeDanger(id)}><i class="fas fa-xmark" aria-hidden="true"></i></button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Overview.NoDanger', 'No danger tags')}</span>
              {/if}
            </div>
          </div>
        </div>
      </section>

      <div class="manager-environment-overview-duo">
      <section class="manager-environment-card" data-overview-section="player">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Overview.PlayerFacing', 'Player-facing behaviour')}</h3>
        <div class="manager-environment-mode-control" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.SelectionMode', 'Task selection mode')}>
          {#each [['targeted', 'Targeted', 'fas fa-eye'], ['blind', 'Blind', 'fas fa-eye-slash']] as option (option[0])}
            <button
              type="button"
              role="radio"
              class={`manager-environment-mode-option ${selectionMode === option[0] ? 'is-selected' : ''}`}
              aria-checked={selectionMode === option[0]}
              data-selection-mode-option={option[0]}
              onclick={() => onUpdate({ selectionMode: option[0] })}
            >
              <span class="manager-environment-mode-head"><i class={option[2]} aria-hidden="true"></i><span>{text(`FABRICATE.Admin.Manager.Environment.Overview.${option[1]}`, option[1])}</span></span>
            </button>
          {/each}
        </div>
        <p class="manager-muted manager-environment-mode-hint">
          {selectionMode === 'blind'
            ? text('FABRICATE.Admin.Manager.Environment.Overview.BlindHint', 'Players get a generic gather action unless tasks are revealed.')
            : text('FABRICATE.Admin.Manager.Environment.Overview.TargetedHint', 'Players choose a visible task.')}
        </p>
      </section>

      <section class="manager-environment-card" data-overview-section="composition">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Overview.CompositionMode', 'Composition mode')}</h3>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Overview.CompositionModeHint', 'Shared by tasks and hazards.')}</p>
        <CompositionModeControl mode={environment.compositionMode || 'automatic'} onChange={onSetCompositionMode} />
      </section>
      </div>

      <section class="manager-environment-card" data-overview-section="scene">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Overview.Scene', 'Linked scene')}</h3>
        {#if sceneUuid}
          <div class="manager-environment-scene-linked">
            <button type="button" class="manager-environment-scene-name" onclick={() => viewScene(sceneUuid)} title={text('FABRICATE.Admin.Manager.Environment.Overview.OpenScene', 'Open scene')}>{sceneUuid}</button>
            <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.Overview.UnlinkScene', 'Unlink scene')} onclick={unlinkScene}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
          </div>
        {:else}
          <div class="manager-environment-scene-dropzone" use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}>
            <i class="fas fa-map-location-dot" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Environment.Overview.SceneDropHint', 'Drag a scene here to link it.')}</span>
          </div>
        {/if}
      </section>

    </div>
  {/if}
</section>
