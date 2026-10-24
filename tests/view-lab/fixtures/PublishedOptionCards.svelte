<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts one `RadioCardGroup`
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does: a tool's
  breakage choice of three cards, Breakable, Immune, and Limited uses disabled with its reason. Its
  `onChange` passes the chosen value back in its own `update`, before it returns, and writes that
  value on the ground's `data-lab-option-cards-chosen`, which nothing else writes. Every word is a
  companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-option-cards` only.

  The ground is one 420px column on `--fab-bg-2`; the group's target is a plain block. A case
  addresses the ground by `data-lab-option-cards` and the group's target by
  `data-lab-option-cards-target`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** The three options, in order; the case reaches them by value. */
  const OPTIONS = Object.freeze([
    {
      value: 'breakable',
      label: 'Breakable',
      description: 'The check may break it.',
      icon: 'fas fa-hammer',
    },
    {
      value: 'immune',
      label: 'Immune',
      description: 'It never breaks.',
      icon: 'fas fa-lock',
    },
    { value: 'limited', label: 'Limited uses', icon: 'fas fa-hourglass-half' },
  ]);

  let target = $state(null);
  let chosen = $state(undefined);

  $effect(() => {
    if (!target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    // The group's own copy of the choice, so the effect reads no state and never remounts it.
    let value = 'breakable';
    const props = () => ({
      options: OPTIONS,
      value,
      legend: 'When the tool breaks',
      disabledOptions: [{ value: 'limited', reason: 'Coming soon' }],
      onChange: (next) => {
        value = next;
        group.update(props());
        chosen = next;
      },
    });
    const group = mount('RadioCardGroup', { target, props: props() });
    return () => group.destroy();
  });
</script>

<div
  class="published-option-cards-ground"
  data-lab-option-cards
  data-lab-option-cards-chosen={chosen}
>
  <div bind:this={target} data-lab-option-cards-target></div>
</div>

<style>
  .published-option-cards-ground {
    box-sizing: border-box;
    width: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
