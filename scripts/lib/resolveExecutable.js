/**
 * Resolve a command name to one absolute executable path, by walking `PATH` here rather than
 * leaving the lookup to the OS at spawn time.
 */
import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';

/** The suffixes that make a file executable on this platform. */
export function executableExtensions() {
  if (process.platform !== 'win32') return [''];
  return (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
}

/** True when `candidate` is a file this process could execute. */
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

/** The absolute path of `command`, or `null` when no absolute `PATH` directory holds it. */
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
