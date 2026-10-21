<!--
  A test-only published component (issue 2426): it draws `text` after an optional `leading` node,
  faults on demand at init, in an effect, in that effect's cleanup or on an update that sets
  `explode`, and clips its hidden text with its own style. `note` is its `text` snippet, drawn over
  a literal fallback. `aside` and `body` are its content slots (issue 2451): `aside` inside the
  paragraph, `body` inside a host whose element `bodyAs` names.

  Callbacks (issue 2452):
  - `onPing()` — called on each press of the button `label` names; omitted, the probe counts the
    press itself in `data-probe-default-pings`. `data-probe-bindings` counts how often an effect
    reading `$derived(onPing)` ran, which a forwarder that changed would raise.
  - `onPick(picked)` — called after `onPing` on each press, with the probe's `$state` object and a
    second value the entry does not forward, then with `'outer'` by the click of the `<span>`
    around the button. An effect also calls it once per distinct `pickAt`, which no shipped
    component may do: `tests/published-component-controls.test.js` pins both keys as its
    exceptions.

  Values (issue 2453):
  - `query` and `count` — bound values, each written by its own input's `oninput` through
    `value = next`, never `bind:value`; `count` reads its input as a number, so `-0` is written.
  - `mirror` — a bound value an effect writes once per distinct `mirrorAt`, which no shipped
    component may do: `tests/published-component-controls.test.js` pins it as the exception.
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
    label = undefined,
    pickAt = undefined,
    onPing = countPing,
    onPick = undefined,
    query = $bindable(''),
    count = $bindable(0),
    mirror = $bindable(''),
    mirrorAt = undefined,
    ...rest
  } = $props();

  const picked = $state({ id: 'probe', presses: 0 });
  let defaultPings = $state(0);
  let bindings = $state(0);

  function countPing() {
    defaultPings += 1;
  }

  // Each derived holds one value across an update that changes nothing it reads, so neither effect
  // runs again for an update alone.
  const ping = $derived(onPing);
  const pick = $derived(onPick);
  const pickedAt = $derived(pickAt);
  const mirroredAt = $derived(mirrorAt);

  $effect(() => {
    if (ping) untrack(() => (bindings += 1));
  });

  $effect(() => {
    if (pickedAt !== undefined) pick?.(picked, 'effect');
  });

  $effect(() => {
    if (mirroredAt !== undefined) mirror = mirroredAt;
  });

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
<p
  class="probe"
  data-probe-bindings={bindings}
  data-probe-default-pings={defaultPings}
  data-probe-picked={picked.id}
  {...rest}
>
  <span class="probe-text">{text}</span>{guard(explode)}<span class="probe-hidden">Hidden</span>
  <span class="probe-note"
    >{#if note}{@render note?.()}{:else}NO NOTE{/if}</span
  >
  <span class="probe-aside">{@render aside?.()}</span>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <span class="probe-outer" onclick={() => onPick?.('outer')}>
    <button
      type="button"
      class="probe-press"
      data-keyboard-focus="true"
      data-probe-press
      onclick={() => {
        picked.presses += 1;
        onPing?.();
        onPick?.(picked, 'second');
      }}>{label}</button
    >
  </span>
  <input
    class="probe-value"
    data-keyboard-focus="true"
    data-probe-query
    data-probe-mirror={mirror}
    aria-label={label}
    value={query}
    oninput={(event) => (query = event.currentTarget.value)}
  />
  <input
    class="probe-value"
    data-keyboard-focus="true"
    data-probe-count
    aria-label={label}
    value={count}
    oninput={(event) => (count = Number(event.currentTarget.value))}
  />
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

  .probe-press:focus {
    outline: none;
    box-shadow: none;
  }

  .probe-press:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .probe-value:focus {
    outline: none;
    box-shadow: none;
  }

  .probe-value:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
