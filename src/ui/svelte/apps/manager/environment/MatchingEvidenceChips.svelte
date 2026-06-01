<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  // variant: 'chips' (compact table cell) | 'checks' (inspector table)
  let { evidence = null, variant = 'chips' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const FIELDS = [
    { key: 'biome', label: 'Biome', anyFallback: 'All biomes' },
    { key: 'region', label: 'Region', anyFallback: 'All regions' },
    { key: 'weather', label: 'Weather', anyFallback: 'Any weather' },
    { key: 'time', label: 'Time', anyFallback: 'Any time' },
    { key: 'danger', label: 'Danger', anyFallback: 'Any danger' }
  ];
  const DANGER_LEVELS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

  function cap(value) {
    const str = String(value || '').trim();
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

  function fieldLabel(field) {
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Evidence.${field.label}`, field.label);
  }

  function anyLabel(field) {
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Evidence.${field.label}Any`, field.anyFallback);
  }

  function entryFor(field) {
    return evidence?.[field.key] || null;
  }

  function count(entry) {
    return Array.isArray(entry?.recordValues) ? entry.recordValues.length : 0;
  }

  function valueText(field, entry) {
    if (!entry || entry.state === 'any') return anyLabel(field);
    const values = (entry.recordValues || []).map(cap).filter(Boolean);
    return values.length ? values.join(', ') : anyLabel(field);
  }

  function tone(field, entry) {
    if (!entry || entry.state === 'any') return 'is-any';
    if (entry.state === 'match') return 'is-positive';
    // Weather and time are runtime gates (transient), not exclusion criteria,
    // so paint their mismatches as a warning instead of a hard danger.
    return (field.key === 'weather' || field.key === 'time') ? 'is-warning' : 'is-danger';
  }

  function normalized(value) {
    return String(value || '').trim().toLowerCase();
  }

  function dangerRank(value) {
    return DANGER_LEVELS.indexOf(normalized(value));
  }

  function valueMatches(field, value, entry) {
    if (!entry || entry.state === 'any') return true;
    const envValues = Array.isArray(entry.envValues) ? entry.envValues.map(normalized) : [];
    const candidate = normalized(value);
    if (field.key === 'danger') {
      const envRank = Math.max(...envValues.map(dangerRank), -1);
      const candidateRank = dangerRank(candidate);
      return candidateRank >= 0 && envRank >= 0 && candidateRank <= envRank;
    }
    return envValues.includes(candidate);
  }

  function mismatchTone(field) {
    return (field.key === 'weather' || field.key === 'time') ? 'is-warning' : 'is-danger';
  }

  function valuePills(field, entry) {
    if (!entry || entry.state === 'any') {
      return [{ id: `${field.key}-any`, value: anyLabel(field), state: 'any', tone: 'is-any' }];
    }
    const values = (entry.recordValues || []).map(cap).filter(Boolean);
    if (values.length === 0) {
      return [{ id: `${field.key}-any`, value: anyLabel(field), state: 'any', tone: 'is-any' }];
    }
    return values.map(value => {
      const matches = valueMatches(field, value, entry);
      return {
        id: `${field.key}-${normalized(value)}`,
        value,
        state: matches ? 'match' : 'mismatch',
        tone: matches ? 'is-positive' : mismatchTone(field)
      };
    });
  }

  // Which dimensions to surface. Chips: the two primary axes (biome, region)
  // plus any other dimension that actually constrains the match. Checks: every
  // applicable dimension so the inspector explains the full evaluation.
  const shown = $derived(FIELDS.filter(field => {
    const entry = entryFor(field);
    if (variant === 'checks') return true;
    if (field.key === 'biome' || field.key === 'region') return true;
    return entry && entry.applicable !== false && entry.state !== 'any';
  }).map(field => {
    const entry = entryFor(field);
    return { field, entry, count: count(entry), value: valueText(field, entry), tone: tone(field, entry), pills: valuePills(field, entry) };
  }));

  const summary = $derived(shown.map(row => row.value).join(' · '));
</script>

{#if variant === 'checks'}
  <table class="manager-environment-evidence is-checks manager-environment-evidence-table" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Evidence.Title', 'Matching evidence')}>
    <tbody>
      {#each shown as row (row.field.key)}
        <tr class={`manager-environment-evidence-row ${row.tone}`} data-evidence-field={row.field.key} data-evidence-state={row.entry?.state || 'any'}>
          <th class="manager-environment-evidence-dimension" scope="row">{fieldLabel(row.field)}</th>
          <td class="manager-environment-evidence-values">
            <div class="manager-environment-evidence-value-list">
              {#each row.pills as pill (pill.id)}
                <span class={`manager-environment-evidence-value-pill ${pill.tone}`} data-evidence-value-state={pill.state}>{pill.value}</span>
              {/each}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else}
  <div class="manager-environment-evidence is-chips" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Evidence.Title', 'Matching evidence')}>
    <div class="manager-environment-evidence-chips">
      {#each shown as row (row.field.key)}
        <span class={`manager-environment-evidence-chip ${row.tone}`} data-evidence-field={row.field.key} data-evidence-state={row.entry?.state || 'any'}>
          <span class="manager-environment-evidence-label">{fieldLabel(row.field)}</span>
          {#if row.count}<span class="manager-environment-evidence-count">{row.count}</span>{/if}
        </span>
      {/each}
    </div>
    {#if summary}
      <span class="manager-environment-evidence-summary">{summary}</span>
    {/if}
  </div>
{/if}
