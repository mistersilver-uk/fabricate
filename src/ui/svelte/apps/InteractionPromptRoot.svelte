<!-- Svelte 5 runes mode -->
<!--
  InteractionPromptRoot — the non-blocking, on-canvas player prompt toast for a
  Fabricate interactable region (region-first model).

  It is deliberately MINIMAL: the interactable's name, an optional prompt line,
  and a single "Interact" button (plus a close affordance). It is NOT modal — the
  parent ApplicationV2 is anchored bottom-center and stays out of the way. The
  manager shows it when the controlling player's token enters an eligible
  interactable region and dismisses it on exit.

  All copy is localized through the foundry bridge; both callbacks (onInteract,
  onClose) are injected so this component does no I/O of its own.
-->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { name = '', promptText = null, onInteract = null, onClose = null } = $props();

  function text(key, fallback = key) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<div class="fabricate-interaction-prompt">
  <button
    type="button"
    class="fabricate-interaction-prompt__close"
    aria-label={text('FABRICATE.Canvas.Interactable.Prompt.Close', 'Dismiss')}
    onclick={() => onClose?.()}
  >
    <i class="fas fa-xmark"></i>
  </button>

  <div class="fabricate-interaction-prompt__body">
    {#if name}
      <p class="fabricate-interaction-prompt__name">{name}</p>
    {/if}
    {#if promptText}
      <p class="fabricate-interaction-prompt__text">{promptText}</p>
    {/if}
  </div>

  <button
    type="button"
    class="fabricate-interaction-prompt__action"
    onclick={() => onInteract?.()}
  >
    <i class="fas fa-hand-pointer"></i>
    <span>{text('FABRICATE.Canvas.Interactable.Prompt.Interact', 'Interact')}</span>
  </button>
</div>
