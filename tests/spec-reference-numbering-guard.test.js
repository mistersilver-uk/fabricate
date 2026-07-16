import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards against recurrence of the retired NUMBERED spec-filename scheme
// (`00N-<domain>.md`, bare `` `00N` ``, and `# Specification NNN` H1 titles).
// The flattened layout is `openspec/specs/<domain>/spec.md`; the numbered forms
// are uniformly dead (issue #666) and any survivor silently misdirects readers.
//
// The shapes are deliberately narrow so they do NOT false-positive on the
// `file.js:NNN` citation placeholder documented in
// `openspec/specs/agentic-workflow/spec.md`, on version numbers (`1.16.0`),
// issue refs (`#318`), DC values, or the 50-entry cap.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const specsRoot = join(repoRoot, 'openspec', 'specs');

// The four `src/` JSDoc stragglers. Three of the four cite the numbered domain
// WITHOUT a `.md` suffix, so the src check uses the `.md`-optional shape.
const SRC_FILES = [
  'src/models/Tool.js',
  'src/migration/migrateLegacyResolutionModes.js',
  'src/migration/migrateSplitRoutedResolutionModes.js',
  'src/migration/migrateRecipeForModeChange.js',
].map((relPath) => join(repoRoot, relPath));

// `00N-<domain>.md` (the retired filename form) — used over specs AND src.
const MD_FILENAME_SHAPE = /\d{3}-[a-z-]+\.md/;
// `00N-<domain>` with the `.md` OPTIONAL — used over the src set only, so the
// three `.md`-less stragglers cannot regress. NOT applied to specs, where a
// legitimate `\d{3}-word` string could otherwise trip it.
const SRC_NUMBERED_SHAPE = /\d{3}-[a-z-]+/;
// Bare backtick reference such as `` `002` `` / `` `007` `` — specs only.
const BARE_BACKTICK_SHAPE = /`00\d`/;
// Numbered H1 title such as `# Specification 002: Data Models` — specs only.
const NUMBERED_H1_SHAPE = /^# (?:Specification|Spec) \d/;

function collectSpecFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSpecFiles(full));
    } else if (entry.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}

// Return `<relPath>:<lineNo>  <line>` for every line matching `shape`.
function matchingLines(filePath, shape) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, index) => {
    if (shape.test(line)) {
      hits.push(`${relative(repoRoot, filePath)}:${index + 1}  ${line.trim()}`);
    }
  });
  return hits;
}

describe('numbered spec-reference recurrence guard', () => {
  it('the shape matchers catch every numbered form (red before the #666 sweep)', () => {
    // These are the exact shapes the sweep removed; the guard is only meaningful
    // if it still recognises them.
    assert.ok(MD_FILENAME_SHAPE.test('see `002-data-models.md` for the shape'));
    assert.ok(MD_FILENAME_SHAPE.test('defined in 004-resolution-modes.md'));
    assert.ok(SRC_NUMBERED_SHAPE.test('Per `007-destructive-changes-and-migrations §Foo`'));
    assert.ok(SRC_NUMBERED_SHAPE.test('per the `004-resolution-modes` normative 5×5'));
    assert.ok(BARE_BACKTICK_SHAPE.test('reuses structures from `004`'));
    assert.ok(BARE_BACKTICK_SHAPE.test('see `007`'));
    assert.ok(NUMBERED_H1_SHAPE.test('# Specification 002: Data Models'));
    assert.ok(NUMBERED_H1_SHAPE.test('# Spec 008 — Module Integrations'));
  });

  it('the shapes ignore the file.js:NNN placeholder and other legitimate numerics', () => {
    const placeholder =
      'it rejects line-number-based code citations (such as `file.js:NNN` or approximate line references)';
    for (const shape of [
      MD_FILENAME_SHAPE,
      SRC_NUMBERED_SHAPE,
      BARE_BACKTICK_SHAPE,
      NUMBERED_H1_SHAPE,
    ]) {
      assert.equal(
        shape.test(placeholder),
        false,
        `${shape} must not match the file.js:NNN placeholder`
      );
    }
    // Version numbers, issue refs, DC values, and the entry cap must all pass.
    for (const benign of [
      'module version 1.16.0',
      'closes #318',
      'a DC 15 check',
      'the 50-entry cap',
    ]) {
      for (const shape of [
        MD_FILENAME_SHAPE,
        SRC_NUMBERED_SHAPE,
        BARE_BACKTICK_SHAPE,
        NUMBERED_H1_SHAPE,
      ]) {
        assert.equal(shape.test(benign), false, `${shape} must not match "${benign}"`);
      }
    }
  });

  it('the documented file.js:NNN placeholder line is present and green under every shape', () => {
    // Anchors the previous test against the real spec: if the placeholder text
    // ever moves, this fails loudly rather than silently passing on nothing.
    const agenticSpec = join(specsRoot, 'agentic-workflow', 'spec.md');
    const content = readFileSync(agenticSpec, 'utf8');
    assert.ok(
      content.includes('file.js:NNN'),
      'expected the file.js:NNN placeholder in agentic-workflow/spec.md'
    );
    const placeholderLines = content.split('\n').filter((line) => line.includes('file.js:NNN'));
    for (const line of placeholderLines) {
      for (const shape of [
        MD_FILENAME_SHAPE,
        SRC_NUMBERED_SHAPE,
        BARE_BACKTICK_SHAPE,
        NUMBERED_H1_SHAPE,
      ]) {
        assert.equal(
          shape.test(line),
          false,
          `${shape} unexpectedly matched the placeholder line: ${line.trim()}`
        );
      }
    }
  });

  it('openspec/specs/** carries no retired numbered-scheme reference', () => {
    const specFiles = collectSpecFiles(specsRoot);
    assert.ok(specFiles.length > 0, 'expected to find spec files under openspec/specs');
    const offences = [];
    for (const file of specFiles) {
      for (const shape of [MD_FILENAME_SHAPE, BARE_BACKTICK_SHAPE, NUMBERED_H1_SHAPE]) {
        offences.push(...matchingLines(file, shape));
      }
    }
    assert.deepEqual(
      offences,
      [],
      `numbered spec references survive under openspec/specs:\n${offences.join('\n')}`
    );
  });

  it('the four src/ JSDoc stragglers carry no numbered-domain reference', () => {
    const offences = [];
    for (const file of SRC_FILES) {
      // `.md`-optional shape catches the three `.md`-less citations too.
      offences.push(...matchingLines(file, SRC_NUMBERED_SHAPE));
    }
    assert.deepEqual(
      offences,
      [],
      `numbered domain references survive in src/:\n${offences.join('\n')}`
    );
  });
});
