<!-- Svelte 5 runes mode -->
<!--
  GatheringEconomyView is the GM authoring surface for a crafting system's
  gathering limitation economy. It lives in the gathering "Settings" tab and:
   - selects the system limitation mode (none / stamina / nodes);
   - configures stamina regeneration over world time (fixed amount or formula,
     per minute/hour/day/week) when in stamina mode;
   - lists player-owned actors with editable stamina pools (current/max) plus
     quick +/- adjustments, for manual GM control.

  All persistence goes through the GM-only game.fabricate endpoints exposed on
  the injected `services` bag (getGatheringEconomy/setGatheringEconomy,
  getGatheringStaminaState/setGatheringStamina/adjustGatheringStamina).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { services = null, systemId = '' } = $props();

  function text(key, fallback) {
    const value = localize(key);
    return value === key ? fallback : value;
  }

  const UNITS = ['minutes', 'hours', 'days', 'weeks'];

  let economy = $state(defaultEconomy());
  let staminaActors = $state([]);
  let loaded = $state(false);

  function defaultEconomy() {
    return { mode: 'none', stamina: { regen: { policy: 'none', unit: 'hours', amount: null, formula: '', characterModifiers: [] } } };
  }

  // Reload economy + actor stamina whenever the selected system changes.
  $effect(() => {
    const id = systemId;
    loaded = false;
    if (!id || !services) {
      economy = defaultEconomy();
      staminaActors = [];
      loaded = true;
      return;
    }
    const econ = services.getGatheringEconomy?.({ systemId: id });
    economy = normalizeEconomy(econ);
    refreshStaminaActors(id);
    loaded = true;
  });

  function normalizeEconomy(raw) {
    const base = defaultEconomy();
    if (!raw || typeof raw !== 'object') return base;
    const regen = raw.stamina?.regen || {};
    return {
      mode: ['none', 'stamina', 'nodes'].includes(raw.mode) ? raw.mode : 'none',
      stamina: {
        regen: {
          policy: ['none', 'elapsedTime'].includes(regen.policy) ? regen.policy : 'none',
          unit: UNITS.includes(regen.unit) ? regen.unit : 'hours',
          amount: regen.amount ?? null,
          formula: String(regen.formula ?? ''),
          characterModifiers: Array.isArray(regen.characterModifiers) ? regen.characterModifiers : []
        }
      }
    };
  }

  function refreshStaminaActors(id = systemId) {
    const list = services?.getGatheringStaminaState?.({ systemId: id }) ?? [];
    staminaActors = Array.isArray(list)
      ? list.map(actor => ({ ...actor, draftCurrent: actor.current ?? 0, draftMax: actor.max ?? 0 }))
      : [];
  }

  async function persistEconomy() {
    if (!services || !systemId) return;
    await services.setGatheringEconomy?.({ systemId, economy: $state.snapshot(economy) });
  }

  function setMode(mode) {
    economy.mode = mode;
    void persistEconomy();
  }

  function updateRegen(patch) {
    economy.stamina.regen = { ...economy.stamina.regen, ...patch };
    void persistEconomy();
  }

  async function saveActor(actor) {
    if (!services) return;
    await services.setGatheringStamina?.({
      systemId,
      actorId: actor.actorId,
      current: Number(actor.draftCurrent) || 0,
      max: Number(actor.draftMax) || 0,
      provider: actor.provider
    });
    refreshStaminaActors();
  }

  async function adjustActor(actor, delta) {
    if (!services) return;
    await services.adjustGatheringStamina?.({ systemId, actorId: actor.actorId, delta });
    refreshStaminaActors();
  }

  const MODE_OPTIONS = [
    { id: 'none', icon: 'fas fa-infinity', labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.None', labelFallback: 'No limit' },
    { id: 'stamina', icon: 'fas fa-bolt', labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.Stamina', labelFallback: 'Stamina' },
    { id: 'nodes', icon: 'fas fa-mountain', labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.Nodes', labelFallback: 'Resource nodes' }
  ];
</script>

<div class="manager-gathering-economy" data-gathering-economy-view>
  <section class="manager-card" data-economy-mode-card>
    <header class="manager-card-head">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Economy.ModeTitle', 'Limitation mode')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.ModeHint', 'How this system limits how often tasks can be attempted.')}</p>
    </header>
    <div class="manager-economy-mode-options" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Economy.ModeTitle', 'Limitation mode')}>
      {#each MODE_OPTIONS as option (option.id)}
        <button
          type="button"
          class={`manager-economy-mode-option ${economy.mode === option.id ? 'is-active' : ''}`}
          role="radio"
          aria-checked={economy.mode === option.id}
          data-economy-mode-option={option.id}
          onclick={() => setMode(option.id)}
        >
          <i class={option.icon} aria-hidden="true"></i>
          <span>{text(option.labelKey, option.labelFallback)}</span>
        </button>
      {/each}
    </div>
  </section>

  {#if economy.mode === 'stamina'}
    <section class="manager-card" data-economy-regen-card>
      <header class="manager-card-head">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Economy.RegenTitle', 'Stamina regeneration')}</h3>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.RegenHint', 'How much stamina actors recover as world time passes.')}</p>
      </header>

      <label class="manager-field">
        <span>{text('FABRICATE.Admin.Manager.Economy.RegenPolicy', 'Regeneration')}</span>
        <select value={economy.stamina.regen.policy} onchange={(e) => updateRegen({ policy: e.currentTarget.value })} data-economy-regen-policy>
          <option value="none">{text('FABRICATE.Admin.Manager.Economy.RegenPolicyNone', 'Manual only')}</option>
          <option value="elapsedTime">{text('FABRICATE.Admin.Manager.Economy.RegenPolicyElapsed', 'Over world time')}</option>
        </select>
      </label>

      {#if economy.stamina.regen.policy === 'elapsedTime'}
        <div class="manager-economy-regen-grid">
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RegenPer', 'Per')}</span>
            <select value={economy.stamina.regen.unit} onchange={(e) => updateRegen({ unit: e.currentTarget.value })} data-economy-regen-unit>
              {#each UNITS as unit (unit)}
                <option value={unit}>{text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, unit)}</option>
              {/each}
            </select>
          </label>
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RegenAmount', 'Fixed amount')}</span>
            <input
              type="number" min="0" step="1"
              value={economy.stamina.regen.amount ?? ''}
              oninput={(e) => updateRegen({ amount: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
              data-economy-regen-amount
            />
          </label>
        </div>
        <label class="manager-field">
          <span>{text('FABRICATE.Admin.Manager.Economy.RegenFormula', 'Formula (overrides fixed amount)')}</span>
          <input
            type="text"
            placeholder="@abilities.con.mod"
            value={economy.stamina.regen.formula}
            oninput={(e) => updateRegen({ formula: e.currentTarget.value })}
            data-economy-regen-formula
          />
        </label>
        <p class="manager-muted manager-economy-regen-note">{text('FABRICATE.Admin.Manager.Economy.RegenModifiersNote', 'Character-modifier adjustments to regeneration can be configured via the API.')}</p>
      {/if}
    </section>
  {/if}

  {#if economy.mode === 'stamina'}
    <section class="manager-card" data-economy-stamina-actors>
      <header class="manager-card-head">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Economy.ActorsTitle', 'Actor stamina pools')}</h3>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.ActorsHint', 'Set or adjust each gatherer’s stamina pool.')}</p>
      </header>
      {#if staminaActors.length === 0}
        <p class="manager-muted" data-economy-no-actors>{text('FABRICATE.Admin.Manager.Economy.NoActors', 'No player-owned actors found.')}</p>
      {:else}
        <ul class="manager-economy-actor-list">
          {#each staminaActors as actor (actor.actorId)}
            <li class="manager-economy-actor-row" data-economy-actor-id={actor.actorId}>
              <span class="manager-economy-actor-identity">
                <img class="manager-economy-actor-thumb" src={actor.img || 'icons/svg/mystery-man.svg'} alt="" />
                <span class="manager-economy-actor-name">{actor.name}</span>
              </span>
              <span class="manager-economy-actor-fields">
                <label class="manager-field is-compact">
                  <span>{text('FABRICATE.Admin.Manager.Economy.Current', 'Current')}</span>
                  <input type="number" min="0" step="1" bind:value={actor.draftCurrent} data-economy-actor-current />
                </label>
                <label class="manager-field is-compact">
                  <span>{text('FABRICATE.Admin.Manager.Economy.Max', 'Max')}</span>
                  <input type="number" min="0" step="1" bind:value={actor.draftMax} disabled={actor.provider && actor.provider !== 'fabricate'} data-economy-actor-max />
                </label>
                <span class="manager-economy-actor-actions">
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Economy.Decrease', 'Decrease')} onclick={() => adjustActor(actor, -1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Economy.Increase', 'Increase')} onclick={() => adjustActor(actor, 1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                  <button type="button" class="manager-button is-primary" onclick={() => saveActor(actor)}>{text('FABRICATE.Admin.Manager.Economy.Save', 'Save')}</button>
                </span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if economy.mode === 'nodes'}
    <section class="manager-card" data-economy-nodes-note>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.NodesNote', 'In nodes mode, set each task’s node count and respawn on the environment’s task inspector.')}</p>
    </section>
  {/if}
</div>

<style>
  .manager-gathering-economy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .manager-economy-mode-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .manager-economy-mode-option {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
    font-weight: 600;
  }

  .manager-economy-mode-option.is-active {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
  }

  .manager-economy-regen-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--fab-space-2);
  }

  .manager-economy-regen-note {
    margin-top: 4px;
    font-size: 11px;
  }

  .manager-economy-actor-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-economy-actor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    flex-wrap: wrap;
  }

  .manager-economy-actor-identity {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .manager-economy-actor-thumb {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    object-fit: cover;
  }

  .manager-economy-actor-name {
    font-weight: 600;
  }

  .manager-economy-actor-fields {
    display: inline-flex;
    align-items: flex-end;
    gap: var(--fab-space-2);
    flex-wrap: wrap;
  }

  .manager-field.is-compact {
    width: 84px;
  }

  .manager-economy-actor-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
</style>
