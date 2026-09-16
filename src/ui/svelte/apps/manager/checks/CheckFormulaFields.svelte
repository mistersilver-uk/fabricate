<!-- Svelte 5 runes mode -->
<!--
  FORMULA — what is rolled, and what a roll actually resolves to. Three parts, in order: the
  INPUT with its leading dice glyph and right-aligned `avg N` reading; `WHAT ACTUALLY GETS
  ROLLED`, an inset restating the formula with each applied check modifier as a chip plus one
  sentence naming the rule that combines them; and the suggestion chips derived from the active
  world. The DC and comparison are the `Difficulty` card's: this answers "what is rolled" and it
  answers "what is it measured against".

  Part 2 is why a bare input was not enough. Check modifiers are added to the roll AUTOMATICALLY
  and deliberately never appear in the formula text, so the field a GM types into is not the
  expression the engine rolls; this says so IN the expression, the only place a GM can check it
  against what they meant.

  `avg` TAKES ROLL-DATA TERMS AS ZERO, AND SAYS SO. A roll-data path has no value on this
  screen, so the average is of the DICE with every `@` term taken as zero and the reading carries
  a title stating exactly that. Showing nothing was the alternative and is worse, almost every
  real formula carrying an `@` term; an expression that cannot be reduced withholds the reading
  rather than guessing. For the same reason THE RULE SENTENCE STOPS AT THE RULE: naming it is
  the part that is true with no previewed actor.

  Controlled: reads the formula and emits a partial patch through `onChange`.
-->
<script>
  import { getModifierExpressionSuggestions } from '../../../../../config/modifierExpressionSuggestions.js';
  import { reduceRollExpression } from '../../../../../utils/rollExpressionAverage.js';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    rollFormula = '',
    placeholder = '1d20+@abilities.int.mod',
    foundrySystemId = '',
    // The check modifiers this check APPLIES, already resolved against the catalogue by the
    // caller as `[{ id, name, icon }]`. Eligibility depends on the activity's whole modifier
    // context, which lives one level up and is what the Modifiers section counts from.
    appliedModifiers = [],
    // Which rule combines them: `addAll` | `highest` | `bySubject` | `playerPicks`.
    modifierPolicy = 'addAll',
    // The activity's word for the thing a check is rolled for, for the `bySubject` sentence.
    recordNoun = 'recipe',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The formula token quick-add row, DERIVED FROM THE ACTIVE WORLD and never a literal list. A
  // literal list shipped a term that resolves against nothing, so one click wrote it into the
  // formula and BROKE the check — a one-click path to a broken check being worse than no chip —
  // and the rest were system-shaped guesses in a system-agnostic module.
  //
  // `getModifierExpressionSuggestions` is the derivation the modifier chips already use, and its
  // system-specific half comes from the shipped preset bundles, so a chip can only offer a path
  // the product would itself author for this world and an UNSUPPORTED world degrades to the
  // system-agnostic terms. That removes the class of defect rather than the instance.
  const quickTokens = $derived(
    getModifierExpressionSuggestions(foundrySystemId).map((suggestion) => suggestion.expression)
  );

  function appendToken(token) {
    const current = String(rollFormula || '').trim();
    onChange({ rollFormula: current ? `${current} + ${token}` : token });
  }

  const formulaLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaLabel', 'Formula')
  );

  // Every `@`-path taken as ZERO. `reduceRollExpression` needs the substitution to have
  // happened already and REFUSES an expression it cannot fully consume, so a formula with a
  // stray token reduces to NaN and the reading is withheld rather than read off a prefix.
  const average = $derived.by(() => {
    const source = String(rollFormula || '').trim();
    if (source === '') return null;
    const { value } = reduceRollExpression(source.replaceAll(/@[\w.[\]-]+/g, '0'));
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  });

  const DEFAULT_MODIFIER_ICON = 'fas fa-wand-magic-sparkles';
  const applied = $derived(Array.isArray(appliedModifiers) ? appliedModifiers : []);

  // ONE sentence naming the rule in force, restating what the Modifiers section authors rather
  // than re-deciding it: `modifierPolicy` is that section's own value.
  const ruleSentence = $derived.by(() => {
    if (applied.length === 0) {
      return text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedNoModifiers',
        'No check modifiers apply, so the roll is exactly the formula above.'
      );
    }
    if (modifierPolicy === 'highest') {
      return text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedHighest',
        'Highest — only the best applied modifier reaches the roll, ranked by its average.'
      );
    }
    if (modifierPolicy === 'bySubject') {
      return text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedBySubject',
        'Chosen per {record} — each {record} picks which of these apply, and the picks are summed.'
      ).replaceAll('{record}', recordNoun);
    }
    if (modifierPolicy === 'playerPicks') {
      return text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedPlayerPicks',
        'Player picks — the crafter chooses from these at roll time, and the picks are summed.'
      );
    }
    return text(
      'FABRICATE.Admin.Manager.Checks.Crafting.ResolvedAddAll',
      'Add all — every applied modifier is summed into the roll.'
    );
  });
</script>

<div class="manager-checks-formula">
  <!-- The CARD TITLE is `Formula`, so the input takes an `aria-label` rather than a second
       visible label repeating it. -->
  <div class="manager-checks-formula-input">
    <i class="fas fa-dice-d20" aria-hidden="true"></i>
    <!-- THE CONTROL HALF of the Validation route's row action. All three roll issues are about
         THIS field, and it is the roll section's first control in every editor rendering the
         section, so `ChecksValidationTab` addresses it as `checks-roll-formula`. An `<input>` is
         natively focusable, so it needs no `tabindex` and no keyboard-focus declaration. -->
    <input
      data-check-roll-formula
      data-validation-target="checks-roll-formula"
      aria-label={formulaLabel}
      value={rollFormula || ''}
      {placeholder}
      oninput={(event) => onChange({ rollFormula: event.currentTarget.value })}
    />
    {#if average !== null}
      <span
        class="manager-checks-formula-average"
        data-check-formula-average={average}
        title={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.AverageHint',
          'The average of the dice, with every character value taken as zero — no actor is chosen on this screen.'
        )}
      >
        {text('FABRICATE.Admin.Manager.Checks.Crafting.Average', 'avg')}
        <span>{average}</span>
      </span>
    {/if}
  </div>

  <div class="manager-checks-formula-resolved" data-check-formula-resolved>
    <i class="fas fa-equals" aria-hidden="true"></i>
    <div class="manager-checks-formula-resolved-body">
      <p class="manager-checks-formula-kicker">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.ResolvedTitle', 'What actually gets rolled')}
      </p>
      <p class="manager-checks-formula-expression">
        <span class="manager-checks-formula-base">{rollFormula || placeholder}</span>
        {#if applied.length > 0}
          <!-- The join between the FORMULA and the modifier list carries the accent and the separators
               inside the list are subtle, so the expression reads as one written term plus a set of
               automatic ones rather than as a flat sum. -->
          <span class="manager-checks-formula-join" aria-hidden="true">+</span>
        {/if}
        {#each applied as modifier, index (modifier.id)}
          {#if index > 0}
            <span class="manager-checks-formula-sep" aria-hidden="true">+</span>
          {/if}
          <span class="manager-checks-formula-chip" data-check-formula-modifier={modifier.id}>
            <i class={modifier.icon || DEFAULT_MODIFIER_ICON} aria-hidden="true"></i>
            <span>{modifier.name}</span>
          </span>
        {/each}
      </p>
      <p class="manager-checks-formula-rule" data-check-formula-rule={modifierPolicy}>
        {ruleSentence}
      </p>
    </div>
  </div>

  <!-- Real `<button>`s: this row is five controls a GM operates, and a span with an `onclick`
       is reachable by neither the keyboard nor a screen reader. -->
  <span class="manager-checks-formula-tokens" data-check-formula-tokens>
    {#each quickTokens as token (token)}
      <button
        type="button"
        class="manager-checks-formula-token"
        data-check-formula-token={token}
        onclick={() => appendToken(token)}
      >
        <!-- The verb as a GLYPH: the chip APPENDS the term to the formula, and a literal `+`
             character in the label reads as part of the expression rather than as the action. -->
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{token}</span>
      </button>
    {/each}
  </span>
</div>
