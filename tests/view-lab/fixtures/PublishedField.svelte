<!--
  A View Lab specimen, not a Fabricate surface (issue 2601). It mounts one `Field` through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, and draws the companion's
  own content in its content slot: a caption `<span id>` holding a published `Kicker`, a text input
  that `aria-labelledby` names by that caption, and a `<small>` hint. Every word is a companion's
  final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-field` only.

  The section records what the input holds as `data-lab-value`, empty until the first edit. The
  ground is one 320px column on `--fab-bg-1`. A case addresses the ground by
  `data-lab-field-ground` and the section by `data-lab-field`.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  const CAPTION_ID = 'lab-published-field-caption';

  let target = $state();
  let value = $state('');

  /** The companion's caption, input and hint, appended to the field's content slot. */
  function drawContent(slot) {
    const doc = slot.ownerDocument;
    const caption = doc.createElement('span');
    caption.id = CAPTION_ID;
    const input = doc.createElement('input');
    input.type = 'text';
    input.placeholder = 'Name the recipe';
    input.setAttribute('aria-labelledby', CAPTION_ID);
    input.addEventListener('input', () => {
      value = input.value;
    });
    const hint = doc.createElement('small');
    hint.textContent = 'Shown on the recipe card.';
    slot.append(caption, input, hint);
    return caption;
  }

  $effect(() => {
    if (!target) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const field = mount('Field', { target, props: { as: 'div', children: true } });
    const caption = drawContent(field.slot('children'));
    mount('Kicker', { target: caption, props: { as: 'span', children: 'Recipe name' } });
    return () => field.destroy();
  });
</script>

<div class="published-field-ground" data-lab-field-ground>
  <section data-lab-field="name" data-lab-value={value}>
    <div bind:this={target}></div>
  </section>
</div>

<style>
  .published-field-ground {
    box-sizing: border-box;
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
