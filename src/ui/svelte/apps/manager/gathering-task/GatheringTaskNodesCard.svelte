<!--
  The gathering task's Resource node card (issue 1522): node count, depletion timing, respawn and
  the depleted-marker art, or a hint when the system has resource nodes off. Writes `nodes` whole
  through `onUpdateTask(patch)`, and `nodes: null` when the count is cleared.
-->
<script>
  import ArtPicker from '../../../components/ArtPicker.svelte';
  import Field from '../../../components/Field.svelte';
  import Select from '../../../components/Select.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import {
    depletionTimingOptions,
    respawnGainModeOptions,
    respawnIntervalUnitOptions,
    respawnPolicyOptions,
  } from '../gatheringTaskSelectOptions.js';
  import GatheringTaskCard from './GatheringTaskCard.svelte';

  let {
    text,
    task,
    nodesEnabled = false,
    onPickImagePath = null,
    onUpdateTask = () => {},
  } = $props();

  // The caption ids the converted pickers are named by, per instance (issue 1510).
  const instanceId = $props.id();
  const captionIds = {
    deplete: `${instanceId}-node-deplete`,
    respawn: `${instanceId}-node-respawn`,
    gainMode: `${instanceId}-node-gain-mode`,
  };
  const depleteOptions = $derived(depletionTimingOptions(text));
  const respawnPolicySelectOptions = $derived(respawnPolicyOptions(text));
  const intervalUnitOptions = $derived(respawnIntervalUnitOptions(text));
  const gainModeOptions = $derived(respawnGainModeOptions(text));

  const DEFAULT_NODES = {
    enabled: false,
    max: 0,
    current: 0,
    depletionTiming: 'onStart',
    respawn: {
      policy: 'manual',
      intervalUnit: 'hours',
      intervalAmount: 0,
      gainMode: 'guaranteed',
      chance: 0,
      amountExpression: '',
    },
  };
  const RESPAWN_UNITS = { minutes: 60, hours: 3600, days: 86400, weeks: 604800 };

  const nodes = $derived(task?.nodes || DEFAULT_NODES);
  const respawn = $derived(nodes.respawn || DEFAULT_NODES.respawn);
  const respawnIsOverTime = $derived(respawn.policy === 'overTime');
  const respawnGainMode = $derived(respawn.gainMode || 'guaranteed');
  const respawnIsChance = $derived(respawnIsOverTime && respawnGainMode === 'chance');
  const respawnIsExpression = $derived(respawnIsOverTime && respawnGainMode === 'expression');
  // The interval is amount plus unit, calendar-aware at runtime. A legacy draft may still carry raw
  // seconds, surfaced as the largest whole unit that divides evenly.
  const intervalParts = $derived(
    (() => {
      if (respawn.intervalUnit)
        return { value: Number(respawn.intervalAmount) || 0, unit: respawn.intervalUnit };
      const seconds = Number(respawn.intervalSeconds) || 0;
      for (const unit of ['weeks', 'days', 'hours', 'minutes']) {
        const size = RESPAWN_UNITS[unit];
        if (seconds > 0 && seconds % size === 0) return { value: seconds / size, unit };
      }
      return { value: seconds ? seconds / RESPAWN_UNITS.hours : 0, unit: 'hours' };
    })()
  );

  function updateNodes(patch) {
    onUpdateTask({ nodes: { ...nodes, enabled: true, ...patch } });
  }
  function updateRespawn(patch) {
    updateNodes({ respawn: { ...respawn, ...patch } });
  }
  function setNodeCount(value) {
    if (value === null || value === undefined || value <= 0) {
      onUpdateTask({ nodes: null });
      return;
    }
    const max = Math.floor(value);
    updateNodes({ max, current: max });
  }
  function setRespawnInterval(value, unit) {
    const next = Number(value);
    const intervalUnit = RESPAWN_UNITS[unit] ? unit : 'hours';
    // Normalization drops any legacy `intervalSeconds` once a unit is present.
    updateRespawn({
      intervalUnit,
      intervalAmount: Number.isFinite(next) && next > 0 ? Math.round(next) : 0,
    });
  }
  function setRespawnChance(percent) {
    const next = Number(percent);
    updateRespawn({ chance: Number.isFinite(next) ? Math.min(1, Math.max(0, next / 100)) : 0 });
  }
  function setRespawnPolicy(value) {
    // Over-time always carries a gain mode, so the draft is valid before normalization.
    updateRespawn(
      value === 'overTime' ? { policy: 'overTime', gainMode: respawnGainMode } : { policy: value }
    );
  }
  function setRespawnGainMode(value) {
    updateRespawn({ gainMode: value });
  }
  function setRespawnExpression(value) {
    updateRespawn({ amountExpression: String(value ?? '') });
  }

  // A placed interactable's linked Tile marker shows `swapImage` while this task's node is
  // depleted, and flips back on respawn. A Tile has no nameplate, so no postfix mode is offered.
  const depletedBehavior = $derived(nodes.depletedBehavior || {});
  const depletedSwapImage = $derived(
    typeof depletedBehavior.swapImage === 'string' ? depletedBehavior.swapImage : ''
  );

  function updateDepletedBehavior(patch) {
    const next = { ...depletedBehavior, ...patch };
    const cleaned = {};
    if (typeof next.swapImage === 'string' && next.swapImage.trim()) {
      cleaned.swapImage = next.swapImage.trim();
    }
    updateNodes({ depletedBehavior: Object.keys(cleaned).length > 0 ? cleaned : null });
  }
  async function chooseDepletedImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(
      depletedSwapImage || nodes.depletedBehavior?.swapImage || ''
    );
    if (value) updateDepletedBehavior({ swapImage: value });
  }
  function clearDepletedImage() {
    updateDepletedBehavior({ swapImage: '' });
  }
  function onDepletedImageContextMenu(event) {
    // Right-click clears the art; the visible "Remove image" button covers keyboard users.
    event.preventDefault();
    event.stopPropagation();
    if (depletedSwapImage) clearDepletedImage();
  }
</script>

{#if nodesEnabled}
  <GatheringTaskCard
    class="manager-task-nodes-card"
    title={text('FABRICATE.Admin.Manager.Economy.TaskNodesTitle', 'Resource node')}
    hint={text(
      'FABRICATE.Admin.Manager.Economy.TaskNodesHint',
      'Finite nodes for this task, depleted as it is gathered and optionally respawning over world time.'
    )}
    data-gathering-task-nodes
  >
    <div class="manager-task-nodes-grid">
      <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. -->
      <Field as="div">
        <span>{text('FABRICATE.Admin.Manager.Economy.TaskNodeCount', 'Node count')}</span>
        <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
        <Stepper
          value={nodes.max > 0 ? nodes.max : null}
          allowUnset
          min={0}
          step={1}
          fill
          density="comfortable"
          placeholder="—"
          {...stepperLabels(text('FABRICATE.Admin.Manager.Economy.TaskNodeCount', 'Node count'))}
          inputProps={{ 'data-gathering-task-node-count': '' }}
          onChange={(next) => setNodeCount(next)}
        />
      </Field>

      <Field as="div">
        <span id={captionIds.deplete}
          >{text('FABRICATE.Admin.Manager.Economy.TaskNodeDeplete', 'Deplete')}</span
        >
        <Select
          class="manager-task-field-select"
          value={nodes.depletionTiming}
          options={depleteOptions}
          showTick={false}
          ariaLabelledBy={captionIds.deplete}
          triggerProps={{ 'data-gathering-task-node-deplete': '' }}
          onChange={(next) => updateNodes({ depletionTiming: next })}
        />
      </Field>

      <Field as="div">
        <span id={captionIds.respawn}
          >{text('FABRICATE.Admin.Manager.Economy.TaskNodeRespawn', 'Respawn')}</span
        >
        <Select
          class="manager-task-field-select"
          value={respawn.policy}
          options={respawnPolicySelectOptions}
          showTick={false}
          ariaLabelledBy={captionIds.respawn}
          triggerProps={{ 'data-gathering-task-node-respawn': '' }}
          onChange={(next) => setRespawnPolicy(next)}
        />
      </Field>

      {#if respawnIsOverTime}
        <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. "Every" names
             neither control, so the unit picker states its own name. -->
        <Field as="div" class="manager-task-node-interval">
          <span>{text('FABRICATE.Admin.Manager.Economy.RespawnEvery', 'Every')}</span>
          <div class="manager-task-node-interval-row">
            <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
            <Stepper
              value={intervalParts.value}
              min={0}
              step={1}
              fill
              {...stepperLabels(text('FABRICATE.Admin.Manager.Economy.RespawnEvery', 'Every'))}
              inputProps={{ 'data-gathering-task-node-interval': '' }}
              onChange={(next) => setRespawnInterval(next, intervalParts.unit)}
            />
            <Select
              size="inline"
              value={intervalParts.unit}
              options={intervalUnitOptions}
              showTick={false}
              ariaLabel={text(
                'FABRICATE.Admin.Manager.Economy.RespawnIntervalUnit',
                'Respawn interval unit'
              )}
              triggerProps={{ 'data-gathering-task-node-interval-unit': '' }}
              onChange={(next) => setRespawnInterval(intervalParts.value, next)}
            />
          </div>
        </Field>

        <Field as="div">
          <span id={captionIds.gainMode}
            >{text('FABRICATE.Admin.Manager.Economy.RespawnGainMode', 'Each interval')}</span
          >
          <Select
            class="manager-task-field-select"
            value={respawnGainMode}
            options={gainModeOptions}
            showTick={false}
            ariaLabelledBy={captionIds.gainMode}
            triggerProps={{ 'data-gathering-task-node-gain-mode': '' }}
            onChange={(next) => setRespawnGainMode(next)}
          />
        </Field>
      {/if}

      {#if respawnIsChance}
        <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. -->
        <Field as="div">
          <span>{text('FABRICATE.Admin.Manager.Economy.RespawnChance', 'Chance')}</span>
          <div class="manager-task-node-chance-row">
            <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
            <Stepper
              value={Math.round((Number(respawn.chance) || 0) * 100)}
              min={0}
              max={100}
              step={1}
              fill
              {...stepperLabels(text('FABRICATE.Admin.Manager.Economy.RespawnChance', 'Chance'))}
              inputProps={{ 'data-gathering-task-node-chance': '' }}
              onChange={(next) => setRespawnChance(next)}
            />
            <span class="manager-muted">%</span>
          </div>
        </Field>
      {/if}

      {#if respawnIsExpression}
        <Field as="label">
          <span>{text('FABRICATE.Admin.Manager.Economy.RespawnAmount', 'Amount per interval')}</span
          >
          <input
            type="text"
            placeholder="1d4"
            value={respawn.amountExpression || ''}
            oninput={(event) => setRespawnExpression(event.currentTarget.value)}
            aria-describedby="gathering-task-node-amount-hint"
            data-gathering-task-node-amount
          />
          <span id="gathering-task-node-amount-hint" class="manager-muted"
            >{text(
              'FABRICATE.Admin.Manager.Economy.RespawnAmountHint',
              'Plain dice only (e.g. 1d4) — no character data.'
            )}</span
          >
        </Field>
      {/if}
    </div>

    <div class="manager-task-depleted-behavior" data-gathering-task-depleted-behavior>
      <div class="manager-task-depleted-row">
        <div class="manager-task-drop-header-copy manager-task-depleted-copy">
          <h4>
            {text(
              'FABRICATE.Admin.Manager.Economy.DepletedBehaviorTitle',
              'When depleted (linked marker)'
            )}
          </h4>
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Economy.DepletedBehaviorHint',
              "How a placed interactable's linked marker looks once this node runs out. Restored automatically when it respawns."
            )}
          </p>
        </div>

        <ArtPicker
          class="manager-task-art"
          data-gathering-task-depleted-image-column=""
          art={depletedSwapImage}
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Economy.DepletedSwapImagePick',
            'Choose depleted marker image'
          )}
          onPick={chooseDepletedImage}
          disabled={typeof onPickImagePath !== 'function'}
          onClear={clearDepletedImage}
          clearLabel={text(
            'FABRICATE.Admin.Manager.Economy.DepletedSwapImageClear',
            'Remove image'
          )}
          pickProps={{
            'data-gathering-task-depleted-image': '',
            oncontextmenu: onDepletedImageContextMenu,
          }}
          clearProps={{ 'data-gathering-task-depleted-image-clear': '' }}
        />
      </div>
    </div>
  </GatheringTaskCard>
{:else}
  <GatheringTaskCard
    class="manager-task-nodes-card manager-task-nodes-hint-card"
    title={text('FABRICATE.Admin.Manager.Economy.TaskNodesTitle', 'Resource node')}
    data-gathering-task-nodes-hint
  >
    <p class="manager-muted manager-task-nodes-hint-text">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      <span
        >{text(
          'FABRICATE.Admin.Manager.Economy.TaskNodesEconomyHint',
          "Canvas per-token depletion and depleted-token behavior are only available when this system has resource nodes enabled. Turn on the Resource nodes toggle in the system's Economy settings to author a resource node here."
        )}</span
      >
    </p>
  </GatheringTaskCard>
{/if}

<style>
  .manager-task-nodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: var(--fab-space-3);
    align-items: end;
  }

  /* Guidance shown in the node area when the system does NOT have resource nodes enabled. */
  .manager-task-nodes-hint-text {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin: 0;
  }

  .manager-task-nodes-hint-text i {
    margin-top: var(--fab-space-2xs);
    flex: 0 0 auto;
  }

  .manager-task-node-interval-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-task-node-chance-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  /* Size the unit picker to its content, refusing the `width: 100%` the other converted fields ask
     for. `:global()` is load-bearing and so is the attribute: the trigger is a child component's
     `<button>`, which carries no scoping hash, and the attribute lifts the class column to 3 so it
     out-ranks a two-class caller rule rather than tying it on stylesheet order (issue 1510). */
  .manager-task-node-interval-row
    :global(.fabricate-select-trigger[data-gathering-task-node-interval-unit]) {
    width: auto;
  }

  /* Depleted-behavior authoring: a sub-block of the node card. */
  .manager-task-depleted-behavior {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .manager-task-depleted-behavior h4 {
    margin: 0;
    font-size: var(--font-size-13, 0.8125rem);
  }

  /* Title and hint sit on the SAME row as the swap-image thumbnail. */
  .manager-task-depleted-row {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
  }

  .manager-task-depleted-copy {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
