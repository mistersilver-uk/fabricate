<!-- Svelte 5 runes mode -->
<!--
  The essence editor's tab strip (issue 1036) — Identity, On craft, Validation.

  A thin caller of the promoted `EditorTabs` primitive (issue 1038). It was authored as the
  eighth hand-rolled `{activeTab, badges, onSelect}` strip because the extraction obligation
  is to convert every existing site in the same change, and no primitive existed yet; issue
  1362 promoted one and this is the follow-up that owed it. This file now owns the tab list,
  the two badges, and this site's DOM contract — the `data-essence-tab` hook, the
  `essence-tab-*` / `essence-panel-*` id stem whose panels `EssenceEditView.svelte` renders,
  the `manager-essence-editor-tabs` container class and the strip's own aria-label. No
  rendered id, `aria-controls`, `data-*` attribute or class changed in the conversion.

  ── THE TAB IDS ARE LITERALS, TWICE ───────────────────────────────────────────────
  `idStem="essence"` builds `essence-tab-<id>` inside the primitive, so the View Lab's
  source-coverage scan cannot credit the ids it produces from THIS file either. The ids are
  therefore ALSO present as literals in `ESSENCE_EDITOR_TABS` in `essenceStudio.js`, which
  this file imports — and the scan reads the literal `'identity'`, `'oncraft'` and
  `'validation'` there.

  ── THE ON-CRAFT BADGE COUNTS CONFIGURED BEHAVIOURS ───────────────────────────────
  0, 1 or 2 — a linked source and a linked property macro — following
  `ToolEditorTabs.requirementCount`. It never counted EFFECTS, so dropping the prototype's
  invented "2 effects" number does not delete it. A zero renders NO badge, which is the
  primitive's own rule rather than a condition restated here.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { ESSENCE_EDITOR_TABS } from './essenceStudio.js';

  let {
    activeTab = 'identity',
    onCraftCount = 0,
    blockingCount = 0,
    warningCount = 0,
    onChange = () => {},
  } = $props();

  const TAB_LABEL_KEYS = {
    identity: 'FABRICATE.Admin.Manager.Essence.Tabs.Identity',
    oncraft: 'FABRICATE.Admin.Manager.Essence.Tabs.OnCraft',
    validation: 'FABRICATE.Admin.Manager.Essence.Tabs.Validation',
  };

  const TABS = ESSENCE_EDITOR_TABS.map((tab) => ({
    id: tab.id,
    icon: tab.icon,
    labelKey: TAB_LABEL_KEYS[tab.id],
    label: tab.fallback,
  }));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function issueCountLabel(count) {
    if (count === 1) return text('FABRICATE.Admin.Manager.Essence.ValidationIssue', '1 issue');
    return text('FABRICATE.Admin.Manager.Essence.ValidationIssues', '{count} issues').replace(
      '{count}',
      String(count)
    );
  }

  // Blocking outranks warning, and a clean tab shows a tick rather than a zero: a badge
  // reading `0` is indistinguishable at a glance from a badge reading `8`. The tick has no
  // readable name of its own, so it carries `ariaLabel`; `is-valid` is the shipped success
  // treatment for a tab badge.
  function validationBadgeFor(blocking, warnings) {
    if (blocking > 0) {
      return { tone: 'danger', label: String(blocking), ariaLabel: issueCountLabel(blocking) };
    }
    if (warnings > 0) {
      return { tone: 'warning', label: String(warnings), ariaLabel: issueCountLabel(warnings) };
    }
    return {
      tone: 'positive',
      label: '✓',
      class: 'is-valid',
      ariaLabel: text('FABRICATE.Admin.Manager.Essence.ValidationAllValid', 'All checks pass'),
    };
  }

  const badges = $derived({
    oncraft: onCraftCount,
    validation: validationBadgeFor(blockingCount, warningCount),
  });
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  onSelect={onChange}
  ariaLabelKey="FABRICATE.Admin.Manager.Essence.Tabs.Label"
  ariaLabel="Essence editor sections"
  idStem="essence"
  hookAttribute="data-essence-tab"
  containerClass="manager-essence-editor-tabs manager-editor-tabs"
  danger
/>
