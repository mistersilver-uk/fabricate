<!--
  A View Lab specimen, not a Fabricate surface (issues 2890, 2898). It mounts `Button`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each beside a caption of the
  companion's own: an action bar's `neutral` baseline, its `primary` commit and the `confirm` role
  at rest, for the pointer and the keyboard, disabled and busy; and five tinted cards, one per soft
  fill, each holding an `accent`, an `urgent` and a `confirm` verb. Every word is a companion's
  final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-button-roles` only.

  The ground is two columns on `--fab-bg-2`, a companion's card: the bar's rows, 8px apart, and the
  tinted cards, each its soft fill over that ground. A case addresses the ground by
  `data-lab-button-roles`, a bar row by `data-lab-button-role` and a card by `data-lab-button-tint`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const CONFIRM = Object.freeze({
    children: 'Confirm the stage',
    role: 'confirm',
    icon: 'fas fa-check',
  });
  const ADVANCE = Object.freeze({ children: 'Advance', icon: 'fas fa-forward-step' });

  /** Each bar row's key, its caption and the props its button takes beside `onclick`. */
  const ROWS = Object.freeze([
    ['neutral', "Button role 'neutral'", { children: 'Review' }],
    ['primary', "Button role 'primary'", { children: 'Save', role: 'primary' }],
    ['confirm', "Button role 'confirm'", CONFIRM],
    ['confirm-hover', "'confirm', for the pointer", CONFIRM],
    ['confirm-disabled', "'confirm', disabled", { ...CONFIRM, disabled: true }],
    ['confirm-busy', "'confirm', busy", { ...CONFIRM, children: 'Confirming…', busy: true }],
  ]);
  const TINTS = Object.freeze(['info', 'accent', 'success', 'warning', 'danger']);
  /** Each tinted card's verbs, by key, and the props each takes beside `onclick`. */
  const VERBS = Object.freeze([
    ['accent', { ...ADVANCE, role: 'accent' }],
    ['urgent', { ...ADVANCE, role: 'urgent', icon: 'fas fa-bell' }],
    ['confirm', CONFIRM],
  ]);
  const TARGETS = Object.freeze([
    ...ROWS.map(([key, , props]) => [key, props]),
    ...TINTS.flatMap((tint) => VERBS.map(([verb, props]) => [`${tint}-${verb}`, props])),
  ]);

  let targets = $state({});

  $effect(() => {
    if (TARGETS.some(([key]) => !targets[key])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = TARGETS.map(([key, props]) =>
      mount('Button', { target: targets[key], props: { ...props, onclick() {} } })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-button-roles-ground" data-lab-button-roles>
  <div class="published-button-roles-column">
    {#each ROWS as [key, caption] (key)}
      <section data-lab-button-role={key}>
        <div class="published-button-roles-target" bind:this={targets[key]}></div>
        <span>{caption}</span>
      </section>
    {/each}
  </div>
  <div class="published-button-roles-column">
    {#each TINTS as tint (tint)}
      <section
        class="published-button-roles-card"
        data-lab-button-tint={tint}
        style:background={`var(--fab-${tint}-soft)`}
      >
        <span>On --fab-{tint}-soft</span>
        {#each VERBS as [verb] (verb)}
          <div
            class="published-button-roles-target"
            data-lab-button-verb={verb}
            bind:this={targets[`${tint}-${verb}`]}
          ></div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .published-button-roles-ground {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 280px 540px;
    gap: var(--fab-space-3);
    width: 856px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .published-button-roles-column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .published-button-roles-column > section {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .published-button-roles-card {
    padding: var(--fab-space-2);
    border-radius: 9px;
  }

  .published-button-roles-card > span {
    flex: 0 0 120px;
  }

  .published-button-roles-target {
    display: flex;
    flex: 0 0 auto;
  }
</style>
