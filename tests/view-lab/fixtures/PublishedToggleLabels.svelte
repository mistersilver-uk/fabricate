<!--
  A View Lab specimen, not a Fabricate surface (issues 2902, 2795). It mounts `StatusToggle`s
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a
  caption of the companion's own: a switch labelled off and on, one that announces as a switch,
  one whose `ariaLabel` holds its label's words, the switch the case's first step presses on its
  words, the switch the second step reaches with Tab, a label long enough to wrap in a 160px
  target, and the track-only switch as a baseline. Every word is a companion's final text, so
  none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-toggle-labels` only.

  One 420px ground on `--fab-bg-1` spaces its rows by 6px. A case addresses it by
  `data-lab-toggle-labels`, a row by its unique `data-lab-toggle-label` key, and the row the step
  presses echoes the companion's state in `data-lab-toggle-label-on`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key, its caption and the switch's props, `onclick` aside. */
  const ROWS = Object.freeze([
    ['required', 'off', { on: false, label: 'Required' }],
    ['hidden', 'on', { on: true, label: 'Hidden' }],
    ['switch', 'on, announced as a switch', { on: true, semantics: 'switch', label: 'Spent' }],
    [
      'named',
      'an ariaLabel holding the label',
      { on: false, label: 'Required', ariaLabel: 'Required ingredients' },
    ],
    ['pressed', 'its words clicked', { on: false, label: 'Spent' }],
    ['focused', 'focused', { on: false, label: 'Advance by the elapsed time' }],
    [
      'long',
      'a long label, 160px',
      { on: false, label: 'Spend the stage’s requirements when the activity begins' },
    ],
    ['track', 'no label, ariaLabel', { on: false, ariaLabel: 'Group by category' }],
  ]);

  let targets = $state({});
  // The echo the case reads; the props read `held`, so the effect does not track the press.
  let pressed = $state(false);

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = {};
    let held = false;
    const propsOf = (key, props) =>
      key === 'pressed'
        ? {
            ...props,
            on: held,
            onclick: () => {
              held = !held;
              pressed = held;
              handles[key].update(propsOf(key, props));
            },
          }
        : { ...props, onclick: () => {} };
    for (const [key, , props] of ROWS) {
      handles[key] = mount('StatusToggle', { target: targets[key], props: propsOf(key, props) });
    }
    return () => {
      for (const handle of Object.values(handles)) handle.destroy();
    };
  });
</script>

<div class="published-toggle-labels-ground" data-lab-toggle-labels>
  {#each ROWS as [key, caption] (key)}
    <section
      data-lab-toggle-label={key}
      data-lab-toggle-label-on={key === 'pressed' ? String(pressed) : undefined}
    >
      <div
        class="published-toggle-labels-target"
        class:is-narrow={key === 'long'}
        bind:this={targets[key]}
      ></div>
      <span>{caption}</span>
    </section>
  {/each}
</div>

<style>
  .published-toggle-labels-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    width: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-toggle-labels-ground section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-3);
  }

  .published-toggle-labels-target {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .published-toggle-labels-target.is-narrow {
    width: 160px;
  }
</style>
