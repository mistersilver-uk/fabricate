<!-- Svelte 5 runes mode -->
<!-- GM-facing dialog for managing teaser discovery progress per actor/recipe -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    recipe,
    actors,
    progressMap,
    onSetProgress,
    onResetProgress,
    onGrantDiscovery,
    onClose
  } = $props();

  function handleProgressInput(actorId, event) {
    const value = Math.min(100, Math.max(0, Number(event.target.value) || 0));
    onSetProgress?.(actorId, recipe.id, value);
  }

  function getProgress(actorId) {
    return progressMap?.[actorId]?.[recipe.id]?.progress ?? 0;
  }

  function isDiscovered(actorId) {
    return progressMap?.[actorId]?.[recipe.id]?.discoveredAt != null;
  }

  function getFragments(actorId) {
    return progressMap?.[actorId]?.[recipe.id]?.fragments ?? [];
  }
</script>

<div class="teaser-progress-editor">
  <header class="editor-header">
    <h2>{localize('FABRICATE.Teaser.Progress')}: {recipe?.name}</h2>
    <button type="button" class="close-btn" onclick={onClose}>
      <i class="fas fa-times"></i>
    </button>
  </header>

  <div class="editor-body">
    {#if !actors?.length}
      <p class="no-actors">{localize('FABRICATE.Admin.Actors.None')}</p>
    {:else}
      <table class="progress-table">
        <thead>
          <tr>
            <th>{localize('FABRICATE.Admin.Actors.Name')}</th>
            <th>{localize('FABRICATE.Teaser.Progress')}</th>
            <th>{localize('FABRICATE.Teaser.Fragments')}</th>
            <th>{localize('FABRICATE.Admin.Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each actors as actor (actor.id)}
            <tr class:discovered={isDiscovered(actor.id)}>
              <td>{actor.name}</td>
              <td>
                {#if isDiscovered(actor.id)}
                  <span class="fully-discovered">{localize('FABRICATE.Teaser.FullyDiscovered')}</span>
                {:else}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={getProgress(actor.id)}
                    onchange={(e) => handleProgressInput(actor.id, e)}
                  />
                  <span class="progress-pct">%</span>
                {/if}
              </td>
              <td>
                {#if getFragments(actor.id).length > 0}
                  <span class="fragment-count">{getFragments(actor.id).length}</span>
                {:else}
                  <span class="no-fragments">—</span>
                {/if}
              </td>
              <td class="action-btns">
                <button
                  type="button"
                  class="action-btn reset-btn"
                  onclick={() => onResetProgress?.(actor.id, recipe.id)}
                  title={localize('FABRICATE.Teaser.ResetProgress')}
                >
                  <i class="fas fa-undo"></i>
                </button>
                <button
                  type="button"
                  class="action-btn discover-btn"
                  onclick={() => onGrantDiscovery?.(actor.id, recipe.id)}
                  title={localize('FABRICATE.Teaser.GrantDiscovery')}
                >
                  <i class="fas fa-eye"></i>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
