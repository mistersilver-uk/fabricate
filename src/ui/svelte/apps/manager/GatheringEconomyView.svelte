<!-- Svelte 5 runes mode -->
<!--
  GatheringEconomyView is the GM authoring surface for a crafting system's
  gathering limitation economy, shown in the gathering "Settings" tab as a single
  card:
   - two independent toggle pills (Stamina / Resource nodes); both can be on at
     once (the anti-dogpiling combination), neither on means no limit;
   - when stamina is enabled, the stamina regeneration config stacks above a
     searchable, paginated, scrollable list of player characters (non-NPCs) with
     editable stamina pools (image, name, current, max, save). The two used to
     share a 2-column row; the pool table is a bulk-entry grid and needs the
     card's full width now that its cells are steppers (see the row grid below);
   - when resource nodes are enabled, a note points the GM to the per-task node
     config. Both sub-blocks can render together.

  All persistence goes through the GM-only game.fabricate endpoints exposed on the
  injected `services` bag (getGatheringEconomy/setGatheringEconomy,
  getGatheringStaminaState/setGatheringStamina).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { stepperLabels } from '../../components/stepperLabels.js';
  import ResolutionModeCard from './ResolutionModeCard.svelte';

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
    return {
      resolutionMode: 'd100',
      stamina: {
        enabled: false,
        max: '',
        start: '',
        regen: { policy: 'none', unit: 'hours', amount: '' },
      },
      nodes: { enabled: false },
    };
  }

  // Gathering resolution mode is system config (default d100, the only currently
  // implemented gathering resolution). progressive/routed are modelled but not yet
  // implemented, so they render disabled with a "Coming soon" badge.
  const GATHERING_RESOLUTION_MODES = ['d100', 'progressive', 'routed'];

  const gatheringResolutionModeOptions = [
    {
      value: 'd100',
      labelKey: 'FABRICATE.Admin.Manager.Economy.Resolution.D100',
      fallback: 'd100 roll',
      descKey: 'FABRICATE.Admin.Manager.Economy.Resolution.D100Desc',
      descFallback:
        'Each attempt rolls a d100 against the task’s drop tables to determine what is gathered.',
    },
    {
      value: 'progressive',
      labelKey: 'FABRICATE.Admin.Manager.Economy.Resolution.Progressive',
      fallback: 'Progressive',
      descKey: 'FABRICATE.Admin.Manager.Economy.Resolution.ProgressiveDesc',
      descFallback: 'A numeric check awards every drop whose difficulty threshold is met.',
      disabled: true,
      badgeKey: 'FABRICATE.Admin.SystemSettings.ResolutionComingSoon',
      badgeFallback: 'Coming soon',
    },
    {
      value: 'routed',
      labelKey: 'FABRICATE.Admin.Manager.Economy.Resolution.Routed',
      fallback: 'Routed by check',
      descKey: 'FABRICATE.Admin.Manager.Economy.Resolution.RoutedDesc',
      descFallback: 'The gathering check outcome selects which drop group is returned.',
      disabled: true,
      badgeKey: 'FABRICATE.Admin.SystemSettings.ResolutionComingSoon',
      badgeFallback: 'Coming soon',
    },
  ];

  function setResolutionMode(mode) {
    economy.resolutionMode = GATHERING_RESOLUTION_MODES.includes(mode) ? mode : 'd100';
    void persistEconomy();
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
    return staminaActors.filter((actor) =>
      String(actor.name || '')
        .toLowerCase()
        .includes(term)
    );
  });
  const pagedActors = $derived(
    filteredActors.slice(actorPageIndex * actorPageSize, (actorPageIndex + 1) * actorPageSize)
  );

  // Keep the page index in range as the search term or list size changes.
  $effect(() => {
    const maxIndex = Math.max(0, Math.ceil(filteredActors.length / actorPageSize) - 1);
    if (actorPageIndex > maxIndex) actorPageIndex = maxIndex;
  });

  // Mirror of the service `normalizeGatheringEconomy()` read-compat mapping:
  // "new flags present" means the `enabled` KEY exists (not merely truthy). Only
  // when neither key exists do we fall back to a legacy `mode`, so a stale `mode`
  // can never resurrect a disabled limitation.
  function normalizeEconomy(raw) {
    const base = defaultEconomy();
    if (!raw || typeof raw !== 'object') return base;
    const regen = raw.stamina?.regen || {};
    const hasStaminaFlag =
      raw.stamina != null && Object.prototype.hasOwnProperty.call(raw.stamina, 'enabled');
    const hasNodesFlag =
      raw.nodes != null && Object.prototype.hasOwnProperty.call(raw.nodes, 'enabled');
    const legacyMode = ['none', 'stamina', 'nodes'].includes(raw.mode) ? raw.mode : 'none';
    return {
      resolutionMode: GATHERING_RESOLUTION_MODES.includes(raw.resolutionMode)
        ? raw.resolutionMode
        : 'd100',
      stamina: {
        enabled: hasStaminaFlag ? raw.stamina.enabled === true : legacyMode === 'stamina',
        max: raw.stamina?.max == null ? '' : String(raw.stamina.max),
        start: raw.stamina?.start == null ? '' : String(raw.stamina.start),
        regen: {
          policy: ['none', 'overTime'].includes(regen.policy)
            ? regen.policy
            : regen.policy === 'elapsedTime'
              ? 'overTime'
              : 'none',
          unit: UNITS.includes(regen.unit) ? regen.unit : 'hours',
          amount: regen.amount == null ? '' : String(regen.amount),
        },
      },
      nodes: { enabled: hasNodesFlag ? raw.nodes.enabled === true : legacyMode === 'nodes' },
    };
  }

  function refreshStaminaActors(id = systemId) {
    const list = services?.getGatheringStaminaState?.({ systemId: id }) ?? [];
    staminaActors = Array.isArray(list)
      ? list.map((actor) => ({
          ...actor,
          rolled: actor.rolledMax != null,
          draftCurrent: actor.current ?? '',
          draftMaxOverride: actor.maxOverride ?? '',
        }))
      : [];
  }

  async function persistEconomy() {
    if (!services || !systemId) return;
    await services.setGatheringEconomy?.({ systemId, economy: $state.snapshot(economy) });
  }

  function setStamina(enabled) {
    economy.stamina = { ...economy.stamina, enabled };
    void persistEconomy();
  }

  function setNodes(enabled) {
    economy.nodes = { ...economy.nodes, enabled };
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

  // Bulk save: persist current + max override for every rolled character.
  // Un-rolled characters have no pool to write — they need Roll first.
  async function saveAll() {
    if (!services) return;
    for (const actor of staminaActors) {
      if (!actor.rolled) continue;
      await services.setGatheringStamina?.({
        systemId,
        actorId: actor.actorId,
        current: Number(actor.draftCurrent) || 0,
        maxOverride:
          actor.draftMaxOverride === '' || actor.draftMaxOverride == null
            ? null
            : Number(actor.draftMaxOverride),
        maxReadOnly: actor.maxReadOnly === true,
      });
    }
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

  // Two independent toggle pills. `enabled` reads its flag off the live economy;
  // `toggle` flips it. Both can be active at once; neither active = no limit.
  const TOGGLE_OPTIONS = [
    {
      id: 'stamina',
      icon: 'fas fa-bolt',
      labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.Stamina',
      labelFallback: 'Stamina',
      enabled: () => economy.stamina.enabled === true,
      toggle: () => setStamina(economy.stamina.enabled !== true),
    },
    {
      id: 'nodes',
      icon: 'fas fa-mountain',
      labelKey: 'FABRICATE.Admin.Manager.Economy.Mode.Nodes',
      labelFallback: 'Resource nodes',
      enabled: () => economy.nodes.enabled === true,
      toggle: () => setNodes(economy.nodes.enabled !== true),
    },
  ];

  const anyLimitEnabled = $derived(
    economy.stamina.enabled === true || economy.nodes.enabled === true
  );
</script>

<div class="manager-gathering-economy" data-gathering-economy-view>
  <section class="manager-economy-card" data-gathering-resolution-card>
    <ResolutionModeCard
      legendKey="FABRICATE.Admin.Manager.Economy.GatheringResolutionMode"
      legendFallback="Gathering resolution mode"
      options={gatheringResolutionModeOptions}
      selectedValue={economy.resolutionMode}
      groupName="manager-gathering-resolution-mode"
      dataAttr="data-gathering-resolution-mode"
      optionDataAttr="data-gathering-resolution-mode-option"
      onChange={setResolutionMode}
    />
  </section>

  <section class="manager-economy-card" data-economy-mode-card>
    <header class="manager-economy-card-head">
      <h3 class="manager-economy-card-title">
        <i class="fas fa-scale-balanced" aria-hidden="true"></i><span
          >{text('FABRICATE.Admin.Manager.Economy.ModeTitle', 'Limitation mode')}</span
        >
      </h3>
      <p class="manager-economy-card-hint">
        {text(
          'FABRICATE.Admin.Manager.Economy.ModeHint',
          'How this system limits how often tasks can be attempted.'
        )}
      </p>
    </header>

    <div
      class="manager-economy-mode-options"
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Economy.ModeTitle', 'Limitation mode')}
    >
      {#each TOGGLE_OPTIONS as option (option.id)}
        <button
          type="button"
          class={`manager-economy-mode-option ${option.enabled() ? 'is-active' : ''}`}
          aria-pressed={option.enabled()}
          data-economy-mode-option={option.id}
          onclick={option.toggle}
        >
          <i class={option.icon} aria-hidden="true"></i>
          <span>{text(option.labelKey, option.labelFallback)}</span>
        </button>
      {/each}
    </div>

    {#if !anyLimitEnabled}
      <p class="manager-economy-card-hint manager-muted" data-economy-no-limit-hint>
        {text(
          'FABRICATE.Admin.Manager.Economy.Mode.None',
          'No limit — tasks can be attempted freely.'
        )}
      </p>
    {/if}

    {#if economy.stamina.enabled}
      <!-- Regen config and the actor-pool table are SIBLING full-width children of the
           card, not two columns of one row. The actor table is a bulk-entry grid whose
           Current / Max cells are steppers: `minmax(140px, 1fr) 102px 102px 64px` plus
           three 8px gaps needs 432px of row content, and the old 1.35fr sub-column of a
           706px card afforded only 366px. Stacking them gives the table the card's full
           width (~676px of row content) instead of buying it back by crushing the actor
           name column below the point where a character is identifiable. -->
      <div class="manager-economy-subsection" data-economy-regen-card>
        <h4 class="manager-economy-subtitle">
          <i class="fas fa-bolt" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Economy.RegenTitle', 'Stamina regeneration')}</span
          >
        </h4>
        <p class="manager-economy-card-hint">
          {text(
            'FABRICATE.Admin.Manager.Economy.RegenHint',
            'How much stamina actors recover as world time passes.'
          )}
        </p>

        <div class="manager-economy-regen-grid">
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.MaxStamina', 'Maximum stamina')}</span>
            <input
              type="text"
              placeholder={text(
                'FABRICATE.Admin.Manager.Economy.MaxStaminaPlaceholder',
                '40 or 4 * @abilities.con.mod'
              )}
              value={economy.stamina.max}
              oninput={(e) => updateStamina({ max: e.currentTarget.value })}
              data-economy-stamina-max
            />
          </label>
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.StartStamina', 'Starting stamina')}</span>
            <input
              type="text"
              placeholder={text(
                'FABRICATE.Admin.Manager.Economy.StartStaminaPlaceholder',
                'blank = full'
              )}
              value={economy.stamina.start}
              oninput={(e) => updateStamina({ start: e.currentTarget.value })}
              data-economy-stamina-start
            />
          </label>
        </div>
        <p class="manager-economy-card-hint">
          {text(
            'FABRICATE.Admin.Manager.Economy.MaxStaminaHint',
            'A number or formula, rolled once per character (e.g. 40 or 4 * @abilities.con.mod). Starting stamina is the value characters begin at — blank means full.'
          )}
        </p>

        <div
          class="manager-economy-regen-grid"
          class:is-single={economy.stamina.regen.policy !== 'overTime'}
        >
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RegenPolicy', 'Regeneration')}</span>
            <select
              value={economy.stamina.regen.policy}
              onchange={(e) => updateRegen({ policy: e.currentTarget.value })}
              data-economy-regen-policy
            >
              <option value="none"
                >{text('FABRICATE.Admin.Manager.Economy.RegenPolicyNone', 'Manual only')}</option
              >
              <option value="overTime"
                >{text(
                  'FABRICATE.Admin.Manager.Economy.RegenPolicyElapsed',
                  'Over world time'
                )}</option
              >
            </select>
          </label>
          {#if economy.stamina.regen.policy === 'overTime'}
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.Economy.RegenPer', 'Per')}</span>
              <select
                value={economy.stamina.regen.unit}
                onchange={(e) => updateRegen({ unit: e.currentTarget.value })}
                data-economy-regen-unit
              >
                {#each UNITS as unit (unit)}
                  <option value={unit}
                    >{text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, unit)}</option
                  >
                {/each}
              </select>
            </label>
          {/if}
        </div>

        {#if economy.stamina.regen.policy === 'overTime'}
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RegenAmount', 'Amount per interval')}</span
            >
            <input
              type="text"
              placeholder={text(
                'FABRICATE.Admin.Manager.Economy.RegenAmountPlaceholder',
                '1 or 1 + @abilities.con.mod'
              )}
              value={economy.stamina.regen.amount}
              oninput={(e) => updateRegen({ amount: e.currentTarget.value })}
              data-economy-regen-amount
            />
          </label>
          <p class="manager-economy-card-hint">
            {text(
              'FABRICATE.Admin.Manager.Economy.RegenAmountHint',
              'A number or formula, evaluated for each character (e.g. 1 or 1 + @abilities.con.mod).'
            )}
          </p>
        {/if}
      </div>

      <div class="manager-economy-subsection" data-economy-stamina-actors>
        <h4 class="manager-economy-subtitle">
          <i class="fas fa-users" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Economy.ActorsTitle', 'Actor stamina pools')}</span
          >
        </h4>
        <p class="manager-economy-card-hint">
          {text('FABRICATE.Admin.Manager.Economy.ActorsHint', 'Set each gatherer’s stamina pool.')}
        </p>

        <input
          type="search"
          class="manager-economy-actor-search"
          placeholder={text('FABRICATE.Admin.Manager.Economy.SearchActors', 'Search characters…')}
          value={actorSearch}
          oninput={onActorSearchInput}
          data-economy-actor-search
        />

        {#if filteredActors.length === 0}
          <p class="manager-muted" data-economy-no-actors>
            {text('FABRICATE.Admin.Manager.Economy.NoActors', 'No characters found.')}
          </p>
        {:else}
          <ul class="manager-economy-actor-list" data-economy-actor-list>
            <li class="manager-economy-actor-row is-head">
              <span class="manager-economy-actor-identity"></span>
              <span class="manager-economy-actor-col-label"
                >{text('FABRICATE.Admin.Manager.Economy.Current', 'Current')}</span
              >
              <span class="manager-economy-actor-col-label"
                >{text('FABRICATE.Admin.Manager.Economy.Max', 'Max (override)')}</span
              >
              <ManagerButton
                role="primary"
                class="manager-economy-bulk-save"
                onclick={saveAll}
                data-economy-bulk-save
                >{text('FABRICATE.Admin.Manager.Economy.Save', 'Save')}</ManagerButton
              >
            </li>
            {#each pagedActors as actor (actor.actorId)}
              <li
                class="manager-economy-actor-row"
                data-economy-actor-id={actor.actorId}
                data-economy-actor-rolled={actor.rolled ? 'true' : 'false'}
              >
                <span class="manager-economy-actor-identity">
                  <img
                    class="manager-economy-actor-thumb"
                    src={actor.img || 'icons/svg/mystery-man.svg'}
                    alt=""
                  />
                  <span class="manager-economy-actor-name" title={actor.name}>{actor.name}</span>
                </span>
                <!-- Current is COSMETIC-ZERO: `saveAll` writes `Number(draftCurrent) || 0`,
                     so absence is not a value this field can persist. No `allowUnset`, and
                     an un-rolled row therefore reads `0` rather than blank. `bind:value` is
                     gone because `Stepper` exposes no bindable prop; the explicit assignment
                     below mutates the `$state` actor proxy, which is what `saveAll` reads. -->
                <Stepper
                  value={actor.draftCurrent}
                  min={0}
                  step={1}
                  fill
                  density="comfortable"
                  disabled={!actor.rolled}
                  {...stepperLabels(
                    `${text('FABRICATE.Admin.Manager.Economy.Current', 'Current')} — ${actor.name}`
                  )}
                  inputProps={{ 'data-economy-actor-current': '' }}
                  onChange={(next) => (actor.draftCurrent = next)}
                />
                <!-- Max IS genuine absence: `saveAll` maps `'' | null` to a null override,
                     meaning "no override, use the rolled max" — which is why the placeholder
                     shows that rolled max per row. -->
                <Stepper
                  value={actor.draftMaxOverride}
                  min={0}
                  step={1}
                  allowUnset
                  fill
                  density="comfortable"
                  disabled={!actor.rolled || actor.maxReadOnly === true}
                  placeholder={actor.rolledMax != null ? String(actor.rolledMax) : '—'}
                  {...stepperLabels(
                    `${text('FABRICATE.Admin.Manager.Economy.Max', 'Max (override)')} — ${actor.name}`
                  )}
                  inputProps={{ 'data-economy-actor-max': '' }}
                  onChange={(next) => (actor.draftMaxOverride = next)}
                />
                {#if actor.rolled}
                  <button
                    type="button"
                    class="manager-icon-button manager-economy-actor-roll"
                    title={text(
                      'FABRICATE.Admin.Manager.Economy.ResetHint',
                      'Re-roll this character’s pool from the max/start expressions'
                    )}
                    aria-label={`${text('FABRICATE.Admin.Manager.Economy.Reset', 'Reset')} — ${actor.name}`}
                    onclick={() => rollActor(actor)}
                    data-economy-actor-roll
                    ><i class="fas fa-arrows-rotate" aria-hidden="true"></i></button
                  >
                {:else}
                  <button
                    type="button"
                    class="manager-icon-button manager-economy-actor-roll is-roll-needed"
                    title={text(
                      'FABRICATE.Admin.Manager.Economy.RollHint',
                      'Roll this character’s pool from the max/start expressions'
                    )}
                    aria-label={`${text('FABRICATE.Admin.Manager.Economy.Roll', 'Roll')} — ${actor.name}`}
                    onclick={() => rollActor(actor)}
                    data-economy-actor-roll
                    ><i class="fas fa-dice-d20" aria-hidden="true"></i></button
                  >
                {/if}
              </li>
            {/each}
          </ul>
          <Pagination
            totalCount={filteredActors.length}
            pageSize={actorPageSize}
            pageIndex={actorPageIndex}
            pageSizeOptions={[6, 12, 24]}
            onPageChange={(index) => (actorPageIndex = index)}
            onPageSizeChange={(size) => {
              actorPageSize = size;
              actorPageIndex = 0;
            }}
          />
        {/if}
      </div>
    {/if}

    {#if economy.nodes.enabled}
      <div class="manager-economy-subsection" data-economy-nodes-note>
        <h4 class="manager-economy-subtitle">
          <i class="fas fa-mountain" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Economy.Mode.Nodes', 'Resource nodes')}</span
          >
        </h4>
        <p class="manager-economy-card-hint">
          {text(
            'FABRICATE.Admin.Manager.Economy.NodesNote',
            'Set each task’s node count and respawn on the environment’s task inspector.'
          )}
        </p>
      </div>
    {/if}
  </section>
</div>

<style>
  /* Span the full settings grid (2 columns) so the economy reads as one card
     above the Times-of-day / Weather / Regions panels. Stack the resolution-mode
     card and the limitation card vertically with the same gap the cards use
     internally, so the two sibling cards don't render flush against each other. */
  .manager-gathering-economy {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 14px;
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

  .manager-economy-subsection {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  /* The Phase 4 reflow moved the actor table out of `.manager-economy-stamina-grid` so it
     could have the card's full width, which left the regeneration card with the same full
     width — and it does not want it. `.manager-economy-regen-grid.is-single` is the DEFAULT
     state (Manual-only regen), so the first thing a GM sees after enabling Stamina was a
     two-option `<select>` stretched across all 706px of the card, with "Amount per
     interval" — a direct child of the subsection — doing the same. 480px keeps the two-up
     grid at a comfortable ~236px per field, which is WIDER than the ~190px the old 1.35fr
     sub-column afforded, while leaving the single-column state a sane control width. The
     actor table below is unaffected: it is a sibling subsection, not a child of this one. */
  .manager-economy-subsection[data-economy-regen-card] {
    max-width: 480px;
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

  /* Manual-only regen hides the Per select, so Regeneration spans full width. */
  .manager-economy-regen-grid.is-single {
    grid-template-columns: 1fr;
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

  /* Scrollable character list (paginated above 6). Right padding insets the rows
     and the sticky header from the right edge so the (overlay) scrollbar never
     sits over the row content. Both header and rows share the inset, so columns
     stay aligned. */
  .manager-economy-actor-list {
    list-style: none;
    margin: 0;
    padding: 0 12px 0 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* 380px, not 320px: a 30px bare cell became a 36px filled stepper, taking each
       row from ~44px to ~50px, so six rows plus the sticky header no longer fit the
       old height and the list would scroll before pagination ever kicked in. */
    max-height: 380px;
    overflow-y: auto;
  }

  /* One grid per row, shared by the header, so Current / Max (override) labels
     and the trailing action (save / roll) line up in the same columns.

     106px, not 102px. 102px is the stepper's natural width at the DEFAULT density —
     54px of chrome around a 48px input — but D13 REQUIRES `comfortable` on both of
     these cells (they are the point of a bulk-entry panel), and comfortable raises
     the fixed chrome to 58px. At 102px the typeable field was therefore 44px, 4px
     under the 48px the number the track was derived from assumes; 106px restores it.
     There is ~384px of slack in track 1 at the card's full width, so the 8px comes
     out of the name column and nowhere near its floor.

     `minmax(140px, 1fr)` floors the name column: track 1 was `minmax(0, 1fr)`, which
     would have absorbed the widened cells by crushing the actor name to the point
     where the table stopped identifying anybody while still technically not
     scrolling. */
  .manager-economy-actor-row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) 106px 106px 64px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-035);
  }

  /* Sticky, opaque header so scrolled rows never show through it. */
  .manager-economy-actor-row.is-head {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 4px 8px;
    border: 0;
    border-radius: 0;
    background: var(--fab-mv2-surface-2);
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

  .manager-economy-actor-col-label {
    text-align: center;
    min-width: 0;
  }

  /* `.manager-economy-actor-cell` used to give the two bare number inputs their box.
     It is deleted rather than left behind: Svelte does not apply a parent's scope
     class to a child component's internals, so once the cells became `Stepper`s the
     selector matched nothing and emitted `Unused CSS selector`, which fails the
     zero-warning svelte-check gate. The chrome and the disabled dimming now come
     from the primitive's own `.fab-stepper` / `.fab-stepper.is-disabled` rules. */

  /* The trailing action column (bulk Save in the header, roll/reset per row).
     Slightly more compact than a default button, with slightly larger label.

     CHAINED onto the primitive's own classes (issue 1118), and the chain is the whole point.
     A scoped rule compiles to `.manager-economy-bulk-save.svelte-<hash>` — TWO classes — and
     Svelte injects it into `document.head` after Foundry's `<link>` for the global sheet, so
     at (0,2,0) it did not beat `.fabricate-manager .manager-button.fab-manager-button` (0,3,0)
     at all: it lost `padding` and `font-size` outright, and `is-primary`'s own padding at
     (0,4,0) too. Naming `.manager-button.fab-manager-button.is-primary` here takes the compiled
     selector to (0,5,0), which wins on specificity rather than on where the sheet happens to be
     injected — see the header of `tests/helpers/scoped-component-css.js` for why injection order
     is not a thing a rule may depend on. */
  .manager-button.fab-manager-button.is-primary.manager-economy-bulk-save {
    width: auto;
    justify-self: center;
    padding: 3px 10px;
    justify-content: center;
    font-size: 0.82rem;
    line-height: 1.1;
  }

  .manager-economy-actor-roll {
    justify-self: center;
  }

  /* Emphasise the dice button on characters that have not been rolled yet. */
  .manager-economy-actor-roll.is-roll-needed {
    color: var(--fab-mv2-accent);
    border-color: var(--fab-mv2-accent);
    background: var(--fab-mv2-accent-soft, var(--fab-overlay-light-035));
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
</style>
