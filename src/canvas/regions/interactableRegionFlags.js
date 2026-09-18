/**
 * Pure builders, readers and ownership guards for the `fabricate.interactable` behaviour and its
 * reverse linked-visual flags. `data-models/spec.md` § fabricate.interactable Region Behaviour and
 * § Linked Visual reverse flags own the schema and every guard rule cited below.
 * Nothing reads `globalThis`: `fields` is injected and the Foundry edge is the behaviour class.
 */

import { normalizeNodeConfig } from '../../systems/gatheringNodeConfig.js';
import { trimStringOrNull as stringOrNull } from '../../utils/scalars.js';

import { numberOrNull } from './coercion.js';

export const INTERACTABLE_BEHAVIOR_SUBTYPE = 'fabricate.interactable';

// The unconfigured sentinels (issue 342). `sourceUuid` is deliberately NON-RESOLVABLE — three
// segments, so `parseInteractableSourceUuid` returns null for it.
export const UNCONFIGURED_SOURCE_UUID = 'Fabricate.unconfigured.tool';
export const UNCONFIGURED_SYSTEM_ID = 'unconfigured';

export const INTERACTABLE_TYPES = Object.freeze(['tool', 'gatheringTask']);
export const LINKED_VISUAL_DOCUMENT_NAMES = Object.freeze(['Tile', 'Drawing', 'Token']);
export const LINKED_VISUAL_MODES = Object.freeze(['marker', 'none']);
export const LINKED_VISUAL_MISSING_POLICIES = Object.freeze(['ignore', 'warn', 'recreate']);
export const ACTIVATION_TRIGGERS = Object.freeze(['regionEnter']);
export const ACTIVATION_AUDIENCES = Object.freeze(['players', 'all']);
export const TASK_NODE_LINKS = Object.freeze(['linked', 'unlinked']);

export function coerceString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** PURE. The behaviour's `DataSchema`, built off an injected `foundry.data.fields` namespace. */
export function buildInteractableBehaviorSchema(fields) {
  if (!fields || typeof fields !== 'object') {
    throw new Error('buildInteractableBehaviorSchema requires a Foundry fields namespace');
  }
  const { StringField, BooleanField, NumberField, SchemaField, ObjectField } = fields;

  return {
    interactableType: new StringField({
      required: true,
      blank: false,
      // Native "+ Add Behavior" instantiates with an empty `system`; the `initial` keeps the
      // DataModel valid. A real Fabricate placement always supplies a value.
      initial: 'tool',
      choices: [...INTERACTABLE_TYPES],
    }),

    taskNodeLink: new StringField({
      required: true,
      blank: false,
      initial: 'linked',
      choices: [...TASK_NODE_LINKS],
    }),
    // `normalizeNodeConfig` is the schema authority for the independent pool's shape, so an
    // ObjectField stores it opaquely.
    node: new ObjectField({ required: false, nullable: true, initial: null }),
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

/** PURE. A new behaviour's `system`: enabled, unconsumed, unlocked, uncapped, marker/warn. */
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

  // Only a gatheringTask may carry an independent node pool.
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

/** A normalized view of a behaviour `system`, or null when it is not a `fabricate.interactable`. */
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

  // A link claiming 'unlinked' whose node does not normalize DOWNGRADES to 'linked', so a
  // malformed pool never strands the interactable on one that does not exist.
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

/** Is this a `fabricate.interactable` behaviour? Tolerates a document or a plain object. */
export function isInteractableRegionBehavior(behavior) {
  return behavior?.type === INTERACTABLE_BEHAVIOR_SUBTYPE;
}

/**
 * The SINGLE authority for "not yet configured": an empty or sentinel `sourceUuid` or `systemId`,
 * or a missing type-appropriate id. Creation, activation, concealment and the config panel all
 * consult it, so they cannot drift (issue 342).
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
    // An unknown or missing type can never be a fully-configured interactable.
    return true;
  }

  return false;
}

/** PURE. The reverse `flags.fabricate` fragment pointing a linked visual back at its owner. */
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

/** `{ regionUuid, behaviorId }` from a visual's reverse flag, or null when it carries none. */
export function readLinkedVisualRef(doc) {
  const block = doc?.flags?.fabricate;
  if (!block || typeof block !== 'object') return null;
  if (block.isInteractableVisual !== true) return null;
  const regionUuid = coerceString(block.linkedRegionUuid);
  const behaviorId = coerceString(block.linkedBehaviorId);
  if (!regionUuid || !behaviorId) return null;
  return { regionUuid, behaviorId };
}

/** Does this document carry a well-formed reverse flag? Never enough alone to authorize a write. */
export function isInteractableVisual(doc) {
  return readLinkedVisualRef(doc) !== null;
}

// The EXACT leaf paths the relink stamp may write, mirroring `buildLinkedVisualFlags`.
const INTERACTABLE_VISUAL_STAMP_PATHS = Object.freeze([
  'flags.fabricate.isInteractableVisual',
  'flags.fabricate.linkedRegionUuid',
  'flags.fabricate.linkedBehaviorId',
]);

/**
 * PURE. Flatten an update to `[dottedPath, leafValue]` pairs — nested and dot-notation keys mix
 * freely — so a smuggled flattened key cannot masquerade as a path it does not write.
 */
function flattenUpdatePaths(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenUpdatePaths(value, path);
      // Keep an empty object as a leaf so a stray `{ hidden: {} }` still counts (fail closed).
      if (nested.length === 0) out.push([path, value]);
      else out.push(...nested);
    } else {
      out.push([path, value]);
    }
  }
  return out;
}

/** Is this EXACTLY the relink stamp? Fail-closed against {@link INTERACTABLE_VISUAL_STAMP_PATHS}. */
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
 * PURE. Does `doc` GENUINELY link to `behavior` — reverse flag present, behaviour is a
 * `fabricate.interactable`, forward `system.linkedVisual.uuid` names THIS document? Requirement 4
 * records why this is defence in depth rather than closure (issue 593).
 */
export function visualLinkRoundTrips(doc, behavior) {
  if (!readLinkedVisualRef(doc)) return false;
  if (!isInteractableRegionBehavior(behavior)) return false;
  const forwardUuid = coerceString(behavior?.system?.linkedVisual?.uuid);
  const docUuid = coerceString(doc?.uuid);
  if (!forwardUuid || !docUuid) return false;
  return forwardUuid === docUuid;
}

/** UPDATE guard: the stamp-only allowlist OR a genuine round trip (requirement 4). */
export function mayApplyInteractableVisualUpdate(doc, update, behavior) {
  if (isInteractableVisualStampOnly(update)) return true;
  return visualLinkRoundTrips(doc, behavior);
}

/** DELETE guard: the round trip ONLY, which closes the mint-then-delete escalation. */
export function mayDeleteInteractableVisual(doc, behavior) {
  return visualLinkRoundTrips(doc, behavior);
}

// The only behaviour-update leaf paths a NON-GM socket sender may write: the interactable's own
// scoped node pool, i.e. the issue-302 player-side decrement.
const NON_GM_BEHAVIOR_UPDATE_ROOT = 'system.node';

/**
 * NON-GM sender guard (requirement 5). Fail-closed over flattened leaf paths: at least one leaf,
 * and every one `system.node` or a `system.node.*` subpath.
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
