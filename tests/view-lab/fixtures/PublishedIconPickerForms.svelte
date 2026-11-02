<!--
  A View Lab specimen, not a Fabricate surface (issues 2899, 2905). It mounts `IconPicker`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a caption of
  the companion's own: a faction card's art tile, drawn by the companion, beside an icon-only
  picker in a 64px column; the captioned picker in a 96px column, whose caption an ellipsis cuts;
  a captioned picker named by `ariaLabel` and its caption; and one whose `ariaLabel` already holds
  its caption. Each `onChange` passes the chosen glyph back in its own `update`. Every word
  is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-icon-picker-forms` only.

  The ground is a 340px column on `--fab-bg-2` that spaces its rows by 8px, padded past each
  trigger's ring. A case addresses the ground by `data-lab-icon-picker-forms`, a row by
  `data-lab-icon-picker-form` and a target by `data-lab-icon-picker-form-target`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const LABELS = Object.freeze({
    listLabel: 'Faction icons',
    searchLabel: 'Search faction icons',
    noMatchesText: 'No icon matches.',
  });
  const WAND = 'fas fa-wand-magic-sparkles';

  /** Each row's key, its caption, its target's width, and the picker's props but its callback. */
  const ROWS = Object.freeze([
    [
      'icon-only',
      'iconOnly, beside the art',
      64,
      { value: WAND, ariaLabel: 'Faction icon', iconOnly: true },
    ],
    ['narrow', 'Captioned, 96px', 96, { value: WAND, ariaLabel: 'Faction icon' }],
    [
      'captioned',
      'ariaLabel Reagent icon',
      200,
      { value: 'fas fa-flask', ariaLabel: 'Reagent icon' },
    ],
    [
      'holds',
      'ariaLabel holds Flask',
      200,
      { value: 'fas fa-flask', ariaLabel: 'Reagent icon: Flask' },
    ],
  ]);

  let targets = $state({});

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, , , props]) => {
      // The picker's own copy of its value, so the effect reads no other state.
      let { value } = props;
      const current = () => ({
        ...LABELS,
        ...props,
        value,
        onChange: (next) => {
          value = next;
          handle.update(current());
        },
      });
      const handle = mount('IconPicker', { target: targets[key], props: current() });
      return handle;
    });
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-icon-picker-forms-ground" data-lab-icon-picker-forms>
  {#each ROWS as [key, caption, width] (key)}
    <section data-lab-icon-picker-form={key}>
      {#if key === 'icon-only'}
        <span class="published-icon-picker-forms-art" aria-hidden="true">
          <i class={WAND}></i>
        </span>
      {/if}
      <div
        class="published-icon-picker-forms-target"
        style:width={`${width}px`}
        data-lab-icon-picker-form-target={key}
        bind:this={targets[key]}
      ></div>
      <span>{caption}</span>
    </section>
  {/each}
</div>

<style>
  .published-icon-picker-forms-ground {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-2);
    width: 340px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .published-icon-picker-forms-ground > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .published-icon-picker-forms-art {
    display: grid;
    flex: 0 0 96px;
    place-items: center;
    height: 96px;
    border-radius: 11px;
    color: var(--fab-accent);
    background: var(--fab-bg-1);
    font-size: 40px;
  }

  .published-icon-picker-forms-target {
    flex: 0 0 auto;
  }
</style>
