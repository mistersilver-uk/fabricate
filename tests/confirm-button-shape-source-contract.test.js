/**
 * Source contract: no confirm in `src/**` configures its buttons with a BARE FUNCTION.
 * `normalizeConfirmOptions` now rescues the callback, but nothing can invent the label, so the
 * object form stays the contract.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// `yes`/`no` as an object key, holding a function expression rather than an object.
const BARE_FUNCTION_BUTTON = /(?:^|[{,\s])(yes|no)\s*:\s*(?:async\s+)?(?:\(|function\b)/;

function isCommentLine(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function sourceLines(root) {
  return readdirSync(root, { recursive: true })
    .map((relative) => join(root, relative))
    .filter((path) => path.endsWith('.js') || path.endsWith('.svelte'))
    .flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((text, index) => ({ path, line: index + 1, text }))
    );
}

test('no confirm button in src is configured as a bare function', () => {
  const lines = sourceLines(SRC);

  // Non-vacuity: the scan must actually be looking at the confirm call sites.
  const confirmCallSites = lines.filter(
    ({ text }) => !isCommentLine(text) && /confirmDialog(?:\?\.)?\(\{/.test(text)
  ).length;
  assert.ok(
    confirmCallSites >= 20,
    `expected the app's confirm call sites to still be here, found ${confirmCallSites}`
  );

  const offenders = lines
    .filter(({ text }) => !isCommentLine(text) && BARE_FUNCTION_BUTTON.test(text))
    .map(({ path, line, text }) => `${path}:${line}: ${text.trim()}`);

  assert.deepEqual(
    offenders,
    [],
    `confirm buttons must be objects carrying a localized label:\n${offenders.join('\n')}`
  );
});
