<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE selection control: a square custom box with a checked, unchecked and
  indeterminate state, at the sizes its host row needs (issue 772).

  It exists because the Tool Studio's requirements tab already SHIPS this treatment —
  `ChecklistCardRow` hand-rolled a visually-hidden `<input type="checkbox">` plus a
  `.manager-checklist-card-check` box against the global sheet — and the component
  browser's new multi-select needs the same control one screen away. A shared CSS class
  that every site hand-rolls markup against does not satisfy the reuse rule
  (`openspec/specs/ui-integration/spec.md` §Shared product UI primitives), and a primitive
  that coexists with an unconverted duplicate has ADDED a variant rather than removed one.
  So the check-box leaf was extracted here and `ChecklistCardRow` was converted onto it in
  the same change; its global rules are gone and its class names are ratcheted in
  `tests/components/manager-layout.test.js`.

  A host-supplied `<input type="checkbox">` wearing Foundry's default control chrome is a
  SECOND selection design, not a cheaper version of this one.

  Props:
   - checked / indeterminate / disabled: the three input states. `indeterminate` is a DOM
     PROPERTY, not an attribute, so it is applied through an effect rather than markup.
   - size: `sm` (18px/radius 5 — the shipped Tool Studio box, unchanged), `md`
     (20px/radius 6 — a page-selection box) or `lg` (22px/radius 6 — a browser row box).
     Each size is DECLARED, never derived: a scale that multiplied one number would make
     the shipped 18px box a function of the new ones.
   - wrapper: `label` (default) renders a `<label>` around the input and box, for a host
     whose action group is a `<span>` and would otherwise leave the visible box with no
     label association and no click target; `contents` renders the two as bare siblings,
     for a host whose OWN root is a `<label>` (nesting labels is invalid HTML and an
     ambiguous click target) and whose grid places the box in its first column.
   - ariaLabel: the accessible name (already localized — this is an import-free leaf).
   - onChange(checked): called with the input's new checked state.

  Every other attribute — `value`, `data-*` hooks, `title` — is forwarded through the rest
  spread onto the INPUT, because the input is what a caller clicks and what a test drives.

  It must NOT render a `<button>`: the Foundry smoke walk reaches the component row's Edit
  action through `.manager-component-row button` selectors, and a selection control that
  matched them would start intercepting those clicks.
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
    // The real input, exposed so a host can manage focus. The import mapping dialog moves
    // focus here when it opens, and the input is visually hidden, so a host cannot reach it
    // by query without reaching through this component's internals.
    input = $bindable(null),
    ...rest
  } = $props();

  // Declared sizes only. Anything else falls back to `md` rather than emitting an
  // unstyled `is-*` class, so a typo renders a box instead of silently rendering nothing.
  const SIZES = new Set(['sm', 'md', 'lg']);
  const sizeClass = $derived(SIZES.has(size) ? `is-${size}` : 'is-md');

  // The indeterminate glyph is a minus, mirroring the tri-state page box: "some of these",
  // not "none of these". A box that is BOTH checked and indeterminate reads as
  // indeterminate, which is what the DOM property does too.
  const glyph = $derived(indeterminate ? 'fas fa-minus' : 'fas fa-check');

  // `indeterminate` has no HTML attribute — setting it in markup would do nothing at all,
  // silently. It is re-applied on every change so a re-render cannot drop it.
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
  <span class="fab-selection-check {sizeClass}" class:is-checked={checked} class:is-indeterminate={indeterminate} aria-hidden="true"><i class={glyph}></i></span>
{/snippet}

{#if wrapper === 'contents'}
  {@render control()}
{:else}
  <label class="fab-selection-checkbox" class:is-disabled={disabled}>{@render control()}</label>
{/if}

<style>
  /* Theme-ROOT tokens ONLY. This primitive is area-agnostic — it lives in
     `src/ui/svelte/components/`, beside `Stepper` and `Medallion` — so it must not
     reference `--fab-mv2-*`, which `styles/fabricate.css` declares on `.fabricate-manager`.
     Outside the manager the property is not in scope, the declaration becomes invalid at
     computed-value time, and the colour silently falls back to inheritance. Nothing fails;
     it just looks wrong. `Chip.svelte` records the same rule for the same reason.

     The aliases the converted Tool Studio box used resolve to exactly these tokens
     (`--fab-mv2-border-strong` IS `--fab-border-strong`, `--fab-mv2-accent` IS
     `--fab-accent`, `--fab-mv2-bg` IS `--fab-bg-1`), so `sm` renders pixel-identically to
     the box it replaced. `--fab-on-accent` is NOT the checked glyph colour: it differs
     from `--fab-bg-1` in every theme and would re-colour the shipped Tool Studio.

     Svelte compiles these to `.fab-selection-check.svelte-<hash>` and `css: 'injected'`
     puts the block in `document.head` UNLAYERED, so it beats Foundry core's layered
     control styling regardless of specificity. */

  .fab-selection-checkbox {
    /* Area-agnostic, so the padding model is declared rather than inherited from
       `.fabricate-manager * { box-sizing }`. */
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

  /* The real control stays in the DOM and stays focusable — it is what a keyboard, a
     screen reader and a `<label>` all act on. Only its CHROME is replaced. */
  .fab-selection-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
  }

  /* Foundry draws form controls THROUGH pseudo-elements, so a core `input::before` would
     paint over the box the moment any size rendered a visible input. The reset travels
     with the input into this primitive rather than being dropped from the global sheet as
     apparently dead code. */
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

  /* ── The size ladder. Each entry is stated, none is computed from another. ────────── */

  /* The shipped Tool Studio checklist box. It carries NO fill and NO font-size, because
     it carried neither before the extraction and this size must render byte-identically. */
  .fab-selection-check.is-sm {
    width: 18px;
    height: 18px;
    border-radius: 5px;
  }

  /* The page-selection box in a toolbar row. */
  .fab-selection-check.is-md {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    background: var(--fab-bg-0);
    font-size: 10px;
  }

  /* The browser row box. The opaque inset is load-bearing at this size: a 22px hollow
     outline sitting on a tinted row reads as a rendering artifact rather than an
     affordance. */
  .fab-selection-check.is-lg {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--fab-bg-0);
    font-size: 10px;
  }

  /* ── The three states. ───────────────────────────────────────────────────────────── */

  .fab-selection-check.is-checked {
    border-color: var(--fab-accent);
    background: var(--fab-accent);
    color: var(--fab-bg-1);
  }

  /* Indeterminate is "some of these", so it reads as an accent HINT rather than a filled
     answer: the accent edge and glyph over the soft accent wash. */
  .fab-selection-check.is-indeterminate {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  /* The focus ring belongs to the visible box, since the real control is 1px and
     transparent. A `contents` host owns its own ring — its whole row is the label — so
     this is scoped to the wrapper this primitive renders. */
  .fab-selection-checkbox:has(.fab-selection-input:focus-visible) .fab-selection-check {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
