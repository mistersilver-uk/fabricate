<!--
  A test-only published component (issue 2426): it draws `text` after an optional `leading` node,
  faults on demand at init, in an effect, in that effect's cleanup or on an update that sets
  `explode`, and clips its hidden text with its own style. `note` is its `text` snippet, drawn over
  a literal fallback. `aside` and `body` are its content slots (issue 2451): `aside` inside the
  paragraph, `body` inside a host whose element `bodyAs` names.
-->
<script module>
  export const PROBE_FAULTS = Object.freeze({
    init: new Error('probe init fault'),
    effect: new Error('probe effect fault'),
    explode: new Error('probe update fault'),
    teardown: new Error('probe teardown fault'),
  });
</script>

<script>
  import { untrack } from 'svelte';

  let {
    text = 'DEFAULT',
    leading = false,
    throwAt = null,
    explode = false,
    note = undefined,
    aside = undefined,
    body = undefined,
    bodyAs = 'div',
    ...rest
  } = $props();

  if (untrack(() => throwAt) === 'init') throw PROBE_FAULTS.init;

  $effect(() => {
    const at = throwAt;
    if (at === 'effect') throw PROBE_FAULTS.effect;
    return () => {
      if (at === 'teardown') throw PROBE_FAULTS.teardown;
    };
  });

  function guard(value) {
    if (value) throw PROBE_FAULTS.explode;
    return '';
  }
</script>

{#if leading}<span class="probe-leading">Leading</span>{/if}
<p class="probe" {...rest}>
  <span class="probe-text">{text}</span>{guard(explode)}<span class="probe-hidden">Hidden</span>
  <span class="probe-note"
    >{#if note}{@render note?.()}{:else}NO NOTE{/if}</span
  >
  <span class="probe-aside">{@render aside?.()}</span>
</p>
<svelte:element this={bodyAs} class="probe-body">{@render body?.()}</svelte:element>

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
