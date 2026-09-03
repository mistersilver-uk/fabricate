/**
 * `scripts/lib/foundryChromeSpec.js` restates each Fabricate window's `DEFAULT_OPTIONS` so the
 * View Lab can build the frame without importing the application classes — importing them
 * evaluates `foundry.applications.api.ApplicationV2` at module scope and registers the app as a
 * side effect, neither of which exists outside Foundry.
 *
 * A restatement drifts. The failure is quiet and expensive: resize the manager in `src/` and the
 * lab keeps capturing it at the old size, so every published frame is a window nobody has. This
 * test parses the real classes and pins the two copies together.
 *
 * It never skips — it reads `src/`, which is always present.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { APP_CHROME, frameClassesFor } from '../scripts/lib/foundryChromeSpec.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extract a brace-balanced object literal that follows a marker, and evaluate it in isolation.
 *
 * Text extraction rather than an import is the whole point (see the file header). Brace balancing
 * rather than a regex because `DEFAULT_OPTIONS` nests `window` and `position` objects; a
 * non-greedy regex stops at the first `}` and a greedy one runs to the end of the class.
 *
 * @param {string} source File text.
 * @param {string} marker Text immediately preceding the `{`.
 * @param {string} where Human label for assertion messages.
 * @returns {object} The evaluated literal.
 */
function parseObjectLiteralAfter(source, marker, where) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `could not find "${marker}" in ${where}`);
  const start = source.indexOf('{', markerIndex);
  assert.notEqual(start, -1, `no object literal after "${marker}" in ${where}`);

  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.notEqual(end, -1, `unbalanced object literal after "${marker}" in ${where}`);
  const literal = source.slice(start, end + 1);
  // The literal is plain data in both classes today. If that ever stops being true the
  // evaluation throws here rather than producing a half-right object.
  // eslint-disable-next-line no-new-func -- evaluating a data-only literal lifted from our own source is the point; the alternative is an AST dependency for two objects
  return new Function(`return (${literal});`)();
}

function readAppOptions(appId) {
  const app = APP_CHROME[appId];
  const source = readFileSync(resolve(ROOT, app.optionsSource), 'utf8');
  return parseObjectLiteralAfter(source, 'static DEFAULT_OPTIONS =', app.optionsSource);
}

for (const appId of Object.keys(APP_CHROME)) {
  test(`${appId}: the chrome spec matches the real DEFAULT_OPTIONS`, () => {
    const actual = readAppOptions(appId);
    const expected = APP_CHROME[appId];

    assert.equal(actual.id, expected.id, 'window id');
    assert.equal(actual.tag, expected.tag, 'frame tag');
    assert.deepEqual(actual.classes, [...expected.classes], 'DEFAULT_OPTIONS.classes');
    assert.equal(actual.window.title, expected.window.title, 'title lang key');
    assert.equal(actual.window.icon, expected.window.icon, 'window icon');
    assert.equal(Boolean(actual.window.resizable), expected.window.resizable, 'resizable');
    assert.deepEqual(
      actual.position,
      { width: expected.position.width, height: expected.position.height },
      `${appId} window size changed in src/ but not in the View Lab chrome spec — every captured ` +
        'frame would still be the old size'
    );
  });
}

test('the frame class list is what ApplicationV2 would build', () => {
  // `_initializeApplicationOptions` unshifts "application" for framed windows, and every
  // `.application` rule in foundry2.css hangs off it. Omitting it renders a window with no chrome
  // at all, which is exactly how the first version of this frame builder was wrong.
  for (const [appId, app] of Object.entries(APP_CHROME)) {
    const classes = frameClassesFor(app);
    assert.equal(classes[0], 'application', `${appId} frame must lead with the "application" class`);
    assert.deepEqual(classes, ['application', ...app.classes], `${appId} frame classes`);
    assert.equal(new Set(classes).size, classes.length, `${appId} frame classes must be deduped`);
  }
});

test('the player window minimum size matches the constants and the CSS floor', () => {
  const source = readFileSync(resolve(ROOT, APP_CHROME['fabricate-app'].optionsSource), 'utf8');
  const minWidth = /static MIN_WINDOW_WIDTH = (\d+)/.exec(source);
  const minHeight = /static MIN_WINDOW_HEIGHT = (\d+)/.exec(source);
  assert.ok(minWidth && minHeight, 'MIN_WINDOW_WIDTH/HEIGHT not found in SvelteFabricateApp');
  assert.equal(Number(minWidth[1]), APP_CHROME['fabricate-app'].minWidth);
  assert.equal(Number(minHeight[1]), APP_CHROME['fabricate-app'].minHeight);

  // `_updatePosition` clamps to the COMPUTED box, so the CSS floor is what actually binds during a
  // lab capture. If it and the constant disagree, the lab silently captures the CSS one.
  const css = readFileSync(resolve(ROOT, 'styles/fabricate.css'), 'utf8');
  const rule = /\.fabricate\.fabricate-app\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.fabricate.fabricate-app rule not found in styles/fabricate.css');
  assert.match(rule[1], new RegExp(`min-width:\\s*${APP_CHROME['fabricate-app'].minWidth}px`));
  assert.match(rule[1], new RegExp(`min-height:\\s*${APP_CHROME['fabricate-app'].minHeight}px`));
});
