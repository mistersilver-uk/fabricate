<!-- Svelte 5 runes mode -->
<!--
  The Min / Max bounds of ONE character-modifier reference row.

  Extracted in issue 1050 because this markup shipped TWICE in
  `CraftingSystemManagerRoot` — once in the drop scope and once in the event scope — and
  migrating it onto `Stepper` turned two copies of a bare-input pair into FOUR
  near-identical stepper call sites. That is one implementation written out four times,
  which the repo's own one-implementation-per-meaning rule forbids and SonarCloud's
  new-code duplication gate measures. The two scopes differ only in what they do with
  the resulting patch, so that is the only thing they pass in.

  `allowUnset` is the point of the control. An unbounded bound is a real domain value
  here: clearing either field persists literal `null` — "no lower bound" / "no upper
  bound" — and `0` is itself a legitimate bound, so the two must stay distinguishable.

  No `min` prop, deliberately. These are SIGNED bounds on a modifier, so a negative
  lower bound is meaningful and has to stay reachable from the `−` adjunct.

  The row's chrome (`.manager-character-modifier-row-bounds` and the `flex: 1 1 80px`
  on its `.manager-field` children) lives in the global sheet rather than a scoped
  `<style>` block here, which is why moving the markup into this component leaves the
  layout untouched: `fill` still stretches each stepper to a real, sized flex track.
-->
<script>
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    /** The row's current lower bound, or `null` while it is unbounded. */
    min = null,
    /** The row's current upper bound, or `null` while it is unbounded. */
    max = null,
    /** Called with a `{ min }` or `{ max }` patch for the owning scope to persist. */
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // One descriptor per bound rather than two hand-written call sites: the pair differs
  // only in its caption, its current value, and which key its patch carries.
  const bounds = $derived([
    {
      key: 'min',
      label: text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Min', 'Min'),
      value: min,
      patch: (next) => ({ min: next }),
    },
    {
      key: 'max',
      label: text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Max', 'Max'),
      value: max,
      patch: (next) => ({ max: next }),
    },
  ]);
</script>

<div class="manager-character-modifier-row-bounds">
  <!-- `<div>`, not `<label>`: an implicit label binds to its FIRST labelable descendant,
       which for a Stepper is the `−` button — clicking the visible caption would
       decrement the bound rather than focus the field. The accessible name comes from
       the Stepper's own `ariaLabel` instead. -->
  {#each bounds as bound (bound.key)}
    <div class="manager-field">
      <span>{bound.label}</span>
      <Stepper
        value={bound.value}
        allowUnset
        step={1}
        fill
        {...stepperLabels(bound.label)}
        onChange={(next) => onChange(bound.patch(next))}
      />
    </div>
  {/each}
</div>
