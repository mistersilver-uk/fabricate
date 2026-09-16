<!--
  The essence editor's tab strip — `Essence rules` and `Validation` for a catalogued essence, and
  `Identity, On craft, Validation` for a CREATE draft. The SET is the caller's, passed as `tabs`.

  A thin caller of the promoted `EditorTabs` primitive. This file owns the tab SET, the two badges
  and this site's DOM contract — the `data-essence-tab` hook, the `essence-tab-*` /
  `essence-panel-*` id stem, the container class and the strip's aria-label — and no rendered id,
  `aria-controls`, `data-*` attribute or class changed in the conversion.

  THE KEYBOARD MODEL CAME WITH THE PRIMITIVE, WHICH IS WHY THE VARIABLE SET IS SAFE: this file used
  to close over `tabs.length` in its own handler, so two-tab and three-tab sets were two things to
  keep in step. `EditorTabs` derives every index from the `tabs` it is handed.

  THE TAB IDS ARE LITERALS, TWICE, because the primitive builds them from `idStem` and the View
  Lab's source-coverage scan cannot credit ids produced that way. They are also literals in
  `ESSENCE_EDITOR_TABS` and `ESSENCE_RULES_TABS`, which is where the scan reads them.

  THE ON-CRAFT BADGE COUNTS CONFIGURED BEHAVIOURS — 0, 1 or 2 — following
  `ToolEditorTabs.requirementCount`, and never counted EFFECTS. A zero renders NO badge, which is
  the primitive's own rule, and the rules set has no `oncraft` tab for the entry to match.
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { ESSENCE_EDITOR_TABS } from './essenceStudio.js';

  let {
    // The SET: `ESSENCE_RULES_TABS` for a catalogued essence, `ESSENCE_EDITOR_TABS` for a create
    // draft, defaulted to the shipped three so a caller passing none renders as it always did.
    tabs = ESSENCE_EDITOR_TABS,
    activeTab = 'identity',
    onCraftCount = 0,
    blockingCount = 0,
    warningCount = 0,
    onChange = () => {},
  } = $props();

  const TAB_LABEL_KEYS = {
    identity: 'FABRICATE.Admin.Manager.Essence.Tabs.Identity',
    oncraft: 'FABRICATE.Admin.Manager.Essence.Tabs.OnCraft',
    rules: 'FABRICATE.Admin.Manager.Essence.Tabs.Rules',
    validation: 'FABRICATE.Admin.Manager.Essence.Tabs.Validation',
  };

  // `$derived`, not a module constant: computed once at load it would pin whichever set rendered
  // first, and the create draft and the rules editor would draw the same strip.
  const editorTabs = $derived(
    tabs.map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      labelKey: TAB_LABEL_KEYS[tab.id],
      label: tab.fallback,
    }))
  );

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

  // Blocking outranks warning, and a clean tab shows a tick rather than a zero, which is
  // indistinguishable at a glance from an `8`. The tick has no readable name, so it carries one.
  function validationBadgeFor(blocking, warnings) {
    if (blocking > 0) {
      return { tone: 'danger', label: String(blocking), name: issueCountLabel(blocking) };
    }
    if (warnings > 0) {
      return { tone: 'warning', label: String(warnings), name: issueCountLabel(warnings) };
    }
    // NEUTRAL, not green, and carrying no `is-valid`: a green tick claims a RESULT where the
    // reference states an absence of findings. `WorldEssenceEntryPage` states the same pair, so
    // the two essence editors cannot disagree about what "clear" looks like. It is ONE pill in
    // two states — a numeral or a tick in the same box — never a second shape.
    return {
      tone: 'neutral',
      label: '✓',
      name: text('FABRICATE.Admin.Manager.Essence.ValidationAllValid', 'All checks pass'),
    };
  }

  const badges = $derived({
    oncraft: onCraftCount,
    validation: validationBadgeFor(blockingCount, warningCount),
  });
</script>

<EditorTabs
  tabs={editorTabs}
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
