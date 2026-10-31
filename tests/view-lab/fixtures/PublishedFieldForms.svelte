<!--
  A View Lab specimen, not a Fabricate surface (issue 2848). It mounts five `Field`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each at a published `size`
  with a `face`, the number `type` or the error state, and draws in each content slot a caption
  `<span id>` and one control its `aria-labelledby` names. Every word is a companion's final text,
  so none is localized. `tests/view-lab/mount.js` mounts it for `?specimen=published-field-forms`.

  The ground is one 320px column on `--fab-bg-1`. A case addresses the ground by
  `data-lab-field-forms` and each section by its `data-lab-field-form` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's key, its field's props, its caption, and its control's attributes. */
  const FORMS = Object.freeze([
    [
      'name',
      { size: 34, face: 'serif' },
      'Activity name',
      { type: 'text', value: 'Moonlit Glade' },
    ],
    ['formula', { size: 30, face: 'mono' }, 'Check formula', { type: 'text', value: '1d20 + 4' }],
    ['uses', { size: 28, face: 'mono', type: 'number' }, 'Uses', { type: 'number', value: '3' }],
    ['tag', { size: 26 }, 'Tag', { type: 'text', value: 'Iron' }],
    ['bonus', { size: 30, invalid: true }, 'Bonus', { type: 'text', value: '1d20 +' }],
  ]);
  const MESSAGE = 'Finish the formula.';

  const targets = $state([]);

  /** The section's caption and control, and the danger-ink message the invalid one is described by. */
  function drawContent(slot, key, caption, attributes, invalid) {
    const doc = slot.ownerDocument;
    const label = doc.createElement('span');
    label.id = `lab-field-form-${key}`;
    label.textContent = caption;
    const control = doc.createElement('input');
    Object.assign(control, attributes);
    control.setAttribute('aria-labelledby', label.id);
    slot.append(label, control);
    if (!invalid) return;
    const message = doc.createElement('small');
    message.id = `lab-field-form-${key}-message`;
    message.style.color = 'var(--fab-danger-text)';
    const icon = doc.createElement('i');
    icon.className = 'fas fa-circle-exclamation';
    icon.setAttribute('aria-hidden', 'true');
    message.append(icon, ` ${MESSAGE}`);
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', message.id);
    slot.append(message);
  }

  $effect(() => {
    if (FORMS.some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const fields = FORMS.map(([key, props, caption, attributes], index) => {
      const field = mount('Field', {
        target: targets[index],
        props: { as: 'div', children: true, ...props },
      });
      drawContent(field.slot('children'), key, caption, attributes, props.invalid === true);
      return field;
    });
    return () => {
      for (const field of fields) field.destroy();
    };
  });
</script>

<div class="published-field-forms-ground" data-lab-field-forms>
  {#each FORMS as [key], index (key)}
    <section data-lab-field-form={key}>
      <div bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-field-forms-ground {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-3);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }
</style>
