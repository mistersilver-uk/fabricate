<!-- Svelte 5 runes mode -->
<!--
  InteractableBrowserRoot — the GM "component browser" body (Phase 7).

  Lists, per the selected crafting system, the draggable Tools (the per-system
  tool library) and Gathering Tasks (the system's gathering library tasks).
  Each row is a placement SOURCE with two equivalent affordances:

    1. Drag source (use:dragSource) — emits a `dropCanvasData`-compatible payload
       on `text/plain` that round-trips through `classifyInteractableDrop` to the
       right interactableType + ids (see interactableDragPayload.js).
    2. Click-to-place button — the a11y fallback for keyboard/no-pointer users;
       calls services.placeOnScene(...) which routes through the SAME spawn path
       at the current scene's view center (tools spawn directly; gathering tasks
       still run the env-resolution precedence).

  All data access (systems, per-system tools, per-system gathering tasks) is
  read through the injected `services` bag, which reuses the live Fabricate API
  rather than duplicating library reads.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { dragSource } from '../actions/dragSource.js';
  import { buildInteractableDragPayload } from '../../../canvas/interactableDragPayload.js';
  import { DEFAULT_GATHERING_TASK_IMG } from '../../gatheringTaskDefaults.js';

  let { services = null } = $props();

  function text(key, fallback = key) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const systems = $derived(
    (services?.listSystems?.() ?? []).map((system) => ({
      id: String(system?.id ?? ''),
      name: String(system?.name ?? system?.id ?? '')
    }))
  );

  // Selected system: default to the first available; kept reactive on change.
  let selectedSystemId = $state('');
  $effect(() => {
    if (!selectedSystemId && systems.length > 0) {
      selectedSystemId = systems[0].id;
    }
  });

  let search = $state('');

  function matchesSearch(label) {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return String(label ?? '').toLowerCase().includes(needle);
  }

  const DEFAULT_TOOL_IMAGE = 'icons/svg/item-bag.svg';

  // Mirror ToolsBrowserView.toolPrimaryLabel / toolImage: a Tool has no required
  // name, so resolve its DISPLAY NAME from `tool.label` else the managed
  // component's name, and its IMAGE from the component's img (default icon only
  // when there is no image). The managed component is looked up through the
  // services bag (same `system.components` source ToolsBrowserView reads).
  function toolDisplayName(tool, component) {
    const label = String(tool?.label || '').trim();
    if (label) return label;
    const componentName = component?.name;
    if (componentName) return String(componentName);
    return text('FABRICATE.Canvas.Browser.UnnamedTool', 'Unnamed tool');
  }

  function toolImage(component) {
    return component?.img || DEFAULT_TOOL_IMAGE;
  }

  const tools = $derived(
    (services?.listToolsForSystem?.(selectedSystemId) ?? [])
      .map((tool) => {
        const component = tool?.componentId
          ? services?.getComponentForSystem?.(selectedSystemId, tool.componentId)
          : null;
        return {
          id: String(tool?.id ?? ''),
          label: toolDisplayName(tool, component),
          img: toolImage(component)
        };
      })
      .filter((tool) => tool.id && matchesSearch(tool.label))
  );

  // A task with no custom image persists the DEFAULT_GATHERING_TASK_IMG
  // placeholder (stamped by `_normalizeGatheringTask`). Treat that placeholder OR
  // an empty value as "no image" → show the leaf; render the task's own <img>
  // only for a REAL custom image.
  function taskCustomImage(img) {
    const trimmed = String(img ?? '').trim();
    if (!trimmed || trimmed === DEFAULT_GATHERING_TASK_IMG) return '';
    return trimmed;
  }

  const tasks = $derived(
    (services?.listTasksForSystem?.(selectedSystemId) ?? [])
      .map((task) => ({
        id: String(task?.id ?? ''),
        label: String(task?.name || '').trim() || text('FABRICATE.Canvas.Browser.UnnamedTask', 'Unnamed task'),
        img: taskCustomImage(task?.img)
      }))
      .filter((task) => task.id && matchesSearch(task.label))
  );

  function dragPayload(interactableType, referenceId) {
    return buildInteractableDragPayload({ interactableType, systemId: selectedSystemId, referenceId });
  }

  function place(interactableType, referenceId, visualMode = 'marker') {
    services?.placeOnScene?.({ interactableType, systemId: selectedSystemId, referenceId, visualMode });
  }
</script>

<div class="fabricate-interactable-browser">
  <header class="fab-ib-header">
    <h2 class="fab-ib-title">{text('FABRICATE.Canvas.Browser.Title', 'Interactable browser')}</h2>
    <p class="fab-ib-hint">{text('FABRICATE.Canvas.Browser.Hint', 'Drag an entry onto the canvas, or use Place on current scene.')}</p>
    <p class="fab-ib-hint fab-ib-hint-modifier">{text('FABRICATE.Canvas.Interactable.DropModifierHint', 'Hold Alt while dropping to always choose the environment manually.')}</p>
    <p class="fab-ib-hint fab-ib-hint-region">{text('FABRICATE.Canvas.Browser.RegionOnlyHint', 'Use the square button to place a region only, with no visible marker.')}</p>
  </header>

  <div class="fab-ib-controls">
    <label class="fab-ib-field">
      <span class="fab-ib-field-label">{text('FABRICATE.Canvas.Browser.SystemLabel', 'Crafting system')}</span>
      <select bind:value={selectedSystemId} aria-label={text('FABRICATE.Canvas.Browser.SystemLabel', 'Crafting system')}>
        {#each systems as system (system.id)}
          <option value={system.id}>{system.name}</option>
        {/each}
      </select>
    </label>
    <label class="fab-ib-field">
      <span class="fab-ib-field-label">{text('FABRICATE.Canvas.Browser.SearchLabel', 'Search')}</span>
      <input
        type="search"
        bind:value={search}
        placeholder={text('FABRICATE.Canvas.Browser.SearchPlaceholder', 'Search entries…')}
        aria-label={text('FABRICATE.Canvas.Browser.SearchLabel', 'Search')}
      />
    </label>
  </div>

  {#if systems.length === 0}
    <p class="fab-ib-empty">{text('FABRICATE.Canvas.Browser.NoSystems', 'No crafting systems available.')}</p>
  {:else}
    <section class="fab-ib-section" aria-label={text('FABRICATE.Canvas.Browser.ToolsHeading', 'Tools')}>
      <h3 class="fab-ib-section-title">{text('FABRICATE.Canvas.Browser.ToolsHeading', 'Tools')}</h3>
      {#if tools.length === 0}
        <p class="fab-ib-empty">{text('FABRICATE.Canvas.Browser.NoTools', 'No tools in this system.')}</p>
      {:else}
        <ul class="fab-ib-list">
          {#each tools as tool (tool.id)}
            <li
              class="fab-ib-row"
              use:dragSource={{ getPayload: () => dragPayload('tool', tool.id) }}
            >
              <img class="fab-ib-row-thumb" src={tool.img} alt="" />
              <span class="fab-ib-row-label">{tool.label}</span>
              <div class="fab-ib-row-actions">
                <button
                  type="button"
                  class="fab-ib-place"
                  onclick={() => place('tool', tool.id)}
                  aria-label={text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place on current scene')}
                >
                  {text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place on current scene')}
                </button>
                <button
                  type="button"
                  class="fab-ib-place-region"
                  onclick={() => place('tool', tool.id, 'none')}
                  title={text('FABRICATE.Canvas.Browser.PlaceRegionOnly', 'Place region only (no marker)')}
                  aria-label={text('FABRICATE.Canvas.Browser.PlaceRegionOnly', 'Place region only (no marker)')}
                >
                  <i class="fas fa-vector-square" aria-hidden="true"></i>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="fab-ib-section" aria-label={text('FABRICATE.Canvas.Browser.TasksHeading', 'Gathering tasks')}>
      <h3 class="fab-ib-section-title">{text('FABRICATE.Canvas.Browser.TasksHeading', 'Gathering tasks')}</h3>
      {#if tasks.length === 0}
        <p class="fab-ib-empty">{text('FABRICATE.Canvas.Browser.NoTasks', 'No gathering tasks in this system.')}</p>
      {:else}
        <ul class="fab-ib-list">
          {#each tasks as task (task.id)}
            <li
              class="fab-ib-row"
              use:dragSource={{ getPayload: () => dragPayload('gatheringTask', task.id) }}
            >
              {#if task.img}
                <img class="fab-ib-row-thumb" src={task.img} alt="" />
              {:else}
                <i class="fas fa-leaf fab-ib-row-icon" aria-hidden="true"></i>
              {/if}
              <span class="fab-ib-row-label">{task.label}</span>
              <div class="fab-ib-row-actions">
                <button
                  type="button"
                  class="fab-ib-place"
                  onclick={() => place('gatheringTask', task.id)}
                  aria-label={text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place on current scene')}
                >
                  {text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place on current scene')}
                </button>
                <button
                  type="button"
                  class="fab-ib-place-region"
                  onclick={() => place('gatheringTask', task.id, 'none')}
                  title={text('FABRICATE.Canvas.Browser.PlaceRegionOnly', 'Place region only (no marker)')}
                  aria-label={text('FABRICATE.Canvas.Browser.PlaceRegionOnly', 'Place region only (no marker)')}
                >
                  <i class="fas fa-vector-square" aria-hidden="true"></i>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .fabricate-interactable-browser {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    height: 100%;
    overflow-y: auto;
  }

  .fab-ib-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .fab-ib-title {
    margin: 0;
    font-size: 1.1rem;
  }

  .fab-ib-hint {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.8;
  }

  .fab-ib-hint-modifier {
    font-style: italic;
  }

  .fab-ib-controls {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .fab-ib-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1 1 12rem;
  }

  .fab-ib-field-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }

  .fab-ib-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .fab-ib-section-title {
    margin: 0;
    font-size: 0.95rem;
  }

  .fab-ib-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .fab-ib-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--color-border-light-tertiary);
    border-radius: 4px;
    cursor: grab;
  }

  /*
    `fab-dragging` is applied at runtime by the `dragSource` action, so Svelte's
    static analysis cannot see it and flags the rule as unused. A component-scoped
    `:global` keeps the selector specific (still `fab-ib-*`, no bleed) while
    silencing the warning. (Does not affect tests/styles-namespacing.test.js,
    which only scans styles/fabricate.css.)
  */
  :global(.fab-ib-row.fab-dragging) {
    opacity: 0.5;
  }

  .fab-ib-row-icon {
    flex: 0 0 auto;
    opacity: 0.75;
  }

  .fab-ib-row-thumb {
    flex: 0 0 auto;
    width: 1.5rem;
    height: 1.5rem;
    object-fit: cover;
    border: none;
    border-radius: 3px;
  }

  .fab-ib-row-label {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-ib-row-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .fab-ib-place {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .fab-ib-place-region {
    flex: 0 0 auto;
    width: 2rem;
    padding: 0;
  }

  .fab-ib-place:focus-visible,
  .fab-ib-place-region:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-ib-empty {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.7;
  }
</style>
