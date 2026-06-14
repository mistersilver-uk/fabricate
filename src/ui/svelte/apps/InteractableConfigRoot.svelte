<!-- Svelte 5 runes mode -->
<!--
  InteractableConfigRoot — the rich GM config panel body for a region-first
  `fabricate.interactable` Region Behaviour (Phase 2).

  It is a THIN VIEW over the injected `services` bag: the panel reads a single
  view model (`services.summarize()` → `{ view, ref }`) computed by the pure
  `interactableConfigActions` helpers, renders the read-only facts + the editable
  fields, and wires each action button to a `services.*` seam. Every write routes
  through the active-GM behaviour-update edge inside the services bag — the panel
  never mutates a behaviour directly.

  A gathering-task interactable is either LINKED to the gathering task or UNLINKED
  (independent), selected by `taskNodeLink` — much like an FVTT token↔actor link.
  The "Resource node" section below (gatheringTask only) offers a link toggle
  (linked = shares the task's node; unlinked = its own independent pool) plus, when
  unlinked, a minimal count / deplete-timing / respawn editor and a GM Restock
  action (the latter only when the pool regenerates). Each write routes through the
  `services.setTaskNodeLink` / `services.updateScopedNode` / `services.restockScopedNode`
  seams (which wrap the pure `planSetTaskNodeLink` / `planRestockScopedNode` helpers).
  When LINKED (the default) depletion/respawn follow the task via the environment's
  `nodeRuntime[taskId]` and no independent controls render.

  Editable fields (name, prompt text, hidden, audience, missing-policy) write back
  via `services.updateBehavior(systemPatch)`. The non-trivial view logic (label
  resolution, the activation gate summary, the missing-visual warning state) is
  extracted into the pure `interactableConfigView.js` helpers so it is unit-testable.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import {
    describeVisualStatus,
    describeActivationGate
  } from '../../interactableConfigView.js';

  let { services = null } = $props();

  function text(key, fallback = key) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // A tick bumped after each action so the derived snapshot re-reads the services
  // bag (the app shell also re-renders, replacing the component, but the tick
  // keeps in-session reads fresh).
  let tick = $state(0);

  const snapshot = $derived.by(() => {
    void tick;
    return services?.summarize?.() ?? null;
  });
  const view = $derived(snapshot?.view ?? null);
  const worldTime = $derived(snapshot?.now ?? null);

  const sourceLabel = $derived.by(() => { void tick; return services?.resolveSourceLabel?.() ?? null; });
  const environmentLabel = $derived.by(() => { void tick; return services?.resolveEnvironmentLabel?.() ?? null; });

  // --- Identity / source configuration (issue 342) ----------------------------
  // An unconfigured interactable (born via the native "+ Add Behavior" path) is
  // inert until a GM picks its source here. The section also expands (collapsed by
  // default) to RE-TARGET a configured interactable.
  const unconfigured = $derived(view?.unconfigured === true);

  let identityOpen = $state(false);
  // Open the section automatically while unconfigured (the prominent "Needs
  // configuration" state); a configured interactable keeps it collapsed until asked.
  $effect(() => { if (unconfigured) identityOpen = true; });
  const showIdentityBody = $derived(unconfigured || identityOpen);

  // Selection drafts. Seed the type from the current view so a re-target starts sensibly.
  let selType = $state('tool');
  let selSystemId = $state('');
  let selReferenceId = $state('');
  let selEnvironmentId = $state('');
  $effect(() => {
    // Re-seed the type from the view once when it loads, without clobbering an
    // in-progress selection (only when nothing is chosen yet).
    if (!selSystemId && view?.interactableType) selType = view.interactableType;
  });

  const systemOptions = $derived.by(() => { void tick; return services?.listSystems?.() ?? []; });
  const sourceOptions = $derived.by(() => {
    void tick;
    if (!selSystemId) return [];
    return selType === 'tool'
      ? (services?.listTools?.(selSystemId) ?? [])
      : (services?.listTasks?.(selSystemId) ?? []);
  });
  const environmentOptions = $derived.by(() => { void tick; return services?.listEnvironments?.() ?? []; });

  const canApplyIdentity = $derived(
    Boolean(selSystemId) && Boolean(selReferenceId)
  );

  function onSelectType(next) {
    selType = next;
    // A reference id is type-scoped; clear it (and the gathering-only environment).
    selReferenceId = '';
    if (next === 'tool') selEnvironmentId = '';
  }

  function onSelectSystem(next) {
    selSystemId = next;
    selReferenceId = '';
  }

  async function applyIdentity() {
    if (!canApplyIdentity) return;
    const selection = {
      interactableType: selType,
      systemId: selSystemId,
      ...(selType === 'tool'
        ? { toolId: selReferenceId }
        : { taskId: selReferenceId, environmentId: selEnvironmentId || undefined })
    };
    await services?.configureSource?.(selection);
    // Reset drafts after a successful re-target; the panel refreshes via the service.
    selSystemId = '';
    selReferenceId = '';
    selEnvironmentId = '';
    refresh();
  }

  const visualStatus = $derived(describeVisualStatus(view?.linkedVisual ?? null));
  const activationGate = $derived(describeActivationGate(view?.state ?? null, { now: worldTime }));

  // Editable field local state, seeded from the view model.
  let nameDraft = $state('');
  let promptDraft = $state('');
  $effect(() => {
    nameDraft = view?.name ?? '';
    promptDraft = view?.presentation?.promptText ?? '';
  });

  function refresh() {
    tick += 1;
  }

  async function run(action) {
    if (typeof action !== 'function') return;
    await action();
    refresh();
  }

  function commitName() {
    const next = String(nameDraft ?? '').trim();
    if (next === (view?.name ?? '')) return;
    services?.updateBehavior?.({ name: next });
    refresh();
  }

  function commitPrompt() {
    const next = String(promptDraft ?? '').trim();
    const current = view?.presentation?.promptText ?? '';
    if (next === current) return;
    services?.updateBehavior?.({ presentation: { promptText: next || null } });
    refresh();
  }

  function setHidden(hidden) {
    // `setHidden` writes the behaviour AND reconciles the linked tile's `hidden`
    // (hidden conceals the marker + suppresses the prompt). The service refreshes.
    services?.setHidden?.(hidden === true);
  }

  function setAudience(audience) {
    services?.updateBehavior?.({ activation: { audience } });
    refresh();
  }

  function setMissingPolicy(missingPolicy) {
    services?.updateBehavior?.({ linkedVisual: { missingPolicy } });
    refresh();
  }

  // --- Interactable-scoped resource node (issue 302) --------------------------
  const isGatheringTask = $derived(view?.interactableType === 'gatheringTask');
  const taskNodeLink = $derived(view?.taskNodeLink ?? 'linked');
  const isUnlinked = $derived(taskNodeLink === 'unlinked');
  const scopedNode = $derived(view?.node ?? null);
  const respawnPolicy = $derived(scopedNode?.respawn?.policy ?? 'manual');
  const nodeIsNonRegenerating = $derived(respawnPolicy === 'nonRegenerating');

  async function setTaskNodeLink(link) {
    await services?.setTaskNodeLink?.(link);
    refresh();
  }

  async function setNodeCount(value) {
    const max = Math.max(0, Math.floor(Number(value) || 0));
    // Authoring a count seeds the pool full (current = max), mirroring the task editor.
    await services?.updateScopedNode?.({ max, current: max });
    refresh();
  }

  async function setNodeDeplete(depletionTiming) {
    await services?.updateScopedNode?.({ depletionTiming });
    refresh();
  }

  async function setNodeRespawnPolicy(policy) {
    await services?.updateScopedNode?.({ respawn: { ...(scopedNode?.respawn ?? {}), policy } });
    refresh();
  }

  async function restockFull() {
    if (!scopedNode) return;
    await services?.restockScopedNode?.({ current: Number(scopedNode.max || 0), max: Number(scopedNode.max || 0) });
    refresh();
  }
</script>

<div class="fabricate-interactable-config">
  {#if !view}
    <p class="fab-ic-empty">{text('FABRICATE.Canvas.Interactable.Config.Unavailable', 'This interactable could not be loaded.')}</p>
  {:else}
    <header class="fab-ic-header">
      <h2 class="fab-ic-title">{view.name || text('FABRICATE.Canvas.Interactable.Config.Untitled', 'Untitled interactable')}</h2>
      <span class="fab-ic-type-chip">
        {view.interactableType === 'tool'
          ? text('FABRICATE.Canvas.Interactable.Config.TypeTool', 'Tool station')
          : text('FABRICATE.Canvas.Interactable.Config.TypeTask', 'Gathering task')}
      </span>
    </header>

    <!-- Identity / source (issue 342). Prominent "Needs configuration" state while
         unconfigured; collapsed re-target affordance once configured. -->
    <section class="fab-ic-section fab-ic-identity" class:is-unconfigured={unconfigured} data-interactable-identity-section>
      {#if unconfigured}
        <div class="fab-ic-identity-banner" data-interactable-needs-config>
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          <div>
            <strong>{text('FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigTitle', 'Needs configuration')}</strong>
            <p class="fab-ic-fact-muted fab-ic-identity-hint">
              {text('FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigHint', 'This interactable has no source yet. It stays hidden and inert to players until you choose its type and source below.')}
            </p>
          </div>
        </div>
      {:else}
        <div class="fab-ic-identity-head">
          <h3 class="fab-ic-section-title">{text('FABRICATE.Canvas.Interactable.Config.Identity.Heading', 'Source')}</h3>
          <button
            type="button"
            class="fab-ic-btn fab-ic-identity-toggle"
            aria-expanded={identityOpen}
            onclick={() => (identityOpen = !identityOpen)}
            data-interactable-identity-toggle
          >
            {identityOpen
              ? text('FABRICATE.Canvas.Interactable.Config.Identity.Hide', 'Hide')
              : text('FABRICATE.Canvas.Interactable.Config.Identity.Retarget', 'Change source')}
          </button>
        </div>
      {/if}

      {#if showIdentityBody}
        <div class="fab-ic-identity-body" data-interactable-identity-body>
          <label class="fab-ic-field">
            <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.Identity.TypeLabel', 'Type')}</span>
            <select value={selType} onchange={(e) => onSelectType(e.currentTarget.value)} data-interactable-identity-type>
              <option value="tool">{text('FABRICATE.Canvas.Interactable.Config.TypeTool', 'Tool station')}</option>
              <option value="gatheringTask">{text('FABRICATE.Canvas.Interactable.Config.TypeTask', 'Gathering task')}</option>
            </select>
          </label>

          <label class="fab-ic-field">
            <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.Identity.SystemLabel', 'Crafting system')}</span>
            <select value={selSystemId} onchange={(e) => onSelectSystem(e.currentTarget.value)} data-interactable-identity-system>
              <option value="">{text('FABRICATE.Canvas.Interactable.Config.Identity.SelectSystem', 'Select a crafting system…')}</option>
              {#each systemOptions as option (option.id)}
                <option value={option.id}>{option.name}</option>
              {/each}
            </select>
          </label>

          <label class="fab-ic-field">
            <span class="fab-ic-field-label">
              {selType === 'tool'
                ? text('FABRICATE.Canvas.Interactable.Config.Identity.ToolLabel', 'Tool')
                : text('FABRICATE.Canvas.Interactable.Config.Identity.TaskLabel', 'Gathering task')}
            </span>
            <select value={selReferenceId} onchange={(e) => (selReferenceId = e.currentTarget.value)} disabled={!selSystemId} data-interactable-identity-source>
              <option value="">{selType === 'tool'
                ? text('FABRICATE.Canvas.Interactable.Config.Identity.SelectTool', 'Select a tool…')
                : text('FABRICATE.Canvas.Interactable.Config.Identity.SelectTask', 'Select a gathering task…')}</option>
              {#each sourceOptions as option (option.id)}
                <option value={option.id}>{option.name}</option>
              {/each}
            </select>
          </label>

          {#if selType === 'gatheringTask'}
            <label class="fab-ic-field">
              <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.Identity.EnvironmentLabel', 'Environment (optional)')}</span>
              <select value={selEnvironmentId} onchange={(e) => (selEnvironmentId = e.currentTarget.value)} data-interactable-identity-environment>
                <option value="">{text('FABRICATE.Canvas.Interactable.Config.Identity.SelectEnvironment', 'No environment')}</option>
                {#each environmentOptions as option (option.id)}
                  <option value={option.id}>{option.name}</option>
                {/each}
              </select>
            </label>
          {/if}

          <div class="fab-ic-actions fab-ic-actions-inline">
            <button
              type="button"
              class="fab-ic-btn fab-ic-btn-primary"
              disabled={!canApplyIdentity}
              onclick={applyIdentity}
              data-interactable-identity-apply
            >
              <i class="fas fa-check" aria-hidden="true"></i>
              <span>{text('FABRICATE.Canvas.Interactable.Config.Identity.Apply', 'Apply source')}</span>
            </button>
          </div>
        </div>
      {/if}
    </section>

    <!-- Editable identity -->
    <section class="fab-ic-section">
      <label class="fab-ic-field">
        <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.NameLabel', 'Name')}</span>
        <input
          type="text"
          bind:value={nameDraft}
          onchange={commitName}
          onblur={commitName}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.NameLabel', 'Name')}
        />
      </label>
      <label class="fab-ic-field">
        <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.PromptLabel', 'Prompt text')}</span>
        <input
          type="text"
          bind:value={promptDraft}
          onchange={commitPrompt}
          onblur={commitPrompt}
          placeholder={text('FABRICATE.Canvas.Interactable.Config.PromptPlaceholder', 'Shown to players in the interaction prompt')}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.PromptLabel', 'Prompt text')}
        />
      </label>
    </section>

    <!-- Read-only facts: an inline row — Linked task | Environment | Status. The
         Environment fact is omitted for a tool interactable, so the grid lays out
         as 3 columns when it is present and 2 columns when it is absent. -->
    <section class="fab-ic-section fab-ic-facts">
      <dl class="fab-ic-fact-list" class:has-environment={view.interactableType === 'gatheringTask'}>
        <div class="fab-ic-fact">
          <dt>{view.interactableType === 'tool'
            ? text('FABRICATE.Canvas.Interactable.Config.ToolLabel', 'Linked tool')
            : text('FABRICATE.Canvas.Interactable.Config.TaskLabel', 'Linked gathering task')}</dt>
          <dd>
            <span class="fab-ic-fact-name">{sourceLabel ?? text('FABRICATE.Canvas.Interactable.Config.UnresolvedSource', 'Unresolved')}</span>
            {#if view.referenceId}<code class="fab-ic-fact-id">{view.referenceId}</code>{/if}
          </dd>
        </div>
        {#if view.interactableType === 'gatheringTask'}
          <div class="fab-ic-fact">
            <dt>{text('FABRICATE.Canvas.Interactable.Config.EnvironmentLabel', 'Environment')}</dt>
            <dd>
              {#if view.environmentId}
                <span class="fab-ic-fact-name">{environmentLabel ?? view.environmentId}</span>
              {:else}
                <span class="fab-ic-fact-muted">{text('FABRICATE.Canvas.Interactable.Config.NoEnvironment', 'None')}</span>
              {/if}
            </dd>
          </div>
        {/if}
        <div class="fab-ic-fact">
          <dt>{text('FABRICATE.Canvas.Interactable.Config.StatusLabel', 'Status')}</dt>
          <dd><span class="fab-ic-fact-muted">{text(activationGate.key, activationGate.fallback)}</span></dd>
        </div>
      </dl>
    </section>

    <!-- Resource node (gatheringTask only): task-node link toggle + independent
         pool editor. Linked = shares the gathering task's node; unlinked = this
         interactable owns its own pool (FVTT token↔actor link framing). -->
    {#if isGatheringTask}
      <section class="fab-ic-section" data-interactable-node-section>
        <h3 class="fab-ic-section-title">{text('FABRICATE.Canvas.Interactable.Config.Node.Heading', 'Resource node')}</h3>
        <div class="fab-ic-field">
          <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.Node.LinkLabel', 'Task node link')}</span>
          <button
            type="button"
            class="fab-ic-btn fab-ic-btn-toggle"
            class:is-active={!isUnlinked}
            aria-pressed={!isUnlinked}
            onclick={() => setTaskNodeLink(isUnlinked ? 'linked' : 'unlinked')}
            data-interactable-node-link
          >
            <i class="fas {isUnlinked ? 'fa-link-slash' : 'fa-link'}" aria-hidden="true"></i>
            <span>{isUnlinked
              ? text('FABRICATE.Canvas.Interactable.Config.Node.LinkUnlinked', 'Independent (this interactable only)')
              : text('FABRICATE.Canvas.Interactable.Config.Node.LinkLinked', 'Linked to gathering task')}</span>
          </button>
        </div>

        {#if !isUnlinked}
          <p class="fab-ic-fact-muted fab-ic-node-hint">{text('FABRICATE.Canvas.Interactable.Config.Node.LinkedHint', 'Depletion and respawn follow the gathering task\'s shared node.')}</p>
        {:else if scopedNode}
          <p class="fab-ic-fact-muted fab-ic-node-hint">{text('FABRICATE.Canvas.Interactable.Config.Node.UnlinkedHint', 'Independent count, regeneration, and max — separate from the task.')}</p>
          <p class="fab-ic-node-state" data-interactable-node-state>
            {#if scopedNode.current <= 0 && nodeIsNonRegenerating}
              <span class="fab-ic-node-exhausted">{text('FABRICATE.Canvas.Interactable.Config.Node.Exhausted', 'Permanently exhausted')}</span>
            {:else if scopedNode.current <= 0}
              <span class="fab-ic-node-depleted">{text('FABRICATE.Canvas.Interactable.Config.Node.Depleted', 'Depleted')}</span>
            {:else}
              <span>{text('FABRICATE.Canvas.Interactable.Config.Node.Available', 'Available')}</span>
            {/if}
            <span class="fab-ic-fact-muted">{scopedNode.current} / {scopedNode.max}</span>
          </p>

          <label class="fab-ic-field">
            <span class="fab-ic-field-label">{text('FABRICATE.Admin.Manager.Economy.TaskNodeCount', 'Node count')}</span>
            <input
              type="number" min="0" step="1" placeholder="—"
              value={scopedNode.max > 0 ? scopedNode.max : ''}
              onchange={(e) => setNodeCount(e.currentTarget.value)}
              data-interactable-node-count
            />
          </label>

          <label class="fab-ic-field">
            <span class="fab-ic-field-label">{text('FABRICATE.Admin.Manager.Economy.TaskNodeDeplete', 'Deplete')}</span>
            <select value={scopedNode.depletionTiming} onchange={(e) => setNodeDeplete(e.currentTarget.value)} data-interactable-node-deplete>
              <option value="onStart">{text('FABRICATE.Admin.Manager.Economy.DepleteOnStart', 'On start')}</option>
              <option value="onSuccess">{text('FABRICATE.Admin.Manager.Economy.DepleteOnSuccess', 'On success')}</option>
            </select>
          </label>

          <label class="fab-ic-field">
            <span class="fab-ic-field-label">{text('FABRICATE.Admin.Manager.Economy.TaskNodeRespawn', 'Respawn')}</span>
            <select value={respawnPolicy} onchange={(e) => setNodeRespawnPolicy(e.currentTarget.value)} data-interactable-node-respawn>
              <option value="manual">{text('FABRICATE.Admin.Manager.Economy.RespawnManual', 'Manual')}</option>
              <option value="overTime">{text('FABRICATE.Admin.Manager.Economy.RespawnOverTime', 'Over world time')}</option>
              <option value="nonRegenerating">{text('FABRICATE.Admin.Manager.Economy.RespawnNone', 'Does not regenerate')}</option>
            </select>
          </label>

          {#if nodeIsNonRegenerating}
            <!-- A nonRegenerating pool is a permanent reserve: no Restock action,
                 only a read-only permanence hint. The node-count input above still
                 authors the reserve size. -->
            <p class="fab-ic-fact-muted fab-ic-node-hint" data-interactable-node-no-restock-hint>
              {text('FABRICATE.Canvas.Interactable.Config.Node.NoRestock', 'Cannot restock — this node does not regenerate.')}
            </p>
          {:else}
            <div class="fab-ic-actions fab-ic-actions-inline">
              <button
                type="button"
                class="fab-ic-btn"
                onclick={restockFull}
                data-interactable-node-restock
              >
                <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
                <span>{text('FABRICATE.Canvas.Interactable.Config.Node.Restock', 'Restock')}</span>
              </button>
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <!-- Linked visual -->
    <section class="fab-ic-section">
      <h3 class="fab-ic-section-title">{text('FABRICATE.Canvas.Interactable.Config.VisualHeading', 'Linked marker')}</h3>
      <p class="fab-ic-visual-status" class:is-missing={visualStatus.severity === 'missing'}>
        <i class="fas {visualStatus.icon}" aria-hidden="true"></i>
        {#if visualStatus.kind}
          <!-- Resolved marker: read sensibly per kind ("Linked marker: Token"). -->
          <span>{text('FABRICATE.Canvas.Interactable.Config.VisualOkPrefix', 'Linked marker:')} {text(visualStatus.kind.key, visualStatus.kind.fallback)}</span>
        {:else}
          <span>{text(visualStatus.key, visualStatus.fallback)}</span>
        {/if}
      </p>

      {#if visualStatus.severity === 'missing'}
        <div class="fab-ic-actions fab-ic-actions-inline">
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.createReplacementTile?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RecreateTile', 'Recreate tile')}
          </button>
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.createDrawingMarker?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.CreateDrawingMarker', 'Create drawing marker')}
          </button>
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.relinkSelected?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RelinkSelected', 'Relink selected')}
          </button>
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.removeVisualMarker?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.ClearVisualLink', 'Clear visual link')}
          </button>
        </div>
      {:else if visualStatus.severity === 'none'}
        <!-- Region-only (no marker): offer an upgrade to a linked Tile or Drawing. -->
        <div class="fab-ic-actions fab-ic-actions-inline">
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.createMarker?.())}>
            <i class="fas fa-map-pin" aria-hidden="true"></i>
            <span>{text('FABRICATE.Canvas.Interactable.Config.CreateMarker', 'Create marker')}</span>
          </button>
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.createDrawingMarker?.())}>
            <i class="fas fa-draw-polygon" aria-hidden="true"></i>
            <span>{text('FABRICATE.Canvas.Interactable.Config.CreateDrawingMarker', 'Create drawing marker')}</span>
          </button>
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.relinkSelected?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RelinkSelected', 'Relink selected')}
          </button>
        </div>
      {:else if visualStatus.severity === 'ok'}
        <!-- Resolved (healthy) marker: still offer relink-to-a-different-doc and
             remove-from-panel, mirroring the missing-state affordances. -->
        <div class="fab-ic-actions fab-ic-actions-inline">
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.relinkSelected?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RelinkSelected', 'Relink selected')}
          </button>
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.removeVisualMarker?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RemoveVisualMarker', 'Remove visual marker')}
          </button>
        </div>
      {/if}

      <label class="fab-ic-field">
        <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.MissingPolicyLabel', 'If the marker is missing')}</span>
        <select
          value={view.linkedVisual.missingPolicy}
          onchange={(e) => setMissingPolicy(e.currentTarget.value)}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.MissingPolicyLabel', 'If the marker is missing')}
        >
          <option value="ignore">{text('FABRICATE.Canvas.Interactable.Config.MissingIgnore', 'Ignore')}</option>
          <option value="warn">{text('FABRICATE.Canvas.Interactable.Config.MissingWarn', 'Warn')}</option>
          <option value="recreate">{text('FABRICATE.Canvas.Interactable.Config.MissingRecreate', 'Recreate')}</option>
        </select>
      </label>
    </section>

    <!-- Presentation toggles -->
    <section class="fab-ic-section">
      <label class="fab-ic-toggle">
        <input
          type="checkbox"
          checked={view.presentation.hidden}
          onchange={(e) => setHidden(e.currentTarget.checked)}
        />
        <span>{text('FABRICATE.Canvas.Interactable.Config.HiddenLabel', 'Hidden from players')}</span>
      </label>
      <label class="fab-ic-field">
        <span class="fab-ic-field-label">{text('FABRICATE.Canvas.Interactable.Config.AudienceLabel', 'Who can activate')}</span>
        <select
          value={view.activation.audience}
          onchange={(e) => setAudience(e.currentTarget.value)}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.AudienceLabel', 'Who can activate')}
        >
          <option value="players">{text('FABRICATE.Canvas.Interactable.Config.AudiencePlayers', 'Players')}</option>
          <option value="all">{text('FABRICATE.Canvas.Interactable.Config.AudienceAll', 'Everyone')}</option>
        </select>
      </label>
    </section>

    <!-- Primary action row -->
    <section class="fab-ic-section fab-ic-actions">
      <button type="button" class="fab-ic-btn fab-ic-btn-primary" onclick={() => run(() => services?.testAsPlayer?.())}>
        <i class="fas fa-play" aria-hidden="true"></i>
        <span>{text('FABRICATE.Canvas.Interactable.Config.TestAsPlayer', 'Test as player')}</span>
      </button>
      <button type="button" class="fab-ic-btn" onclick={() => services?.jumpToRegion?.()}>
        {text('FABRICATE.Canvas.Interactable.Config.JumpToRegion', 'Jump to region')}
      </button>
      <button type="button" class="fab-ic-btn" onclick={() => services?.jumpToVisual?.()}>
        {text('FABRICATE.Canvas.Interactable.Config.JumpToVisual', 'Jump to marker')}
      </button>
    </section>

    <!-- State toggle row. The Disable / Lock buttons carry an `is-active`
         (and aria-pressed) treatment when the interactable is currently
         disabled / locked so the GM sees the live state at a glance. -->
    <section class="fab-ic-section fab-ic-actions">
      <button
        type="button"
        class="fab-ic-btn fab-ic-btn-toggle"
        class:is-active={view.state.enabled === false}
        aria-pressed={view.state.enabled === false}
        onclick={() => run(() => services?.setEnabled?.(!view.state.enabled))}
      >
        {view.state.enabled
          ? text('FABRICATE.Canvas.Interactable.Config.Disable', 'Disable')
          : text('FABRICATE.Canvas.Interactable.Config.Enable', 'Enable')}
      </button>
      <button
        type="button"
        class="fab-ic-btn fab-ic-btn-toggle"
        class:is-active={view.state.locked === true}
        aria-pressed={view.state.locked === true}
        onclick={() => run(() => services?.setLocked?.(!view.state.locked))}
      >
        {view.state.locked
          ? text('FABRICATE.Canvas.Interactable.Config.Unlock', 'Unlock')
          : text('FABRICATE.Canvas.Interactable.Config.Lock', 'Lock')}
      </button>
      <button type="button" class="fab-ic-btn fab-ic-btn-danger" onclick={() => run(() => services?.deleteInteractable?.())}>
        {text('FABRICATE.Canvas.Interactable.Config.Delete', 'Delete interactable')}
      </button>
    </section>
  {/if}
</div>

<style>
  .fabricate-interactable-config {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
    height: 100%;
    overflow-y: auto;
  }

  .fab-ic-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .fab-ic-title {
    margin: 0;
    font-size: 1.15rem;
  }

  .fab-ic-type-chip {
    flex: 0 0 auto;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    opacity: 0.85;
  }

  .fab-ic-section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .fab-ic-section-title {
    margin: 0;
    font-size: 0.95rem;
  }

  .fab-ic-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .fab-ic-field-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }

  /* Inline facts row: Linked task | Environment | Status. Two columns by
     default (tool: no Environment fact); three when the Environment fact is
     present. `minmax(0, 1fr)` lets long values truncate/wrap inside their cell
     instead of overflowing the panel on a narrow window. */
  .fab-ic-fact-list {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem 0.75rem;
    align-items: start;
  }

  .fab-ic-fact-list.has-environment {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* Collapse to a single column on a narrow panel so cells never overflow. */
  @container (max-width: 22rem) {
    .fab-ic-fact-list,
    .fab-ic-fact-list.has-environment {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .fab-ic-fact {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .fab-ic-fact dt {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.6;
  }

  .fab-ic-facts {
    container-type: inline-size;
  }

  .fab-ic-fact dd {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .fab-ic-fact-name {
    overflow-wrap: anywhere;
  }

  .fab-ic-fact-id {
    font-size: 0.7rem;
    padding: 0.05rem 0.3rem;
    border: 1px solid var(--fab-border);
    border-radius: 3px;
    opacity: 0.8;
  }

  .fab-ic-fact-muted {
    opacity: 0.7;
  }

  .fab-ic-visual-status {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .fab-ic-visual-status.is-missing {
    color: var(--fab-warning);
    font-weight: 600;
  }

  .fab-ic-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .fab-ic-actions {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .fab-ic-actions-inline {
    display: flex;
  }

  .fab-ic-btn {
    flex: 0 0 auto;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .fab-ic-btn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-ic-btn-primary {
    font-weight: 600;
  }

  /* Active-state treatment for the Disable / Lock toggles: when the interactable
     is currently disabled / locked the button reads as "on" (themed accent fill,
     not a literal colour) so the GM sees the live state at a glance. */
  .fab-ic-btn-toggle.is-active {
    background: var(--fab-accent-soft);
    border-color: var(--fab-accent);
    color: var(--fab-accent-strong);
    font-weight: 600;
  }

  .fab-ic-btn-danger {
    color: var(--fab-danger);
  }

  .fab-ic-empty {
    margin: 0;
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .fab-ic-node-hint {
    margin: 0;
    font-size: 0.85rem;
  }

  .fab-ic-node-state {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .fab-ic-node-depleted {
    color: var(--fab-warning);
    font-weight: 600;
  }

  .fab-ic-node-exhausted {
    color: var(--fab-danger);
    font-weight: 600;
  }

  /* Identity / source section (issue 342). The unconfigured state is given a
     prominent themed-accent treatment so the GM cannot miss the "Needs
     configuration" call to action; once configured the section collapses. */
  .fab-ic-identity {
    gap: 0.55rem;
  }

  .fab-ic-identity.is-unconfigured {
    padding: 0.6rem;
    border: 1px solid var(--fab-accent);
    border-radius: 6px;
    background: var(--fab-accent-soft);
  }

  .fab-ic-identity-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    color: var(--fab-accent-strong);
  }

  .fab-ic-identity-banner strong {
    font-size: 0.95rem;
  }

  .fab-ic-identity-hint {
    margin: 0.15rem 0 0;
    font-size: 0.82rem;
  }

  .fab-ic-identity-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .fab-ic-identity-body {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .fab-ic-identity-toggle {
    flex: 0 0 auto;
  }
</style>
