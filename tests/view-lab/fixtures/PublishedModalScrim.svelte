<!--
  A View Lab specimen, not a Fabricate surface (issue 2859). It mounts two open `Modal`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, each over a busy pane
  of the companion's own that is also its `overlayHost`: the first with `scrim` `'none'`, for
  comparison, and the second with `'dim'`. Each pane sets `contain: layout`, so it is the box its
  dialog is centred in and the one scrim covers. Each pane's header is on `--fab-bg-2` and its rows
  alternate `--fab-bg-0` and `--fab-bg-2`, the grounds the scrim changes least and brings nearest
  the dialog's surface. Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-modal-scrim` only.

  A case addresses the ground by `data-lab-modal-scrims` and a pane by `data-lab-modal-scrim`,
  whose value is the pane's `scrim`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const SCRIMS = Object.freeze(['none', 'dim']);
  const ROWS = Object.freeze([
    ['Aria the Bold', 'Smithing 4'],
    ['Borin Stonebrew', 'Brewing 2'],
    ['Celyn of the Vale', 'Herbalism 3'],
    ['Dagny Ironhand', 'Smithing 1'],
    ['Edric Thorn', 'Tanning 5'],
    ['Fenna Ashgrove', 'Alchemy 2'],
    ['Gideon Vale', 'Carpentry 3'],
    ['Hollis Reed', 'Weaving 4'],
  ]);

  let panes = $state({});
  let targets = $state({});

  $effect(() => {
    if (SCRIMS.some((scrim) => !panes[scrim] || !targets[scrim])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = SCRIMS.flatMap((scrim) => {
      const dialog = mount('Modal', {
        target: targets[scrim],
        overlayHost: panes[scrim],
        props: {
          open: true,
          title: 'Add a contributor',
          subtitle: 'Forge the guild hall bell',
          icon: 'fas fa-user-plus',
          size: 'sm',
          closeLabel: 'Close',
          scrim,
          body: true,
          footer: true,
          onClose: () => {},
        },
      });
      const doc = panes[scrim].ownerDocument;
      const paragraph = doc.createElement('p');
      paragraph.textContent = 'Choose who works on this project while it is in the forge.';
      dialog.slot('body').append(paragraph);
      const footer = doc.createElement('div');
      dialog.slot('footer').append(footer);
      const add = mount('Button', {
        target: footer,
        props: { role: 'primary', children: 'Add contributor', onclick: () => {} },
      });
      return [add, dialog];
    });
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-modal-scrims-ground" data-lab-modal-scrims>
  {#each SCRIMS as scrim (scrim)}
    <section
      class="published-modal-scrim-pane"
      data-lab-modal-scrim={scrim}
      bind:this={panes[scrim]}
    >
      <header>
        <strong>Guild projects</strong>
        <span>scrim '{scrim}'</span>
      </header>
      <ul>
        {#each ROWS as [name, skill] (name)}
          <li><span>{name}</span><span>{skill}</span></li>
        {/each}
      </ul>
      <div bind:this={targets[scrim]}></div>
    </section>
  {/each}
</div>

<style>
  .published-modal-scrims-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: 704px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-0);
  }

  .published-modal-scrim-pane {
    position: relative;
    contain: layout;
    box-sizing: border-box;
    height: 320px;
    padding: var(--fab-space-3);
    overflow: hidden;
    border: 1px solid var(--fab-border);
    background: var(--fab-bg-1);
  }

  .published-modal-scrim-pane header {
    display: flex;
    justify-content: space-between;
    margin: calc(-1 * var(--fab-space-3)) calc(-1 * var(--fab-space-3)) var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    background: var(--fab-bg-2);
    color: var(--fab-text);
  }

  .published-modal-scrim-pane ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .published-modal-scrim-pane li {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--fab-bg-0);
    color: var(--fab-text-muted);
  }

  .published-modal-scrim-pane li:nth-child(even) {
    background: var(--fab-bg-2);
  }
</style>
