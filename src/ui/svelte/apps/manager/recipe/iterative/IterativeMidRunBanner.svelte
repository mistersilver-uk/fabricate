<!-- Svelte 5 runes mode -->
<!--
  The recipe editor's note that workpieces of this recipe are in progress, and that they keep the
  terms they started with. The caller draws it only while the count is above zero.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `count` | integer | `0` | the recipe's active runs in the selected system |
  | `recipeName` | string | `''` | the recipe's name, as the title states it |
  | `text` | the shell's localizer | — | `(key, fallback)` |
-->
<script>
  import Callout from '../../../../components/Callout.svelte';
  import { fill } from '../../../../../../utils/fillPlaceholders.js';

  let { count = 0, recipeName = '', text = (_key, fallback) => fallback } = $props();

  const one = $derived(count === 1);
  const title = $derived(
    fill(
      one
        ? text(
            'FABRICATE.Admin.Manager.Recipe.Iterative.MidRunTitleOne',
            '1 workpiece of {recipe} is in progress.'
          )
        : text(
            'FABRICATE.Admin.Manager.Recipe.Iterative.MidRunTitle',
            '{count} workpieces of {recipe} are in progress.'
          ),
      { count, recipe: recipeName }
    )
  );
  const body = $derived(
    one
      ? text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.MidRunTextOne',
          'It keeps the counters, rules and routes it started with. Your changes apply to workpieces started after you save.'
        )
      : text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.MidRunText',
          'They keep the counters, rules and routes they started with. Your changes apply to workpieces started after you save.'
        )
  );
</script>

<Callout
  tone="info"
  icon="fas fa-clock-rotate-left"
  {title}
  text={body}
  data-iterative-mid-run={count}
/>
