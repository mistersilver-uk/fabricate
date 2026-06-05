<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskRequirements renders a task's "Requirements" section — the
  required-tool cards (with present/damaged/missing state) plus any remaining
  blocking reasons as text lines. It is shared by GatheringTaskRow (inline, in
  the expanded accordion body) and GatheringTaskDetail (the right-column task
  inspector), so both surfaces stay identical.

  Tool-blocked and the environment-level scene gate are excluded from the text
  lines: tools have their own panel, and the scene gate is shown once above the
  task list by GatheringDetail. When a task has neither required tools nor any
  remaining blocking detail, a muted "No special requirements" line is shown so
  the always-visible right-column section never renders empty.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { task = null } = $props();

  const blocked = $derived(task?.attemptable !== true);
  const blockedReasons = $derived(Array.isArray(task?.blockedReasons) ? task.blockedReasons : []);
  const tools = $derived(Array.isArray(task?.tools) ? task.tools : []);

  // Remaining blocking reasons (not tools, which have their own panel, nor the
  // environment-level scene gate) rendered as text lines.
  function blockedLines(reason) {
    const data = reason?.data ?? null;
    if (reason?.code === 'CONDITIONS_BLOCKED' && data) {
      const lines = [];
      const timeOfDay = Array.isArray(data.requiredTimeOfDay) ? data.requiredTimeOfDay : [];
      const weather = Array.isArray(data.requiredWeather) ? data.requiredWeather : [];
      if (timeOfDay.length > 0) lines.push(localize('FABRICATE.App.Gathering.Detail.RequiresTimeOfDay', { values: timeOfDay.join(', ') }));
      if (weather.length > 0) lines.push(localize('FABRICATE.App.Gathering.Detail.RequiresWeather', { values: weather.join(', ') }));
      if (lines.length > 0) return lines;
    }
    return [reason?.message || localize('FABRICATE.App.Gathering.Detail.Blocked')];
  }

  const detailLines = $derived(
    blockedReasons
      .filter(reason => reason?.code !== 'TOOL_BLOCKED' && reason?.code !== 'SCENE_TOKEN_BLOCKED')
      .flatMap(blockedLines)
  );

  const isEmpty = $derived(tools.length === 0 && detailLines.length === 0);

  const requirementsHeading = $derived(
    localize(blocked
      ? 'FABRICATE.App.Gathering.Detail.RequirementsHeading'
      : 'FABRICATE.App.Gathering.Detail.RequirementsHeadingReady')
  );

  function toolStateLabel(state) {
    return localize(`FABRICATE.App.Gathering.Detail.ToolState.${state}`);
  }
  function toolHint(state) {
    return localize(`FABRICATE.App.Gathering.Detail.ToolHint.${state}`);
  }
</script>

<div class="gathering-task-details" data-gathering-details>
  <p class="gathering-task-details-heading">{requirementsHeading}</p>

  {#if isEmpty}
    <p class="gathering-task-details-empty" data-gathering-no-requirements>
      {localize('FABRICATE.App.Gathering.Detail.NoRequirements')}
    </p>
  {:else}
    <div class="gathering-task-details-grid">
      {#if tools.length > 0}
        <section class="gathering-task-tools" data-gathering-tools>
          <h4 class="gathering-task-subheading">
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            {localize('FABRICATE.App.Gathering.Detail.RequiredToolsHeading')}
          </h4>
          <ul class="gathering-task-tool-list">
            {#each tools as tool, index (tool.id ?? index)}
              <li class={`gathering-task-tool is-${tool.state}`} data-gathering-tool data-tool-state={tool.state}>
                <img class="gathering-task-tool-thumb" src={tool.img || 'icons/svg/item-bag.svg'} alt="" />
                <span class="gathering-task-tool-copy">
                  <span class="gathering-task-tool-name" title={tool.name}>{tool.name}</span>
                  <span class="gathering-task-tool-state">{toolStateLabel(tool.state)}</span>
                  <span class="gathering-task-tool-hint">{toolHint(tool.state)}</span>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    {#if detailLines.length > 0}
      <ul class="gathering-task-blocked" data-gathering-blocked>
        {#each detailLines as line, index (index)}
          <li><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>{line}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  /* Requirements section — shared by the task row accordion body and the
     right-column task inspector. */
  .gathering-task-details {
    padding: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    background: var(--fab-surface);
  }

  .gathering-task-details-heading {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .gathering-task-details-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-task-details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--fab-space-3);
  }

  .gathering-task-subheading {
    margin: 0 0 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-task-tool-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .gathering-task-tool {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .gathering-task-tool-thumb {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-tool-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .gathering-task-tool-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 13px;
  }

  .gathering-task-tool-state {
    font-size: 11px;
    font-weight: 600;
  }

  .gathering-task-tool.is-present .gathering-task-tool-state {
    color: var(--fab-success-text);
  }

  .gathering-task-tool.is-damaged .gathering-task-tool-state {
    color: var(--fab-warning-text);
  }

  .gathering-task-tool.is-missing .gathering-task-tool-state {
    color: var(--fab-danger-text);
  }

  .gathering-task-tool-hint {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .gathering-task-blocked {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: var(--fab-warning-text);
  }

  .gathering-task-blocked li {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .gathering-task-blocked i {
    font-size: 10px;
  }
</style>
