<!--
  THE manager's editor tab strip: a `role="tablist"` of buttons, each optionally carrying one or more
  MARKS, with the ARIA tablist keyboard pattern. Every converted hand-rolled strip renders it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tabs` / `activeTab` / `onSelect(tabId)` | `{ id, icon, label }[]` / string / function | `[]` / `''` / no-op | The tabs in render order, where `label` is final display text the caller resolved, and a tab with no `icon` draws no glyph; the current tab; and the selection callback. The strip holds no selection state. |
  | `annotated` | boolean | `false` | Reads each tab's `ariaLabel`, `tooltip` and `tierGated` below; off, a tab is drawn from its `id`, `icon` and `label` alone. |
  | tab `ariaLabel` | final text | absent | The tab's accessible name, which MUST contain its visible label; absent writes no `aria-label`, except on the `validation` tab, whose toned counts are named here (see Invariants). |
  | tab `tooltip` | final text | absent | The tab's description: a `role="tooltip"` sibling after the tablist, named by the tab's `aria-describedby` and placed above its tab, start-aligned to it, clamped inside the caller's nearest positioned ancestor. |
  | tab `tierGated` | boolean | `false` | Draws the premium padlock after the label; the tab stays focusable and selectable. |
  | `badges` | per tab id: one mark, or an array of them | `undefined`, no marks | A mark is a plain value, or `{ vehicle, label, tone, name, suppressZero }`. `tone` ∈ neutral/success/positive/warning/danger and applies to the CHIP; `name` is the accessible name, REQUIRED by any mark that renders no readable text; `suppressZero` defaults true. A tab may carry more than one mark, because a section can be both authored and unready at once. |
  | `ariaLabel` | final text | `''` | The strip's own accessible name. |
  | `idStem` / `buttonIdStem` / `panelIdStem` | strings | `'editor'` / `''` / `''` | `idStem` builds `<stem>-tab-<id>` and `aria-controls="<stem>-panel-<id>"`; the other two override either half of that pair for a site whose ids do not share the `-tab-`/`-panel-` shape. |
  | `tooltipIdStem` / `tooltipDataAttr` | string / `data-*` name | `<idStem>-tooltip` / `''` | The description id `<stem>-<id>` and its per-tab hook. |
  | `activePanelOnly` | boolean | `false` | Emit `aria-controls` ONLY on the selected tab. Not cosmetic: a strip rendering one panel at a time otherwise points every unselected tab at an id not in the document, which assistive technology reports as a broken relationship rather than as "not currently shown". |
  | `tabDataAttr` / `badgeDataAttr` / `countDataAttr` / `dotDataAttr` | `data-*` names | see source | The per-button and per-vehicle hooks carrying the tab id; `''` renders none. One per vehicle because the shipped hooks do not share a stem. |
  | `containerClass` / `buttonClass` / `badgeClass` / `danger` | class strings / boolean | the primitive's own family / `false` | Hooks a site's harness and its placement rule select on; none of them draws, and a mark takes no class, because the COUNT's and DOT's classes ARE the drawing. `danger` tints a tab carrying a danger issue mark. |

  Rest spread:
  - `{...rest}` lands on the tablist root, written after `class`, and carries the per-tablist hook.
    The root's class prop is `containerClass`, so `class` is not a prop here.

  Invariants:
  - THE DOM CONTRACT IS A PROP, because the converging sites do not share one: the hook attribute
    name has no common stem and is read by the smoke harness, the View Lab registry and ~25 mounted
    assertions; and the button `id` and `aria-controls` stem has its PANEL ids rendered by the
    caller. No converted site changes a rendered id or class.
  - THE CALLER RESOLVES EVERY STRING IT PASSES (`localizeTabs` in `util/localizeOr.js` does it for
    a tab list); the strip localizes only the severity names it builds, through `APP_LOCALIZER`, so
    a tree mounted with none draws their English and calls no `game.i18n`.
  - THE MARK FAMILY IS CLOSED, AND WHICH MARK A STRIP DRAWS IS DECIDED BY WHAT IT MEANS.
    `DOMAIN.md`'s Rail Marker Family names four marks that MUST NOT be substituted for one another:
    `count` is a RECORD COUNT, a bare mono numeral; `issue` is an ISSUE SUMMARY, the filled toned
    chip, amber because it asks for attention rather than because anything is wrong; `dot` is the
    filled dot, distinguished by SHAPE as well as colour and therefore REQUIRING a text accessible
    name, so a nameless dot is DROPPED; and the PREMIUM chip is scoped by canon to the manager rail.
    A mark naming no vehicle is the ISSUE chip, and an unrecognised name falls back to it.
  - A CALLER NAMES A VEHICLE AND THE PRIMITIVE OWNS THE DRAWING: no call site supplies markup, a
    class or a shape, and A MARK CARRIES NO `icon` OR `class`. The pass mark is the issue chip's
    LABEL rather than a fourth vehicle.
  - `positive` IS `Chip`'s OWN SPELLING of the success family, passed through rather than folded
    into `success`. THE STRIP IS ROOTED AT `fabricate-tabs`, written ahead of whatever
    `containerClass` carries, per `openspec/specs/design-system/spec.md`.
  - A VALIDATION TAB'S COUNTS ARE NAMED, NOT LEFT TO COLOUR. The `validation` tab carrying issue marks toned
    danger or warning, none of which carries its own `name`, takes the accessible name "Validation, 2 blocking,
    1 warning" on its button; the marks' DOM and the strip's pixels do not change. A tab that sets its own
    `ariaLabel`, or any mark that names itself, keeps that name.
  - The tab stop is `activeTab`, or the first tab when it names none; `aria-selected` stays bound to
    `activeTab`. The hovered described tab's description shows, else the focused one's, and Escape
    hides it until that tab is next hovered or focused — pinned by `tests/components/editor-tabs-capabilities.test.js`.
    A description stays shown while the pointer is over it, and a hover-shown one takes Escape even
    with focus outside the strip, stopping it before the window's keybindings so the host stays open;
    the strip listens on its document only while a description shows.
-->
<script>
  import { getContext } from 'svelte';

  import { fill } from '../../../utils/fillPlaceholders.js';
  import { localizeWith } from '../../../utils/localizeWithFallback.js';
  import { APP_LOCALIZER } from '../util/appLocalizer.js';
  import Chip from './Chip.svelte';

  const DEFAULT_CLASSES = Object.freeze({
    container: 'manager-editor-tabs',
    button: 'manager-editor-tab-button',
    badge: 'manager-editor-tab-badge',
  });

  let {
    tabs = [],
    activeTab = '',
    badges = undefined,
    onSelect = () => {},
    ariaLabel = '',
    idStem = 'editor',
    buttonIdStem = '',
    panelIdStem = '',
    activePanelOnly = false,
    annotated = false,
    tabDataAttr = 'data-editor-tab-button',
    tooltipIdStem = '',
    tooltipDataAttr = '',
    badgeDataAttr = '',
    countDataAttr = '',
    dotDataAttr = '',
    containerClass = DEFAULT_CLASSES.container,
    buttonClass = DEFAULT_CLASSES.button,
    badgeClass = DEFAULT_CLASSES.badge,
    danger = false,
    ...rest
  } = $props();

  const localize = getContext(APP_LOCALIZER);

  const buttonStem = $derived(buttonIdStem || `${idStem}-tab`);
  const panelStem = $derived(panelIdStem || `${idStem}-panel`);
  const tooltipStem = $derived(tooltipIdStem || `${idStem}-tooltip`);
  const tabStop = $derived(
    tabs.some((tab) => tab.id === activeTab) ? activeTab : (tabs[0]?.id ?? null)
  );
  const describedTabs = $derived(tabs.filter(isDescribed));
  const describedIds = $derived(new Set(describedTabs.map((tab) => tab.id)));

  // Each map is keyed by tab id, so a spread below reads a script-level derived, never a call.
  const marksByTab = $derived(byTab(markList));
  const buttonHooks = $derived(byTab((tab) => hook(tabDataAttr, tab)));
  const tooltipHooks = $derived(byTab((tab) => hook(tooltipDataAttr, tab)));
  const markHooks = $derived(
    byTab((tab) => marksByTab[tab.id].map((mark) => markAttributes(tab, mark)))
  );

  let hoveredTabId = $state(null);
  let focusedTabId = $state(null);
  let dismissedTabId = $state(null);
  const shownTooltipId = $derived.by(() => {
    const candidate = hoveredTabId ?? focusedTabId;
    return candidate === dismissedTabId || !describedIds.has(candidate) ? null : candidate;
  });

  const VEHICLES = new Set(['count', 'issue', 'dot']);
  const HOVER_GRACE_MS = 150;
  const TOOLTIP_GAP_PX = 7;

  const buttonNodes = $state({});
  const tooltipNodes = $state({});
  let tablistNode = null;
  let hoverClear = null;
  let tooltipPlacement = $state({ id: null, style: undefined });

  $effect(() => {
    const id = shownTooltipId;
    tooltipPlacement = { id, style: id === null ? undefined : placement(id) };
  });
  $effect(() => () => clearTimeout(hoverClear));

  // Capturing at the document runs ahead of Foundry's window-level keybindings; it binds while a
  // description shows, on the document the strip is in at that moment.
  $effect(() => {
    if (shownTooltipId === null) return undefined;
    const host = tablistNode?.ownerDocument;
    host?.addEventListener('keydown', onDocumentKeydown, true);
    return () => host?.removeEventListener('keydown', onDocumentKeydown, true);
  });

  function byTab(read) {
    return Object.fromEntries(tabs.map((tab) => [tab.id, read(tab)]));
  }

  function hook(name, tab) {
    return name ? { [name]: tab.id } : {};
  }

  function severityText(key, fallback, data) {
    return fill(localizeWith(localize, key, undefined, fallback), data);
  }

  function isDescribed(tab) {
    return annotated && Boolean(tab.tooltip);
  }

  function track(kind, tabId) {
    if (kind === 'hover') {
      clearTimeout(hoverClear);
      hoveredTabId = tabId;
    } else focusedTabId = tabId;
    if (dismissedTabId === tabId) dismissedTabId = null;
  }

  // A pointer leaving a tab or its description keeps it shown for the grace, so it can cross the gap.
  function untrack(kind, tabId) {
    if (kind === 'focus') {
      if (focusedTabId === tabId) focusedTabId = null;
      return;
    }
    clearTimeout(hoverClear);
    hoverClear = setTimeout(() => {
      if (hoveredTabId === tabId) hoveredTabId = null;
    }, HOVER_GRACE_MS);
  }

  // Unmeasurable (no shared positioned ancestor) leaves the sheet's end-aligned fallback in force.
  function placement(tabId) {
    const tabButton = buttonNodes[tabId];
    const tooltip = tooltipNodes[tabId];
    const anchor = tooltip?.offsetParent;
    if (!anchor || tabButton?.offsetParent !== anchor || !anchor.clientWidth) return undefined;
    const left = Math.max(
      0,
      Math.min(tabButton.offsetLeft, anchor.clientWidth - tooltip.offsetWidth)
    );
    const bottom = anchor.clientHeight - tabButton.offsetTop + TOOLTIP_GAP_PX;
    return `left: ${left}px; right: auto; bottom: ${bottom}px;`;
  }

  function onDocumentKeydown(event) {
    if (event.key !== 'Escape' || focusedTabId !== null || shownTooltipId === null) return;
    dismissedTabId = shownTooltipId;
    event.stopPropagation();
  }

  function normalizeMark(tab, mark) {
    const fallbackTone = tab.id === 'validation' ? 'danger' : 'neutral';
    if (mark && typeof mark === 'object') {
      const vehicle = VEHICLES.has(mark.vehicle) ? mark.vehicle : 'issue';
      return {
        vehicle,
        label: mark.label ?? mark.value ?? '',
        tone: mark.tone || fallbackTone,
        name: mark.name ?? '',
        suppressZero: mark.suppressZero !== false,
      };
    }
    return {
      vehicle: 'issue',
      label: mark,
      tone: fallbackTone,
      name: '',
      suppressZero: true,
    };
  }

  function isDrawable(mark) {
    if (mark.vehicle === 'dot') return mark.name !== '';
    if (mark.label === '' || mark.label === null || mark.label === undefined) return false;
    return !(mark.label === 0 && mark.suppressZero);
  }

  function markList(tab) {
    const value = badges?.[tab.id];
    const values = Array.isArray(value)
      ? value
      : value === undefined || value === null
        ? []
        : [value];
    return values.map((mark) => normalizeMark(tab, mark)).filter(isDrawable);
  }

  function badgeTone(tone) {
    if (tone === 'danger') return 'danger';
    if (tone === 'warning') return 'warning';
    if (tone === 'success') return 'active';
    if (tone === 'positive') return 'positive';
    return 'neutral';
  }

  function isDangerTab(tab) {
    return (
      danger &&
      marksByTab[tab.id].some((mark) => mark.vehicle === 'issue' && mark.tone === 'danger')
    );
  }

  const SEVERITY_KEYS = {
    danger: [
      'FABRICATE.Admin.Manager.Validation.TabBlockingOne',
      'FABRICATE.Admin.Manager.Validation.TabBlockingOther',
      '{count} blocking',
      '{count} blocking',
    ],
    warning: [
      'FABRICATE.Admin.Manager.Validation.TabWarningOne',
      'FABRICATE.Admin.Manager.Validation.TabWarningOther',
      '{count} warning',
      '{count} warnings',
    ],
  };

  // The Validation tab's toned counts as words, so severity is not carried by colour alone.
  function severityName(tab) {
    if (tab.id !== 'validation') return undefined;
    const marks = marksByTab[tab.id];
    if (marks.length === 0 || marks.some((mark) => mark.name !== '')) return undefined;
    const parts = [];
    for (const mark of marks) {
      const keys = mark.vehicle === 'issue' ? SEVERITY_KEYS[mark.tone] : undefined;
      const count = Number(mark.label);
      if (!keys || !Number.isFinite(count)) return undefined;
      const [oneKey, otherKey, oneText, otherText] = keys;
      const one = count === 1;
      parts.push(severityText(one ? oneKey : otherKey, one ? oneText : otherText, { count }));
    }
    return severityText(
      'FABRICATE.Admin.Manager.Validation.TabNameWithIssues',
      '{label}, {issues}',
      {
        label: tab.label,
        issues: parts.join(', '),
      }
    );
  }

  function tabName(tab) {
    if (annotated && tab.ariaLabel) return tab.ariaLabel;
    return severityName(tab);
  }

  function markAttributes(tab, mark) {
    if (mark.vehicle === 'count') return hook(countDataAttr, tab);
    if (mark.vehicle === 'dot') return hook(dotDataAttr, tab);
    const attributes = badgeDataAttr
      ? { [badgeDataAttr]: tab.id, 'data-badge-tone': mark.tone }
      : {};
    if (mark.name) attributes['aria-label'] = mark.name;
    return attributes;
  }

  function targetIndex(key, index) {
    if (key === 'ArrowRight') return (index + 1) % tabs.length;
    if (key === 'ArrowLeft') return (index - 1 + tabs.length) % tabs.length;
    if (key === 'Home') return 0;
    if (key === 'End') return tabs.length - 1;
    return -1;
  }

  function activate(event, tabId) {
    const tabButton = event.currentTarget;
    onSelect(tabId);
    tabButton.focus();
  }

  function onKeydown(event, index) {
    if (event.key === 'Escape') {
      if (shownTooltipId !== null) dismissedTabId = shownTooltipId;
      return;
    }
    const nextIndex = targetIndex(event.key, index);
    if (nextIndex < 0) return;
    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
    onSelect(tabs[nextIndex].id);
  }
</script>

<div
  bind:this={tablistNode}
  class={`fabricate-tabs ${containerClass}`}
  role="tablist"
  aria-label={ariaLabel}
  {...rest}
>
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`${buttonStem}-${tab.id}`}
      class={`${buttonClass} ${activeTab === tab.id ? 'is-active' : ''} ${isDangerTab(tab) ? 'is-danger' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={activePanelOnly && activeTab !== tab.id ? undefined : `${panelStem}-${tab.id}`}
      aria-label={tabName(tab)}
      aria-describedby={describedIds.has(tab.id) ? `${tooltipStem}-${tab.id}` : undefined}
      tabindex={tabStop === tab.id ? 0 : -1}
      data-keyboard-focus="true"
      bind:this={buttonNodes[tab.id]}
      {...buttonHooks[tab.id]}
      onclick={(event) => activate(event, tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
      onmouseenter={() => track('hover', tab.id)}
      onmouseleave={() => untrack('hover', tab.id)}
      onfocus={() => track('focus', tab.id)}
      onblur={() => untrack('focus', tab.id)}
    >
      {#if tab.icon}<i class={tab.icon} aria-hidden="true"></i>{/if}
      <span>{tab.label}</span>{#if annotated && tab.tierGated}<i
          class="fas fa-lock manager-editor-tab-lock"
          aria-hidden="true"
        ></i>{/if}
      {#if badges}
        {#each marksByTab[tab.id] as mark, markIndex (`${tab.id}-${markIndex}`)}
          {#if mark.vehicle === 'count'}
            <span class="manager-editor-tab-count" {...markHooks[tab.id][markIndex]}
              >{mark.label}</span
            >
          {:else if mark.vehicle === 'dot'}
            <span
              class="manager-editor-tab-dot"
              role="img"
              aria-label={mark.name}
              {...markHooks[tab.id][markIndex]}
            ></span>
          {:else}
            <Chip
              tone={badgeTone(mark.tone)}
              density="inspector"
              mono
              class={badgeClass}
              {...markHooks[tab.id][markIndex]}>{mark.label}</Chip
            >
          {/if}
        {/each}
      {/if}
    </button>
  {/each}
</div>
{#each describedTabs as tab (tab.id)}<span
    id={`${tooltipStem}-${tab.id}`}
    class="fabricate-tabs-tooltip"
    class:is-described={shownTooltipId === tab.id}
    style={tooltipPlacement.id === tab.id ? tooltipPlacement.style : undefined}
    role="tooltip"
    bind:this={tooltipNodes[tab.id]}
    onmouseenter={() => track('hover', tab.id)}
    onmouseleave={() => untrack('hover', tab.id)}
    {...tooltipHooks[tab.id]}>{tab.tooltip}</span
  >{/each}

<style>
  .manager-editor-tab-button.is-danger,
  .manager-environment-tab-button.is-danger {
    color: var(--fab-danger-text);
  }

  .manager-editor-tab-button.is-danger.is-active,
  .manager-environment-tab-button.is-danger.is-active {
    border-bottom-color: var(--fab-danger-border);
  }
</style>
