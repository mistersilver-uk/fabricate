<!--
  The bare drop target: a dashed prompt that hands a raw drag payload to `onDrop`. It resolves
  nothing and renders no linked state — a caller that needs the resolved document, its address and
  an unlink action uses `ItemDropZone` instead.

  `label` is a LOCALIZATION KEY resolved here, not an English string: a default written into a
  `$props()` destructuring is a word `game.i18n` never sees.
-->
<script>
  import { dragDrop } from '../actions/dragDrop.js';
  import { localize } from '../util/foundryBridge.js';

  let {
    onDrop,
    label = 'FABRICATE.DropZone.DefaultLabel',
    icon = 'fas fa-download',
    disabled = false,
    activeClass = 'drop-active',
  } = $props();
</script>

<div class="drop-zone" use:dragDrop={{ onDrop, disabled, activeClass }}>
  <i class={icon}></i>
  {localize(label)}
</div>
