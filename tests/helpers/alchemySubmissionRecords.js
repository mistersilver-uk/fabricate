/**
 * Test helper: build the `{ item, componentId }` submission records that the
 * alchemy engine seams (`craftAlchemy` / `_matchAlchemySignature` /
 * `_submittedComponentMultiset`) consume after issue 572. Bucketing happens exactly
 * once — at the collector — so the engine no longer resolves identity itself; these
 * unit/integration tests build the records through the SAME production resolver
 * (`resolveAlchemySubmissionComponent`) the collector and palette use, so they still
 * exercise resolution + matching together rather than hand-supplying a bucket id.
 *
 * Hoisted so the record-shaping literal lives in ONE place across the alchemy suites
 * (SonarCloud counts `tests/**` duplication).
 */
import { resolveAlchemySubmissionComponent } from '../../src/utils/alchemySubmissions.js';

/**
 * @param {object[]} items - Bare owned-item-like submissions.
 * @param {object[]} components - The system's component set.
 * @param {string|null|undefined} systemId - The system id (durable-flag scope).
 * @returns {Array<{item: object, componentId: string|null}>}
 */
export function toAlchemyRecords(items, components, systemId) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    item,
    componentId: resolveAlchemySubmissionComponent(item, components, systemId)?.id ?? null,
  }));
}
