<!-- Svelte 5 runes mode -->
<!--
  IngredientOptionSelector is the player-facing per-slot picker (issue 552): for a
  recipe ingredient group that lists MULTIPLE acceptable components ("Red Herb OR
  Blue Herb"), it lets the player choose WHICH alternative the craft consumes, and
  — for a tag option matching several held stacks — WHICH held item. It is the
  per-slot analogue of IngredientSetSelector's route picker; a recipe can have both.

  It is data-driven from `craftability.ingredientChoices` (built by
  RecipeManager._buildIngredientChoices), so the selection state is NOT computed in
  the UI: choosing an option calls `onChoose(groupId, choice)`, which drives a
  re-evaluation through the same resolver the engine consumes (keeping tiles ==
  consumed). Each choice is one `role="radiogroup"`; each option/stack is a
  `<button role="radio">`. An insufficient option stays selectable but is flagged
  (red have/need chip) — the Craft button then blocks with the missing-materials
  message on that choice. Renders nothing when no group offers a choice.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingEssenceThumb from '../CraftingEssenceThumb.svelte';
  import CraftingThumb from '../CraftingThumb.svelte';
  import QuantityTag from '../QuantityTag.svelte';

  let { choices = [], onChoose = null } = $props();

  const groups = $derived(Array.isArray(choices) ? choices : []);

  function commitOption(choice, optionIndex) {
    onChoose?.(choice.groupId, { optionIndex });
  }
  function commitStack(choice, heldItemId) {
    onChoose?.(choice.groupId, { optionIndex: choice.optionIndex, heldItemId });
  }

  // Roving-tabindex keyboard model: Arrow keys move focus + selection within the
  // group, Home/End jump to the ends, Space/Enter commit the focused radio. Reads
  // the group's radios off the DOM so it works for both option and stack groups.
  function onRadioKeydown(event, commit, values, currentValue) {
    const key = event.key;
    const radios = [...event.currentTarget.parentElement.querySelectorAll('[role="radio"]')];
    const currentIndex = values.indexOf(currentValue);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % values.length;
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + values.length) % values.length;
    } else if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = values.length - 1;
    } else if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      commit(values[currentIndex < 0 ? 0 : currentIndex]);
      return;
    } else {
      return;
    }
    event.preventDefault();
    commit(values[nextIndex]);
    radios[nextIndex]?.focus();
  }
</script>

{#if groups.length > 0}
  <section class="crafting-alt" data-recipe-section="alternatives">
    <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.AlternativesTitle')}</p>
    <p class="crafting-alt-hint">{localize('FABRICATE.App.Crafting.Io.AlternativesHint')}</p>

    {#each groups as choice (choice.kind + ':' + choice.groupId + ':' + (choice.optionIndex ?? ''))}
      {#if choice.kind === 'option'}
        {@const values = choice.options.map((option) => option.optionIndex)}
        <div
          class="crafting-alt-group"
          role="radiogroup"
          aria-label={choice.groupName}
          data-alt-group={choice.groupId}
          data-alt-kind="option"
        >
          {#each choice.options as option (option.optionIndex)}
            {@const selected = option.optionIndex === choice.selectedOptionIndex}
            <button
              type="button"
              class="crafting-alt-option"
              class:is-selected={selected}
              class:is-insufficient={!option.satisfied}
              role="radio"
              aria-checked={selected}
              aria-label={localize('FABRICATE.App.Crafting.Io.ChooseOption', { name: option.name })}
              tabindex={selected ? 0 : -1}
              data-option-index={option.optionIndex}
              data-option-satisfied={option.satisfied ? 'true' : 'false'}
              onclick={() => commitOption(choice, option.optionIndex)}
              onkeydown={(event) =>
                onRadioKeydown(event, (value) => commitOption(choice, value), values, choice.selectedOptionIndex)}
            >
              {#if option.isEssence}
                <CraftingEssenceThumb icon={option.icon} size={40} />
              {:else}
                <CraftingThumb src={option.img} alt="" size={40} />
              {/if}
              <span class="crafting-alt-name">{option.name}</span>
              {#if option.isCurrency}
                <QuantityTag
                  label=""
                  value={option.costLabel}
                  tone={option.affordable ? 'success' : 'danger'}
                  icon="fa-coins"
                />
              {:else}
                <QuantityTag
                  label=""
                  value={`${option.have}/${option.need}`}
                  tone={option.satisfied ? 'success' : 'danger'}
                />
              {/if}
              {#if selected}
                <i class="crafting-alt-tick fa-solid fa-circle-check" aria-hidden="true"></i>
              {/if}
            </button>
          {/each}
        </div>
      {:else if choice.kind === 'stack'}
        {@const values = choice.stacks.map((stack) => stack.itemId)}
        <div
          class="crafting-alt-group"
          role="radiogroup"
          aria-label={localize('FABRICATE.App.Crafting.Io.ChooseStackTitle', { name: choice.groupName })}
          data-alt-group={choice.groupId}
          data-alt-kind="stack"
        >
          {#each choice.stacks as stack (stack.itemId)}
            {@const selected = stack.itemId === choice.selectedHeldItemId}
            <button
              type="button"
              class="crafting-alt-option"
              class:is-selected={selected}
              role="radio"
              aria-checked={selected}
              aria-label={localize('FABRICATE.App.Crafting.Io.ChooseOption', { name: stack.name })}
              tabindex={selected ? 0 : -1}
              data-held-id={stack.itemId}
              onclick={() => commitStack(choice, stack.itemId)}
              onkeydown={(event) =>
                onRadioKeydown(event, (value) => commitStack(choice, value), values, choice.selectedHeldItemId)}
            >
              <CraftingThumb src={stack.img} alt="" size={40} />
              <span class="crafting-alt-name">{stack.name}</span>
              <QuantityTag label="" value={`×${stack.have}`} tone="neutral" />
              {#if selected}
                <i class="crafting-alt-tick fa-solid fa-circle-check" aria-hidden="true"></i>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {/each}
  </section>
{/if}

<style>
  .crafting-alt {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-alt-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .crafting-alt-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  /* Foundry's global button chrome centres content and pins a fixed height; reset it
     (font/line-height/height:auto/min-height/justify/white-space) or the option row
     collapses and its thumb clips (EnvironmentCard / .crafting-option-card pattern).
     No scoped focus ring: the .fabricate-app focus-visible block in fabricate.css
     paints the accent ring. */
  .crafting-alt-option {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    height: auto;
    min-height: 44px;
    padding: 4px 10px 4px 4px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    font: inherit;
    line-height: 1.3;
    text-align: left;
    white-space: normal;
    cursor: pointer;
  }

  .crafting-alt-option:hover {
    background: var(--fab-surface-raised);
  }

  .crafting-alt-option.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  /* Insufficient options stay selectable-but-flagged (issue 552 decision 1): a red
     border reads "blocking" whether the row is selected or not, so a player who
     picks an unaffordable component still sees the choice is short (the tile pip +
     have/need chip also go red). The selected-and-insufficient variant keeps the
     danger border while adopting a danger-tinted fill so it still reads as chosen. */
  .crafting-alt-option.is-insufficient {
    border-color: var(--fab-danger-border);
  }

  .crafting-alt-option.is-insufficient.is-selected {
    border-color: var(--fab-danger);
    background: var(--fab-danger-soft);
  }

  .crafting-alt-option.is-insufficient .crafting-alt-name {
    color: var(--fab-text-muted);
  }

  .crafting-alt-name {
    min-width: 0;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }

  .crafting-alt-tick {
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--fab-accent);
  }

  /* Matches the sibling IO section headers (IoTable / IngredientSetSelector /
     CraftingCheckCard / OutcomeTierTable). Svelte scopes CSS per component and this
     class is not global, so the rule is redefined here to stay consistent with the
     "Ingredients / Essences / Tools / Output" headers above the Alternatives block. */
  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>
