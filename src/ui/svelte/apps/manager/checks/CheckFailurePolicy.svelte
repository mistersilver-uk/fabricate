<!-- Svelte 5 runes mode -->
<!--
  The FAILURE-RESULT POLICY card — the On-failure section's first control on all three activity
  routes. It answers exactly ONE question, and the copy is written to keep it there: may a
  FAILED check produce a result at all. What a failed attempt COSTS is the consumption axis, and
  those toggles sit beside this card rather than inside it.

  The `perRecord` label is PER-ACTIVITY, because the persisted token is activity-independent
  where the word "record" is not; the nouns come in as props, a noun being copy.

  THE INERT NOTE. The policy has no reach in `routedByIngredients` or `progressive` — neither has
  a failure tier or a reserved failure group to mark — nor in gathering's dormant routed path, so
  rather than render a control that quietly does nothing, this states WHY. The control stays
  ENABLED under an inert mode on purpose: disabling it would destroy the distinction between
  "this system forbids failure results" and "this mode cannot express them", and the policy is
  persisted per ACTIVITY rather than per mode.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Callout from '../Callout.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';

  let {
    // The persisted value: 'never' | 'perRecord' | 'always'.
    value = 'perRecord',
    // Keys the radio group name, so three cards on three routes never share a DOM group.
    activity = 'crafting',
    // The activity's singular record noun, already localized by the caller.
    recordNoun = 'recipe',
    // The plural of that noun, for the `always` card's "records without one" sentence.
    recordNounPlural = 'Recipes',
    // A stated reason the policy is inert in the CURRENT mode, or '' when it applies,
    // pre-localized by the caller, which is the surface that knows the mode.
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

  // The three cards, strictest first, the default in the middle, most permissive last.
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

<InspectorCard data-failure-result-policy={activity}>
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
    <!-- INFO stands: this sentence exists only because the CURRENT configuration makes the
         policy inert, which is exactly the live state the info tint is reserved for. -->
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
</InspectorCard>
