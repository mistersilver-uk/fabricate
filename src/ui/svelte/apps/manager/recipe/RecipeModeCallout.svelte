<!--
  The recipe editor's resolution-mode statement: a neutral `Callout` naming the crafting system's
  mode, what it means, and a route to Crafting Settings, the only place the mode changes. It heads
  the tabs the mode shapes — Overview, Ingredients, Results and Tools — in their heading blocks.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `mode` | a `resolutionModeOptions` value | `'simple'` | An unknown mode reads as the first option. |
  | `text` | the host's localizer | — | `(key, fallback)`; this component authors no lookup of its own. |

  Callbacks:
  - `onOpenCraftingSettings()` — the action; its presence gives the callout `role="note"`.

  Invariants:
  - `data-recipe-mode-callout` carries the mode, so a capture case can assert which one is on screen.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import { resolutionModeOptions } from '../resolutionModeOptions.js';

  let { mode = 'simple', text, onOpenCraftingSettings = () => {} } = $props();

  const option = $derived(
    resolutionModeOptions.find((entry) => entry.value === mode) || resolutionModeOptions[0]
  );
  const kicker = $derived(
    text('FABRICATE.Admin.Manager.Recipe.ModeCallout.Kicker', 'System resolution mode')
  );
</script>

<Callout
  icon={option.icon}
  title={`${kicker}: ${text(option.labelKey, option.fallback)}`}
  text={text(option.descKey, option.descFallback)}
  data-recipe-mode-callout={option.value}
>
  {#snippet actions()}
    <Button
      role="ghost"
      data-recipe-mode-callout-settings
      title={text(
        'FABRICATE.Admin.Manager.Recipe.ModeCallout.SettingsHint',
        'Resolution mode is set for the whole crafting system, not per recipe.'
      )}
      onclick={() => onOpenCraftingSettings()}
    >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.ModeCallout.Settings', 'System settings')}</span>
    </Button>
  {/snippet}
</Callout>
