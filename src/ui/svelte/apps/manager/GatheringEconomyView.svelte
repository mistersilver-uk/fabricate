<!-- Svelte 5 runes mode -->
<!--
  GatheringEconomyView is the GM authoring surface for a crafting system's
  gathering limitation economy, shown in the gathering "Settings" tab as a single
  card:
   - selects the system limitation mode (none / stamina / nodes);
   - in stamina mode, a 2-column layout shows the stamina regeneration config on
     the left and a searchable, paginated, scrollable list of player characters
     (non-NPCs) with editable stamina pools (image, name, current, max, save) on
     the right.

  All persistence goes through the GM-only game.fabricate endpoints exposed on the
  injected `services` bag (getGatheringEconomy/setGatheringEconomy,
  getGatheringStaminaState/setGatheringStamina).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let { services = null, systemId = '' } = $props();

  function text(key, fallback) {
    const value = localize(key);
    return value === key ? fallback : value;
  }

  const UNITS = ['minutes', 'hours', 'days', 'weeks'];

  let economy = $state(defaultEconomy());
  let staminaActors = $state([]);
  let actorSearch = $state('');
  let actorPageIndex = $state(0);
  let actorPageSize = $state(6);

  function defaultEconomy() {
    return { mode: 'none', stamina: { max: '', start: '', regen: { policy: 'none', unit: 'hours', amount: '' } } };
  }

  // Reload economy + actor stamina whenever the selected system changes.
  $effect(() => {
    const id = systemId;
    if (!id || !services) {
      economy = defaultEconomy();
      staminaActors = [];
      return;
    }
    economy = normalizeEconomy(services.getGatheringEconomy?.({ systemId: id }));
    refreshStaminaActors(id);
  });

  // The characters matching the search box, and the current page of them.
  const filteredActors = $derived.by(() => {
    const term = actorSearch.trim().toLowerCase();
    if (!term) return staminaActors;
    return staminaActors.filter(actor => String(actor.name || '').toLowerCase().includes(term));
  });
  const pagedActors = $derived(filteredActors.slice(actorPageIndex * actorPageSize, (actorPageIndex + 1) * actorPageSize));

  // Keep the page index in range as the search term or list size changes.
  $effect(() => {
    const maxIndex = Math.max(0, Math.ceil(filteredActors.length / actorPageSize) - 1);
    if (actorPageIndex > maxIndex) actorPageIndex = maxIndex;
  });

  function normalizeEconomy(raw) {
    const base = defaultEconomy();
    if (!raw || typeof raw !== 'object') return base;
    const regen = raw.stamina?.regen || {};
    return {
      mode: ['none', 'stamina', 'nodes'].includes(raw.mode) ? raw.mode : 'none',
      stamina: {
        max: raw.stamina?.max == null ? '' : String(raw.stamina.max),
        start: raw.stamina?.start == null ? '' : String(raw.stamina.start),
        regen: {
          policy: ['none', 'elapsedTime'].includes(regen.policy) ? regen.policy : 'none',
          unit: UNITS.includes(regen.unit) ? regen.unit : 'hours',
          amount: regen.amount == null ? '' : String(regen.amount)
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

  // Max / starting stamina are expression templates (number or formula), rolled
  // once per character at seed time.
  function updateStamina(patch) {
    economy.stamina = { ...economy.stamina, ...patch };
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

  // (Re)roll a character's pool from the system max/start expressions.
  async function rollActor(actor) {
    if (!services) return;
    await services.rollGatheringStamina?.({ systemId, actorId: actor.actorId });
    refreshStaminaActors();
  }

  function onActorSearchInput(event) {
    actorSearch = event.currentTarget.value;
    actorPageIndex = 0;
  }

  const MODE_OPTIONS = [
    { id: 'none', icon: 'fas fa-infinity', labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.None', labelFallback: 'No limit' },
    { id: 'stamina', icon: 'fas fa-bolt', labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.Stamina', labelFallback: 'Stamina' },
    { id: 'nodes', icon: 'fas fa-mountain', labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.Nodes', labelFallback: 'Resource nodes' }
  ];
</script>

<div class="manager-gathering-economy" data-gathering-economy-view>
  <section class="manager-economy-card" data-economy-mode-card>
    <header class="manager-economy-card-head">
      <h3 class="manager-economy-card-title"><i class="fas fa-scale-balanced" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Economy.ModeTitle', 'Limitation mode')}</span></h3>
      <p class="manager-economy-card-hint">{text('FABRICATE.Admin.Manager.Economy.ModeHint', 'How this system limits how often tasks can be attempted.')}</p>
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

    {#if economy.mode === 'stamina'}
      <div class="manager-economy-stamina-grid">
        <div class="manager-economy-subsection" data-economy-regen-card>
          <h4 class="manager-economy-subtitle"><i class="fas fa-bolt" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Economy.RegenTitle', 'Stamina regeneration')}</span></h4>
          <p class="manager-economy-card-hint">{text('FABRICATE.Admin.Manager.Economy.RegenHint', 'How much stamina actors recover as world time passes.')}</p>

          <div class="manager-economy-regen-grid">
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Economy.MaxStamina', 'Maximum stamina')}</span>
              <input
                type="text"
                placeholder={text('FABRICATE.Admin.Manager.Economy.MaxStaminaPlaceholder', '40 or 4 * @abilities.con.mod')}
                value={economy.stamina.max}
                oninput={(e) => updateStamina({ max: e.currentTarget.value })}
                data-economy-stamina-max
              />
            </label>
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Economy.StartStamina', 'Starting stamina')}</span>
              <input
                type="text"
                placeholder={text('FABRICATE.Admin.Manager.Economy.StartStaminaPlaceholder', 'blank = full')}
                value={economy.stamina.start}
                oninput={(e) => updateStamina({ start: e.currentTarget.value })}
                data-economy-stamina-start
              />
            </label>
          </div>
          <p class="manager-economy-card-hint">{text('FABRICATE.Admin.Manager.Economy.MaxStaminaHint', 'A number or formula, rolled once per character (e.g. 40 or 4 * @abilities.con.mod). Starting stamina is the value characters begin at — blank means full.')}</p>

          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RegenPolicy', 'Regeneration')}</span>
            <select value={economy.stamina.regen.policy} onchange={(e) => updateRegen({ policy: e.currentTarget.value })} data-economy-regen-policy>
              <option value="none">{text('FABRICATE.Admin.Manager.Economy.RegenPolicyNone', 'Manual only')}</option>
              <option value="elapsedTime">{text('FABRICATE.Admin.Manager.Economy.RegenPolicyElapsed', 'Over world time')}</option>
            </select>
          </label>

          {#if economy.stamina.regen.policy === 'elapsedTime'}
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Economy.RegenPer', 'Per')}</span>
              <select value={economy.stamina.regen.unit} onchange={(e) => updateRegen({ unit: e.currentTarget.value })} data-economy-regen-unit>
                {#each UNITS as unit (unit)}
                  <option value={unit}>{text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, unit)}</option>
                {/each}
              </select>
            </label>
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Economy.RegenAmount', 'Amount per interval')}</span>
              <input
                type="text"
                placeholder={text('FABRICATE.Admin.Manager.Economy.RegenAmountPlaceholder', '1 or 1 + @abilities.con.mod')}
                value={economy.stamina.regen.amount}
                oninput={(e) => updateRegen({ amount: e.currentTarget.value })}
                data-economy-regen-amount
              />
            </label>
            <p class="manager-economy-card-hint">{text('FABRICATE.Admin.Manager.Economy.RegenAmountHint', 'A number or formula, evaluated for each character (e.g. 1 or 1 + @abilities.con.mod).')}</p>
          {/if}
        </div>

        <div class="manager-economy-subsection" data-economy-stamina-actors>
          <h4 class="manager-economy-subtitle"><i class="fas fa-users" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Economy.ActorsTitle', 'Actor stamina pools')}</span></h4>
          <p class="manager-economy-card-hint">{text('FABRICATE.Admin.Manager.Economy.ActorsHint', 'Set each gatherer’s stamina pool.')}</p>

          <input
            type="search"
            class="manager-economy-actor-search"
            placeholder={text('FABRICATE.Admin.Manager.Economy.SearchActors', 'Search characters…')}
            value={actorSearch}
            oninput={onActorSearchInput}
            data-economy-actor-search
          />

          {#if filteredActors.length === 0}
            <p class="manager-muted" data-economy-no-actors>{text('FABRICATE.Admin.Manager.Economy.NoActors', 'No characters found.')}</p>
          {:else}
            <ul class="manager-economy-actor-list" data-economy-actor-list>
              <li class="manager-economy-actor-row is-head" aria-hidden="true">
                <span class="manager-economy-actor-identity"></span>
                <span class="manager-economy-actor-col-label">{text('FABRICATE.Admin.Manager.Economy.Current', 'Current')}</span>
                <span class="manager-economy-actor-col-label">{text('FABRICATE.Admin.Manager.Economy.Max', 'Max')}</span>
                <span class="manager-economy-actor-save-spacer"></span>
              </li>
              {#each pagedActors as actor (actor.actorId)}
                <li class="manager-economy-actor-row" data-economy-actor-id={actor.actorId}>
                  <span class="manager-economy-actor-identity">
                    <img class="manager-economy-actor-thumb" src={actor.img || 'icons/svg/mystery-man.svg'} alt="" />
                    <span class="manager-economy-actor-name" title={actor.name}>{actor.name}</span>
                  </span>
                  <input class="manager-economy-actor-cell" type="number" min="0" step="1" placeholder="—" bind:value={actor.draftCurrent} aria-label={`${text('FABRICATE.Admin.Manager.Economy.Current', 'Current')} — ${actor.name}`} data-economy-actor-current />
                  <input class="manager-economy-actor-cell" type="number" min="0" step="1" placeholder="—" bind:value={actor.draftMax} disabled={actor.provider && actor.provider !== 'fabricate'} aria-label={`${text('FABRICATE.Admin.Manager.Economy.Max', 'Max')} — ${actor.name}`} data-economy-actor-max />
                  <span class="manager-economy-actor-actions">
                    <button type="button" class="manager-icon-button manager-economy-actor-roll" title={text('FABRICATE.Admin.Manager.Economy.RollHint', 'Roll this character’s pool from the max/start expressions')} aria-label={`${text('FABRICATE.Admin.Manager.Economy.Roll', 'Roll')} — ${actor.name}`} onclick={() => rollActor(actor)} data-economy-actor-roll><i class="fas fa-dice-d20" aria-hidden="true"></i></button>
                    <button type="button" class="manager-button is-primary manager-economy-actor-save" onclick={() => saveActor(actor)}>{text('FABRICATE.Admin.Manager.Economy.Save', 'Save')}</button>
                  </span>
                </li>
              {/each}
            </ul>
            <Pagination
              totalCount={filteredActors.length}
              pageSize={actorPageSize}
              pageIndex={actorPageIndex}
              pageSizeOptions={[6, 12, 24]}
              onPageChange={(index) => actorPageIndex = index}
              onPageSizeChange={(size) => { actorPageSize = size; actorPageIndex = 0; }}
            />
          {/if}
        </div>
      </div>
    {:else if economy.mode === 'nodes'}
      <div class="manager-economy-subsection" data-economy-nodes-note>
        <h4 class="manager-economy-subtitle"><i class="fas fa-mountain" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Economy.Mode.Nodes', 'Resource nodes')}</span></h4>
        <p class="manager-economy-card-hint">{text('FABRICATE.Admin.Manager.Economy.NodesNote', 'In nodes mode, set each task’s node count and respawn on the environment’s task inspector.')}</p>
      </div>
    {/if}
  </section>
</div>

<style>
  /* Span the full settings grid (2 columns) so the economy reads as one card
     above the Times-of-day / Weather / Regions panels. */
  .manager-gathering-economy {
    grid-column: 1 / -1;
  }

  /* Card chrome mirrors the sibling .manager-condition-panel. */
  .manager-economy-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-035);
  }

  .manager-economy-card-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .manager-economy-card-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--fab-mv2-text);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .manager-economy-card-title i,
  .manager-economy-subtitle i {
    color: var(--fab-mv2-accent);
  }

  .manager-economy-card-hint {
    margin: -2px 0 0;
    color: var(--fab-mv2-text-muted);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .manager-economy-mode-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .manager-economy-mode-option {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--fab-mv2-border);
    background: var(--fab-overlay-light-035);
    color: var(--fab-mv2-text);
    cursor: pointer;
    font-weight: 600;
  }

  .manager-economy-mode-option.is-active {
    border-color: var(--fab-mv2-accent);
    background: var(--fab-mv2-accent-soft, var(--fab-overlay-light-035));
    color: var(--fab-mv2-text);
  }

  /* Stamina mode: regen on the left, the (wider) actor pools on the right. */
  .manager-economy-stamina-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
    gap: 16px;
    align-items: start;
  }

  .manager-economy-subsection {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .manager-economy-subtitle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--fab-mv2-text);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .manager-economy-regen-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  /* Search box themed to match the manager's other text inputs. */
  .manager-economy-actor-search {
    width: 100%;
    box-sizing: border-box;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 6px;
    color: var(--fab-mv2-text);
    background: var(--fab-mv2-bg);
  }

  /* Scrollable character list (paginated above 6). */
  .manager-economy-actor-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
  }

  /* One row per character: image, name, current, max, save — all on one line.
     Fixed-width number/save cells align under the sticky column header. */
  .manager-economy-actor-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
    padding: 6px 8px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-035);
  }

  .manager-economy-actor-row.is-head {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 2px 8px;
    border: 0;
    background: var(--fab-overlay-light-035);
    color: var(--fab-mv2-text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    font-weight: 700;
  }

  .manager-economy-actor-identity {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .manager-economy-actor-thumb {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    object-fit: cover;
    flex: 0 0 auto;
  }

  .manager-economy-actor-name {
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-economy-actor-cell,
  .manager-economy-actor-col-label {
    flex: 0 0 auto;
    width: 58px;
    box-sizing: border-box;
    text-align: center;
  }

  .manager-economy-actor-cell {
    height: 30px;
    padding: 0 6px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 6px;
    color: var(--fab-mv2-text);
    background: var(--fab-mv2-bg);
  }

  .manager-economy-actor-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .manager-economy-actor-roll {
    flex: 0 0 auto;
  }

  .manager-economy-actor-save {
    flex: 0 0 auto;
    width: 60px;
    padding-left: 0;
    padding-right: 0;
    justify-content: center;
  }

  /* Header spacer matches the trailing actions group (roll icon + save) so the
     Current/Max captions stay aligned over their input cells. */
  .manager-economy-actor-save-spacer {
    flex: 0 0 auto;
    width: 104px;
  }

  /* Keep the actor-list pagination compact and on a single line. */
  .manager-economy-subsection :global(.manager-pagination) {
    flex-wrap: nowrap;
    gap: 8px;
    padding: 8px 0 0;
    border-top: 0;
    background: transparent;
  }

  .manager-economy-subsection :global(.manager-pagination-page) {
    min-width: auto;
  }

  .manager-economy-subsection :global(.manager-pagination-summary) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 980px) {
    .manager-economy-stamina-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
