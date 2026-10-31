<!--
  A View Lab specimen, not a Fabricate surface (issue 2841). It mounts the forms issue 2841 publishes
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a
  caption of the companion's own: progress tiles, a `StatBox` whose `children` slot holds a thin
  `FillBar`, at the start and default layouts and the success tone, a danger tile, and a tile
  without the slot; a `Stepper` at the dense `size` `26` beside one at the default rung; a card's
  actions as `Button`s in the `accent` and `urgent` roles beside the `ghost` baseline, each at rest,
  for the pointer and the keyboard, disabled and busy; a negative specimen of an urgent button
  beside a pressed toggle, which the contract forbids in one view; and `IconPicker`s tinted ember,
  mauve and slate beside an untinted one. Every word is a companion's final text, so none is
  localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-companion-forms` only.

  The ground is two 340px columns on `--fab-bg-2`, a companion's card, that space their rows by
  8px; each row's target is 140px wide, a companion's tile. A case addresses the ground by
  `data-lab-companion-forms` and a row by `data-lab-companion-form`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const TILE = Object.freeze({ value: '42%', label: 'Progress', layout: 'start' });
  const track = (value, tone) => ['FillBar', { value, density: 'thin', tone }];
  const QUANTITY = Object.freeze({
    value: 3,
    min: 1,
    ariaLabel: 'How many moonpetals',
    decrementLabel: 'Fewer moonpetals',
    incrementLabel: 'More moonpetals',
    onChange() {},
  });
  const ACTION = Object.freeze({ children: 'Advance', icon: 'fas fa-forward-step', onclick() {} });
  const ACCENT = Object.freeze({ ...ACTION, role: 'accent' });
  const URGENT = Object.freeze({ ...ACTION, role: 'urgent', icon: 'fas fa-bell' });
  const PICKER = Object.freeze({
    value: 'fas fa-leaf',
    onChange() {},
    ariaLabel: 'Activity icon',
    listLabel: 'Activity icons',
    searchLabel: 'Search activity icons',
    noMatchesText: 'No icon matches.',
  });

  /**
   * Each row's key, its caption, the entry it mounts, the props it takes, and the entry and props
   * mounted in its `children` slot, if any.
   */
  const ROWS = Object.freeze([
    [
      'stat-progress',
      'StatBox start, a thin FillBar in children',
      'StatBox',
      { ...TILE, children: true },
      track(42, 'accent'),
    ],
    [
      'stat-complete',
      'StatBox success, a thin FillBar in children',
      'StatBox',
      { ...TILE, value: '100%', tone: 'success', children: true },
      track(100, 'success'),
    ],
    [
      'stat-centred',
      'StatBox default, a thin FillBar in children',
      'StatBox',
      { value: '3 of 5', label: 'Stages done', children: true },
      track(60, 'accent'),
    ],
    [
      'stat-danger',
      'StatBox danger, its label secondary',
      'StatBox',
      { value: '2', label: 'Missing', layout: 'start', tone: 'danger', note: 'Two reagents short' },
    ],
    ['stat-plain', 'StatBox start, no children', 'StatBox', TILE],
    ['stepper-dense', 'Stepper size 26', 'Stepper', { ...QUANTITY, size: 26 }],
    ['stepper-default', 'Stepper, the default rung', 'Stepper', QUANTITY],
    ['button-ghost', "Button role 'ghost'", 'Button', { ...ACTION, role: 'ghost' }],
    ['button-accent', "Button role 'accent'", 'Button', ACCENT],
    ['button-accent-hover', "Button role 'accent', for the pointer", 'Button', ACCENT],
    ['button-accent-disabled', "'accent', disabled", 'Button', { ...ACCENT, disabled: true }],
    ['button-accent-busy', "'accent', busy", 'Button', { ...ACCENT, busy: true }],
    ['button-urgent', "Button role 'urgent'", 'Button', URGENT],
    ['button-urgent-hover', "Button role 'urgent', for the pointer", 'Button', URGENT],
    ['button-urgent-disabled', "'urgent', disabled", 'Button', { ...URGENT, disabled: true }],
    ['button-urgent-busy', "'urgent', busy", 'Button', { ...URGENT, busy: true }],
    ['hazard-urgent', 'Never in one view: urgent…', 'Button', URGENT],
    [
      'hazard-pressed',
      '…and a pressed toggle draw alike',
      'Button',
      { children: 'Show the reward', pressed: true, onclick() {} },
    ],
    ['icon-ember', "IconPicker tint 'ember'", 'IconPicker', { ...PICKER, tint: 'ember' }],
    ['icon-mauve', "IconPicker tint 'mauve'", 'IconPicker', { ...PICKER, tint: 'mauve' }],
    ['icon-slate', "IconPicker tint 'slate'", 'IconPicker', { ...PICKER, tint: 'slate' }],
    ['icon-plain', 'IconPicker, no tint', 'IconPicker', PICKER],
  ]);

  let targets = $state({});

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.flatMap(([key, , name, props, inner]) => {
      const handle = mount(name, { target: targets[key], props });
      if (!inner) return [handle];
      const place = handle.slot('children').ownerDocument.createElement('div');
      handle.slot('children').append(place);
      return [mount(inner[0], { target: place, props: inner[1] }), handle];
    });
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-companion-forms-ground" data-lab-companion-forms>
  {#each ROWS as [key, caption] (key)}
    <section data-lab-companion-form={key}>
      <div class="published-companion-forms-target" bind:this={targets[key]}></div>
      <span>{caption}</span>
    </section>
  {/each}
</div>

<style>
  .published-companion-forms-ground {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, 340px);
    gap: var(--fab-space-2);
    width: 712px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .published-companion-forms-ground > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .published-companion-forms-target {
    flex: 0 0 140px;
    width: 140px;
  }
</style>
