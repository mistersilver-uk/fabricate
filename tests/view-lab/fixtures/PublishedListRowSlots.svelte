<!--
  A View Lab specimen, not a Fabricate surface (issue 2843). It mounts three `ListRow`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each with content slots
  requested: a whole-row button holding all four, a published `Medallion` in `leading`, a `Chip`
  in `badges`, a line of text in `meta` and an icon-only `IconButton` in `trailing`; a read-only row
  with a `Chip` in `badges` and an `IconButton` in `trailing`, which the badges put in the selectable
  form; and a read-only row requesting `trailing` alone, which draws the `IconButton` bare.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts
  it for `?specimen=published-list-row-slots` only.

  The ground is one 320px column on `--fab-bg-2` that spaces its sections by 8px. A case addresses
  the ground by `data-lab-list-row-slots`, a section by `data-lab-list-row` and the text a companion
  draws in `meta` by `data-lab-list-row-meta`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's row props, by its key, and the slots it fills. */
  const ROWS = Object.freeze([
    [
      'open',
      {
        name: 'Moonpetal tincture',
        detail: 'Stage 2 of 3',
        onOpen() {},
        leading: true,
        badges: true,
        meta: true,
        trailing: true,
      },
    ],
    ['still', { name: 'Ember salt reserve', quantity: 3, badges: true, trailing: true }],
    ['bare', { name: 'Cinder salt reserve', trailing: true }],
  ]);

  let targets = $state({});

  /** A flex `<span>` the companion appends to `slot`, as a mount target for a published component. */
  function targetIn(slot, hook) {
    const target = slot.ownerDocument.createElement('span');
    target.style.display = 'flex';
    if (hook) target.setAttribute(hook, '');
    slot.append(target);
    return target;
  }

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, props]) => mount('ListRow', { target: targets[key], props }));
    const [open, still, bare] = handles;
    const mounted = [];
    const into = (handle, key, name, props, hook) =>
      mounted.push(mount(name, { target: targetIn(handle.slot(key), hook), props }));
    const edit = (label) => ({ icon: 'fas fa-pen', ariaLabel: label, size: '24', onclick() {} });
    into(open, 'leading', 'Medallion', { icon: 'fas fa-flask', size: 30 });
    into(open, 'badges', 'Chip', { children: 'Fresh', tone: 'positive' });
    const note = open.slot('meta').ownerDocument.createElement('span');
    note.setAttribute('data-lab-list-row-meta', '');
    note.textContent = 'Due at dusk, Mira Voss tending';
    open.slot('meta').append(note);
    into(open, 'trailing', 'IconButton', edit('Rename Moonpetal tincture'));
    into(still, 'badges', 'Chip', { children: 'Low stock' });
    into(still, 'trailing', 'IconButton', edit('Rename Ember salt reserve'));
    into(
      bare,
      'trailing',
      'IconButton',
      edit('Rename Cinder salt reserve'),
      'data-lab-list-row-trailing'
    );
    return () => {
      for (const handle of [...mounted, ...handles]) handle.destroy();
    };
  });
</script>

<div class="published-list-row-slots-ground" data-lab-list-row-slots>
  {#each ROWS as [key] (key)}
    <section data-lab-list-row={key}>
      <div bind:this={targets[key]}></div>
    </section>
  {/each}
</div>

<style>
  .published-list-row-slots-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
