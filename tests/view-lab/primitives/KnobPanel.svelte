<!--
  The knob panel: one control per prop the catalogue row drives.

  ── EVERY CONTROL HERE IS THE SHIPPED PRIMITIVE, AND THE ROUTING IS THE SPEC'S ──────────────────

  This panel is the design system being used to build a tool for inspecting the design system, so
  the routing is taken from `openspec/specs/design-system/spec.md` rather than chosen by eye:

    select, 2–4 options   `<SegmentedControl>`
    select, 5+ options    `<SearchablePopover>` — never a native `<select>`. "Every select in the
                          product MUST render the app's own option list", and violating that inside
                          the artifact that exhibits the rule would be its own kind of wrong.
    boolean               `<StatusToggle>`, NOT `<SelectionCheckbox>`. The spec routes these two by
                          location: a record's state IN A LIST is a status control, and the same
                          state IN ITS OWN EDITOR is a toggle. A knob panel is the specimen's
                          editor.
    number                `<Stepper>`, with `allowUnset` where the prop admits absence.
    colour                `<ManagerColorPopover>` — it IS `<TintPicker>`, a full member. A raw
                          `<input type="color">` would be hand-rolling a control the set owns.
    text                  `<Field as="label">` plus a native input, which is the shipped shell.
                          NOT `<ManagerSearchField>`: that is a search pill, and its own manifest
                          row records that it is deliberately not the `<Field>` shell.
    json                  `<Field as="label">` plus a `<textarea>`. The one control the set does not
                          own — see the surface note on the textarea below.
    snippet               a filler id, so it is a `select` and routes by the same rule.
    event                 NOT A CONTROL. It contributes a recorder and appears in the event log.

  ── A STEPPER IS NEVER WRAPPED IN A `<label>` ───────────────────────────────────────────────────

  `Stepper.svelte`'s own header states it and a guard test enforces it in `src/`: a `<label>` with
  no `for` binds to its FIRST labelable descendant, which in a Stepper is the `−` button — so
  clicking the caption would DECREMENT the value. Every non-text knob therefore uses
  `<Field as="div">` with a sibling caption and names its control through `ariaLabel`.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';
  import CollapsibleGroupHeader from '../../../src/ui/svelte/components/CollapsibleGroupHeader.svelte';
  import Field from '../../../src/ui/svelte/components/Field.svelte';
  import ManagerColorPopover from '../../../src/ui/svelte/components/ManagerColorPopover.svelte';
  import SearchablePopover from '../../../src/ui/svelte/apps/manager/SearchablePopover.svelte';
  import SegmentedControl from '../../../src/ui/svelte/apps/manager/SegmentedControl.svelte';
  import StatusToggle from '../../../src/ui/svelte/components/StatusToggle.svelte';
  import Stepper from '../../../src/ui/svelte/components/Stepper.svelte';

  import { FILLER_IDS } from './fillers.js';

  /** Above this many options a closed set is a search, not a track. The spec's own boundary. */
  const SEGMENTED_CEILING = 4;

  let { entry, values, onChange = () => {} } = $props();

  let jsonDrafts = $state({});
  let jsonErrors = $state({});
  let sectionOpen = $state({ knobs: true, waived: false });

  const knobs = $derived((entry?.knobs ?? []).filter((knob) => knob.type !== 'event'));
  const waived = $derived(entry?.unknobbed ?? []);

  function optionsFor(knob) {
    if (knob.type === 'snippet') return knob.options ?? [...FILLER_IDS];
    return knob.options ?? [];
  }

  function set(prop, value) {
    onChange(prop, value);
  }

  function hexOf(value) {
    return typeof value === 'string' && value.startsWith('#') ? value : '';
  }

  /**
   * Decide whether a tint payload carried a NEW free hex or a chosen preset.
   *
   * `ManagerColorPopover` emits `{colorToken, customColor}` from both paths and echoes back
   * whatever `customColor` it was given, so the payload alone cannot say which half changed.
   * Comparing against what was passed in can.
   */
  function tintValue(knob, payload) {
    const current = hexOf(values[knob.prop]);
    return payload.customColor && payload.customColor !== current
      ? payload.customColor
      : payload.colorToken;
  }

  function commitJson(knob, raw) {
    jsonDrafts = { ...jsonDrafts, [knob.prop]: raw };
    if (raw.trim() === '') {
      jsonErrors = { ...jsonErrors, [knob.prop]: '' };
      set(knob.prop, null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      jsonErrors = { ...jsonErrors, [knob.prop]: '' };
      set(knob.prop, parsed);
    } catch (error) {
      jsonErrors = { ...jsonErrors, [knob.prop]: String(error?.message ?? error) };
    }
  }

  function jsonText(knob) {
    if (Object.hasOwn(jsonDrafts, knob.prop)) return jsonDrafts[knob.prop];
    return values[knob.prop] === null || values[knob.prop] === undefined
      ? ''
      : JSON.stringify(values[knob.prop], null, 2);
  }
</script>

{#snippet control(knob)}
  {#if knob.type === 'boolean'}
    <StatusToggle
      on={values[knob.prop] === true}
      label={values[knob.prop] === true ? 'on' : 'off'}
      ariaLabel={knob.prop}
      onclick={() => set(knob.prop, values[knob.prop] !== true)}
    />
  {:else if knob.type === 'number'}
    <Stepper
      value={values[knob.prop]}
      min={knob.min ?? null}
      max={knob.max ?? null}
      step={knob.step ?? 1}
      allowUnset={knob.allowUnset === true}
      ariaLabel={knob.prop}
      decrementLabel={`Decrease ${knob.prop}`}
      incrementLabel={`Increase ${knob.prop}`}
      onChange={(next) => set(knob.prop, next)}
    />
  {:else if knob.type === 'colour'}
    <ManagerColorPopover
      layout="inline"
      colorToken={values[knob.prop]}
      customColor={hexOf(values[knob.prop])}
      presetGridLabel={`${knob.prop} presets`}
      customHexLabel={`${knob.prop} hex`}
      onChange={(payload) => set(knob.prop, tintValue(knob, payload))}
    />
  {:else if optionsFor(knob).length > 0 && optionsFor(knob).length <= SEGMENTED_CEILING}
    <SegmentedControl
      options={optionsFor(knob).map((option) => ({
        value: option,
        fallback: option === '' ? "''" : String(option),
      }))}
      value={values[knob.prop]}
      groupName={`pl-${entry.path}-${knob.prop}`}
      ariaLabel={knob.prop}
      onChange={(next) => set(knob.prop, next)}
    />
  {:else if optionsFor(knob).length > SEGMENTED_CEILING}
    <SearchablePopover
      options={optionsFor(knob).map((option) => ({ id: String(option), label: String(option) }))}
      value={String(values[knob.prop] ?? '')}
      triggerLabel={String(values[knob.prop] ?? 'choose')}
      triggerAriaLabel={knob.prop}
      dialogAriaLabel={`${knob.prop} options`}
      searchAriaLabel={`Search ${knob.prop} options`}
      emptyHint="No option matches"
      onChoose={(id) => set(knob.prop, id)}
    />
  {:else if knob.type === 'json'}
    <!--
      SURFACE 4 of 4: the multi-line JSON editor. NO member of the set would own it — a structured
      data editor is not a design-system primitive — and the shipped shell around it, `<Field
      as="label">` plus a native element, is exactly what is used. All the class does is make a
      `<textarea>` legible, which the product has never had to do because it has no multi-line
      control.
    -->
    <textarea
      class="pl-json-editor"
      data-pl-surface="JsonEditor"
      spellcheck="false"
      value={jsonText(knob)}
      oninput={(event) => commitJson(knob, event.currentTarget.value)}></textarea>
  {:else}
    <input
      type="text"
      value={String(values[knob.prop] ?? '')}
      oninput={(event) => set(knob.prop, event.currentTarget.value)}
    />
  {/if}
{/snippet}

<div class="pl-stack">
  <CollapsibleGroupHeader
    name="Props"
    countText={`${knobs.length}`}
    expanded={sectionOpen.knobs}
    onToggle={() => (sectionOpen = { ...sectionOpen, knobs: !sectionOpen.knobs })}
  />
  {#if sectionOpen.knobs}
    {#each knobs as knob (knob.prop)}
      {#if knob.type === 'text' || knob.type === 'json'}
        <Field as="label">
          <span>{knob.prop}</span>
          {@render control(knob)}
        </Field>
      {:else}
        <Field as="div">
          <span>{knob.prop}</span>
          {@render control(knob)}
        </Field>
      {/if}
      {#if jsonErrors[knob.prop]}
        <!-- SURFACE 2 of 4: a transient error. `<Notice>` is UNBUILT; see lab.css. -->
        <div class="pl-notice" data-pl-surface="Notice" role="alert">
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          <span>{knob.prop}: {jsonErrors[knob.prop]}</span>
        </div>
      {/if}
    {/each}
  {/if}

  <CollapsibleGroupHeader
    name="Not driven"
    countText={`${waived.length}`}
    expanded={sectionOpen.waived}
    onToggle={() => (sectionOpen = { ...sectionOpen, waived: !sectionOpen.waived })}
  />
  {#if sectionOpen.waived}
    <div class="pl-row">
      {#each waived as waiver (waiver.prop)}
        <Chip mono tone="muted" title={waiver.why}>{waiver.prop}</Chip>
      {/each}
    </div>
  {/if}
</div>
