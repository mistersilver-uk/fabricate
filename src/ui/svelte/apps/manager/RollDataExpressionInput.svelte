<!-- Svelte 5 runes mode -->
<!--
  A roll-expression field, with or without the `@` affix.

  ── WHY THE AFFIX IS NOW OPTIONAL (maintainer ruling, issue 1096) ──────────────────────
  The affix was written when an expression was always a roll-data PATH: it rendered `@` as a
  separate cap, kept the input's own value sigil-free, and re-added the sigil on write. That
  was exactly right for `abilities.str.mod`.

  Dice changed the premise. An expression may now be `1d4`, or `2`, or
  `@abilities.str.mod + 2 + 1d4`, and a cap that prepends `@` to whatever is typed would turn
  `1d4` into `@1d4`. The shipped compromise was ADAPTIVE — show the cap only while the value is
  a single `@`-path, drop it as soon as it is not — and the maintainer has ruled against it:
  the field restructures itself as a GM types, which reads worse than either fixed option.

  So `sigil={false}` is a PLAIN input. It shows the stored value byte for byte and writes back
  byte for byte: no cap, no stripping, no re-prepending. The consequence is a requirement the
  surrounding copy has to teach, because nothing supplies it any more — a character-data
  expression must be written with its leading `@`.

  `sigil` defaults to TRUE so the Tool Studio's bonus-expression field, whose own hint states
  "Roll-data paths are stored with @ automatically", keeps the behaviour it documents. That
  field carries the same tension and has no ruling of its own.

  ── ON EXISTING DATA ───────────────────────────────────────────────────────────────────
  Nothing stored moves. `toStoredRollDataExpression` was the ONLY writer of the sigil and it
  ran on every input event, so a persisted pure path already carries its `@`; the affix was
  display-only, exactly as `displayRollDataExpression`'s contract says. A value that is stored
  BARE can only have arrived from an import or a hand-edited world — and such a value is
  already broken today, silently: the adaptive cap renders it as `[@][abilities.str.mod]`, so
  it LOOKS right while resolving to nothing. Dropping the cap makes that visible rather than
  causing it.
-->
<script>
  import {
    displayRollDataExpression,
    toStoredRollDataExpression,
  } from '../../../../systems/characterModifierPrerequisiteCopy.js';

  let {
    value = '',
    placeholder = 'abilities.str.mod',
    disabled = false,
    dataField = '',
    inputAttrs = {},
    // Whether the field supplies the roll-data `@` for the GM. See the header: `false` is a
    // plain input over the stored value, and the caller owns teaching the leading `@`.
    sigil = true,
    onChange = () => {},
  } = $props();

  const displayValue = $derived(sigil ? displayRollDataExpression(value) : String(value ?? ''));
  const showSigil = $derived(
    sigil &&
      (String(value || '').trim() === '' || /^@?[A-Za-z_][\w.]*$/.test(String(value || '').trim()))
  );

  function write(raw) {
    onChange(sigil ? toStoredRollDataExpression(raw) : raw);
  }
</script>

<div
  class="manager-prerequisite-path-input manager-roll-data-expression-input"
  class:is-formula={!showSigil}
>
  {#if showSigil}<span class="manager-prerequisite-at" aria-hidden="true">@</span>{/if}
  <input
    type="text"
    value={displayValue}
    {placeholder}
    {disabled}
    data-roll-data-expression={dataField || undefined}
    {...inputAttrs}
    oninput={(event) => write(event.currentTarget.value)}
  />
</div>
