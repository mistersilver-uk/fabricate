/**
 * Archive completeness: does a published archive carry every file its own entry script asks for?
 * (issue 1565)
 */
import { posix } from 'node:path';

import { listEntries, readEntries } from './zipRead.js';

/** The gate's own name, carried by every message it produces. */
export const ARCHIVE_CHUNK_GATE_LABEL = 'release archive gate';

/** What a build that produced no archive prints instead of running. */
export const ARCHIVE_GATE_SKIPPED_MESSAGE =
  `${ARCHIVE_CHUNK_GATE_LABEL}: skipped — this build produced no archive, so archive completeness` +
  ' was not proved.';

/** What a run refuses with when the archive name it derived is absent but `dist/` holds another. */
export function archiveNameMismatchMessage(expectedName, foundNames) {
  return (
    `${ARCHIVE_CHUNK_GATE_LABEL}: ${expectedName} is absent, but dist/ holds` +
    ` ${foundNames.join(', ')}. Refusing to report this as a build that produced no archive:` +
    ' that would skip the completeness proof over an archive that is present. Re-run with the' +
    ' same --version or --dist-version the build used, so the name matches.'
  );
}

/** Does this file name look like a published Fabricate archive? */
export function isReleaseZipName(name) {
  return /^fabricate-v.+\.zip$/.test(name);
}

/**
 * A quoted relative specifier ending in `.js`, which is the only shape a bundled module uses to
 * name a sibling file.
 */
const RELATIVE_MODULE_SPECIFIER = /(["'`])(\.{1,2}\/[^"'`\n]*?\.js)\1/g;

/** The published archive's name, derived in one place. */
export function releaseZipName(version) {
  return `fabricate-v${version}.zip`;
}

/** Fold one producer's member name onto the single shape everything else compares against. */
export function normalizeArchiveMemberName(name) {
  if (typeof name !== 'string' || name === '') return null;
  let normalized = name.replaceAll('\\', '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  // A directory member is recorded like any other entry but carries no data, so it can neither be
  // an entry script nor satisfy a reference. The real producer emits `chunks/`.
  if (normalized === '' || normalized.endsWith('/')) return null;
  return normalized;
}

/** Every module member `source` references, as archive-relative normalised names. */
export function extractModuleReferences(memberName, source) {
  if (typeof source !== 'string' || source === '') return [];
  // A chunk's own sibling import is relative to the CHUNK, not to the archive root: the manager
  // chunk imports `./stepperLabels-<hash>.js`, which is `chunks/stepperLabels-<hash>.js`.
  const base = posix.dirname(memberName);
  const referenced = new Set();
  for (const match of source.matchAll(RELATIVE_MODULE_SPECIFIER)) {
    const resolved = normalizeArchiveMemberName(posix.normalize(posix.join(base, match[2])));
    if (resolved) referenced.add(resolved);
  }
  return [...referenced];
}

/** Walk the reference graph from the entry scripts and report what the member set does not hold. */
export function findMissingChunkReferences({ entryNames, memberNames, readMember }) {
  const present = new Set(memberNames);
  const entriesAbsent = entryNames.filter((name) => !present.has(name));

  const referenced = new Set();
  const missing = [];
  const visited = new Set();
  const queue = [];
  for (const name of entryNames) {
    if (!present.has(name) || visited.has(name)) continue;
    visited.add(name);
    queue.push(name);
  }

  // A hard bound on the walk, and it is deliberately unreachable while the `visited` check below
  // holds: every member is dequeued at most once, so the count cannot exceed the member set.
  let dequeued = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    dequeued += 1;
    if (dequeued > present.size) {
      throw new Error(
        `${ARCHIVE_CHUNK_GATE_LABEL}: the reference walk visited more members than the archive` +
          ` holds (${dequeued} of ${present.size}), so it is not terminating. This is a bug in` +
          ' the gate itself, not a fault in the archive.'
      );
    }
    for (const reference of extractModuleReferences(current, readMember(current))) {
      referenced.add(reference);
      if (!present.has(reference)) {
        // Attributed to its referrer: "chunks/x.js is missing" is far less useful to whoever has
        // to fix a broken build than knowing which file asks for it.
        missing.push({ name: reference, referencedBy: current });
        continue;
      }
      // `visited` is what makes a reference cycle terminate; chunks do import each other.
      if (visited.has(reference)) continue;
      visited.add(reference);
      queue.push(reference);
    }
  }

  return { entriesAbsent, missing, referenced: [...referenced] };
}

/** The entry scripts a built manifest declares, or `[]` when it declares none. */
function resolveEntryNames(esmodules) {
  if (!Array.isArray(esmodules)) return [];
  return esmodules.map((entry) => normalizeArchiveMemberName(entry)).filter(Boolean);
}

/** Refuse an archive that does not carry every module file its own entry script references. */
export function assertArchiveChunkCompleteness({
  zipPath,
  manifest,
  listArchiveEntries = listEntries,
  readArchiveEntries = readEntries,
}) {
  const entryNames = resolveEntryNames(manifest?.esmodules);
  if (entryNames.length === 0) {
    // The release-s3 harnesses stub build manifests with no `esmodules` at all, so this is the
    // arm that decides whether the gate is a proof or a decoration.
    throw new Error(
      `${ARCHIVE_CHUNK_GATE_LABEL}: ${zipPath} cannot be proved complete — its module.json` +
        ' declares no esmodules entry script, so nothing names the file whose references matter.'
    );
  }

  // One pass over the central directory: `readEntry` per member would re-parse it every time.
  const originalNames = new Map();
  for (const entry of listArchiveEntries(zipPath)) {
    const normalized = normalizeArchiveMemberName(entry.name);
    if (normalized && !originalNames.has(normalized)) originalNames.set(normalized, entry.name);
  }

  const absent = entryNames.filter((name) => !originalNames.has(name));
  if (absent.length > 0) {
    throw new Error(
      `${ARCHIVE_CHUNK_GATE_LABEL}: entry script ${absent.join(', ')} is absent from ${zipPath}` +
        ` — the archive holds ${originalNames.size} file member(s), none of them that entry.`
    );
  }

  // Reads the entry scripts by name, not only members ending `.js`.
  const wanted = new Set(entryNames);
  const texts = new Map();
  for (const [name, bytes] of readArchiveEntries(zipPath, (member) => {
    const normalized = normalizeArchiveMemberName(member);
    return normalized !== null && (normalized.endsWith('.js') || wanted.has(normalized));
  })) {
    texts.set(normalizeArchiveMemberName(name), bytes.toString('utf8'));
  }

  const { missing, referenced } = findMissingChunkReferences({
    entryNames,
    memberNames: originalNames.keys(),
    readMember: (name) => texts.get(name),
  });

  if (referenced.length === 0) {
    throw new Error(
      `${ARCHIVE_CHUNK_GATE_LABEL}: ${zipPath} was read but its entry script` +
        ` ${entryNames.join(', ')} references no module files at all, so this proof cannot tell a` +
        ' complete archive from one it failed to read.'
    );
  }

  if (missing.length > 0) {
    const named = missing
      .map((entry) => `${entry.name} (referenced by ${entry.referencedBy})`)
      .join('; ');
    throw new Error(
      `${ARCHIVE_CHUNK_GATE_LABEL}: ${zipPath} is missing ${missing.length} module file(s) its` +
        ` own entry script references: ${named}. A client that installs this archive would 404 on` +
        ' them.'
    );
  }

  return { entryNames, referenced, memberCount: originalNames.size };
}
