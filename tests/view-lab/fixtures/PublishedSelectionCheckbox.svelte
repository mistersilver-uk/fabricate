<!--
  A View Lab specimen, not a Fabricate surface (issue 2836). It mounts `SelectionCheckbox`es
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a
  caption of the companion's own: every state at the default density, the empty, ticked and mixed
  compact and comfortable boxes, the disabled faces, the box the case's step ticks from the
  keyboard through the companion's own update, the box a second step focuses unticked, a label
  long enough to wrap in a 200px target, and the box alone, named by `ariaLabel`; then four boxes
  on a `--fab-bg-2` column, and the box Fabricate's own callers draw, imported directly, as a
  baseline. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-selection-checkbox` only.

  Two grounds stand side by side, a 400px column on `--fab-bg-1` and a 220px one on `--fab-bg-2`,
  each spacing its rows by 6px. A case addresses them by `data-lab-selection-checkboxes` and
  `data-lab-selection-checkboxes-deep`, a row by its unique `data-lab-selection-checkbox` key, and
  the row the step presses echoes the companion's state in `data-lab-selection-checkbox-checked`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
  import SelectionCheckbox from '../../../src/ui/svelte/components/SelectionCheckbox.svelte';

  const LONG =
    'Add the duration of the recipe’s every stage to this activity, so the downtime it asks for grows with the recipe';
  const AWARD = 'Award the recipe’s ingredients first';

  /** Each row's key, its caption and the box's props, `onChange` aside, on the first ground. */
  const ROWS = Object.freeze([
    ['unchecked', 'unticked', { checked: false, label: 'Advance by the elapsed time' }],
    ['checked', 'ticked', { checked: true, label: AWARD }],
    [
      'mixed',
      'indeterminate',
      { checked: false, indeterminate: true, label: 'Spend the stage’s requirements' },
    ],
    ['compact-off', 'compact, unticked', { checked: false, density: 'compact', label: 'Spent' }],
    ['compact', 'compact, ticked', { checked: true, density: 'compact', label: 'Spent' }],
    [
      'mixed-compact',
      'compact, indeterminate',
      { checked: false, indeterminate: true, density: 'compact', label: 'Spent' },
    ],
    [
      'comfortable-off',
      'comfortable, unticked',
      { checked: false, density: 'comfortable', label: 'Spent' },
    ],
    [
      'comfortable',
      'comfortable, ticked',
      { checked: true, density: 'comfortable', label: 'Spent' },
    ],
    ['disabled-off', 'disabled', { checked: false, disabled: true, label: 'Advance to step' }],
    [
      'disabled-on',
      'disabled, ticked',
      { checked: true, disabled: true, label: 'Advance to step' },
    ],
    [
      'disabled-mixed',
      'disabled, indeterminate',
      { checked: false, indeterminate: true, disabled: true, label: 'Advance to step' },
    ],
    ['pressed', 'Space pressed', { checked: false, label: 'Spent' }],
    ['focused', 'focused, unticked', { checked: false, label: 'Advance by the elapsed time' }],
    ['long', 'a long label, 200px', { checked: false, label: LONG }],
    ['named', 'no label, ariaLabel', { checked: true, ariaLabel: 'Select Iron ore' }],
  ]);

  /** The rows of the `--fab-bg-2` column. */
  const DEEP_ROWS = Object.freeze([
    ['deep-off', 'unticked', { checked: false, label: 'Advance by' }],
    [
      'deep-compact-off',
      'compact, unticked',
      { checked: false, density: 'compact', label: 'Spent' },
    ],
    ['deep-on', 'ticked', { checked: true, label: 'Advance by' }],
    ['deep-mixed', 'indeterminate', { checked: false, indeterminate: true, label: 'Advance by' }],
  ]);
  const MOUNTED = [...ROWS, ...DEEP_ROWS];

  let targets = $state({});
  // The echo the case reads; the props read `held`, so the effect does not track the press.
  let pressed = $state(false);

  $effect(() => {
    if (MOUNTED.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = {};
    let held = false;
    const propsOf = (key, props) =>
      key === 'pressed'
        ? {
            ...props,
            checked: held,
            onChange: (next) => {
              held = next;
              pressed = next;
              handles[key].update(propsOf(key, props));
            },
          }
        : { ...props, onChange: () => {} };
    for (const [key, , props] of MOUNTED) {
      handles[key] = mount('SelectionCheckbox', {
        target: targets[key],
        props: propsOf(key, props),
      });
    }
    return () => {
      for (const handle of Object.values(handles)) handle.destroy();
    };
  });
</script>

{#snippet row(key, caption)}
  <section
    data-lab-selection-checkbox={key}
    data-lab-selection-checkbox-checked={key === 'pressed' ? String(pressed) : undefined}
  >
    <div
      class="published-selection-checkboxes-target"
      class:is-narrow={key === 'long'}
      bind:this={targets[key]}
    ></div>
    <span>{caption}</span>
  </section>
{/snippet}

<div class="published-selection-checkboxes-grounds">
  <div class="published-selection-checkboxes-ground" data-lab-selection-checkboxes>
    {#each ROWS as [key, caption] (key)}
      {@render row(key, caption)}
    {/each}
    <!-- The baseline: Fabricate's own decorative box, as `BulkStagingInset` draws it, and its own
         labelled box, each mounted directly rather than through the seam. -->
    <section data-lab-selection-checkbox="baseline-decorative">
      <span class="published-selection-checkboxes-target">
        <SelectionCheckbox decorative density="compact" checked />
        <SelectionCheckbox decorative density="compact" />
      </span>
      <span>in-app decorative, ticked and empty</span>
    </section>
    <section data-lab-selection-checkbox="baseline-labelled">
      <span class="published-selection-checkboxes-target">
        <SelectionCheckbox checked ariaLabel="Select Iron ore" />
      </span>
      <span>in-app, unlabelled</span>
    </section>
  </div>
  <div class="published-selection-checkboxes-ground is-deep" data-lab-selection-checkboxes-deep>
    {#each DEEP_ROWS as [key, caption] (key)}
      {@render row(key, caption)}
    {/each}
  </div>
</div>

<style>
  .published-selection-checkboxes-grounds {
    display: flex;
    align-items: flex-start;
  }

  .published-selection-checkboxes-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    width: 400px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-selection-checkboxes-ground.is-deep {
    width: 220px;
    background: var(--fab-bg-2);
  }

  .published-selection-checkboxes-ground section {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--fab-space-3);
  }

  .published-selection-checkboxes-target {
    display: flex;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .published-selection-checkboxes-target.is-narrow {
    width: 200px;
  }
</style>
