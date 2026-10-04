<!--
  One composition row's per-environment overrides, opened in place in that row whatever its section
  (issue 1522): the node count, the drop-rate switch and the drop-rate adjustments. Every writer
  patches the environment through `onUpdateEnvironment` and never the reusable source record, and
  the inspector rail beside the list only reads them. `text(key, fallback)` is the host's localizer.
-->
<script>
  import {
    DEFAULT_GATHERING_EVENT_IMG,
    DEFAULT_GATHERING_TASK_IMG,
  } from '../../../../../gatheringImageDefaults.js';
  import IconButton from '../../../components/IconButton.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { recordNodePool } from './recordNodePool.js';

  let {
    kind = 'task',
    environment = null,
    entry = null,
    text = (_key, fallback) => fallback,
    onUpdateEnvironment = () => {},
  } = $props();

  const record = $derived(entry?.record || null);
  const recordImg = $derived(
    record?.img || (kind === 'event' ? DEFAULT_GATHERING_EVENT_IMG : DEFAULT_GATHERING_TASK_IMG)
  );
  const name = $derived(
    record?.name ||
      entry?.id ||
      text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed')
  );
  const pool = $derived(recordNodePool(kind, entry, environment));

  const adjustmentRows = $derived(
    Array.isArray(entry?.dropRateAdjustmentRows) ? entry.dropRateAdjustmentRows : []
  );
  const eventAdjustment = $derived(
    Number.isFinite(Number(entry?.dropRateAdjustment)) ? Number(entry.dropRateAdjustment) : 0
  );
  const enabled = $derived(entry?.dropRateAdjustmentsEnabled !== false);
  const eventBaseDropRate = $derived(
    Number.isFinite(Number(entry?.baseDropRate))
      ? Number(entry.baseDropRate)
      : Number(record?.dropRate ?? 0)
  );
  const eventEffectiveDropRate = $derived(
    Number.isFinite(Number(entry?.effectiveDropRate))
      ? Number(entry.effectiveDropRate)
      : eventBaseDropRate
  );
  const showToggle = $derived(kind === 'event' ? Boolean(entry) : adjustmentRows.length > 0);

  /** A copy of one environment map, so a writer never mutates the draft it was handed. */
  function environmentMap(key) {
    const value = environment?.[key];
    return { ...(value && typeof value === 'object' ? value : {}) };
  }

  function clampAdjustment(value) {
    const number = Number(String(value ?? '').replace(/^\+/, ''));
    if (!Number.isFinite(number)) return 0;
    return Math.max(-100, Math.min(100, Math.trunc(number)));
  }

  // Seeds an unstored pool from the library config, as the runtime's own first write would.
  function setNodeCount(value) {
    const taskId = String(entry?.id || '').trim();
    const current = Math.max(0, Math.min(pool.max, Number(value)));
    if (!taskId || !pool.hasNodes || !Number.isFinite(current) || current === pool.current) return;
    const next = environmentMap('nodeRuntime');
    const base =
      next[taskId] && typeof next[taskId] === 'object'
        ? next[taskId]
        : { ...(pool.config || {}), current: pool.max };
    next[taskId] = { ...base, current };
    onUpdateEnvironment({ nodeRuntime: next });
  }

  function setEventAdjustment(value) {
    const adjustment = clampAdjustment(value);
    const id = String(entry?.id || '').trim();
    if (!id) return;
    const next = environmentMap('eventDropRateAdjustments');
    if (adjustment === 0) delete next[id];
    else next[id] = adjustment;
    onUpdateEnvironment({ eventDropRateAdjustments: next });
  }

  function setTaskDropAdjustment(rowId, value) {
    const adjustment = clampAdjustment(value);
    const taskId = String(entry?.id || '').trim();
    const dropRowId = String(rowId || '').trim();
    if (!taskId || !dropRowId) return;
    const taskAdjustments = environmentMap('taskDropRateAdjustments');
    const rowAdjustments = {
      ...(taskAdjustments[taskId] && typeof taskAdjustments[taskId] === 'object'
        ? taskAdjustments[taskId]
        : {}),
    };
    if (adjustment === 0) delete rowAdjustments[dropRowId];
    else rowAdjustments[dropRowId] = adjustment;
    if (Object.keys(rowAdjustments).length === 0) delete taskAdjustments[taskId];
    else taskAdjustments[taskId] = rowAdjustments;
    onUpdateEnvironment({ taskDropRateAdjustments: taskAdjustments });
  }

  // Off stores `false`; on deletes the key, since on is the default.
  function setAdjustmentsEnabled(on) {
    const id = String(entry?.id || '').trim();
    if (!id) return;
    const key =
      kind === 'event' ? 'eventDropRateAdjustmentsEnabled' : 'taskDropRateAdjustmentsEnabled';
    const next = environmentMap(key);
    if (on === false) next[id] = false;
    else delete next[id];
    onUpdateEnvironment({ [key]: next });
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

  // The three input handlers take the row's own writer, so an event and a drop row share them.
  function onAdjustmentKeydown(write, value, event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const next = clampAdjustment(clampAdjustment(value) + (event.key === 'ArrowUp' ? 1 : -1));
    event.currentTarget.value = adjustmentDisplayValue(next);
    write(next);
  }

  function onAdjustmentInput(write, event) {
    const raw = String(event.currentTarget.value ?? '').trim();
    if (raw === '' || raw === '-' || raw === '+') return;
    write(raw);
  }

  function onAdjustmentBlur(write, event) {
    const adjustment = clampAdjustment(event.currentTarget.value);
    event.currentTarget.value = adjustmentDisplayValue(adjustment);
    write(adjustment);
  }

  function rowLabel(row) {
    return String(
      row?.name ||
        row?.componentId ||
        row?.itemUuid ||
        row?.id ||
        text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRow', 'Drop row')
    );
  }

  const rangeLabel = $derived(
    text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustmentRange',
      'Drop-rate adjustment (-100% to +100%)'
    )
  );
  const nodeLabels = $derived(
    stepperLabels(
      text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableNodes', 'Available nodes')
    )
  );
  const clearLabel = $derived(
    text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')
  );
</script>

{#snippet adjustmentRow(row, write)}
  <div
    class={`manager-environment-drop-adjustment-row is-task-drop ${enabled ? '' : 'is-disabled'} ${adjustmentValueClass(row.adjustment)}`}
    data-drop-rate-adjustment={row.id}
  >
    <div class="manager-environment-drop-adjustment-drop">
      <img class="manager-environment-drop-adjustment-thumb" src={row.img} alt="" />
      <strong title={row.label}>{row.label}</strong>
    </div>
    <div class="manager-environment-drop-adjustment-controls">
      <span class="manager-environment-drop-adjustment-rate" data-drop-rate-adjustment-base>
        <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseRate', 'Base')}</span>
        <strong>{row.base}%</strong>
      </span>
      <label class="manager-environment-drop-adjustment-input">
        <span class="visually-hidden"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment',
            'Drop-rate adjustment'
          )}</span
        >
        <span class="manager-condition-modifier-value" data-drop-rate-adjustment-percent>
          <input
            type="text"
            inputmode="numeric"
            pattern="[+\-]?[0-9]*"
            value={adjustmentDisplayValue(row.adjustment)}
            aria-label={rangeLabel}
            title={rangeLabel}
            disabled={!enabled}
            data-drop-rate-adjustment-input
            oninput={(event) => onAdjustmentInput(write, event)}
            onblur={(event) => onAdjustmentBlur(write, event)}
            onkeydown={(event) => onAdjustmentKeydown(write, row.adjustment, event)}
          />
          <span aria-hidden="true">%</span>
        </span>
      </label>
      <span class="manager-environment-drop-adjustment-rate" data-drop-rate-adjustment-effective>
        <span
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EffectiveRate',
            'Effective'
          )}</span
        >
        <strong>{row.effective}%</strong>
      </span>
      <IconButton
        class="manager-environment-drop-adjustment-clear"
        ariaLabel={clearLabel}
        title={clearLabel}
        disabled={!enabled || row.adjustment === 0}
        onclick={() => write(0)}
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
      </IconButton>
    </div>
  </div>
{/snippet}

{#if entry}
  <div class="manager-environment-override-body" data-composition-override-body={kind}>
    {#if pool.hasNodes}
      <section
        class="manager-environment-override-section is-nodes"
        data-composition-override="nodes"
      >
        <h5 class="manager-environment-drop-adjustment-heading">
          {text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableNodes',
            'Available nodes'
          )}
        </h5>
        {#if pool.nonRegenerating}
          <span class="manager-environment-node-count-value" data-node-count>
            <strong>{pool.current}</strong>
            <span aria-hidden="true">/</span>
            <span>{pool.max}</span>
          </span>
          <p class="manager-environment-node-no-restock-hint" data-node-no-restock-hint>
            {text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NodeNoRestock',
              'Cannot restock — permanently depletable.'
            )}
          </p>
        {:else}
          <Stepper
            value={pool.current}
            min={0}
            max={pool.max}
            ariaLabel={nodeLabels.ariaLabel}
            decrementLabel={nodeLabels.decrementLabel}
            incrementLabel={nodeLabels.incrementLabel}
            inputProps={{ 'data-node-count-input': entry.id }}
            onChange={setNodeCount}
          />
        {/if}
      </section>
    {/if}

    <section class="manager-environment-override-section" data-composition-override="adjustments">
      <div class="manager-environment-overrides-header">
        <div class="manager-environment-overrides-copy">
          <h5 class="manager-environment-drop-adjustment-heading">
            {text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Overrides',
              'Environment overrides'
            )}
          </h5>
          <p class="manager-muted">
            {kind === 'event'
              ? text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverridesHintEvent',
                  'Drop-rate adjustments apply only in this environment and do not modify the reusable source event.'
                )
              : text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverridesHintTask',
                  'Drop-rate adjustments apply only in this environment and do not modify the reusable source task.'
                )}
          </p>
        </div>
        {#if showToggle}
          <StatusToggle
            on={enabled}
            label={enabled
              ? text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ApplyDropRateAdjustmentsOn',
                  'On'
                )
              : text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ApplyDropRateAdjustmentsOff',
                  'Off'
                )}
            class="manager-environment-override-toggle"
            data-task-drop-rate-adjustments-toggle={kind === 'event' ? undefined : ''}
            data-event-drop-rate-adjustments-toggle={kind === 'event' ? '' : undefined}
            onclick={() => setAdjustmentsEnabled(!enabled)}
          />
        {/if}
      </div>

      {#if kind === 'event'}
        <h5 class="manager-environment-drop-adjustment-heading">
          {text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseChanceModifier',
            'Base chance modifier'
          )}
        </h5>
        <div class="manager-environment-drop-adjustment-list">
          {@render adjustmentRow(
            {
              id: entry.id,
              img: recordImg,
              label: name,
              base: eventBaseDropRate,
              adjustment: eventAdjustment,
              effective: eventEffectiveDropRate,
            },
            setEventAdjustment
          )}
        </div>
      {:else if adjustmentRows.length > 0}
        <h5 class="manager-environment-drop-adjustment-heading">
          {text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseChanceModifiers',
            'Base chance modifiers'
          )}
        </h5>
        <div class="manager-environment-drop-adjustment-list">
          {#each adjustmentRows as row (row.id)}
            {@render adjustmentRow(
              {
                id: row.id,
                img: String(row?.img || 'icons/svg/item-bag.svg'),
                label: rowLabel(row),
                base: row.baseDropRate,
                adjustment: row.adjustment,
                effective: row.effectiveDropRate,
              },
              (value) => setTaskDropAdjustment(row.id, value)
            )}
          {/each}
        </div>
      {:else}
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoDropRows',
            'This task has no drop rows to adjust.'
          )}
        </p>
      {/if}
    </section>
  </div>
{/if}
