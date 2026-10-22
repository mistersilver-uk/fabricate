<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts four `Callout`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, one per section: a neutral
  standing rule drawn from `text` alone, an `info` note with a title, a `warning` note whose items
  list two points, and a `danger` note whose `actions` content slot holds a published `Button` in a
  `<span>` target of the companion's own. Every word is a companion's final text, so none is
  localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-callout` only.

  The ground is one 360px column on `--fab-bg-1` that spaces its sections by 8px. A case addresses
  the ground by `data-lab-callout-ground` and a section by `data-lab-callout`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's note, by its key. */
  const NOTES = Object.freeze([
    ['standing', { text: 'Salvage returns half of each component, rounded down.' }],
    [
      'info',
      {
        tone: 'info',
        title: 'Three crafters online',
        text: 'Each sees the recipes this system shares.',
      },
    ],
    [
      'warning',
      {
        tone: 'warning',
        title: 'Two reagents run short',
        items: [
          { icon: 'fas fa-leaf', lead: 'Moonpetal', text: 'one held, two needed' },
          { icon: 'fas fa-fire', lead: 'Ember salt', text: 'none held' },
        ],
      },
    ],
    ['actions', { tone: 'danger', text: 'This recipe has no result.', actions: true }],
  ]);

  let targets = $state({});

  $effect(() => {
    if (NOTES.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = NOTES.map(([key, props]) => mount('Callout', { target: targets[key], props }));
    const slot = handles.at(-1).slot('actions');
    const buttonTarget = slot.ownerDocument.createElement('span');
    buttonTarget.style.display = 'flex';
    slot.append(buttonTarget);
    const button = mount('Button', {
      target: buttonTarget,
      props: { children: 'Add a result', onclick() {} },
    });
    return () => {
      button.destroy();
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-callout-ground" data-lab-callout-ground>
  {#each NOTES as [key] (key)}
    <section data-lab-callout={key}>
      <div bind:this={targets[key]}></div>
    </section>
  {/each}
</div>

<style>
  .published-callout-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
