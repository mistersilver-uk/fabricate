<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts one `InspectorCard` through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, then in the card's
  content slot a `Kicker` heading it and a labelled `Well`, and fills the well's content slot with
  one element of the companion's own: a flex column that spaces a line of text and a published
  `Chip`. Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js`
  mounts it for `?specimen=published-well` only.

  The ground is one 320px column on `--fab-bg-1`. A case addresses the ground by
  `data-lab-well-ground` and the companion's element by `data-lab-well-content`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  let target = $state();

  /** A `div` appended to `slot`, for a mount target there. */
  function placeIn(slot) {
    const element = slot.ownerDocument.createElement('div');
    slot.append(element);
    return element;
  }

  /** The companion's one element in the well's slot, spacing a line and a chip's target. */
  function drawContent(slot) {
    const doc = slot.ownerDocument;
    const content = doc.createElement('div');
    content.setAttribute('data-lab-well-content', '');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '8px';
    const line = doc.createElement('p');
    line.style.margin = '0';
    line.textContent = 'Moonpetal, silverleaf and ember salt';
    const chip = doc.createElement('span');
    chip.style.display = 'flex';
    content.append(line, chip);
    slot.append(content);
    return chip;
  }

  $effect(() => {
    if (!target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const card = mount('InspectorCard', { target, props: { children: true } });
    const cardSlot = card.slot('children');
    mount('Kicker', { target: placeIn(cardSlot), props: { as: 'h3', children: 'Moonlit tonic' } });
    const well = mount('Well', {
      target: placeIn(cardSlot),
      props: { label: 'Chosen reagents', children: true },
    });
    mount('Chip', {
      target: drawContent(well.slot('children')),
      props: { children: 'Ready', tone: 'positive' },
    });
    return () => card.destroy();
  });
</script>

<div class="published-well-ground" data-lab-well-ground>
  <div bind:this={target}></div>
</div>

<style>
  .published-well-ground {
    box-sizing: border-box;
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
