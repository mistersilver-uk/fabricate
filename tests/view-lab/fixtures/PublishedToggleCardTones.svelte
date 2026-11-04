<!--
  A View Lab specimen, not a Fabricate surface. It mounts `ToggleCard`s through the page-session
  seam `game.fabricate.api.ui` binds, as a companion does, one in each `tone` while on, an enabled
  card while off to show the tint leaves with the state, and the card the case's step presses on
  from off in the `info` tone. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-toggle-card-tones` only.

  One 420px ground on `--fab-bg-1` spaces its rows by 8px. A case addresses it by
  `data-lab-toggle-card-tones`, a row by its unique `data-lab-toggle-card-tone` key, and the row the
  step presses echoes the companion's state in `data-lab-toggle-card-tone-on`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key and the card's props, `onToggle` aside. */
  const ROWS = Object.freeze([
    ['neutral', { tone: 'neutral', on: true, title: 'Spend when this stage begins' }],
    ['enabled', { tone: 'enabled', on: true, title: 'Advance with world time' }],
    ['locked', { tone: 'locked', on: true, title: 'Keep the recipe locked' }],
    ['info', { tone: 'info', on: true, title: 'Let players see the reagents' }],
    ['off', { tone: 'enabled', on: false, title: 'Advance with world time' }],
    ['pressed', { tone: 'info', on: false, title: 'Show the yield to players' }],
  ]);

  const SUB = 'The ingredient is used up as the stage starts.';

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
            sub: SUB,
            semantics: 'switch',
            on: held,
            onToggle: () => {
              held = !held;
              pressed = held;
              handles[key].update(propsOf(key, props));
            },
          }
        : { ...props, sub: SUB, semantics: 'switch', onToggle: () => {} };
    for (const [key, props] of ROWS) {
      handles[key] = mount('ToggleCard', { target: targets[key], props: propsOf(key, props) });
    }
    return () => {
      for (const handle of Object.values(handles)) handle.destroy();
    };
  });
</script>

<div class="published-toggle-card-tones-ground" data-lab-toggle-card-tones>
  {#each ROWS as [key] (key)}
    <div
      data-lab-toggle-card-tone={key}
      data-lab-toggle-card-tone-on={key === 'pressed' ? String(pressed) : undefined}
      bind:this={targets[key]}
    ></div>
  {/each}
</div>

<style>
  .published-toggle-card-tones-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
