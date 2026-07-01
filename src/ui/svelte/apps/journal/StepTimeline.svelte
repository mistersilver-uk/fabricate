<!-- Svelte 5 runes mode -->
<!--
  StepTimeline renders a crafting/salvage run's steps as a horizontal node strip:
  a succeeded step shows a check, a failed step an x, a time-gated step a warning
  hourglass, the in-progress step a filled ring, and a not-yet-reached step a grey
  dot. The step name sits under each node. State is conveyed by icon +
  data-step-state, never colour alone.
-->
<script>
  let { steps = [], currentIndex = null } = $props();

  // Resolve each node's visual state. A step's own status wins; a time-gated
  // step gets the warning tone (parity with the waiting run pill) even when it is
  // the active step, and the active index is otherwise highlighted as "current".
  function nodeState(step, index) {
    const status = String(step?.status ?? 'pending');
    if (status === 'succeeded') return 'succeeded';
    if (status === 'failed') return 'failed';
    if (status === 'waitingTime') return 'waiting';
    if (index === currentIndex || status === 'inProgress') return 'current';
    return 'pending';
  }

  const NODE_ICON = {
    succeeded: 'fa-circle-check',
    failed: 'fa-circle-xmark',
    waiting: 'fa-hourglass-half',
    current: 'fa-circle-dot',
    pending: 'fa-circle'
  };
</script>

{#if steps.length > 0}
  <ol class="journal-step-timeline" data-journal-timeline>
    {#each steps as step, index (step.stepId ?? index)}
      {@const state = nodeState(step, index)}
      <li class={`journal-step-node is-${state}`} data-step-state={state} data-step-index={index}>
        <span class="journal-step-node-marker">
          <i class={`fas ${NODE_ICON[state]}`} aria-hidden="true"></i>
        </span>
        <span class="journal-step-node-name" title={step?.stepName ?? ''}>{step?.stepName ?? ''}</span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .journal-step-timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-3);
  }

  .journal-step-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 96px;
    text-align: center;
  }

  .journal-step-node-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .journal-step-node-marker i {
    font-size: 13px;
  }

  .journal-step-node.is-succeeded .journal-step-node-marker {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .journal-step-node.is-failed .journal-step-node-marker {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .journal-step-node.is-waiting .journal-step-node-marker {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .journal-step-node.is-current .journal-step-node-marker {
    color: var(--fab-accent);
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .journal-step-node-name {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .journal-step-node.is-current .journal-step-node-name,
  .journal-step-node.is-waiting .journal-step-node-name {
    color: var(--fab-text);
    font-weight: 600;
  }
</style>
