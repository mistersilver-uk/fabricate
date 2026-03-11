<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    activeRuns = [],
    runHistory = [],
    hasCraftingActor = false,
    onCraft,
    onShowRunDetails,
    onRestartRun,
    onCancelRun,
    onCancelSalvageRun
  } = $props();
</script>

{#if hasCraftingActor}
<section class="run-summary-section">
  <div class="run-columns">
    <!-- In Progress column -->
    <div class="run-column">
      <h4>{localize('FABRICATE.RunSummary.InProgress')}</h4>
      {#if activeRuns.length > 0}
        <ul class="run-list">
          {#each activeRuns as run (`active-${run.id}`)}
            <li class="run-row">
              <strong>{run.recipeName}</strong>
              <span class="badge">{run.statusLabel}</span>
              {#if run.stepLabel}
                <span class="hint">{run.stepLabel}</span>
              {/if}
                <span class="run-row-actions">
                {#if run.canContinue}
                  <button
                    type="button"
                    class="details-btn"
                    onclick={() => onCraft?.(run.recipeId, { runId: run.id })}
                    title={localize('FABRICATE.RunSummary.ContinueRun')}
                  >
                    <i class="fas fa-play"></i>
                  </button>
                {/if}
                <button
                  type="button"
                  class="details-btn"
                  onclick={() => onShowRunDetails?.(run.id, 'active')}
                  title={localize('FABRICATE.RunSummary.RunDetails')}
                >
                  <i class="fas fa-list"></i>
                </button>
                {#if run.runType !== 'salvage'}
                  <button
                    type="button"
                    class="details-btn"
                    onclick={() => onRestartRun?.(run.recipeId, run.id)}
                    title={localize('FABRICATE.RunSummary.RestartRun')}
                  >
                    <i class="fas fa-rotate-left"></i>
                  </button>
                {/if}
                {#if run.canCancel}
                  <button
                    type="button"
                    class="details-btn"
                    onclick={() => run.runType === 'salvage'
                      ? onCancelSalvageRun?.(run.id)
                      : onCancelRun?.(run.id)}
                    title={localize('FABRICATE.RunSummary.CancelRun')}
                  >
                    <i class="fas fa-stop"></i>
                  </button>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">{localize('FABRICATE.RunSummary.NoActiveRuns')}</p>
      {/if}
    </div>

    <!-- Recent History column -->
    <div class="run-column">
      <h4>{localize('FABRICATE.RunSummary.RecentHistory')}</h4>
      {#if runHistory.length > 0}
        <ul class="run-list">
          {#each runHistory as run (`history-${run.id}`)}
            <li class="run-row">
              <strong>{run.recipeName}</strong>
              <span class="badge">{run.statusLabel}</span>
              <span class="run-row-actions">
                <button
                  type="button"
                  class="details-btn"
                  onclick={() => onShowRunDetails?.(run.id, 'history')}
                  title={localize('FABRICATE.RunSummary.RunDetails')}
                >
                  <i class="fas fa-list"></i>
                </button>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">{localize('FABRICATE.RunSummary.NoRecentHistory')}</p>
      {/if}
    </div>
  </div>
</section>
{/if}
