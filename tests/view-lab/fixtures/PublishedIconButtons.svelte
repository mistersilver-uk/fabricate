<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts ten `IconButton`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, each named by its
  `ariaLabel` and each beside a caption of the companion's own: one per published role at the
  default rung, a second ghost-danger that nothing focuses, the two compact rungs, a disabled one, and a disclosure whose `onclick` shows the
  notes region the companion draws beneath it and passes `aria-expanded` in its own `update`.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts
  it for `?specimen=published-icon-buttons` only; each button's tree takes the tooltip facade the
  published runtime's `mount` hands it, so keyboard focus reaches the lab's `game.tooltip`.

  The ground is one 360px column on `--fab-bg-1` that spaces its rows by 8px; each row's target is
  `display: flex`, as the spec asks of a companion. A case addresses the ground by
  `data-lab-icon-buttons`, a row by `data-lab-icon-button` and the notes region by
  `data-lab-icon-notes`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key, its caption, and the props its icon button takes beside `onclick`. */
  const ROWS = Object.freeze([
    ['neutral', 'neutral', { icon: 'fas fa-pen', ariaLabel: 'Rename Iron ingot' }],
    [
      'primary',
      'primary',
      { icon: 'fas fa-check', ariaLabel: 'Confirm the batch', role: 'primary' },
    ],
    [
      'ghost',
      'ghost',
      { icon: 'fas fa-ellipsis', ariaLabel: 'More actions for Iron ingot', role: 'ghost' },
    ],
    ['danger', 'danger', { icon: 'fas fa-trash', ariaLabel: 'Delete Iron ingot', role: 'danger' }],
    [
      'ghost-danger',
      'ghost-danger',
      { icon: 'fas fa-xmark', ariaLabel: 'Remove Ember salt', role: 'ghost-danger' },
    ],
    [
      'ghost-danger-rest',
      'ghost-danger, unfocused',
      { icon: 'fas fa-xmark', ariaLabel: 'Remove Cinder salt', role: 'ghost-danger' },
    ],
    ['size-24', "size '24'", { icon: 'fas fa-xmark', ariaLabel: 'Dismiss the hint', size: '24' }],
    ['size-26', "size '26'", { icon: 'fas fa-xmark', ariaLabel: 'Close the notes', size: '26' }],
    [
      'disabled',
      'disabled',
      { icon: 'fas fa-arrow-up', ariaLabel: 'Move Iron ingot up', disabled: true },
    ],
  ]);

  /** The disclosure's props, its `aria-expanded` given by whether the notes are shown. */
  const disclosure = (open, onclick) => ({
    icon: 'fas fa-chevron-down',
    ariaLabel: 'Batch notes',
    'aria-expanded': open,
    onclick,
  });

  let targets = $state({});
  let open = $state(false);

  $effect(() => {
    if ([...ROWS.map(([key]) => key), 'expand'].some((key) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, , props]) =>
      mount('IconButton', { target: targets[key], props: { ...props, onclick() {} } })
    );
    const toggle = () => {
      open = !open;
      expand.update(disclosure(open, toggle));
    };
    const expand = mount('IconButton', {
      target: targets.expand,
      props: disclosure(false, toggle),
    });
    return () => {
      expand.destroy();
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-icon-buttons-ground" data-lab-icon-buttons>
  {#each ROWS as [key, caption] (key)}
    <section data-lab-icon-button={key}>
      <div class="published-icon-buttons-target" bind:this={targets[key]}></div>
      <span>{caption}</span>
    </section>
  {/each}
  <section data-lab-icon-button="expand">
    <div class="published-icon-buttons-target" bind:this={targets.expand}></div>
    <span>aria-expanded</span>
  </section>
  <p data-lab-icon-notes hidden={!open}>Quench each ingot before the next pour.</p>
</div>

<style>
  .published-icon-buttons-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-icon-buttons-ground > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .published-icon-buttons-target {
    display: flex;
  }

  .published-icon-buttons-ground > p {
    margin: 0;
  }
</style>
