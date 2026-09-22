<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's five-SECTION strip for whichever activity route is open, a THIN CALLER of
  the promoted `EditorTabs` primitive: this file owns the section-to-tab mapping, the
  `checks-section-*` / `checks-panel-*` id stems, the `data-checks-*` hooks and the issue count's
  localized unit, and the primitive owns the strip, the keyboard contract and every mark.

  Each section carries two INDEPENDENT markers per `openspec/specs/ui-system-studio/spec.md` → "GM
  Checks Studio": a COUNT mark, which a section with nothing to count renders NOT AT ALL rather
  than as a zero, so `null` and `0` read the same; and a WARNING dot carrying a TEXT accessible
  name. Only the SELECTED tab carries `aria-controls` — `activePanelOnly` — this strip rendering
  one panel at a time. The parent decides membership, so this does not know the modes.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EditorTabs from '../../../components/EditorTabs.svelte';

  let { sections = [], activeSection = 'roll', onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The dot must not be colour-and-shape-only, so its name states the UNIT rather than
  // "warning". The primitive refuses to draw a nameless dot; the words stay here.
  function issueName(count) {
    const key = count === 1 ? 'IssueCountOne' : 'IssueCountOther';
    const fallback = count === 1 ? '{count} issue' : '{count} issues';
    return text(`FABRICATE.Admin.Manager.Checks.Sections.${key}`, fallback).replace(
      '{count}',
      String(count)
    );
  }

  const tabs = $derived(
    sections.map((section) => ({
      id: section.id,
      icon: section.icon,
      labelKey: section.labelKey,
      label: section.labelFallback,
    }))
  );

  const marks = $derived(
    Object.fromEntries(
      sections.map((section) => [
        section.id,
        [
          typeof section.count === 'number' && section.count > 0
            ? { vehicle: 'count', label: section.count }
            : null,
          section.issues > 0 ? { vehicle: 'dot', name: issueName(section.issues) } : null,
        ].filter(Boolean),
      ])
    )
  );
</script>

<EditorTabs
  {tabs}
  activeTab={activeSection}
  badges={marks}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.Checks.Tabs.Label"
  ariaLabel="Checks sections"
  buttonIdStem="checks-section"
  panelIdStem="checks-panel"
  activePanelOnly
  hookAttribute="data-checks-section-button"
  containerAttribute="data-checks-sections"
  countAttribute="data-checks-section-count"
  dotAttribute="data-checks-section-dot"
  containerClass="manager-environment-tabs manager-checks-sections"
  buttonClass="manager-environment-tab-button"
/>
