<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    ownedActors = [],
    onToggleSource
  } = $props();

  function handleToggle(event) {
    onToggleSource?.(event.target.value, event.target.checked);
  }
</script>

<div class="component-sources-selector">
  <label>{localize('FABRICATE.SourceActorPicker.Label')}</label>
  {#if ownedActors.length > 0}
    <div class="source-actor-list">
      {#each ownedActors as actor}
        <label class="source-actor-checkbox">
          <input
            type="checkbox"
            value={actor.id}
            checked={actor.selected}
            onchange={handleToggle}
          />
          <span class="actor-name">{actor.name}</span>
        </label>
      {/each}
    </div>
  {:else}
    <p class="no-actors-warning">
      <i class="fas fa-exclamation-triangle"></i>
      {localize('FABRICATE.SourceActorPicker.NoActors')}
    </p>
  {/if}
</div>
