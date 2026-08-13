/**
 * Resolve a command name to ONE absolute executable path, by walking `PATH` here rather than
 * leaving the lookup to the OS at spawn time.
 *
 * Passing a bare `'git'` to `execFileSync` delegates resolution to `PATH` as it stands when the
 * child is spawned, which is SonarCloud's `javascript:S4036` ("make sure the PATH variable only
 * contains fixed, unwriteable directories"): whatever `git` that search lands on runs with this
 * process's privileges, and a writable or RELATIVE `PATH` entry earlier in the list wins. Doing
 * the walk here fixes the executable for the whole run and lets it be checked first — relative
 * entries (`.`, `bin`, the classic hijack vector) are skipped outright, which the OS search would
 * happily honour.
 *
 * Extracted from `scripts/compare-svelte-render.mjs`, where this logic was written first and
 * where its reasoning is unchanged. It is shared rather than copied because it is a
 * security-sensitive helper — two copies could drift, and only one of them would get the fix —
 * and because the SonarCloud duplication gate counts `scripts/` exactly like `src/`.
 */
import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The suffixes that make a file executable on this platform.
 *
 * On Windows an executable is `<name><PATHEXT entry>`, and the list is ordered — `.EXE` before
 * `.CMD` — so a directory holding both resolves the way the OS itself would. Elsewhere the bare
 * name is the whole story.
 *
 * @returns {string[]}
 */
export function executableExtensions() {
  if (process.platform !== 'win32') return [''];
  return (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
}

/**
 * True when `candidate` is a file this process could execute.
 *
 * @param {string} candidate
 * @returns {boolean}
 */
export function isExecutableFile(candidate) {
  if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) return false;
  // Windows has no execute bit — `accessSync(X_OK)` there answers for readability instead, so the
  // PATHEXT match above is the real test.
  if (process.platform === 'win32') return true;
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The absolute path of `command`, or `null` when no absolute `PATH` directory holds it.
 *
 * Returns null rather than throwing: callers differ on whether a missing executable is fatal.
 * `compare-svelte-render` cannot compare anything without git and turns null into a fatal error
 * naming git's absence; the benchmark envelope simply records null git metadata and carries on,
 * because a run record without a commit SHA is still a valid set of timings.
 *
 * @param {string} command
 * @returns {string|null}
 */
export function resolveExecutable(command) {
  const extensions = executableExtensions();
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    const directory = entry.replaceAll(/^"|"$/g, '');
    if (!directory || !path.isAbsolute(directory)) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, command + extension);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}
