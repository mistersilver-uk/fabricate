<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's CHANCE PER OUTCOME histogram (issue 1097).

  It renders the enumeration `checkOdds.js` computed; it computes nothing itself and it
  rolls nothing. Every bar is a real share of a fully enumerated outcome space.

  THE `all N faces` CAPTION IS NOT DRAWN HERE. Issue 1096 gives every rail section a heading
  row with a right-aligned adjunct, and that adjunct is where the domain reads; a second copy
  inside the card would put the same sentence on screen twice and — because the head's own
  fallback is a regex over the AUTHORED formula — the two could disagree. `ChecksRightMenu`
  therefore takes the number off THIS panel's view-model, which is the enumerator's own
  answer, and says nothing at all when the formula is not enumerable.

  ## It abstains loudly

  A formula outside the enumerable shape renders a STATED note naming the reason, never
  an approximation: a histogram that lies is worse than one that abstains. Each reason
  has its own sentence, so "why is there no chart" is answerable from the panel instead
  of from the source.

  ## Bars are `FillBar`, flat

  `ui-integration/spec.md` §Shared product UI primitives records the hand-rolled fill bars
  as a live non-conformance and names `FillBar` as the fix; a sixth hand-rolled bar here
  would move that count the wrong way. `FillBar` is a LEAF — no `role`, no `aria-*` — so
  this row is announced as an ordinary label/value pair with the bar decorative, which is
  the correct semantics for a percentage listed beside its own number.

  No gradient. The band strip's full-track semantic scale is the only exemption
  `ui-integration/spec.md` grants, and a value-width fill is not one.
-->
<script>
  import FillBar from '../../../components/FillBar.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { ODDS_REASONS } from './checkOdds.js';

  let {
    /**
     * The enumeration view-model built by the route:
     * `{ enumerable, reason, faces, rows: [{ id, label, percent, success }] }`.
     */
    odds = null,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // One sentence per reason code. A shared "not enumerable" line would make a
  // refuse-everything predicate indistinguishable from a correct one on the surface a GM
  // actually reads, which is the whole point of the codes being discriminated.
  const REASON_COPY = {
    [ODDS_REASONS.parseThrew]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonParseThrew',
      'This formula is not complete yet, so it cannot be read.',
    ],
    [ODDS_REASONS.noDice]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonNoDice',
      'This formula rolls no dice of its own, so there is nothing to chart.',
    ],
    [ODDS_REASONS.multipleDieGroups]: [
      'FABRICATE.Admin.Manager.Checks.Odds.ReasonMultipleDieGroups',
      'This formula rolls more than one group of dice. Chances are listed for a single die only.',
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

  /* A three-track row: a truncating name, the bar, and a right-aligned mono percentage.
     The name column is bounded so a long localized tier name cannot squeeze the bar to
     nothing, and the percentage column is pinned so the numbers align down the list. */
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
