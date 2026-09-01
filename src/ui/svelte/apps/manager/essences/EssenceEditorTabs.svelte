<!-- Svelte 5 runes mode -->
<!--
  The essence editor's tab strip (issue 1036) — `Essence rules` and `Validation` for an essence
  the world catalogue holds, and the shipped `Identity, On craft, Validation` for a CREATE draft,
  which has no shared definition to contradict. The SET is the caller's, passed as `tabs`.

  A thin caller of the promoted `EditorTabs` primitive (issue 1038). It was authored as the
  eighth hand-rolled `{activeTab, badges, onSelect}` strip because the extraction obligation
  is to convert every existing site in the same change, and no primitive existed yet; issue
  1362 promoted one and this is the follow-up that owed it. This file now owns the tab SET, the
  two badges, and this site's DOM contract — the `data-essence-tab` hook, the
  `essence-tab-*` / `essence-panel-*` id stem whose panels `EssenceEditView.svelte` renders,
  the `manager-essence-editor-tabs` container class and the strip's own aria-label. No
  rendered id, `aria-controls`, `data-*` attribute or class changed in the conversion.

  THE KEYBOARD MODEL CAME WITH THE PRIMITIVE, AND THAT IS WHY THE VARIABLE SET IS SAFE HERE.
  This file used to close over `tabs.length` in its own Arrow/Home/End handler, so a two-tab
  set and a three-tab set were two things to keep in step by hand. `EditorTabs` derives every
  index from the `tabs` it is handed, so the rules strip wraps across two tabs and the create
  strip across three with nothing said here about either.

  ── THE TAB IDS ARE LITERALS, TWICE ───────────────────────────────────────────────
  `idStem="essence"` builds `essence-tab-<id>` inside the primitive, so the View Lab's
  source-coverage scan cannot credit the ids it produces from THIS file either. The ids are
  therefore ALSO present as literals in `ESSENCE_EDITOR_TABS` and `ESSENCE_RULES_TABS` in
  `essenceStudio.js` — and the scan reads the literals `'identity'`, `'oncraft'`, `'rules'`
  and `'validation'` there.

  ── THE ON-CRAFT BADGE COUNTS CONFIGURED BEHAVIOURS ───────────────────────────────
  0, 1 or 2 — a linked source and a linked property macro — following
  `ToolEditorTabs.requirementCount`. It never counted EFFECTS, so dropping the prototype's
  invented "2 effects" number does not delete it. A zero renders NO badge, which is the
  primitive's own rule rather than a condition restated here. The rules set has no `oncraft`
  tab at all, so on that set the entry is simply never matched to a tab.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { ESSENCE_EDITOR_TABS } from './essenceStudio.js';

  let {
    // The SET, supplied by the caller: `ESSENCE_RULES_TABS` for an essence with a shared world
    // definition, `ESSENCE_EDITOR_TABS` for a create draft. Defaulted to the shipped three so a
    // caller that passes none renders exactly what it always did.
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

  // `$derived`, not a module constant, because the set is now a PROP. Computed once at load it
  // would pin whichever set the first render happened to pass, and the create draft and the
  // rules editor would then draw the same strip.
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

  // Blocking outranks warning, and a clean tab shows a tick rather than a zero: a badge
  // reading `0` is indistinguishable at a glance from a badge reading `8`. The tick has no
  // readable name of its own, so it carries `name`.
  function validationBadgeFor(blocking, warnings) {
    if (blocking > 0) {
      return { tone: 'danger', label: String(blocking), name: issueCountLabel(blocking) };
    }
    if (warnings > 0) {
      return { tone: 'warning', label: String(warnings), name: issueCountLabel(warnings) };
    }
    // NEUTRAL, not green, and carrying no `is-valid` (issue 1372, maintainer parity round).
    // The reference draws its clear tab badge in the recessive `surface-soft` / `border` /
    // `text2` treatment (`proto:4566`); a green tick claims a RESULT where the reference states
    // an absence of findings. `WorldEssenceEntryPage` states the same pair, so the two essence
    // editors' strips cannot disagree about what "clear" looks like. It is ONE pill in two
    // states — a numeral or a tick in the same box — which is exactly the issue chip's label
    // and never a second shape.
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
