<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts one `RadioCardGroup`
  through the page-session seam `game.fabricate.api.ui` binds, as a companion does: a tool's
  breakage choice of three cards, Breakable (with an example line and an accent Default badge),
  Immune, and Limited uses disabled with its reason. Its
  `onChange` passes the chosen value back in its own `update`, before it returns, and writes that
  value on the ground's `data-lab-option-cards-chosen`, which nothing else writes. Every word is a
  companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-option-cards` only. A second group beneath it mounts the same options with
  `activation: 'manual'` (issue 2889), echoing its choice on `data-lab-option-cards-manual-chosen`.

  Each ground is one 420px column on `--fab-bg-2`; a group's target is a plain block. A case
  addresses the automatic ground by `data-lab-option-cards` and its target by
  `data-lab-option-cards-target`, and the manual ones by `data-lab-option-cards-manual` and
  `data-lab-option-cards-manual-target`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** The three options, in order; the case reaches them by value. */
  const OPTIONS = Object.freeze([
    {
      value: 'breakable',
      label: 'Breakable',
      description: 'The check may break it.',
      example: 'A failed check can snap the blade.',
      badge: { label: 'Default', tone: 'accent' },
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
  let manualTarget = $state(null);
  let chosen = $state(undefined);
  let manualChosen = $state(undefined);

  /** Mounts one group on `into` with `extra` props, telling `echo` of each choice. */
  function mountGroup(into, extra, echo) {
    const { mount } = publishedComponentSeam.publicApi;
    // The group's own copy of the choice, so the effect reads no state and never remounts it.
    let value = 'breakable';
    const props = () => ({
      options: OPTIONS,
      value,
      legend: 'When the tool breaks',
      disabledOptions: [{ value: 'limited', reason: 'Coming soon' }],
      ...extra,
      onChange: (next) => {
        value = next;
        group.update(props());
        echo(next);
      },
    });
    const group = mount('RadioCardGroup', { target: into, props: props() });
    return () => group.destroy();
  }

  $effect(() => {
    if (!target) return undefined;
    return mountGroup(target, {}, (next) => {
      chosen = next;
    });
  });

  $effect(() => {
    if (!manualTarget) return undefined;
    return mountGroup(manualTarget, { activation: 'manual' }, (next) => {
      manualChosen = next;
    });
  });
</script>

<div
  class="published-option-cards-ground"
  data-lab-option-cards
  data-lab-option-cards-chosen={chosen}
>
  <div bind:this={target} data-lab-option-cards-target></div>
</div>
<div
  class="published-option-cards-ground"
  data-lab-option-cards-manual
  data-lab-option-cards-manual-chosen={manualChosen}
>
  <div bind:this={manualTarget} data-lab-option-cards-manual-target></div>
</div>

<style>
  .published-option-cards-ground {
    box-sizing: border-box;
    width: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .published-option-cards-ground + .published-option-cards-ground {
    margin-top: var(--fab-space-3);
  }
</style>
