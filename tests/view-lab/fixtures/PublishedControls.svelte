<!--
  A View Lab specimen, not a Fabricate surface (issue 2452). It mounts five `Notice`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each with an `action` and
  an `onAction` callback, thirteen `Button`s beneath them, each with an `onclick`, and eight
  `StatusToggle`s beneath those, so a case's steps press what the fixture mounts. Every word is a companion's final text, so none is
  localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-controls` only.

  The first notice's `onAction` focuses its own section and then updates the mount to `success`
  with no action, the order a companion follows when a press removes the button it was made on.
  The second's keeps its action, and counts its presses in `title` and in a rest `data-*`. The
  third takes the default tone and a long detail in a two-cell span, the fourth the hold bar's own
  copy in one 280px cell, where the action drops beneath the text, and the fifth a title alone.

  The buttons draw each visual role once, then `fullWidth` on a dashed and on a neutral one, the
  disabled look at two roles, and a label that takes four lines in its 120px target, so its first
  and last lines spill past the top and bottom edges of the 34px button, into the 8px gaps between
  rows. `clear` and `create` each update their own label on a press and count it in a rest
  `data-*`. The last two stand on a `--fab-bg-2` strip, the lowest ground the two unfilled roles
  are stated for. Every button's target is `display: flex`, as the spec asks of a companion.

  Each switch sits beside the visible label the companion draws, named by the same text through
  `ariaLabel`: `group` off and `hide` on, each also through `aria-labelledby`; `press` and `key`
  off, each flipping its own `on` on a press and counting it, `key` described by a visible hint;
  `long` a label that wraps beside the switch; `dangling` an `aria-labelledby` that names no
  element; and `card-on` and `card-off` on a `--fab-bg-2` strip. Each target is `display: flex`
  and `align-items: center`, as the spec asks.

  The ground is two 280px cells on `--fab-bg-1`, a ground both labels are stated for. It sets the
  azure tag ink, so an ink a notice or a button fails to state shows in the frame. A case
  addresses the ground by `data-lab-controls` and each notice's section by its `data-lab-control`
  key, the buttons' band by `data-lab-buttons` and each button's section by its `data-lab-button`
  key, and the switches' band by `data-lab-toggles` and each switch's section by its
  `data-lab-toggle` key.
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
    [
      'long',
      { children: 'Clear every one of the filters that are set on this board today' },
      'is-narrow',
    ],
    ['card-back', { role: 'ghost', children: 'Back to projects' }],
    ['card-add', { role: 'dashed', children: 'Add tier' }],
  ]);
  /** Where the buttons on the `--fab-bg-2` strip start. */
  const STRIP_FROM = BUTTONS.findIndex(([key]) => key === 'card-back');

  /**
   * Each switch's key in fixture order, its label, whether it starts on, and how it is named,
   * described and pressed.
   */
  const TOGGLES = Object.freeze([
    ['group', { label: 'Group by category', on: false, labelled: true }],
    ['hide', { label: 'Hidden tasks', on: true, labelled: true }],
    ['press', { label: 'Sort by name', on: false, flips: true }],
    [
      'key',
      {
        label: 'Essences in the list',
        on: false,
        flips: true,
        hint: 'Lists each essence under its component.',
      },
    ],
    [
      'long',
      {
        label: 'Recipes from every crafting system, the ones no player can craft yet included',
        on: true,
        labelled: true,
      },
    ],
    ['dangling', { label: 'Group by tag', on: false, dangling: true }],
    ['card-on', { label: 'Crafter notifications', on: true, labelled: true }],
    ['card-off', { label: 'Shared results', on: false, labelled: true }],
  ]);
  /** Where the switches on the `--fab-bg-2` strip start. */
  const TOGGLE_STRIP_FROM = TOGGLES.findIndex(([key]) => key === 'card-on');
  /** The ids of a switch's visible label and hint, which its `aria` keys name. */
  const labelId = (key) => `lab-toggle-${key}-label`;
  const hintId = (key) => `lab-toggle-${key}-hint`;

  /** What a press redraws a button as: its key, and the label it takes with its `presses`. */
  const PRESSED = Object.freeze({
    clear: () => 'Filters cleared',
    create: (presses) => `Projects: ${presses}`,
  });

  const targets = $state([]);
  const sections = $state([]);
  const buttonTargets = $state([]);
  const toggleTargets = $state([]);

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

  /** The aria keys one switch is mounted with: its label's id, a missing id, or its hint's. */
  function ariaOf(key, { labelled, dangling, hint }) {
    return {
      ...(labelled ? { 'aria-labelledby': labelId(key) } : {}),
      ...(dangling ? { 'aria-labelledby': `lab-toggle-${key}-missing` } : {}),
      ...(hint ? { 'aria-describedby': hintId(key) } : {}),
    };
  }

  function mountToggles(mount) {
    const handles = {};
    /** One switch's props at `on` after `presses` presses; a flipping one passes the other state. */
    const pressed = (key, given, on, presses) => ({
      on,
      ariaLabel: given.label,
      ...ariaOf(key, given),
      onclick: given.flips
        ? () => handles[key].update(pressed(key, given, !on, presses + 1))
        : ignore,
      'data-lab-presses': presses,
    });
    for (const [index, [key, given]] of TOGGLES.entries()) {
      handles[key] = mount('StatusToggle', {
        target: toggleTargets[index],
        props: pressed(key, given, given.on, 0),
      });
    }
    return Object.values(handles);
  }

  $effect(() => {
    if (NOTICES.some((_, index) => !targets[index])) return undefined;
    if (BUTTONS.some((_, index) => !buttonTargets[index])) return undefined;
    if (TOGGLES.some((_, index) => !toggleTargets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = [...mountNotices(mount), ...mountButtons(mount), ...mountToggles(mount)];
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

{#snippet toggleSection(index)}
  {@const [key, { label, hint, dangling }] = TOGGLES[index]}
  <section data-lab-toggle={key}>
    <div class="toggle-row">
      <span class="toggle-label" id={dangling ? undefined : labelId(key)}>{label}</span>
      <div class="toggle-target" bind:this={toggleTargets[index]}></div>
    </div>
    {#if hint}<p class="toggle-hint" id={hintId(key)}>{hint}</p>{/if}
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
  <div class="published-toggles-band" data-lab-toggles>
    {#each TOGGLES as [key], index (key)}
      {#if index < TOGGLE_STRIP_FROM}{@render toggleSection(index)}{/if}
    {/each}
    <div class="published-toggles-strip">
      {#each TOGGLES as [key], index (key)}
        {#if index >= TOGGLE_STRIP_FROM}{@render toggleSection(index)}{/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .published-controls-ground,
  .published-buttons-band,
  .published-buttons-strip,
  .published-toggles-band,
  .published-toggles-strip {
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
  .published-buttons-strip,
  .published-toggles-band,
  .published-toggles-strip {
    grid-column: span 2;
  }

  /* The strip's padding comes out of its two cells, so it stays as wide as the band. */
  .published-buttons-strip,
  .published-toggles-strip {
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

  .toggle-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    min-width: 0;
    color: var(--fab-text);
  }

  .toggle-target {
    display: flex;
    align-items: center;
  }

  .toggle-hint {
    margin: var(--fab-space-1) 0 0;
    color: var(--fab-text-muted);
  }
</style>
