/**
 * The **composite component record key**, and the one place it is formed and parsed
 * (issue 1212).
 *
 * `data-models/spec.md` § Granular Definition Storage fixes the scheme as
 * `<namespace>.component.<systemId>.<id>` and the parse rule as "strip the prefix, split on
 * the FIRST dot". Both halves live here rather than inside
 * {@link import('./PerRecordCraftingDefinitionRepository.js').PerRecordCraftingDefinitionRepository},
 * because the composite is a CALLER convention: that class already round-trips any record id
 * unchanged through `keyFor`/`idFromKey`, so it needs no knowledge of the composite at all and
 * gains none.
 *
 * ## Why splitting on the FIRST dot is sound
 *
 * A component id is a free-form authored string and MAY contain dots; a crafting system id
 * may NOT. `CraftingSystem.id` requirement 28 constrains it to `/^[A-Za-z0-9_-]+$/` and
 * `CraftingSystemManager._assertValidSystemId` refuses anything else at every entry point,
 * because the id is already used as a durable-flag map key and `expandObject` splits on every
 * dot. So the first dot after the prefix is ALWAYS the boundary, and the remainder — dots and
 * all — is the component id.
 *
 * That constraint is also why the forward conversion carries an eligibility gate rather than
 * a per-record skip: a world carrying a dotted system id from before the assertion existed
 * cannot be extracted at all, and `refuseComponentExtractionForUnsafeSystemIds` refuses the
 * whole corpus rather than silently carving that system out.
 *
 * ## The scope is a per-system PREFIX, which is what makes a cascade one leg
 *
 * Because the system id leads, every component of one system shares the prefix
 * `fabricate.component.<systemId>.`. `deleteSystem` therefore expresses "every component of
 * this system" as one scoped delete leg over the index, rather than as a per-record loop.
 */

import {
  COMPONENT_RECORD_KEY_PREFIX,
  PerRecordCraftingDefinitionRepository,
} from './PerRecordCraftingDefinitionRepository.js';

/**
 * The composite record key for one component.
 *
 * @param {string} systemId The owning crafting system's id.
 * @param {string} componentId The component's own id.
 * @returns {string} the record key, WITHOUT the `fabricate.component.` prefix.
 */
export function componentRecordKey(systemId, componentId) {
  return `${systemId}.${componentId}`;
}

/**
 * Split a composite record key back into its two halves, on the FIRST dot.
 *
 * @param {string} recordKey The record key, WITHOUT the `fabricate.component.` prefix.
 * @returns {{systemId: string, componentId: string}|null} `null` when the key carries no
 *   separator at all, which is not a component record however it arrived.
 */
export function parseComponentRecordKey(recordKey) {
  const key = String(recordKey ?? '');
  const boundary = key.indexOf('.');
  if (boundary <= 0 || boundary === key.length - 1) return null;
  return { systemId: key.slice(0, boundary), componentId: key.slice(boundary + 1) };
}

/**
 * The record-key prefix scoping every component of one crafting system.
 *
 * @param {string} systemId
 * @returns {string} the prefix, WITHOUT the `fabricate.component.` prefix and WITH its
 *   trailing separator.
 */
export function componentRecordScope(systemId) {
  return `${systemId}.`;
}

/**
 * The components a normalized crafting system holds, as an array, whatever the record shape.
 *
 * @param {object|null|undefined} system
 * @returns {object[]}
 */
export function componentsOf(system) {
  return Array.isArray(system?.components) ? system.components : [];
}

/**
 * One component, as the per-record store sees it.
 *
 * An ENVELOPE rather than the bare component, because the store keys records by
 * `identify(record)` and a component carries no reference to its owning system. `serialize`
 * unwraps it, so the stored bytes are exactly the component object the container used to
 * nest — which is what keeps a conversion a pure move of bytes.
 *
 * @typedef {{systemId: string, component: object}} ComponentRecordEnvelope
 */

/**
 * @param {string} systemId
 * @param {object} component
 * @returns {ComponentRecordEnvelope}
 */
export function componentEnvelope(systemId, component) {
  return { systemId: String(systemId), component };
}

/**
 * The per-record store for extracted component documents.
 *
 * ONE factory, shared by the composite repository and by the Storage Layout Conversion, for
 * the same reason the recipe half shares `perRecordRecipeStore`: two stores that disagreed
 * about which keys are records, how a record is identified, or what its persisted form is
 * would produce a conversion whose output the runtime backend cannot read.
 *
 * `hydrate` and `serialize` are identity over the ENVELOPE and the component respectively.
 * Neither routes through `_normalizeComponent`, deliberately: a conversion moves bytes
 * between two arrangements of the SAME records, so routing them through the current model's
 * normalizer would make the operation's output depend on what the model has learned to emit
 * — and would drop a field it has not, in the operation whose entire promise is that it
 * loses nothing.
 *
 * @param {object} [options]
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @param {(raw: object) => object} [options.hydrate] Defaults to identity — the conversion's
 *   semantics. A whole-corpus reduction that transforms records in place must override it
 *   with a DETACHING clone: `Setting#value` is initialized once and answered from the memo,
 *   so an identity hydrate hands back the stored document's own object and an in-place
 *   transformation mutates the very basis the differential later compares against.
 * @param {() => void} [options.assertWritable] Defaults to the no-op. A conversion MUST stay
 *   unguarded: it runs while the layout reads `unsettled`, which is precisely the state the
 *   stale-arrangement guard exists to refuse.
 * @param {((context: {leg: string, final: boolean}) => object|null)} [options.operationOptions]
 * @returns {import('./PerRecordCraftingDefinitionRepository.js').PerRecordCraftingDefinitionRepository}
 */
export function createComponentRecordStore({
  documentClass,
  collection,
  hydrate = (raw) => raw,
  assertWritable = () => {},
  operationOptions = null,
} = {}) {
  return new PerRecordCraftingDefinitionRepository({
    keyPrefix: COMPONENT_RECORD_KEY_PREFIX,
    // `undefined` selects the adapter's own production accessors, so a caller that injects
    // neither gets exactly the store a live world would build.
    documentClass,
    collection,
    identify: (record) => componentRecordKey(record?.systemId, record?.component?.id),
    hydrate,
    serialize: (record) => record?.component,
    scopeOf: (record) => record?.systemId ?? null,
    assertWritable,
    operationOptions,
  });
}
