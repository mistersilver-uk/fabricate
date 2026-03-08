<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../actions/dragDrop.js';
  import { localize } from '../util/foundryBridge.js';

  let { onDrop, label = 'FABRICATE.DropZone.DefaultLabel', icon = 'fas fa-download', disabled = false, activeClass = 'drop-active' } = $props();
</script>

<div
  class="drop-zone"
  use:dragDrop={{ onDrop, disabled, activeClass }}
>
  <i class={icon}></i>
  {localize(label)}
</div>
