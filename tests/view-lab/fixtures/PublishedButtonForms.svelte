<!--
  A View Lab specimen, not a Fabricate surface (issue 2853). It mounts `Button`s and `IconButton`s
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a
  caption of the companion's own: a button at the 24px and 26px rungs and an icon button at the
  20px and 22px rungs.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts
  it for `?specimen=published-button-forms` only.

  The ground is one 360px column on `--fab-bg-1` that spaces its rows by 8px; each row's target is
  `display: flex`, as the spec asks of a companion. A case addresses the ground by
  `data-lab-button-forms` and a row by `data-lab-button-form`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key, its caption, the entry it mounts and the props it takes beside `onclick`. */
  const ROWS = Object.freeze([
    ['button-24', "Button size '24'", 'Button', { children: 'Add tier', size: '24' }],
    ['button-26', "Button size '26'", 'Button', { children: 'Claim', size: '26' }],
    [
      'icon-20',
      "IconButton size '20'",
      'IconButton',
      { icon: 'fas fa-xmark', ariaLabel: 'Dismiss the entry', size: '20' },
    ],
    [
      'icon-22',
      "IconButton size '22'",
      'IconButton',
      { icon: 'fas fa-plus', ariaLabel: 'Credit a day to Mira', size: '22' },
    ],
  ]);

  let targets = $state({});

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, , name, props]) =>
      mount(name, { target: targets[key], props: { ...props, onclick() {} } })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-button-forms-ground" data-lab-button-forms>
  {#each ROWS as [key, caption] (key)}
    <section data-lab-button-form={key}>
      <div class="published-button-forms-target" bind:this={targets[key]}></div>
      <span>{caption}</span>
    </section>
  {/each}
</div>

<style>
  .published-button-forms-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-button-forms-ground > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .published-button-forms-target {
    display: flex;
  }
</style>
