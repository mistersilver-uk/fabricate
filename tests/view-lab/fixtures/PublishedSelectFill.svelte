<!--
  A View Lab specimen, not a Fabricate surface (issue 2904). It mounts four `Select`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each in a 240px target
  beneath the visible text that names it: three with `fill`, one per `size`, and one without, so
  the frame shows filled triggers as wide as their column beside one that hugs its label. Every
  word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-select-fill` only.

  The ground is one positioned 320px column on `--fab-bg-1`, and every list opens in it as each
  select's `overlayHost`. The last section, `form`, reserves the room its list takes once a case
  opens it.
  A case addresses the ground by `data-lab-select-fill` and each section by its
  `data-lab-select-fill-form` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const OPTIONS = Object.freeze([
    { value: 'ash', label: 'Ash' },
    { value: 'oak', label: 'Oak heartwood from the northern grove, seasoned three winters' },
    { value: 'yew', label: 'Yew' },
  ]);

  /** Each select's key in fixture order, its heading, its size, its value and whether it fills. */
  const SELECTS = Object.freeze([
    ['inline-long', { label: 'Haft wood, inline', size: 'inline', value: 'oak', fill: true }],
    ['toolbar', { label: 'Haft wood, toolbar', size: 'toolbar', value: 'yew', fill: true }],
    ['hug', { label: 'Haft wood, unfilled', size: 'form', value: 'ash', fill: false }],
    ['form', { label: 'Haft wood, form', size: 'form', value: 'ash', fill: true }],
  ]);

  let ground = $state(null);
  const targets = $state([]);

  function mountSelects(mount) {
    const handles = [];
    /** One select's props at `value`; its `onChange` passes the choice back. */
    const props = (index, value) => {
      const [, { label, size, fill }] = SELECTS[index];
      return {
        options: OPTIONS,
        value,
        size,
        fill,
        ariaLabel: label,
        onChange: (next) => handles[index].update(props(index, next)),
      };
    };
    for (const [index, [, { value }]] of SELECTS.entries()) {
      handles[index] = mount('Select', {
        target: targets[index],
        props: props(index, value),
        overlayHost: ground,
      });
    }
    return handles;
  }

  $effect(() => {
    if (!ground || SELECTS.some((_, index) => !targets[index])) return undefined;
    const handles = mountSelects(publishedComponentSeam.publicApi.mount);
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-select-fill" data-lab-select-fill bind:this={ground}>
  {#each SELECTS as [key, { label }], index (key)}
    <section data-lab-select-fill-form={key}>
      <p class="select-fill-heading">{label}</p>
      <div class="select-fill-target" bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-select-fill {
    position: relative;
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-3);
    width: 320px;
    align-content: start;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  /* Room beneath the last select's trigger for the 160px a list needs to open downward, beside its 6px gap and the 16px it keeps inside the ground; named by key, because the seam appends the list's container to the ground after it. */
  .published-select-fill > [data-lab-select-fill-form='form'] {
    min-height: 250px;
  }

  .select-fill-heading {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .select-fill-target {
    display: flex;
    width: 240px;
  }
</style>
