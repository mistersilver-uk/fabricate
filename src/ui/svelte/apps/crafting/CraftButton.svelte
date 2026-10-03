<!-- Svelte 5 runes mode -->
<!--
  The run summary's craft action: "Craft another", or "Craft next step" on a progressive run. It
  is a ghost, because the pane's one primary is the recipe header's. A blocked craft names its
  reason in the title and the accessible name, and `busy` reflects store.craftInFlight.
-->
<script>
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { withRollPromptOrigin } from '../../util/rollPromptOrigin.js';

  let {
    label = '',
    disabled = false,
    disabledReason = '',
    busy = false,
    onCraft = null,
  } = $props();

  const blocked = $derived(disabled || busy);
  const accessibleLabel = $derived(
    busy
      ? localize('FABRICATE.App.Crafting.Button.Crafting')
      : disabled && disabledReason
        ? disabledReason
        : label
  );
</script>

<ManagerButton
  role="ghost"
  fullWidth
  data-crafting-craft=""
  data-crafting-craft-disabled={blocked ? 'true' : 'false'}
  disabled={blocked}
  title={accessibleLabel}
  aria-label={accessibleLabel}
  onclick={(event) => withRollPromptOrigin(event, () => onCraft?.())}
>
  {#if busy}
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Crafting.Button.Crafting')}</span>
  {:else}
    <i class="fas fa-hammer" aria-hidden="true"></i>
    <span>{label}</span>
  {/if}
</ManagerButton>
