<!-- Svelte 5 runes mode -->
<!--
  InteractableConfigRoot — the rich GM config panel body for a region-first
  `fabricate.interactable` Region Behaviour (Phase 2).

  It is a THIN VIEW over the injected `services` bag: the panel reads a single
  view model (`services.summarize()` → `{ view, node, ref }`) computed by the pure
  `interactableConfigActions` helpers, renders the read-only facts + the editable
  fields, and wires each action button to a `services.*` seam. Every write routes
  through the active-GM behaviour-update edge inside the services bag — the panel
  never mutates a behaviour directly.

  Editable fields (name, prompt text, hidden, audience, missing-policy) write back
  via `services.updateBehavior(systemPatch)`. The non-trivial view logic (label
  resolution, ETA formatting, the missing-visual warning state) is extracted into
  the pure `interactableConfigView.js` helpers so it is unit-testable.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import {
    describeVisualStatus,
    describeActivationGate,
    formatRespawnEta,
    describeNodeLine
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
  const node = $derived(snapshot?.node ?? null);
  const worldTime = $derived(snapshot?.now ?? null);

  const sourceLabel = $derived.by(() => { void tick; return services?.resolveSourceLabel?.() ?? null; });
  const environmentLabel = $derived.by(() => { void tick; return services?.resolveEnvironmentLabel?.() ?? null; });

  const visualStatus = $derived(describeVisualStatus(view?.linkedVisual ?? null));
  const activationGate = $derived(describeActivationGate(view?.state ?? null, { now: worldTime, node }));
  const nodeLine = $derived(describeNodeLine(node));
  const respawnText = $derived(formatRespawnEta(node?.respawnEta ?? null));

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
    services?.updateBehavior?.({ presentation: { hidden: hidden === true } });
    refresh();
  }

  function setAudience(audience) {
    services?.updateBehavior?.({ activation: { audience } });
    refresh();
  }

  function setMissingPolicy(missingPolicy) {
    services?.updateBehavior?.({ linkedVisual: { missingPolicy } });
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
          placeholder={text('FABRICATE.Canvas.Interactable.Config.PromptPlaceholder', 'Shown to players on the toast')}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.PromptLabel', 'Prompt text')}
        />
      </label>
    </section>

    <!-- Read-only facts -->
    <section class="fab-ic-section fab-ic-facts">
      <dl class="fab-ic-fact-list">
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
          <dt>{text('FABRICATE.Canvas.Interactable.Config.ActivationLabel', 'Activation')}</dt>
          <dd><span class="fab-ic-fact-muted">{text(activationGate.key, activationGate.fallback)}</span></dd>
        </div>
      </dl>
    </section>

    <!-- Linked visual -->
    <section class="fab-ic-section">
      <h3 class="fab-ic-section-title">{text('FABRICATE.Canvas.Interactable.Config.VisualHeading', 'Linked marker')}</h3>
      <p class="fab-ic-visual-status" class:is-missing={visualStatus.severity === 'missing'}>
        <i class="fas {visualStatus.icon}" aria-hidden="true"></i>
        <span>{text(visualStatus.key, visualStatus.fallback)}</span>
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

    <!-- Node state (gathering tasks only) -->
    {#if node?.hasNode}
      <section class="fab-ic-section">
        <h3 class="fab-ic-section-title">{text('FABRICATE.Canvas.Interactable.Config.NodeHeading', 'Resource node')}</h3>
        <p class="fab-ic-node-line" class:is-depleted={node.depleted}>
          {text(nodeLine.key, nodeLine.fallback)}
          <span class="fab-ic-node-count">{node.current} / {node.max}</span>
        </p>
        {#if respawnText}
          <p class="fab-ic-node-eta">{text('FABRICATE.Canvas.Interactable.Config.RespawnEta', 'Next respawn in')} {respawnText}</p>
        {/if}
        <div class="fab-ic-actions fab-ic-actions-inline">
          <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.restockNode?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.Restock', 'Restock')}
          </button>
        </div>
      </section>
    {/if}

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

    <!-- State toggle row -->
    <section class="fab-ic-section fab-ic-actions">
      <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.setEnabled?.(!view.state.enabled))}>
        {view.state.enabled
          ? text('FABRICATE.Canvas.Interactable.Config.Disable', 'Disable')
          : text('FABRICATE.Canvas.Interactable.Config.Enable', 'Enable')}
      </button>
      <button type="button" class="fab-ic-btn" onclick={() => run(() => services?.setLocked?.(!view.state.locked))}>
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

  .fab-ic-fact-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .fab-ic-fact {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .fab-ic-fact dt {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.6;
  }

  .fab-ic-fact dd {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
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

  .fab-ic-node-line {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fab-ic-node-line.is-depleted {
    color: var(--fab-warning);
    font-weight: 600;
  }

  .fab-ic-node-count {
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }

  .fab-ic-node-eta {
    margin: 0;
    font-size: 0.82rem;
    opacity: 0.75;
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

  .fab-ic-btn-danger {
    color: var(--fab-danger);
  }

  .fab-ic-empty {
    margin: 0;
    font-size: 0.9rem;
    opacity: 0.75;
  }
</style>
