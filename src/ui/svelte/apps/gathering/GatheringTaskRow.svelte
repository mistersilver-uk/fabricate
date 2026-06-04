<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskRow renders one attemptable gathering task in the center column —
  used for both a targeted environment's task list and a blind environment's
  "Discovered Tasks" list. Layout (left → right): a rounded task image (with a
  lock overlay + desaturation when the task is blocked, mirroring the locked
  environment card), the name + description and any blocking detail, a
  SuccessChanceBar, then an Attempt button.

  Blocking detail is derived from the listing's `blockedReasons`: condition gates
  surface their required time-of-day / weather, tool gates surface the missing
  tools, and any other reason falls back to its server-localized message.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SuccessChanceBar from './SuccessChanceBar.svelte';

  let {
    task = null,
    environmentId = '',
    onAttempt = null,
    busy = false
  } = $props();

  const id = $derived(String(task?.id ?? ''));
  const name = $derived(String(task?.name ?? task?.label ?? ''));
  const description = $derived(String(task?.description ?? ''));
  const img = $derived(String(task?.img ?? ''));
  const attemptable = $derived(task?.attemptable === true);
  const blocked = $derived(!attemptable);
  const blockedReasons = $derived(Array.isArray(task?.blockedReasons) ? task.blockedReasons : []);
  const successChance = $derived(task?.successChance ?? null);

  // Turn each blocked reason into one or more human-readable lines. Condition
  // and tool gates get specific copy from their `data`; everything else falls
  // back to the reason's pre-localized message.
  function blockedLines(reason) {
    const data = reason?.data ?? null;
    if (reason?.code === 'CONDITIONS_BLOCKED' && data) {
      const lines = [];
      const timeOfDay = Array.isArray(data.requiredTimeOfDay) ? data.requiredTimeOfDay : [];
      const weather = Array.isArray(data.requiredWeather) ? data.requiredWeather : [];
      if (timeOfDay.length > 0) {
        lines.push(localize('FABRICATE.App.Gathering.Detail.RequiresTimeOfDay', { values: timeOfDay.join(', ') }));
      }
      if (weather.length > 0) {
        lines.push(localize('FABRICATE.App.Gathering.Detail.RequiresWeather', { values: weather.join(', ') }));
      }
      if (lines.length > 0) return lines;
    }
    if (reason?.code === 'TOOL_BLOCKED' && data) {
      // Prefer human-readable tool names; never surface bare library ids
      // (missingToolIds/disabledToolIds are opaque). Fall back to the
      // server-localized message when only ids are available.
      const tools = (Array.isArray(data.missing) ? data.missing : [])
        .map(entry => (typeof entry === 'string' ? entry : entry?.name))
        .filter(Boolean);
      if (tools.length > 0) {
        return [localize('FABRICATE.App.Gathering.Detail.MissingTools', { tools: tools.join(', ') })];
      }
    }
    return [reason?.message || localize('FABRICATE.App.Gathering.Detail.Blocked')];
  }

  const blockedDetail = $derived(blockedReasons.flatMap(blockedLines));

  function handleAttempt() {
    if (!attemptable || busy) return;
    onAttempt?.({ environmentId, taskId: id });
  }
</script>

<div
  class="gathering-task-row"
  class:is-blocked={blocked}
  role="listitem"
  data-task-id={id}
  data-attemptable={attemptable ? 'true' : 'false'}
  data-blocked={blocked ? 'true' : 'false'}
>
  <span class="gathering-task-thumb-wrap">
    <img
      class="gathering-task-thumb"
      class:is-fallback={!img}
      src={img || 'icons/svg/item-bag.svg'}
      alt=""
    />
    {#if blocked}
      <span class="gathering-task-lock-overlay" aria-hidden="true">
        <i class="fas fa-lock"></i>
      </span>
    {/if}
  </span>

  <span class="gathering-task-copy">
    <span class="gathering-task-name" title={name}>{name}</span>
    {#if description !== ''}
      <span class="gathering-task-description">{description}</span>
    {/if}
    {#if blockedDetail.length > 0}
      <ul class="gathering-task-blocked" data-gathering-blocked>
        {#each blockedDetail as line, index (index)}
          <li><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>{line}</li>
        {/each}
      </ul>
    {/if}
  </span>

  {#if successChance != null}
    <span class="gathering-task-chance" data-gathering-success>
      <SuccessChanceBar value={successChance} />
    </span>
  {/if}

  <button
    type="button"
    class="gathering-task-attempt"
    data-gathering-attempt
    disabled={!attemptable || busy}
    onclick={handleAttempt}
  >
    {localize('FABRICATE.App.Gathering.Detail.Attempt')}
  </button>
</div>

<style>
  .gathering-task-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    width: 100%;
    min-height: 72px;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
  }

  .gathering-task-thumb-wrap {
    position: relative;
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
  }

  .gathering-task-thumb {
    display: block;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-thumb.is-fallback {
    object-fit: contain;
    padding: 8px;
    box-sizing: border-box;
  }

  .gathering-task-row.is-blocked .gathering-task-thumb {
    filter: saturate(0.65) brightness(0.85);
  }

  .gathering-task-lock-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    /* Theme-aware dark scrim + near-white icon via base overlay tokens. */
    background: var(--fab-overlay-dark-48);
    color: var(--fab-overlay-light-96);
  }

  .gathering-task-lock-overlay i {
    font-size: 18px;
  }

  .gathering-task-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gathering-task-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .gathering-task-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  .gathering-task-blocked {
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: var(--fab-warning);
  }

  .gathering-task-blocked li {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .gathering-task-blocked i {
    font-size: 10px;
  }

  .gathering-task-chance {
    flex: 0 0 auto;
  }

  .gathering-task-attempt {
    flex: 0 0 auto;
    appearance: none;
    -webkit-appearance: none;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--fab-accent);
    border-radius: 6px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .gathering-task-attempt:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .gathering-task-attempt:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .gathering-task-attempt:disabled {
    opacity: 0.5;
    cursor: default;
    background: var(--fab-surface-raised);
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
  }
</style>
