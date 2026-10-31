<!--
  A View Lab specimen, not a Fabricate surface (issue 2856). It mounts `SegmentedControl`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a caption
  of the companion's own: a reward choice on the `'panel'` surface whose options carry an
  `ariaLabel`, the `compact` density on the panel surface in the `accent` tone with its own-surface
  twin beside it for comparison, the `compact` density at `size` 34 in the `info` tone with a
  disabled option, the `inline` density on the panel surface, and the default density at `size` 34
  on the panel surface, as a toolbar beside a 34px field draws it. Each `onChange` passes the
  chosen value back in its own `update` and writes it on its row's `data-lab-segmented-form-chosen`.
  Every word is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts
  it for `?specimen=published-segmented-forms` only.

  The ground is one 400px column on `--fab-bg-1` that spaces its rows by 8px. A case addresses the
  ground by `data-lab-segmented-forms` and a row by `data-lab-segmented-form`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const SCOPES = Object.freeze([
    { value: 'characters', label: 'Characters' },
    { value: 'party', label: 'Party' },
  ]);

  /** Each row's key, its caption and the control's props but `onChange`. */
  const ROWS = Object.freeze([
    [
      'panel-names',
      "surface 'panel', option names",
      {
        ariaLabel: 'Reward for Mira',
        surface: 'panel',
        value: 'oak',
        options: [
          { value: 'oak', label: 'Oak staff', ariaLabel: 'Oak staff, chosen by Mira' },
          { value: 'ash', label: 'Ash bow' },
          { value: 'yew', label: 'Yew charm', ariaLabel: 'Yew charm, chosen by the GM' },
        ],
      },
    ],
    [
      'panel-compact',
      "compact, surface 'panel', accent",
      {
        ariaLabel: 'Who it moves',
        surface: 'panel',
        density: 'compact',
        tone: 'accent',
        value: 'characters',
        options: SCOPES,
      },
    ],
    [
      'own-compact',
      'compact, accent, own surface',
      {
        ariaLabel: 'Who it moves, own surface',
        density: 'compact',
        tone: 'accent',
        value: 'characters',
        options: SCOPES,
      },
    ],
    [
      'sized-compact',
      'compact, size 34, info',
      {
        ariaLabel: 'Stage 1 comparator',
        density: 'compact',
        size: 34,
        tone: 'info',
        value: 'at-least',
        options: [
          { value: 'at-least', label: 'At least' },
          { value: 'exactly', label: 'Exactly' },
          { value: 'at-most', label: 'At most', disabled: true },
        ],
      },
    ],
    [
      'panel-inline',
      "inline, surface 'panel'",
      {
        ariaLabel: 'Library scope',
        surface: 'panel',
        density: 'inline',
        value: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'mine', label: 'Mine' },
        ],
      },
    ],
    [
      'sized-panel-default',
      "size 34, surface 'panel'",
      {
        ariaLabel: 'Library scope, toolbar',
        surface: 'panel',
        size: 34,
        value: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'mine', label: 'Mine' },
          { value: 'shared', label: 'Shared' },
        ],
      },
    ],
  ]);

  const targets = $state({});
  const chosen = $state({});

  for (const [key, , initial] of ROWS) {
    $effect(() => {
      const target = targets[key];
      if (!target) return undefined;
      const { mount } = publishedComponentSeam.publicApi;
      let value = initial.value;
      const props = () => ({
        ...initial,
        value,
        onChange: (next) => {
          value = next;
          control.update(props());
          chosen[key] = next;
        },
      });
      const control = mount('SegmentedControl', { target, props: props() });
      return () => control.destroy();
    });
  }
</script>

<div class="published-segmented-forms-ground" data-lab-segmented-forms>
  {#each ROWS as [key, caption] (key)}
    <section data-lab-segmented-form={key} data-lab-segmented-form-chosen={chosen[key]}>
      <div bind:this={targets[key]}></div>
      <span>{caption}</span>
    </section>
  {/each}
</div>

<style>
  .published-segmented-forms-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 400px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-segmented-forms-ground > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }
</style>
