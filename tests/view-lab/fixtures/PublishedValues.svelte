<!--
  A View Lab specimen, not a Fabricate surface (issue 2452). It mounts five `Stepper`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside the visible
  label the companion draws and named from the same words, so a case's steps type into and press
  what the fixture mounts. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-values` only.

  `credit` starts at 3 with a lower bound of 1; `count` at 2 between 0 and 10; `even` at 2, refusing
  every odd number, counting each refusal and saying why in a live region of its own; `limit` at 9
  between 0 and 10; and `card` at 4 on a `--fab-bg-2` strip. Each accepts any other edit by passing
  it back. Each section records the held number as `data-lab-value`, and what its input shows once
  it has lost focus as `data-lab-shown`, empty until it first has, so a case cannot read the held
  number there before its step records it. Each target is `display: flex`, its label centred
  against it, as the spec asks.

  The ground is one column on `--fab-bg-1`, and sets the azure tag ink, so an ink the stepper fails
  to state shows in the frame. A case addresses the ground by `data-lab-values` and each section by
  its `data-lab-stepper` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each stepper's key in fixture order, its label, the number it starts at, and its bounds. */
  const STEPPERS = Object.freeze([
    ['credit', { label: 'Days to credit', value: 3, bounds: { min: 1 } }],
    ['count', { label: 'Crafters at the bench', value: 2, bounds: { min: 0, max: 10 } }],
    ['even', { label: 'Pairs of gloves', value: 2, bounds: {}, evenOnly: true }],
    ['limit', { label: 'Attempts allowed', value: 9, bounds: { min: 0, max: 10 } }],
    ['card', { label: 'Rations carried', value: 4, bounds: {} }],
  ]);
  /** Where the steppers on the `--fab-bg-2` strip start. */
  const STRIP_FROM = STEPPERS.findIndex(([key]) => key === 'card');

  const targets = $state([]);
  /** What each section records: the held number, its refusals, what it shows after blur, and why. */
  const lab = $state(
    STEPPERS.map(([, { value }]) => ({ value, refused: 0, shown: '', reason: '' }))
  );

  function mountSteppers(mount) {
    const handles = [];
    const held = STEPPERS.map(([, { value }]) => value);
    /** One stepper's props at its held number; its `onChange` passes an accepted number back. */
    const props = (index) => {
      const [, { label, bounds, evenOnly }] = STEPPERS[index];
      const words = label.toLowerCase();
      return {
        value: held[index],
        ...bounds,
        ariaLabel: label,
        decrementLabel: `Decrease ${words}`,
        incrementLabel: `Increase ${words}`,
        onChange: (next) => {
          if (evenOnly && next % 2 !== 0) {
            lab[index].refused += 1;
            lab[index].reason = 'Choose an even number of pairs.';
            return;
          }
          lab[index].reason = '';
          held[index] = next;
          lab[index].value = next;
          handles[index].update(props(index));
        },
      };
    };
    for (const [index] of STEPPERS.entries()) {
      handles[index] = mount('Stepper', { target: targets[index], props: props(index) });
    }
    return handles;
  }

  /** Records what an input shows once it has lost focus, after the stepper's own snap-back. */
  function recordShown(index, event) {
    const input = event.target;
    if (input.tagName !== 'INPUT') return;
    setTimeout(() => {
      lab[index].shown = input.value;
    }, 0);
  }

  $effect(() => {
    if (STEPPERS.some((_, index) => !targets[index])) return undefined;
    const handles = mountSteppers(publishedComponentSeam.publicApi.mount);
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

{#snippet stepperSection(index)}
  {@const [key, { label }] = STEPPERS[index]}
  <section
    data-lab-stepper={key}
    data-lab-value={lab[index].value}
    data-lab-refused={lab[index].refused}
    data-lab-shown={lab[index].shown}
    onfocusout={(event) => recordShown(index, event)}
  >
    <div class="stepper-row">
      <span class="stepper-label">{label}</span>
      <div class="stepper-target" bind:this={targets[index]}></div>
    </div>
    <p class="stepper-reason" aria-live="polite">{lab[index].reason}</p>
  </section>
{/snippet}

<div class="published-values-ground" data-lab-values>
  {#each STEPPERS as [key], index (key)}
    {#if index < STRIP_FROM}{@render stepperSection(index)}{/if}
  {/each}
  <div class="published-values-strip">
    {#each STEPPERS as [key], index (key)}
      {#if index >= STRIP_FROM}{@render stepperSection(index)}{/if}
    {/each}
  </div>
</div>

<style>
  .published-values-ground,
  .published-values-strip {
    display: grid;
    gap: var(--fab-space-2);
  }

  .published-values-ground {
    box-sizing: border-box;
    width: 320px;
    padding: var(--fab-space-3);
    color: var(--fab-tag-azure);
    background: var(--fab-bg-1);
  }

  .published-values-strip {
    padding: var(--fab-space-2);
    background: var(--fab-bg-2);
  }

  .stepper-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
  }

  .stepper-label {
    min-width: 0;
    color: var(--fab-text);
  }

  .stepper-target {
    display: flex;
  }

  .stepper-reason {
    min-height: 1em;
    margin: var(--fab-space-1) 0 0;
    color: var(--fab-text-muted);
  }
</style>
