/**
 * `scripts/lib/foundryChromeSpec.js` restates each Fabricate window's `DEFAULT_OPTIONS` so the View
 * Lab can build the frame without importing the application classes — importing them evaluates
 * `foundry.applications.api.ApplicationV2` at module scope and registers the app as a side effect,
 * neither of which exists outside Foundry.
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
  // The literal is plain data in both classes today. If that ever stops being true the evaluation
  // throws here rather than producing a half-right object.
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
  // `.application` rule in foundry2.css hangs off it.
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
  // lab capture. If it and the constant disagree, the lab silently captures the CSS one (issue
  // 1520).
  const css = readFileSync(resolve(ROOT, 'styles/fabricate.css'), 'utf8');
  const floorRule = /\.fabricate\.fabricate-app-window\s*\{([^}]*)\}/.exec(css);
  assert.ok(
    floorRule,
    '.fabricate.fabricate-app-window rule not found in styles/fabricate.css. The player window' +
      " drag-resize floor lives on this class alone, so if it has moved, find out where to before" +
      ' retargeting this test — the shared `.fabricate.fabricate-app` class is the one place it' +
      ' must not be, because three narrower windows adopt that class.'
  );
  assert.match(floorRule[1], new RegExp(`min-width:\\s*${APP_CHROME['fabricate-app'].minWidth}px`));
  assert.match(
    floorRule[1],
    new RegExp(`min-height:\\s*${APP_CHROME['fabricate-app'].minHeight}px`)
  );

  const areaRules = [...css.matchAll(/\.fabricate\.fabricate-app\s*\{([^}]*)\}/g)];
  assert.ok(areaRules.length > 0, '.fabricate.fabricate-app rule not found in styles/fabricate.css');
  for (const property of ['min-width', 'min-height']) {
    assert.ok(
      areaRules.every((areaRule) => !areaRule[1].includes(property)),
      `\`.fabricate.fabricate-app\` declares \`${property}\`, and it must not. That class is the` +
        ' shared PLAY-surface area skin — typography, colour, `color-scheme` — and the interactable' +
        ' browser, the interactable config sheet and the interactables manager all emit it at 420,' +
        ' 480 and 560 wide. A size floor here reaches their frames too and beats the inline `width`' +
        ' Foundry writes, so all three render at the player window size and nothing else in this' +
        " file notices. Put the floor on `.fabricate.fabricate-app-window`, which only the player" +
        ' window emits. This clause reads the rule BODY, which includes comment text, so a comment' +
        ' naming the property here trips it too — say it in prose without the declaration.'
    );
  }
});
