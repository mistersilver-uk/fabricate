<!--
  A test-only caller that opens `TintPicker` from an anchor it owns, as the gathering biome's edit
  palette does (issue 2459): a right-click, the ContextMenu key or Shift+F10 on the anchor toggles
  the bound `open`, a toggle shut hands focus back to the anchor, and the panel offers the custom
  hex and No colour. The anchor sits in a `tabindex="-1"` group, the biome pill list's shape.
-->
<script>
  import TintPicker from '../../../src/ui/svelte/components/TintPicker.svelte';
  import { MANAGER_MAIN_SELECTOR } from '../../../src/ui/svelte/util/overlayBounds.js';

  let open = $state(false);
  let anchor = $state(null);
  let colorToken = $state('sage');
  let customColor = $state('');
  let unset = $state(false);

  function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    open = !open;
    if (!open) event.currentTarget.focus();
  }

  function toggleFromKey(event) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) toggle(event);
  }

  function change(next) {
    ({ colorToken, customColor } = next);
    unset = false;
  }

  function clear() {
    unset = true;
  }

  globalThis.__tintAnchoredHost = {
    isOpen: () => open,
    state: () => ({ colorToken, customColor, unset }),
  };
</script>

<div
  class="tint-anchored-host"
  role="group"
  tabindex="-1"
  data-keyboard-focus="true"
  aria-label="Biomes"
>
  <button
    bind:this={anchor}
    type="button"
    class="tint-anchored-anchor"
    aria-haspopup="dialog"
    aria-expanded={open}
    oncontextmenu={toggle}
    onkeydown={toggleFromKey}>Moon Forest</button
  >
  <TintPicker
    anchor={() => anchor}
    bind:open
    bounds={MANAGER_MAIN_SELECTOR}
    {colorToken}
    {customColor}
    {unset}
    allowCustom
    allowNone
    onClear={clear}
    onChange={change}
  />
</div>
