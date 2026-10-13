<!--
  A View Lab specimen, not a Fabricate surface (issue 2452). It mounts five `Notice`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each with an `action` and
  an `onAction` callback, so the case's steps press what the fixture mounts. Every word is a
  companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-controls` only.

  The first notice's `onAction` focuses its own section and then updates the mount to `success`
  with no action, the order a companion follows when a press removes the button it was made on.
  The second's keeps its action, and counts its presses in `title` and in a rest `data-*`. The
  third takes the default tone and a long detail in a two-cell span, the fourth the hold bar's own
  copy in one 280px cell, where the action drops beneath the text, and the fifth a title alone.

  The ground is two 280px cells on `--fab-bg-1`, a ground the action's label is stated for. It
  sets the azure tag ink, so an ink a notice fails to state shows in the frame. The case addresses
  the ground by `data-lab-controls` and each section by its `data-lab-control` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each notice's key in fixture order, and whether its section spans both cells. */
  const NOTICES = Object.freeze([
    ['resume', false],
    ['count', false],
    ['wide', true],
    ['hold', false],
    ['undo', false],
  ]);

  const targets = $state([]);
  const sections = $state([]);

  function ignore() {}

  $effect(() => {
    if (NOTICES.some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = {};
    const counted = (presses) => ({
      tone: 'info',
      title: `Attempts allowed: ${presses}`,
      action: { label: 'Allow one' },
      onAction: () => handles.count.update(counted(presses + 1)),
      'data-lab-presses': presses,
    });
    const props = {
      resume: {
        tone: 'warning',
        title: 'The forge has gone cold',
        action: { label: 'Relight it' },
        onAction() {
          sections[0].focus();
          handles.resume.update({ tone: 'success', title: 'The forge is lit again' });
        },
      },
      count: counted(0),
      wide: {
        title: 'The batch is lost',
        detail:
          'The crucible cracked on the third pour, so the mould must be recast before the caravan takes on another order.',
        action: { label: 'Recast the mould' },
        onAction: ignore,
      },
      hold: {
        tone: 'warning',
        title: 'This stage is held by the failed check.',
        action: { label: 'Allow another attempt' },
        onAction: ignore,
      },
      undo: {
        tone: 'success',
        title: '4 essences deleted',
        action: { label: 'Undo' },
        onAction: ignore,
      },
    };
    for (const [index, [key]] of NOTICES.entries()) {
      handles[key] = mount('Notice', { target: targets[index], props: props[key] });
    }
    return () => {
      for (const handle of Object.values(handles)) handle.destroy();
    };
  });
</script>

<div class="published-controls-ground" data-lab-controls>
  {#each NOTICES as [key, wide], index (key)}
    <section data-lab-control={key} class:is-wide={wide} tabindex="-1" bind:this={sections[index]}>
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-controls-ground {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, 280px);
    gap: var(--fab-space-2);
    align-items: start;
    width: max-content;
    padding: var(--fab-space-3);
    color: var(--fab-tag-azure);
    background: var(--fab-bg-1);
  }

  section {
    min-width: 0;
  }

  section.is-wide {
    grid-column: span 2;
  }
</style>
