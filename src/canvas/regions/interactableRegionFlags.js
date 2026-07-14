/**
 * Pure builders + readers for the `fabricate.interactable` Region Behaviour.
 *
 * In the region-first model a Fabricate interactable is primarily a Scene Region
 * carrying a custom Region Behaviour ("fabricate.interactable") that owns the
 * authoritative state. A linked Tile (or Drawing / Token) is presentation-only.
 * This module holds the data-only schema field set + the build/read helpers for
 * the behaviour `system`, plus the reverse linked-visual flag block carried by
 * the linked Tile.
 *
 * Everything here is PURE: the schema factory takes the Foundry `fields`
 * namespace as an injected argument so it is unit-testable with a fake, and no
 * function reaches for `globalThis`. The thin Foundry edge (resolving the real
 * `fields` namespace + assigning the data model) lives in
 * `FabricateInteractableRegionBehavior.js`.
 *
 * State model (see plan — `fabricate.interactable` Region Behaviour):
 *   interactableType : 'tool' | 'gatheringTask'
 *   sourceUuid, systemId, toolId|null, taskId|null, environmentId|null, name
 *   presentation : { promptText:string|null, hidden:boolean }
 *   linkedVisual : { uuid:string|null, documentName:'Tile'|'Drawing'|'Token'|null,
 *                    mode:'marker'|'none', missingPolicy:'ignore'|'warn'|'recreate' }
 *   state        : { enabled, consumed, locked,
 *                    uses:{ max:number|null, used:number },
 *                    cooldown:{ seconds:number|null, lastUsedWorldTime:number|null } }
 *   activation   : { trigger:'regionEnter', audience:'players'|'all' }
 */

import { normalizeNodeConfig } from '../../systems/gatheringNodeConfig.js';

import { numberOrNull } from './coercion.js';

export const INTERACTABLE_BEHAVIOR_SUBTYPE = 'fabricate.interactable';

// Unconfigured sentinels (issue 342). When a `fabricate.interactable` behaviour is
// created through Foundry's native Region → Behaviors "+ Add Behavior" path it has
// an empty `system`, so the three required identity fields take these schema
// `initial`s. The sourceUuid is deliberately NON-RESOLVABLE — it is a 3-segment
// string, so `parseInteractableSourceUuid` returns null for it and no resolver can
// mistake it for a real tool/task. A behaviour carrying these sentinels (or any
// otherwise-incomplete identity) is UNCONFIGURED: it is concealed/inert until a GM
// configures its identity from the rich config panel. `isUnconfiguredInteractable`
// is the SINGLE authority for "not yet configured".
export const UNCONFIGURED_SOURCE_UUID = 'Fabricate.unconfigured.tool';
export const UNCONFIGURED_SYSTEM_ID = 'unconfigured';

export const INTERACTABLE_TYPES = Object.freeze(['tool', 'gatheringTask']);
export const LINKED_VISUAL_DOCUMENT_NAMES = Object.freeze(['Tile', 'Drawing', 'Token']);
export const LINKED_VISUAL_MODES = Object.freeze(['marker', 'none']);
export const LINKED_VISUAL_MISSING_POLICIES = Object.freeze(['ignore', 'warn', 'recreate']);
export const ACTIVATION_TRIGGERS = Object.freeze(['regionEnter']);
export const ACTIVATION_AUDIENCES = Object.freeze(['players', 'all']);
// A gathering-task interactable is either LINKED to the gathering task or
// UNLINKED (independent), much like an FVTT token↔actor link:
//   'linked' (default) — shares the gathering task's per-environment node pool;
//     depletion/respawn follow the task (owned by `environment.nodeRuntime[taskId]`)
//     and the behaviour carries no node state.
//   'unlinked'         — the behaviour owns its OWN independent node pool
//     (`system.node`) with its own lifecycle (capacity, current count,
//     depletion timing, respawn policy). Only a `gatheringTask` may carry one.
export const TASK_NODE_LINKS = Object.freeze(['linked', 'unlinked']);

export function coerceString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringOrNull(value) {
  const trimmed = coerceString(value);
  return trimmed || null;
}

/**
 * Build the `DataSchema` map for the `fabricate.interactable` behaviour, given an
 * injected Foundry `fields` namespace (`foundry.data.fields`). PURE: it only calls
 * field constructors off `fields`, so a fake namespace recording the constructor +
 * options makes the shape unit-testable without Foundry.
 *
 * @param {object} fields  The Foundry `foundry.data.fields` namespace.
 * @returns {object} A plain map of field-name → field instance (the DataSchema).
 */
export function buildInteractableBehaviorSchema(fields) {
  if (!fields || typeof fields !== 'object') {
    throw new Error('buildInteractableBehaviorSchema requires a Foundry fields namespace');
  }
  const { StringField, BooleanField, NumberField, SchemaField, ObjectField } = fields;

  return {
    interactableType: new StringField({
      required: true,
      blank: false,
      // Native "+ Add Behavior" instantiates with an empty `system`; an `initial`
      // lets the DataModel instantiate valid (no DataModelValidationError). A real
      // Fabricate placement always supplies a real value, so this only ever takes
      // effect on the native unconfigured path.
      initial: 'tool',
      choices: [...INTERACTABLE_TYPES],
    }),

    // Task-node link discriminator (gatheringTask only). 'linked' (default)
    // shares the gathering task's per-environment node pool (depletion/respawn on
    // `environment.nodeRuntime[taskId]`) and leaves `node` null; 'unlinked' carries
    // its own independent node pool below.
    taskNodeLink: new StringField({
      required: true,
      blank: false,
      initial: 'linked',
      choices: [...TASK_NODE_LINKS],
    }),
    // The independent node pool, stored verbatim as a full normalized node object
    // when `taskNodeLink === 'unlinked'`; null otherwise. `normalizeNodeConfig` is
    // the schema authority for its shape, so an ObjectField stores it opaquely.
    node: new ObjectField({ required: false, nullable: true, initial: null }),
    // The unconfigured sentinels keep these fields `required, blank:false` (they can
    // never be persisted empty) while letting the native empty-system instantiation
    // produce a VALID-but-unconfigured behaviour rather than throwing (issue 342).
    sourceUuid: new StringField({
      required: true,
      blank: false,
      initial: UNCONFIGURED_SOURCE_UUID,
    }),
    systemId: new StringField({ required: true, blank: false, initial: UNCONFIGURED_SYSTEM_ID }),
    toolId: new StringField({ required: false, blank: true, nullable: true, initial: null }),
    taskId: new StringField({ required: false, blank: true, nullable: true, initial: null }),
    environmentId: new StringField({ required: false, blank: true, nullable: true, initial: null }),
    name: new StringField({ required: false, blank: true }),

    presentation: new SchemaField({
      promptText: new StringField({ required: false, blank: true, nullable: true, initial: null }),
      hidden: new BooleanField({ initial: false }),
    }),

    linkedVisual: new SchemaField({
      uuid: new StringField({ required: false, blank: true, nullable: true, initial: null }),
      documentName: new StringField({
        required: false,
        blank: true,
        nullable: true,
        initial: null,
        choices: [...LINKED_VISUAL_DOCUMENT_NAMES],
      }),
      mode: new StringField({
        required: true,
        blank: false,
        initial: 'marker',
        choices: [...LINKED_VISUAL_MODES],
      }),
      missingPolicy: new StringField({
        required: true,
        blank: false,
        initial: 'warn',
        choices: [...LINKED_VISUAL_MISSING_POLICIES],
      }),
    }),

    state: new SchemaField({
      enabled: new BooleanField({ initial: true }),
      consumed: new BooleanField({ initial: false }),
      locked: new BooleanField({ initial: false }),
      uses: new SchemaField({
        max: new NumberField({ required: false, nullable: true, initial: null }),
        used: new NumberField({ required: true, nullable: false, initial: 0 }),
      }),
      cooldown: new SchemaField({
        seconds: new NumberField({ required: false, nullable: true, initial: null }),
        lastUsedWorldTime: new NumberField({ required: false, nullable: true, initial: null }),
      }),
    }),

    activation: new SchemaField({
      trigger: new StringField({
        required: true,
        blank: false,
        initial: 'regionEnter',
        choices: [...ACTIVATION_TRIGGERS],
      }),
      audience: new StringField({
        required: true,
        blank: false,
        initial: 'players',
        choices: [...ACTIVATION_AUDIENCES],
      }),
    }),
  };
}

/**
 * Build the initial `system` data object for a new `fabricate.interactable`
 * behaviour from a classified spawn request. PURE: applies sane defaults
 * (enabled, not consumed/locked, no uses cap, no cooldown, regionEnter/players
 * activation, marker/warn linked visual).
 *
 * @param {object} spawnRequest
 * @param {'tool'|'gatheringTask'} spawnRequest.interactableType
 * @param {string} spawnRequest.sourceUuid
 * @param {string} spawnRequest.systemId
 * @param {string} [spawnRequest.toolId]
 * @param {string} [spawnRequest.taskId]
 * @param {string} [spawnRequest.environmentId]
 * @param {string} [spawnRequest.name]
 * @param {object} [spawnRequest.presentation]
 * @param {object} [spawnRequest.linkedVisual]
 * @returns {object} The behaviour `system` data object.
 */
export function buildInteractableBehaviorSystem(spawnRequest = {}) {
  const {
    interactableType,
    sourceUuid,
    systemId,
    toolId,
    taskId,
    environmentId,
    name,
    presentation,
    linkedVisual,
    taskNodeLink,
    node,
  } = spawnRequest;

  if (!INTERACTABLE_TYPES.includes(interactableType)) {
    throw new Error(`Unknown interactableType "${interactableType}"`);
  }
  const source = coerceString(sourceUuid);
  if (!source) {
    throw new Error('buildInteractableBehaviorSystem requires a non-empty sourceUuid');
  }

  // Only a gatheringTask may carry an independent node pool. A tool always
  // defaults to linked with a null node so it never carries node state.
  const scopedNode =
    interactableType === 'gatheringTask' && taskNodeLink === 'unlinked'
      ? normalizeNodeConfig(node)
      : null;
  const resolvedTaskNodeLink =
    interactableType === 'gatheringTask' && taskNodeLink === 'unlinked' && scopedNode
      ? 'unlinked'
      : 'linked';

  return {
    interactableType,
    sourceUuid: source,
    systemId: coerceString(systemId),
    toolId: interactableType === 'tool' ? stringOrNull(toolId) : null,
    taskId: interactableType === 'gatheringTask' ? stringOrNull(taskId) : null,
    environmentId: interactableType === 'gatheringTask' ? stringOrNull(environmentId) : null,
    taskNodeLink: resolvedTaskNodeLink,
    node: resolvedTaskNodeLink === 'unlinked' ? scopedNode : null,
    name: coerceString(name),
    presentation: {
      promptText: stringOrNull(presentation?.promptText),
      hidden: presentation?.hidden === true,
    },
    linkedVisual: {
      uuid: stringOrNull(linkedVisual?.uuid),
      documentName: LINKED_VISUAL_DOCUMENT_NAMES.includes(linkedVisual?.documentName)
        ? linkedVisual.documentName
        : null,
      mode: LINKED_VISUAL_MODES.includes(linkedVisual?.mode) ? linkedVisual.mode : 'marker',
      missingPolicy: LINKED_VISUAL_MISSING_POLICIES.includes(linkedVisual?.missingPolicy)
        ? linkedVisual.missingPolicy
        : 'warn',
    },
    state: {
      enabled: true,
      consumed: false,
      locked: false,
      uses: { max: null, used: 0 },
      cooldown: { seconds: null, lastUsedWorldTime: null },
    },
    activation: {
      trigger: 'regionEnter',
      audience: 'players',
    },
  };
}

/**
 * Defensively read + shape a behaviour's `system` into a normalized view, or
 * `null` when the behaviour is not a `fabricate.interactable`. Tolerates both a
 * live `RegionBehavior` document and a plain object (no Foundry dependency).
 *
 * @param {object} behavior
 * @returns {object|null}
 */
export function readInteractableBehaviorSystem(behavior) {
  if (!isInteractableRegionBehavior(behavior)) return null;
  const system = behavior?.system && typeof behavior.system === 'object' ? behavior.system : {};

  const interactableType = INTERACTABLE_TYPES.includes(system.interactableType)
    ? system.interactableType
    : null;
  if (!interactableType) return null;

  const presentation =
    system.presentation && typeof system.presentation === 'object' ? system.presentation : {};
  const linkedVisual =
    system.linkedVisual && typeof system.linkedVisual === 'object' ? system.linkedVisual : {};
  const state = system.state && typeof system.state === 'object' ? system.state : {};
  const uses = state.uses && typeof state.uses === 'object' ? state.uses : {};
  const cooldown = state.cooldown && typeof state.cooldown === 'object' ? state.cooldown : {};
  const activation =
    system.activation && typeof system.activation === 'object' ? system.activation : {};

  // Resolve the task-node link + independent node. Only a gatheringTask may carry
  // an independent pool; normalizeNodeConfig is the authority for the node shape.
  // If the link claims 'unlinked' but the node does not normalize to a real pool,
  // DOWNGRADE the view to 'linked' (so a malformed/empty node never strands the
  // interactable on a non-existent pool).
  const scopedNode =
    interactableType === 'gatheringTask' && system.taskNodeLink === 'unlinked'
      ? normalizeNodeConfig(system.node)
      : null;
  const taskNodeLink = scopedNode ? 'unlinked' : 'linked';

  return {
    interactableType,
    sourceUuid: coerceString(system.sourceUuid),
    systemId: coerceString(system.systemId),
    toolId: stringOrNull(system.toolId),
    taskId: stringOrNull(system.taskId),
    environmentId: stringOrNull(system.environmentId),
    taskNodeLink,
    node: scopedNode,
    name: coerceString(system.name),
    presentation: {
      promptText: stringOrNull(presentation.promptText),
      hidden: presentation.hidden === true,
    },
    linkedVisual: {
      uuid: stringOrNull(linkedVisual.uuid),
      documentName: LINKED_VISUAL_DOCUMENT_NAMES.includes(linkedVisual.documentName)
        ? linkedVisual.documentName
        : null,
      mode: LINKED_VISUAL_MODES.includes(linkedVisual.mode) ? linkedVisual.mode : 'marker',
      missingPolicy: LINKED_VISUAL_MISSING_POLICIES.includes(linkedVisual.missingPolicy)
        ? linkedVisual.missingPolicy
        : 'warn',
    },
    state: {
      enabled: state.enabled !== false,
      consumed: state.consumed === true,
      locked: state.locked === true,
      uses: { max: numberOrNull(uses.max), used: numberOrNull(uses.used) ?? 0 },
      cooldown: {
        seconds: numberOrNull(cooldown.seconds),
        lastUsedWorldTime: numberOrNull(cooldown.lastUsedWorldTime),
      },
    },
    activation: {
      trigger: ACTIVATION_TRIGGERS.includes(activation.trigger)
        ? activation.trigger
        : 'regionEnter',
      audience: ACTIVATION_AUDIENCES.includes(activation.audience)
        ? activation.audience
        : 'players',
    },
  };
}

/**
 * Predicate: is this a `fabricate.interactable` Region Behaviour? Tolerates a
 * live behaviour document or a plain object.
 *
 * @param {object} behavior
 * @returns {boolean}
 */
export function isInteractableRegionBehavior(behavior) {
  return behavior?.type === INTERACTABLE_BEHAVIOR_SUBTYPE;
}

/**
 * The SINGLE authority for "is this interactable not yet configured?" (issue 342).
 *
 * A `fabricate.interactable` created through Foundry's native "+ Add Behavior" path
 * is born with the unconfigured sentinels ({@link UNCONFIGURED_SOURCE_UUID} /
 * {@link UNCONFIGURED_SYSTEM_ID}) and no real tool/task id. Creation, activation,
 * marker concealment, and the config panel all consult THIS predicate so they can
 * never drift on what "configured" means.
 *
 * Tolerates a raw behaviour `system` object OR a normalized view. Treated as
 * unconfigured when ANY of:
 *   - `sourceUuid` is empty or the unconfigured sentinel;
 *   - `systemId` is empty or the unconfigured sentinel;
 *   - the type-appropriate id is missing (`toolId` for a tool, `taskId` for a
 *     gatheringTask).
 *
 * @param {object} system  A behaviour `system` (raw or normalized view).
 * @returns {boolean}
 */
export function isUnconfiguredInteractable(system) {
  if (!system || typeof system !== 'object') return true;

  const sourceUuid = coerceString(system.sourceUuid);
  if (!sourceUuid || sourceUuid === UNCONFIGURED_SOURCE_UUID) return true;

  const systemId = coerceString(system.systemId);
  if (!systemId || systemId === UNCONFIGURED_SYSTEM_ID) return true;

  const interactableType = system.interactableType;
  if (interactableType === 'tool') {
    if (!coerceString(system.toolId)) return true;
  } else if (interactableType === 'gatheringTask') {
    if (!coerceString(system.taskId)) return true;
  } else {
    // An unknown/missing type can never be a fully-configured interactable.
    return true;
  }

  return false;
}

/**
 * Build the reverse linked-visual flag block carried by the linked Tile (or
 * Drawing / Token), pointing back at the owning Region + Behaviour: a minimal
 * `flags.fabricate` fragment merged on creation.
 *
 * @param {object} params
 * @param {string} params.regionUuid
 * @param {string} params.behaviorId
 * @returns {{ fabricate: { isInteractableVisual: true, linkedRegionUuid: string, linkedBehaviorId: string } }}
 */
export function buildLinkedVisualFlags({ regionUuid, behaviorId } = {}) {
  const region = coerceString(regionUuid);
  const behavior = coerceString(behaviorId);
  if (!region) throw new Error('buildLinkedVisualFlags requires a non-empty regionUuid');
  if (!behavior) throw new Error('buildLinkedVisualFlags requires a non-empty behaviorId');
  return {
    fabricate: {
      isInteractableVisual: true,
      linkedRegionUuid: region,
      linkedBehaviorId: behavior,
    },
  };
}

/**
 * Read the reverse linked-visual ref from a Tile/Drawing/Token document (or plain
 * object). Returns `{ regionUuid, behaviorId }` or `null` when the document is not
 * a Fabricate interactable visual.
 *
 * @param {object} doc
 * @returns {{ regionUuid: string, behaviorId: string } | null}
 */
export function readLinkedVisualRef(doc) {
  const block = doc?.flags?.fabricate;
  if (!block || typeof block !== 'object') return null;
  if (block.isInteractableVisual !== true) return null;
  const regionUuid = coerceString(block.linkedRegionUuid);
  const behaviorId = coerceString(block.linkedBehaviorId);
  if (!regionUuid || !behaviorId) return null;
  return { regionUuid, behaviorId };
}

/**
 * Ownership predicate (visual side): is this Tile/Drawing/Token a Fabricate
 * interactable visual? True iff it carries a well-formed reverse linked-visual
 * flag block ({@link readLinkedVisualRef}). The mutation-edge counterpart to
 * {@link isInteractableRegionBehavior} for the behaviour side — mutation seams
 * consult it before writing to / deleting a resolved visual so ref drift or a
 * crafted socket payload can never touch a foreign document.
 *
 * @param {object} doc  A Tile/Drawing/Token document (or plain object).
 * @returns {boolean}
 */
export function isInteractableVisual(doc) {
  return readLinkedVisualRef(doc) !== null;
}

// The EXACT set of leaf paths the relink provenance stamp is allowed to write to a
// document that is not yet a Fabricate visual. This mirrors `buildLinkedVisualFlags`
// (`{ fabricate: { isInteractableVisual, linkedRegionUuid, linkedBehaviorId } }`).
// Any other leaf path in the update — `hidden`, `texture.src`, `x`, `y`, a foreign
// flag namespace, etc. — takes the write OUT of the stamp-only allowlist.
const INTERACTABLE_VISUAL_STAMP_PATHS = Object.freeze([
  'flags.fabricate.isInteractableVisual',
  'flags.fabricate.linkedRegionUuid',
  'flags.fabricate.linkedBehaviorId',
]);

/**
 * Flatten a Foundry update patch to `[dottedPath, leafValue]` pairs. Handles BOTH
 * nested objects (`{ flags: { fabricate: { ... } } }`) AND dot-notation keys
 * (`{ 'flags.fabricate.isInteractableVisual': true }`) — and any mix — by joining
 * every key with `.` as it descends, so a smuggled flattened key can never
 * masquerade as a different path than it writes. Arrays and non-plain values are
 * treated as opaque leaves. PURE.
 *
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {Array<[string, *]>}
 */
function flattenUpdatePaths(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenUpdatePaths(value, path);
      // An empty-object value writes nothing meaningful, but keep it as a leaf so a
      // stray `{ hidden: {} }` still counts as a non-allowlisted path (fail closed).
      if (nested.length === 0) out.push([path, value]);
      else out.push(...nested);
    } else {
      out.push([path, value]);
    }
  }
  return out;
}

/**
 * Is this update EXACTLY the relink provenance stamp and nothing else? A strict
 * allowlist (fail-closed): the stamp MUST be present (`isInteractableVisual === true`)
 * and EVERY written leaf path must be one of {@link INTERACTABLE_VISUAL_STAMP_PATHS}.
 * A single foreign key — nested or dot-notation-smuggled — rejects the whole write.
 *
 * @param {object} [update]
 * @returns {boolean}
 */
function isInteractableVisualStampOnly(update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return false;
  const entries = flattenUpdatePaths(update);
  if (entries.length === 0) return false;
  let stamped = false;
  for (const [path, value] of entries) {
    if (!INTERACTABLE_VISUAL_STAMP_PATHS.includes(path)) return false;
    if (path === 'flags.fabricate.isInteractableVisual') {
      if (value !== true) return false;
      stamped = true;
    }
  }
  return stamped;
}

/**
 * Bidirectional-link verification: is the visual `doc` GENUINELY linked to the live
 * `behavior`, by a reverse-flag↔forward-link round-trip? PURE.
 *
 * The reverse flag on a visual (`flags.fabricate.{isInteractableVisual,
 * linkedRegionUuid,linkedBehaviorId}`) is mintable via a stamp-only write, so it
 * MUST NOT by itself authorize a core-data write or delete. This authorizes those
 * edges against the `fabricate.interactable` behaviour the visual claims, requiring
 * ALL of:
 *   (a) the visual carries a well-formed reverse flag ({@link readLinkedVisualRef});
 *   (b) `behavior` exists and is a `fabricate.interactable` behaviour
 *       ({@link isInteractableRegionBehavior}) — the caller resolves it from the
 *       reverse flag's `linkedRegionUuid`/`linkedBehaviorId`;
 *   (c) the behaviour's FORWARD link (`system.linkedVisual.uuid`) points back to
 *       THIS exact document (`doc.uuid`).
 *
 * This is DEFENSE-IN-DEPTH that raises the bar, NOT a complete closure of the
 * escalation. An attacker who mints a reverse flag pointing at a fake behaviour
 * fails (b); one pointing at a real behaviour fails (c) as long as that behaviour's
 * forward link still points at its genuine tile. HOWEVER the forward link is itself
 * writable over the socket: the `INTERACTABLE_BEHAVIOR_UPDATE` edge
 * (`applyInteractableBehaviorUpdate`) applies an arbitrary caller `update` to any
 * `fabricate.interactable` behaviour (guarded only on the target's TYPE, with no
 * field restriction and no sender authentication), so a determined attacker can
 * forge `system.linkedVisual.uuid` to point at a target tile and then satisfy this
 * round-trip. The round-trip therefore raises the cheapest escalation from a single
 * message to a multi-message forge; FULL closure requires authenticating the socket
 * SENDER as a GM — a module-wide socket-transport change tracked by issue 593.
 *
 * @param {object} doc  The resolved visual document (must expose `uuid`).
 * @param {object} behavior  The behaviour resolved from the reverse flag's ref.
 * @returns {boolean}
 */
export function visualLinkRoundTrips(doc, behavior) {
  if (!readLinkedVisualRef(doc)) return false;
  if (!isInteractableRegionBehavior(behavior)) return false;
  const forwardUuid = coerceString(behavior?.system?.linkedVisual?.uuid);
  const docUuid = coerceString(doc?.uuid);
  if (!forwardUuid || !docUuid) return false;
  return forwardUuid === docUuid;
}

/**
 * Ownership guard for a linked-visual UPDATE write. Permitted when EITHER the update
 * is EXACTLY the relink provenance stamp — the `flags.fabricate` reverse block
 * ({@link buildLinkedVisualFlags}) and NOTHING else (the mint itself; writes no core
 * data, so it is harmless even against a not-yet-linked GM-selected document) — OR
 * the visual is GENUINELY bidirectionally linked to `behavior`
 * ({@link visualLinkRoundTrips}). A minted reverse flag no longer authorizes a
 * core-data write on its own; and the strict, fail-closed stamp allowlist stops a
 * crafted payload from smuggling `hidden`/`texture`/geometry — or a
 * dot-notation-flattened foreign key — alongside the stamp.
 *
 * @param {object} doc  The resolved visual document.
 * @param {object} [update]  The pending document update patch.
 * @param {object} [behavior]  The behaviour resolved from the doc's reverse-flag ref.
 * @returns {boolean}
 */
export function mayApplyInteractableVisualUpdate(doc, update, behavior) {
  if (isInteractableVisualStampOnly(update)) return true;
  return visualLinkRoundTrips(doc, behavior);
}

/**
 * Ownership guard for a linked-visual DELETE (terminal). Permitted ONLY when the
 * visual is GENUINELY bidirectionally linked to `behavior`
 * ({@link visualLinkRoundTrips}). A minted reverse flag — pointing at a fake or a
 * mismatched behaviour — never authorizes a delete, closing the mint-then-delete
 * escalation.
 *
 * @param {object} doc  The resolved visual document.
 * @param {object} [behavior]  The behaviour resolved from the doc's reverse-flag ref.
 * @returns {boolean}
 */
export function mayDeleteInteractableVisual(doc, behavior) {
  return visualLinkRoundTrips(doc, behavior);
}

// The ONLY behaviour-update leaf paths a NON-GM socket sender may write: the
// interactable's own scoped node pool (`system.node.*`) — the legitimate issue-302
// player scoped-pool decrement, which runs on the gathering player's client and
// emits an `INTERACTABLE_BEHAVIOR_UPDATE`. A non-GM must NEVER reach
// `system.linkedVisual` (forward-link forge), `system.state`, `presentation`,
// enable/lock/marker config, or anything else on the behaviour.
const NON_GM_BEHAVIOR_UPDATE_ROOT = 'system.node';

/**
 * Ownership guard for a NON-GM socket sender's behaviour update (sender-auth layer,
 * issue 593). A GM sender may write any behaviour field; a non-GM sender's `update`
 * must touch ONLY the interactable's own scoped node pool. A strict, fail-closed
 * allowlist mirroring {@link mayApplyInteractableVisualUpdate}'s stamp-only pattern:
 * flatten the patch to leaf paths (handling BOTH nested objects AND dot-notation
 * keys, and any mix), require at least one leaf, and reject unless EVERY leaf path
 * is `system.node` itself or a `system.node.*` subpath. A single foreign leaf —
 * `system.linkedVisual.uuid`, `system.state.enabled`, `presentation.hidden`, a
 * dot-notation-smuggled key, etc. — rejects the whole write.
 *
 * @param {object} [update]  The pending behaviour-document update patch.
 * @returns {boolean}
 */
export function mayApplyNonGmBehaviorUpdate(update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return false;
  const entries = flattenUpdatePaths(update);
  if (entries.length === 0) return false;
  for (const [path] of entries) {
    if (
      path !== NON_GM_BEHAVIOR_UPDATE_ROOT &&
      !path.startsWith(`${NON_GM_BEHAVIOR_UPDATE_ROOT}.`)
    ) {
      return false;
    }
  }
  return true;
}
