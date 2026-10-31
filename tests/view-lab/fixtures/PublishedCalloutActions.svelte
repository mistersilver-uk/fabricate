<!--
  A View Lab specimen, not a Fabricate surface (issue 2855). It mounts three `Callout`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each holding a published
  `Button` in its actions slot: a call to action at `actionsPlacement` `'below'` with a full-width
  button, the same in a 180px column, and the default inline note beside them; then two danger
  `Notice`s, the fault panel at `assertive` and the polite one beside it. Every word is a
  companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-callout-actions`.

  The ground is one 320px column on `--fab-bg-1`. A case addresses the ground by
  `data-lab-callout-actions` and each section by its `data-lab-callout-action` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each callout section's key, its note, its placement, and its button's label and width. */
  const NOTES = Object.freeze([
    [
      'cta',
      {
        tone: 'accent',
        title: 'Begin an activity',
        text: 'Pick one to start it on your next day.',
      },
      'below',
      'Begin activity',
      true,
    ],
    [
      'narrow',
      { tone: 'warning', title: 'At your limit', text: 'Finish one activity first.' },
      'below',
      'Begin activity',
      true,
    ],
    ['inline', { title: 'Standing rules', text: 'Ticks run daily.' }, 'inline', 'Read', false],
  ]);
  /** Each notice section's key and whether it interrupts. */
  const FAULTS = Object.freeze([
    ['fault', true],
    ['status', false],
  ]);

  const targets = $state([]);

  $effect(() => {
    const count = NOTES.length + FAULTS.length;
    if (Array.from({ length: count }).some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = NOTES.map(([, note, actionsPlacement, label, fullWidth], index) => {
      const callout = mount('Callout', {
        target: targets[index],
        props: { ...note, actionsPlacement, actions: true },
      });
      const place = callout.slot('actions').ownerDocument.createElement('span');
      callout.slot('actions').append(place);
      mount('Button', {
        target: place,
        props: { children: label, fullWidth, role: 'primary', onclick: () => {} },
      });
      return callout;
    });
    for (const [index, [, assertive]] of FAULTS.entries()) {
      handles.push(
        mount('Notice', {
          target: targets[NOTES.length + index],
          props: {
            title: 'Something went wrong',
            detail: 'The Downtime Studio could not be drawn.',
            assertive,
          },
        })
      );
    }
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-callout-actions-ground" data-lab-callout-actions>
  {#each [...NOTES, ...FAULTS] as [key], index (key)}
    <section data-lab-callout-action={key} class:is-narrow={key === 'narrow'}>
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-callout-actions-ground {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-2);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .is-narrow {
    width: 180px;
  }
</style>
