<!--
  A View Lab specimen, not a Fabricate surface. It mounts four `ListRow`s through the page-session
  seam `game.fabricate.api.ui` binds, as a companion does: a whole-row button holding three
  published `IconButton`s in `trailing`, each named for the row's item; a read-only positive row
  whose state word is a published positive `Chip` in `badges`; a read-only danger row whose state
  word is its `detail`; and an accent row whose state word is its `detail`, with a published accent
  `Button` in `trailing`. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-list-row-tones` only.

  The ground is one 360px column on `--fab-bg-2` that spaces its sections by 8px. A case addresses
  the ground by `data-lab-list-row-tones`, a section by `data-lab-list-row-tone` and each mount
  target it fills a slot with by `data-lab-list-row-fill`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's row props, by its key; `OPENS` names the rows that take an `onOpen`. */
  const ROWS = Object.freeze([
    ['controls', { name: 'Ember Court', detail: 'Trusted', trailing: true }],
    ['claimed', { name: 'Signet of the Ember Court', tone: 'positive', badges: true }],
    ['declined', { name: 'Forge-warden’s writ', detail: 'Turned down', tone: 'danger' }],
    ['offer', { name: '50 gp', detail: 'Ready to claim', tone: 'accent', trailing: true }],
  ]);
  const OPENS = Object.freeze(['controls', 'offer']);
  /**
   * Each published component a row's slot holds, in mount order: the row's key, the slot, the
   * `data-lab-list-row-fill` hook on its mount target, the component and its props; a `Button` or
   * `IconButton` also takes an `onclick`.
   */
  const FILLS = Object.freeze([
    [
      'controls',
      'trailing',
      'lower',
      'IconButton',
      { icon: 'fas fa-minus', ariaLabel: 'Lower Ember Court standing', size: '24' },
    ],
    [
      'controls',
      'trailing',
      'raise',
      'IconButton',
      { icon: 'fas fa-plus', ariaLabel: 'Raise Ember Court standing', size: '24' },
    ],
    [
      'controls',
      'trailing',
      'remove',
      'IconButton',
      { icon: 'fas fa-trash', ariaLabel: 'Remove Ember Court', size: '24' },
    ],
    ['claimed', 'badges', 'claimed', 'Chip', { children: 'Claimed', tone: 'positive' }],
    ['offer', 'trailing', 'claim', 'Button', { children: 'Claim', role: 'accent', size: '24' }],
  ]);
  const PRESSABLE = new Set(['Button', 'IconButton']);

  let targets = $state({});

  /** A flex `<span>` the companion appends to `slot`, as a mount target for a published component. */
  function targetIn(slot, hook) {
    const target = slot.ownerDocument.createElement('span');
    target.style.display = 'flex';
    target.setAttribute('data-lab-list-row-fill', hook);
    slot.append(target);
    return target;
  }

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const rows = new Map(
      ROWS.map(([key, props]) => [
        key,
        mount('ListRow', {
          target: targets[key],
          props: OPENS.includes(key) ? { ...props, onOpen() {} } : props,
        }),
      ])
    );
    const mounted = FILLS.map(([key, slot, hook, name, props]) =>
      mount(name, {
        target: targetIn(rows.get(key).slot(slot), hook),
        props: PRESSABLE.has(name) ? { ...props, onclick() {} } : props,
      })
    );
    return () => {
      for (const handle of [...mounted, ...rows.values()]) handle.destroy();
    };
  });
</script>

<div class="published-list-row-tones-ground" data-lab-list-row-tones>
  {#each ROWS as [key] (key)}
    <section data-lab-list-row-tone={key}>
      <div bind:this={targets[key]}></div>
    </section>
  {/each}
</div>

<style>
  .published-list-row-tones-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 360px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
