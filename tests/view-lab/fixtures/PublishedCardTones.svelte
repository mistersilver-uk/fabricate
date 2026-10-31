<!--
  A View Lab specimen, not a Fabricate surface (issue 2854). It mounts seven `InspectorCard`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does: an untoned card and one
  per published `tone`, each headed by a `title` and a `note` between a `Medallion` in its leading
  slot and a `Button` in its trailing slot, a narrow toned card whose trailing slot wraps, and an
  untoned card holding an accent `Well`. Every word is a companion's final text, so none is
  localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-card-tones`.

  The ground is one 320px column on `--fab-bg-1`. A case addresses the ground by
  `data-lab-card-tones` and each section by its `data-lab-card-tone` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's key, its card's tone, title, note and tile glyph, and its width. */
  const CARDS = Object.freeze([
    ['plain', '', 'Activity limits', 'How many activities a character may run.', 'fas fa-gauge'],
    ['warning', 'warning', 'Over the limit', 'Three running; the limit is two.', 'fas fa-gauge'],
    ['success', 'success', 'Ready to finish', 'Every stage is complete.', 'fas fa-flag-checkered'],
    ['accent', 'accent', 'Chosen route', 'This route runs next.', 'fas fa-route'],
    ['info', 'info', 'Check due', 'Roll Smithing before the next tick.', 'fas fa-dice-d20'],
    ['narrow', 'warning', 'Over the limit', 'Three running.', 'fas fa-gauge'],
  ]);

  const targets = $state([]);
  let wellTarget = $state();

  /** A `span` appended to `slot`, for a mount target there. */
  function placeIn(slot) {
    const element = slot.ownerDocument.createElement('span');
    element.style.display = 'flex';
    slot.append(element);
    return element;
  }

  /** The card's body line, in the secondary ink a toned fill needs. */
  function drawBody(slot, text) {
    const line = slot.ownerDocument.createElement('p');
    line.style.margin = '0';
    line.style.color = 'var(--fab-text-secondary)';
    line.textContent = text;
    slot.append(line);
  }

  $effect(() => {
    if (CARDS.some((_, index) => !targets[index]) || !wellTarget) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const cards = CARDS.map(([, tone, title, note, icon], index) => {
      const card = mount('InspectorCard', {
        target: targets[index],
        props: { tone, title, note, leading: true, trailing: true, children: true },
      });
      mount('Medallion', {
        target: placeIn(card.slot('leading')),
        props: { size: 34, icon, tone },
      });
      mount('Button', {
        target: placeIn(card.slot('trailing')),
        props: { children: 'Manage', size: '28', onclick: () => {} },
      });
      drawBody(card.slot('children'), 'Two crafters assigned.');
      return card;
    });
    const holder = mount('InspectorCard', {
      target: wellTarget,
      props: { title: 'Standing rules', children: true },
    });
    const wellPlace = holder.slot('children').ownerDocument.createElement('div');
    holder.slot('children').append(wellPlace);
    const well = mount('Well', { target: wellPlace, props: { tone: 'accent', children: true } });
    drawBody(well.slot('children'), 'Catch up missed ticks: on.');
    return () => {
      for (const card of [...cards, holder]) card.destroy();
    };
  });
</script>

<div class="published-card-tones-ground" data-lab-card-tones>
  {#each CARDS as [key], index (key)}
    <section data-lab-card-tone={key} class:is-narrow={key === 'narrow'}>
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
  <section data-lab-card-tone="well">
    <div bind:this={wellTarget}></div>
  </section>
</div>

<style>
  .published-card-tones-ground {
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
