<!-- Svelte 5 runes mode -->
<!--
  System Overview page. A full-width tabbed shell (mirroring the environment
  editor's EnvironmentEditView) with two tabs: Settings (the system settings form
  and the issue 454 system-blocker banner) and Validation (the kind-grouped validation
  issue list rendered by SystemOverviewView). The standalone "Overview" route was
  folded in here; the Settings tab is the default, and callers that want the
  validation list open pass `requestedTab='validation'`. GM-only by construction:
  the whole crafting manager admin is GM-scoped.
-->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { tick } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';
  import IconPicker from '../../components/IconPicker.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { stepperLabels } from '../../components/stepperLabels.js';
  import RollDataExpressionInput from './RollDataExpressionInput.svelte';
  import SystemEditorTabs from './system/SystemEditorTabs.svelte';
  import CharacterPrerequisitesCard from './system/CharacterPrerequisitesCard.svelte';
  import SystemOverviewView from './SystemOverviewView.svelte';
  // `stripExpressionSigil` is NOT imported any more: the summary row reads the stored
  // expression back verbatim now that the field no longer supplies the `@`. The helper itself
  // is untouched — the prerequisite copy path still derives a `path` from an expression
  // through it, which is a different question from how a list reads.
  import {
    mapModifierToPrerequisite,
    mapPrerequisiteToModifier,
  } from '../../../../systems/characterModifierPrerequisiteCopy.js';
  import {
    isRollExpression,
    resolveModifierBounds,
  } from '../../../../systems/checkModifierResolver.js';
  import {
    appendModifierExpressionTerm,
    getModifierExpressionSuggestions,
  } from '../../../../config/modifierExpressionSuggestions.js';

  let {
    selectedSystem = null,
    // True when the system carries a `blocks:'system'` validation issue. Drives a
    // GM-only full-width callout above the identity card on the Settings tab. The
    // whole crafting manager admin is GM-scoped, so this is GM-only by
    // construction.
    systemBlocked = false,
    // The `evaluateSystemValidation` report driving the Validation tab's
    // kind-grouped issue list and the tab's open-issue badge.
    validationReport = {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    },
    // The tab the page should open on. The parent bumps `requestedTab` (and a
    // matching nonce) to request the Validation tab — e.g. from the blocker banner
    // link or a folded-in overview deep link.
    requestedTab = 'settings',
    // Bumped by the parent alongside `requestedTab` so re-requesting the same tab
    // (or re-selecting the same system) still re-applies the requested tab.
    requestedTabNonce = 0,
    onSelectIssue = () => {},
    onShowSystemOverview = () => {},
    onSaveDetails = () => {},
    // Lift the identity draft (Name + Description) up to the root so the Manager
    // route-exit guard can persist it on a Save-and-navigate. Emitted on every
    // input, mirroring the essence/component `onDraftChange` → root draft pattern.
    onDetailsChange = () => {},
    // Report the local dirty state up so the root can gate the route-exit guard. This
    // is the root's ONLY dirtiness signal: the comparison is against the live
    // `selectedSystem` projection and only this view holds the typed inputs, so the
    // root cannot re-derive it from the lifted draft alone.
    onDirtyChange = () => {},
    // Bumped by the root (discard branch of the guard) to force the local inputs to
    // re-seed from the persisted system even when the system id is unchanged. A
    // counter rather than a flag, so a second discard on the SAME system still
    // registers as a change (the `requestedTabNonce` idiom above).
    reseedNonce = 0,
    onToggleFeature = async () => true,
    // The ONE authored modifier library for this system (issue 1117). It absorbed the
    // check-modifier catalogue that used to be authored on the Checks screen, so this
    // section is now the only surface that adds, edits, reorders or deletes an entry, and
    // it renders for EVERY system rather than only a gathering-enabled one — a check
    // modifier has nothing to do with the gathering feature flag.
    modifierLibrary = [],
    modifierPresetsSupported = false,
    // The active Foundry game system id (`game.system.id`). Drives the SYSTEM-SPECIFIC half
    // of the expression suggestion chips: a roll-data path is only meaningful in the world
    // that defines it, so an unknown id yields the agnostic chips alone rather than a
    // `dnd5e` row offered to a world that has no `@abilities`.
    foundrySystemId = '',
    onAddModifier = async () => null,
    onUpdateModifier = async () => {},
    onDeleteModifier = async () => {},
    onReorderModifier = async () => {},
    onSeedModifierPresets = async () => {},
    // Bumped by the parent to deep-link into this section — the Checks screen's read-only
    // modifier card links here, and a link that lands on a collapsed section the GM then
    // has to find is not a deep link. A nonce for the `requestedTabNonce` reason: the same
    // request has to re-apply.
    requestedSectionNonce = 0,
    characterPrerequisiteLibrary = [],
    characterPrerequisitePresetsSupported = false,
    onAddCharacterPrerequisite = async () => null,
    onUpdateCharacterPrerequisite = async () => {},
    onDeleteCharacterPrerequisite = async () => {},
    onReorderCharacterPrerequisite = async () => {},
    onSeedCharacterPrerequisitePresets = async () => {},
    // Currency's only remaining surface here is the participation toggle (issue 1278). The ladder,
    // spend strategy, provider and macro set are world scope and are authored under World > Currency.
    onToggleCurrency = async () => {},
    // Travel & Realms' only surface here is the participation toggle (issue 1282). The realm
    // library, its reveal mode and its modifier visibility are world scope and are authored
    // under World > Travel.
    onToggleGatheringRealms = async () => {},
    onToggleTime = async () => {},
  } = $props();

  // Settings is the default tab. A bumped `requestedTabNonce` re-applies the
  // parent's `requestedTab` (so the blocker-link / folded-in overview deep link
  // can force the Validation tab open even when this page is already mounted, and
  // re-selecting the same system resets the tab sensibly).
  let activeTab = $state('settings');
  let appliedRequestNonce = $state(-1);
  $effect(() => {
    if (requestedTabNonce !== appliedRequestNonce) {
      appliedRequestNonce = requestedTabNonce;
      activeTab = requestedTab === 'validation' ? 'validation' : 'settings';
    }
  });

  const validationCounts = $derived(
    validationReport?.counts || { critical: 0, warning: 0, info: 0, blockers: 0 }
  );
  const validationBadges = $derived([
    ...(validationCounts.critical > 0
      ? [{ label: String(validationCounts.critical), tone: 'danger' }]
      : []),
    ...(validationCounts.warning > 0
      ? [{ label: String(validationCounts.warning), tone: 'warning' }]
      : []),
  ]);
  const tabBadges = $derived({ validation: validationBadges });

  let modifierEditingId = $state('');

  // Whole-section collapse (issue 768) — a session-local Set keyed by section name
  // ('modifiers' | 'prerequisites'), mirroring ComponentsBrowserView's
  // `collapsedCategories`. In-memory only: preserved across store refresh, reset on
  // system switch, NEVER persisted. Distinct from the prerequisites card's per-item
  // accordion (`openId`) — this is a section-level wrapper. Collapse is opt-IN: a
  // section absent from the set is expanded.
  let collapsedSections = $state(new Set());
  let lastCollapseSystemId = $state(null);
  $effect(() => {
    const currentId = selectedSystem?.id ?? null;
    if (currentId !== lastCollapseSystemId) {
      lastCollapseSystemId = currentId;
      collapsedSections = new Set();
    }
  });
  function toggleSectionCollapsed(section) {
    // Copy-then-reassign: the reactive unit is `collapsedSections`, not the Set. The copy is
    // mutated only before the assignment that publishes it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(collapsedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    collapsedSections = next;
  }
  function isSectionCollapsed(section) {
    return collapsedSections.has(section);
  }
  function expandSection(section) {
    if (!collapsedSections.has(section)) return;
    // Copy-then-reassign, as in toggleSectionCollapsed above.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(collapsedSections);
    next.delete(section);
    collapsedSections = next;
  }

  // Cross-list copy (issue 768). A copy is an ADD into the destination store via
  // its existing (normalizing, id-generating) add op, then the new entry is opened
  // in edit mode in the target card so the dropped pass/fail-or-roll logic is an
  // honest, visible gap rather than a silent loss. `copyAnnouncement` drives a
  // shared aria-live region; a nonce forces the prerequisites card to open the
  // freshly-added entry even when its id-run is unchanged.
  let copyAnnouncement = $state('');
  let prereqRequestOpenId = $state('');
  let prereqRequestOpenNonce = $state(0);

  function announceCopy(name) {
    copyAnnouncement = localize('FABRICATE.Admin.Manager.ListErgonomics.CopiedAnnouncement', {
      name: String(name || '').trim(),
    });
    if (
      !copyAnnouncement ||
      copyAnnouncement === 'FABRICATE.Admin.Manager.ListErgonomics.CopiedAnnouncement'
    ) {
      copyAnnouncement = `Copied ${String(name || '').trim()} and icon — set the condition.`;
    }
  }

  // Manual reorder (issue 768) — Move-up/down chevron buttons on each settings-list
  // row call the list's index-based store op (array order IS the persisted order),
  // mirroring the accessible CompositionList pattern. One shared aria-live region
  // announces the new position so the move is observable without sight of the
  // reflowed list. `reorderList` is shared by all three lists so the announce +
  // persist pattern lives in one place (no per-list duplication).
  let reorderAnnouncement = $state('');
  function announceReorder(name, position, total) {
    reorderAnnouncement = localize('FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement', {
      name: String(name || '').trim(),
      position: String(position),
      total: String(total),
    });
    if (
      !reorderAnnouncement ||
      reorderAnnouncement === 'FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement'
    ) {
      reorderAnnouncement = `Moved ${String(name || '').trim()} to position ${position} of ${total}.`;
    }
  }
  async function reorderList(reorderOp, index, delta, name, total) {
    const toIndex = index + delta;
    await reorderOp(index, toIndex);
    announceReorder(name, toIndex + 1, total);
  }

  // The copied entry opens in edit mode in the OTHER section (Prereqs sit below
  // Modifiers, Modifiers above Prereqs), so for the long-list case this feature
  // targets it can land off-screen — the aria-live confirmation would then be the
  // ONLY signal (invisible to a sighted GM). After the target editor renders, scroll
  // the new row into view and move focus to its first editable field so the visible
  // confirmation matches the announced one. Scoped to this page's root (bound below)
  // so a query never crosses into another mounted manager instance.
  let pageRoot = $state(null);
  async function revealCopiedEntry(selector) {
    await tick();
    const node = pageRoot?.querySelector?.(selector);
    if (!node) return;
    node.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const focusTarget = node.querySelector?.('input, select, textarea');
    focusTarget?.focus?.();
  }

  async function handleCopyModifierToPrerequisite(entry) {
    const created = await onAddCharacterPrerequisite(mapModifierToPrerequisite(entry));
    if (!created?.id) return;
    expandSection('prerequisites');
    prereqRequestOpenId = created.id;
    prereqRequestOpenNonce += 1;
    announceCopy(entry?.label);
    await revealCopiedEntry(`[data-system-character-prerequisite="${created.id}"]`);
  }

  async function handleCopyPrerequisiteToModifier(entry) {
    const created = await onAddModifier(mapPrerequisiteToModifier(entry));
    if (!created?.id) return;
    expandSection('modifiers');
    modifierEditingId = created.id;
    announceCopy(entry?.name);
    await revealCopiedEntry(`[data-system-modifier="${created.id}"]`);
  }

  // The Checks screen's read-only modifier card links here. Expanding the section and
  // scrolling it into view is the whole of the deep link: without it the GM arrives on a
  // long Settings tab with the section they asked for possibly collapsed and certainly
  // off-screen, which is a navigation that lands nowhere in particular.
  let appliedSectionNonce = $state(-1);
  $effect(() => {
    if (requestedSectionNonce === appliedSectionNonce) return;
    appliedSectionNonce = requestedSectionNonce;
    if (requestedSectionNonce <= 0) return;
    activeTab = 'settings';
    expandSection('modifiers');
    void revealCopiedEntry('[data-system-modifiers]');
  });

  // The bounds field labels, derived once: `stepperLabels` composes the two adjunct names
  // from the input's own name, so the three must come from one string rather than three
  // call-site literals that could drift.
  const modifierMinLabel = $derived(text('FABRICATE.Admin.Manager.Modifiers.Min', 'Minimum'));
  const modifierMaxLabel = $derived(text('FABRICATE.Admin.Manager.Modifiers.Max', 'Maximum'));
  const modifierUnboundedLabel = $derived(
    text('FABRICATE.Admin.Manager.Modifiers.BoundsUnbounded', 'Unbounded')
  );
  // A `$derived` rather than a template `{@const}`: the Modifiers section is no longer
  // wrapped in an `{#if}`, and `{@const}` is only legal as the immediate child of a block.
  const modifiersCollapsed = $derived(isSectionCollapsed('modifiers'));
  const currencyEnabled = $derived(selectedSystem?.requirements?.currency?.enabled === true);
  // Travel & Realms is meaningful only to a gathering system: everything the toggle governs —
  // location-gated environment access, the environment realm controls, party realm overrides —
  // is a gathering affordance. It moved here from the Gathering Settings tab (issue 1282),
  // which carried the same gate implicitly.
  const gatheringFeatureEnabled = $derived(selectedSystem?.features?.gathering === true);
  const gatheringRealmsEnabled = $derived(selectedSystem?.gatheringRealmSettings?.enabled === true);
  // Time requirements default ON (issue 714): an absent flag reads as enabled, so only
  // an explicit GM opt-out (`enabled === false`) turns the toggle off.
  const timeRequirementsEnabled = $derived(selectedSystem?.requirements?.time?.enabled !== false);

  async function handleToggleCurrency() {
    await onToggleCurrency(!currencyEnabled);
  }

  async function handleToggleGatheringRealms() {
    await onToggleGatheringRealms(!gatheringRealmsEnabled);
  }

  async function handleToggleTime() {
    await onToggleTime(!timeRequirementsEnabled);
  }

  // A system with no registered provider has nothing to drive the actorInventory strategy: the
  // resolved provider id is empty and its canonical ladder is empty. The store guards against
  // wiping the GM's units, and the editor surfaces a steer-to-macro callout in that case.

  // Asked of the SHARED predicate (issue 1117), not of a local pattern. Two patterns lived
  // in the repo while two libraries did, and they were complementary rather than
  // duplicates — one matched `1d6` and missed `d20`, the other the reverse — so one library
  // with two readers would have disagreed about whether the same entry rolls. The
  // normalizer derives `isRollExpression` from the same function, so the chip below and the
  // persisted flag can never differ.
  function modifierIsRoll(entry) {
    return Boolean(entry?.expression) && isRollExpression(entry.expression);
  }

  // The read-only bounds chip, e.g. `-1 to +5`. Signed on BOTH ends: a modifier is a signed
  // contribution, so a bare `5` reads as a value rather than as a bonus. The two
  // half-bounded readings are separate sentences because "at most" and "at least" are not
  // the same promise, and an unbounded entry renders no chip rather than the word
  // "unbounded" on every row of a library that mostly is.
  function modifierBoundsChip(entry) {
    const { min, max } = resolveModifierBounds(entry);
    if (min === null && max === null) return '';
    const signed = (value) => (value < 0 ? `${value}` : `+${value}`);
    if (min !== null && max !== null) return `${signed(min)} to ${signed(max)}`;
    if (max !== null) {
      return `${text('FABRICATE.Admin.Manager.Modifiers.BoundsAtMost', 'At most')} ${signed(max)}`;
    }
    return `${text('FABRICATE.Admin.Manager.Modifiers.BoundsAtLeast', 'At least')} ${signed(min)}`;
  }

  // Which BLOCKING bounds fault this entry has, or `''`. Both make the entry contribute 0 to
  // a check until repaired, matching the refuse posture gathering's drop modifiers already
  // take; the Checks Validation section reports the same two facts as
  // `modifierBoundsInverted` / `modifierBoundsUnsafe`, both `critical`. TWO CAUSES, TWO
  // SENTENCES: "your minimum is above your maximum" and "this number cannot appear in a roll
  // formula" need different repairs, and `1e21` is not an inversion.
  function modifierBoundsFault(entry) {
    const bounds = resolveModifierBounds(entry);
    if (bounds.inverted) return 'inverted';
    return bounds.unsafe ? 'unsafe' : '';
  }

  // The collapsed summary row shows the expression with its leading `@` sigil
  // stripped for a cleaner inline read (the raw `@`-prefixed value stays in the
  // editor's Expression field — only the DISPLAY strips it).
  // VERBATIM, sigil included. It stripped the leading `@` while the editor below rendered that
  // sigil as a separate cap, so the list and the field agreed. The field is a plain input now
  // (maintainer ruling) and the GM writes the `@` themselves, so a list that hides it would be
  // showing a value nobody typed — and hiding, on the one screen that teaches the requirement,
  // exactly the character the requirement is about.
  //
  // `stripExpressionSigil` itself is untouched: the prerequisite copy path derives a `path`
  // from an expression through it, and that transform is unrelated to how a list reads.
  function modifierExpressionDisplay(entry) {
    return String(entry?.expression ?? '').trim();
  }

  async function handleAddModifier() {
    const entry = await onAddModifier();
    if (entry?.id) modifierEditingId = entry.id;
  }

  async function handleDeleteModifier(modifierId) {
    await onDeleteModifier(modifierId);
    if (modifierEditingId === modifierId) modifierEditingId = '';
  }

  // `Stepper` reports a clamped number, or `null` when an `allowUnset` field is cleared.
  // `null` is written as an EXPLICIT key rather than dropped, because absence IS the
  // "unbounded" value: clearing the field has to be able to REMOVE an existing bound, and a
  // patch that omitted the key would leave the old one in place. The normalizer attaches the
  // key only for a finite number, so a `null` round-trips to key-absent.
  function handleModifierBound(modifierId, key, next) {
    onUpdateModifier(modifierId, { [key]: next });
  }

  // The expression field's roll-data suggestion chips (issue 1096). Derived from the ACTIVE
  // world rather than written out here — see `modifierExpressionSuggestions.js` for why a
  // hard-coded row would be wrong in every system but one.
  const modifierExpressionSuggestions = $derived(getModifierExpressionSuggestions(foundrySystemId));

  // Appending, not replacing: the chips build up a compound expression. The caret is left at
  // the end of the field the GM is editing so the next keystroke continues the expression
  // instead of landing wherever focus happened to be — a chip that silently steals focus to
  // nowhere is worse than no chip. The DOM lookup is scoped to the clicked chip's OWN editor
  // body, so an open second row is never touched.
  async function handleModifierSuggestion(event, entry, term) {
    const input = event.currentTarget
      ?.closest('[data-system-modifier-editor]')
      ?.querySelector('[data-system-modifier-field="expression"]');
    await onUpdateModifier(entry.id, {
      expression: appendModifierExpressionTerm(entry.expression, term),
    });
    await tick();
    if (!input) return;
    input.focus();
    const caret = input.value.length;
    input.setSelectionRange?.(caret, caret);
  }

  let systemNameValue = $state('');
  let systemDescriptionValue = $state('');

  // Seed the local inputs from the persisted system on IDENTITY change only (or a
  // root-driven `reseedNonce` bump on discard), never on every `selectedSystem`
  // reference change. The admin store publishes `viewState` twice on refresh (a
  // sync publish then an async-enriched publish with a NEW `selectedSystem` object
  // of the same id); a reference-triggered reseed would overwrite the GM's
  // un-saved keystrokes on that second publish (and on any unrelated mid-edit
  // refresh, e.g. a feature toggle). Gating on id/nonce keeps the typed value and
  // lets `detailsDirty` clear naturally after Save re-publishes the projection.
  let lastSeededSystemId = $state(null);
  let appliedReseedNonce = $state(0);
  $effect(() => {
    const currentId = selectedSystem?.id ?? null;
    if (currentId !== lastSeededSystemId || reseedNonce !== appliedReseedNonce) {
      lastSeededSystemId = currentId;
      appliedReseedNonce = reseedNonce;
      systemNameValue = selectedSystem?.name ?? '';
      systemDescriptionValue = selectedSystem?.description ?? '';
    }
  });

  const detailsDirty = $derived(
    (systemNameValue ?? '') !== (selectedSystem?.name ?? '') ||
      (systemDescriptionValue ?? '') !== (selectedSystem?.description ?? '')
  );

  // One-way up: mirror the typed values into the root draft and report dirtiness so
  // the route-exit guard can Save (from the lifted draft) or Discard on navigate.
  $effect(() => {
    onDetailsChange(systemNameValue, systemDescriptionValue);
  });
  $effect(() => {
    onDirtyChange(detailsDirty);
  });

  const featureDefinitions = [
    {
      systemKey: 'gathering',
      storeKey: 'gathering',
      icon: 'fas fa-wheat-awn',
      labelKey: 'FABRICATE.Admin.Manager.Feature.Gathering',
      fallback: 'Gathering',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Gathering',
      hintFallback: 'Shows gathering environments and player gathering flows for this system.',
    },
    {
      systemKey: 'salvage',
      storeKey: 'salvage',
      icon: 'fas fa-recycle',
      labelKey: 'FABRICATE.Admin.Manager.Feature.Salvage',
      fallback: 'Salvage',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Salvage',
      hintFallback:
        'Enables component salvage and the salvage check configuration for this system.',
    },
    {
      systemKey: 'essences',
      storeKey: 'essences',
      icon: 'fas fa-flask',
      labelKey: 'FABRICATE.Admin.Manager.Feature.Essences',
      fallback: 'Essences',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Essences',
      hintFallback: 'Enables essence definitions and essence requirements.',
    },
    {
      systemKey: 'multiStepRecipes',
      storeKey: 'multiStepRecipes',
      icon: 'fas fa-diagram-project',
      labelKey: 'FABRICATE.Admin.Manager.Feature.MultiStepRecipes',
      fallback: 'Multi-step recipes',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.MultiStepRecipes',
      hintFallback: 'Enables explicit recipe steps and step-level requirements.',
    },
    {
      systemKey: 'propertyMacros',
      storeKey: 'propertyMacros',
      icon: 'fas fa-code',
      labelKey: 'FABRICATE.Admin.Manager.Feature.PropertyMacros',
      fallback: 'Property macros',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.PropertyMacros',
      hintFallback: 'Allows macro-backed component property behavior.',
    },
    {
      systemKey: 'effectTransfer',
      storeKey: 'effectTransfer',
      icon: 'fas fa-wand-sparkles',
      labelKey: 'FABRICATE.Admin.Manager.Feature.EffectTransfer',
      fallback: 'Effect transfer',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.EffectTransfer',
      hintFallback: 'Allows crafted results to inherit effects from source components.',
    },
    {
      systemKey: 'chatOutput',
      storeKey: 'chatOutput',
      icon: 'fas fa-comment',
      labelKey: 'FABRICATE.Admin.Manager.Feature.ChatOutput',
      fallback: 'Chat output',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.ChatOutput',
      hintFallback: 'Posts a summary chat card after crafting and gathering attempts.',
    },
  ];

  // Refund-on-player-cancel is authored NEXT TO Time requirements (rendered after it)
  // and only applies to a TIMED craft — a player can only cancel an in-progress timed
  // run — so its toggle is disabled while Time requirements is off (issue 848 follow-up).
  const refundOnCancelFeature = {
    systemKey: 'refundOnPlayerCancel',
    storeKey: 'refundOnPlayerCancel',
    labelKey: 'FABRICATE.Admin.Manager.Feature.RefundOnPlayerCancel',
    fallback: 'Refund on player cancel',
  };
  const refundOnCancelVisible = $derived(hasFeatureKey(selectedSystem, 'refundOnPlayerCancel'));
  const refundOnCancelEnabled = $derived(selectedSystem?.features?.refundOnPlayerCancel === true);

  const visibleFeatures = $derived(
    featureDefinitions.filter((feature) => hasFeatureKey(selectedSystem, feature.systemKey))
  );

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function hasFeatureKey(system, featureKey) {
    return Object.prototype.hasOwnProperty.call(system?.features || {}, featureKey);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSaveDetails(systemNameValue, systemDescriptionValue);
  }

  async function handleToggleFeature(feature) {
    const next = !(selectedSystem?.features?.[feature.systemKey] === true);
    await onToggleFeature(feature.storeKey, next);
  }
</script>

{#if selectedSystem}
  <div
    class="manager-environment-edit-view manager-system-edit-view"
    data-system-editor
    bind:this={pageRoot}
  >
    <SystemEditorTabs
      {activeTab}
      badges={tabBadges}
      onSelect={(tab) => {
        activeTab = tab;
      }}
    />

    <div class="manager-environment-workspace manager-system-workspace is-inspector-hidden">
      <div
        class="manager-environment-tab-panel manager-system-tab-panel"
        role="tabpanel"
        id={`system-panel-${activeTab}`}
        aria-labelledby={`system-tab-${activeTab}`}
      >
        {#if activeTab === 'settings'}
          <main
            class="manager-main manager-system-edit-main"
            aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings')}
          >
            <section class="manager-section-header">
              <div class="manager-heading">
                <p class="manager-kicker">{selectedSystem.name}</p>
                <h2 class="manager-title">
                  {text(
                    'FABRICATE.Admin.Manager.SystemEdit.EditBaseSettings',
                    'Edit base settings'
                  )}
                </h2>
                <p class="manager-subtitle">
                  {text(
                    'FABRICATE.Admin.Manager.SystemEdit.EditBaseSettingsHint',
                    'Changes use the existing admin store persistence and confirmation flows.'
                  )}
                </p>
              </div>
            </section>

            <form class="manager-system-edit-form" onsubmit={handleSubmit}>
              <div
                class="visually-hidden"
                role="status"
                aria-live="polite"
                data-list-copy-announcement
              >
                {copyAnnouncement}
              </div>
              <div
                class="visually-hidden"
                role="status"
                aria-live="polite"
                data-list-reorder-announcement
              >
                {reorderAnnouncement}
              </div>
              {#if systemBlocked}
                <div
                  class="manager-environment-comp-callout manager-system-edit-blocker"
                  role="note"
                  data-system-edit-blocker
                >
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  <div class="manager-system-edit-blocker-copy">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.SystemEdit.BlockerTitle',
                        'This system has a blocker'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.SystemEdit.BlockerBody',
                        "Players cannot see or use any of this system's recipes until the blocker is resolved. Open the system overview to review and fix it."
                      )}</span
                    >
                  </div>
                  <!-- Ghost (issue 1118, row 8). `ui-integration/spec.md` defines the role
                       as the quiet NAVIGATIONAL verb — "Back, Open, View" — which moves the
                       GM and changes no record, and this control is literally an Open. It
                       sits inside a blocker callout that already carries the alarm, so at
                       the base weight it competed with the copy explaining it. -->
                  <ManagerButton
                    role="ghost"
                    class="manager-system-edit-blocker-link"
                    data-system-edit-blocker-link
                    onclick={() => {
                      activeTab = 'validation';
                      onShowSystemOverview();
                    }}
                  >
                    {text('FABRICATE.Admin.Manager.SystemEdit.BlockerLink', 'Open system overview')}
                  </ManagerButton>
                </div>
              {/if}
              <section class="manager-edit-card">
                <div class="manager-edit-card-heading">
                  <h3 class="manager-card-title">
                    {text('FABRICATE.Admin.Manager.SystemEdit.Identity', 'Identity')}
                  </h3>
                  <!--
            The heading is `justify-content: space-between`, so the chip must share a
            flex-end action group with the Save button to hug it (the house idiom every
            other dirty chip uses); a bare third child would float mid-heading.
          -->
                  <div class="manager-action-group">
                    {#if detailsDirty}
                      <Chip tone="warning" data-system-details-dirty
                        >{text('FABRICATE.Admin.Manager.SystemEdit.Dirty', 'Unsaved')}</Chip
                      >
                    {/if}
                    <ManagerButton role="primary" type="submit" data-system-details-save>
                      <i class="fas fa-save" aria-hidden="true"></i>
                      <span
                        >{text(
                          'FABRICATE.Admin.Manager.SystemEdit.SaveDetails',
                          'Save details'
                        )}</span
                      >
                    </ManagerButton>
                  </div>
                </div>
                <div class="manager-edit-grid">
                  <label class="manager-field" for="manager-system-name">
                    <span>{text('FABRICATE.Admin.SystemSettings.Name', 'Name')}</span>
                    <input id="manager-system-name" type="text" bind:value={systemNameValue} />
                  </label>
                  <label class="manager-field is-wide" for="manager-system-description">
                    <span>{text('FABRICATE.Admin.SystemSettings.Description', 'Description')}</span>
                    <textarea
                      id="manager-system-description"
                      rows="4"
                      bind:value={systemDescriptionValue}></textarea>
                  </label>
                </div>
              </section>

              <section class="manager-edit-card" data-edit-control="advanced-options">
                <h3 class="manager-card-title">
                  {text('FABRICATE.Admin.Manager.SystemEdit.OptionalFeatures', 'Optional features')}
                </h3>
                <div class="manager-toggle-list">
                  {#each visibleFeatures as feature (feature.systemKey)}
                    <div class="manager-feature-tile" data-feature-key={feature.systemKey}>
                      <span
                        class={`manager-feature-tile-icon ${selectedSystem.features?.[feature.systemKey] === true ? 'is-on' : 'is-off'}`}
                        aria-hidden="true"><i class={feature.icon}></i></span
                      >
                      <div class="manager-feature-tile-body">
                        <div class="manager-feature-tile-head">
                          <strong>{text(feature.labelKey, feature.fallback)}</strong>
                          <button
                            type="button"
                            class={`manager-status-toggle ${selectedSystem.features?.[feature.systemKey] === true ? 'is-on' : 'is-off'}`}
                            aria-pressed={selectedSystem.features?.[feature.systemKey] === true}
                            aria-label={text(feature.labelKey, feature.fallback)}
                            onclick={() => handleToggleFeature(feature)}
                          >
                            <span class="manager-status-toggle-track" aria-hidden="true"
                              ><span class="manager-status-toggle-knob"></span></span
                            >
                            <span class="manager-status-toggle-label"
                              >{selectedSystem.features?.[feature.systemKey] === true
                                ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                                : text(
                                    'FABRICATE.Admin.Manager.SystemEdit.FeatureOff',
                                    'Off'
                                  )}</span
                            >
                          </button>
                        </div>
                        <small>{text(feature.hintKey, feature.hintFallback)}</small>
                      </div>
                    </div>
                  {/each}
                  <div class="manager-feature-tile" data-feature-key="time">
                    <span
                      class={`manager-feature-tile-icon ${timeRequirementsEnabled ? 'is-on' : 'is-off'}`}
                      aria-hidden="true"><i class="fas fa-clock"></i></span
                    >
                    <div class="manager-feature-tile-body">
                      <div class="manager-feature-tile-head">
                        <strong
                          >{text(
                            'FABRICATE.Admin.Manager.Feature.Time',
                            'Time requirements'
                          )}</strong
                        >
                        <button
                          type="button"
                          class={`manager-status-toggle ${timeRequirementsEnabled ? 'is-on' : 'is-off'}`}
                          aria-pressed={timeRequirementsEnabled}
                          aria-label={text(
                            'FABRICATE.Admin.Manager.Feature.Time',
                            'Time requirements'
                          )}
                          data-system-time-toggle
                          onclick={handleToggleTime}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true"
                            ><span class="manager-status-toggle-knob"></span></span
                          >
                          <span class="manager-status-toggle-label"
                            >{timeRequirementsEnabled
                              ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                              : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span
                          >
                        </button>
                      </div>
                      <small
                        >{text(
                          'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Time',
                          'Enables recipe and step duration (time requirement) authoring, and applies those durations when crafting.'
                        )}</small
                      >
                    </div>
                  </div>
                  {#if refundOnCancelVisible}
                    <div
                      class="manager-feature-tile"
                      class:is-feature-disabled={!timeRequirementsEnabled}
                      data-feature-key="refundOnPlayerCancel"
                    >
                      <span
                        class={`manager-feature-tile-icon ${refundOnCancelEnabled ? 'is-on' : 'is-off'}`}
                        aria-hidden="true"><i class="fas fa-rotate-left"></i></span
                      >
                      <div class="manager-feature-tile-body">
                        <div class="manager-feature-tile-head">
                          <strong
                            >{text(
                              'FABRICATE.Admin.Manager.Feature.RefundOnPlayerCancel',
                              'Refund on player cancel'
                            )}</strong
                          >
                          <button
                            type="button"
                            class={`manager-status-toggle ${refundOnCancelEnabled ? 'is-on' : 'is-off'}`}
                            aria-pressed={refundOnCancelEnabled}
                            aria-label={text(
                              'FABRICATE.Admin.Manager.Feature.RefundOnPlayerCancel',
                              'Refund on player cancel'
                            )}
                            data-system-refund-toggle
                            disabled={!timeRequirementsEnabled}
                            onclick={() => {
                              if (timeRequirementsEnabled)
                                handleToggleFeature(refundOnCancelFeature);
                            }}
                          >
                            <span class="manager-status-toggle-track" aria-hidden="true"
                              ><span class="manager-status-toggle-knob"></span></span
                            >
                            <span class="manager-status-toggle-label"
                              >{refundOnCancelEnabled
                                ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                                : text(
                                    'FABRICATE.Admin.Manager.SystemEdit.FeatureOff',
                                    'Off'
                                  )}</span
                            >
                          </button>
                        </div>
                        <small
                          >{timeRequirementsEnabled
                            ? text(
                                'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.RefundOnPlayerCancel',
                                'Returns consumed ingredients and spent currency when a player cancels their in-progress craft. Turn off to forfeit inputs on cancel.'
                              )
                            : text(
                                'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.RefundOnPlayerCancelDisabled',
                                'Enable Time requirements to configure this — a player can only cancel a timed craft in progress.'
                              )}</small
                        >
                      </div>
                    </div>
                  {/if}
                  <div class="manager-feature-tile" data-feature-key="currency">
                    <span
                      class={`manager-feature-tile-icon ${currencyEnabled ? 'is-on' : 'is-off'}`}
                      aria-hidden="true"><i class="fas fa-coins"></i></span
                    >
                    <div class="manager-feature-tile-body">
                      <div class="manager-feature-tile-head">
                        <strong
                          >{text('FABRICATE.Admin.Manager.Feature.Currency', 'Currency')}</strong
                        >
                        <button
                          type="button"
                          class={`manager-status-toggle ${currencyEnabled ? 'is-on' : 'is-off'}`}
                          aria-pressed={currencyEnabled}
                          aria-label={text('FABRICATE.Admin.Manager.Feature.Currency', 'Currency')}
                          data-system-currency-toggle
                          onclick={handleToggleCurrency}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true"
                            ><span class="manager-status-toggle-knob"></span></span
                          >
                          <span class="manager-status-toggle-label"
                            >{currencyEnabled
                              ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                              : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span
                          >
                        </button>
                      </div>
                      <small
                        >{text(
                          'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Currency',
                          "Lets this system's recipes charge the world's currency. Configure the coins under World > Currency."
                        )}</small
                      >
                    </div>
                  </div>
                  {#if gatheringFeatureEnabled}
                    <div class="manager-feature-tile" data-feature-key="gatheringRealms">
                      <span
                        class={`manager-feature-tile-icon ${gatheringRealmsEnabled ? 'is-on' : 'is-off'}`}
                        aria-hidden="true"><i class="fas fa-route"></i></span
                      >
                      <div class="manager-feature-tile-body">
                        <div class="manager-feature-tile-head">
                          <strong
                            >{text(
                              'FABRICATE.Admin.Manager.Feature.GatheringRealms',
                              'Travel & Realms'
                            )}</strong
                          >
                          <button
                            type="button"
                            class={`manager-status-toggle ${gatheringRealmsEnabled ? 'is-on' : 'is-off'}`}
                            aria-pressed={gatheringRealmsEnabled}
                            aria-label={text(
                              'FABRICATE.Admin.Manager.Feature.GatheringRealms',
                              'Travel & Realms'
                            )}
                            data-gathering-realm-toggle
                            onclick={handleToggleGatheringRealms}
                          >
                            <span class="manager-status-toggle-track" aria-hidden="true"
                              ><span class="manager-status-toggle-knob"></span></span
                            >
                            <span class="manager-status-toggle-label"
                              >{gatheringRealmsEnabled
                                ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                                : text(
                                    'FABRICATE.Admin.Manager.SystemEdit.FeatureOff',
                                    'Off'
                                  )}</span
                            >
                          </button>
                        </div>
                        <small
                          >{text(
                            'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.GatheringRealms',
                            "Gates this system's environments on where the party is, and gives them realm controls. Realms themselves are authored under World > Travel and shared by every system that turns this on."
                          )}</small
                        >
                      </div>
                    </div>
                  {/if}
                </div>
              </section>

              <!-- ── The ONE modifier library (issue 1117) ──────────────────────────────
                   Until this change a system authored modifiers TWICE: here, gated on the
                   gathering feature, and again on the Checks screen. The two shapes were
                   near-identical and the split was an accident of where each feature landed
                   rather than a distinction in the domain, so they merged. This section is
                   now the only surface that adds, edits, reorders, seeds or deletes an
                   entry, and the Checks screen selects over what is authored here.

                   IT IS NOT GATED ON GATHERING. The old gate was correct while the library
                   only fed d100 drop rows; a check modifier feeds a crafting or salvage
                   roll, so gating the only authoring surface on an unrelated feature flag
                   would make those unauthorable. -->
              <section
                class="manager-edit-card manager-character-modifier-card"
                class:is-section-collapsed={modifiersCollapsed}
                data-system-modifiers
                aria-label={text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')}
              >
                <header class="manager-character-modifier-card-header">
                  <button
                    type="button"
                    class="manager-section-collapse-toggle"
                    aria-expanded={!modifiersCollapsed}
                    aria-controls="manager-section-body-modifiers"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.ListErgonomics.ToggleSection',
                      'Collapse or expand this section'
                    )}
                    data-section-collapse="modifiers"
                    onclick={() => toggleSectionCollapsed('modifiers')}
                  >
                    <i
                      class={`fa-solid ${modifiersCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'}`}
                      aria-hidden="true"
                    ></i>
                  </button>
                  <div class="manager-character-modifier-card-header-copy">
                    <h3 class="manager-card-title">
                      <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
                      {text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')}
                    </h3>
                    <p class="manager-muted">
                      {text(
                        'FABRICATE.Admin.Manager.Modifiers.Hint',
                        'Reusable actor-driven modifiers for this system. Each expression resolves against the acting character (e.g. @abilities.med.mod). Checks add them to the roll; gathering drop rows and events shift the drop chance.'
                      )}
                    </p>
                  </div>
                  <!-- Both header verbs go through the shared primitive (issue 1096). `Add
                       modifier` keeps its primary role; `Seed presets` stays NEUTRAL, which
                       is what its bare `manager-button` already rendered — this change fixes
                       the sites that carried no role by mistake, not the ones that are
                       deliberately quiet. -->
                  <div class="manager-character-modifier-card-header-actions">
                    <ManagerButton role="primary" onclick={handleAddModifier}>
                      <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      {text('FABRICATE.Admin.Manager.Modifiers.Add', 'Add modifier')}
                    </ManagerButton>
                    <ManagerButton
                      disabled={!modifierPresetsSupported}
                      data-tooltip={!modifierPresetsSupported
                        ? text(
                            'FABRICATE.Admin.Manager.Modifiers.SeedPresetsUnsupported',
                            'Preset seeding is only available for dnd5e or pf2e worlds.'
                          )
                        : null}
                      onclick={onSeedModifierPresets}
                    >
                      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                      {text('FABRICATE.Admin.Manager.Modifiers.SeedPresets', 'Seed presets')}
                    </ManagerButton>
                  </div>
                </header>
                {#if !modifiersCollapsed}
                  <div id="manager-section-body-modifiers" class="manager-section-body">
                    {#if modifierLibrary.length === 0}
                      <EmptyState
                        compact
                        icon="fas fa-sliders"
                        title={text('FABRICATE.Admin.Manager.Modifiers.Empty', 'No modifiers yet.')}
                      />
                    {:else}
                      <ul class="manager-character-modifier-list">
                        {#each modifierLibrary as entry, index (entry.id)}
                          {@const modifierOpen = modifierEditingId === entry.id}
                          {@const modifierExpression = modifierExpressionDisplay(entry)}
                          {@const boundsChip = modifierBoundsChip(entry)}
                          {@const boundsFault = modifierBoundsFault(entry)}
                          <li
                            class="manager-modifier-item"
                            class:is-open={modifierOpen}
                            data-system-modifier={entry.id}
                          >
                            <div class="manager-modifier-header">
                              <button
                                type="button"
                                class="manager-modifier-summary"
                                aria-expanded={modifierOpen}
                                aria-controls={`system-modifier-body-${entry.id}`}
                                data-toggle-modifier
                                onclick={() => (modifierEditingId = modifierOpen ? '' : entry.id)}
                              >
                                <i
                                  class={`fa-solid ${modifierOpen ? 'fa-chevron-down' : 'fa-chevron-right'} manager-modifier-chevron`}
                                  aria-hidden="true"
                                ></i>
                                <span class="manager-modifier-icon"
                                  ><i class={entry.icon || 'fa-solid fa-user'} aria-hidden="true"
                                  ></i></span
                                >
                                <span class="manager-modifier-label">{entry.label}</span>
                                {#if modifierIsRoll(entry)}
                                  <Chip class="manager-character-modifier-roll-tag"
                                    >{text(
                                      'FABRICATE.Admin.Manager.Modifiers.RollTag',
                                      'Roll'
                                    )}</Chip
                                  >
                                {/if}
                                {#if boundsChip}
                                  <Chip tone="neutral" mono class="manager-modifier-bounds-chip"
                                    >{boundsChip}</Chip
                                  >
                                {/if}
                                {#if modifierExpression}
                                  <span
                                    class="manager-modifier-expression"
                                    data-modifier-expression
                                  >
                                    <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
                                    {modifierExpression}
                                  </span>
                                {/if}
                              </button>
                              <button
                                type="button"
                                class="manager-icon-button"
                                aria-label={text(
                                  'FABRICATE.Admin.Manager.ListErgonomics.MoveUp',
                                  'Move up'
                                )}
                                data-tooltip={text(
                                  'FABRICATE.Admin.Manager.ListErgonomics.MoveUp',
                                  'Move up'
                                )}
                                data-move-modifier-up={entry.id}
                                disabled={index === 0}
                                onclick={() =>
                                  reorderList(
                                    onReorderModifier,
                                    index,
                                    -1,
                                    entry.label,
                                    modifierLibrary.length
                                  )}
                              >
                                <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>
                              </button>
                              <button
                                type="button"
                                class="manager-icon-button"
                                aria-label={text(
                                  'FABRICATE.Admin.Manager.ListErgonomics.MoveDown',
                                  'Move down'
                                )}
                                data-tooltip={text(
                                  'FABRICATE.Admin.Manager.ListErgonomics.MoveDown',
                                  'Move down'
                                )}
                                data-move-modifier-down={entry.id}
                                disabled={index === modifierLibrary.length - 1}
                                onclick={() =>
                                  reorderList(
                                    onReorderModifier,
                                    index,
                                    1,
                                    entry.label,
                                    modifierLibrary.length
                                  )}
                              >
                                <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                              </button>
                              <button
                                type="button"
                                class="manager-icon-button"
                                aria-label={text(
                                  'FABRICATE.Admin.Manager.ListErgonomics.CopyToPrerequisites',
                                  'Copy to prerequisites'
                                )}
                                data-tooltip={text(
                                  'FABRICATE.Admin.Manager.ListErgonomics.CopyToPrerequisites',
                                  'Copy to prerequisites'
                                )}
                                data-copy-to-prerequisite={entry.id}
                                onclick={() => handleCopyModifierToPrerequisite(entry)}
                              >
                                <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
                              </button>
                              <button
                                type="button"
                                class="manager-icon-button is-danger"
                                aria-label={text(
                                  'FABRICATE.Admin.Manager.Modifiers.Delete',
                                  'Delete modifier'
                                )}
                                onclick={() => handleDeleteModifier(entry.id)}
                              >
                                <i class="fa-solid fa-trash" aria-hidden="true"></i>
                              </button>
                            </div>

                            {#if boundsFault}
                              <!-- Reported on the COLLAPSED row too, not only inside the open
                                   editor: an entry that contributes nothing is a fault the GM
                                   has to be able to see while scanning the list, and the
                                   Checks Validation section reports the same two ids. -->
                              <p
                                class="manager-modifier-bounds-error"
                                role="note"
                                data-system-modifier-bounds-invalid={entry.id}
                                data-system-modifier-bounds-cause={boundsFault}
                              >
                                {#if boundsFault === 'inverted'}
                                  {text(
                                    'FABRICATE.Admin.Manager.Modifiers.BoundsInverted',
                                    'This modifier’s minimum is above its maximum, so it contributes nothing at all until you fix the two values.'
                                  )}
                                {:else}
                                  {text(
                                    'FABRICATE.Admin.Manager.Modifiers.BoundsUnsafe',
                                    'This modifier’s bound is too large or too small to appear in a roll formula, so it contributes nothing until you fix it.'
                                  )}
                                {/if}
                              </p>
                            {/if}

                            {#if modifierOpen}
                              <div
                                class="manager-modifier-body manager-character-modifier-editor"
                                id={`system-modifier-body-${entry.id}`}
                                data-system-modifier-editor={entry.id}
                              >
                                <!-- Icon, label, minimum and maximum on ONE line, ahead of the
                                     expression (issue 1096, maintainer round). The four are the
                                     entry's short scalars; the expression is the one field whose
                                     content is long, so it gets the full width below them rather
                                     than competing with three neighbours for it. The row wraps
                                     at narrow manager widths — the bounds pair wraps as a UNIT,
                                     because a min separated from its max reads as two unrelated
                                     fields. -->
                                <div class="manager-modifier-name-row">
                                  <div class="manager-field manager-modifier-icon-field">
                                    <span
                                      >{text(
                                        'FABRICATE.Admin.Manager.Modifiers.Icon',
                                        'Icon'
                                      )}</span
                                    >
                                    <IconPicker
                                      value={entry.icon || 'fa-solid fa-user'}
                                      buttonTitle={text(
                                        'FABRICATE.Admin.Manager.Modifiers.ChangeIcon',
                                        'Change icon'
                                      )}
                                      onChange={(iconClass) =>
                                        onUpdateModifier(entry.id, { icon: iconClass })}
                                    />
                                  </div>
                                  <label class="manager-field manager-modifier-label-field">
                                    <span
                                      >{text(
                                        'FABRICATE.Admin.Manager.Modifiers.Label',
                                        'Label'
                                      )}</span
                                    >
                                    <input
                                      type="text"
                                      data-system-modifier-field="label"
                                      value={entry.label}
                                      oninput={(event) =>
                                        onUpdateModifier(entry.id, {
                                          label: event.currentTarget.value,
                                        })}
                                    />
                                  </label>
                                  <!-- The bounds pair rides the SAME line as icon and label
                                       since issue 1096. It keeps its own wrapper — and its own
                                       `data-system-modifier-bounds` hook — so the two steppers
                                       stay one flex item and wrap together, and so the View Lab
                                       case that anchors on that hook still resolves. -->
                                  <div
                                    class="manager-modifier-bounds-row"
                                    data-system-modifier-bounds={entry.id}
                                  >
                                    <div class="manager-field manager-modifier-bound-field">
                                      <span class="manager-recipe-micro-label"
                                        >{modifierMinLabel}</span
                                      >
                                      <Stepper
                                        value={resolveModifierBounds(entry).min}
                                        allowUnset
                                        fill
                                        placeholder={modifierUnboundedLabel}
                                        {...stepperLabels(modifierMinLabel)}
                                        inputProps={{ 'data-system-modifier-field': 'min' }}
                                        onChange={(next) =>
                                          handleModifierBound(entry.id, 'min', next)}
                                      />
                                    </div>
                                    <div class="manager-field manager-modifier-bound-field">
                                      <span class="manager-recipe-micro-label"
                                        >{modifierMaxLabel}</span
                                      >
                                      <Stepper
                                        value={resolveModifierBounds(entry).max}
                                        allowUnset
                                        fill
                                        placeholder={modifierUnboundedLabel}
                                        {...stepperLabels(modifierMaxLabel)}
                                        inputProps={{ 'data-system-modifier-field': 'max' }}
                                        onChange={(next) =>
                                          handleModifierBound(entry.id, 'max', next)}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <!-- The bounds hint sits DIRECTLY under the bounds it explains
                                     (issue 1096, maintainer round). Below the expression and its
                                     suggestion chips it read as a note about the expression,
                                     which is the one thing it says nothing about. -->
                                <p class="manager-muted manager-modifier-bounds-hint">
                                  {text(
                                    'FABRICATE.Admin.Manager.Modifiers.BoundsHint',
                                    'Optional. These clamp the resolved value when a check uses this modifier. Leave them empty for no limit — empty is not zero.'
                                  )}
                                </p>
                                <label class="manager-field">
                                  <span
                                    >{text(
                                      'FABRICATE.Admin.Manager.Modifiers.Expression',
                                      'Expression'
                                    )}</span
                                  >
                                  <!-- A PLAIN input: no `@` cap, no stripping, no re-prepending
                                       (maintainer ruling). The affix was written when an
                                       expression was always a roll-data path; dice made it
                                       wrong, because a cap that prepends `@` to whatever is
                                       typed turns `1d4` into `@1d4`. The adaptive compromise
                                       that shipped — cap present only while the value is a
                                       single `@`-path — restructures the field as the GM
                                       types, and the ruling is against it.

                                       So the leading `@` is now the GM's to write, and the
                                       PLACEHOLDER has to teach that: it read
                                       `abilities.med.mod`, which modelled an expression that
                                       would not resolve. -->
                                  <RollDataExpressionInput
                                    dataField="system-modifier"
                                    inputAttrs={{ 'data-system-modifier-field': 'expression' }}
                                    value={entry.expression}
                                    placeholder="@abilities.med.mod"
                                    sigil={false}
                                    onChange={(expression) =>
                                      onUpdateModifier(entry.id, { expression })}
                                  />
                                  <small class="manager-muted" data-system-modifier-expression-hint>
                                    {text(
                                      'FABRICATE.Admin.Manager.Modifiers.ExpressionHint',
                                      'A character-data path needs its leading @ — for example @abilities.med.mod. A number or a dice expression does not: write 2 or 1d4 as-is.'
                                    )}
                                  </small>
                                </label>
                                {#if modifierExpressionSuggestions.length > 0}
                                  <!-- Roll-data suggestion chips (issue 1096). Each APPENDS its
                                       term to the expression above rather than replacing it, so
                                       a GM builds `@abilities.wis.mod + 1d4` by clicking twice.
                                       The system-specific chips come from the active world's
                                       preset bundle — the same derivation `Seed presets` uses —
                                       so a chip can never offer a path this world does not
                                       define. -->
                                  <div
                                    class="manager-modifier-expression-suggestions"
                                    data-system-modifier-suggestions={entry.id}
                                    aria-label={text(
                                      'FABRICATE.Admin.Manager.Modifiers.SuggestionsLabel',
                                      'Add a term to this expression'
                                    )}
                                  >
                                    {#each modifierExpressionSuggestions as suggestion (suggestion.id)}
                                      <button
                                        type="button"
                                        class="manager-tag-suggestion manager-modifier-expression-suggestion"
                                        data-system-modifier-suggestion={suggestion.id}
                                        title={suggestion.label}
                                        onclick={(event) =>
                                          handleModifierSuggestion(
                                            event,
                                            entry,
                                            suggestion.expression
                                          )}
                                      >
                                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                                        <span>{suggestion.expression}</span>
                                      </button>
                                    {/each}
                                  </div>
                                {/if}
                                {#if modifierIsRoll(entry)}
                                  <!-- A roll-shaped expression is legal EVERYWHERE (issue
                                       1118): a drop row applies its result and a check
                                       appends the dice to its formula. The note stays because
                                       two consequences are worth stating where the expression
                                       is authored — the dice are rolled once with the check
                                       and shown on the card, and a competing rule ranks this
                                       entry by its average. It carries the shared muted
                                       note class rather than the fault class the two BLOCKING
                                       bounds problems use, because nothing here is wrong. -->
                                  <p
                                    class="manager-muted"
                                    role="note"
                                    data-system-modifier-roll-note={entry.id}
                                  >
                                    {text(
                                      'FABRICATE.Admin.Manager.Modifiers.RollNote',
                                      'This expression rolls dice. Every activity can use it: a gathering drop row applies its result, and a check appends the dice to its roll formula so the roll is made once and shows on the card. Where modifiers compete — Highest, or Player picks — this one is ranked by its average.'
                                    )}
                                  </p>
                                {/if}
                                <!-- THE REPORTED DEFECT (issue 1096). Both verbs carried a BARE
                                     `manager-button`: `Delete modifier` was painted as a
                                     neutral action while the identical verb in the Tool Studio
                                     is danger, and neither matched the studio's label scale.
                                     The roles are copied from `ToolEditView`'s header — its
                                     `Delete` is `danger` and its `Back to tools` is `ghost` —
                                     rather than chosen here. -->
                                <div class="manager-character-modifier-actions">
                                  <ManagerButton
                                    role="ghost"
                                    data-system-modifier-done={entry.id}
                                    onclick={() => (modifierEditingId = '')}
                                    >{text('FABRICATE.Admin.Manager.Done', 'Done')}</ManagerButton
                                  >
                                  <ManagerButton
                                    role="danger"
                                    data-system-modifier-delete={entry.id}
                                    onclick={() => handleDeleteModifier(entry.id)}
                                    >{text(
                                      'FABRICATE.Admin.Manager.Modifiers.Delete',
                                      'Delete modifier'
                                    )}</ManagerButton
                                  >
                                </div>
                              </div>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </section>

              <CharacterPrerequisitesCard
                library={characterPrerequisiteLibrary}
                presetsSupported={characterPrerequisitePresetsSupported}
                onAdd={onAddCharacterPrerequisite}
                onUpdate={onUpdateCharacterPrerequisite}
                onDelete={onDeleteCharacterPrerequisite}
                onReorder={async (fromIndex, toIndex, name) => {
                  await onReorderCharacterPrerequisite(fromIndex, toIndex);
                  announceReorder(name, toIndex + 1, characterPrerequisiteLibrary.length);
                }}
                onSeedPresets={onSeedCharacterPrerequisitePresets}
                collapsed={isSectionCollapsed('prerequisites')}
                onToggleCollapsed={() => toggleSectionCollapsed('prerequisites')}
                onCopyToModifier={handleCopyPrerequisiteToModifier}
                requestOpenId={prereqRequestOpenId}
                requestOpenNonce={prereqRequestOpenNonce}
              />
            </form>
          </main>
        {:else if activeTab === 'validation'}
          <SystemOverviewView report={validationReport} {onSelectIssue} />
        {/if}
      </div>
    </div>
  </div>
{/if}
