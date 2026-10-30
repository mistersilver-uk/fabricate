<!--
  A View Lab specimen, not a Fabricate surface (issue 2793). It mounts two `ListRow`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each with its `aside`
  content slot requested: a whole-row button whose aside holds the companion's one element, a line
  of text over a published `FillBar` at 64, and a read-only row whose aside holds a line of text.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it
  for `?specimen=published-list-rows` only.

  The ground is one 320px column on `--fab-bg-2` that spaces its sections by 8px. A case addresses
  the ground by `data-lab-list-row-ground`, a section by `data-lab-list-row` and the companion's
  element in an aside by `data-lab-list-row-aside`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's row, by its key, and the line its aside holds. */
  const ROWS = Object.freeze([
    [
      'open',
      { name: 'Moonpetal tincture', detail: 'Stage 2 of 3', onOpen() {}, aside: true },
      'Due at dusk, Mira Voss tending',
    ],
    ['still', { name: 'Ember salt reserve', quantity: 3, aside: true }, 'Restocked by the caravan'],
  ]);

  let targets = $state({});

  /** The companion's one element in `slot`: a column holding `text`, which lays out the aside. */
  function drawAside(slot, text) {
    const element = slot.ownerDocument.createElement('div');
    element.setAttribute('data-lab-list-row-aside', '');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.gap = '4px';
    const line = slot.ownerDocument.createElement('span');
    line.textContent = text;
    element.append(line);
    slot.append(element);
    return element;
  }

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, props]) => mount('ListRow', { target: targets[key], props }));
    const elements = ROWS.map(([, , text], index) => drawAside(handles[index].slot('aside'), text));
    const barTarget = elements[0].ownerDocument.createElement('div');
    elements[0].append(barTarget);
    const bar = mount('FillBar', { target: barTarget, props: { value: 64 } });
    return () => {
      bar.destroy();
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-list-rows-ground" data-lab-list-row-ground>
  {#each ROWS as [key] (key)}
    <section data-lab-list-row={key}>
      <div bind:this={targets[key]}></div>
    </section>
  {/each}
</div>

<style>
  .published-list-rows-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
