<!--
  A test-only published component (issue 2426): it draws `text` after an optional `leading` node,
  faults on demand at init, in an effect or on an update that sets `explode`, and clips its hidden
  text with its own style.
-->
<script module>
  export const PROBE_FAULTS = Object.freeze({
    init: new Error('probe init fault'),
    effect: new Error('probe effect fault'),
    explode: new Error('probe update fault'),
  });
</script>

<script>
  import { untrack } from 'svelte';

  let { text = 'DEFAULT', leading = false, throwAt = null, explode = false, ...rest } = $props();

  if (untrack(() => throwAt) === 'init') throw PROBE_FAULTS.init;

  $effect(() => {
    if (throwAt === 'effect') throw PROBE_FAULTS.effect;
  });

  function guard(value) {
    if (value) throw PROBE_FAULTS.explode;
    return '';
  }
</script>

{#if leading}<span class="probe-leading">Leading</span>{/if}
<p class="probe" {...rest}>
  <span class="probe-text">{text}</span>{guard(explode)}<span class="probe-hidden">Hidden</span>
</p>

<style>
  .probe {
    position: relative;
    font-family: var(--fab-font-serif, serif);
  }

  .probe-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
