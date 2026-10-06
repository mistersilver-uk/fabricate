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
  - Each group is one shared `ChoiceOptionList` radiogroup. The picker reads held stock only, so a
    short stack is dimmed, offered and described, none is disabled, and contention surfaces in the
    slot's verdict.
-->
<script>
  import ChoiceOptionList from '../../../components/ChoiceOptionList.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { localize } from '../../../util/foundryBridge.js';

  let { choices = [], need = 0, onChoose = null } = $props();

  const groups = $derived(
    Array.isArray(choices) ? choices.filter((choice) => choice?.kind === 'stack') : []
  );

  function stackOptions(choice) {
    return choice.stacks.map((stack) => ({
      id: stack.itemId,
      label: stack.name,
      ...resolveCraftingArt(stack.img),
    }));
  }

  function heldIn(choice) {
    return (itemId) => choice.stacks.find((stack) => stack.itemId === itemId)?.have ?? 0;
  }
</script>

{#each groups as choice (choice.groupId + ':' + choice.optionIndex)}
  <ChoiceOptionList
    slotId={choice.groupId}
    options={stackOptions(choice)}
    needed={Number(need) || 0}
    selectedId={choice.selectedHeldItemId}
    held={heldIn(choice)}
    label={localize('FABRICATE.App.Crafting.Io.ChooseStackTitle', { name: choice.groupName })}
    candidateReading={({ held, needed }) =>
      localize('FABRICATE.App.Crafting.Io.StackReading', { have: held, need: needed })}
    onChoose={(_slotId, heldItemId) =>
      onChoose?.(choice.groupId, { optionIndex: choice.optionIndex, heldItemId })}
    data-recipe-section="stacks"
    data-alt-group={choice.groupId}
    data-alt-kind="stack"
  />
{/each}
