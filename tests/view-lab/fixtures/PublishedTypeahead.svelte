<!--
  A View Lab specimen, not a Fabricate surface (issue 2860). It mounts five `Typeahead`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does: each companion holds its
  own query, hands the list the rewards whose name holds it, and draws the text naming the field
  above it. Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js`
  mounts it for `?specimen=published-typeahead` only.

  The ground is two 320px columns on `--fab-bg-1`, and the overlay host of every list, so a list
  opens inside it. The left column holds the rest forms: `toolbar` and `inline` fields, an error
  field, and a free-text field whose committed text the companion draws beneath it, emptying the
  field. The ground pads its columns past the list's own 16px inset from its host. The right holds
  the field a case opens, whose current value ticks its row. A case addresses the ground by
  `data-lab-typeahead-ground` and each section by its `data-lab-typeahead` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const REWARDS = Object.freeze([
    { value: 'iron-ingot', label: 'Iron ingot', icon: 'fas fa-cube', detail: 'Metal · 3 in stock' },
    { value: 'iron-ore', label: 'Iron ore', icon: 'fas fa-mountain' },
    { value: 7, label: 'Ironwood plank', icon: 'fas fa-tree', detail: 'Timber' },
    { value: 'iron-filings', label: 'Iron filings', icon: 'fas fa-cube' },
    { value: 'copper-wire', label: 'Copper wire', icon: 'fas fa-bolt' },
  ]);

  /** Each section's key, its heading, its column, and its field's props. */
  const FIELDS = Object.freeze([
    ['scope', 'Scope', 'left', { density: 'toolbar', placeholder: 'Search parties' }],
    ['rule', 'Standing rule', 'left', { density: 'inline', placeholder: 'Search factions' }],
    ['bonus', 'Bonus reward', 'left', { error: 'Choose a reward from the list.' }],
    [
      'free',
      'Custom reward',
      'left',
      {
        allowFree: true,
        placeholder: 'Name a reward',
        emptyLabel: 'Nothing in the catalogue matches. Press Enter to use what you typed.',
      },
    ],
    ['reward', 'Reward', 'right', { value: 7, placeholder: 'Search rewards' }],
  ]);

  const matching = (query) => {
    const needle = String(query).trim().toLowerCase();
    return needle ? REWARDS.filter(({ label }) => label.toLowerCase().includes(needle)) : [];
  };

  let ground = $state(null);
  const targets = $state({});
  let freeText = $state('');

  $effect(() => {
    if (!ground || FIELDS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = FIELDS.map(([key, label, , extra]) => {
      let query = '';
      let handle;
      const props = () => ({
        ariaLabel: label,
        options: matching(query),
        onChange: (value) => ground.setAttribute(`data-lab-typeahead-${key}-chosen`, value),
        // The companion takes the text as its reward and empties the field, which closes its line.
        onFreeText: (text) => {
          freeText = text;
          query = '';
          handle.update({ ...props(), query });
        },
        onQueryChange: (next) => {
          query = next;
          handle.update(props());
        },
        ...extra,
      });
      handle = mount('Typeahead', { target: targets[key], props: props(), overlayHost: ground });
      return handle;
    });
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div bind:this={ground} class="published-typeahead-ground" data-lab-typeahead-ground>
  {#each ['left', 'right'] as column (column)}
    <div class="typeahead-column">
      {#each FIELDS.filter(([, , side]) => side === column) as [key, label] (key)}
        <section data-lab-typeahead={key}>
          <p class="typeahead-heading">{label}</p>
          <div class="typeahead-target" bind:this={targets[key]}></div>
          {#if key === 'free' && freeText}
            <p class="typeahead-used" data-lab-typeahead-used>Using {freeText}</p>
          {/if}
        </section>
      {/each}
    </div>
  {/each}
</div>

<style>
  .published-typeahead-ground {
    position: relative;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 320px 320px;
    gap: var(--fab-space-4);
    min-height: 460px;
    padding: 24px;
    background: var(--fab-bg-1);
  }

  .typeahead-column {
    display: grid;
    align-content: start;
    gap: var(--fab-space-3);
  }

  .typeahead-heading,
  .typeahead-used {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .typeahead-used {
    margin: var(--fab-space-1) 0 0;
    font-weight: 400;
  }

  .typeahead-target {
    display: flex;
  }
</style>
