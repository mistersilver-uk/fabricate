<!-- Svelte 5 runes mode -->
<!--
  The FAILURE-RESULT POLICY card (issue 1098) — the On-failure section's first control on
  all three activity routes.

  It answers exactly ONE question, and the copy is written to keep it there: may a FAILED
  check produce a result at all. What a failed attempt COSTS is the consumption axis, and
  those toggles sit beside this card rather than inside it.

  ## Why the `perRecord` label is per-activity

  The persisted token is activity-independent, but the word "record" is not: crafting rolls
  for a recipe, salvage for a component, gathering for a task. The check-modifier
  combination rule already spells one rule three ways for exactly this reason, and a single
  "Decided per recipe" on the Gathering route would name an entity that route does not have.
  The nouns come in as props rather than being derived here, because a noun is copy.

  ## The inert note, and the prototype sentence it replaces

  The prototype's card description ends "Applies to every resolution mode." That clause is
  NOT adopted (issue 1098, DN11): the policy has no reach in `routedByIngredients` or
  `progressive` — neither has a failure tier or a reserved failure group to mark — nor in
  gathering `d100`, whose whole routed path ships dormant pending issue 683. Rather than
  render a control that quietly does nothing, this states WHY it does nothing in that mode
  and keeps the control readable and selectable, so a GM who later switches mode finds the
  value they authored still there.

  The control stays ENABLED under an inert mode on purpose. Disabling it would destroy the
  distinction between "this system forbids failure results" and "this mode cannot express
  them", and the policy is persisted per activity rather than per mode — a GM switching
  `routedByIngredients` to `routedByCheck` should not discover the field reset itself.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Callout from '../Callout.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';

  let {
    // The persisted value: 'never' | 'perRecord' | 'always'.
    value = 'perRecord',
    // Which activity this card is rendered on — only used to key the radio group name so
    // three cards on three routes never share a DOM group.
    activity = 'crafting',
    // The activity's record noun, already localized by the caller (the same
    // `RECORD_NOUNS` map the Difficulty card reads), singular: 'recipe' /
    // 'salvageable item' / 'gathering task'.
    recordNoun = 'recipe',
    // The plural of that noun, for the `always` card's "records without one" sentence.
    recordNounPlural = 'Recipes',
    // A stated reason the policy is inert in the CURRENT mode, or '' when it applies.
    // Pre-localized by the caller, which is the surface that knows the mode.
    inertNote = '',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function interpolate(sentence, replacements) {
    let out = sentence;
    for (const [token, replacement] of Object.entries(replacements)) {
      out = out.split(`{${token}}`).join(replacement);
    }
    return out;
  }

  // The three cards, in the prototype's order: the strictest first, the default in the
  // middle, the most permissive last. Icons read as "nothing at all", "it depends on the
  // record" and "always something".
  const options = $derived([
    {
      value: 'never',
      icon: 'fas fa-ban',
      label: text('FABRICATE.Admin.Manager.Checks.FailureResults.Never', 'Never'),
      description: text(
        'FABRICATE.Admin.Manager.Checks.FailureResults.NeverDesc',
        'A failed check produces nothing at all.'
      ),
    },
    {
      value: 'perRecord',
      icon: 'fas fa-code-branch',
      label: interpolate(
        text('FABRICATE.Admin.Manager.Checks.FailureResults.PerRecord', 'Decided per {record}'),
        { record: recordNoun }
      ),
      description: interpolate(
        text(
          'FABRICATE.Admin.Manager.Checks.FailureResults.PerRecordDesc',
          'Each {record} chooses for itself, so most fail with nothing while a few still yield a failure result.'
        ),
        { record: recordNoun }
      ),
    },
    {
      value: 'always',
      icon: 'fas fa-circle-check',
      label: text('FABRICATE.Admin.Manager.Checks.FailureResults.Always', 'Always'),
      description: interpolate(
        text(
          'FABRICATE.Admin.Manager.Checks.FailureResults.AlwaysDesc',
          'Every failed check produces its failure result. {records} without one produce nothing.'
        ),
        { records: recordNounPlural }
      ),
    },
  ]);
</script>

<section class="manager-inspector-card" data-failure-result-policy={activity}>
  <h3 class="manager-checks-card-title">
    {text(
      'FABRICATE.Admin.Manager.Checks.FailureResults.Heading',
      'Produce a result on a failed check'
    )}
  </h3>
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Checks.FailureResults.Intro',
      'Whether a failed check can still produce something — a ruined ingot, a torn hide, scraps.'
    )}
  </p>
  {#if inertNote}
    <Callout tone="info" text={inertNote} dataAttr="data-failure-result-policy-inert" />
  {/if}
  <RadioCardGroup
    legendKey="FABRICATE.Admin.Manager.Checks.FailureResults.Heading"
    legend="Produce a result on a failed check"
    {options}
    selectedValue={value}
    groupName={`checks-${activity}-failure-result-policy`}
    columns={1}
    dataAttr="data-failure-result-policy-group"
    optionDataAttr="data-failure-result-policy-option"
    onChange={(next) => onChange(next)}
  />
</section>
