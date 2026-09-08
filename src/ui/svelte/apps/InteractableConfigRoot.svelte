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
  import { describeVisualStatus, describeActivationGate } from '../../interactableConfigView.js';
  import { buildSystemLabelMap, systemDisplayLabel } from '../util/systemDisambiguation.js';
  import Chip from '../components/Chip.svelte';
  import Field from '../components/Field.svelte';
  import ManagerButton from '../components/ManagerButton.svelte';
  import Notice from '../components/Notice.svelte';
  import Select from '../components/Select.svelte';
  import StatusToggle from '../components/StatusToggle.svelte';
  import Stepper from '../components/Stepper.svelte';
  import { stepperLabels } from '../components/stepperLabels.js';

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

  const sourceLabel = $derived.by(() => {
    void tick;
    return services?.resolveSourceLabel?.() ?? null;
  });
  const environmentLabel = $derived.by(() => {
    void tick;
    return services?.resolveEnvironmentLabel?.() ?? null;
  });

  // --- Identity / source configuration (issue 342) ----------------------------
  // An unconfigured interactable (born via the native "+ Add Behavior" path) is
  // inert until a GM picks its source here. The section also expands (collapsed by
  // default) to RE-TARGET a configured interactable.
  const unconfigured = $derived(view?.unconfigured === true);

  let identityOpen = $state(false);
  // Open the section automatically while unconfigured (the prominent "Needs
  // configuration" state); a configured interactable keeps it collapsed until asked.
  $effect(() => {
    if (unconfigured) identityOpen = true;
  });
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

  const systemOptions = $derived.by(() => {
    void tick;
    return services?.listSystems?.() ?? [];
  });
  // Same-named systems are indistinguishable in the picker; disambiguate colliding
  // display names with a short id suffix (issue 346).
  const systemLabels = $derived(buildSystemLabelMap(systemOptions));
  const sourceOptions = $derived.by(() => {
    void tick;
    if (!selSystemId) return [];
    return selType === 'tool'
      ? (services?.listTools?.(selSystemId) ?? [])
      : (services?.listTasks?.(selSystemId) ?? []);
  });
  const environmentOptions = $derived.by(() => {
    void tick;
    return services?.listEnvironments?.() ?? [];
  });

  const canApplyIdentity = $derived(Boolean(selSystemId) && Boolean(selReferenceId));

  // THE SHARED SELECT'S OPTION VOCABULARY (issue 1520). `Select` takes an `options` array
  // rather than `<option>` children, so each list is built here from exactly the source the
  // native `<select>` iterated. The leading empty-value row is KEPT rather than expressed as
  // the component's `placeholder`, because it is a real selectable row today: a GM clears a
  // chosen system, source or environment by picking it, and a placeholder is only ever shown.
  const typeOptions = $derived([
    { value: 'tool', label: text('FABRICATE.Canvas.Interactable.Config.TypeTool', 'Tool station') },
    {
      value: 'gatheringTask',
      label: text('FABRICATE.Canvas.Interactable.Config.TypeTask', 'Gathering task'),
    },
  ]);

  const systemSelectOptions = $derived([
    {
      value: '',
      label: text(
        'FABRICATE.Canvas.Interactable.Config.Identity.SelectSystem',
        'Select a crafting system…'
      ),
    },
    ...systemOptions.map((option) => ({
      value: option.id,
      label: systemDisplayLabel(option, systemLabels),
    })),
  ]);

  const sourceSelectOptions = $derived([
    {
      value: '',
      label:
        selType === 'tool'
          ? text('FABRICATE.Canvas.Interactable.Config.Identity.SelectTool', 'Select a tool…')
          : text(
              'FABRICATE.Canvas.Interactable.Config.Identity.SelectTask',
              'Select a gathering task…'
            ),
    },
    ...sourceOptions.map((option) => ({ value: option.id, label: option.name })),
  ]);

  const environmentSelectOptions = $derived([
    {
      value: '',
      label: text(
        'FABRICATE.Canvas.Interactable.Config.Identity.SelectEnvironment',
        'No environment'
      ),
    },
    ...environmentOptions.map((option) => ({ value: option.id, label: option.name })),
  ]);

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
        : { taskId: selReferenceId, environmentId: selEnvironmentId || undefined }),
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

  const missingPolicyOptions = $derived([
    {
      value: 'ignore',
      label: text('FABRICATE.Canvas.Interactable.Config.MissingIgnore', 'Ignore'),
    },
    { value: 'warn', label: text('FABRICATE.Canvas.Interactable.Config.MissingWarn', 'Warn') },
    {
      value: 'recreate',
      label: text('FABRICATE.Canvas.Interactable.Config.MissingRecreate', 'Recreate'),
    },
  ]);

  const audienceOptions = $derived([
    {
      value: 'players',
      label: text('FABRICATE.Canvas.Interactable.Config.AudiencePlayers', 'Players'),
    },
    { value: 'all', label: text('FABRICATE.Canvas.Interactable.Config.AudienceAll', 'Everyone') },
  ]);

  // --- Interactable-scoped resource node (issue 302) --------------------------
  const isGatheringTask = $derived(view?.interactableType === 'gatheringTask');
  const taskNodeLink = $derived(view?.taskNodeLink ?? 'linked');
  const isUnlinked = $derived(taskNodeLink === 'unlinked');
  const scopedNode = $derived(view?.node ?? null);
  const respawnPolicy = $derived(scopedNode?.respawn?.policy ?? 'manual');
  const nodeIsNonRegenerating = $derived(respawnPolicy === 'nonRegenerating');

  const depleteOptions = $derived([
    {
      value: 'onStart',
      label: text('FABRICATE.Admin.Manager.Economy.DepleteOnStart', 'On start'),
    },
    {
      value: 'onSuccess',
      label: text('FABRICATE.Admin.Manager.Economy.DepleteOnSuccess', 'On success'),
    },
  ]);

  const respawnOptions = $derived([
    { value: 'manual', label: text('FABRICATE.Admin.Manager.Economy.RespawnManual', 'Manual') },
    {
      value: 'overTime',
      label: text('FABRICATE.Admin.Manager.Economy.RespawnOverTime', 'Over world time'),
    },
    {
      value: 'nonRegenerating',
      label: text('FABRICATE.Admin.Manager.Economy.RespawnNone', 'Does not regenerate'),
    },
  ]);

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
    await services?.restockScopedNode?.({
      current: Number(scopedNode.max || 0),
      max: Number(scopedNode.max || 0),
    });
    refresh();
  }
</script>

<div class="fabricate-interactable-config">
  {#if !view}
    <p class="fab-ic-empty">
      {text(
        'FABRICATE.Canvas.Interactable.Config.Unavailable',
        'This interactable could not be loaded.'
      )}
    </p>
  {:else}
    <header class="fab-ic-header">
      <h2 class="fab-ic-title">
        {view.name ||
          text('FABRICATE.Canvas.Interactable.Config.Untitled', 'Untitled interactable')}
      </h2>
      <Chip tone="secondary"
        >{view.interactableType === 'tool'
          ? text('FABRICATE.Canvas.Interactable.Config.TypeTool', 'Tool station')
          : text('FABRICATE.Canvas.Interactable.Config.TypeTask', 'Gathering task')}</Chip
      >
    </header>

    <!-- Identity / source (issue 342). Prominent "Needs configuration" state while
         unconfigured; collapsed re-target affordance once configured. -->
    <section class="fab-ic-section fab-ic-identity" data-interactable-identity-section>
      {#if unconfigured}
        <!-- THE HOOK RIDES A DECLARED PROP, NOT A SPREAD. `Notice` takes no `class`, no
             `style` and no rest spread, so `dataAttr` is the only route for
             `data-interactable-needs-config` - which the Foundry smoke and the View Lab both
             locate, and which this root's source contract asserts is present. It renders as
             `data-interactable-needs-config=""` rather than bare; every reader of it is a
             presence selector.

             THE SECTION'S OWN ACCENT BOX LEFT WITH THE BANNER rather than being retargeted.
             `is-unconfigured` sat on the SECTION, not on the bar, so keeping it would have
             drawn a tinted, bordered box around a tinted, bordered notice - one state painted
             twice, in two different colour families. The `warning` tone is where that
             statement lives now. -->
        <Notice
          tone="warning"
          title={text(
            'FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigTitle',
            'Needs configuration'
          )}
          detail={text(
            'FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigHint',
            'This interactable has no source yet. It stays hidden and inert to players until you choose its type and source below.'
          )}
          dataAttr="data-interactable-needs-config"
        />
      {:else}
        <div class="fab-ic-identity-head">
          <h3 class="fab-ic-section-title">
            {text('FABRICATE.Canvas.Interactable.Config.Identity.Heading', 'Source')}
          </h3>
          <ManagerButton
            aria-expanded={identityOpen}
            onclick={() => (identityOpen = !identityOpen)}
            data-interactable-identity-toggle=""
          >
            {identityOpen
              ? text('FABRICATE.Canvas.Interactable.Config.Identity.Hide', 'Hide')
              : text('FABRICATE.Canvas.Interactable.Config.Identity.Retarget', 'Change source')}
          </ManagerButton>
        </div>
      {/if}

      {#if showIdentityBody}
        <div class="fab-ic-identity-body" data-interactable-identity-body>
          <Select
            label={text('FABRICATE.Canvas.Interactable.Config.Identity.TypeLabel', 'Type')}
            value={selType}
            options={typeOptions}
            onChange={(next) => onSelectType(next)}
            triggerData={{ 'data-interactable-identity-type': '' }}
          />

          <Select
            label={text(
              'FABRICATE.Canvas.Interactable.Config.Identity.SystemLabel',
              'Crafting system'
            )}
            value={selSystemId}
            options={systemSelectOptions}
            onChange={(next) => onSelectSystem(next)}
            triggerData={{ 'data-interactable-identity-system': '' }}
          />

          <Select
            label={selType === 'tool'
              ? text('FABRICATE.Canvas.Interactable.Config.Identity.ToolLabel', 'Tool')
              : text('FABRICATE.Canvas.Interactable.Config.Identity.TaskLabel', 'Gathering task')}
            value={selReferenceId}
            options={sourceSelectOptions}
            disabled={!selSystemId}
            onChange={(next) => (selReferenceId = next)}
            triggerData={{ 'data-interactable-identity-source': '' }}
          />

          {#if selType === 'gatheringTask'}
            <Select
              label={text(
                'FABRICATE.Canvas.Interactable.Config.Identity.EnvironmentLabel',
                'Environment (optional)'
              )}
              value={selEnvironmentId}
              options={environmentSelectOptions}
              onChange={(next) => (selEnvironmentId = next)}
              triggerData={{ 'data-interactable-identity-environment': '' }}
            />
          {/if}

          <div class="fab-ic-actions fab-ic-actions-inline">
            <ManagerButton
              role="primary"
              disabled={!canApplyIdentity}
              onclick={applyIdentity}
              data-interactable-identity-apply=""
            >
              <i class="fas fa-check" aria-hidden="true"></i>
              <span
                >{text('FABRICATE.Canvas.Interactable.Config.Identity.Apply', 'Apply source')}</span
              >
            </ManagerButton>
          </div>
        </div>
      {/if}
    </section>

    <!-- Editable identity -->
    <section class="fab-ic-section">
      <Field as="label">
        <span>{text('FABRICATE.Canvas.Interactable.Config.NameLabel', 'Name')}</span>
        <input
          type="text"
          bind:value={nameDraft}
          onchange={commitName}
          onblur={commitName}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.NameLabel', 'Name')}
        />
      </Field>
      <Field as="label">
        <span>{text('FABRICATE.Canvas.Interactable.Config.PromptLabel', 'Prompt text')}</span>
        <input
          type="text"
          bind:value={promptDraft}
          onchange={commitPrompt}
          onblur={commitPrompt}
          placeholder={text(
            'FABRICATE.Canvas.Interactable.Config.PromptPlaceholder',
            'Shown to players in the interaction prompt'
          )}
          aria-label={text('FABRICATE.Canvas.Interactable.Config.PromptLabel', 'Prompt text')}
        />
      </Field>
    </section>

    <!-- Read-only facts: an inline row — Linked task | Environment | Status. The
         Environment fact is omitted for a tool interactable, so the grid lays out
         as 3 columns when it is present and 2 columns when it is absent. -->
    <section class="fab-ic-section fab-ic-facts">
      <dl
        class="fab-ic-fact-list"
        class:has-environment={view.interactableType === 'gatheringTask'}
      >
        <div class="fab-ic-fact">
          <dt>
            {view.interactableType === 'tool'
              ? text('FABRICATE.Canvas.Interactable.Config.ToolLabel', 'Linked tool')
              : text('FABRICATE.Canvas.Interactable.Config.TaskLabel', 'Linked gathering task')}
          </dt>
          <dd>
            <span class="fab-ic-fact-name"
              >{sourceLabel ??
                text('FABRICATE.Canvas.Interactable.Config.UnresolvedSource', 'Unresolved')}</span
            >
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
                <span class="fab-ic-fact-muted"
                  >{text('FABRICATE.Canvas.Interactable.Config.NoEnvironment', 'None')}</span
                >
              {/if}
            </dd>
          </div>
        {/if}
        <div class="fab-ic-fact">
          <dt>{text('FABRICATE.Canvas.Interactable.Config.StatusLabel', 'Status')}</dt>
          <dd>
            <span class="fab-ic-fact-muted"
              >{text(activationGate.key, activationGate.fallback)}</span
            >
          </dd>
        </div>
      </dl>
    </section>

    <!-- Resource node (gatheringTask only): task-node link toggle + independent
         pool editor. Linked = shares the gathering task's node; unlinked = this
         interactable owns its own pool (FVTT token↔actor link framing). -->
    {#if isGatheringTask}
      <section class="fab-ic-section" data-interactable-node-section>
        <h3 class="fab-ic-section-title">
          {text('FABRICATE.Canvas.Interactable.Config.Node.Heading', 'Resource node')}
        </h3>
        <Field as="div">
          <span
            >{text('FABRICATE.Canvas.Interactable.Config.Node.LinkLabel', 'Task node link')}</span
          >
          <!-- THE SWITCH REPLACES THE LINK GLYPH RATHER THAN CARRYING IT. The button this
               converts drew `fa-link` / `fa-link-slash` because a pressed text button cannot
               show its own position; a track and a knob can, and `StatusToggle` has no icon
               slot for a second statement of the same thing.

               `on` is LINKED, so `aria-pressed` keeps the polarity the Foundry smoke asserts
               (`true` on open, `false` after the toggle) and the View Lab's configured case
               selects on. The reading beside the switch is the state, which is the shipped
               `label` idiom. -->
          <StatusToggle
            on={!isUnlinked}
            label={isUnlinked
              ? text(
                  'FABRICATE.Canvas.Interactable.Config.Node.LinkUnlinked',
                  'Independent (this interactable only)'
                )
              : text(
                  'FABRICATE.Canvas.Interactable.Config.Node.LinkLinked',
                  'Linked to gathering task'
                )}
            onclick={() => setTaskNodeLink(isUnlinked ? 'linked' : 'unlinked')}
            data-interactable-node-link=""
          />
        </Field>

        {#if !isUnlinked}
          <p class="fab-ic-fact-muted fab-ic-node-hint">
            {text(
              'FABRICATE.Canvas.Interactable.Config.Node.LinkedHint',
              "Depletion and respawn follow the gathering task's shared node."
            )}
          </p>
        {:else if scopedNode}
          <p class="fab-ic-fact-muted fab-ic-node-hint">
            {text(
              'FABRICATE.Canvas.Interactable.Config.Node.UnlinkedHint',
              'Independent count, regeneration, and max — separate from the task.'
            )}
          </p>
          <p class="fab-ic-node-state" data-interactable-node-state>
            {#if scopedNode.current <= 0 && nodeIsNonRegenerating}
              <span class="fab-ic-node-exhausted"
                >{text(
                  'FABRICATE.Canvas.Interactable.Config.Node.Exhausted',
                  'Permanently exhausted'
                )}</span
              >
            {:else if scopedNode.current <= 0}
              <span class="fab-ic-node-depleted"
                >{text('FABRICATE.Canvas.Interactable.Config.Node.Depleted', 'Depleted')}</span
              >
            {:else}
              <span>{text('FABRICATE.Canvas.Interactable.Config.Node.Available', 'Available')}</span
              >
            {/if}
            <span class="fab-ic-fact-muted">{scopedNode.current} / {scopedNode.max}</span>
          </p>

          <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`.

               NO `allowUnset`, even though the bare input this replaces rendered blank
               for 0. Absence cannot survive the write path: every scoped-node patch goes
               through `normalizeNodeConfig`, which hard-codes `max: max ?? 0`, so
               `onChange(null)` would silently persist 0 while the field claimed to have
               cleared the pool. It is cosmetic-zero and shows `0`.

               The commit moment also moves from `change` to `input`, matching every other
               migrated field; the persisted value is identical.

               `fill` needs a slot to fill, and the `<Field>` that hosts it is a
               `flex-direction: column` box with no declared width, so the slot is supplied by
               `.fab-ic-node-count-field`'s `max-width` below. See the note there for why
               dropping `fill` would not have been the fix. -->
          <Field as="div" class="fab-ic-node-count-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.TaskNodeCount', 'Node count')}</span>
            <Stepper
              value={scopedNode.max}
              min={0}
              step={1}
              fill
              density="comfortable"
              {...stepperLabels(
                text('FABRICATE.Admin.Manager.Economy.TaskNodeCount', 'Node count')
              )}
              inputProps={{ 'data-interactable-node-count': '' }}
              onChange={(next) => setNodeCount(next)}
            />
          </Field>

          <Select
            label={text('FABRICATE.Admin.Manager.Economy.TaskNodeDeplete', 'Deplete')}
            value={scopedNode.depletionTiming}
            options={depleteOptions}
            onChange={(next) => setNodeDeplete(next)}
            triggerData={{ 'data-interactable-node-deplete': '' }}
          />

          <Select
            label={text('FABRICATE.Admin.Manager.Economy.TaskNodeRespawn', 'Respawn')}
            value={respawnPolicy}
            options={respawnOptions}
            onChange={(next) => setNodeRespawnPolicy(next)}
            triggerData={{ 'data-interactable-node-respawn': '' }}
          />

          {#if nodeIsNonRegenerating}
            <!-- A nonRegenerating pool is a permanent reserve: no Restock action,
                 only a read-only permanence hint. The node-count input above still
                 authors the reserve size. -->
            <p class="fab-ic-fact-muted fab-ic-node-hint" data-interactable-node-no-restock-hint>
              {text(
                'FABRICATE.Canvas.Interactable.Config.Node.NoRestock',
                'Cannot restock — this node does not regenerate.'
              )}
            </p>
          {:else}
            <div class="fab-ic-actions fab-ic-actions-inline">
              <ManagerButton onclick={restockFull} data-interactable-node-restock="">
                <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
                <span>{text('FABRICATE.Canvas.Interactable.Config.Node.Restock', 'Restock')}</span>
              </ManagerButton>
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <!-- Linked visual -->
    <section class="fab-ic-section">
      <h3 class="fab-ic-section-title">
        {text('FABRICATE.Canvas.Interactable.Config.VisualHeading', 'Linked marker')}
      </h3>
      <p class="fab-ic-visual-status" class:is-missing={visualStatus.severity === 'missing'}>
        <i class="fas {visualStatus.icon}" aria-hidden="true"></i>
        {#if visualStatus.kind}
          <!-- Resolved marker: read sensibly per kind ("Linked marker: Token"). -->
          <span
            >{text('FABRICATE.Canvas.Interactable.Config.VisualOkPrefix', 'Linked marker:')}
            {text(visualStatus.kind.key, visualStatus.kind.fallback)}</span
          >
        {:else}
          <span>{text(visualStatus.key, visualStatus.fallback)}</span>
        {/if}
      </p>

      {#if visualStatus.severity === 'missing'}
        <div class="fab-ic-actions fab-ic-actions-inline">
          <ManagerButton onclick={() => run(() => services?.createReplacementTile?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RecreateTile', 'Recreate tile')}
          </ManagerButton>
          <ManagerButton onclick={() => run(() => services?.createDrawingMarker?.())}>
            {text(
              'FABRICATE.Canvas.Interactable.Config.CreateDrawingMarker',
              'Create drawing marker'
            )}
          </ManagerButton>
          <ManagerButton onclick={() => run(() => services?.relinkSelected?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RelinkSelected', 'Relink selected')}
          </ManagerButton>
          <ManagerButton onclick={() => run(() => services?.removeVisualMarker?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.ClearVisualLink', 'Clear visual link')}
          </ManagerButton>
        </div>
      {:else if visualStatus.severity === 'none'}
        <!-- Region-only (no marker): offer an upgrade to a linked Tile or Drawing. -->
        <div class="fab-ic-actions fab-ic-actions-inline">
          <ManagerButton onclick={() => run(() => services?.createMarker?.())}>
            <i class="fas fa-map-pin" aria-hidden="true"></i>
            <span>{text('FABRICATE.Canvas.Interactable.Config.CreateMarker', 'Create marker')}</span
            >
          </ManagerButton>
          <ManagerButton onclick={() => run(() => services?.createDrawingMarker?.())}>
            <i class="fas fa-draw-polygon" aria-hidden="true"></i>
            <span
              >{text(
                'FABRICATE.Canvas.Interactable.Config.CreateDrawingMarker',
                'Create drawing marker'
              )}</span
            >
          </ManagerButton>
          <ManagerButton onclick={() => run(() => services?.relinkSelected?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RelinkSelected', 'Relink selected')}
          </ManagerButton>
        </div>
      {:else if visualStatus.severity === 'ok'}
        <!-- Resolved (healthy) marker: still offer relink-to-a-different-doc and
             remove-from-panel, mirroring the missing-state affordances. -->
        <div class="fab-ic-actions fab-ic-actions-inline">
          <ManagerButton onclick={() => run(() => services?.relinkSelected?.())}>
            {text('FABRICATE.Canvas.Interactable.Config.RelinkSelected', 'Relink selected')}
          </ManagerButton>
          <ManagerButton onclick={() => run(() => services?.removeVisualMarker?.())}>
            {text(
              'FABRICATE.Canvas.Interactable.Config.RemoveVisualMarker',
              'Remove visual marker'
            )}
          </ManagerButton>
        </div>
      {/if}

      <!-- NO `ariaLabel` BESIDE THE `label`. The native select carried both a caption span
           and an `aria-label` repeating it; the labelled `<Select>` mints an id for its own
           caption and points the trigger at it with `aria-labelledby`, which WINS over an
           `aria-label` — so a second copy would be dead text free to drift from the caption
           beside it. -->
      <Select
        label={text(
          'FABRICATE.Canvas.Interactable.Config.MissingPolicyLabel',
          'If the marker is missing'
        )}
        value={view.linkedVisual.missingPolicy}
        options={missingPolicyOptions}
        onChange={(next) => setMissingPolicy(next)}
        triggerData={{ 'data-interactable-missing-policy': '' }}
      />
    </section>

    <!-- Presentation toggles -->
    <section class="fab-ic-section">
      <label class="fab-ic-toggle">
        <input
          type="checkbox"
          checked={view.presentation.hidden}
          onchange={(e) => setHidden(e.currentTarget.checked)}
        />
        <span
          >{text('FABRICATE.Canvas.Interactable.Config.HiddenLabel', 'Hidden from players')}</span
        >
      </label>
      <Select
        label={text('FABRICATE.Canvas.Interactable.Config.AudienceLabel', 'Who can activate')}
        value={view.activation.audience}
        options={audienceOptions}
        onChange={(next) => setAudience(next)}
        triggerData={{ 'data-interactable-audience': '' }}
      />
    </section>

    <!-- Primary action row -->
    <section class="fab-ic-section fab-ic-actions">
      <ManagerButton role="primary" onclick={() => run(() => services?.testAsPlayer?.())}>
        <i class="fas fa-play" aria-hidden="true"></i>
        <span>{text('FABRICATE.Canvas.Interactable.Config.TestAsPlayer', 'Test as player')}</span>
      </ManagerButton>
      <ManagerButton onclick={() => services?.jumpToRegion?.()}>
        {text('FABRICATE.Canvas.Interactable.Config.JumpToRegion', 'Jump to region')}
      </ManagerButton>
      <ManagerButton onclick={() => services?.jumpToVisual?.()}>
        {text('FABRICATE.Canvas.Interactable.Config.JumpToVisual', 'Jump to marker')}
      </ManagerButton>
    </section>

    <!-- State toggle row. Disabled and Locked are STATES of the interactable, so each is a
         switch whose position IS the state: `on` reads disabled / locked, which is the polarity
         the pressed `is-active` button before it carried and the polarity `aria-pressed` still
         announces.

         THE READING IS THE SHIPPED ACTION VERB, UNCHANGED, AND IT IS NOT WHAT A SWITCH WANTS.
         `StatusToggle`'s `label` is documented as the READING beside the switch - a state, not
         a verb - and these two flip between "Disable"/"Enable" and "Lock"/"Unlock" because a
         button had to say what pressing it would do. So the switch reads ON-and-"Enable" when
         the interactable is disabled, which states the opposite of its own knob.

         THAT PAIRING IS PRE-EXISTING RATHER THAN INTRODUCED HERE: the button this converts
         already announced "Enable, toggle button, PRESSED" in exactly that state. Fixing it
         needs state readings ("Disabled", "Locked") that `lang/en.json` does not carry, and
         the alternative - a static axis name - orphans
         `FABRICATE.Canvas.Interactable.Config.Enable` and `.Unlock`, which
         `tests/lang-keys-no-orphans.test.js` refuses. The copy is therefore carried across
         byte-for-byte and the defect is recorded for the change that owns the strings. -->
    <section class="fab-ic-section fab-ic-actions">
      <StatusToggle
        on={view.state.enabled === false}
        label={view.state.enabled
          ? text('FABRICATE.Canvas.Interactable.Config.Disable', 'Disable')
          : text('FABRICATE.Canvas.Interactable.Config.Enable', 'Enable')}
        onclick={() => run(() => services?.setEnabled?.(!view.state.enabled))}
      />
      <StatusToggle
        on={view.state.locked === true}
        label={view.state.locked
          ? text('FABRICATE.Canvas.Interactable.Config.Unlock', 'Unlock')
          : text('FABRICATE.Canvas.Interactable.Config.Lock', 'Lock')}
        onclick={() => run(() => services?.setLocked?.(!view.state.locked))}
      />
      <ManagerButton role="danger" onclick={() => run(() => services?.deleteInteractable?.())}>
        {text('FABRICATE.Canvas.Interactable.Config.Delete', 'Delete interactable')}
      </ManagerButton>
    </section>
  {/if}
</div>

<style>
  /* WHAT SURVIVES IN THIS BLOCK, AND WHY (issue 1520).

     Every CONTROL family this panel used to draw itself - the button, the field, the toggle,
     the type chip and the identity banner - is a shared primitive's now, so its rules left
     with the markup that carried them. What is left is this window's own LAYOUT: the scroll
     container, the section rhythm, the facts grid and the two status readings. That split is
     the design system's own rule - a primitive owns its appearance, a caller owns where the
     primitive sits - so the residue here is not a leftover to sweep later, it is the part a
     primitive cannot own.

     Four rules below reach a CHILD COMPONENT's element and are therefore `:global(...)`.
     Svelte stamps its `svelte-<hash>` onto the elements THIS component writes and forwards a
     `class` prop verbatim, so a scoped rule naming a primitive's class is emitted with the
     hash attached and matches nothing - silently, with `css.code` byte-identical and no
     compiler warning. Each is anchored on a class this file DOES write, so the hash lands on
     the ancestor compound where it belongs. */
  .fabricate-interactable-config {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
    height: 100%;
    overflow-y: auto;
  }

  /* THE SELECT TRIGGER STATES ITS OWN WIDTH, and `Select.svelte` records why it has to be
     stated at all: the shared select declares no `width` and no `min-width`, because "the
     trigger's box is the one thing this API does not address". A `<button>` hugs its content,
     so eight controls that were full-width `<select>`s in a column would have opened as eight
     differently-sized chips down the left edge. `.fabricate-select-field` is the class the
     labelled form's own `<Field>` emits, so this reaches the primitive's element without
     minting a class for it. */
  .fabricate-interactable-config :global(.fabricate-select-field .fabricate-select-trigger) {
    width: 100%;
  }

  /* A FIELD'S VALUE IS NOT ITS CAPTION. `.fabricate-field.manager-field` sets `font-weight:
     700` on the BOX because the caption it wraps is a label, and Foundry's control reset gives
     an `<input>` `font: inherit` - so a GM's typed name would render at heading weight. The
     shipped repair for the same defect is scoped to one manager route
     (`[data-manager-view='world-tool-entry']` in `styles/fabricate.css`); this is that rule
     for this window, with its `:not(.fab-stepper-input)` exclusion intact because the stepper
     supplies its own chrome. */
  .fabricate-interactable-config :global(.manager-field input:not(.fab-stepper-input)) {
    font-weight: 400;
  }

  /* THE SWITCH'S READING IS A SENTENCE HERE. `.manager-status-toggle` caps itself at 78px, so
     with a 34px track the label has ~36px and every reading in this panel would ellipsise -
     "Linked to gathering task" to "Li...". The shipped precedent for a switch whose reading is
     the control's whole content is the Checks activation card, which releases the same cap in
     `styles/fabricate.css` for the same stated reason. Scoped to this root rather than added
     to the sheet, because the sheet is not this phase's to edit. */
  .fabricate-interactable-config :global(.manager-status-toggle) {
    max-width: none;
  }

  /* The action rows are `flex-wrap: wrap`, and the shared button declares `min-width: 0`, so
     without this a converted button squashes below its own label instead of wrapping to the
     next line. It is POSITION rather than appearance, which is the half a caller keeps. */
  .fab-ic-actions :global(.fabricate-button),
  .fab-ic-identity-head :global(.fabricate-button) {
    flex: 0 0 auto;
    white-space: nowrap;
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

  .fab-ic-section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .fab-ic-section-title {
    margin: 0;
    font-size: 0.95rem;
  }

  /* The one field holding a numeric stepper rather than a select or a toggle. A select wants
     the card's full width; a three-digit node count does not, and without a cap the filled
     stepper resolved `width: 100%` against the whole config card and stood its - and + at
     opposite ends of it.

     A cap, not a dropped `fill`: this is a `flex-direction: column` parent, so an unfilled
     `.fab-stepper` (a flex item with `width: auto`) is stretched to exactly the same box by
     `align-items: stretch` - measured at 600/600px - while losing the 36px height that
     matches the controls above it and leaving its 48px input marooned mid-border. 160px is
     the width the `fill` variant was measured against and leaves a 106px typeable field.

     `:global(...)`, and the `.manager-field` half of the compound is load-bearing rather than
     decorative: this class now travels to a `<Field>`, so the scoped form
     `.fab-ic-node-count-field.svelte-<hash>` would match nothing, and a bare
     `:global(.fab-ic-node-count-field)` would reach the element at (0,1,0) where the scoped
     form was (0,2,0) - smuggling a cascade change in as a repair. */
  :global(.manager-field.fab-ic-node-count-field) {
    max-width: 160px;
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

  /* THE MUTED READINGS ARE INKED, NOT FADED. Four rules here dimmed their text with `opacity`,
     which fades the WHOLE element - its border and its background with it - and produces a
     different colour on every surface it is drawn over. `--fab-text-muted` is the published
     recessive ink and is what the shared primitives this panel now renders already use. */
  .fab-ic-fact dt {
    color: var(--fab-text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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

  /* 6px, not 3: 3 is off the radius ladder (0, 6, 7, 9, 11, 999, 50%) and this pill is under
     the 24px band the 6px rung is published for. */
  .fab-ic-fact-id {
    font-size: 0.7rem;
    padding: 0.05rem 0.3rem;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    color: var(--fab-text-muted);
  }

  .fab-ic-fact-muted {
    color: var(--fab-text-muted);
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

  .fab-ic-empty {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.9rem;
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

  /* Identity / source section. The unconfigured state's prominence is the `<Notice>`'s now -
     its `warning` tone paints the edge, the fill, the glyph and the title - so the accent box
     this section drew around the notice AND the picker beneath it is gone rather than
     retargeted: two tinted boxes for one state, in two colour families, is what keeping it
     would have rendered. */
  .fab-ic-identity {
    gap: 0.55rem;
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
</style>
