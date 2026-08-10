<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's five-SECTION strip (issue 1096).

  It used to be the four-ACTIVITY tab strip. Those four became rail routes, and what spans
  the pane now is the section strip for whichever activity route is open: The roll /
  Outcomes / Triggers / Modifiers / On failure.

  Each section carries two independent markers, and the distinction is the point:

  - a COUNT badge — how many things are authored here (tiers, triggers, eligible
    modifiers). A section with nothing to count renders no badge at all rather than a
    zero, so `simple` and `progressive` render Outcomes unbadged even though Outcomes
    renders in every mode.
  - a WARNING dot — that this section owns at least one open readiness issue. It carries a
    TEXT accessible name naming the unit ("1 issue"), because colour and shape alone are
    not a signal; the frames it is drawn from show a bare dot after the label and nothing
    else. A section may carry both markers at once.

  Both are fed from the SAME `evaluateCheckReadiness` pass that feeds the rail's badge and
  the Validation route, bucketed by `CHECK_ISSUE_SECTIONS`, so the three can never disagree
  about whether a check is ready or about where the problem lives.

  The parent decides membership: an inapplicable section is simply absent from `sections`,
  and an optional check that is OFF collapses the strip to one entry. This component does
  not know the modes.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { sections = [], activeSection = 'roll', onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // "{count} issue" / "{count} issues" — the dot's whole reason for existing is that it
  // must not be colour-and-shape-only, so the name states the unit rather than "warning".
  function issueName(count) {
    const key = count === 1 ? 'IssueCountOne' : 'IssueCountOther';
    const fallback = count === 1 ? '{count} issue' : '{count} issues';
    return text(`FABRICATE.Admin.Manager.Checks.Sections.${key}`, fallback).replace(
      '{count}',
      String(count)
    );
  }

  function onKeydown(event, index) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + sections.length) % sections.length;
    onSelect(sections[nextIndex].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<div
  class="manager-environment-tabs manager-checks-sections"
  role="tablist"
  data-checks-sections
  aria-label={text('FABRICATE.Admin.Manager.Checks.Tabs.Label', 'Checks sections')}
>
  {#each sections as section, index (section.id)}
    <button
      type="button"
      role="tab"
      id={`checks-section-${section.id}`}
      class={`manager-environment-tab-button ${activeSection === section.id ? 'is-active' : ''}`}
      aria-selected={activeSection === section.id}
      aria-controls={`checks-panel-${section.id}`}
      tabindex={activeSection === section.id ? 0 : -1}
      data-checks-section-button={section.id}
      onclick={() => onSelect(section.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={section.icon} aria-hidden="true"></i>
      <span>{text(section.labelKey, section.labelFallback)}</span>
      <!-- A ZERO is not a count worth a badge: five sections each wearing a `0` is chrome,
           not information, and no frame the design is drawn from shows one. `null` and `0`
           therefore read the same here — unbadged — while the number itself stays the
           section's own derivation rather than being clamped upstream. -->
      {#if typeof section.count === 'number' && section.count > 0}
        <span class="manager-checks-section-count" data-checks-section-count={section.id}
          >{section.count}</span
        >
      {/if}
      {#if section.issues > 0}
        <span
          class="manager-checks-section-dot"
          role="img"
          data-checks-section-dot={section.id}
          aria-label={issueName(section.issues)}
        ></span>
      {/if}
    </button>
  {/each}
</div>
