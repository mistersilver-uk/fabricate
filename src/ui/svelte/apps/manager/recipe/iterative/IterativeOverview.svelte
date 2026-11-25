<!-- Svelte 5 runes mode -->
<!--
  The recipe Overview's iterative sections, after the step-mode card: the recipe's Counter
  Instances, which carry on across every step.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `recipe` | the staged draft | `null` | |
  | `iterative` | the iterative route model | — | the selected system's library and routes |
  | `isMultiStep` | boolean | `false` | whether the recipe has explicit steps |
  | `disabled` | boolean | `false` | every control off while saving |

  Callbacks:
  - `onUpdateRecipe(patch)` — a staged draft patch.
-->
<script>
  import { localizeOr as text } from '../../../../util/localizeOr.js';
  import IterativeCountersCard from './IterativeCountersCard.svelte';

  let {
    recipe = null,
    iterative,
    isMultiStep = false,
    disabled = false,
    onUpdateRecipe = () => {},
  } = $props();
</script>

<IterativeCountersCard {recipe} {iterative} {isMultiStep} {disabled} {text} {onUpdateRecipe} />
