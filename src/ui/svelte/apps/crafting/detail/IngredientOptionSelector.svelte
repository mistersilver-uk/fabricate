<!-- Svelte 5 runes mode -->
<!--
  The held-stack picker in an open requirement's panel: when the group's chosen option is a tag
  matching several held stacks, it lets the player choose which held item the craft consumes. The
  group's alternatives themselves are the requirement chooser's tiles, drawn above it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `choices` | craftability `ingredientChoices` | `[]` | Only `stack` entries render; renders nothing without one. |
  | `need` | number | `0` | The open slot's requirement; a stack holding less is short. |

  Callbacks:
  - `onChoose(groupId, { optionIndex, heldItemId })` — a stack was chosen; the store re-evaluates
    through the resolver the engine consumes, so the selection is never computed here.

  Invariants:
  - Each group is one `role="radiogroup"` of `<button role="radio">`s with a roving tabindex. A
    short stack stays selectable and is flagged in danger ink and in its accessible name.
-->
<script>
  import Medallion from '../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import { stackCountText } from '../../../util/craftingQuantityReading.js';
  import Chip from '../../../components/Chip.svelte';
  import Kicker from '../../../components/Kicker.svelte';

  let { choices = [], need = 0, onChoose = null } = $props();

  const groups = $derived(
    Array.isArray(choices) ? choices.filter((choice) => choice?.kind === 'stack') : []
  );

  function stackLabel(name, short, have) {
    return short
      ? localize('FABRICATE.App.Crafting.Io.ChooseShortOption', { name, have, need })
      : localize('FABRICATE.App.Crafting.Io.ChooseOption', { name });
  }

  function commitStack(choice, heldItemId) {
    onChoose?.(choice.groupId, { optionIndex: choice.optionIndex, heldItemId });
  }

  // The index a key moves focus and selection to, or -1 for a key this model ignores.
  function rovingTargetIndex(key, currentIndex, length) {
    if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length;
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    return -1;
  }

  function onRadioKeydown(event, choice) {
    const values = choice.stacks.map((stack) => stack.itemId);
    const radios = [...event.currentTarget.parentElement.querySelectorAll('[role="radio"]')];
    const currentIndex = values.indexOf(choice.selectedHeldItemId);
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      commitStack(choice, values[currentIndex < 0 ? 0 : currentIndex]);
      return;
    }
    const nextIndex = rovingTargetIndex(event.key, currentIndex, values.length);
    if (nextIndex < 0) return;
    event.preventDefault();
    commitStack(choice, values[nextIndex]);
    radios[nextIndex]?.focus();
  }
</script>

{#each groups as choice (choice.groupId + ':' + choice.optionIndex)}
  {@const title = localize('FABRICATE.App.Crafting.Io.ChooseStackTitle', {
    name: choice.groupName,
  })}
  <section class="crafting-alt" data-recipe-section="stacks">
    <Kicker as="p">{title}</Kicker>
    <div
      class="crafting-alt-group"
      role="radiogroup"
      aria-label={title}
      data-alt-group={choice.groupId}
      data-alt-kind="stack"
    >
      {#each choice.stacks as stack (stack.itemId)}
        {@const selected = stack.itemId === choice.selectedHeldItemId}
        {@const short = Number(stack.have) < Number(need)}
        <button
          type="button"
          class="crafting-alt-option"
          class:is-selected={selected}
          class:is-short={short}
          role="radio"
          aria-checked={selected}
          aria-label={stackLabel(stack.name, short, stack.have)}
          tabindex={selected ? 0 : -1}
          data-keyboard-focus="true"
          data-held-id={stack.itemId}
          data-option-satisfied={short ? 'false' : 'true'}
          onclick={() => commitStack(choice, stack.itemId)}
          onkeydown={(event) => onRadioKeydown(event, choice)}
        >
          <Medallion {...resolveCraftingArt(stack.img)} alt="" size={40} />
          <span class="crafting-alt-name">{stack.name}</span>
          <Chip density="list" emphasis="solid" tone={statusChipTone(short ? 'danger' : 'neutral')}
            >{stackCountText(stack.have)}</Chip
          >
          {#if selected}
            <i class="crafting-alt-tick fa-solid fa-circle-check" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}
    </div>
  </section>
{/each}

<style>
  .crafting-alt {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-alt-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  /* Foundry's global button chrome centres content and pins a fixed height, so the box is reset;
     the module's focus-visible block paints the ring. */
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

  /* A short stack reads "blocking" whether or not it is selected; selected, it keeps a fill. */
  .crafting-alt-option.is-short {
    border-color: var(--fab-danger-border);
  }

  .crafting-alt-option.is-short.is-selected {
    border-color: var(--fab-danger);
    background: var(--fab-danger-soft);
  }

  .crafting-alt-option.is-short .crafting-alt-name {
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
</style>
