<!--
  A View Lab specimen, not a Fabricate surface (issue 2862). It mounts `Disclosure`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each filling the `head` and
  `body` slots with its own content: a closed card, an open one, the card the case's step opens by
  a press through the companion's own update, the card a second step focuses, a disabled closed and
  a disabled open card, and a faction card whose head holds a published `Chip`, a published centred
  `FillBar`, its name and figure and a run of its holdings, over a body holding a text input in a
  published `Field`; then
  Fabricate's own `InspectorCard`, imported directly, as the box's baseline. Every word is a
  companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-disclosure` only.

  One 420px column on `--fab-bg-1` spaces its rows by 8px. A case addresses it by
  `data-lab-disclosures`, a row by its unique `data-lab-disclosure` key, and the row the step
  presses echoes the companion's state in `data-lab-disclosure-open`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
  import InspectorCard from '../../../src/ui/svelte/components/InspectorCard.svelte';

  /** Each row's key, its head's text, its body's text and the card's props, `onToggle` aside. */
  const ROWS = Object.freeze([
    ['closed', 'Ironwrights’ Guild', 'Holds the forges on the east quay.', {}],
    ['open', 'Saltmarsh Wardens', 'Keep the causeway open at low tide.', { open: true }],
    ['pressed', 'Lantern Society', 'Trades in oil, wick and rumour.', {}],
    ['focused', 'Copper Circle', 'Lends against the next harvest.', {}],
    ['disabled', 'Ashen Choir', 'Not yet met.', { disabled: true }],
    [
      'disabled-open',
      'Tidewright Compact',
      'Sworn to the harbour master.',
      { disabled: true, open: true },
    ],
    ['faction', 'Ironwrights’ Guild', 'Standing note', { open: true, level: 4 }],
  ]);

  let targets = $state({});
  // The echo the case reads; the props read `held`, so the effect does not track the press.
  let pressed = $state(false);

  /** The faction head: a tier chip, a centred standing bar, the name and figure, and the holdings. */
  function factionHead(slot, mount) {
    const chip = document.createElement('span');
    const bar = document.createElement('span');
    bar.className = 'published-disclosures-bar';
    const name = Object.assign(document.createElement('span'), {
      textContent: 'Ironwrights’ Guild +42',
    });
    const holdings = document.createElement('span');
    holdings.className = 'published-disclosures-holdings';
    for (const holding of ['Forge', 'Assay office', 'East quay']) {
      holdings.append(Object.assign(document.createElement('span'), { textContent: holding }));
    }
    slot.append(chip, name, bar, holdings);
    return [
      mount('Chip', { target: chip, props: { tone: 'positive', children: 'Honoured' } }),
      mount('FillBar', { target: bar, props: { value: 42, origin: 'center' } }),
    ];
  }

  /** Fills one card's two slots, and returns the handles of the mounts its head holds. */
  function fill(handle, key, head, body, mount) {
    handle.slot('body').append(Object.assign(document.createElement('p'), { textContent: body }));
    if (key !== 'faction') {
      handle.slot('head').append(head);
      return [];
    }
    const fieldTarget = document.createElement('div');
    handle.slot('body').append(fieldTarget);
    const field = mount('Field', { target: fieldTarget, props: { as: 'div', children: true } });
    const input = Object.assign(document.createElement('input'), {
      type: 'text',
      value: 'Owes us two favours',
    });
    input.setAttribute('aria-label', body);
    field.slot('children').append(input);
    return [field, ...factionHead(handle.slot('head'), mount)];
  }

  $effect(() => {
    if (ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = {};
    let nested = [];
    let held = false;
    const propsOf = (key, props) =>
      key === 'pressed'
        ? {
            ...props,
            head: true,
            body: true,
            open: held,
            onToggle: (next) => {
              held = next;
              pressed = next;
              handles[key].update(propsOf(key, props));
            },
          }
        : { ...props, head: true, body: true, onToggle: () => {} };
    for (const [key, head, body, props] of ROWS) {
      handles[key] = mount('Disclosure', { target: targets[key], props: propsOf(key, props) });
      nested = [...nested, ...fill(handles[key], key, head, body, mount)];
    }
    return () => {
      for (const handle of [...nested, ...Object.values(handles)]) handle.destroy();
    };
  });
</script>

<div class="published-disclosures" data-lab-disclosures>
  {#each ROWS as [key] (key)}
    <section
      data-lab-disclosure={key}
      data-lab-disclosure-open={key === 'pressed' ? String(pressed) : undefined}
      bind:this={targets[key]}
    ></section>
  {/each}
  <!-- The baseline: Fabricate's own card, mounted directly rather than through the seam. -->
  <section data-lab-disclosure="baseline">
    <InspectorCard>
      {#snippet title()}Card baseline{/snippet}
    </InspectorCard>
  </section>
</div>

<style>
  .published-disclosures {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    width: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .published-disclosures :global(p) {
    margin: 0;
  }

  .published-disclosures :global(.published-disclosures-bar) {
    display: block;
    flex: 0 0 72px;
  }

  .published-disclosures :global(.published-disclosures-holdings) {
    display: flex;
    gap: var(--fab-space-2);
    color: var(--fab-text-muted);
  }
</style>
