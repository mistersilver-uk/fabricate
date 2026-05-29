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
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');

  const BLIND_STRATEGIES = ['firstAvailable', 'weightedRandom', 'rollTable', 'macro'];
  const blindSelection = $derived(environment?.blindSelection || {});
  const blindStrategy = $derived(BLIND_STRATEGIES.includes(blindSelection.strategy) ? blindSelection.strategy : 'firstAvailable');
  const revealOverride = $derived(environment?.reveal || null);
  const revealPolicy = $derived(revealOverride?.policy ?? 'inherit');
  const revealScope = $derived(revealOverride?.scope ?? 'actor');

  function setBlindStrategy(strategy) {
    onUpdate({ blindSelection: { ...blindSelection, strategy } });
  }
  function setBlindUuid(field, value) {
    const normalized = String(value || '').trim();
    onUpdate({ blindSelection: { ...blindSelection, [field]: normalized || null } });
  }
  function setRevealPolicy(value) {
    if (value === 'inherit') { onUpdate({ reveal: null }); return; }
    onUpdate({ reveal: { policy: value, scope: revealScope } });
  }
  function setRevealScope(value) {
    onUpdate({ reveal: { policy: revealOverride?.policy ?? 'never', scope: value } });
  }

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

      {#if selectionMode === 'blind'}
        <section class="manager-environment-card" data-overview-section="blind">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindBehaviour', 'Blind behaviour')}</h3>
          <div class="manager-environment-context-split">
            <div class="manager-environment-context-col">
              <label class="manager-field manager-environment-context-field">
                <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindStrategy', 'Selection strategy')}</span>
                <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindStrategyHint', 'How the generic gather picks a task. Set per-task weights on the Tasks tab.')}</p>
                <select data-environment-field="blindStrategy" value={blindStrategy} onchange={(event) => setBlindStrategy(event.currentTarget.value)}>
                  <option value="firstAvailable">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindStrategyFirst', 'First available')}</option>
                  <option value="weightedRandom">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindStrategyWeighted', 'Weighted random')}</option>
                  <option value="rollTable">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindStrategyRollTable', 'Roll table')}</option>
                  <option value="macro">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindStrategyMacro', 'Macro')}</option>
                </select>
              </label>

              {#if blindStrategy === 'rollTable'}
                <label class="manager-field manager-environment-context-field">
                  <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindRollTableUuid', 'Roll table UUID')}</span>
                  <input data-environment-field="blindRollTableUuid" value={blindSelection.rollTableUuid || ''} oninput={(event) => setBlindUuid('rollTableUuid', event.currentTarget.value)} />
                </label>
              {:else if blindStrategy === 'macro'}
                <label class="manager-field manager-environment-context-field">
                  <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindMacroUuid', 'Macro UUID')}</span>
                  <input data-environment-field="blindMacroUuid" value={blindSelection.macroUuid || ''} oninput={(event) => setBlindUuid('macroUuid', event.currentTarget.value)} />
                </label>
              {/if}
            </div>

            <div class="manager-environment-context-col">
              <label class="manager-field manager-environment-context-field">
                <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealPolicy', 'Reveal after attempt')}</span>
                <p class="manager-muted manager-environment-context-hint">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealPolicyHint', 'Override the system reveal default for this environment.')}</p>
                <select data-environment-field="revealPolicy" value={revealPolicy} onchange={(event) => setRevealPolicy(event.currentTarget.value)}>
                  <option value="inherit">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealInherit', 'Use system default')}</option>
                  <option value="never">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealNever', 'Never reveal')}</option>
                  <option value="onSuccess">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealOnSuccess', 'Reveal on success')}</option>
                  <option value="onAttempt">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealOnAttempt', 'Reveal on any attempt')}</option>
                </select>
              </label>

              {#if revealPolicy !== 'inherit'}
                <label class="manager-field manager-environment-context-field">
                  <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealScope', 'Reveal scope')}</span>
                  <select data-environment-field="revealScope" value={revealScope} onchange={(event) => setRevealScope(event.currentTarget.value)}>
                    <option value="actor">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealScopeActor', 'Actor')}</option>
                    <option value="user">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealScopeUser', 'User')}</option>
                    <option value="party">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealScopeParty', 'Party')}</option>
                    <option value="global">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RevealScopeGlobal', 'Everyone')}</option>
                  </select>
                </label>
              {/if}
            </div>
          </div>
        </section>
      {/if}

    </div>
  {/if}
</section>
