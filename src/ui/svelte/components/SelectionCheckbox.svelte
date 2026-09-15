<!--
  The manager's ONE selection control: a square custom box with a checked, unchecked and
  indeterminate state, at the sizes its host row needs. A host-supplied `<input type="checkbox">`
  wearing Foundry's default control chrome is a SECOND selection design, not a cheaper version.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `checked` / `indeterminate` / `disabled` | booleans | `false` | The three input states. `indeterminate` is a DOM PROPERTY, not an attribute, so it is applied through an effect rather than markup — written in markup it would do nothing at all, silently. |
  | `size` | `'sm'` \| `'md'` \| `'lg'` | `'md'` | 18px/r5, 20px/r6, 22px/r6. Each size is DECLARED, never derived: a scale that multiplied one number would make the shipped 18px box a function of the new ones. An unrecognised value falls back rather than emitting an unstyled class. |
  | `wrapper` | `'label'` \| `'contents'` | `'label'` | `label` renders a `<label>` around the input and box, for a host whose action group would otherwise leave the visible box with no label association and no click target. `contents` renders the two as bare siblings, for a host whose OWN root is a `<label>` — nesting labels is invalid HTML and an ambiguous click target. |
  | `ariaLabel` / `element` | already-localized string / bindable | `''` / `null` | The accessible name — this is an import-free leaf — and the real input, exposed so a host can manage focus, since it is visually hidden and cannot be reached by query without reaching through this component's internals. |
  | `onChange(checked)` | function | no-op | The input's new checked state. |

  Rest spread:
  - `{...rest}` lands on the INPUT, because the input is what a caller clicks and what a test drives.

  Invariants:
  - IT MUST NOT RENDER A `<button>`: the Foundry smoke walk reaches a row's Edit action through
    `.manager-component-row button` selectors, and a selection control matching them would start
    intercepting those clicks.
  - THE INDETERMINATE GLYPH IS A MINUS, mirroring the tri-state page box: "some of these", not "none
    of these". A box that is BOTH checked and indeterminate reads as indeterminate, which is what
    the DOM property does too.
-->
<script>
  let {
    checked = false,
    indeterminate = false,
    disabled = false,
    size = 'md',
    wrapper = 'label',
    ariaLabel = '',
    onChange = () => {},
    input = $bindable(null),
    ...rest
  } = $props();

  const SIZES = new Set(['sm', 'md', 'lg']);
  const sizeClass = $derived(SIZES.has(size) ? `is-${size}` : 'is-md');

  const glyph = $derived(indeterminate ? 'fas fa-minus' : 'fas fa-check');

  $effect(() => {
    if (input) input.indeterminate = indeterminate === true;
  });
</script>

{#snippet control()}
  <input
    bind:this={input}
    class="fab-selection-input"
    type="checkbox"
    {checked}
    {disabled}
    aria-label={ariaLabel || undefined}
    onchange={(event) => onChange(event.currentTarget.checked)}
    {...rest}
  />
  <span
    class="fab-selection-check {sizeClass}"
    class:is-checked={checked}
    class:is-indeterminate={indeterminate}
    aria-hidden="true"><i class={glyph}></i></span
  >
{/snippet}

{#if wrapper === 'contents'}
  {@render control()}
{:else}
  <label class="fab-selection-checkbox" class:is-disabled={disabled}>{@render control()}</label>
{/if}

<style>
  .fab-selection-checkbox {
    box-sizing: border-box;
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    cursor: pointer;
  }

  .fab-selection-checkbox.is-disabled {
    cursor: not-allowed;
  }

  .fab-selection-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
  }

  .fab-selection-input::before,
  .fab-selection-input::after {
    display: none;
  }

  .fab-selection-check {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--fab-border-strong);
    color: transparent;
  }

  .fab-selection-check.is-sm {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    font-size: 8px;
  }

  .fab-selection-check.is-md {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    background: var(--fab-bg-0);
    font-size: 10px;
  }

  .fab-selection-check.is-lg {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--fab-bg-0);
    font-size: 10px;
  }

  .fab-selection-check.is-checked {
    border-color: var(--fab-accent);
    background: var(--fab-accent);
    color: var(--fab-bg-1);
  }

  .fab-selection-check.is-sm.is-checked {
    color: var(--fab-on-accent);
  }

  .fab-selection-check.is-indeterminate {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .fab-selection-checkbox:has(.fab-selection-input:focus-visible) .fab-selection-check {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
