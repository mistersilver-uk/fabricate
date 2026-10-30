<!--
  A View Lab specimen, not a Fabricate surface (issue 2448). It mounts the seven data-only leaves,
  then `Kicker`, `Chip`, `Rail`, `InspectorCard`, `EmptyState` and `Notice` (issue 2451), a
  `Button` in each empty panel (issue 2452), a read-only and a selected `ListRow` (issue 2784), and
  a truncated `Chip` in a one-track cell (issue 2817), through the page-session seam
  `game.fabricate.api.ui` binds, as a companion does: one mount per section, each into an element
  it owns. A mount's third member lists the mounts made inside its `children`
  content slot, each into a `div` the fixture appends there. The effect's teardown destroys the
  outer handles only, so the seam ends the nested ones. It keeps the Promise `load(['Rail'])`
  returned and mounts once that has settled, as a companion does, because `Rail` is lazy (issue
  2455); `tests/view-lab/mount.js` awaits the same `loaded` before the frame is measured. Every
  word is a companion's final text, so none is localized, and the art is the lab world's own, so
  `tests/view-lab-fixture-assets.test.js` resolves it. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-leaves` only.

  The ground is three 280px cells of three 88px tracks: a tile, a stat box or a chip takes one track
  and every other mount a whole cell. An inline mark's target is `display: flex`, as the spec asks
  of a companion, stated inline on a nested target, which this file's scoped rule does not reach.
  It sets the danger ink, so an ink a leaf fails to state shows in the frame, and the card's, the
  panels' and the notice's cells take the downtime target's `--fab-bg-1` ground, so a card that
  drew no fill shows too. The case's `expectContained` addresses each section by its position in
  `MOUNTS`, and each nested mount by its host and its `data-nested` name. Each empty panel's
  content slot holds its way out, a published button that hugs its label in a `display: flex`
  target.
-->
<script module>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  export const loaded = publishedComponentSeam.publicApi.load(['Rail']);
</script>

<script>
  import { TAG_TONES as TAGS } from '../../fixtures/published-components/fillBarTones.js';
  import { LAB_SYSTEM_IDS, buildLabContent } from '../world/labContent.js';

  const smithing = buildLabContent().systems.find(({ id }) => id === LAB_SYSTEM_IDS.SMITHING);
  const artOf = (componentId) => smithing.components.find(({ id }) => id === componentId).img;

  const INLINE = new Set(['Avatar', 'Medallion', 'Chip']);
  const ONE_TRACK = new Set([...INLINE, 'StatBox']);
  // A `Kicker` is an inline mark only when it is drawn as `span`, and a `Button`'s target is laid
  // out as one though it takes a whole cell.
  const isInline = (name, props) => INLINE.has(name) || name === 'Button' || props.as === 'span';

  function ignore() {}

  const MOUNTS = Object.freeze([
    ['Avatar', { art: smithing.img, name: 'Karrun Forge', alt: '' }],
    ['Avatar', { name: 'Mira Voss' }],
    ['Avatar', { name: 'Ironvale Caravan', shape: 'square', tint: 'azure' }],
    ['Medallion', { art: artOf('sm-ruby'), size: 38, alt: '' }],
    ['Medallion', { size: 26, glyph: 11, icon: 'fas fa-hammer' }],
    ['Medallion', { size: 22, glyph: 10, icon: 'fas fa-gem', tint: 'rose' }],
    ['Medallion', { size: 30, glyph: 12, icon: 'fas fa-skull', tone: 'danger' }],
    ['Medallion', { size: 22, glyph: 10, icon: 'fas fa-coins', tone: 'warning' }],
    ['Medallion', { size: 22, glyph: 10, icon: 'fas fa-scroll', ink: 'info' }],
    ['FillBar', { value: 0 }],
    ['FillBar', { value: 64 }],
    ['FillBar', { value: 100, density: 'compact' }],
    ['FillBar', { value: 100, shares: TAGS.map((tone) => ({ weight: 1, tone })) }],
    ['Meter', { value: 3, max: 11, label: 'Labourers', valueText: '3 of 11 labourers' }],
    [
      'Meter',
      {
        value: 10,
        max: 10,
        label: 'Contributors',
        segments: TAGS.map((tone) => ({ value: 1, tone })),
      },
    ],
    ['BandedBar', { rows: [{ name: 'Event chance', percent: 62 }] }],
    [
      'BandedBar',
      {
        rows: [
          { id: 'flawless', name: 'Flawless masterwork', percent: 12 },
          { id: 'sound', name: 'Sound', percent: 100 },
          { id: 'flawed', name: 'Flawed', percent: 40 },
        ],
      },
    ],
    ['StatBox', { value: '12', label: 'Runs', icon: 'fas fa-hourglass-half' }],
    ['StatBox', { value: '3', label: 'Failed', tone: 'danger' }],
    ['StatBox', { value: '48', label: 'Hours remaining' }],
    [
      'StatBox',
      { value: '3 of 5', label: 'Stages done', layout: 'start', note: 'Two to go to finish' },
    ],
    ['StatBox', { value: '12 days', label: 'Duration', layout: 'start', tone: 'info' }],
    ['StatBox', { value: '5 of 5', label: 'Stages done', tone: 'success' }],
    [
      'InfoStrip',
      {
        label: 'Conditions',
        badge: { label: 'Stable', tone: 'info' },
        facts: [
          { icon: 'fas fa-cloud-sun', label: 'Weather', value: 'Clear' },
          { icon: 'fas fa-clock', value: 'Dusk' },
          {
            icon: 'fas fa-mountain',
            label: 'Realm',
            value: 'The third gallery of the Karrun deeps, beyond the flooded shaft',
          },
        ],
      },
    ],
    ['Kicker', { children: 'Standing with the Ironvale Caravan and every guild it supplies' }],
    ['Kicker', { as: 'h3', tone: 'accent', children: 'Guild standing' }],
    ['Kicker', { as: 'span', children: 'Renown' }],
    ['Kicker', { size: '8', children: 'Stage' }],
    ['Kicker', { size: '9', children: 'Objectives' }],
    ['Chip', { tone: 'warning', density: 'list', children: 'Preview' }],
    ['Chip', { tone: 'neutral', density: 'list', children: 'Locked' }],
    ['Chip', { children: 'Awaiting the guild master' }],
    [
      'Rail',
      { label: 'Standing', children: true },
      [
        ['Meter', { value: 2, max: 5, label: 'Favour' }],
        ['InfoStrip', { label: 'Terms', facts: [{ value: 'Fair' }] }],
      ],
    ],
    [
      'InspectorCard',
      { children: true },
      [
        ['Kicker', { children: 'Renown' }],
        ['StatBox', { value: '7', label: 'Seals' }],
      ],
    ],
    [
      'EmptyState',
      {
        icon: 'fas fa-box-open',
        title: 'No projects yet',
        hint: 'Projects the party starts in downtime are listed here.',
        children: true,
      },
      [['Button', { role: 'primary', children: 'New project', onclick: ignore }]],
    ],
    [
      'Notice',
      {
        tone: 'warning',
        title: 'Over the project limit',
        detail: 'Finish or abandon a project before the caravan takes on another.',
      },
    ],
    [
      'EmptyState',
      { filtered: true, hint: 'No projects match these filters.', children: true },
      [['Button', { children: 'Clear filters', onclick: ignore }]],
    ],
    ['ListRow', { name: 'Iron ingot', detail: 'Metal', quantity: 3, art: artOf('sm-iron-ingot') }],
    ['ListRow', { name: 'Silver ore', detail: 'Ore', quantity: 1, selected: true, onOpen: ignore }],
    [
      'Chip',
      {
        tone: 'info',
        density: 'list',
        icon: 'fas fa-lock',
        truncate: true,
        children: 'Awaiting the guild master and the whole caravan',
      },
    ],
  ]);

  const targets = $state([]);
  const { mount } = publishedComponentSeam.publicApi;
  let ready = $state(false);
  loaded.then(() => {
    ready = true;
  });

  $effect(() => {
    if (!ready || MOUNTS.some((_, index) => !targets[index])) return undefined;
    const handles = MOUNTS.map(([name, props, nested = []], index) => {
      const handle = mount(name, { target: targets[index], props });
      for (const [nestedName, nestedProps] of nested) {
        const target = targets[index].ownerDocument.createElement('div');
        target.dataset.nested = nestedName;
        if (isInline(nestedName, nestedProps)) target.style.display = 'flex';
        handle.slot('children').append(target);
        mount(nestedName, { target, props: nestedProps });
      }
      return handle;
    });
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-leaves-ground">
  {#each MOUNTS as [name, props], index (index)}
    <section
      data-published={name}
      class:is-one-track={ONE_TRACK.has(name)}
      class:is-inline={isInline(name, props)}
    >
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-leaves-ground {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(9, 88px);
    gap: var(--fab-space-2);
    align-items: start;
    width: max-content;
    padding: var(--fab-space-3);
    color: var(--fab-danger);
    background: var(--fab-bg-2);
  }

  section {
    grid-column: span 3;
    min-width: 0;
  }

  section.is-one-track {
    grid-column: span 1;
  }

  section.is-inline > div {
    display: flex;
  }

  section[data-published='InspectorCard'],
  section[data-published='EmptyState'],
  section[data-published='Notice'] {
    padding: var(--fab-space-2);
    background: var(--fab-bg-1);
  }
</style>
