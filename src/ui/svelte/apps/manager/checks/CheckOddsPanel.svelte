<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's CHANCE PER OUTCOME histogram. It renders the enumeration `checkOdds.js`
  computed and rolls nothing, so every bar is a real share of a fully enumerated space.

  THE `all N faces` CAPTION IS NOT DRAWN HERE: the rail section's heading row carries it, and a
  second copy could disagree, the head's own fallback being a regex over the AUTHORED formula. IT
  ABSTAINS LOUDLY, a formula outside the enumerable shape rendering a STATED note naming the
  reason rather than an approximation. BARS ARE `FillBar`, FLAT, per
  `openspec/specs/ui-integration/spec.md` → "Shared product UI primitives"; it is a LEAF with no
  `role` and no `aria-*`, so a row announces as a label/value pair with the bar decorative. No
  gradient: the band strip's full-track semantic scale is that requirement's only exemption.
-->
<script>
  import FillBar from '../../../components/FillBar.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { ODDS_REASONS, SANDBOX_ABSENT } from './checkOdds.js';

  let {
    /**
     * The enumeration view-model built by the route:
     * `{ enumerable, reason, faces, combinations, rows: [{ id, label, percent, success }] }`.
     */
    odds = null,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // One sentence per reason code: a shared line would make a refuse-everything predicate
  // indistinguishable from a correct one on the surface a GM actually reads.
  const REASON_COPY = {
    [ODDS_REASONS.parseThrew]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonParseThrew',
      'This formula is not complete yet, so it cannot be read.',
    ],
    [ODDS_REASONS.noDice]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNoDice',
      'This formula rolls no dice of its own, so there is nothing to chart.',
    ],
    [ODDS_REASONS.tooManyOutcomes]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonTooManyOutcomes',
      'This formula rolls too many dice to work every combination out exactly, and an estimate here would be worse than none.',
    ],
    [ODDS_REASONS.dieModifiers]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonDieModifiers',
      'This die carries a modifier (keep, reroll, explode, clamp), which changes the spread of results.',
    ],
    [ODDS_REASONS.nonUnitCount]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNonUnitCount',
      'This formula rolls several dice at once, so its results are not evenly spread. Chances are listed for a single die only.',
    ],
    [ODDS_REASONS.nonIntegerFaces]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNonIntegerFaces',
      'The number of faces on this die is itself rolled, so the outcome space is not fixed.',
    ],
    [ODDS_REASONS.nonNumericDenomination]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNonNumericDenomination',
      'This is a fudge or coin die rather than a numbered one, so its faces are not values.',
    ],
    [ODDS_REASONS.nonDeterministicRemainder]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNonDeterministicRemainder',
      'Part of this formula is rolled outside a single plain die — inside brackets, a pool or a function — so its results are not a flat list of faces.',
    ],
    [ODDS_REASONS.stringTerm]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonStringTerm',
      'Part of this formula is not a number or a die. Check for a stray word.',
    ],
    [ODDS_REASONS.unresolvedRollData]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonUnresolvedRollData',
      'This formula does not reduce to a number for the selected actor.',
    ],
    // NOT an enumerability refusal: the formula is enumerable and the missing input is the
    // EXPERIMENT. It shares this branch because the observable is the same, and it names the
    // control that fills it.
    [SANDBOX_ABSENT]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNoSandboxOrder',
      'A progressive check is counted in results awarded. Type an order of result difficulties under “Preview as” to see how often each count comes up.',
    ],
  };

  const reasonNote = $derived.by(() => {
    const entry = REASON_COPY[odds?.reason];
    return entry
      ? text(entry[0], entry[1])
      : text(
          'FABRICATE.Admin.Manager.Checks.Odds.ReasonUnknown',
          'The chances for this formula cannot be worked out.'
        );
  });

  const rows = $derived(Array.isArray(odds?.rows) ? odds.rows : []);
</script>

{#if !odds || odds.kind === null}
  <p class="manager-muted" data-checks-odds-state="no-check">
    {text(
      'FABRICATE.Admin.Manager.Checks.Odds.NoCheck',
      'This activity resolves without a roll, so there are no chances to list.'
    )}
  </p>
{:else if odds.enumerable !== true}
  <p
    class="manager-muted"
    data-checks-odds-state="not-enumerable"
    data-checks-odds-reason={odds.reason}
  >
    {reasonNote}
  </p>
{:else if rows.length === 0}
  <p class="manager-muted" data-checks-odds-state="no-outcomes">
    {text(
      'FABRICATE.Admin.Manager.Checks.Odds.NoOutcomes',
      'Add outcome bands to see how often each one comes up.'
    )}
  </p>
{:else}
  <div class="manager-checks-odds" data-checks-odds-state="enumerated">
    <ul class="manager-checks-odds-list">
      {#each rows as row (row.id)}
        <li class="manager-checks-odds-row" data-checks-odds-row={row.id}>
          <span class="manager-checks-odds-label">{row.label}</span>
          <FillBar
            value={row.percent}
            size="sm"
            tone={row.success ? 'success' : 'danger'}
            dataAttr="data-checks-odds-bar"
            dataValue={row.id}
          />
          <span class="manager-checks-odds-percent" data-checks-odds-percent={row.id}>
            {row.percent}%
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .manager-checks-odds-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A three-track row. The name column is bounded so a long localized tier name cannot
     squeeze the bar to nothing, and the percentage column is pinned so the numbers align. */
  .manager-checks-odds-row {
    display: grid;
    grid-template-columns: minmax(0, 5.5rem) 1fr 2.6rem;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
  }

  .manager-checks-odds-label {
    overflow: hidden;
    color: var(--fab-text);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-checks-odds-percent {
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
