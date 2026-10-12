<!--
  A position along an ordered set of named tiers: a `row` of `Chip` badges or a `column` ladder.
  Published through `game.fabricate.api.ui`, so it styles itself under any ancestor and reads no
  localization; every word is the caller's, already final.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tiers` | `{ id?, name, figure?, notes?, valence? }[]` | `[]` | In drawn order. `figure` and `notes` draw in `column` only. A non-array draws empty; a tier that is not a plain object is skipped but keeps its index. |
  | `currentIndex` | integer | `-1` | An index into `tiers` as passed; anything not an in-range integer reaches nothing. |
  | `direction` | `'ascending'` \| `'descending'` | `'ascending'` | Reached is `index <= currentIndex`, or `>=` when descending; an unknown value reads ascending. |
  | `layout` | `'row'` \| `'column'` | `'row'` | An unknown value reads row. |
  | `ariaLabel` / `currentLabel` / `reachedLabel` / `aheadLabel` | string | — | Required: the list's name, and each tier's state text. |
  | `hint` | string | `''` | A sentence beneath the track; nothing draws when empty. |
  | `class` | class string | `''` | Declared for Fabricate's own callers and not published. |

  Rest spread:
  - `{...rest}` lands on the root `<div>`, written after `class={…}`.

  Invariants:
  - `valence` (`positive`, `negative`, `neutral`; absent reads positive, unknown neutral) tones a
    reached tier only, the current one included — pinned by `tests/components/tier-track-mounted.test.js`.
  - `.fab-tier-track-hidden` restates the module's visually hidden set, because a companion's
    ancestor is not `.fabricate` — held by `tests/published-component-manifest.test.js`.
-->
<script>
  import Chip from './Chip.svelte';

  let {
    tiers = [],
    currentIndex = -1,
    direction = 'ascending',
    layout = 'row',
    ariaLabel,
    currentLabel,
    reachedLabel,
    aheadLabel,
    hint = '',
    class: extraClass = '',
    ...rest
  } = $props();

  const VALENCES = new Set(['positive', 'negative', 'neutral']);

  const isColumn = $derived(layout === 'column');
  const list = $derived(Array.isArray(tiers) ? tiers : []);
  const current = $derived(
    Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < list.length
      ? currentIndex
      : -1
  );
  const rungs = $derived(list.map((tier, index) => rungOf(tier, index)));
  const lastDrawn = $derived(rungs.findLastIndex(Boolean));

  function isTier(tier) {
    if (tier === null || typeof tier !== 'object' || Array.isArray(tier)) return false;
    const proto = Object.getPrototypeOf(tier);
    return proto === null || Object.getPrototypeOf(proto) === null;
  }

  function isReached(index) {
    if (current === -1) return false;
    return direction === 'descending' ? index >= current : index <= current;
  }

  function valenceOf(valence) {
    if (valence === undefined) return 'positive';
    return VALENCES.has(valence) ? valence : 'neutral';
  }

  function rungOf(tier, index) {
    if (!isTier(tier)) return null;
    const reached = isReached(index);
    const isCurrent = index === current;
    return {
      name: tier.name,
      figure: tier.figure,
      notes: Array.isArray(tier.notes) ? tier.notes : [],
      current: isCurrent,
      valence: reached ? valenceOf(tier.valence) : undefined,
      state: isCurrent ? currentLabel : reached ? reachedLabel : aheadLabel,
    };
  }
</script>

<div class={['fab-tier-track', isColumn ? 'is-column' : 'is-row', extraClass]} {...rest}>
  <ol class="fab-tier-track-list" role="list" aria-label={ariaLabel}>
    <!-- ratchet-exempt(lint): unkeyed, so a repeated or absent id or name cannot fault the mount -->
    {#each rungs as rung, index}
      {#if rung}
        <li
          class={[
            'fab-tier-track-tier',
            rung.valence && 'is-reached',
            rung.current && 'is-current',
          ]}
          aria-current={rung.current ? 'step' : undefined}
          data-valence={rung.valence}
        >
          {#if isColumn}
            <span
              class={['fab-tier-track-dot', rung.valence && `is-${rung.valence}`]}
              aria-hidden="true"
            ></span>
            <div class="fab-tier-track-body">
              <div class="fab-tier-track-head">
                {#if rung.current}
                  <span class="fab-tier-track-name">{rung.name}</span>
                {:else}
                  <span class="fab-tier-track-name"
                    >{rung.name} <span class="fab-tier-track-hidden">{rung.state}</span></span
                  >
                {/if}
                {#if rung.figure}<span class="fab-tier-track-figure">{rung.figure}</span>{/if}
                {#if rung.current}<span class="fab-tier-track-marker">{rung.state}</span>{/if}
              </div>
              <!-- ratchet-exempt(lint): unkeyed, so a repeated note cannot fault the mount -->
              {#each rung.notes as note}<p class="fab-tier-track-note">{note}</p>{/each}
            </div>
          {:else}
            <Chip tone={rung.valence ?? ''} icon={rung.current ? 'fas fa-location-dot' : ''}
              ><span class="fab-tier-track-name"
                >{rung.name} <span class="fab-tier-track-hidden">{rung.state}</span></span
              ></Chip
            >
            {#if index !== lastDrawn}
              <i class="fas fa-chevron-right fab-tier-track-chevron" aria-hidden="true"></i>
            {/if}
          {/if}
        </li>
      {/if}
    {/each}
  </ol>
  {#if hint}<p class="fab-tier-track-hint">{hint}</p>{/if}
</div>

<style>
  .fab-tier-track {
    position: relative;
    min-width: 0;
    font-family: inherit;
  }

  .fab-tier-track-list,
  .fab-tier-track-tier,
  .fab-tier-track-note,
  .fab-tier-track-hint {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fab-tier-track-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .fab-tier-track-tier {
    display: flex;
    align-items: center;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .fab-tier-track-chevron {
    color: var(--fab-text-subtle);
    font-size: 9px;
  }

  .fab-tier-track-hint {
    margin-top: var(--fab-space-1);
    color: var(--fab-text-muted);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .is-column > .fab-tier-track-list {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: var(--fab-space-chip);
  }

  .is-column .fab-tier-track-tier {
    align-items: flex-start;
    gap: var(--fab-space-2);
    padding-inline-start: var(--fab-space-2);
  }

  .is-column .fab-tier-track-tier.is-current {
    box-shadow: inset 2px 0 0 var(--fab-accent);
  }

  .fab-tier-track-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    margin-top: var(--fab-space-1);
    border-radius: 50%;
    background: var(--fab-bg-3);
  }

  .fab-tier-track-dot.is-positive {
    background: var(--fab-success);
  }

  .fab-tier-track-dot.is-negative {
    background: var(--fab-danger);
  }

  .fab-tier-track-dot.is-neutral {
    background: var(--fab-text-muted);
  }

  .fab-tier-track-body {
    flex: 1 1 auto;
    min-width: 0;
  }

  .fab-tier-track-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
  }

  .is-column .fab-tier-track-name {
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .is-column .is-reached .fab-tier-track-name {
    color: var(--fab-text-secondary);
  }

  .is-column .is-current .fab-tier-track-name {
    color: var(--fab-text);
  }

  .fab-tier-track-figure {
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    font-weight: 500;
  }

  .fab-tier-track-marker {
    color: var(--fab-accent);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-tier-track-note {
    margin-top: var(--fab-space-2xs);
    color: var(--fab-text-muted);
    font-size: 10px;
    line-height: 1.45;
  }

  .fab-tier-track-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
