<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    availableActors = [],
    onSelectActor
  } = $props();

  function handleChange(event) {
    onSelectActor?.(event.target.value);
  }
</script>

<div class="crafting-actor-selector">
  <label for="crafting-actor">{localize('FABRICATE.ActorSelector.CraftWith')}</label>
  <select id="crafting-actor" name="craftingActor" onchange={handleChange}>
    {#each availableActors as actor}
      <option value={actor.id} selected={actor.selected}>
        {actor.name}{#if actor.isAssignedCharacter} {localize('FABRICATE.ActorSelector.AssignedMarker')}{/if}
      </option>
    {/each}
  </select>
  <p class="hint">{localize('FABRICATE.ActorSelector.ResultHint')}</p>
</div>
