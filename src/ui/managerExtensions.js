import { MANAGER_HOOKS } from '../config/hooks.js';
import { createExtensionRegistry, requireNonEmptyString } from './extensionRegistry.js';
import { createNavTabBadgeStore } from './navTabBadgeStore.js';

/**
 * The surface id Core's GM Manager looks a World navigation provider up under for its
 * `World > Downtime` route. It is the ONLY id Core itself consumes; the registry accepts
 * any non-empty string, so a future Core surface (or a companion-only one) needs no
 * change here.
 */
export const WORLD_DOWNTIME_SURFACE_ID = 'downtime';

const REQUIRED_TAB_FIELDS = Object.freeze(['label', 'accessibleName', 'tooltip', 'icon']);
// Route chrome. Every one is optional; Core keeps its own string when a tab omits it.
const OPTIONAL_TAB_FIELDS = Object.freeze(['title', 'subtitle', 'breadcrumb', 'actionsLabel']);
// The two fields of a tab badge. Both required when a badge is present; nothing else is
// accepted, so a `tone` or a `label` fails at the call site rather than rendering nothing.
const TAB_BADGE_FIELDS = Object.freeze(['count', 'accessibleName']);
/**
 * Every key a provider tab may carry (issue 1302).
 *
 * DERIVED from the field lists above rather than restated, because a restatement is a
 * hand-maintained mirror across twenty lines of the same file: it would agree today and
 * refuse the next optional field somebody adds to `OPTIONAL_TAB_FIELDS` and forgets to add
 * here — a failure whose message would blame the companion for Core's omission.
 */
const TAB_FIELDS = Object.freeze([
  'id',
  ...REQUIRED_TAB_FIELDS,
  ...OPTIONAL_TAB_FIELDS,
  'actions',
  'badge',
]);
const OPTIONAL_ACTION_FIELDS = Object.freeze(['icon', 'tooltip']);
// Boolean-only action fields. They were the two provider fields nothing validated: a
// `primary: 'yes'` reached the renderer and quietly painted an ordinary button, which is the
// class of failure every other field on this seam already refuses at the boundary.
const BOOLEAN_ACTION_FIELDS = Object.freeze(['primary', 'disabled']);
/**
 * The four button treatments Core's own Manager header paints, named after the treatment
 * rather than after a colour so a theme may repaint one without renaming the contract.
 *
 * They exist because a companion header has to be INDISTINGUISHABLE from a Core one:
 * Fabricate's own editors put a ghost `Back`, a danger `Delete` and a primary `Save` in the
 * page header, and a seam that could only say `primary` forced a companion to either
 * hand-roll those two treatments inside its panel or ship a header that reads as foreign.
 * `neutral` is the default Manager button and adds no modifier class at all.
 */
export const ACTION_TONES = Object.freeze(['primary', 'ghost', 'danger', 'neutral']);
/**
 * The Manager button modifier each tone paints, declared beside the tones themselves.
 *
 * It lives with the contract rather than in the renderer because a copy in the component
 * would be a hand-maintained mirror of this list across a file boundary — agreeing today,
 * undetectable the day a tone is added and the renderer is not updated. Here, adding a tone
 * without its class is a syntactically visible omission and `managerHeaderActionClass` is
 * unit-testable without mounting anything.
 *
 * `neutral` maps to no modifier at all: the unadorned `.manager-button` IS the neutral
 * treatment, and emitting an `is-neutral` class the stylesheet does not define would look
 * like a rule someone forgot to write.
 */
const ACTION_TONE_CLASSES = Object.freeze({
  primary: 'is-primary',
  ghost: 'is-ghost',
  danger: 'is-danger',
  neutral: '',
});
// A header action may link out, but only over http(s): Core renders the value into an
// `href`, so a `javascript:` or `data:` URL would be script injection through the seam.
const EXTERNAL_ACTION_HREF = /^https?:\/\//i;
const PROVIDER = 'Fabricate World navigation provider';
const ROUTE_CHROME = 'Fabricate World navigation route chrome';
const NAV_TAB_BADGE = 'Fabricate World navigation tab badge';

/**
 * The string-valued fields of a runtime chrome update.
 *
 * The first four are exactly `OPTIONAL_TAB_FIELDS`, deliberately: a runtime update states the
 * same chrome a tab may declare at registration, so a companion learns one vocabulary rather
 * than two. `icon` and `image` are the two that have no registration counterpart, because the
 * Downtime route deliberately carries no header artwork by default (issue 1185) — artwork is
 * how a companion's DRILL-DOWN says it is a drill-down, exactly as Fabricate's own recipe and
 * component editors do, and a tab that declared it at registration could never turn it off.
 */
const ROUTE_CHROME_TEXT_FIELDS = Object.freeze([
  ...OPTIONAL_TAB_FIELDS,
  // Font Awesome class string, rendered as the header medallion's glyph.
  'icon',
  // Image path, rendered as the header medallion's picture. Mutually exclusive with `icon`.
  'image',
]);
const ROUTE_CHROME_FIELDS = Object.freeze([...ROUTE_CHROME_TEXT_FIELDS, 'status', 'actions']);
const ROUTE_CHROME_STATUS_FIELDS = Object.freeze(['label', 'tone', 'tooltip']);
/**
 * The chip tones Core offers the status indicator.
 *
 * This is a SUBSET of the tones the `Chip` primitive paints, and the subset is the point: a
 * tone Core does not name here is refused with a message rather than dropped silently by the
 * primitive, which is the difference between a companion learning it made a typo and a
 * companion watching its chip render in the wrong colour. `tests/manager-extensions.test.js`
 * pins every entry against `Chip.svelte`'s own tone set so the two cannot drift.
 */
export const ROUTE_CHROME_STATUS_TONES = Object.freeze([
  'warning',
  'info',
  'positive',
  'active',
  'neutral',
  'danger',
  'negative',
  'disabled',
]);
/**
 * The tone an omitted `status.tone` resolves to.
 *
 * `warning` because the named use case IS Fabricate's own staged-changes chip: every Core
 * editor renders `<Chip tone="warning" truncate>` with its localized "Unsaved" text, so
 * `status: { label: t('Unsaved') }` has to be the one-field call that reproduces it exactly.
 */
const DEFAULT_STATUS_TONE = 'warning';

/**
 * A header action a provider may contribute to the Manager's route header.
 *
 * Exactly one of `href` and `onSelect` is required: `href` renders a secure external
 * anchor, `onSelect` renders a button Core invokes with the surface's mount context plus
 * the action id.
 *
 * @typedef {object} WorldNavProviderAction
 * @property {string} id Non-empty id, unique within its action list.
 * @property {string} label Localized visible label.
 * @property {string} [icon] Font Awesome icon class string.
 * @property {string} [tooltip] Localized native tooltip.
 * @property {'primary'|'ghost'|'danger'|'neutral'} [tone] Manager button treatment. Mutually
 *   exclusive with `primary`, which is the shipped spelling of `tone: 'primary'`.
 * @property {boolean} [primary] Renders the action with the Manager's primary treatment.
 * @property {boolean} [disabled] Renders a non-`href` action disabled.
 * @property {string} [href] Absolute `http(s)` URL, opened in a new tab.
 * @property {(context: WorldNavActionContext) => void} [onSelect] Click handler.
 */

/**
 * The status indicator Core renders at the head of the route's header action group.
 *
 * It is its OWN channel rather than another action, because it is not a control: Fabricate's
 * editors render staged-changes state as a `Chip`, and an action descriptor carrying a
 * disabled button would be a different component wearing the same words.
 *
 * @typedef {object} WorldNavRouteChromeStatus
 * @property {string} label Localized visible chip text. Core renders it verbatim.
 * @property {'warning'|'info'|'positive'|'active'|'neutral'|'danger'|'negative'|'disabled'} [tone]
 *   Chip colour family; defaults to `warning`, which is Core's own staged-changes tone.
 * @property {string} [tooltip] Localized native tooltip on the chip.
 */

/**
 * A runtime route-chrome update, supplied through `context.setRouteChrome()`.
 *
 * REPLACE, NEVER MERGE. Each call states the whole chrome, so a field is unset by omitting
 * it and the entire runtime layer is unset with `null` (or `{}`). A merging channel would
 * have no expressible way to remove one field, and "the chrome is exactly what I last passed"
 * is the only reading a companion never has to hold history to predict.
 *
 * Every field is optional and every omitted field falls back to what the ACTIVE TAB declared
 * at registration, then to Core's own string — so a companion that never calls this behaves
 * exactly as it did before the channel existed.
 *
 * @typedef {object} WorldNavRouteChrome
 * @property {string} [title] Localized route title (the page `H1`).
 * @property {string} [subtitle] Localized route subtitle.
 * @property {string} [breadcrumb] Localized leaf breadcrumb crumb.
 * @property {string} [actionsLabel] Localized accessible name of the header action group.
 * @property {string} [icon] Font Awesome class string for the header medallion's glyph.
 * @property {string} [image] Image path for the header medallion. Excludes `icon`.
 * @property {WorldNavRouteChromeStatus} [status] Status chip shown before the actions.
 * @property {WorldNavProviderAction[]} [actions] Header actions, in render order. An EMPTY
 *   array means "no actions" and does not fall back to the tab's own list.
 */

/**
 * A labelled tab in a World navigation provider.
 *
 * The provider declares its OWN tabs: any ids, any count from one upwards, rendered in
 * array order. Core validates shape only and never membership, so adding, removing,
 * reordering or renaming a tab is a companion decision.
 *
 * WHERE EACH FIELD LANDS FOR A PROVIDER (issue 1213). A provider's tabs render once, as the
 * Manager rail's Downtime sub-items; Core's preview tab strip is core-fallback only. So
 * `label` is the sub-item's visible text and also names the panel region below it;
 * `accessibleName` is the sub-item's `aria-label`, which REPLACES that visible text as the
 * button's accessible name and must therefore contain it; and `tooltip` is the sub-item's
 * native `title`, which is pointer-visible rather than keyboard-visible. Both fields stay
 * required: Core's preview strip consumes them too, as an accessible name and a
 * keyboard-visible `role="tooltip"`.
 *
 * A CLOSED KEY SET (issue 1302). A key Core does not name is refused with a deterministic
 * message rather than accepted and dropped, so a companion reaching for a field this seam
 * does not have learns it at the line that reached for it. `apiVersion` is the field that
 * exists to negotiate a wider contract; silence is not.
 *
 * @typedef {object} WorldNavProviderTab
 * @property {string} id Non-empty tab id, unique within the provider's tab set.
 * @property {string} label Localized visible tab label; also the panel region's name.
 * @property {string} accessibleName Localized accessible name of the rail sub-item (and of
 *   Core's preview tab button). Replaces the visible label, so it must contain it.
 * @property {string} tooltip Localized tab tooltip — the rail sub-item's native tooltip for
 *   a provider, and keyboard-visible only on Core's own preview strip.
 * @property {string} icon Font Awesome icon class string.
 * @property {string} [title] Localized route title (the page `H1`) for this tab.
 * @property {string} [subtitle] Localized route subtitle for this tab.
 * @property {string} [breadcrumb] Localized leaf breadcrumb crumb for this tab.
 * @property {string} [actionsLabel] Localized accessible name of the header action group.
 * @property {WorldNavProviderAction[]} [actions] Header actions for this tab; falls back
 *   to the provider's own `actions` when omitted.
 * @property {WorldNavProviderTabBadge} [badge] Count Core renders on this tab's rail
 *   sub-item. A runtime badge set through `setWorldNavTabBadge` overrides it; `null` there
 *   restores this one.
 */

/**
 * A count a tab carries on the Manager rail.
 *
 * A COUNT, not arbitrary text. The rail's trailing track shrinks the label track without
 * bound, and the label is the companion's own and is not Core's to shorten — so the seam
 * carries the one shape whose width Core can predict.
 *
 * `count: 0` is a POSITIVE ZERO and renders the numeral `0`: the rail's record counts
 * already render zero, so "0" means *no records* and an absent numeral means *no count was
 * stated*. It is the direct analogue of an empty `actions` array, which likewise states
 * emptiness rather than falling back.
 *
 * `accessibleName` is final display text, rendered verbatim exactly as `label` is, and is
 * never treated as a lang key. It names the badge alone; Core announces it as a DESCRIPTION
 * of the sub-item rather than as part of the sub-item's name, because Core owns no word
 * order in the companion's language.
 *
 * @typedef {object} WorldNavProviderTabBadge
 * @property {number} count Non-negative safe integer. Core imposes no upper bound; the
 *   supported width is four digits, beyond which the LABEL yields and the numeral does not.
 * @property {string} accessibleName Localized accessible name of the badge itself, rendered
 *   verbatim.
 */

/**
 * What Core tells a navigation guard about the navigation it is being asked to allow.
 *
 * ONE FIELD, deliberately. `reason` is the only thing a companion cannot already work out
 * for itself: its own `tabId` is on the context it closed over, and the DESTINATION is
 * Core's business — Core normalizes a route after the guard has answered, so a companion
 * that decided from a destination would be deciding from a value Core may still change.
 *
 * `reason` matters because the three answers are genuinely different. A companion may keep
 * an unsaved draft for the session across a `'tab'` or `'route'` change and lose nothing;
 * on `'close'` the session ends, so that fallback is no longer available and the same
 * companion may want to prompt where it otherwise would not.
 *
 * @typedef {object} WorldNavGuardEvent
 * @property {'tab'|'route'|'close'} reason Why the mount is about to end: the GM moving to
 *   another of this provider's tabs, leaving the Downtime route entirely, or closing the
 *   Manager window.
 */

/**
 * The immutable context Core supplies to a mounted provider.
 *
 * It is frozen, carries no Core store, document or component, and is replaced (never
 * mutated) whenever one of its values changes — which is also what makes it the value a
 * host keys a remount on.
 *
 * @typedef {object} WorldNavMountContext
 * @property {1} schemaVersion Context contract version.
 * @property {'manager'} surface The Fabricate application hosting the provider.
 * @property {string} surfaceId The registry surface id this provider was registered under.
 * @property {string} route The Manager route rendering the provider.
 * @property {string} tabId The active tab id (identical to `mount`'s own `tabId`).
 * @property {string|null} craftingSystemId The Manager's selected crafting system id, or
 *   `null` — the route is reachable with no system selected.
 * @property {boolean} isGM Whether the current Foundry user is a Game Master.
 * @property {number} revision Increments on every `requestRemount()` call.
 * @property {() => void} requestRemount Ask Core to re-render this surface: Core runs the
 *   current mount's cleanup, clears the target, and calls `mount` again with a fresh
 *   context. Safe to call from a companion's own data listeners.
 * @property {(chrome: WorldNavRouteChrome|null) => boolean} setRouteChrome Restate this
 *   mount's route chrome — title, subtitle, artwork, status chip and header actions — at any
 *   time, WITHOUT a remount. Throws a `TypeError` on a malformed update and changes nothing.
 *   Returns `false`, harmlessly, when called from a context whose mount is no longer live.
 * @property {(handler: () => void) => (() => void)} onRouteReselect Register this mount's
 *   handler for the GM activating the rail sub-item of the tab already on screen. Returns an
 *   idempotent unsubscribe; Core drops the handler when the mount ends.
 * @property {(handler: (event: WorldNavGuardEvent) => (boolean|Promise<boolean>)) => (() => void)}
 *   onBeforeNavigate Register this mount's veto over the navigations that would END it — a
 *   move to another of this provider's tabs, an exit from the Downtime route, and the GM
 *   closing the Manager window. Returns `false`, or a promise resolving to `false`, to keep
 *   the GM where they are; ANY other return, including none at all, allows. Returns an
 *   idempotent unsubscribe; Core drops the handler when the mount ends.
 *
 *   WHAT IT REFUSES, and why each refusal is deliberate. It refuses to treat a THROW as a
 *   veto, because a companion defect must never be able to leave a GM in a Manager they
 *   cannot close; a throwing guard is reported and the navigation proceeds. It refuses to
 *   run at all on a FORCED close — Foundry's own lifecycle teardown and the smoke harness
 *   close with `force`, where no dialog can be serviced and a veto would hang the window. It
 *   refuses to ask a SECOND time while an answer is still pending, sharing the pending answer
 *   instead, so a companion's dialog is never stacked on itself. And it refuses to cover what
 *   it cannot: a browser reload, a Foundry logout, and a remount — whether the companion
 *   asked for one through `requestRemount()` or a context value such as the selected crafting
 *   system changed — all end the mount without consulting the guard.
 * @property {(tabId: string) => (boolean|Promise<boolean>)} navigateToTab Take the GM to
 *   another of THIS PROVIDER'S OWN tabs, so a companion can draw a control that reaches the
 *   screen it names. It is the rail sub-item's own click, reached programmatically: asking for
 *   the tab already on screen RE-ACTIVATES it through `onRouteReselect` rather than remounting;
 *   any other tab is offered to this mount's `onBeforeNavigate` guard with reason `'tab'`, so a
 *   companion holding unsaved work can still stop its own navigation; and an allowed move
 *   expands the rail group and activates the view exactly as a click does. Answers `true` when
 *   the request was honoured — which INCLUDES the re-activation, where nothing moves because
 *   nothing had to — `false` when it was refused, and a PROMISE of either whenever the guard
 *   answers asynchronously, because a veto may be a dialog and a synchronous `true` would be a
 *   claim about a question still on screen.
 *
 *   WHAT IT REFUSES, and why each refusal is deliberate. It refuses every destination that is
 *   not one of the tabs THIS provider registered — another provider's surface, a Core route,
 *   and an id this provider never declared. That is the mirror of the rule `onBeforeNavigate`
 *   already states, that the destination is Core's business: a companion may ask for the
 *   screens it owns, and Core's routing is not a public control surface. It refuses a call from
 *   a RETIRED mount, returning `false` harmlessly — the rule `setRouteChrome` states, and for
 *   the same reason: a companion holding a stale context must not be able to move a GM who has
 *   already gone elsewhere.
 *
 *   AN UNKNOWN-BUT-WELL-FORMED TAB ID ANSWERS `false` RATHER THAN THROWING, deliberately, and
 *   it is the one refusal here that had a real alternative. Membership is a RUNTIME fact that
 *   moves under the companion's feet: a provider may re-register with a different tab set at
 *   any time (Core re-points the route itself when it does), and a companion whose tab set is
 *   conditional — a Settings tab only while some feature is on — is asking a legitimate
 *   question rather than making a coding error. Throwing would make Core's own re-registration
 *   race raise from a companion's correct code. Malformed input is the opposite case: a
 *   non-string or an empty id can never be a runtime question, so it throws a `TypeError` and
 *   moves nobody, exactly as `setRouteChrome` does with a malformed update.
 */

/**
 * The context Core passes to a header action's `onSelect`.
 *
 * @typedef {WorldNavMountContext & {actionId: string}} WorldNavActionContext
 */

/**
 * The mount arguments supplied to a World navigation provider.
 *
 * @typedef {object} WorldNavMountOptions
 * @property {HTMLElement} target Empty connected element that receives companion content.
 * @property {string} tabId Active tab id, always one of the provider's own tab ids.
 * @property {WorldNavMountContext} context Frozen Manager context supplied by Fabricate.
 */

/**
 * A companion-owned replacement for a Core Manager navigation surface.
 *
 * @typedef {object} WorldNavProvider
 * @property {1} apiVersion API version supported by this provider.
 * @property {string} id Surface id this provider claims (Core's Downtime route is
 *   `'downtime'`; see {@link WORLD_DOWNTIME_SURFACE_ID}).
 * @property {WorldNavProviderTab[]} tabs One or more tabs, in render order.
 * @property {WorldNavProviderAction[]} [actions] Default header actions for any tab that
 *   declares none of its own.
 * @property {(options: WorldNavMountOptions) => (void|Function)} mount Synchronous mount
 *   callback returning one cleanup function, or nothing.
 */

/**
 * Publish a public Fabricate hook. Read through `globalThis` at call time so the module
 * imports no Foundry global and no-ops in Node tests.
 *
 * @param {string} name Hook name from `MANAGER_HOOKS`.
 * @param {object} payload Frozen, JSON-shaped payload.
 */
export function emitManagerHook(name, payload) {
  globalThis.Hooks?.callAll?.(name, payload);
}

function validateActionTarget(action, label) {
  const hasHref = action.href !== undefined;
  const hasSelect = action.onSelect !== undefined;
  if (hasHref === hasSelect) {
    throw new TypeError(`${label} action "${action.id}" must declare exactly one of href, onSelect`);
  }
  if (hasSelect && typeof action.onSelect !== 'function') {
    throw new TypeError(`${label} action "${action.id}" onSelect must be a function`);
  }
  if (hasHref && (typeof action.href !== 'string' || !EXTERNAL_ACTION_HREF.test(action.href))) {
    throw new TypeError(`${label} action "${action.id}" href must be an absolute http(s) URL`);
  }
}

/**
 * Validate an action's visual treatment: its two booleans and its tone.
 *
 * Split out of `validateAction` rather than added to it because that function is already at
 * the edge of the cognitive-complexity budget the SonarCloud gate applies to a CHANGED
 * function, and one more branch there would re-flag the whole of it.
 *
 * `primary` and `tone` are refused TOGETHER rather than silently resolved. `primary: true` is
 * exactly `tone: 'primary'`, so a descriptor carrying both is either redundant or
 * contradictory, and a seam that quietly picked a winner would make the contradictory case
 * render one thing while its author read the other.
 *
 * @param {object} action Candidate action.
 * @param {string} label Error-message prefix naming the owner of the action list.
 */
function validateActionTreatment(action, label) {
  for (const field of BOOLEAN_ACTION_FIELDS) {
    if (action[field] !== undefined && typeof action[field] !== 'boolean') {
      throw new TypeError(`${label} action "${action.id}" ${field} must be a boolean`);
    }
  }
  if (action.tone === undefined) return;
  if (!ACTION_TONES.includes(action.tone)) {
    throw new TypeError(
      `${label} action "${action.id}" tone must be one of ${ACTION_TONES.join(', ')}`
    );
  }
  if (action.primary !== undefined) {
    throw new TypeError(`${label} action "${action.id}" must not declare both primary and tone`);
  }
}

function validateAction(action, index, seenIds, label) {
  if (!action || typeof action !== 'object') {
    throw new TypeError(`${label} action ${index} must be an object`);
  }
  requireNonEmptyString(action.id, `${label} action ${index} requires a non-empty id`);
  if (seenIds.has(action.id)) {
    throw new TypeError(`${label} declares a duplicate action id: "${action.id}"`);
  }
  seenIds.add(action.id);
  requireNonEmptyString(action.label, `${label} action "${action.id}" requires a non-empty label`);
  for (const field of OPTIONAL_ACTION_FIELDS) {
    if (action[field] === undefined) continue;
    requireNonEmptyString(
      action[field],
      `${label} action "${action.id}" requires a non-empty ${field}`
    );
  }
  validateActionTreatment(action, label);
  validateActionTarget(action, label);
}

function validateActions(actions, label) {
  if (actions === undefined) return;
  if (!Array.isArray(actions)) throw new TypeError(`${label} actions must be an array`);
  const seenIds = new Set();
  actions.forEach((action, index) => validateAction(action, index, seenIds, label));
}

/**
 * The class list Core renders one header action's control with.
 *
 * A companion's action must be INDISTINGUISHABLE from a Core one, so this returns the very
 * classes `CraftingSystemManagerRoot` writes for its own Back, Delete and Save controls
 * rather than a parallel companion-only treatment.
 *
 * `primary: true` is the shipped spelling of `tone: 'primary'` and keeps working; the
 * validator refuses a descriptor that states both, so this never has to pick a winner.
 *
 * @param {WorldNavProviderAction} action Validated action descriptor.
 * @returns {string} Space-separated class list, always beginning `manager-button`.
 */
export function managerHeaderActionClass(action) {
  const tone = action?.tone ?? (action?.primary === true ? 'primary' : 'neutral');
  const modifier = ACTION_TONE_CLASSES[tone] ?? '';
  return modifier ? `manager-button ${modifier}` : 'manager-button';
}

/**
 * Refuse any key a contract does not name.
 *
 * APPLIED TO BOTH SIDES OF THIS SEAM since issue 1302: a provider tab, its badge and every
 * runtime chrome update alike. It used to be the chrome channel's alone, and this docstring
 * used to record the tab contract's leniency as the deliberate contrast; that reading was a
 * compatibility concession rather than a design preference, and it is now withdrawn. A key
 * Core does not name is refused with a deterministic message wherever it arrives, because a
 * mistyped `subtile` — or a `badge` written against a Core too old to render one — is a
 * companion defect that produces no error, no warning and no visible effect, which is the
 * hardest failure there is to find.
 *
 * WHAT SURVIVES OF THE DISTINCTION is WHEN each is validated, not whether. A tab is checked
 * once, at registration, where a companion author is watching the line that registered it. A
 * chrome update is checked on a drill-down click, arbitrarily far from that author's
 * attention, which is why its refusal has to travel back up their own call stack.
 *
 * @param {object} value Candidate object.
 * @param {readonly string[]} allowed Accepted keys.
 * @param {string} label Error-message prefix.
 */
function refuseUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    throw new TypeError(`${label} does not accept "${key}"`);
  }
}

function normalizeStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new TypeError(`${ROUTE_CHROME} status must be an object`);
  }
  refuseUnknownKeys(status, ROUTE_CHROME_STATUS_FIELDS, `${ROUTE_CHROME} status`);
  requireNonEmptyString(status.label, `${ROUTE_CHROME} status requires a non-empty label`);
  if (status.tooltip !== undefined) {
    requireNonEmptyString(status.tooltip, `${ROUTE_CHROME} status requires a non-empty tooltip`);
  }
  if (status.tone !== undefined && !ROUTE_CHROME_STATUS_TONES.includes(status.tone)) {
    throw new TypeError(
      `${ROUTE_CHROME} status tone must be one of ${ROUTE_CHROME_STATUS_TONES.join(', ')}`
    );
  }
  return Object.freeze({
    label: status.label,
    tone: status.tone ?? DEFAULT_STATUS_TONE,
    tooltip: status.tooltip,
  });
}

/**
 * Validate one runtime chrome update and return the frozen value Core renders.
 *
 * Exported because the runtime channel is a plain leaf that owns no contract of its own: the
 * shape a companion may state is this module's business, exactly as the provider shape is,
 * and `tests/manager-extensions.test.js` therefore pins both in one place.
 *
 * Validation happens BEFORE anything is stored, so a refused update leaves the header showing
 * whatever it showed already rather than a half-applied one.
 *
 * @param {WorldNavRouteChrome|null|undefined} chrome Candidate update.
 * @returns {Readonly<WorldNavRouteChrome>|null} Frozen chrome, or `null` for "use the tab's".
 * @throws {TypeError} When the update is malformed.
 */
export function normalizeRouteChrome(chrome) {
  if (chrome === null || chrome === undefined) return null;
  if (typeof chrome !== 'object' || Array.isArray(chrome)) {
    throw new TypeError(`${ROUTE_CHROME} must be an object, or null to restore the tab's chrome`);
  }
  refuseUnknownKeys(chrome, ROUTE_CHROME_FIELDS, ROUTE_CHROME);
  const normalized = {};
  for (const field of ROUTE_CHROME_TEXT_FIELDS) {
    if (chrome[field] === undefined) continue;
    requireNonEmptyString(chrome[field], `${ROUTE_CHROME} requires a non-empty ${field}`);
    normalized[field] = chrome[field];
  }
  // A header carries ONE piece of artwork. `Medallion` renders its glyph only when `src` is
  // falsy, so a descriptor declaring both would silently discard the icon rather than fail.
  if (normalized.icon !== undefined && normalized.image !== undefined) {
    throw new TypeError(`${ROUTE_CHROME} declares both icon and image, which are exclusive`);
  }
  if (chrome.status !== undefined) normalized.status = normalizeStatus(chrome.status);
  if (chrome.actions !== undefined) {
    validateActions(chrome.actions, ROUTE_CHROME);
    // Copied and frozen: the array Core renders from must not be one a companion can still
    // splice, and the descriptors stay the companion's own objects because they carry its
    // `onSelect` closures.
    normalized.actions = Object.freeze([...chrome.actions]);
  }
  // `{}` and `null` mean the same thing — there is no chrome to state — so they resolve to
  // one value rather than to a truthy empty layer the fallback chain would have to special-case.
  return Object.keys(normalized).length === 0 ? null : Object.freeze(normalized);
}

/**
 * Validate one tab badge and return the frozen value Core renders.
 *
 * Exported beside `normalizeRouteChrome`, and for the same reason it is: the runtime channel
 * that carries a badge owns no contract of its own, so the shape a companion may state stays
 * this module's business and `tests/manager-extensions.test.js` pins both in one place.
 *
 * Validation happens BEFORE anything is stored, so a refused badge leaves the rail showing
 * whatever it showed already rather than a half-applied one.
 *
 * @param {WorldNavProviderTabBadge|null|undefined} badge Candidate badge.
 * @param {string} [label] Error-message prefix naming the owner of the badge.
 * @returns {Readonly<WorldNavProviderTabBadge>|null} Frozen badge, or `null` for "no badge".
 * @throws {TypeError} When the badge is malformed.
 */
export function normalizeNavTabBadge(badge, label = NAV_TAB_BADGE) {
  // `null` and `undefined` mean the same thing — there is no badge to state — exactly as
  // they do for a chrome update. On the runtime channel that is how a companion CLEARS one.
  if (badge === null || badge === undefined) return null;
  if (typeof badge !== 'object' || Array.isArray(badge)) {
    throw new TypeError(`${label} must be an object, or null to clear it`);
  }
  refuseUnknownKeys(badge, TAB_BADGE_FIELDS, label);
  // One guard for every wrong count there is: absent, negative, fractional, a string, `NaN`,
  // `Infinity` and beyond `Number.MAX_SAFE_INTEGER`, where a numeral stops being the number
  // it was written as. The message names the field, because that is what the author must fix.
  if (!Number.isSafeInteger(badge.count) || badge.count < 0) {
    throw new TypeError(`${label} requires a non-negative integer count`);
  }
  requireNonEmptyString(badge.accessibleName, `${label} requires a non-empty accessibleName`);
  return Object.freeze({ count: badge.count, accessibleName: badge.accessibleName });
}

function validateTab(tab, index, seenIds) {
  if (!tab || typeof tab !== 'object') {
    throw new TypeError(`${PROVIDER} tab ${index} must be an object`);
  }
  requireNonEmptyString(tab.id, `${PROVIDER} tab ${index} requires a non-empty id`);
  if (seenIds.has(tab.id)) {
    throw new TypeError(`${PROVIDER} declares a duplicate tab id: "${tab.id}"`);
  }
  seenIds.add(tab.id);
  refuseUnknownKeys(tab, TAB_FIELDS, `${PROVIDER} tab "${tab.id}"`);
  for (const field of REQUIRED_TAB_FIELDS) {
    requireNonEmptyString(tab[field], `${PROVIDER} tab "${tab.id}" requires a non-empty ${field}`);
  }
  for (const field of OPTIONAL_TAB_FIELDS) {
    if (tab[field] === undefined) continue;
    requireNonEmptyString(tab[field], `${PROVIDER} tab "${tab.id}" requires a non-empty ${field}`);
  }
  validateActions(tab.actions, `${PROVIDER} tab "${tab.id}"`);
  if (tab.badge !== undefined) {
    normalizeNavTabBadge(tab.badge, `${PROVIDER} tab "${tab.id}" badge`);
    // Frozen IN PLACE rather than replaced by the normalized copy above, because the registry
    // stores the companion's own provider object by reference and Core renders straight from
    // it. An unfrozen badge could be rewritten after registration, and the rail would then
    // show a value nothing validated, changing at a moment nothing published.
    Object.freeze(tab.badge);
  }
}

function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError(`${PROVIDER} must be an object`);
  }
  if (provider.apiVersion !== 1) {
    throw new TypeError(
      `Unsupported World navigation provider API version: ${String(provider.apiVersion)}`
    );
  }
  requireNonEmptyString(provider.id, `${PROVIDER} requires a non-empty surface id`);
  if (!Array.isArray(provider.tabs) || provider.tabs.length === 0) {
    throw new TypeError(`${PROVIDER} "${provider.id}" must declare at least one tab`);
  }
  const seenIds = new Set();
  provider.tabs.forEach((tab, index) => validateTab(tab, index, seenIds));
  validateActions(provider.actions, PROVIDER);
  if (typeof provider.mount !== 'function') {
    throw new TypeError(`${PROVIDER} mount must be a function`);
  }
  if (provider.mount.constructor?.name === 'AsyncFunction') {
    throw new TypeError(`${PROVIDER} mount must be synchronous`);
  }
}

/**
 * Create a Manager extension registry.
 *
 * Everything structural — the surface keying, the listener sets, the fault-contained
 * notify guard, the tokened idempotent unregister, the frozen surface-id broadcast and the
 * public API bind — comes from the shared factory in `extensionRegistry.js`, which the
 * player registry is built from too (issue 1198). What stays here is what is genuinely
 * Manager-specific: the provider shape, its route chrome and header actions, and the names
 * this registry's callers already depend on.
 *
 * It also owns the page session's TAB BADGES (issue 1302). They hang here rather than on the
 * frozen mount context because a badge's job is to be true while the companion is not mounted,
 * and they are dropped when their surface leaves the registry — which the store learns through
 * the shared factory's existing surface-id broadcast, so the factory itself learns nothing
 * about badges and the player registry is untouched by the whole feature.
 *
 * @param {object} [options] Injectable edges.
 * @param {(...args: unknown[]) => void} [options.reportError] Error sink for a throwing subscriber.
 * @param {(name: string, payload: object) => void} [options.emitHook] Hook edge.
 * @returns {Readonly<object>} Frozen registry, adding `subscribeNavTabBadges(surfaceId, listener)`
 *   to the shared surface, and `setWorldNavTabBadge(surfaceId, tabId, badge)` to `publicApi`.
 */
export function createManagerExtensionsRegistry({
  reportError = console.error,
  emitHook = emitManagerHook,
} = {}) {
  // The two collaborators need each other by NATURE, not by accident: the store's liveness
  // check asks which provider holds a surface, and the registry's public API carries the
  // store's setter. The knot is untied with a deferred READ rather than a second import edge —
  // `findProvider` runs at call time, long after both exist — so the module graph stays
  // one-directional and the store imports nothing back from here.
  let registry = null;
  const badges = createNavTabBadgeStore({
    normalizeBadge: normalizeNavTabBadge,
    findProvider: (surfaceId) => registry?.getWorldNavProvider(surfaceId) ?? null,
    reportError,
  });
  registry = createExtensionRegistry({
    validateProvider,
    registeredHook: MANAGER_HOOKS.NAV_PROVIDER_REGISTERED,
    unregisteredHook: MANAGER_HOOKS.NAV_PROVIDER_UNREGISTERED,
    apiPropertyName: 'managerExtensions',
    registerMethodName: 'registerWorldNavProvider',
    getProviderMethodName: 'getWorldNavProvider',
    listSurfaceIdsMethodName: 'listWorldNavSurfaceIds',
    conflictNoun: 'World navigation provider',
    errorNoun: 'manager extension',
    subscriberFailureMessage: 'Fabricate | Manager extension subscriber failed:',
    reportError,
    emitHook,
    additionalPublicMethods: { setWorldNavTabBadge: badges.setBadge },
  });
  // A runtime badge does not survive its provider. The unsubscribe is deliberately dropped:
  // this pair lives for the page session, and holding a handle nobody can call would only
  // suggest a teardown path that does not exist.
  registry.subscribeSurfaceIds(badges.retainSurfaces);
  return Object.freeze({ ...registry, subscribeNavTabBadges: badges.subscribe });
}

/**
 * Page-session manager-extension registry.
 *
 * `bindFabricateGlobal()` replays its public object at init and ready, so a companion
 * provider registered during init survives the ready lifecycle bind.
 */
export const managerExtensions = createManagerExtensionsRegistry();
