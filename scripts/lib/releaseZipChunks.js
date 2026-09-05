/**
 * ARCHIVE COMPLETENESS: does a published archive carry every file its own entry script asks for?
 * (issue 1565)
 *
 * The reported defect ran the other way — a client held a cached entry script and asked the
 * server for a hashed chunk the newly installed package no longer had. Nothing in the release
 * path proved the reverse, which is the case Fabricate itself owns: `validateDist` checks only
 * the files the manifest lists, and `verifyManagerChunkSplit` reads `dist/`, not the archive. So
 * a packaging regression that dropped `chunks/` would have shipped with every gate green, and
 * from the user's side it would have been indistinguishable from that report.
 *
 * PROVED AGAINST THE ARCHIVE, NEVER AGAINST `dist/`. The archive is what a client installs, and
 * the two can differ: the zip step has its own exclude globs, and the two producers this
 * repository uses (`scripts/release.js`'s inline `zip`/`tar`, and `scripts/lib/zip.js` for the
 * S3 cohort zips) are separate code paths. Reading `dist/` would prove neither of them.
 *
 * MEMBER NAMES ARE THE HARD PART. Three producers make these archives and disagree:
 *   - `zip -r` (Linux, CI) writes bare POSIX names — `chunks/main-abc.js`;
 *   - bsdtar `tar -a` (Windows) writes `./`-prefixed names;
 *   - `Compress-Archive` has historically written backslash separators.
 * `zipRead.readEntry` matches a name EXACTLY, so every name is folded onto one shape before
 * anything is compared, and the directory members a real producer also records are dropped.
 *
 * IT MUST NOT BE ABLE TO PASS VACUOUSLY, which is the failure mode a gate like this dies of. A
 * proof that cannot tell a complete archive from an unread one reports success forever, so this
 * one refuses three shapes of silence: a manifest with no `esmodules`, an entry member it cannot
 * locate in the archive, and an entry it read that references nothing at all.
 */
import { posix } from 'node:path';

import { listEntries, readEntries } from './zipRead.js';

/**
 * The gate's own name, carried by every message it produces.
 *
 * Exported because the negative proofs assert THIS rather than a non-zero exit: both call sites
 * sit next to other refusals that also exit 1 (`validateDist` in `release.js`, the publish guard
 * in `release-s3.js`), and a test that only checks "it failed" cannot tell them apart.
 */
export const ARCHIVE_CHUNK_GATE_LABEL = 'release archive gate';

/**
 * What a build that produced no archive prints instead of running.
 *
 * `npm run build` is `--no-zip`, so it has nothing to check, and it must still exit 0. The
 * wording says the proof DID NOT RUN rather than that it passed — an "OK" here would be the
 * vacuous pass this module exists to avoid, just moved up a level. Exported so the build's own
 * wiring test asserts the literal the script actually prints.
 */
export const ARCHIVE_GATE_SKIPPED_MESSAGE =
  `${ARCHIVE_CHUNK_GATE_LABEL}: skipped — this build produced no archive, so archive completeness` +
  ' was not proved.';

/**
 * A quoted RELATIVE specifier ending in `.js`, which is the only shape a bundled module uses to
 * name a sibling file.
 *
 * MEASURED against a real minified `dist/main.js` rather than assumed: Rolldown emits
 * `from "./chunks/name-hash.js"` for a static chunk and `import("./chunks/name-hash.js")` for a
 * deferred one, and the three references in the shipped bundle are exactly the three quoted
 * relative `.js` strings in it — no more and no fewer. Matching the STRING rather than the
 * `from`/`import(` syntax around it keeps the extractor independent of how the minifier chose to
 * format the call, which is the part most likely to change under us.
 *
 * The `.js` suffix is load-bearing in the other direction too. The same bundle carries the
 * literal `"../library/LibraryCard.svelte"` as data, and a host never fetches that; accepting
 * every relative string would make the gate demand a member that was never meant to ship.
 */
const RELATIVE_MODULE_SPECIFIER = /(["'`])(\.{1,2}\/[^"'`\n]*?\.js)\1/g;

/**
 * The published archive's name, derived in one place.
 *
 * `release.js` needs it twice — once to create the archive and once to find it again in the
 * `--validate-only` branch, which builds nothing — and a second copy of the literal is exactly
 * how the validate path ends up looking for a file the build path never wrote.
 *
 * @param {string} version The bare version, no leading `v` (e.g. `1.9.5`).
 * @returns {string} The archive file name.
 */
export function releaseZipName(version) {
  return `fabricate-v${version}.zip`;
}

/**
 * Fold one producer's member name onto the single shape everything else compares against.
 *
 * @param {unknown} name A member name as the archive recorded it.
 * @returns {string|null} The normalised name, or `null` when this is not a file member.
 */
export function normalizeArchiveMemberName(name) {
  if (typeof name !== 'string' || name === '') return null;
  let normalized = name.replaceAll('\\', '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  // A directory member is recorded like any other entry but carries no data, so it can neither be
  // an entry script nor satisfy a reference. The real producer emits `chunks/`.
  if (normalized === '' || normalized.endsWith('/')) return null;
  return normalized;
}

/**
 * Every module member `source` references, as archive-relative normalised names.
 *
 * @param {string} memberName Normalised name of the member the source came from.
 * @param {string} source The member's text.
 * @returns {string[]} Distinct referenced member names, resolved against `memberName`'s directory.
 */
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

/**
 * Walk the reference graph from the entry scripts and report what the member set does not hold.
 *
 * PURE, and separated from the archive for two reasons: it is the part with the interesting
 * behaviour (transitive reachability, cycles, attribution of a miss to its referrer), and the
 * archive-level refusals need to be assertable without a zip.
 *
 * TRANSITIVE, not just the entry's direct references. Measured on a real `dist/`: the entry
 * references three chunks, and one FURTHER chunk is reachable only through
 * `chunks/stepperLabels-<hash>.js`. A gate that checked the entry's direct references alone would
 * have declared an archive missing that fourth chunk complete, which is the same silent hole in a
 * different place. Following references reaches every file the host can be made to fetch.
 *
 * It deliberately does NOT decide that "referenced nothing" is a failure. Given an entry that
 * genuinely references nothing, the honest answer is that nothing is missing; refusing an unread
 * archive is a property of reading a real archive and belongs to
 * {@link assertArchiveChunkCompleteness}.
 *
 * @param {{entryNames: string[], memberNames: Iterable<string>,
 *   readMember: (name: string) => string|undefined}} options The entry scripts, every normalised
 *   member name the archive holds, and a reader for a member's text (`undefined` when it has none).
 * @returns {{entriesAbsent: string[], missing: Array<{name: string, referencedBy: string}>,
 *   referenced: string[]}} What was absent, what was referenced but missing, and everything
 *   reached.
 */
export function findMissingChunkReferences({ entryNames, memberNames, readMember }) {
  const present = new Set(memberNames);
  const entriesAbsent = entryNames.filter((name) => !present.has(name));

  const referenced = new Set();
  const missing = [];
  const visited = new Set();
  const queue = entryNames.filter((name) => present.has(name));
  for (const name of queue) visited.add(name);

  while (queue.length > 0) {
    const current = queue.shift();
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

/**
 * The entry scripts a built manifest declares, or `[]` when it declares none.
 *
 * @param {unknown} esmodules The manifest's `esmodules` field, from an untrusted build output.
 * @returns {string[]} Normalised entry member names.
 */
function resolveEntryNames(esmodules) {
  if (!Array.isArray(esmodules)) return [];
  return esmodules.map((entry) => normalizeArchiveMemberName(entry)).filter(Boolean);
}

/**
 * Refuse an archive that does not carry every module file its own entry script references.
 *
 * @param {{zipPath: string, manifest: object,
 *   listArchiveEntries?: (zipPath: string) => Array<{name: string}>,
 *   readArchiveEntries?: (zipPath: string, predicate: (name: string) => boolean)
 *     => Map<string, Buffer>}} options The archive, the manifest that shipped inside it, and the
 *   two zip readers (injectable so a caller can read an archive some other way).
 * @returns {{entryNames: string[], referenced: string[], memberCount: number}} What was proved,
 *   so a caller can log something more informative than "OK".
 * @throws {Error} When the manifest names no entry script, when an entry member is absent from
 *   the archive, when an entry references nothing at all, or when a referenced member is missing.
 */
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

  const texts = new Map();
  for (const [name, bytes] of readArchiveEntries(zipPath, (name) => {
    const normalized = normalizeArchiveMemberName(name);
    return normalized !== null && normalized.endsWith('.js');
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
