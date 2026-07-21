/**
 * View Lab artifact model + validation (issue 823, Design H) — pure helpers.
 *
 * The artifact is `ui-screenshot-artifact/{manifest.json, <id>.png}`. The manifest
 * carries `{ schemaVersion, repository, prNumber, headSha, views[{id,label,file,sha256}] }`.
 * Two hardenings apply EVEN for local publish (they guard accidental mislabeling):
 *  (1) `file === \`${id}.png\`` binding — a known id can't be paired with a wrong file;
 *  (2) each view id is in the registry's allowed-id set.
 */

export const ARTIFACT_SCHEMA_VERSION = 1;

export function fileForId(id) {
  return `${id}.png`;
}

export function buildManifest({ repository = null, prNumber = null, headSha = null, views = [] } = {}) {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    repository,
    prNumber: prNumber === null || prNumber === undefined ? null : String(prNumber),
    headSha,
    views: views.map((view) => ({
      id: view.id,
      label: view.label,
      file: view.file,
      sha256: view.sha256,
    })),
  };
}

/**
 * Validate a manifest against the registry allow-set and the on-disk files.
 *
 * @param {object} manifest
 * @param {object} args
 * @param {Set<string>|string[]} args.allowedIds registry `caseIds()`
 * @param {(file: string) => boolean} [args.fileExists] optional on-disk existence check
 * @param {(file: string) => string} [args.sha256Of] optional recompute-and-compare
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateManifest(manifest, { allowedIds, fileExists, sha256Of } = {}) {
  const errors = [];
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest is not an object'] };
  }
  if (manifest.schemaVersion !== ARTIFACT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ARTIFACT_SCHEMA_VERSION}, got ${manifest.schemaVersion}`);
  }
  if (!Array.isArray(manifest.views)) {
    return { ok: false, errors: [...errors, 'manifest.views must be an array'] };
  }

  const seen = new Set();
  for (const view of manifest.views) {
    if (!view || typeof view.id !== 'string') {
      errors.push(`view entry missing string id: ${JSON.stringify(view)}`);
      continue;
    }
    if (seen.has(view.id)) errors.push(`duplicate view id in manifest: ${view.id}`);
    seen.add(view.id);
    if (!allowed.has(view.id)) errors.push(`view id '${view.id}' is not a registered case`);
    // (1) file === `${id}.png` binding.
    if (view.file !== fileForId(view.id)) {
      errors.push(`view '${view.id}' file must be '${fileForId(view.id)}', got '${view.file}'`);
    }
    if (typeof view.sha256 !== 'string' || view.sha256.length === 0) {
      errors.push(`view '${view.id}' missing sha256`);
    }
    if (fileExists && !fileExists(view.file)) {
      errors.push(`view '${view.id}' file '${view.file}' is not present in the artifact`);
    }
    if (sha256Of && typeof view.sha256 === 'string') {
      const actual = sha256Of(view.file);
      if (actual && actual !== view.sha256) {
        errors.push(`view '${view.id}' sha256 mismatch (manifest ${view.sha256} vs file ${actual})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
