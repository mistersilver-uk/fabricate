<!--
  A View Lab specimen, not a Fabricate surface (issue 2452). It mounts five `Notice`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each with an `action` and
  an `onAction` callback, and thirteen `Button`s beneath them, each with an `onclick`, so a case's
  steps press what the fixture mounts. Every word is a companion's final text, so none is
  localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-controls` only.

  The first notice's `onAction` focuses its own section and then updates the mount to `success`
  with no action, the order a companion follows when a press removes the button it was made on.
  The second's keeps its action, and counts its presses in `title` and in a rest `data-*`. The
  third takes the default tone and a long detail in a two-cell span, the fourth the hold bar's own
  copy in one 280px cell, where the action drops beneath the text, and the fifth a title alone.

  The buttons draw each visual role once, then `fullWidth` on a dashed and on a neutral one, the
  disabled look at two roles, and a label longer than its 120px target. `clear` and `create` each
  update their own label on a press and count it in a rest `data-*`. The last two stand on a
  `--fab-bg-2` strip, the lowest ground the two unfilled roles are stated for. Every button's
  target is `display: flex`, as the spec asks of a companion.

  The ground is two 280px cells on `--fab-bg-1`, a ground both labels are stated for. It sets the
  azure tag ink, so an ink a notice or a button fails to state shows in the frame. A case
  addresses the ground by `data-lab-controls` and each notice's section by its `data-lab-control`
  key, and the buttons' band by `data-lab-buttons` and each button's section by its
  `data-lab-button` key.
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

  /** Each button's key in fixture order, its props, and how its section is laid out. */
  const BUTTONS = Object.freeze([
    ['clear', { children: 'Clear filters' }],
    ['create', { role: 'primary', children: 'New project' }],
    ['back', { role: 'ghost', children: 'Back to projects' }],
    ['delete', { role: 'danger', children: 'Delete project' }],
    ['review', { role: 'warning', children: 'Review' }],
    ['add', { role: 'dashed', children: 'Add tier' }],
    ['add-wide', { role: 'dashed', fullWidth: true, children: 'Add another tier' }, 'is-wide'],
    ['wide', { fullWidth: true, children: 'Review every project' }],
    ['off', { disabled: true, children: 'Clear filters' }],
    ['off-primary', { role: 'primary', disabled: true, children: 'New project' }],
    ['long', { children: 'Clear every filter on this board' }, 'is-narrow'],
    ['card-back', { role: 'ghost', children: 'Back to projects' }],
    ['card-add', { role: 'dashed', children: 'Add tier' }],
  ]);
  /** Where the buttons on the `--fab-bg-2` strip start. */
  const STRIP_FROM = BUTTONS.findIndex(([key]) => key === 'card-back');

  /** What a press redraws a button as: its key, and the label it takes with its `presses`. */
  const PRESSED = Object.freeze({
    clear: () => 'Filters cleared',
    create: (presses) => `Projects: ${presses}`,
  });

  const targets = $state([]);
  const sections = $state([]);
  const buttonTargets = $state([]);

  function ignore() {}

  function mountNotices(mount) {
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
    return Object.values(handles);
  }

  function mountButtons(mount) {
    const handles = {};
    /** One button's props after `presses` presses; a pressed one redraws its own label. */
    const pressed = (key, given, presses) => ({
      ...given,
      children: presses > 0 && PRESSED[key] ? PRESSED[key](presses) : given.children,
      onclick: PRESSED[key] ? () => handles[key].update(pressed(key, given, presses + 1)) : ignore,
      'data-lab-presses': presses,
    });
    for (const [index, [key, given]] of BUTTONS.entries()) {
      handles[key] = mount('Button', {
        target: buttonTargets[index],
        props: pressed(key, given, 0),
      });
    }
    return Object.values(handles);
  }

  $effect(() => {
    if (NOTICES.some((_, index) => !targets[index])) return undefined;
    if (BUTTONS.some((_, index) => !buttonTargets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = [...mountNotices(mount), ...mountButtons(mount)];
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

{#snippet buttonSection(index)}
  <section data-lab-button={BUTTONS[index][0]} class={BUTTONS[index][2]}>
    <div class="button-target" bind:this={buttonTargets[index]}></div>
  </section>
{/snippet}

<div class="published-controls-ground" data-lab-controls>
  {#each NOTICES as [key, wide], index (key)}
    <section data-lab-control={key} class:is-wide={wide} tabindex="-1" bind:this={sections[index]}>
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
  <div class="published-buttons-band" data-lab-buttons>
    {#each BUTTONS as [key], index (key)}
      {#if index < STRIP_FROM}{@render buttonSection(index)}{/if}
    {/each}
    <div class="published-buttons-strip">
      {#each BUTTONS as [key], index (key)}
        {#if index >= STRIP_FROM}{@render buttonSection(index)}{/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .published-controls-ground,
  .published-buttons-band,
  .published-buttons-strip {
    display: grid;
    grid-template-columns: repeat(2, 280px);
    gap: var(--fab-space-2);
    align-items: start;
  }

  .published-controls-ground {
    box-sizing: border-box;
    width: max-content;
    padding: var(--fab-space-3);
    color: var(--fab-tag-azure);
    background: var(--fab-bg-1);
  }

  .published-buttons-band,
  .published-buttons-strip {
    grid-column: span 2;
  }

  /* The strip's padding comes out of its two cells, so it stays as wide as the band. */
  .published-buttons-strip {
    box-sizing: border-box;
    grid-template-columns: repeat(2, 1fr);
    padding: var(--fab-space-2);
    background: var(--fab-bg-2);
  }

  section {
    min-width: 0;
  }

  section.is-wide {
    grid-column: span 2;
  }

  .button-target {
    display: flex;
  }

  section.is-narrow > .button-target {
    width: 120px;
  }
</style>
