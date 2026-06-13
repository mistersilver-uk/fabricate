<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import MatchingEvidenceChips from './MatchingEvidenceChips.svelte';

  let {
    kind = 'task',
    environment = null,
    entry = null,
    onUpdateEnvironment = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const defaultImg = $derived(kind === 'event' ? 'icons/svg/mystery-man.svg' : 'icons/svg/item-bag.svg');
  const record = $derived(entry?.record || null);
  const name = $derived(record?.name || entry?.id || text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed'));

  // Per-environment resource-node pool for the selected task. Tasks only (events
  // have no nodes); the section is gated on a configured capacity (`max > 0`). The
  // available `current` count falls back to the library config seed (current = max)
  // when this environment has no stored runtime entry yet.
  const nodeConfig = $derived(kind === 'task' ? (record?.nodes || null) : null);
  const nodeRuntimeEntry = $derived(environment?.nodeRuntime?.[entry?.id] || null);
  const nodeMax = $derived(Number(nodeRuntimeEntry?.max ?? nodeConfig?.max ?? 0));
  const hasNodes = $derived(kind === 'task' && Number.isFinite(nodeMax) && nodeMax > 0);
  const nodeCurrent = $derived((() => {
    const stored = Number(nodeRuntimeEntry?.current);
    const value = Number.isFinite(stored) ? stored : nodeMax;
    return Math.max(0, Math.min(nodeMax, value));
  })());
  // A `nonRegenerating` pool is permanently depletable: it can never be restocked
  // (the runtime's restockNode is a no-op for it), so the GM restock/step controls
  // are removed entirely and the count is shown read-only. Policy is library
  // config, so read it from `nodeConfig.respawn`.
  const nodeIsNonRegenerating = $derived(nodeConfig?.respawn?.policy === 'nonRegenerating');
  const environmentMatchTitle = $derived(kind === 'event'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EventEnvironmentMatching', 'Event Environment Matching')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.TaskEnvironmentMatching', 'Task Environment Matching'));

  const adjustmentRows = $derived(Array.isArray(entry?.dropRateAdjustmentRows) ? entry.dropRateAdjustmentRows : []);
  const eventAdjustment = $derived(Number.isFinite(Number(entry?.dropRateAdjustment)) ? Number(entry.dropRateAdjustment) : 0);
  const dropRateAdjustmentsEnabled = $derived(entry?.dropRateAdjustmentsEnabled !== false);
  const eventBaseDropRate = $derived(Number.isFinite(Number(entry?.baseDropRate)) ? Number(entry.baseDropRate) : Number(record?.dropRate ?? 0));
  const eventEffectiveDropRate = $derived(Number.isFinite(Number(entry?.effectiveDropRate)) ? Number(entry.effectiveDropRate) : eventBaseDropRate);
  const showOverridesToggle = $derived(kind === 'event'
    ? Boolean(entry)
    : adjustmentRows.length > 0);

  function clampAdjustment(value) {
    const number = Number(String(value ?? '').replace(/^\+/, ''));
    if (!Number.isFinite(number)) return 0;
    return Math.max(-100, Math.min(100, Math.trunc(number)));
  }

  function adjustNodeCount(delta) {
    const taskId = String(entry?.id || '').trim();
    if (!taskId || !hasNodes) return;
    const next = { ...(environment?.nodeRuntime && typeof environment.nodeRuntime === 'object' ? environment.nodeRuntime : {}) };
    const base = next[taskId] && typeof next[taskId] === 'object'
      ? next[taskId]
      : { ...(nodeConfig || {}), current: nodeMax };
    const current = Math.max(0, Math.min(nodeMax, nodeCurrent + delta));
    if (current === Number(base.current)) return;
    next[taskId] = { ...base, current };
    onUpdateEnvironment({ nodeRuntime: next });
  }

  function setEventAdjustment(value) {
    const adjustment = clampAdjustment(value);
    const id = String(entry?.id || '').trim();
    if (!id) return;
    const next = { ...(environment?.eventDropRateAdjustments && typeof environment.eventDropRateAdjustments === 'object' ? environment.eventDropRateAdjustments : {}) };
    if (adjustment === 0) delete next[id];
    else next[id] = adjustment;
    onUpdateEnvironment({ eventDropRateAdjustments: next });
  }

  function setTaskDropAdjustment(rowId, value) {
    const adjustment = clampAdjustment(value);
    const taskId = String(entry?.id || '').trim();
    const dropRowId = String(rowId || '').trim();
    if (!taskId || !dropRowId) return;
    const taskAdjustments = { ...(environment?.taskDropRateAdjustments && typeof environment.taskDropRateAdjustments === 'object' ? environment.taskDropRateAdjustments : {}) };
    const rowAdjustments = { ...(taskAdjustments[taskId] && typeof taskAdjustments[taskId] === 'object' ? taskAdjustments[taskId] : {}) };
    if (adjustment === 0) delete rowAdjustments[dropRowId];
    else rowAdjustments[dropRowId] = adjustment;
    if (Object.keys(rowAdjustments).length === 0) delete taskAdjustments[taskId];
    else taskAdjustments[taskId] = rowAdjustments;
    onUpdateEnvironment({ taskDropRateAdjustments: taskAdjustments });
  }

  function setTaskDropAdjustmentsEnabled(enabled) {
    const taskId = String(entry?.id || '').trim();
    if (!taskId) return;
    const next = { ...(environment?.taskDropRateAdjustmentsEnabled && typeof environment.taskDropRateAdjustmentsEnabled === 'object' ? environment.taskDropRateAdjustmentsEnabled : {}) };
    if (enabled === false) next[taskId] = false;
    else delete next[taskId];
    onUpdateEnvironment({ taskDropRateAdjustmentsEnabled: next });
  }

  function setEventDropAdjustmentsEnabled(enabled) {
    const eventId = String(entry?.id || '').trim();
    if (!eventId) return;
    const next = { ...(environment?.eventDropRateAdjustmentsEnabled && typeof environment.eventDropRateAdjustmentsEnabled === 'object' ? environment.eventDropRateAdjustmentsEnabled : {}) };
    if (enabled === false) next[eventId] = false;
    else delete next[eventId];
    onUpdateEnvironment({ eventDropRateAdjustmentsEnabled: next });
  }

  function adjustmentDisplayValue(value) {
    const adjustment = clampAdjustment(value);
    return adjustment > 0 ? `+${adjustment}` : `${adjustment}`;
  }

  function adjustmentValueClass(value) {
    const adjustment = clampAdjustment(value);
    if (adjustment > 0) return 'is-positive';
    if (adjustment < 0) return 'is-negative';
    return 'is-zero';
  }

  function onTaskAdjustmentKeydown(rowId, value, event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const next = clampAdjustment(clampAdjustment(value) + (event.key === 'ArrowUp' ? 1 : -1));
    event.currentTarget.value = adjustmentDisplayValue(next);
    setTaskDropAdjustment(rowId, next);
  }

  function onTaskAdjustmentInput(rowId, event) {
    const raw = String(event.currentTarget.value ?? '').trim();
    if (raw === '' || raw === '-' || raw === '+') return;
    setTaskDropAdjustment(rowId, raw);
  }

  function onTaskAdjustmentBlur(rowId, event) {
    const adjustment = clampAdjustment(event.currentTarget.value);
    event.currentTarget.value = adjustmentDisplayValue(adjustment);
    setTaskDropAdjustment(rowId, adjustment);
  }

  function onEventAdjustmentKeydown(value, event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const next = clampAdjustment(clampAdjustment(value) + (event.key === 'ArrowUp' ? 1 : -1));
    event.currentTarget.value = adjustmentDisplayValue(next);
    setEventAdjustment(next);
  }

  function onEventAdjustmentInput(event) {
    const raw = String(event.currentTarget.value ?? '').trim();
    if (raw === '' || raw === '-' || raw === '+') return;
    setEventAdjustment(raw);
  }

  function onEventAdjustmentBlur(event) {
    const adjustment = clampAdjustment(event.currentTarget.value);
    event.currentTarget.value = adjustmentDisplayValue(adjustment);
    setEventAdjustment(adjustment);
  }

  function rowLabel(row) {
    return String(row?.name || row?.componentId || row?.itemUuid || row?.id || text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRow', 'Drop row'));
  }

  function rowImage(row) {
    return String(row?.img || 'icons/svg/item-bag.svg');
  }
</script>

{#if entry}
  <section class="manager-inspector-card" data-record-inspector={kind}>
    <div class="manager-inspector-title-row is-hero-large">
      <img class="manager-recipe-preview" src={record?.img || defaultImg} alt="" />
      <div class="manager-inspector-copy">
        <p class="manager-kicker">{kind === 'event' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SelectedEvent', 'Selected event') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SelectedTask', 'Selected task')}</p>
        <h2 class="manager-inspector-name" title={name}>{name}</h2>
        <div class="manager-chip-row">
          <CompositionStatePill state={entry.compositionState} />
          <RuntimeStatePill state={entry.runtimeState} />
        </div>
      </div>
    </div>
  </section>

  {#if hasNodes}
    <section class="manager-inspector-card" data-record-inspector-section="nodes">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableNodes', 'Available nodes')}</h3>
      {#if nodeIsNonRegenerating}
        <!-- A nonRegenerating pool can never be restocked, so no stepper renders:
             the count is read-only and a hint states the permanence. (issue 301) -->
        <div class="manager-environment-node-count manager-environment-node-count-readonly">
          <span class="manager-environment-node-count-value" data-node-count>
            <strong>{nodeCurrent}</strong>
            <span aria-hidden="true">/</span>
            <span>{nodeMax}</span>
          </span>
        </div>
        <p class="manager-environment-node-no-restock-hint" data-node-no-restock-hint>
          {text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NodeNoRestock', 'Cannot restock — permanently depletable.')}
        </p>
      {:else}
        <div class="manager-environment-node-count">
          <button
            type="button"
            class="manager-icon-button manager-environment-node-count-step"
            aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Decrease', 'Decrease')}
            title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Decrease', 'Decrease')}
            disabled={nodeCurrent <= 0}
            data-node-count-dec
            onclick={() => adjustNodeCount(-1)}
          >
            <i class="fas fa-minus" aria-hidden="true"></i>
          </button>
          <span class="manager-environment-node-count-value" data-node-count>
            <strong>{nodeCurrent}</strong>
            <span aria-hidden="true">/</span>
            <span>{nodeMax}</span>
          </span>
          <button
            type="button"
            class="manager-icon-button manager-environment-node-count-step"
            aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Increase', 'Increase')}
            title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Increase', 'Increase')}
            disabled={nodeCurrent >= nodeMax}
            data-node-count-inc
            onclick={() => adjustNodeCount(1)}
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
        </div>
      {/if}
    </section>
  {/if}

  <section class="manager-inspector-card" data-record-inspector-section="evidence">
    <h3 class="manager-card-title">{environmentMatchTitle}</h3>
    <MatchingEvidenceChips evidence={entry.evidence} variant="checks" />
  </section>

  <section class="manager-inspector-card" data-record-inspector-section="overrides">
    <div class="manager-environment-overrides-header">
      <div class="manager-environment-overrides-copy">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Overrides', 'Environment overrides')}</h3>
        <p class="manager-muted">{kind === 'event' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverridesHintEvent', 'Drop-rate adjustments apply only in this environment and do not modify the reusable source event.') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverridesHintTask', 'Drop-rate adjustments apply only in this environment and do not modify the reusable source task.')}</p>
      </div>
      {#if showOverridesToggle}
        <button
          type="button"
          class={`manager-status-toggle manager-environment-override-toggle ${dropRateAdjustmentsEnabled ? 'is-on' : 'is-off'}`}
          aria-pressed={dropRateAdjustmentsEnabled}
          data-task-drop-rate-adjustments-toggle={kind === 'event' ? undefined : ''}
          data-event-drop-rate-adjustments-toggle={kind === 'event' ? '' : undefined}
          onclick={() => (kind === 'event'
            ? setEventDropAdjustmentsEnabled(!dropRateAdjustmentsEnabled)
            : setTaskDropAdjustmentsEnabled(!dropRateAdjustmentsEnabled))}
        >
          <span class="manager-status-toggle-track" aria-hidden="true">
            <span class="manager-status-toggle-knob"></span>
          </span>
          <span class="manager-status-toggle-label">
            {dropRateAdjustmentsEnabled
              ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ApplyDropRateAdjustmentsOn', 'On')
              : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ApplyDropRateAdjustmentsOff', 'Off')}
          </span>
        </button>
      {/if}
    </div>

    {#if kind === 'event'}
      <h4 class="manager-environment-drop-adjustment-heading">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseChanceModifier', 'Base chance modifier')}</h4>
      <div class="manager-environment-drop-adjustment-list">
        <div class={`manager-environment-drop-adjustment-row is-task-drop ${dropRateAdjustmentsEnabled ? '' : 'is-disabled'} ${adjustmentValueClass(eventAdjustment)}`} data-drop-rate-adjustment={entry.id}>
          <div class="manager-environment-drop-adjustment-drop">
            <img class="manager-environment-drop-adjustment-thumb" src={record?.img || defaultImg} alt="" />
            <strong title={name}>{name}</strong>
          </div>
          <div class="manager-environment-drop-adjustment-controls">
            <span class="manager-environment-drop-adjustment-rate" data-drop-rate-adjustment-base>
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseRate', 'Base')}</span>
              <strong>{eventBaseDropRate}%</strong>
            </span>
            <label class="manager-environment-drop-adjustment-input">
              <span class="visually-hidden">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment', 'Drop-rate adjustment')}</span>
              <span class="manager-condition-modifier-value" data-drop-rate-adjustment-percent>
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[+\-]?[0-9]*"
                  value={adjustmentDisplayValue(eventAdjustment)}
                  aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustmentRange', 'Drop-rate adjustment (-100% to +100%)')}
                  title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustmentRange', 'Drop-rate adjustment (-100% to +100%)')}
                  disabled={!dropRateAdjustmentsEnabled}
                  data-drop-rate-adjustment-input
                  oninput={(event) => onEventAdjustmentInput(event)}
                  onblur={(event) => onEventAdjustmentBlur(event)}
                  onkeydown={(event) => onEventAdjustmentKeydown(eventAdjustment, event)}
                />
                <span aria-hidden="true">%</span>
              </span>
            </label>
            <span class="manager-environment-drop-adjustment-rate" data-drop-rate-adjustment-effective>
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EffectiveRate', 'Effective')}</span>
              <strong>{eventEffectiveDropRate}%</strong>
            </span>
            <button
              type="button"
              class="manager-icon-button manager-environment-drop-adjustment-clear"
              aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')}
              title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')}
              disabled={!dropRateAdjustmentsEnabled || eventAdjustment === 0}
              onclick={() => setEventAdjustment(0)}
            >
              <i class="fas fa-rotate-left" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    {:else if adjustmentRows.length > 0}
      <h4 class="manager-environment-drop-adjustment-heading">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseChanceModifiers', 'Base chance modifiers')}</h4>
      <div class="manager-environment-drop-adjustment-list">
        {#each adjustmentRows as row (row.id)}
          <div class={`manager-environment-drop-adjustment-row is-task-drop ${dropRateAdjustmentsEnabled ? '' : 'is-disabled'} ${adjustmentValueClass(row.adjustment)}`} data-drop-rate-adjustment={row.id}>
            <div class="manager-environment-drop-adjustment-drop">
              <img class="manager-environment-drop-adjustment-thumb" src={rowImage(row)} alt="" />
              <strong title={rowLabel(row)}>{rowLabel(row)}</strong>
            </div>
            <div class="manager-environment-drop-adjustment-controls">
              <span class="manager-environment-drop-adjustment-rate" data-drop-rate-adjustment-base>
                <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseRate', 'Base')}</span>
                <strong>{row.baseDropRate}%</strong>
              </span>
              <label class="manager-environment-drop-adjustment-input">
                <span class="visually-hidden">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment', 'Drop-rate adjustment')}</span>
                <span class="manager-condition-modifier-value" data-drop-rate-adjustment-percent>
                  <input
                    type="text"
                    inputmode="numeric"
                    pattern="[+\-]?[0-9]*"
                    value={adjustmentDisplayValue(row.adjustment)}
                    aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustmentRange', 'Drop-rate adjustment (-100% to +100%)')}
                    title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustmentRange', 'Drop-rate adjustment (-100% to +100%)')}
                    disabled={!dropRateAdjustmentsEnabled}
                    data-drop-rate-adjustment-input
                    oninput={(event) => onTaskAdjustmentInput(row.id, event)}
                    onblur={(event) => onTaskAdjustmentBlur(row.id, event)}
                    onkeydown={(event) => onTaskAdjustmentKeydown(row.id, row.adjustment, event)}
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <span class="manager-environment-drop-adjustment-rate" data-drop-rate-adjustment-effective>
                <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EffectiveRate', 'Effective')}</span>
                <strong>{row.effectiveDropRate}%</strong>
              </span>
              <button
                type="button"
                class="manager-icon-button manager-environment-drop-adjustment-clear"
                aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')}
                title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')}
                disabled={!dropRateAdjustmentsEnabled || row.adjustment === 0}
                onclick={() => setTaskDropAdjustment(row.id, 0)}
              >
                <i class="fas fa-rotate-left" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoDropRows', 'This task has no drop rows to adjust.')}</p>
    {/if}
  </section>
{/if}
