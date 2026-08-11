<!-- Svelte 5 runes mode -->
<!--
  Shared ROLL FORMULA row for the crafting check editors (simple, routed and
  progressive). Controlled: reads the formula and emits a partial patch via onChange (the
  parent merges it into the whole check object).

  It used to carry the DC and the meet/exceed comparison too. They are the `Difficulty`
  card's now (issue 1096, `CheckDifficultyCard.svelte`): this row answers "what is rolled"
  and those two answer "what is it measured against", and a control answering the second
  question inside the card answering the first is how a GM comes to read the DC as a term
  in the formula.
-->
<script>
  import { getModifierExpressionSuggestions } from '../../../../../config/modifierExpressionSuggestions.js';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    rollFormula = '',
    placeholder = '1d20+@abilities.int.mod',
    foundrySystemId = '',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The formula token quick-add row (issue 1096). DERIVED FROM THE ACTIVE WORLD, never a
  // literal list.
  //
  // It WAS a literal list, and it shipped `@ingredients` — a term that resolves against
  // nothing, so one click on the chip wrote it into the formula and BROKE the check. A
  // one-click path to a broken check is worse than no chip at all, and the other four were
  // no better evidenced: `@prof` and `@level` are dnd5e-shaped guesses in a system-agnostic
  // module, and nothing anywhere proved any of the five against a real actor's roll data.
  //
  // `getModifierExpressionSuggestions` is the derivation the modifier chips already use: its
  // system-specific half comes from the shipped preset bundles
  // (`getCharacterModifierPresetsForFoundrySystem`), so a chip can only ever offer a path the
  // product would itself author for this world, and an UNSUPPORTED world degrades to the
  // system-agnostic terms rather than offering a dnd5e path it does not have. That removes
  // the whole class of defect rather than the one instance of it.
  const quickTokens = $derived(
    getModifierExpressionSuggestions(foundrySystemId).map((suggestion) => suggestion.expression)
  );

  function appendToken(token) {
    const current = String(rollFormula || '').trim();
    onChange({ rollFormula: current ? `${current} + ${token}` : token });
  }
</script>

<div class="manager-checks-formula-row">
  <label class="manager-field manager-checks-formula-field">
    <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaLabel', 'Formula')}</span>
    <input
      data-check-roll-formula
      value={rollFormula || ''}
      {placeholder}
      oninput={(event) => onChange({ rollFormula: event.currentTarget.value })}
    />
    <!-- Real `<button>`s, never the prototype's click-handled bare spans: this row is five
         controls a GM operates, and a span with an `onclick` is reachable by neither the
         keyboard nor a screen reader. -->
    <span class="manager-checks-formula-tokens" data-check-formula-tokens>
      {#each quickTokens as token (token)}
        <button
          type="button"
          class="manager-checks-formula-token"
          data-check-formula-token={token}
          onclick={() => appendToken(token)}
        >
          + {token}
        </button>
      {/each}
    </span>
  </label>
</div>
