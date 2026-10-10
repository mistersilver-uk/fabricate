/**
 * Preloaded by `npm test` with `--import` (issue 1711): opening the module sheet or a partial from
 * anywhere but the loader, the fixture server's raw mount or the View Lab's static mount throws.
 * With `FABRICATE_STYLESHEET_GUARD_LOG=<file>` each such read is appended there as a JSON line and
 * allowed. A bare `node --test <file>` is unguarded.
 */
import fs, { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const STYLES_DIR = path.join(REPO_ROOT, 'styles');
const GUARDED_NAME = /^fabricate(?:-[a-z0-9-]+)?\.css$/u;
const ALLOWED_CALLERS = [
  'scripts/lib/stylesheetSource.js',
  'tests/helpers/vite-fixture-server.js',
  'tests/view-lab/vite.config.js',
].flatMap((file) => {
  const absolute = path.join(REPO_ROOT, file);
  return [absolute, pathToFileURL(absolute).href];
});
const OWN_FRAMES = /node:internal|node_modules|stylesheetReadGuard\.js/u;

function targetOf(argument) {
  if (typeof argument === 'number') return null;
  const raw = argument instanceof URL ? fileURLToPath(argument) : String(argument ?? '');
  return path.resolve(raw);
}

function isGuarded(target) {
  return path.dirname(target) === STYLES_DIR && GUARDED_NAME.test(path.basename(target));
}

function callerStack() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  const { stack } = new Error('stack');
  Error.stackTraceLimit = limit;
  return stack;
}

function check(argument) {
  const target = targetOf(argument);
  if (!target || !isGuarded(target)) return;
  const stack = callerStack();
  if (ALLOWED_CALLERS.some((caller) => stack.includes(caller))) return;
  const frames = stack.split('\n').slice(1);
  const caller = frames.find((frame) => !OWN_FRAMES.test(frame))?.trim() ?? 'unknown';
  const log = process.env.FABRICATE_STYLESHEET_GUARD_LOG;
  if (log) {
    const file = path.relative(REPO_ROOT, target);
    appendFileSync(log, `${JSON.stringify({ file, caller, entry: process.argv[1] })}\n`);
    return;
  }
  throw new Error(
    `${path.relative(REPO_ROOT, target)} was opened ${caller}, outside the stylesheet loader: ` +
      'read the module sheet with readStylesheet() from scripts/lib/stylesheetSource.js'
  );
}

function guard(owner, name) {
  const original = owner[name];
  owner[name] = function guarded(...args) {
    check(args[0]);
    return original.apply(this, args);
  };
}

function install() {
  for (const name of ['readFileSync', 'readFile', 'createReadStream', 'openSync']) guard(fs, name);
  guard(fs.promises, 'readFile');
  syncBuiltinESMExports();
}

// ratchet-exempt(lint): a preload exists to patch `fs` when it is imported
install();
