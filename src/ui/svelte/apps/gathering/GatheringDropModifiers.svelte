<!-- Svelte 5 runes mode -->
<!--
  GatheringDropModifiers is the expanded body of a single drop row in
  GatheringTaskDrops. It breaks the drop's (modifier-adjusted) chance down into
  base + weather + time-of-day + biome + per-character-ability contributions,
  rendering each non-zero non-base contributor as a signed, tone-coloured line.
  When only the base chance contributes it shows a "no modifiers" note instead.
  The parent gates this on the row being expanded.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { toPercent as pct } from '../../util/gatheringFormat.js';

  let { drop = null } = $props();

  function signedPercent(value) {
    const magnitude = Math.abs(Math.trunc(Number(value) || 0));
    return `${Number(value) < 0 ? '-' : '+'}${magnitude}%`;
  }
  function toneClass(value) {
    const number = Number(value) || 0;
    if (number > 0) return 'is-positive';
    if (number < 0) return 'is-negative';
    return 'is-neutral';
  }

  // The non-base modifier lines for a drop (only non-zero contributors), in a
  // stable order: weather, time-of-day, biome, then each character ability.
  function modifierLines(target) {
    const modifiers = target?.modifiers ?? {};
    const lines = [];
    if (Number(modifiers.weather?.value)) {
      lines.push({ key: 'weather', icon: 'fas fa-cloud-sun', label: localize('FABRICATE.App.Gathering.Detail.ModifierWeather'), value: Number(modifiers.weather.value) });
    }
    if (Number(modifiers.timeOfDay?.value)) {
      lines.push({ key: 'timeOfDay', icon: 'fas fa-clock', label: localize('FABRICATE.App.Gathering.Detail.ModifierTimeOfDay'), value: Number(modifiers.timeOfDay.value) });
    }
    if (Number(modifiers.biome?.value)) {
      lines.push({ key: 'biome', icon: 'fas fa-mountain-sun', label: localize('FABRICATE.App.Gathering.Detail.ModifierBiome'), value: Number(modifiers.biome.value) });
    }
    for (const [index, entry] of (Array.isArray(modifiers.character) ? modifiers.character : []).entries()) {
      if (!Number(entry?.contribution)) continue;
      lines.push({ key: `character-${index}`, icon: entry.icon || 'fas fa-user', label: entry.label || '', value: Number(entry.contribution) });
    }
    return lines;
  }

  const lines = $derived(modifierLines(drop));
</script>

<div class="gathering-task-drop-modifiers" data-gathering-drop-modifiers>
  <p class="gathering-task-drop-modifiers-heading">{localize('FABRICATE.App.Gathering.Detail.Modifiers')}</p>
  <ul class="gathering-task-drop-modifier-list">
    <li class="gathering-task-drop-modifier is-base">
      <span class="gathering-task-drop-modifier-label">{localize('FABRICATE.App.Gathering.Detail.DropBaseChance')}</span>
      <span class="gathering-task-drop-modifier-value">{pct(drop.baseChance)}%</span>
    </li>
    {#each lines as line (line.key)}
      <li class="gathering-task-drop-modifier">
        <span class="gathering-task-drop-modifier-label">
          <i class={line.icon} aria-hidden="true"></i>{line.label}
        </span>
        <span class={`gathering-task-drop-modifier-value ${toneClass(line.value)}`}>{signedPercent(line.value)}</span>
      </li>
    {/each}
  </ul>
  {#if lines.length === 0}
    <p class="gathering-task-drop-no-modifiers" data-gathering-drop-no-modifiers>
      {localize('FABRICATE.App.Gathering.Detail.DropNoModifiers')}
    </p>
  {/if}
</div>

<style>
  .gathering-task-drop-modifiers {
    padding: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-surface);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-task-drop-modifiers-heading {
    margin: 0;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .gathering-task-drop-modifier-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gathering-task-drop-modifier {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    font-size: 12px;
  }

  .gathering-task-drop-modifier-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--fab-text);
  }

  .gathering-task-drop-modifier-label i {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .gathering-task-drop-modifier-value {
    flex: 0 0 auto;
    font-weight: 600;
  }

  .gathering-task-drop-modifier-value.is-positive {
    color: var(--fab-success-text);
  }

  .gathering-task-drop-modifier-value.is-negative {
    color: var(--fab-danger-text);
  }

  .gathering-task-drop-no-modifiers {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
