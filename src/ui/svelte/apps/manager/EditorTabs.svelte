<!-- Svelte 5 runes mode -->
<!--
  THE manager's editor tab strip (issue 1362, epic 1357).

  A PROMOTION, not a ninth strip. `environment/EnvironmentEditorTabs` and
  `system/SystemEditorTabs` already shared byte-identical badge logic, keyboard handling
  and markup, and `recipe-item/RecipeItemEditorTabs` carries the same props with three
  additions; `checks/ChecksEditorTabs` and `downtime/WorldDowntimeTabs` already prove that
  a caller-supplied tab list is a shipped pattern here. All three of those first strips
  are callers of this component now, and the six scoped-entity editors PRs 6a-c and 7 add
  consume it rather than authoring a tenth copy.

  ── THE DOM CONTRACT IS A PROP, because the three sites do not share one ────────────────

  A naive extraction of "tabs, activeTab, badges, onSelect" silently drops three
  externally-consumed contracts, each read by something outside this component:

   - the HOOK ATTRIBUTE NAME, which has no common stem — `data-environment-tab-button`,
     `data-system-tab`, `data-recipe-item-tab-button` — and is read by the smoke harness,
     the View Lab registry and ~25 mounted assertions;
   - the BUTTON `id` and `aria-controls` STEM, whose PANEL ids are rendered by
     `EnvironmentEditView.svelte`, `SystemEditView.svelte` and `RecipeItemEditor.svelte`.
     Changing a stem would either dangle every `aria-controls` or drag three more files
     into the change;
   - the per-site `aria-label` lang key.

  So each is a prop, and no converted site changes a rendered id, `aria-controls`,
  `data-*` attribute name or badge class.

  ── THE RAIL MARKER FAMILY IS A CAPABILITY, not a reason for a second strip (issue 1429) ─

  `DOMAIN.md`'s **Rail Marker Family** and design-system spec.md requirement
  "Near-neighbour primitives are routed by a stated rule" name FOUR marks that MUST NOT be
  substituted for one another. Which one a strip draws is decided by what the mark MEANS:

   - `count`  a RECORD COUNT — how many records. A bare mono tabular numeral, no fill and
              no border. `library.html:1008`'s `<TabBar>` specimen already draws two of
              them (`Tiers 3`, `Businesses 23`) beside one warning badge, so the tab bar
              carrying both vehicles is specified, not an extension of the specification.
   - `issue`  an ISSUE SUMMARY — how many things want attention. The filled chip, toned.
              It is amber because it asks for attention, not because anything is wrong.
   - `dot`    the family's 6px filled dot, distinguished from the chip by SHAPE as well as
              colour and therefore REQUIRING a text accessible name; a nameless dot is
              dropped rather than drawn, on the rule `Chip` drops an unknown tone.

  The fourth, the PREMIUM chip, is deliberately not offered here: canon scopes it to the
  manager RAIL, where it rides the count vehicle's own box, and a vehicle with no possible
  caller on this surface would be configuration that cannot be reached.

  A mark that names no vehicle is the ISSUE chip, which is what every caller predating this
  change passes and therefore renders exactly what it rendered before. The family is CLOSED:
  a caller names a vehicle and the primitive owns the drawing, so there is no route by which
  a call site can supply markup, a class or a shape of its own. An unrecognised vehicle name
  falls back to the chip rather than emitting an unstyled mark.

  A tab may carry MORE THAN ONE mark, because a section can be both authored and unready at
  once — pass an array, and they render in the order the caller listed them.

  Props:
   - tabs: `{id, icon, labelKey, label}[]`, in render order. `labelKey` is looked up and
     `label` is the English fallback, matching the `text()` contract everywhere else.
   - activeTab / onSelect(tabId).
   - badges: per tab id, one mark or an array of them. A mark is a plain value, or
     `{vehicle, label, tone, name, icon, suppressZero}` — `vehicle` ∈ count/issue/dot (default
     `issue`), `tone` ∈ neutral/success/warning/danger and applies to the chip, `name` is
     the accessible name (REQUIRED by any mark that renders no text — the `dot`, and the
     glyph-only chip below), and `suppressZero` defaults true so a mark reading `0` is
     omitted rather than stated as zero.
     `icon` is a leading Font Awesome glyph drawn through `Chip`'s own `icon` prop, and is
     what lets an ISSUE mark be a GLYPH rather than a number — the scoped entry editors'
     passing Validation tab is a tick, not a count, and a chip reading `0` would state the
     opposite of what it means. It is a PROPERTY OF THE CHIP and not a fourth vehicle: the
     chip is still the drawing, the caller supplies no markup, class or shape of its own,
     and `count` and `dot` drop it because their classes are their drawing. An icon-only
     chip (empty `label`) is drawn rather than filtered away as empty, and takes `name` for
     exactly the reason the dot does.
   - ariaLabelKey / ariaLabel: the strip's own accessible name.
   - idStem: builds `<stem>-tab-<id>` and `aria-controls="<stem>-panel-<id>"`.
   - buttonIdStem / panelIdStem: override either half of that pair for a site whose ids do
     not share the `-tab-`/`-panel-` shape (`checks-section-<id>` / `checks-panel-<id>`).
   - activePanelOnly: emit `aria-controls` ONLY on the selected tab. Not cosmetic and not
     optional for the sites that need it: a strip rendering one panel at a time points every
     unselected tab at an id that is not in the document, which assistive technology reports
     as a broken relationship rather than as "not currently shown".
   - hookAttribute: the per-button `data-*` name carrying the tab id.
   - containerAttribute: a valueless `data-*` hook on the tablist itself; '' renders none.
   - badgeAttribute / countAttribute / dotAttribute: the per-mark `data-*` name carrying the
     tab id, one per vehicle because the shipped hooks do not share a stem; '' renders none.
     `badgeAttribute` keeps its name rather than becoming `issueAttribute` because three
     shipped callers pass it.
   - containerClass / buttonClass / badgeClass: the site's existing classes, kept so no
     shipped rule in `styles/fabricate.css` stops matching. The COUNT and DOT have no such
     prop: their classes are the drawing, and a drawing a caller can choose is the style
     divergence this capability exists to remove.
   - danger: whether a danger chip also tints its button.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Chip from './Chip.svelte';

  let {
    tabs = [],
    activeTab = '',
    badges = {},
    onSelect = () => {},
    ariaLabelKey = '',
    ariaLabel = '',
    idStem = 'editor',
    buttonIdStem = '',
    panelIdStem = '',
    activePanelOnly = false,
    hookAttribute = 'data-editor-tab-button',
    containerAttribute = '',
    badgeAttribute = '',
    countAttribute = '',
    dotAttribute = '',
    containerClass = 'manager-editor-tabs',
    buttonClass = 'manager-editor-tab-button',
    badgeClass = 'manager-editor-tab-badge',
    danger = false,
  } = $props();

  // Derived rather than a destructuring default, which cannot safely read a sibling binding.
  const buttonStem = $derived(buttonIdStem || `${idStem}-tab`);
  const panelStem = $derived(panelIdStem || `${idStem}-panel`);

  // The family, closed. Anything else a caller names is drawn as the chip rather than
  // emitted as an unstyled mark, so a typo shows up as the recessive default instead of as
  // nothing at all.
  const VEHICLES = new Set(['count', 'issue', 'dot']);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function normalizeMark(tab, mark) {
    const fallbackTone = tab.id === 'validation' ? 'danger' : 'neutral';
    if (mark && typeof mark === 'object') {
      const vehicle = VEHICLES.has(mark.vehicle) ? mark.vehicle : 'issue';
      return {
        vehicle,
        label: mark.label ?? mark.value ?? '',
        tone: mark.tone || fallbackTone,
        // The glyph belongs to the CHIP alone. `count` and `dot` drop it rather than drawing
        // it, because their classes ARE their drawing and a caller-chosen shape on either is
        // the style divergence this capability exists to remove.
        icon: vehicle === 'issue' && typeof mark.icon === 'string' ? mark.icon : '',
        name: mark.name ?? '',
        suppressZero: mark.suppressZero !== false,
      };
    }
    return {
      vehicle: 'issue',
      label: mark,
      tone: fallbackTone,
      icon: '',
      name: '',
      suppressZero: true,
    };
  }

  // A mark that renders no text is judged on what it DOES render: the dot on its name, the
  // glyph-only chip on its icon. Everything else is judged on its label. The zero rule is the
  // caller's to state, because the canonical text settles it per surface rather than per
  // vehicle: the rail's record counts render `0` and the Checks strip's do not.
  function isDrawable(mark) {
    if (mark.vehicle === 'dot') return mark.name !== '';
    if (mark.icon !== '') return true;
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

  // A mark tone name is this component's own vocabulary; `Chip` names the colour families
  // differently (`success` is `active` there), so translate rather than leak one spelling
  // into the other (issue 883).
  function badgeTone(tone) {
    if (tone === 'danger') return 'danger';
    if (tone === 'warning') return 'warning';
    if (tone === 'success') return 'active';
    return 'neutral';
  }

  function isDangerTab(tab) {
    return (
      danger && markList(tab).some((mark) => mark.vehicle === 'issue' && mark.tone === 'danger')
    );
  }

  function containerAttributes() {
    if (!containerAttribute) return {};
    return { [containerAttribute]: '' };
  }

  function buttonAttributes(tab) {
    return { [hookAttribute]: tab.id };
  }

  function markAttributes(tab, mark) {
    if (mark.vehicle === 'count') return countAttribute ? { [countAttribute]: tab.id } : {};
    if (mark.vehicle === 'dot') return dotAttribute ? { [dotAttribute]: tab.id } : {};
    // A GLYPH chip renders no text, so without this it would contribute nothing to the tab's
    // accessible name while a COUNT chip contributes its number: a screen reader would hear
    // `Validation` for a passing tab and `Validation 3` for a failing one, which is the
    // difference between the two states being announced and one of them being silent. It
    // rides the chip rather than the button so the tab's own label stays first. The `dot`
    // states the same thing on its own element two branches down in the template.
    const named = mark.name ? { 'aria-label': mark.name } : {};
    if (!badgeAttribute) return named;
    return { ...named, [badgeAttribute]: tab.id, 'data-badge-tone': mark.tone };
  }

  // Arrow / Home / End, the four the ARIA tablist pattern asks a horizontal strip for. Home
  // and End are not a nicety on an ordered strip — "back to the first section" and "the last
  // one" are the two jumps a GM repeats — and a strip that handled the arrows but swallowed
  // nothing else left them doing whatever the browser does with Home inside a button row,
  // which is nothing. Stated once here rather than per caller, on the same rule as the tone
  // mapping above: universal, so there is no second keyboard vocabulary to get wrong.
  function targetIndex(key, index) {
    if (key === 'ArrowRight') return (index + 1) % tabs.length;
    if (key === 'ArrowLeft') return (index - 1 + tabs.length) % tabs.length;
    if (key === 'Home') return 0;
    if (key === 'End') return tabs.length - 1;
    return -1;
  }

  function onKeydown(event, index) {
    const nextIndex = targetIndex(event.key, index);
    if (nextIndex < 0) return;
    event.preventDefault();
    onSelect(tabs[nextIndex].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<div
  class={containerClass}
  role="tablist"
  aria-label={text(ariaLabelKey, ariaLabel)}
  {...containerAttributes()}
>
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`${buttonStem}-${tab.id}`}
      class={`${buttonClass} ${activeTab === tab.id ? 'is-active' : ''} ${isDangerTab(tab) ? 'is-danger' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={activePanelOnly && activeTab !== tab.id ? undefined : `${panelStem}-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-keyboard-focus="true"
      {...buttonAttributes(tab)}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(tab.labelKey, tab.label)}</span>
      {#each markList(tab) as mark, markIndex (`${tab.id}-${markIndex}`)}
        {#if mark.vehicle === 'count'}
          <span class="manager-editor-tab-count" {...markAttributes(tab, mark)}>{mark.label}</span>
        {:else if mark.vehicle === 'dot'}
          <span
            class="manager-editor-tab-dot"
            role="img"
            aria-label={mark.name}
            {...markAttributes(tab, mark)}
          ></span>
        {:else}
          <Chip
            tone={badgeTone(mark.tone)}
            icon={mark.icon}
            class={badgeClass}
            {...markAttributes(tab, mark)}>{mark.label}</Chip
          >
        {/if}
      {/each}
    </button>
  {/each}
</div>

<style>
  /* The validation tab turns danger when its badge is a failing count (design
     §7.5): the label and its underline follow the danger colour. Authored here rather
     than in `RecipeItemEditorTabs`, because the button this rule targets is rendered by
     THIS component — a scoped block left behind on the caller would match nothing and
     fail the unused-selector warning gate.

     `:global()` on both compounds is REQUIRED and is not a loosening. Svelte's scoper adds
     its hash to a selector it can bind to an element in THIS component's template, and both
     classes reach the button through the `buttonClass` prop and the `is-active` expression
     rather than as literal attribute text, so the scoped form emits a hash the button never
     carries and the rule is dead at runtime while warning about nothing. Specificity is
     preserved exactly: `:global(.a.b)` is still (0,2,0). */
  :global(.manager-editor-tab-button.is-danger) {
    color: var(--fab-danger-text);
  }

  :global(.manager-editor-tab-button.is-danger.is-active) {
    border-bottom-color: var(--fab-danger-border);
  }
</style>
