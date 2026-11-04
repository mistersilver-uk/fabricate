<!--
  A View Lab specimen, not a Fabricate surface. It mounts four `ListRow`s through the page-session
  seam `game.fabricate.api.ui` binds, as a companion does: a whole-row button holding three
  published `IconButton`s in `trailing`, each named for the row's item; a read-only positive row
  whose state word is a published positive `Chip` in `badges`; a read-only danger row whose state
  word is its `detail`; and an accent row whose state word is its `detail`, with a published accent
  `Button` in `trailing`. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-list-row-tones` only.

  The ground is one 360px column on `--fab-bg-2` that spaces its sections by 8px. A case addresses
  the ground by `data-lab-list-row-tones` and a section by `data-lab-list-row-tone`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's row props, by its key. */
  const ROWS = Object.freeze([
    ['controls', { name: 'Ember Court', detail: 'Trusted', onOpen() {}, trailing: true }],
    ['claimed', { name: 'Signet of the Ember Court', tone: 'positive', badges: true }],
    ['declined', { name: 'Forge-warden’s writ', detail: 'Turned down', tone: 'danger' }],
    [
      'offer',
      { name: '50 gp', detail: 'Ready to claim', tone: 'accent', onOpen() {}, trailing: true },
    ],
  ]);

  let targets = $state({});

  /** A flex `<span>` the companion appends to `slot`, as a mount target for a published component. */
  function targetIn(slot) {
    const target = slot.ownerDocument.createElement('span');
    target.style.display = 'flex';
    slot.append(target);
    return target;
  }

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = ROWS.map(([key, props]) => mount('ListRow', { target: targets[key], props }));
    const [controls, claimed, , offer] = handles;
    const mounted = [];
    const into = (handle, key, name, props) =>
      mounted.push(mount(name, { target: targetIn(handle.slot(key)), props }));
    const step = (icon, ariaLabel) => ({ icon, ariaLabel, size: '24', onclick() {} });
    into(controls, 'trailing', 'IconButton', step('fas fa-minus', 'Lower Ember Court standing'));
    into(controls, 'trailing', 'IconButton', step('fas fa-plus', 'Raise Ember Court standing'));
    into(controls, 'trailing', 'IconButton', step('fas fa-trash', 'Remove Ember Court'));
    into(claimed, 'badges', 'Chip', { children: 'Claimed', tone: 'positive' });
    into(offer, 'trailing', 'Button', {
      children: 'Claim',
      role: 'accent',
      size: '24',
      onclick() {},
    });
    return () => {
      for (const handle of [...mounted, ...handles]) handle.destroy();
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
