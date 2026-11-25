<!-- Svelte 5 runes mode -->
<!--
  A multi-step iterative recipe's step header count: the step's blocking issues, else its warnings,
  and nothing when it has neither. Only critical issues count as blocking.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `issues` | the recipe's iterative issues | `[]` | from the route model's `recipeIssues` |
  | `index` | integer | — | the step's zero-based position, matched against `stepIndex` |
  | `stepName` | string | `''` | the step's name, which the chip's accessible name leads with |
  | `text` | the shell's localizer | — | `(key, fallback)` |
-->
<script>
  import Chip from '../../../../components/Chip.svelte';
  import { fill } from '../../../../../../utils/fillPlaceholders.js';
  import { iterativeStepTally } from '../../iterative/iterativeRecipeIssues.js';

  let { issues = [], index, stepName = '', text = (_key, fallback) => fallback } = $props();

  const tally = $derived(iterativeStepTally(issues, index));

  /** Each tone's `[key, fallback]` copy, with a singular form for a count of one. */
  const COPY = {
    danger: {
      label: ['FABRICATE.Admin.Manager.Recipe.Iterative.StatusBlocking', '{count} blocking'],
      labelOne: ['FABRICATE.Admin.Manager.Recipe.Iterative.StatusBlocking', '{count} blocking'],
      name: [
        'FABRICATE.Admin.Manager.Recipe.Iterative.StepBlockingName',
        '{step}: {count} blocking issues',
      ],
      nameOne: [
        'FABRICATE.Admin.Manager.Recipe.Iterative.StepBlockingNameOne',
        '{step}: 1 blocking issue',
      ],
    },
    warning: {
      label: ['FABRICATE.Admin.Manager.Recipe.Iterative.StepWarnings', '{count} warnings'],
      labelOne: ['FABRICATE.Admin.Manager.Recipe.Iterative.StepWarningsOne', '1 warning'],
      name: [
        'FABRICATE.Admin.Manager.Recipe.Iterative.StepWarningsName',
        '{step}: {count} warnings',
      ],
      nameOne: [
        'FABRICATE.Admin.Manager.Recipe.Iterative.StepWarningsNameOne',
        '{step}: 1 warning',
      ],
    },
  };
  const say = ([key, fallback], count) => fill(text(key, fallback), { count, step: stepName });

  const chip = $derived.by(() => {
    const tone = tally.blocking > 0 ? 'danger' : 'warning';
    const count = tally.blocking || tally.warnings;
    if (count === 0) return null;
    const copy = COPY[tone];
    const one = count === 1;
    return {
      tone,
      label: say(one ? copy.labelOne : copy.label, count),
      name: say(one ? copy.nameOne : copy.name, count),
    };
  });
</script>

{#if chip}
  <Chip
    density="row"
    tone={chip.tone}
    icon="fas fa-circle-exclamation"
    ariaLabel={chip.name}
    data-recipe-step-issues={index}>{chip.label}</Chip
  >
{/if}
