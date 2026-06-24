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
  import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';

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
  // One row per unique die in the formula, carrying its producible range so the
  // raw-roll input can be clamped to it.
  const uniqueDice = $derived(
    parseDiceGroups(rollFormula).reduce((list, group) => {
      if (!list.some((die) => die.raw === group.raw)) {
        list.push({ raw: group.raw, min: group.count, max: group.count * group.sides });
      }
      return list;
    }, [])
  );

  const successOnLabel = $derived(
    forceOnLabel ?? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOn', 'Success')
  );
  const successOffLabel = $derived(
    forceOffLabel ?? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOff', 'Failure')
  );
  const breakOnLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break'));
  const breakOffLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break"));

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
</script>

<div class="manager-checks-card-head">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritTitle', 'Critical rolls')}</h3>
</div>
{#if uniqueDice.length === 0}
  <p class="manager-muted" data-dice-empty>{text('FABRICATE.Admin.Manager.Checks.Crafting.NoDice', 'No dice detected in this formula.')}</p>
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
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.CritRaw', 'Raw roll')}
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
{/if}
