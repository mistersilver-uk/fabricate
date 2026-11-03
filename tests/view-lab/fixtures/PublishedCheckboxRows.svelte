<!--
  A View Lab specimen, not a Fabricate surface (issue 2881). It mounts decorative
  `SelectionCheckbox`es through the page-session seam `game.fabricate.api.ui` binds, as a
  companion does, each inside an objective row of the companion's own: a `<button aria-pressed>`
  holding the box's target and the objective's text, the text alone struck through while done. The rows are a
  done row and an open one in the success tone, the row the case's step presses to done, a done
  row at the compact and the comfortable box, a done row in the default accent tone, a mixed box
  in the success tone, which keeps the accent dash, and as a baseline a labelled success box.
  Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-checkbox-rows` only.

  One 420px ground on `--fab-bg-1` spaces its rows by 6px. A case addresses it by
  `data-lab-checkbox-rows`, a row by its unique `data-lab-checkbox-row` key, and each row echoes
  the companion's done state in `data-lab-checkbox-row-done`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each row's key, its objective and the box's props, `checked` from the row's state aside. */
  const ROWS = Object.freeze([
    ['done', 'Gather three iron ore', true, { tone: 'success' }],
    ['open', 'Smelt the ore into bars', false, { tone: 'success' }],
    ['pressed', 'Quench the blade', false, { tone: 'success' }],
    ['compact', 'Temper the edge', true, { tone: 'success', density: 'compact' }],
    ['comfortable', 'Fit the hilt', true, { tone: 'success', density: 'comfortable' }],
    ['accent', 'Sharpen the blade', true, {}],
    ['mixed', 'Polish the fittings', false, { tone: 'success', indeterminate: true }],
  ]);

  let targets = $state({});
  let labelled = $state(null);
  // The echo the case reads; the mount effect reads ROWS' initial state, so it does not track the
  // press.
  let done = $state(Object.fromEntries(ROWS.map(([key, , isDone]) => [key, isDone])));
  const handles = {};

  /** The companion's own press: its state first, then the box's next props. */
  function press(key, props) {
    const next = !done[key];
    done = { ...done, [key]: next };
    handles[key]?.update({ ...props, decorative: true, checked: next });
  }

  $effect(() => {
    if (!labelled || ROWS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    for (const [key, , isDone, props] of ROWS) {
      handles[key] = mount('SelectionCheckbox', {
        target: targets[key],
        props: { ...props, decorative: true, checked: isDone },
      });
    }
    const named = mount('SelectionCheckbox', {
      target: labelled,
      props: { checked: true, tone: 'success', label: 'Forge the blade', onChange() {} },
    });
    return () => {
      for (const handle of Object.values(handles)) handle.destroy();
      named.destroy();
    };
  });
</script>

<div class="published-checkbox-rows-ground" data-lab-checkbox-rows>
  {#each ROWS as [key, objective, , props] (key)}
    <button
      type="button"
      class="published-checkbox-row"
      class:is-done={done[key]}
      aria-pressed={String(done[key])}
      data-lab-checkbox-row={key}
      data-lab-checkbox-row-done={String(done[key])}
      onclick={() => press(key, props)}
      ><span class="published-checkbox-row-box" bind:this={targets[key]}></span><span
        class="published-checkbox-row-text"
        data-lab-checkbox-row-text>{objective}</span
      ></button
    >
  {/each}
  <div data-lab-checkbox-row="labelled" bind:this={labelled}></div>
</div>

<style>
  .published-checkbox-rows-ground {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    width: 420px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  /* Every row is 28px tall, the comfortable box's height and more, so it takes that band's 7px
     corner on the radius ladder. */
  .published-checkbox-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-height: 28px;
    padding: var(--fab-space-2xs) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-2);
    color: var(--fab-text);
    text-align: start;
  }

  .published-checkbox-row.is-done {
    color: var(--fab-text-secondary);
  }

  /* The strike crosses the objective's text alone: on the row it would cross the box's tick too. */
  .published-checkbox-row.is-done > .published-checkbox-row-text {
    text-decoration: line-through;
  }

  .published-checkbox-row-box {
    display: inline-flex;
  }
</style>
