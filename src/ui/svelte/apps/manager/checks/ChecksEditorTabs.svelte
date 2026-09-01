<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's five-SECTION strip (issue 1096).

  It used to be the four-ACTIVITY tab strip. Those four became rail routes, and what spans
  the pane now is the section strip for whichever activity route is open: The roll /
  Outcomes / Triggers / Modifiers / On failure.

  A THIN CALLER of the promoted `EditorTabs` primitive since issue 1429. This file owns the
  section-to-tab mapping, the `checks-section-*` / `checks-panel-*` id stems, the
  `data-checks-*` hooks and the issue count's localized unit; the primitive owns the strip,
  the keyboard contract and the drawing of every mark. Issue 1038 ruled this strip out of
  conversion, and its leading reason was that its count "is a bare mono numeral, not a chip
  — the two treatments are deliberately different". That is a STYLE divergence, which is the
  one kind of divergence a shared primitive may never record; the honest reading is that this
  strip was RIGHT about the marks and `EditorTabs` was too narrow to express them.

  Each section carries two independent markers, and the distinction is the point:

  - a COUNT mark — how many things are authored here (tiers, triggers, eligible modifiers).
    This is the Rail Marker Family's RECORD-COUNT vehicle. A section with nothing to count
    renders no marker at all rather than a zero, so `simple` and `progressive` render
    Outcomes unbadged even though Outcomes renders in every mode; a ZERO is not a count worth
    a marker, since five sections each wearing a `0` is chrome, not information, and no frame
    the design is drawn from shows one. `null` and `0` therefore read the same here —
    unmarked — while the number itself stays this component's own derivation rather than
    being clamped upstream.
  - a WARNING dot — that this section owns at least one open readiness issue. It carries a
    TEXT accessible name naming the unit ("1 issue"), because colour and shape alone are
    not a signal; the frames it is drawn from show a bare dot after the label and nothing
    else. A section may carry both markers at once.

  Both are fed from the SAME `evaluateCheckReadiness` pass that feeds the rail's badge and
  the Validation route, bucketed by `CHECK_ISSUE_SECTIONS`, so the three can never disagree
  about whether a check is ready or about where the problem lives.

  Only the SELECTED tab carries `aria-controls`, which is `EditorTabs`'s `activePanelOnly`
  mode: this strip renders one panel at a time, so the other four would point at ids that
  resolve to nothing — an IDREF to nowhere, which assistive technology reports as a broken
  relationship rather than as "not currently shown".

  The parent decides membership: an inapplicable section is simply absent from `sections`,
  and an optional check that is OFF collapses the strip to one entry. This component does
  not know the modes.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EditorTabs from '../EditorTabs.svelte';

  let { sections = [], activeSection = 'roll', onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // "{count} issue" / "{count} issues" — the dot's whole reason for existing is that it
  // must not be colour-and-shape-only, so the name states the unit rather than "warning".
  // The primitive draws the dot and refuses to draw a nameless one; the WORDS are this
  // surface's own domain text and stay here.
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
