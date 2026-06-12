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

import { numberOrNull } from './coercion.js';

export const INTERACTABLE_BEHAVIOR_SUBTYPE = 'fabricate.interactable';

export const INTERACTABLE_TYPES = Object.freeze(['tool', 'gatheringTask']);
export const LINKED_VISUAL_DOCUMENT_NAMES = Object.freeze(['Tile', 'Drawing', 'Token']);
export const LINKED_VISUAL_MODES = Object.freeze(['marker', 'none']);
export const LINKED_VISUAL_MISSING_POLICIES = Object.freeze(['ignore', 'warn', 'recreate']);
export const ACTIVATION_TRIGGERS = Object.freeze(['regionEnter']);
export const ACTIVATION_AUDIENCES = Object.freeze(['players', 'all']);

function coerceString(value) {
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
  const { StringField, BooleanField, NumberField, SchemaField } = fields;

  return {
    interactableType: new StringField({
      required: true,
      blank: false,
      choices: [...INTERACTABLE_TYPES],
    }),
    sourceUuid: new StringField({ required: true, blank: false }),
    systemId: new StringField({ required: true, blank: false }),
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
  } = spawnRequest;

  if (!INTERACTABLE_TYPES.includes(interactableType)) {
    throw new Error(`Unknown interactableType "${interactableType}"`);
  }
  const source = coerceString(sourceUuid);
  if (!source) {
    throw new Error('buildInteractableBehaviorSystem requires a non-empty sourceUuid');
  }

  return {
    interactableType,
    sourceUuid: source,
    systemId: coerceString(systemId),
    toolId: interactableType === 'tool' ? stringOrNull(toolId) : null,
    taskId: interactableType === 'gatheringTask' ? stringOrNull(taskId) : null,
    environmentId: interactableType === 'gatheringTask' ? stringOrNull(environmentId) : null,
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

  return {
    interactableType,
    sourceUuid: coerceString(system.sourceUuid),
    systemId: coerceString(system.systemId),
    toolId: stringOrNull(system.toolId),
    taskId: stringOrNull(system.taskId),
    environmentId: stringOrNull(system.environmentId),
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
