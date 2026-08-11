<!-- Svelte 5 runes mode -->
<!--
  FORMULA — what is rolled, and what a roll actually resolves to (issue 1096).

  Three parts, in the prototype's order:

  1. THE INPUT, with a leading dice glyph and a right-aligned `avg N` reading.
  2. `WHAT ACTUALLY GETS ROLLED` — an inset restating the formula with each applied check
     modifier as a chip, plus one sentence naming the rule that combines them.
  3. The suggestion chips, derived from the active world.

  This used to be a bare labelled input beside a DC stepper and a comparison select. Those
  two are the `Difficulty` card's now (`CheckDifficultyCard.svelte`): this answers "what is
  rolled" and they answer "what is it measured against".

  Part 2 is why a bare input was not enough. Check modifiers are added to the roll
  AUTOMATICALLY and deliberately never appear in the formula text, so the field a GM types
  into is not the expression the engine rolls. The pane lead says so in prose; this says it in
  the expression, which is the only place a GM can check it against what they meant.

  ## `avg` takes roll-data terms as ZERO, and says so

  A roll-data path (`@abilities.int.mod`) has no value on this screen: there is no actor in
  scope, and the rail's own "Preview as" says an actor arrives with the outcome preview. So
  the average is of the DICE, with every `@` term taken as zero, and the reading carries a
  title stating exactly that. Showing nothing at all was the alternative and it is worse:
  almost every real formula carries an `@` term, so the affordance would be invisible in
  practice. An expression that cannot be reduced withholds the reading rather than guessing.

  ## The rule sentence stops at the RULE

  The prototype's sentence continues "…For Sera Vane that is Dexterity +3, Intelligence +4,
  Strength +0". That half needs a previewed actor, which this screen does not have. Naming the
  rule is the part that is true without one; inventing the second half would be a claim about
  a character nobody has chosen.

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
    // caller — `[{ id, name, icon }]`. This component does not resolve them: eligibility
    // depends on the activity's whole modifier context (rule, default set, pick cap), which
    // lives one level up and is the same derivation the Modifiers section counts from.
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

  const formulaLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaLabel', 'Formula')
  );

  // Every `@`-path taken as ZERO. `reduceRollExpression` needs the substitution to have
  // happened already, and it REFUSES an expression it cannot fully consume — so a formula
  // with a stray token reduces to NaN and the reading is withheld rather than taken from a
  // prefix of it.
  const average = $derived.by(() => {
    const source = String(rollFormula || '').trim();
    if (source === '') return null;
    const { value } = reduceRollExpression(source.replaceAll(/@[\w.[\]-]+/g, '0'));
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  });

  const DEFAULT_MODIFIER_ICON = 'fas fa-wand-magic-sparkles';
  const applied = $derived(Array.isArray(appliedModifiers) ? appliedModifiers : []);

  // ONE sentence naming the rule in force. It restates the rule the Modifiers section
  // authors rather than re-deciding it: `modifierPolicy` is that section's own value.
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
    <input
      data-check-roll-formula
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
        {average}
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
          <!-- The join between the FORMULA and the modifier list carries the accent; the
               separators inside the list are subtle, so the expression reads as one written
               term plus a set of automatic ones rather than as a flat sum. -->
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
</div>
