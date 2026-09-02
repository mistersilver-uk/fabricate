<!--
  The snippet fillers that stand in for a real primitive, declared where a snippet can be declared.

  A knob of type `snippet` hands a component a VALUE, so the lab needs snippets it can hold in a
  map. `createRawSnippet` supplies one from a string, which is right for text and a glyph and wrong
  for a chip or a button: `Chip.svelte` keeps its CSS scoped and injected, so a hand-written
  `<span class="manager-chip">` picks up only the global remnants and draws a chip the product no
  longer has — and it looks correct doing it. See `fillers.js` for the full reasoning.

  These are handed UP rather than passed down, through a snippet PARAMETER on `children`. That is
  the idiomatic Svelte 5 route: `{#snippet}` blocks are in scope for the whole template, so the
  template can pass them as data to a snippet the consumer supplied. A consumer writes:

    <Fillers>
      {#snippet children(fillers)}
        …resolveSnippet={(id) => fillers[id]}…
      {/snippet}
    </Fillers>

  `assembleFillers` joins these to the raw ones and THROWS on a gap, because a missing filler makes
  `buildProps` omit the snippet prop entirely and several primitives branch on `children ===
  undefined` — so the specimen would draw a narrower, legitimate-looking shape with no error.

  Inline `style` rather than a class on the wrappers, for the same reason the raw fillers use one:
  a filler is content, not harness chrome, and it must not carry a `pl-` name into a component's
  slot.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';
  import Field from '../../../src/ui/svelte/components/Field.svelte';
  import ManagerButton from '../../../src/ui/svelte/components/ManagerButton.svelte';

  import { assembleFillers } from './fillers.js';

  let { children } = $props();
</script>

{#snippet twoButtons()}
  <span style="display:flex;gap:8px">
    <ManagerButton role="ghost">Cancel</ManagerButton>
    <ManagerButton role="primary">Apply</ManagerButton>
  </span>
{/snippet}

{#snippet field()}
  <Field as="label">
    <span>Difficulty</span>
    <input type="text" value="Moderate" readonly />
  </Field>
{/snippet}

{#snippet chips()}
  <span style="display:flex;gap:6px">
    <Chip icon="fas fa-cube">metal</Chip>
    <Chip>forged</Chip>
  </span>
{/snippet}

{@render children(assembleFillers({ 'two-buttons': twoButtons, field, chips }))}
