<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  // variant: 'chips' (compact table cell) | 'checks' (inspector rows)
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

  function cap(value) {
    const str = String(value || '').trim();
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

  function fieldLabel(field) {
    return text(`FABRICATE.Admin.Manager.Environment.Evidence.${field.label}`, field.label);
  }

  function anyLabel(field) {
    return text(`FABRICATE.Admin.Manager.Environment.Evidence.${field.label}Any`, field.anyFallback);
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

  function tone(entry) {
    if (!entry || entry.state === 'any') return 'is-any';
    return entry.state === 'match' ? 'is-positive' : 'is-danger';
  }

  function icon(entry) {
    if (!entry || entry.state === 'any') return 'fas fa-circle';
    return entry.state === 'match' ? 'fas fa-circle-check' : 'fas fa-circle-xmark';
  }

  // Which dimensions to surface. Chips: the two primary axes (biome, region)
  // plus any other dimension that actually constrains the match. Checks: every
  // applicable dimension so the inspector explains the full evaluation.
  const shown = $derived(FIELDS.filter(field => {
    const entry = entryFor(field);
    if (variant === 'checks') return entry ? entry.applicable !== false : true;
    if (field.key === 'biome' || field.key === 'region') return true;
    return entry && entry.applicable !== false && entry.state !== 'any';
  }).map(field => {
    const entry = entryFor(field);
    return { field, entry, count: count(entry), value: valueText(field, entry), tone: tone(entry), icon: icon(entry) };
  }));

  const summary = $derived(shown.map(row => row.value).join(' · '));
</script>

{#if variant === 'checks'}
  <ul class="manager-environment-evidence is-checks" aria-label={text('FABRICATE.Admin.Manager.Environment.Evidence.Title', 'Matching evidence')}>
    {#each shown as row (row.field.key)}
      <li class={`manager-environment-evidence-check ${row.tone}`} data-evidence-field={row.field.key} data-evidence-state={row.entry?.state || 'any'}>
        <i class={row.icon} aria-hidden="true"></i>
        <span class="manager-environment-evidence-check-copy">
          <span class="manager-environment-evidence-check-label">{fieldLabel(row.field)}{row.count ? ` (${row.count})` : ''}</span>
          <span class="manager-environment-evidence-check-value">{row.value}</span>
        </span>
      </li>
    {/each}
  </ul>
{:else}
  <div class="manager-environment-evidence is-chips" aria-label={text('FABRICATE.Admin.Manager.Environment.Evidence.Title', 'Matching evidence')}>
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
