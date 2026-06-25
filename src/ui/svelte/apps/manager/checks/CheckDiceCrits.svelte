<!-- Svelte 5 runes mode -->
<!--
  Shared per-die critical-rolls table for the crafting check editors (simple,
  routed, and progressive). One group per unique die in the roll formula; each
  group holds rows keyed by id. A row is a raw die total that FORCES an extreme
  (and optionally breaks tools) — there is no off state. What that extreme MEANS
  is caller-supplied via `forceOnLabel`/`forceOffLabel`: pass/fail checks force
  success/failure, while the progressive check forces award-all/award-none.
  Controlled: reads `diceCrits` + `rollFormula` and emits the next `diceCrits`
  array via onChange.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    parseDiceGroups,
    parsePlainDiceGroups
  } from '../../../../../utils/craftingCheckExpression.js';

  // `forceOnLabel`/`forceOffLabel` override the Force Outcome pill text (already
  // localized by the caller); when null the simple/routed success/failure labels
  // are used.
  let {
    rollFormula = '',
    diceCrits = [],
    forceOnLabel = null,
    forceOffLabel = null,
    onChange = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Interpolating variant for hint copy with `{die}`/`{min}`/`{max}` placeholders.
  // Falls back to a locally-interpolated default when the key is unresolved so a
  // missing key never leaves a raw placeholder on screen.
  function formatText(key, data, fallback) {
    const translated = localize(key, data);
    if (translated && translated !== key) return translated;
    return fallback.replace(/\{(\w+)\}/g, (_, name) => String(data[name] ?? ''));
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const crits = $derived(Array.isArray(diceCrits) ? diceCrits : []);
  // One row per unique PLAIN die in the formula, carrying its producible range
  // (the group-total range [N, N*S]) so the raw-roll input can be clamped to it.
  // Only plain, unmodified `NdS` terms are crit-eligible — crits match a die's
  // group total, which modified pools (keep/drop/explode/reroll) don't expose.
  const uniqueDice = $derived(
    parsePlainDiceGroups(rollFormula).reduce((list, group) => {
      if (!list.some((die) => die.raw === group.raw)) {
        list.push({
          raw: group.raw,
          count: group.count,
          min: group.count,
          max: group.count * group.sides
        });
      }
      return list;
    }, [])
  );
  // The set of plain (crit-eligible) die keys, used to detect orphaned crits.
  const plainDiceKeys = $derived(new Set(uniqueDice.map((die) => die.raw)));
  // Modified pools in the formula (e.g. `2d20kh1` → stripped key `2d20`) that are
  // NOT plain: crit-ineligible. Listed so the editor can show the modified-pool
  // hint and surface any crit still keyed to them under a removal notice.
  const modifiedPoolKeys = $derived(
    parseDiceGroups(rollFormula).reduce((list, group) => {
      if (!plainDiceKeys.has(group.raw) && !list.includes(group.raw)) list.push(group.raw);
      return list;
    }, [])
  );
  // Crits that can no longer match the formula (keyed to a modified pool, or to a
  // die that left the formula). The normalizer drops these on save; the editor
  // surfaces them first so the change is never silent.
  const orphanedCrits = $derived(crits.filter((crit) => !plainDiceKeys.has(crit.die)));
  // Orphaned crits grouped by their (now unmatchable) die key, each shown under an
  // explicit removal notice so the GM sees what will be dropped on save.
  const orphanGroups = $derived(
    orphanedCrits.reduce((groups, crit) => {
      const existing = groups.find((group) => group.die === crit.die);
      if (existing) existing.rows.push(crit);
      else groups.push({ die: crit.die, rows: [crit] });
      return groups;
    }, [])
  );
  const orphanedDiceKeys = $derived(new Set(orphanGroups.map((group) => group.die)));
  // Modified pools with no crits keyed to them: show the hint and no Add control.
  const modifiedPoolsWithoutCrits = $derived(
    modifiedPoolKeys.filter((key) => !orphanedDiceKeys.has(key))
  );

  const successOnLabel = $derived(
    forceOnLabel ?? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOn', 'Success')
  );
  const successOffLabel = $derived(
    forceOffLabel ?? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOff', 'Failure')
  );
  const breakOnLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break'));
  const breakOffLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break"));
  const modifiedPoolHint = $derived(
    text(
      'FABRICATE.Admin.Manager.Checks.Crafting.CritModifiedPoolHint',
      "Critical rolls match a die's total. They aren't available for pools that keep, drop, explode, or reroll dice (e.g. 2d20kh1)."
    )
  );
  const orphanedCritNotice = $derived(
    text(
      'FABRICATE.Admin.Manager.Checks.Crafting.CritOrphanedNotice',
      'These critical rolls can no longer match this formula and will be removed when you save.'
    )
  );

  function critsForDie(die) {
    return crits.filter((crit) => crit.die === die);
  }

  function addCrit(die) {
    onChange([...crits, { id: newId(), die: die.raw, raw: die.max, success: false, breakTools: false }]);
  }

  function updateCrit(id, patch) {
    onChange(crits.map((crit) => (crit.id === id ? { ...crit, ...patch } : crit)));
  }

  function removeCrit(id) {
    onChange(crits.filter((crit) => crit.id !== id));
  }

  function setCritRaw(id, min, max, rawValue) {
    updateCrit(id, { raw: Math.max(min, Math.min(max, numeric(rawValue))) });
  }

  // For a multi-die group (N>1) the crit value is the dice TOTAL over [N, N*S],
  // not a single die face. Surface that in a per-group hint line.
  function multiDieHint(die) {
    return formatText(
      'FABRICATE.Admin.Manager.Checks.Crafting.CritMultiDieHint',
      { die: die.raw, min: die.min, max: die.max },
      'The value is the {die} total, from {min} to {max}.'
    );
  }

  // The raw-roll input's accessible name. For a multi-die group it encodes the die
  // and its total range (e.g. "Total for 2d6 (2 to 12)") since the visible "Raw
  // roll" header alone doesn't convey that the value is a group total.
  function critRawAriaLabel(die) {
    if (die.count > 1) {
      return formatText(
        'FABRICATE.Admin.Manager.Checks.Crafting.CritRawMultiAria',
        { die: die.raw, min: die.min, max: die.max },
        'Total for {die} ({min} to {max})'
      );
    }
    return text('FABRICATE.Admin.Manager.Checks.Crafting.CritRaw', 'Raw roll');
  }
</script>

<div class="manager-checks-card-head">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritTitle', 'Critical rolls')}</h3>
</div>
{#if uniqueDice.length === 0 && modifiedPoolKeys.length === 0 && orphanedCrits.length === 0}
  <p class="manager-muted" data-dice-empty>{text('FABRICATE.Admin.Manager.Checks.Crafting.NoDice', 'No dice detected in this expression.')}</p>
{:else}
  {#each uniqueDice as die (die.raw)}
    {@const rows = critsForDie(die.raw)}
    <div class="manager-checks-crit-group" data-crit-group={die.raw}>
      <div class="manager-checks-card-head manager-checks-crit-group-head">
        <span class="manager-checks-crit-die" data-crit-die={die.raw}>{die.raw}</span>
        <button type="button" class="manager-button" data-add-crit onclick={() => addCrit(die)}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddCrit', 'Add critical')}</span>
        </button>
      </div>
      {#if die.count > 1}
        <p class="manager-muted manager-checks-crit-hint" data-crit-multi-hint>{multiDieHint(die)}</p>
      {/if}
      {#if rows.length > 0}
        <div class="manager-checks-outcome-table is-crit" role="table" aria-label={`${die.raw} ${text('FABRICATE.Admin.Manager.Checks.Crafting.CritTitle', 'Critical rolls')}`}>
          <div class="manager-checks-outcome-head" role="row">
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritRaw', 'Raw roll')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritForce', 'Force Outcome')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}</span>
            <span role="columnheader" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}></span>
          </div>
          {#each rows as crit (crit.id)}
            <div class="manager-checks-outcome-row" role="row" data-crit-row={crit.id}>
              <input
                type="number"
                data-crit-raw
                min={die.min}
                max={die.max}
                aria-label={critRawAriaLabel(die)}
                value={crit.raw ?? die.max}
                oninput={(event) => setCritRaw(crit.id, die.min, die.max, event.currentTarget.value)}
              />
              <button
                type="button"
                class={`manager-checks-state-pill ${crit.success === true ? 'is-positive' : 'is-negative'}`}
                data-crit-success
                aria-pressed={crit.success === true}
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.CritForce', 'Force Outcome')}
                onclick={() => updateCrit(crit.id, { success: !(crit.success === true) })}
              >
                {crit.success === true ? successOnLabel : successOffLabel}
              </button>
              <button
                type="button"
                class={`manager-checks-state-pill ${crit.breakTools === true ? 'is-negative' : 'is-positive'}`}
                data-crit-break
                aria-pressed={crit.breakTools === true}
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}
                onclick={() => updateCrit(crit.id, { breakTools: !(crit.breakTools === true) })}
              >
                {crit.breakTools === true ? breakOnLabel : breakOffLabel}
              </button>
              <button
                type="button"
                class="manager-icon-button is-danger"
                data-remove-crit
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveCrit', 'Remove critical roll')}
                onclick={() => removeCrit(crit.id)}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
  {#each modifiedPoolsWithoutCrits as poolKey (poolKey)}
    <div class="manager-checks-crit-group" data-crit-modified-pool={poolKey}>
      <div class="manager-checks-card-head manager-checks-crit-group-head">
        <span class="manager-checks-crit-die" data-crit-die={poolKey}>{poolKey}</span>
      </div>
      <p class="manager-muted manager-checks-crit-hint" data-crit-modified-pool-hint>{modifiedPoolHint}</p>
    </div>
  {/each}
  {#each orphanGroups as group (group.die)}
    <div class="manager-checks-crit-group is-orphaned" data-crit-orphaned-group={group.die}>
      <div class="manager-checks-card-head manager-checks-crit-group-head">
        <span class="manager-checks-crit-die" data-crit-die={group.die}>{group.die}</span>
      </div>
      <p class="manager-muted manager-checks-crit-hint" data-crit-orphaned-notice role="alert">{orphanedCritNotice}</p>
      <div class="manager-checks-outcome-table is-crit" role="table" aria-label={`${group.die} ${orphanedCritNotice}`}>
        {#each group.rows as crit (crit.id)}
          <div class="manager-checks-outcome-row" role="row" data-crit-orphaned-row={crit.id}>
            <span class="manager-checks-crit-orphaned-value" data-crit-orphaned-raw>{crit.raw}</span>
            <button
              type="button"
              class="manager-icon-button is-danger"
              data-remove-crit
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveCrit', 'Remove critical roll')}
              onclick={() => removeCrit(crit.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/each}
{/if}
